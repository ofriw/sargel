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

test('Element not found error handling', async (t) => {
    let testServer = null;
    let mcpClient = null;
    let chromeProcess = null;

    try {
        // Kill any existing Chrome on port 9223 and clean user data
        try {
            await execAsync('lsof -ti:9223 | xargs kill -9').catch(() => {});
            await execAsync('rm -rf /tmp/chrome-test-9223').catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            // Ignore cleanup errors
        }
        
        // Start test server
        testServer = await createTestServer();
        const testUrl = testServer.getUrl();
        console.log(`Test page available at: ${testUrl}`);

        // Launch Chrome with test page
        chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
            '--remote-debugging-port=9223',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-size=1280,1024',
            '--user-data-dir=/tmp/chrome-test-9223',
            testUrl
        ], { stdio: 'ignore', detached: true });

        // Wait for Chrome to start and CDP to be available
        let cdpReady = false;
        let attempts = 0;
        while (!cdpReady && attempts < 15) {
            try {
                const response = await fetch('http://localhost:9223/json/version');
                cdpReady = response.ok;
                if (cdpReady) {
                    console.log('Chrome CDP ready on port 9223');
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