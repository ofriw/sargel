import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { createMCPClient } from '../helpers/mcp-client.js';
import { createTestServer } from '../helpers/chrome-test-server.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

test('URL navigation handling', async (t) => {
    let testServer = null;
    let mcpClient = null;
    let chromeProcess = null;

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

        // Launch Chrome with multiple tabs
        chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
            '--remote-debugging-port=9224',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-size=1280,1024',
            '--user-data-dir=/tmp/chrome-test-9224',
            testUrl,
            'https://example.com'
        ], { stdio: 'ignore', detached: true });

        // Wait for Chrome to start and CDP to be available
        let cdpReady = false;
        let attempts = 0;
        while (!cdpReady && attempts < 15) {
            try {
                const response = await fetch('http://localhost:9224/json/version');
                cdpReady = response.ok;
                if (cdpReady) {
                    console.log('Chrome CDP ready on port 9224');
                } else {
                    throw new Error('CDP not ready');
                }
            } catch (error) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (!cdpReady) {
            throw new Error('Chrome failed to start with CDP after 15 seconds');
        }
        
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
        const inspectionData = JSON.parse(inspectionResponse.result.content[2].text);
        assert.ok(inspectionData.grouped_styles, 'Should include grouped styles');

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
        if (chromeProcess && !chromeProcess.killed) {
            try {
                process.kill(-chromeProcess.pid);
            } catch (error) {
                if (error.code !== 'ESRCH') {
                    console.error('Error killing Chrome process:', error);
                }
            }
        }
        
        // Ensure ALL Chrome processes are killed to prevent test interference
        try {
            await execAsync('pkill -f "Google Chrome"').catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            // Ignore cleanup errors
        }
    }
});