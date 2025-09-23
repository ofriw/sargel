import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMCPClient } from '../helpers/mcp-client.js';
import { createTestServer } from '../helpers/chrome-test-server.js';
import { parseMarkdownDiagnostic } from '../helpers/markdown-parser.js';
import { killAllTestChromes } from '../helpers/chrome-test-helper.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

test('Basic element inspection', async (t) => {
    let testServer = null;
    let mcpClient = null;

    try {
        // Start test server
        testServer = await createTestServer();
        const testUrl = testServer.getUrl();
        console.log(`Test page available at: ${testUrl}`);


        // Start MCP server
        const serverPath = join(__dirname, '..', '..', 'dist', 'index.js');
        mcpClient = await createMCPClient(serverPath);

        // List available tools
        const toolsResponse = await mcpClient.listTools();
        assert.ok(toolsResponse.result, 'Tools list should have a result');
        assert.ok(Array.isArray(toolsResponse.result.tools), 'Should return tools array');
        
        const inspectTool = toolsResponse.result.tools.find(tool => tool.name === 'inspect_element');
        assert.ok(inspectTool, 'inspect_element tool should be available');

        // Test basic element inspection
        const inspectionResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl
        });

        assert.ok(inspectionResponse.result, 'Inspection should have a result');
        
        const result = inspectionResponse.result;
        assert.ok(result.content, 'Should have content array');
        assert.strictEqual(result.content.length, 3, 'Should have 3 content items');
        
        // Validate screenshot (second item in content array)
        const imageContent = result.content[1];
        assert.strictEqual(imageContent.type, 'image', 'Second item should be image');
        assert.ok(imageContent.data, 'Should include screenshot data');
        assert.strictEqual(imageContent.mimeType, 'image/png', 'Should be PNG image');

        // Parse the JSON data (third item in content array)
        const jsonContent = result.content[2];
        assert.strictEqual(jsonContent.type, 'text', 'Third item should be text');
        const diagnosticData = parseMarkdownDiagnostic(jsonContent.text);

        // Validate multi-element structure
        assert.ok(diagnosticData.elements && diagnosticData.elements.length > 0, 'Should have elements array');
        const element = diagnosticData.elements[0];

        // Validate computed styles (parsed from markdown)
        assert.ok(element.computed_styles, 'Should include computed styles');
        assert.strictEqual(element.computed_styles['background-color'], 'rgb(66, 133, 244)', 'Should have correct background color');
        assert.strictEqual(element.computed_styles['width'], '400px', 'Should have correct width');
        assert.strictEqual(element.computed_styles['height'], '60px', 'Should have correct height');

        // Validate box model
        assert.ok(element.box_model, 'Should include box model');
        assert.ok(element.box_model.content, 'Should have content box');
        // Only check for padding/border/margin if they exist (non-zero values)
        if (element.box_model.padding) {
            assert.ok(typeof element.box_model.padding.width === 'number', 'Padding should have width');
        }
        if (element.box_model.border) {
            assert.ok(typeof element.box_model.border.width === 'number', 'Border should have width');
        }
        if (element.box_model.margin) {
            assert.ok(typeof element.box_model.margin.width === 'number', 'Margin should have width');
        }

        // Validate cascade rules
        assert.ok(Array.isArray(element.cascade_rules), 'Should include cascade rules array');
        assert.ok(element.cascade_rules.length > 0, 'Should have at least one cascade rule');

        const headerRule = element.cascade_rules.find(rule =>
            rule.selector === '#test-header'
        );
        assert.ok(headerRule, 'Should include rule for #test-header selector');

        console.log('✅ Basic inspection test passed');

    } finally {
        // Cleanup
        if (mcpClient) {
            await mcpClient.stop();
        }
        if (testServer) {
            await testServer.stop();
        }
    }
});