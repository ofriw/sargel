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

test('Complex CSS selectors', async (t) => {
    let testServer = null;
    let mcpClient = null;
    let chromeProcess = null;

    try {
        // Kill any existing Chrome on port 9225 and clean user data
        try {
            await execAsync('lsof -ti:9225 | xargs kill -9').catch(() => {});
            await execAsync('rm -rf /tmp/chrome-test-9225').catch(() => {});
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
            '--remote-debugging-port=9225',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-size=1280,1024',
            '--user-data-dir=/tmp/chrome-test-9225',
            testUrl
        ], { stdio: 'ignore', detached: true });

        // Wait for Chrome to start and CDP to be available
        let cdpReady = false;
        let attempts = 0;
        while (!cdpReady && attempts < 15) {
            try {
                const response = await fetch('http://localhost:9225/json/version');
                cdpReady = response.ok;
                if (cdpReady) {
                    console.log('Chrome CDP ready on port 9225');
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

        // Test different selector types
        const testCases = [
            {
                name: 'ID selector',
                selector: '#test-header',
                expectedProperties: {
                    'background-color': 'rgb(66, 133, 244)',
                    'color': 'rgb(255, 255, 255)'
                }
            },
            {
                name: 'Class selector',
                selector: '.test-button',
                expectedProperties: {
                    'background-color': 'rgb(52, 168, 83)',
                    'color': 'rgb(255, 255, 255)'
                }
            },
            {
                name: 'Attribute selector',
                selector: '[data-test="custom-element"]',
                expectedProperties: {
                    'font-weight': '700', // bold
                    'color': 'rgb(255, 255, 255)'
                }
            },
            {
                name: 'Nested selector',
                selector: '.nested-container > .nested-item',
                expectedProperties: {
                    'background-color': 'rgb(255, 193, 7)',
                    'border-left-color': 'rgb(255, 143, 0)'
                }
            },
            {
                name: 'Pseudo-class selector (first-child)',
                selector: '.nested-item:first-child',
                expectedProperties: {
                    'background-color': 'rgb(255, 193, 7)'
                }
            }
        ];

        for (const testCase of testCases) {
            console.log(`Testing ${testCase.name}: ${testCase.selector}`);
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: testCase.selector,
                url: testUrl
            });

            assert.ok(response.result, `${testCase.name} should have a result`);
            assert.ok(response.result.content, `${testCase.name} should have content array`);
            
            // Parse diagnostic data from JSON content
            assert.ok(response.result.content.length >= 3, `${testCase.name} should have at least 3 content items`);
            assert.ok(response.result.content[2], `${testCase.name} should have third content item`);
            assert.ok(response.result.content[2].text, `${testCase.name} should have text in third content item`);
            
            const diagnosticData = JSON.parse(response.result.content[2].text);
            assert.ok(response.result.content[1].type === 'image', `${testCase.name} should include screenshot`);
            
            // Handle both single and multi-element responses
            const isMultiElement = diagnosticData.elements !== undefined;
            const elementData = isMultiElement ? diagnosticData.elements[0] : diagnosticData;
            
            assert.ok(elementData.grouped_styles, `${testCase.name} should include grouped styles`);
            assert.ok(elementData.box_model, `${testCase.name} should include box model`);

            // Check expected properties in grouped styles
            for (const [property, expectedValue] of Object.entries(testCase.expectedProperties)) {
                // Find property in the appropriate group
                let actualValue = null;
                for (const group of Object.values(elementData.grouped_styles)) {
                    if (group[property]) {
                        actualValue = group[property];
                        break;
                    }
                }
                assert.strictEqual(
                    actualValue, 
                    expectedValue, 
                    `${testCase.name}: ${property} should be ${expectedValue}, got ${actualValue}`
                );
            }

            console.log(`✅ ${testCase.name} passed`);
            
            // Add delay between tests to prevent WebSocket overload
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Test compound selectors
        const compoundResponse = await mcpClient.callTool('inspect_element', {
            css_selector: 'button.test-button#primary-button',
            url: testUrl
        });

        assert.ok(compoundResponse.result, 'Compound selector should work');
        const compoundData = JSON.parse(compoundResponse.result.content[2].text);
        // Find background-color in colors group
        const backgroundColor = compoundData.grouped_styles.colors['background-color'];
        assert.strictEqual(
            backgroundColor,
            'rgb(52, 168, 83)',
            'Compound selector should match correct element'
        );

        console.log('✅ Compound selector test passed');
        
        // Add delay before next test
        await new Promise(resolve => setTimeout(resolve, 500));

        // Test element with precise dimensions
        const preciseBoxResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#precise-box',
            url: testUrl
        });

        assert.ok(preciseBoxResponse.result, 'Precise box selector should work');
        
        const preciseData = JSON.parse(preciseBoxResponse.result.content[2].text);
        const boxModel = preciseData.box_model;
        
        // Verify box model dimensions
        // Content box should be 200x100
        assert.strictEqual(boxModel.content.width, 200, 'Content width should be 200px');
        assert.strictEqual(boxModel.content.height, 100, 'Content height should be 100px');
        
        // Padding box should be content + padding (15px each side)
        assert.strictEqual(boxModel.padding.width, 230, 'Padding width should be 230px (200 + 15*2)');
        assert.strictEqual(boxModel.padding.height, 130, 'Padding height should be 130px (100 + 15*2)');
        
        // Border box should be padding + border (5px each side)
        assert.strictEqual(boxModel.border.width, 240, 'Border width should be 240px (230 + 5*2)');
        assert.strictEqual(boxModel.border.height, 140, 'Border height should be 140px (130 + 5*2)');

        console.log('✅ Box model dimensions test passed');

        console.log('✅ All complex selector tests passed');

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