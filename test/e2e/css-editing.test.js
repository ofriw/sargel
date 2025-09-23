import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMCPClient } from '../helpers/mcp-client.js';
import { createTestServer } from '../helpers/chrome-test-server.js';
import { parseMarkdownDiagnostic } from '../helpers/markdown-parser.js';
import { killAllTestChromes } from '../helpers/chrome-test-helper.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

test('CSS editing functionality', async (t) => {
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

        // Test 1: Basic CSS editing with single property
        console.log('Testing basic CSS editing...');
        const basicEditResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl,
            css_edits: {
                'background-color': 'red',
                'color': 'white'
            }
        });

        assert.ok(basicEditResponse.result, 'CSS edit should have a result');
        
        const basicResult = basicEditResponse.result;
        assert.ok(basicResult.content, 'Should have content array');
        
        // Parse the JSON data to check applied_edits - access via elements array
        const jsonContent = basicResult.content[2];
        const editData = parseMarkdownDiagnostic(jsonContent.text);

        assert.ok(editData.elements && editData.elements.length > 0, 'Should have elements array');
        const element = editData.elements[0];

        assert.ok(element.applied_edits, 'Should include applied_edits');
        assert.strictEqual(element.applied_edits['background-color'], 'red', 'Should confirm background-color edit');
        assert.strictEqual(element.applied_edits['color'], 'white', 'Should confirm color edit');

        // The grouped styles should reflect the changes (default uses property grouping)
        assert.ok(element.grouped_styles, 'Should have grouped styles');
        assert.ok(element.grouped_styles.colors, 'Should have colors group');
        
        console.log('✅ Basic CSS editing test passed');

        // Test 2: CSS editing with layout properties
        console.log('Testing layout property editing...');
        const layoutEditResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl,
            css_edits: {
                'width': '600px',
                'height': '100px',
                'padding': '20px'
            }
        });

        assert.ok(layoutEditResponse.result, 'Layout edit should have a result');
        
        const layoutResult = layoutEditResponse.result;
        const layoutJsonContent = layoutResult.content[2];
        const layoutData = parseMarkdownDiagnostic(layoutJsonContent.text);

        assert.ok(layoutData.elements && layoutData.elements.length > 0, 'Should have elements array');
        const layoutElement = layoutData.elements[0];

        assert.ok(layoutElement.applied_edits, 'Should include applied_edits for layout');
        assert.strictEqual(layoutElement.applied_edits['width'], '600px', 'Should confirm width edit');
        assert.strictEqual(layoutElement.applied_edits['height'], '100px', 'Should confirm height edit');
        assert.strictEqual(layoutElement.applied_edits['padding'], '20px', 'Should confirm padding edit');

        // Box model should reflect the changes
        assert.ok(layoutElement.box_model, 'Should have updated box model');
        
        console.log('✅ Layout property editing test passed');

        // Test 3: Inspection without edits (should not have applied_edits)
        console.log('Testing inspection without edits...');
        const noEditResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl
        });

        assert.ok(noEditResponse.result, 'No edit inspection should have a result');
        
        const noEditResult = noEditResponse.result;
        const noEditJsonContent = noEditResult.content[2];
        const noEditData = parseMarkdownDiagnostic(noEditJsonContent.text);

        assert.ok(noEditData.elements && noEditData.elements.length > 0, 'Should have elements array');
        const noEditElement = noEditData.elements[0];

        // Should not have applied_edits when no edits are provided
        assert.strictEqual(noEditElement.applied_edits, undefined, 'Should not have applied_edits when no edits provided');
        
        console.log('✅ No edits test passed');

        // Test 4: Empty CSS edits (should not have applied_edits)
        console.log('Testing empty CSS edits...');
        const emptyEditResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl,
            css_edits: {}
        });

        assert.ok(emptyEditResponse.result, 'Empty edit inspection should have a result');
        
        const emptyEditResult = emptyEditResponse.result;
        const emptyEditJsonContent = emptyEditResult.content[2];
        const emptyEditData = parseMarkdownDiagnostic(emptyEditJsonContent.text);

        assert.ok(emptyEditData.elements && emptyEditData.elements.length > 0, 'Should have elements array');
        const emptyEditElement = emptyEditData.elements[0];

        // Should not have applied_edits when empty edits object is provided
        assert.strictEqual(emptyEditElement.applied_edits, undefined, 'Should not have applied_edits when empty edits provided');
        
        console.log('✅ Empty edits test passed');

        console.log('✅ All CSS editing tests passed');

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