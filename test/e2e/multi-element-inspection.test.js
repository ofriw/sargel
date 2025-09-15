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

test('Multi-element inspection', async (t) => {
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

        await t.test('Basic multi-element inspection', async () => {
            // Test multi-element inspection with buttons (selector matches multiple)
            const inspectionResponse = await mcpClient.callTool('inspect_element', {
                css_selector: 'button',
                url: testUrl,
                limit: 2
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
            
            // Validate multi-element structure
            assert.ok(Array.isArray(diagnosticData.elements), 'Should have elements array');
            assert.strictEqual(diagnosticData.elements.length, 2, 'Should have 2 elements');
            
            // Validate relationships
            assert.ok(Array.isArray(diagnosticData.relationships), 'Should have relationships array');
            assert.strictEqual(diagnosticData.relationships.length, 1, 'Should have 1 relationship (between 2 elements)');
            
            const relationship = diagnosticData.relationships[0];
            assert.ok(relationship.from.includes('button[0]') || relationship.from.includes('button[1]'), 'Relationship from should use indexed selector');
            assert.ok(relationship.to.includes('button[0]') || relationship.to.includes('button[1]'), 'Relationship to should use indexed selector');
            
            // Validate distance measurements
            assert.ok(relationship.distance, 'Should have distance measurements');
            assert.ok(typeof relationship.distance.horizontal === 'number', 'Should have horizontal distance');
            assert.ok(typeof relationship.distance.vertical === 'number', 'Should have vertical distance');
            assert.ok(typeof relationship.distance.center_to_center === 'number', 'Should have center to center distance');
            
            // Validate alignment data
            assert.ok(relationship.alignment, 'Should have alignment data');
            assert.ok(typeof relationship.alignment.top === 'boolean', 'Should have top alignment check');
            assert.ok(typeof relationship.alignment.bottom === 'boolean', 'Should have bottom alignment check');
            assert.ok(typeof relationship.alignment.left === 'boolean', 'Should have left alignment check');
            assert.ok(typeof relationship.alignment.right === 'boolean', 'Should have right alignment check');
            assert.ok(typeof relationship.alignment.vertical_center === 'boolean', 'Should have vertical center alignment check');
            assert.ok(typeof relationship.alignment.horizontal_center === 'boolean', 'Should have horizontal center alignment check');
            
            // Validate individual elements (using indexed selectors)
            const element1 = diagnosticData.elements[0];
            const element2 = diagnosticData.elements[1];
            
            assert.ok(element1, 'Should find first button element');
            assert.ok(element2, 'Should find second button element');
            
            // Each element should have expected properties
            for (const element of [element1, element2]) {
                assert.ok(element.computed_styles, 'Element should have computed styles');
                assert.ok(element.grouped_styles, 'Element should have grouped styles');
                assert.ok(element.cascade_rules, 'Element should have cascade rules');
                assert.ok(element.box_model, 'Element should have box model');
                
                // Validate box model structure
                assert.ok(element.box_model.content, 'Should have content box');
                assert.ok(element.box_model.padding, 'Should have padding box');
                assert.ok(element.box_model.border, 'Should have border box');
                assert.ok(element.box_model.margin, 'Should have margin box');
            }

            console.log('✅ Basic multi-element inspection test passed');
        });

        await t.test('Multi-element with three elements', async () => {
            // Test with three nested items to validate pairwise relationships
            const inspectionResponse = await mcpClient.callTool('inspect_element', {
                css_selector: '.nested-item',
                url: testUrl,
                limit: 3
            });

            assert.ok(inspectionResponse.result, 'Inspection should have a result');
            const jsonContent = inspectionResponse.result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Should have 3 elements and 3 pairwise relationships (1-2, 1-3, 2-3)
            assert.strictEqual(diagnosticData.elements.length, 3, 'Should have 3 elements');
            assert.strictEqual(diagnosticData.relationships.length, 3, 'Should have 3 relationships');
            
            // Verify all expected relationships exist (using indexed selectors)
            const relationshipPairs = diagnosticData.relationships.map(rel => `${rel.from}-${rel.to}`);
            assert.ok(relationshipPairs.includes('.nested-item[0]-.nested-item[1]'), 'Should have 0-1 relationship');
            assert.ok(relationshipPairs.includes('.nested-item[0]-.nested-item[2]'), 'Should have 0-2 relationship');
            assert.ok(relationshipPairs.includes('.nested-item[1]-.nested-item[2]'), 'Should have 1-2 relationship');

            console.log('✅ Three element inspection test passed');
        });

        await t.test('Multi-element with CSS edits', async () => {
            // Test multi-element inspection with CSS modifications on buttons
            const inspectionResponse = await mcpClient.callTool('inspect_element', {
                css_selector: '.test-button',
                url: testUrl,
                limit: 2,
                css_edits: {
                    'background-color': '#ff0000',
                    'border': '3px solid #00ff00'
                }
            });

            assert.ok(inspectionResponse.result, 'Inspection should have a result');
            const jsonContent = inspectionResponse.result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Validate that CSS edits were applied to both elements
            for (const element of diagnosticData.elements) {
                assert.ok(element.applied_edits, 'Element should have applied edits');
                assert.strictEqual(element.applied_edits['background-color'], '#ff0000', 'Should apply background color');
                assert.strictEqual(element.applied_edits['border'], '3px solid #00ff00', 'Should apply border');
            }

            console.log('✅ Multi-element with CSS edits test passed');
        });

        await t.test('Multi-element with property groups', async () => {
            // Test multi-element inspection with specific property groups
            const inspectionResponse = await mcpClient.callTool('inspect_element', {
                css_selector: '.test-button',
                url: testUrl,
                limit: 2,
                property_groups: ['colors', 'typography']
            });

            assert.ok(inspectionResponse.result, 'Inspection should have a result');
            const jsonContent = inspectionResponse.result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Validate property filtering worked
            for (const element of diagnosticData.elements) {
                assert.ok(element.grouped_styles.colors, 'Should have colors group');
                assert.ok(element.grouped_styles.typography, 'Should have typography group');
                
                // Essential properties may still appear in other groups, but they should be minimal
                // Check that colors and typography groups have the expected properties
                assert.ok(element.grouped_styles.colors['color'], 'Should have color property');
                assert.ok(element.grouped_styles.colors['background-color'], 'Should have background-color property');
                assert.ok(element.grouped_styles.typography['font-family'], 'Should have font-family property');
                assert.ok(element.grouped_styles.typography['font-size'], 'Should have font-size property');
                
                // If box/layout groups exist, they should only have essential properties
                if (element.grouped_styles.box) {
                    const boxProps = Object.keys(element.grouped_styles.box);
                    const expectedEssentialBoxProps = ['width', 'height', 'margin', 'padding', 'border'];
                    for (const prop of boxProps) {
                        assert.ok(expectedEssentialBoxProps.some(essential => prop.startsWith(essential)), 
                            `Box group should only have essential properties, found: ${prop}`);
                    }
                }
                if (element.grouped_styles.layout) {
                    const layoutProps = Object.keys(element.grouped_styles.layout);
                    const expectedEssentialLayoutProps = ['display', 'position'];
                    for (const prop of layoutProps) {
                        assert.ok(expectedEssentialLayoutProps.some(essential => prop.startsWith(essential)), 
                            `Layout group should only have essential properties, found: ${prop}`);
                    }
                }
            }

            console.log('✅ Multi-element property groups test passed');
        });

        await t.test('Backward compatibility - single element as string', async () => {
            // Test that single element (string) still works and returns single-element format
            const inspectionResponse = await mcpClient.callTool('inspect_element', {
                css_selector: '#test-header',
                url: testUrl
            });

            assert.ok(inspectionResponse.result, 'Inspection should have a result');
            const jsonContent = inspectionResponse.result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            // Should be single-element result (backward compatibility)
            assert.ok(diagnosticData.box_model, 'Should have box model directly');
            assert.ok(diagnosticData.computed_styles, 'Should have computed styles directly');
            assert.ok(!diagnosticData.elements, 'Should not have elements array');
            assert.ok(!diagnosticData.relationships, 'Should not have relationships array');

            console.log('✅ Backward compatibility test passed');
        });

        await t.test('Error handling - element not found', async () => {
            // Test error handling when selector doesn't match anything
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '#nonexistent-element',
                url: testUrl
            });
            
            // Should get an error response
            assert.ok(response.result.isError, 'Response should indicate an error');
            const errorText = response.result.content[0].text;
            assert.ok(errorText.includes('Element not found: #nonexistent-element'), 
                'Should provide specific error about missing element');

            console.log('✅ Error handling test passed');
        });

        await t.test('Error handling - invalid selector', async () => {
            // Test error handling for invalid CSS selector
            const response = await mcpClient.callTool('inspect_element', {
                css_selector: '>>invalid<<',
                url: testUrl
            });
            
            // Should get an error response
            assert.ok(response.result.isError, 'Response should indicate an error');
            const errorText = response.result.content[0].text;
            assert.ok(errorText.includes('Invalid CSS selector') || errorText.includes('Element not found'), 
                'Should provide specific error about invalid selector');

            console.log('✅ Invalid selector error handling test passed');
        });

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

// Additional test for distance calculation accuracy
test('Distance calculation accuracy', async (t) => {
    let testServer = null;
    let mcpClient = null;
    let chromeProcess = null;

    try {
        // Setup (similar to previous test)
        try {
            await execAsync('lsof -ti:9222 | xargs kill -9').catch(() => {});
            await execAsync('rm -rf /tmp/chrome-test-9222').catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            // Ignore cleanup errors
        }
        
        testServer = await createTestServer();
        const testUrl = testServer.getUrl();

        chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
            '--remote-debugging-port=9222',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-size=1280,1024',
            '--user-data-dir=/tmp/chrome-test-9222',
            testUrl
        ], { stdio: 'ignore', detached: true });

        // Wait for Chrome
        let cdpReady = false;
        let attempts = 0;
        while (!cdpReady && attempts < 15) {
            try {
                const response = await fetch('http://localhost:9222/json/version');
                cdpReady = response.ok;
                if (cdpReady) break;
            } catch (error) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (!cdpReady) {
            throw new Error('Chrome failed to start with CDP after 15 seconds');
        }

        const serverPath = join(__dirname, '..', '..', 'dist', 'index.js');
        mcpClient = await createMCPClient(serverPath);

        await t.test('Distance calculations are mathematically correct', async () => {
            // Test with nested items that have predictable positions
            const inspectionResponse = await mcpClient.callTool('inspect_element', {
                css_selector: '.nested-item',
                url: testUrl,
                limit: 2
            });

            assert.ok(inspectionResponse.result, 'Inspection should have a result');
            const jsonContent = inspectionResponse.result.content[2];
            const diagnosticData = JSON.parse(jsonContent.text);
            
            const relationship = diagnosticData.relationships[0];
            const element1 = diagnosticData.elements[0];
            const element2 = diagnosticData.elements[1];
            
            // Verify distance calculations make sense
            const box1 = element1.box_model.border;
            const box2 = element2.box_model.border;
            
            // Calculate expected center-to-center distance manually
            const center1X = box1.x + box1.width / 2;
            const center1Y = box1.y + box1.height / 2;
            const center2X = box2.x + box2.width / 2;
            const center2Y = box2.y + box2.height / 2;
            
            const expectedCenterDistance = Math.sqrt(
                Math.pow(center2X - center1X, 2) + 
                Math.pow(center2Y - center1Y, 2)
            );
            
            // Allow 1 pixel tolerance for rounding
            const actualCenterDistance = relationship.distance.center_to_center;
            assert.ok(
                Math.abs(actualCenterDistance - expectedCenterDistance) <= 1,
                `Center distance should be approximately ${expectedCenterDistance}, got ${actualCenterDistance}`
            );

            console.log('✅ Distance calculation accuracy test passed');
        });

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
        
        try {
            await execAsync('pkill -f "Google Chrome"').catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            // Ignore cleanup errors
        }
    }
});