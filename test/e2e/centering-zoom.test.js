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

test('Auto-center and zoom functionality', async (t) => {
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
        
        // Start test server with standard fixture
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

        await t.test('small button auto-zoom in', async () => {
            console.log('Testing small button auto-zoom...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '#primary-button',
                url: testUrl,
                property_groups: ['layout', 'box']
            });

            assert.ok(response.result, 'Should have result');
            const result = response.result;
            
            // Parse diagnostic data
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Verify viewport adjustments exist
            assert.ok(diagnosticData.viewport_adjustments, 'Should have viewport_adjustments');
            
            // Verify zoom factor - buttons are small enough to potentially zoom in
            const zoomFactor = diagnosticData.viewport_adjustments.zoom_factor;
            assert.ok(zoomFactor >= 1, `Small element should zoom in or stay same, got ${zoomFactor}`);
            assert.ok(zoomFactor <= 3, `Zoom should not exceed 3x, got ${zoomFactor}`);
            
            // Verify centering behavior
            assert.ok(
                typeof diagnosticData.viewport_adjustments.centered === 'boolean',
                'Should have centered boolean'
            );
            
            // Verify original position is stored
            assert.ok(diagnosticData.viewport_adjustments.original_position, 'Should store original position');
            assert.ok(
                typeof diagnosticData.viewport_adjustments.original_position.centerX === 'number',
                'Should have original centerX'
            );
            
            console.log('✅ Small button auto-zoom test passed');
        });

        await t.test('header element behavior', async () => {
            console.log('Testing header element behavior...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '#test-header',
                url: testUrl,
                property_groups: ['layout', 'box']
            });

            assert.ok(response.result, 'Should have result');
            const result = response.result;
            
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Verify viewport adjustments
            assert.ok(diagnosticData.viewport_adjustments, 'Should have viewport_adjustments');
            
            // Verify zoom factor is reasonable (400x60 element shouldn't need much adjustment)
            const zoomFactor = diagnosticData.viewport_adjustments.zoom_factor;
            assert.ok(zoomFactor >= 0.5 && zoomFactor <= 3, `Zoom factor should be in range, got ${zoomFactor}`);
            
            // Verify centering behavior
            assert.ok(
                typeof diagnosticData.viewport_adjustments.centered === 'boolean',
                'Should have centered boolean'
            );
            
            console.log('✅ Header element test passed');
        });

        await t.test('precise box element behavior', async () => {
            console.log('Testing precise box element behavior...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '#precise-box',
                url: testUrl,
                property_groups: ['layout', 'box']
            });

            const result = response.result;
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Precise box (200x100 + padding/border) should be reasonable size
            const zoomFactor = diagnosticData.viewport_adjustments.zoom_factor;
            assert.ok(zoomFactor >= 0.5 && zoomFactor <= 3, `Zoom factor should be in range, got ${zoomFactor}`);
            
            // Verify centering behavior
            assert.ok(
                typeof diagnosticData.viewport_adjustments.centered === 'boolean',
                'Should have centered boolean'
            );
            
            console.log('✅ Precise box element test passed');
        });

        await t.test('multi-element group centering and zoom', async () => {
            console.log('Testing multi-element group behavior...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '.nested-item',
                url: testUrl,
                property_groups: ['layout', 'positioning'],
                limit: 3
            });

            const result = response.result;
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Verify we got 3 elements
            assert.strictEqual(diagnosticData.elements.length, 3, 'Should find 3 nested elements');
            
            // Verify viewport adjustments for multi-element
            assert.ok(diagnosticData.viewport_adjustments, 'Should have viewport_adjustments');
            
            // Should center the group
            assert.ok(
                typeof diagnosticData.viewport_adjustments.centered === 'boolean',
                'Should have centered boolean'
            );
            
            // Should have original positions for all elements
            assert.ok(
                diagnosticData.viewport_adjustments.original_positions,
                'Should have original_positions for multi-element'
            );
            assert.strictEqual(
                diagnosticData.viewport_adjustments.original_positions.length,
                3,
                'Should store positions for all 3 elements'
            );
            
            // Verify zoom factor is reasonable for the group
            const zoomFactor = diagnosticData.viewport_adjustments.zoom_factor;
            assert.ok(zoomFactor >= 0.5 && zoomFactor <= 3, `Zoom factor should be in range, got ${zoomFactor}`);
            
            console.log('✅ Multi-element group test passed');
        });

        await t.test('disabled auto-center', async () => {
            console.log('Testing disabled auto-center...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '#primary-button',
                url: testUrl,
                property_groups: ['layout'],
                autoCenter: false,
                autoZoom: true  // Still allow zoom
            });

            const result = response.result;
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Should not center when disabled
            assert.strictEqual(
                diagnosticData.viewport_adjustments.centered,
                false,
                'Should not center when autoCenter is false'
            );
            
            // But should still zoom if element is small
            const zoomFactor = diagnosticData.viewport_adjustments.zoom_factor;
            assert.ok(zoomFactor >= 1, 'Should still zoom when autoZoom is enabled');
            
            console.log('✅ Disabled auto-center test passed');
        });

        await t.test('disabled auto-zoom', async () => {
            console.log('Testing disabled auto-zoom...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '#secondary-button',
                url: testUrl,
                property_groups: ['layout'],
                autoCenter: true,  // Still allow centering
                autoZoom: false
            });

            const result = response.result;
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Should not zoom when disabled
            assert.strictEqual(
                diagnosticData.viewport_adjustments.zoom_factor,
                1,
                'Should not zoom when autoZoom is false'
            );
            
            // But should still center if element is off-center
            assert.strictEqual(
                diagnosticData.viewport_adjustments.centered,
                true,
                'Should still center when autoCenter is enabled'
            );
            
            console.log('✅ Disabled auto-zoom test passed');
        });

        await t.test('both features disabled', async () => {
            console.log('Testing both features disabled...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '[data-test="custom-element"]',
                url: testUrl,
                property_groups: ['layout'],
                autoCenter: false,
                autoZoom: false
            });

            const result = response.result;
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Should not center or zoom
            assert.strictEqual(
                diagnosticData.viewport_adjustments.centered,
                false,
                'Should not center when disabled'
            );
            assert.strictEqual(
                diagnosticData.viewport_adjustments.zoom_factor,
                1,
                'Should not zoom when disabled'
            );
            
            console.log('✅ Both features disabled test passed');
        });

        await t.test('manual zoom override', async () => {
            console.log('Testing manual zoom override...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '#precise-box',
                url: testUrl,
                property_groups: ['layout'],
                zoomFactor: 2.5
            });

            const result = response.result;
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Should use exact manual zoom factor
            assert.strictEqual(
                diagnosticData.viewport_adjustments.zoom_factor,
                2.5,
                'Should use exact manual zoom factor'
            );
            
            console.log('✅ Manual zoom override test passed');
        });

        await t.test('manual zoom clamping', async () => {
            console.log('Testing zoom factor clamping...');
            
            // Test upper bound clamping
            const responseHigh = await mcpClient.callTool('inspect_element', {
                css_selector: '#test-header',
                url: testUrl,
                property_groups: ['layout'],
                zoomFactor: 10.0  // Should be clamped to 3.0
            });

            const resultHigh = responseHigh.result;
            const jsonContentHigh = resultHigh.content[2];
            const diagnosticDataHigh = JSON.parse(jsonContentHigh.text);
            
            assert.strictEqual(
                diagnosticDataHigh.viewport_adjustments.zoom_factor,
                3.0,
                'Zoom factor should be clamped to maximum 3.0'
            );
            
            // Test lower bound clamping
            const responseLow = await mcpClient.callTool('inspect_element', {
                css_selector: '#test-header',
                url: testUrl,
                property_groups: ['layout'],
                zoomFactor: 0.1  // Should be clamped to 0.5
            });

            const resultLow = responseLow.result;
            const jsonContentLow = resultLow.content[2];
            const diagnosticDataLow = JSON.parse(jsonContentLow.text);
            
            assert.strictEqual(
                diagnosticDataLow.viewport_adjustments.zoom_factor,
                0.5,
                'Zoom factor should be clamped to minimum 0.5'
            );
            
            console.log('✅ Zoom factor clamping test passed');
        });

        await t.test('CSS edits with zoom', async () => {
            console.log('Testing CSS edits combined with zoom...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '#precise-box',
                url: testUrl,
                property_groups: ['colors', 'box'],
                css_edits: {
                    'background-color': 'red',
                    'color': 'yellow',
                    'border': '5px solid blue'
                },
                zoomFactor: 2.0
            });

            const result = response.result;
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Verify zoom was applied
            assert.strictEqual(
                diagnosticData.viewport_adjustments.zoom_factor,
                2.0,
                'Zoom should work with CSS edits'
            );
            
            // Verify CSS edits were applied
            assert.ok(diagnosticData.applied_edits, 'Should have applied_edits');
            assert.strictEqual(
                diagnosticData.applied_edits['background-color'],
                'red',
                'CSS edit should be applied'
            );
            
            // Verify screenshot contains both zoom and edits
            const imageContent = result.content[1];
            assert.strictEqual(imageContent.type, 'image', 'Should have screenshot');
            
            console.log('✅ CSS edits with zoom test passed');
        });

        await t.test('edge case: button element', async () => {
            console.log('Testing button element edge case...');
            
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '.test-button:first-child',
                url: testUrl,
                property_groups: ['layout']
            });

            const result = response.result;
            const jsonContent = result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Should handle button element gracefully
            assert.ok(diagnosticData.viewport_adjustments, 'Should have viewport_adjustments');
            
            const zoomFactor = diagnosticData.viewport_adjustments.zoom_factor;
            assert.ok(zoomFactor >= 0.5 && zoomFactor <= 3, 'Should use reasonable zoom for button element');
            
            console.log('✅ Button element test passed');
        });

        await t.test('viewport adjustments structure validation', async () => {
            console.log('Testing viewport_adjustments structure...');
            
            // Test single element structure
            const singleResponse = await mcpClient.callTool('inspect_element', {
                css_selector: '#primary-button',
                url: testUrl
            });

            const singleResult = singleResponse.result;
            const singleJsonContent = singleResult.content[2];
            const singleData = JSON.parse(singleJsonContent.text);
            
            // Validate single element structure
            assert.ok(singleData.viewport_adjustments, 'Single element should have viewport_adjustments');
            assert.ok('zoom_factor' in singleData.viewport_adjustments, 'Should have zoom_factor');
            assert.ok('centered' in singleData.viewport_adjustments, 'Should have centered');
            assert.ok('original_viewport' in singleData.viewport_adjustments, 'Should have original_viewport');
            assert.ok('original_position' in singleData.viewport_adjustments, 'Should have original_position for single element');
            
            // Test multi-element structure
            const multiResponse = await mcpClient.callTool('inspect_element', {
                css_selector: '.nested-item',
                url: testUrl,
                limit: 3
            });

            const multiResult = multiResponse.result;
            const multiJsonContent = multiResult.content[2];
            const multiData = JSON.parse(multiJsonContent.text);
            
            // Validate multi-element structure
            assert.ok(multiData.viewport_adjustments, 'Multi element should have viewport_adjustments');
            assert.ok('original_positions' in multiData.viewport_adjustments, 'Should have original_positions for multi elements');
            assert.strictEqual(
                multiData.viewport_adjustments.original_positions.length,
                3,
                'Should have positions for all elements'
            );
            
            console.log('✅ Viewport adjustments structure validation passed');
        });

    } finally {
        // Cleanup
        if (mcpClient) {
            await mcpClient.stop();
        }

        if (testServer) {
            try {
                await testServer.stop();
            } catch (error) {
                console.error('Error stopping test server:', error);
            }
        }

        if (chromeProcess) {
            try {
                process.kill(chromeProcess.pid);
            } catch (error) {
                console.error('Error killing Chrome process:', error);
            }
        }

        // Additional cleanup
        try {
            await execAsync('lsof -ti:9222 | xargs kill -9').catch(() => {});
            await execAsync('rm -rf /tmp/chrome-test-*').catch(() => {});
        } catch (error) {
            // Ignore cleanup errors
        }
    }
});