import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { createMCPClient } from '../helpers/mcp-client.js';
import { createTestServer } from '../helpers/chrome-test-server.js';
import { parseMarkdownDiagnostic } from '../helpers/markdown-parser.js';
import { killAllTestChromes } from '../helpers/chrome-test-helper.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

test('URL navigation handling', async (t) => {
    let testServer = null;
    let mcpClient = null;

    try {
        // Kill any existing Chrome on port 9224 and clean user data
        try {
            await execAsync('lsof -ti:9224 | xargs kill -9').catch(() => {});
            await execAsync('rm -rf /tmp/chrome-test-9224').catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            // Ignore cleanup errors
        }
        
        // Start test server
        testServer = await createTestServer();
        const testUrl = testServer.getUrl();
        console.log(`Test page available at: ${testUrl}`);

        // Launch Chrome with test page using helper

        
        // Give extra time for both tabs to load their content
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Start MCP server
        const serverPath = join(__dirname, '..', '..', 'dist', 'index.js');
        mcpClient = await createMCPClient(serverPath);

        // Test 1: Try with wrong URL (should get element not found)
        const noTargetResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: 'https://www.google.com'  // Google doesn't have our test element
        });
        
        // Should get an error because Google doesn't have our element
        assert.ok(noTargetResponse.result.isError, 'Should get error when element not found on wrong page');
        assert.ok(noTargetResponse.result.content[0].text.includes('Element not found'), 
            'Should get element not found error from wrong page');
        console.log('✅ Correctly received error for wrong page:', noTargetResponse.result.content[0].text);

        // Test 2: Use correct URL to navigate to test page
        const inspectionResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl
        });

        assert.ok(inspectionResponse.result, 'Should successfully inspect with correct target');
        assert.ok(inspectionResponse.result.content[1].type === 'image', 'Should include screenshot');
        const inspectionData = parseMarkdownDiagnostic(inspectionResponse.result.content[2].text);
        assert.ok(inspectionData.elements && inspectionData.elements.length > 0, 'Should have elements array');
        const element = inspectionData.elements[0];
        assert.ok(element.grouped_styles, 'Should include grouped styles');

        // Test 3: Try with invalid URL format
        const wrongTargetResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: 'invalid-url-format'
        });
        
        // Should get an error because URL is invalid
        assert.ok(wrongTargetResponse.result.isError, 'Should get error for invalid URL');
        const errorText = wrongTargetResponse.result.content[0].text;
        assert.ok(errorText.includes('Error') || errorText.includes('failed'), 
            'Should get navigation error');
        console.log('✅ Correctly received error for invalid URL:', errorText);

        // Test 4: Navigate back to correct URL and verify it works
        const secondInspectionResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl
        });

        assert.ok(secondInspectionResponse.result, 'Should work correctly after navigation');
        assert.ok(secondInspectionResponse.result.content[1].type === 'image', 'Should include screenshot');
        console.log('✅ Second navigation works correctly');

        console.log('✅ URL navigation test passed');

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