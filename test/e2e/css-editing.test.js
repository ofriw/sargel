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

test('CSS editing functionality', async (t) => {
    let testServer = null;
    let mcpClient = null;
    let chromeProcess = null;

    try {
        // Kill any existing Chrome on port 9222 and clean user data
        try {
            await execAsync('lsof -ti:9222 | xargs kill -9').catch(() => {});
            await execAsync('rm -rf /tmp/chrome-test-9222').catch(() => {});
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
            '--remote-debugging-port=9222',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-size=1280,1024',
            '--user-data-dir=/tmp/chrome-test-9222',
            testUrl
        ], { stdio: 'ignore', detached: true });

        // Wait for Chrome to start and CDP to be available
        let cdpReady = false;
        let attempts = 0;
        while (!cdpReady && attempts < 15) {
            try {
                const response = await fetch('http://localhost:9222/json/version');
                cdpReady = response.ok;
                if (cdpReady) {
                    console.log('Chrome CDP ready on port 9222');
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
        
        // Parse the JSON data to check applied_edits
        const jsonContent = basicResult.content[2];
        const editData = JSON.parse(jsonContent.text);
        
        assert.ok(editData.applied_edits, 'Should include applied_edits');
        assert.strictEqual(editData.applied_edits['background-color'], 'red', 'Should confirm background-color edit');
        assert.strictEqual(editData.applied_edits['color'], 'white', 'Should confirm color edit');
        
        // The grouped styles should reflect the changes (default uses property grouping)
        assert.ok(editData.grouped_styles, 'Should have grouped styles');
        assert.ok(editData.grouped_styles.colors, 'Should have colors group');
        
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
        const layoutData = JSON.parse(layoutJsonContent.text);
        
        assert.ok(layoutData.applied_edits, 'Should include applied_edits for layout');
        assert.strictEqual(layoutData.applied_edits['width'], '600px', 'Should confirm width edit');
        assert.strictEqual(layoutData.applied_edits['height'], '100px', 'Should confirm height edit');
        assert.strictEqual(layoutData.applied_edits['padding'], '20px', 'Should confirm padding edit');
        
        // Box model should reflect the changes
        assert.ok(layoutData.box_model, 'Should have updated box model');
        
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
        const noEditData = JSON.parse(noEditJsonContent.text);
        
        // Should not have applied_edits when no edits are provided
        assert.strictEqual(noEditData.applied_edits, undefined, 'Should not have applied_edits when no edits provided');
        
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
        const emptyEditData = JSON.parse(emptyEditJsonContent.text);
        
        // Should not have applied_edits when empty edits object is provided
        assert.strictEqual(emptyEditData.applied_edits, undefined, 'Should not have applied_edits when empty edits provided');
        
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
        if (chromeProcess && !chromeProcess.killed) {
            try {
                process.kill(-chromeProcess.pid); // Kill process group
            } catch (error) {
                // Process might already be dead - ignore ESRCH errors
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