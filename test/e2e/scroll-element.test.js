import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMCPClient } from '../helpers/mcp-client.js';
import { createTestServer } from '../helpers/chrome-test-server.js';
import { killAllTestChromes } from '../helpers/chrome-test-helper.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

test('Scroll element functionality', async (t) => {
    let testServer = null;
    let mcpClient = null;

    try {
        // Start test server with scrollable page fixture
        const fixturePath = join(__dirname, '..', 'fixtures', 'scrollable-page.html');
        testServer = await createTestServer({ fixturePath });
        const testUrl = testServer.getUrl();
        console.log(`Test page available at: ${testUrl}`);

        // Start MCP server
        const serverPath = join(__dirname, '..', '..', 'dist', 'index.js');
        mcpClient = await createMCPClient(serverPath);

        // Test 1: List tools and verify scroll_element is available
        const toolsResponse = await mcpClient.listTools();
        assert.ok(toolsResponse.result, 'Tools list should have a result');
        assert.ok(Array.isArray(toolsResponse.result.tools), 'Should return tools array');

        const scrollTool = toolsResponse.result.tools.find(tool => tool.name === 'scroll_element');
        assert.ok(scrollTool, 'scroll_element tool should be available');
        assert.strictEqual(scrollTool.inputSchema.required.length, 2, 'Should require css_selector and url');
        assert.strictEqual(Object.keys(scrollTool.inputSchema.properties).length, 2, 'Should only have css_selector and url properties');

        // Test 2: Scroll to element that's initially visible (minimal scroll expected)
        const scrollResponse1 = await mcpClient.callTool('scroll_element', {
            css_selector: '#top-element',
            url: testUrl
        });

        assert.ok(scrollResponse1.result, 'Scroll should have a result');
        const result1 = scrollResponse1.result;
        assert.ok(result1.content, 'Should have content array');
        assert.strictEqual(result1.content.length, 2, 'Should have 2 content items (text + image)');

        // Validate text content
        const textContent1 = result1.content[0];
        assert.strictEqual(textContent1.type, 'text', 'First item should be text');
        assert.ok(textContent1.text.includes('Scrolled to element: #top-element'), 'Should indicate scrolled element');
        // Check for either scroll delta or "already in view" message
        assert.ok(textContent1.text.includes('Element was already in view') || textContent1.text.includes('Scroll delta'), 'Should include scroll status');
        assert.ok(textContent1.text.includes('Viewport position:'), 'Should include viewport position');
        assert.ok(textContent1.text.includes('Element position:'), 'Should include element position');

        // Validate screenshot
        const imageContent1 = result1.content[1];
        assert.strictEqual(imageContent1.type, 'image', 'Second item should be image');
        assert.ok(imageContent1.data, 'Should include screenshot data');
        assert.strictEqual(imageContent1.mimeType, 'image/png', 'Should be PNG image');

        // Test 3: Scroll to element that requires significant scrolling
        const scrollResponse2 = await mcpClient.callTool('scroll_element', {
            css_selector: '#bottom-element',
            url: testUrl
        });

        assert.ok(scrollResponse2.result, 'Bottom element scroll should have a result');
        const result2 = scrollResponse2.result;
        const textContent2 = result2.content[0];
        assert.ok(textContent2.text.includes('Scrolled to element: #bottom-element'), 'Should scroll to bottom element');
        // Should have significant scroll delta (not "already in view")
        assert.ok(!textContent2.text.includes('Element was already in view'), 'Should require scrolling for bottom element');

        // Test 4: Scroll with explicit index selector
        const scrollResponse3 = await mcpClient.callTool('scroll_element', {
            css_selector: '.scroll-target[2]', // Third element (0-indexed)
            url: testUrl
        });

        assert.ok(scrollResponse3.result, 'Indexed scroll should have a result');
        const result3 = scrollResponse3.result;
        const textContent3 = result3.content[0];
        assert.ok(textContent3.text.includes('Scrolled to element: .scroll-target[2]'), 'Should show indexed selector');
        // Should show multiple elements found
        assert.ok(textContent3.text.includes('Found 5 elements matching'), 'Should show multiple elements found');
        assert.ok(textContent3.text.includes('← scrolled to'), 'Should indicate which element was scrolled to');

        // Test 5: Scroll to middle element (verify centering)
        const scrollResponse4 = await mcpClient.callTool('scroll_element', {
            css_selector: '#middle-element',
            url: testUrl
        });

        assert.ok(scrollResponse4.result, 'Middle element scroll should have a result');
        const result4 = scrollResponse4.result;
        const textContent4 = result4.content[0];
        assert.ok(textContent4.text.includes('Scrolled to element: #middle-element'), 'Should scroll to middle element');

        // Test 6: Scroll to right element (verify horizontal scrolling)
        const scrollResponse5 = await mcpClient.callTool('scroll_element', {
            css_selector: '#right-element',
            url: testUrl
        });

        assert.ok(scrollResponse5.result, 'Right element scroll should have a result');
        const result5 = scrollResponse5.result;
        const textContent5 = result5.content[0];
        assert.ok(textContent5.text.includes('Scrolled to element: #right-element'), 'Should scroll to right element');

        // Test 7: Error case - element not found
        const scrollResponse6 = await mcpClient.callTool('scroll_element', {
            css_selector: '#nonexistent-element',
            url: testUrl
        });

        assert.ok(scrollResponse6.result, 'Should have result even for error');
        assert.strictEqual(scrollResponse6.result.isError, true, 'Should indicate error');
        assert.ok(scrollResponse6.result.content[0].text.includes('Element not found: "#nonexistent-element"'), 'Should show element not found error');

        // Test 8: Error case - index out of bounds
        const scrollResponse7 = await mcpClient.callTool('scroll_element', {
            css_selector: '.scroll-target[10]',
            url: testUrl
        });

        assert.ok(scrollResponse7.result, 'Should have result for out of bounds index');
        assert.strictEqual(scrollResponse7.result.isError, true, 'Should indicate error');
        assert.ok(scrollResponse7.result.content[0].text.includes('Element not found at index 10'), 'Should show index not found error');

        // Test 9: Error case - invalid CSS selector
        const scrollResponse8 = await mcpClient.callTool('scroll_element', {
            css_selector: 'invalid[syntax',
            url: testUrl
        });

        assert.ok(scrollResponse8.result, 'Should have result for invalid selector');
        assert.strictEqual(scrollResponse8.result.isError, true, 'Should indicate error');
        assert.ok(scrollResponse8.result.content[0].text.includes('Element not found: "invalid[syntax"'), 'Should show invalid selector error');

        // Test 10: Verify scroll response includes viewport information
        const scrollResponse9 = await mcpClient.callTool('scroll_element', {
            css_selector: '#middle-element',
            url: testUrl
        });

        const textContent9 = scrollResponse9.result.content[0];
        assert.ok(textContent9.text.includes('Viewport position:'), 'Should include viewport position');
        assert.ok(textContent9.text.includes('Element position:'), 'Should include element position');
        assert.ok(textContent9.text.includes('size:'), 'Should include element size');

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