import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMCPClient } from '../helpers/mcp-client.js';
import { createTestServer } from '../helpers/chrome-test-server.js';
import { killAllTestChromes } from '../helpers/chrome-test-helper.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

test('Element not found error handling', async (t) => {
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

        // Test with non-existent element
        const response = await mcpClient.callTool('inspect_element', {
            css_selector: '#non-existent-element',
            url: testUrl
        });
        
        // Should get an error response
        assert.ok(response.result.isError, 'Response should indicate an error');
        assert.ok(response.result.content[0].text.includes('Element not found'), 
            'Should get element not found error');
        console.log('✅ Correctly received error:', response.result.content[0].text);

        // Test with malformed CSS selector
        const selectorResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '###invalid-selector',
            url: testUrl
        });
        
        // Should get an error response
        assert.ok(selectorResponse.result.isError, 'Response should indicate an error');
        const errorText = selectorResponse.result.content[0].text;
        assert.ok(errorText.includes('selector') || errorText.includes('syntax') || errorText.includes('Error'), 
            'Should get selector syntax error');
        console.log('✅ Correctly received error for malformed selector:', errorText);

        console.log('✅ Element not found test passed');

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