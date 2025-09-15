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

test('Basic element inspection', async (t) => {
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
        const diagnosticData = JSON.parse(jsonContent.text);
        
        // Validate grouped styles (new optimized structure)
        assert.ok(diagnosticData.grouped_styles, 'Should include grouped styles');
        assert.ok(diagnosticData.grouped_styles.colors, 'Should have colors group');
        assert.ok(diagnosticData.grouped_styles.box, 'Should have box group');
        assert.strictEqual(diagnosticData.grouped_styles.colors['background-color'], 'rgb(66, 133, 244)', 'Should have correct background color');
        assert.strictEqual(diagnosticData.grouped_styles.box['width'], '400px', 'Should have correct width');
        assert.strictEqual(diagnosticData.grouped_styles.box['height'], '60px', 'Should have correct height');

        // Validate box model
        assert.ok(diagnosticData.box_model, 'Should include box model');
        assert.ok(diagnosticData.box_model.content, 'Should have content box');
        assert.ok(diagnosticData.box_model.padding, 'Should have padding box');
        assert.ok(diagnosticData.box_model.border, 'Should have border box');
        assert.ok(diagnosticData.box_model.margin, 'Should have margin box');

        // Validate cascade rules
        assert.ok(Array.isArray(diagnosticData.cascade_rules), 'Should include cascade rules array');
        assert.ok(diagnosticData.cascade_rules.length > 0, 'Should have at least one cascade rule');
        
        const headerRule = diagnosticData.cascade_rules.find(rule => 
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