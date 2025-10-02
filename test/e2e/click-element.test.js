import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMCPClient } from '../helpers/mcp-client.js';
import { createTestServer } from '../helpers/chrome-test-server.js';
import { killAllTestChromes } from '../helpers/chrome-test-helper.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

test('Click element functionality', async (t) => {
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

        // Test 1: List tools and verify click_element is available
        const toolsResponse = await mcpClient.listTools();
        assert.ok(toolsResponse.result, 'Tools list should have a result');
        assert.ok(Array.isArray(toolsResponse.result.tools), 'Should return tools array');

        const clickTool = toolsResponse.result.tools.find(tool => tool.name === 'click_element');
        assert.ok(clickTool, 'click_element tool should be available');
        assert.strictEqual(clickTool.inputSchema.required.length, 2, 'Should require css_selector and url');

        // Test 2: Click first button without index
        const clickResponse1 = await mcpClient.callTool('click_element', {
            css_selector: '.test-button',
            url: testUrl
        });

        assert.ok(clickResponse1.result, 'Click should have a result');
        const result1 = clickResponse1.result;
        assert.ok(result1.content, 'Should have content array');
        assert.strictEqual(result1.content.length, 2, 'Should have 2 content items (text + image)');

        // Validate text content
        const textContent1 = result1.content[0];
        assert.strictEqual(textContent1.type, 'text', 'First item should be text');
        assert.ok(textContent1.text.includes('Clicked element: .test-button'), 'Should indicate clicked element');
        assert.ok(textContent1.text.includes('at ('), 'Should include coordinates');

        // Should include information about found elements since there are 2 .test-button elements
        assert.ok(textContent1.text.includes('Found 2 elements matching'), 'Should show multiple elements found');
        assert.ok(textContent1.text.includes('← clicked'), 'Should indicate which element was clicked');
        assert.ok(textContent1.text.includes('#primary-button'), 'Should show unique selectors');
        assert.ok(textContent1.text.includes('#secondary-button'), 'Should show unique selectors');

        // Validate screenshot
        const imageContent1 = result1.content[1];
        assert.strictEqual(imageContent1.type, 'image', 'Second item should be image');
        assert.ok(imageContent1.data, 'Should include screenshot data');
        assert.strictEqual(imageContent1.mimeType, 'image/png', 'Should be PNG image');

        // Test 3: Click button with explicit index [0]
        const clickResponse2 = await mcpClient.callTool('click_element', {
            css_selector: '.test-button[0]',
            url: testUrl
        });

        assert.ok(clickResponse2.result, 'Indexed click should have a result');
        const result2 = clickResponse2.result;
        assert.ok(result2.content, 'Should have content array');

        const textContent2 = result2.content[0];
        assert.ok(textContent2.text.includes('Clicked element: .test-button[0]'), 'Should show indexed selector');

        // Test 4: Click second button with index [1]
        const clickResponse3 = await mcpClient.callTool('click_element', {
            css_selector: '.test-button[1]',
            url: testUrl
        });

        assert.ok(clickResponse3.result, 'Second button click should have a result');
        const result3 = clickResponse3.result;
        assert.ok(result3.content, 'Should have content array');

        const textContent3 = result3.content[0];
        assert.ok(textContent3.text.includes('Clicked element: .test-button[1]'), 'Should show second button was clicked');

        // Test 5: Click element by ID
        const clickResponse4 = await mcpClient.callTool('click_element', {
            css_selector: '#primary-button',
            url: testUrl
        });

        assert.ok(clickResponse4.result, 'ID selector click should have a result');
        const result4 = clickResponse4.result;
        const textContent4 = result4.content[0];
        assert.ok(textContent4.text.includes('Clicked element: #primary-button'), 'Should click element by ID');
        // Single unique element should not show multiple elements info
        assert.ok(!textContent4.text.includes('Found'), 'Should not show multiple elements for unique ID');

        // Test 6: Error case - element not found
        const clickResponse5 = await mcpClient.callTool('click_element', {
            css_selector: '#nonexistent-element',
            url: testUrl
        });

        assert.ok(clickResponse5.result, 'Should have result even for error');
        assert.strictEqual(clickResponse5.result.isError, true, 'Should indicate error');
        assert.ok(clickResponse5.result.content[0].text.includes('Element not found: "#nonexistent-element"'), 'Should show element not found error');

        // Test 7: Error case - index out of bounds
        const clickResponse6 = await mcpClient.callTool('click_element', {
            css_selector: '.test-button[10]',
            url: testUrl
        });

        assert.ok(clickResponse6.result, 'Should have result for out of bounds index');
        assert.strictEqual(clickResponse6.result.isError, true, 'Should indicate error');
        assert.ok(clickResponse6.result.content[0].text.includes('Error: Element not found at index 10'), 'Should show index not found error');

        // Test 8: Error case - invalid CSS selector
        const clickResponse7 = await mcpClient.callTool('click_element', {
            css_selector: 'invalid[syntax',
            url: testUrl
        });

        assert.ok(clickResponse7.result, 'Should have result for invalid selector');
        assert.strictEqual(clickResponse7.result.isError, true, 'Should indicate error');
        assert.ok(clickResponse7.result.content[0].text.includes('Element not found: "invalid[syntax"'), 'Should show invalid selector error');

    } finally {
        // Cleanup
        if (mcpClient) {
            await mcpClient.stop();
        }
        if (testServer) {
            await testServer.stop();
        }
        await killAllTestChromes();
    }
});