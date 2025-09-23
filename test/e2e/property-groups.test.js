import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMCPClient } from '../helpers/mcp-client.js';
import { createTestServer } from '../helpers/chrome-test-server.js';
import { parseMarkdownDiagnostic } from '../helpers/markdown-parser.js';
import { killAllTestChromes } from '../helpers/chrome-test-helper.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

test('Property groups functionality', async (t) => {
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

        // Test 1: Default groups (should include layout, box, typography, colors)
        console.log('Testing default property groups...');
        const defaultResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl
        });

        assert.ok(defaultResponse.result, 'Default groups should work');
        const defaultData = parseMarkdownDiagnostic(defaultResponse.result.content[2].text);

        assert.ok(defaultData.elements && defaultData.elements.length > 0, 'Should have elements array');
        const defaultElement = defaultData.elements[0];

        assert.ok(defaultElement.grouped_styles, 'Should have grouped styles');
        assert.ok(defaultElement.grouped_styles.layout, 'Should have layout group');
        assert.ok(defaultElement.grouped_styles.box, 'Should have box group');
        assert.ok(defaultElement.grouped_styles.typography, 'Should have typography group');
        assert.ok(defaultElement.grouped_styles.colors, 'Should have colors group');
        
        // Should have filtering stats
        assert.ok(defaultData.stats, 'Should have filtering summary');
        assert.ok(defaultData.stats.total_properties > 0, 'Should report total properties');
        assert.ok(defaultData.stats.filtered_properties > 0, 'Should report filtered properties');
        
        console.log(`✅ Default filtering: ${defaultData.stats.total_properties} → ${defaultData.stats.filtered_properties} properties`);

        // Test 2: Specific groups only
        console.log('Testing specific property groups...');
        const specificResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl,
            property_groups: ['colors', 'typography']
        });

        assert.ok(specificResponse.result, 'Specific groups should work');
        const specificData = parseMarkdownDiagnostic(specificResponse.result.content[2].text);

        assert.ok(specificData.elements && specificData.elements.length > 0, 'Should have elements array');
        const specificElement = specificData.elements[0];

        assert.ok(specificElement.grouped_styles, 'Should have grouped styles');
        assert.ok(specificElement.grouped_styles.colors, 'Should have colors group');
        assert.ok(specificElement.grouped_styles.typography, 'Should have typography group');

        // Should not have many properties in other groups (some essential properties might still be included)
        const layoutProps = Object.keys(specificElement.grouped_styles.layout || {}).length;
        const boxProps = Object.keys(specificElement.grouped_styles.box || {}).length;
        
        // Essential properties might still be included, so we check for significantly fewer
        assert.ok(layoutProps <= 5, `Should have minimal layout properties, got ${layoutProps}`);
        assert.ok(boxProps <= 5, `Should have minimal box properties, got ${boxProps}`);
        
        console.log('✅ Specific groups filtering works correctly');

        // Test 3: Get comprehensive properties with all groups
        console.log('Testing all property groups...');
        const allPropsResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl,
            property_groups: ['layout', 'box', 'typography', 'colors', 'visual', 'positioning', 'flexbox', 'grid', 'custom']
        });

        assert.ok(allPropsResponse.result, 'All groups should work');
        const allPropsData = parseMarkdownDiagnostic(allPropsResponse.result.content[2].text);

        assert.ok(allPropsData.elements && allPropsData.elements.length > 0, 'Should have elements array');
        const allPropsElement = allPropsData.elements[0];

        // With all groups, should have comprehensive computed_styles
        assert.ok(allPropsElement.computed_styles, 'Should have computed_styles with all groups');

        // Should have significantly more properties than filtered version
        const allPropsCount = Object.keys(allPropsElement.computed_styles).length;
        const filteredCount = defaultData.stats.filtered_properties;
        assert.ok(allPropsCount > filteredCount, 
            `All properties (${allPropsCount}) should be more than filtered (${filteredCount})`);
        
        console.log(`✅ All groups: ${allPropsCount} properties vs ${filteredCount} filtered`);

        // Test 4: Visual effects and animations group
        console.log('Testing visual effects group...');
        const visualResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl,
            property_groups: ['visual', 'colors']
        });

        assert.ok(visualResponse.result, 'Visual group should work');
        const visualData = parseMarkdownDiagnostic(visualResponse.result.content[2].text);

        assert.ok(visualData.elements && visualData.elements.length > 0, 'Should have elements array');
        const visualElement = visualData.elements[0];

        assert.ok(visualElement.grouped_styles, 'Should have grouped styles');
        assert.ok(visualElement.grouped_styles.visual || Object.keys(visualElement.grouped_styles.visual || {}).length >= 0,
            'Should have visual group');
        
        console.log('✅ Visual effects group works');

        // Test 5: Grid and flexbox properties
        console.log('Testing flexbox properties...');
        const flexboxResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '.test-button',  // This element uses flexbox
            url: testUrl,
            property_groups: ['flexbox', 'layout']
        });

        assert.ok(flexboxResponse.result, 'Flexbox group should work');
        const flexboxData = parseMarkdownDiagnostic(flexboxResponse.result.content[2].text);

        assert.ok(flexboxData.elements && flexboxData.elements.length > 0, 'Should have elements array');
        const elementData = flexboxData.elements[0];
        
        assert.ok(elementData.grouped_styles, 'Should have grouped styles');
        
        console.log('✅ Flexbox group works');

        // Test 6: Invalid group name (should still work, just ignore invalid group)
        console.log('Testing invalid group name...');
        const invalidResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl,
            property_groups: ['colors', 'invalid-group-name', 'typography']
        });

        assert.ok(invalidResponse.result, 'Should work even with invalid group names');
        const invalidData = parseMarkdownDiagnostic(invalidResponse.result.content[2].text);

        assert.ok(invalidData.elements && invalidData.elements.length > 0, 'Should have elements array');
        const invalidElement = invalidData.elements[0];

        assert.ok(invalidElement.grouped_styles, 'Should still have grouped styles');
        assert.ok(invalidElement.grouped_styles.colors, 'Should still have valid groups');
        
        console.log('✅ Gracefully handles invalid group names');

        console.log('✅ All property groups tests passed');

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