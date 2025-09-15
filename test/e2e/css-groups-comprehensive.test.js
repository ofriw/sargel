import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { createMCPClient } from '../helpers/mcp-client.js';
import fs from 'fs/promises';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Custom test server that serves our comprehensive test HTML
class CSSGroupsTestServer {
    constructor() {
        this.server = null;
        this.port = null;
    }

    async start() {
        const { createServer } = await import('http');
        const htmlContent = await fs.readFile(
            join(__dirname, '..', 'fixtures', 'css-groups-test.html'), 
            'utf8'
        );

        this.server = createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlContent);
        });

        return new Promise((resolve, reject) => {
            this.server.listen(0, 'localhost', (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.port = this.server.address().port;
                resolve();
            });
        });
    }

    getUrl() {
        return `http://localhost:${this.port}`;
    }

    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    resolve();
                });
            });
        }
    }
}

async function createTestEnvironment() {
    const testServer = new CSSGroupsTestServer();
    await testServer.start();
    const testUrl = testServer.getUrl();

    // Launch Chrome
    const chromePort = 9230 + Math.floor(Math.random() * 100); // Random port to avoid conflicts
    const userDataDir = `/tmp/chrome-css-test-${Date.now()}`;

    const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        `--remote-debugging-port=${chromePort}`,
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--window-size=1280,1024',
        `--user-data-dir=${userDataDir}`,
        testUrl
    ], { stdio: 'ignore', detached: true });

    // Wait for Chrome to be ready
    let cdpReady = false;
    let attempts = 0;
    while (!cdpReady && attempts < 20) {
        try {
            const response = await fetch(`http://localhost:${chromePort}/json/version`);
            cdpReady = response.ok;
            if (!cdpReady) throw new Error('CDP not ready');
        } catch (error) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (!cdpReady) {
        throw new Error(`Chrome failed to start with CDP after ${attempts} attempts`);
    }

    // Start MCP server
    const serverPath = join(__dirname, '..', '..', 'dist', 'index.js');
    const mcpClient = await createMCPClient(serverPath);

    return {
        testServer,
        testUrl,
        chromeProcess,
        chromePort,
        userDataDir,
        mcpClient
    };
}

async function cleanupTestEnvironment(env) {
    if (env.mcpClient) {
        await env.mcpClient.stop();
    }
    if (env.testServer) {
        await env.testServer.stop();
    }
    if (env.chromeProcess && !env.chromeProcess.killed) {
        try {
            process.kill(-env.chromeProcess.pid);
        } catch (error) {
            if (error.code !== 'ESRCH') {
                console.error('Error killing Chrome process:', error);
            }
        }
    }
    
    // Cleanup user data directory
    try {
        await execAsync(`rm -rf ${env.userDataDir}`).catch(() => {});
    } catch (error) {
        // Ignore cleanup errors
    }
}

test('Grid Properties Integration Test', async (t) => {
    const env = await createTestEnvironment();
    
    try {
        console.log('Testing grid properties with dedicated grid elements...');
        
        // Test grid container
        const gridResponse = await env.mcpClient.callTool('inspect_element', {
            css_selector: '#grid-section',
            url: env.testUrl,
            property_groups: ['grid', 'layout']
        });

        assert.ok(gridResponse.result, 'Grid response should succeed');
        const gridData = JSON.parse(gridResponse.result.content[2].text);
        
        assert.ok(gridData.grouped_styles, 'Should have grouped styles');
        assert.ok(gridData.grouped_styles.grid, 'Should have grid group');
        assert.ok(gridData.grouped_styles.layout, 'Should have layout group');
        
        // Check specific grid properties
        const gridStyles = gridData.grouped_styles.grid;
        const layoutStyles = gridData.grouped_styles.layout;
        
        assert.strictEqual(layoutStyles['display'], 'grid', 'Should have display: grid');
        assert.ok(gridStyles['grid-template-columns'], 'Should have grid-template-columns');
        
        // Check for gap-related properties (browsers often expand 'gap' to 'column-gap' and 'row-gap')
        const hasGap = gridStyles['gap'] || gridStyles['grid-gap'] || 
                      gridStyles['column-gap'] || gridStyles['row-gap'] ||
                      layoutStyles['gap'] || layoutStyles['grid-gap'];
        assert.ok(hasGap, `Should have gap-related property. Found properties: ${JSON.stringify(Object.keys(gridStyles))}`);
        
        console.log(`✅ Grid container has ${Object.keys(gridStyles).length} grid properties`);
        
        // Test grid item
        const gridItemResponse = await env.mcpClient.callTool('inspect_element', {
            css_selector: '#grid-item-1', 
            url: env.testUrl,
            property_groups: ['grid']
        });
        
        assert.ok(gridItemResponse.result, 'Grid item response should succeed');
        const gridItemData = JSON.parse(gridItemResponse.result.content[2].text);
        
        const gridItemStyles = gridItemData.grouped_styles.grid;
        const hasGridPlacement = gridItemStyles['grid-area'] || 
                                gridItemStyles['grid-column'] ||
                                gridItemStyles['grid-column-start'] ||
                                gridItemStyles['grid-column-end'] ||
                                gridItemStyles['grid-row'] ||
                                gridItemStyles['grid-row-start'] ||
                                gridItemStyles['grid-row-end'];
        assert.ok(hasGridPlacement, 
            `Grid item should have grid placement properties. Found: ${JSON.stringify(Object.keys(gridItemStyles))}`);
        
        console.log('✅ Grid properties test passed');
        
    } finally {
        await cleanupTestEnvironment(env);
    }
});

test('Positioning Properties Integration Test', async (t) => {
    const env = await createTestEnvironment();
    
    try {
        console.log('Testing positioning properties...');
        
        const positionTests = [
            { selector: '#positioned-absolute', expectedPosition: 'absolute' },
            { selector: '#positioned-fixed', expectedPosition: 'fixed' },
            { selector: '#positioned-sticky', expectedPosition: 'sticky' },
            { selector: '#positioned-relative', expectedPosition: 'relative' }
        ];
        
        for (const testCase of positionTests) {
            const response = await env.mcpClient.callTool('inspect_element', {
                css_selector: testCase.selector,
                url: env.testUrl,
                property_groups: ['positioning', 'layout']
            });
            
            assert.ok(response.result, `${testCase.selector} should succeed`);
            const data = JSON.parse(response.result.content[2].text);
            
            assert.ok(data.grouped_styles.positioning, 'Should have positioning group');
            assert.ok(data.grouped_styles.layout, 'Should have layout group');
            
            const positioningStyles = data.grouped_styles.positioning;
            const layoutStyles = data.grouped_styles.layout;
            
            assert.strictEqual(layoutStyles['position'], testCase.expectedPosition, 
                `Should have correct position value for ${testCase.selector}`);
            
            // Check for positioning properties
            if (testCase.expectedPosition !== 'static') {
                const hasPositioningProps = Object.keys(positioningStyles).some(prop => 
                    ['top', 'right', 'bottom', 'left', 'inset'].some(posProp => prop.startsWith(posProp))
                );
                assert.ok(hasPositioningProps, 
                    `${testCase.selector} should have positioning properties`);
            }
            
            console.log(`✅ ${testCase.selector} positioning test passed`);
        }
        
    } finally {
        await cleanupTestEnvironment(env);
    }
});

test('Custom Properties Integration Test', async (t) => {
    const env = await createTestEnvironment();
    
    try {
        console.log('Testing CSS custom properties...');
        
        const customResponse = await env.mcpClient.callTool('inspect_element', {
            css_selector: '#custom-props',
            url: env.testUrl,
            property_groups: ['custom']
        });
        
        assert.ok(customResponse.result, 'Custom properties response should succeed');
        const customData = JSON.parse(customResponse.result.content[2].text);
        
        assert.ok(customData.grouped_styles, 'Should have grouped styles');
        assert.ok(customData.grouped_styles.custom, 'Should have custom group');
        
        const customStyles = customData.grouped_styles.custom;
        
        // Check for specific custom properties
        const expectedCustomProps = [
            '--primary-color',
            '--secondary-color', 
            '--base-spacing',
            '--font-scale',
            '--border-radius'
        ];
        
        let foundCustomProps = 0;
        for (const expectedProp of expectedCustomProps) {
            if (customStyles[expectedProp]) {
                foundCustomProps++;
                console.log(`Found custom property: ${expectedProp} = ${customStyles[expectedProp]}`);
            }
        }
        
        assert.ok(foundCustomProps > 0, 'Should find at least some custom properties');
        
        // Verify all properties in custom group are actually custom properties
        for (const [prop, value] of Object.entries(customStyles)) {
            assert.ok(prop.startsWith('--'), `${prop} should be a custom property (start with --)`);
        }
        
        console.log(`✅ Found ${foundCustomProps} custom properties`);
        
    } finally {
        await cleanupTestEnvironment(env);
    }
});

test('Essential Properties Override Test', async (t) => {
    const env = await createTestEnvironment();
    
    try {
        console.log('Testing that essential properties always appear...');
        
        // Request only visual group, but essential properties should still appear
        const response = await env.mcpClient.callTool('inspect_element', {
            css_selector: '#complex-element',
            url: env.testUrl,
            property_groups: ['visual'] // Only visual, not layout/box/colors
        });
        
        assert.ok(response.result, 'Essential properties test should succeed');
        const data = JSON.parse(response.result.content[2].text);
        
        assert.ok(data.grouped_styles, 'Should have grouped styles');
        
        // Essential properties should appear even though we only requested visual
        const essentialProperties = [
            'display', 'position', 'width', 'height', 'margin', 'padding',
            'border', 'font-family', 'font-size', 'color', 'background-color'
        ];
        
        let foundEssentials = 0;
        
        // Check all groups for essential properties
        for (const [groupName, groupStyles] of Object.entries(data.grouped_styles)) {
            for (const essential of essentialProperties) {
                if (groupStyles[essential]) {
                    foundEssentials++;
                    console.log(`Found essential property ${essential} in ${groupName} group`);
                }
            }
        }
        
        assert.ok(foundEssentials >= 5, `Should find at least 5 essential properties, found ${foundEssentials}`);
        
        // Verify we still have visual properties too
        assert.ok(data.grouped_styles.visual, 'Should still have visual group');
        const visualProps = Object.keys(data.grouped_styles.visual).length;
        assert.ok(visualProps > 0, 'Should have some visual properties');
        
        console.log(`✅ Essential properties override test passed (${foundEssentials} essential properties found)`);
        
    } finally {
        await cleanupTestEnvironment(env);
    }
});

test('Property Overlap Handling Test', async (t) => {
    const env = await createTestEnvironment();
    
    try {
        console.log('Testing property overlap handling...');
        
        // Test element that has both flex and grid properties applied
        const hybridResponse = await env.mcpClient.callTool('inspect_element', {
            css_selector: '#flex-grid-hybrid',
            url: env.testUrl,
            property_groups: ['flexbox', 'grid']
        });
        
        assert.ok(hybridResponse.result, 'Hybrid element test should succeed');
        const hybridData = JSON.parse(hybridResponse.result.content[2].text);
        
        assert.ok(hybridData.grouped_styles.flexbox, 'Should have flexbox group');
        assert.ok(hybridData.grouped_styles.grid, 'Should have grid group');
        
        // Look for properties that could appear in both groups
        const flexboxStyles = hybridData.grouped_styles.flexbox;
        const gridStyles = hybridData.grouped_styles.grid;
        
        // Properties like align-items, justify-content can appear in both
        const overlapProperties = ['align-items', 'justify-content', 'align-self', 'justify-self'];
        
        for (const prop of overlapProperties) {
            const inFlex = flexboxStyles[prop] !== undefined;
            const inGrid = gridStyles[prop] !== undefined;
            
            if (inFlex && inGrid) {
                console.log(`⚠️  Property ${prop} appears in both flexbox and grid groups`);
                // This is actually expected behavior - property should appear in first matching group
            } else if (inFlex || inGrid) {
                console.log(`✅ Property ${prop} appears in ${inFlex ? 'flexbox' : 'grid'} group only`);
            }
        }
        
        console.log('✅ Property overlap handling test completed');
        
    } finally {
        await cleanupTestEnvironment(env);
    }
});

test('Edge Cases Test', async (t) => {
    const env = await createTestEnvironment();
    
    try {
        await t.test('Empty property groups array', async () => {
            console.log('Testing empty property groups...');
            
            const response = await env.mcpClient.callTool('inspect_element', {
                css_selector: '#complex-element',
                url: env.testUrl,
                property_groups: [] // Empty array
            });
            
            assert.ok(response.result, 'Empty groups should work');
            const data = JSON.parse(response.result.content[2].text);
            
            // Should only have essential properties
            let totalProps = 0;
            for (const group of Object.values(data.grouped_styles)) {
                totalProps += Object.keys(group).length;
            }
            
            assert.ok(totalProps <= 20, `Should have minimal properties with empty groups, got ${totalProps}`);
            console.log(`✅ Empty groups returned ${totalProps} properties (essentials only)`);
        });

        await t.test('All groups combined', async () => {
            console.log('Testing all property groups...');
            
            const allGroups = ['layout', 'box', 'flexbox', 'grid', 'typography', 'colors', 'visual', 'positioning', 'custom'];
            
            const response = await env.mcpClient.callTool('inspect_element', {
                css_selector: '#complex-element',
                url: env.testUrl,
                property_groups: allGroups
            });
            
            assert.ok(response.result, 'All groups should work');
            const data = JSON.parse(response.result.content[2].text);
            
            // Should have many properties but still filtered
            const stats = data.stats;
            assert.ok(stats, 'Should have filtering stats');
            assert.ok(stats.total_properties > 0, 'Should have total properties count');
            assert.ok(stats.filtered_properties > 0, 'Should have filtered properties count');
            
            console.log(`✅ All groups: ${stats.total_properties} → ${stats.filtered_properties} properties`);
        });

        await t.test('Performance: Filtering effectiveness', async () => {
            console.log('Testing filtering performance...');
            
            // Get filtered response
            const filteredResponse = await env.mcpClient.callTool('inspect_element', {
                css_selector: '#complex-element',
                url: env.testUrl,
                property_groups: ['colors', 'typography']
            });
            
            // Get comprehensive response with all groups
            const unfilteredResponse = await env.mcpClient.callTool('inspect_element', {
                css_selector: '#complex-element', 
                url: env.testUrl,
                property_groups: ['layout', 'box', 'typography', 'colors', 'visual', 'positioning', 'flexbox', 'grid', 'custom']
            });
            
            assert.ok(filteredResponse.result, 'Filtered response should work');
            assert.ok(unfilteredResponse.result, 'Unfiltered response should work');
            
            const filteredData = JSON.parse(filteredResponse.result.content[2].text);
            const unfilteredData = JSON.parse(unfilteredResponse.result.content[2].text);
            
            // Compare response sizes
            const filteredSize = JSON.stringify(filteredResponse).length;
            const unfilteredSize = JSON.stringify(unfilteredResponse).length;
            
            const filteredPropCount = filteredData.stats?.filtered_properties || 0;
            const unfilteredPropCount = Object.keys(unfilteredData.computed_styles).length;
            
            assert.ok(filteredSize < unfilteredSize, 'Filtered response should be smaller');
            assert.ok(filteredPropCount < unfilteredPropCount, 'Filtered should have fewer properties');
            
            const sizeReduction = ((unfilteredSize - filteredSize) / unfilteredSize * 100).toFixed(1);
            const propReduction = ((unfilteredPropCount - filteredPropCount) / unfilteredPropCount * 100).toFixed(1);
            
            console.log(`✅ Performance: ${sizeReduction}% size reduction, ${propReduction}% property reduction`);
            console.log(`   Properties: ${unfilteredPropCount} → ${filteredPropCount}`);
            console.log(`   Size: ${unfilteredSize} → ${filteredSize} chars`);
        });

        await t.test('Minimal element test', async () => {
            console.log('Testing minimal element...');
            
            const response = await env.mcpClient.callTool('inspect_element', {
                css_selector: '#minimal-element',
                url: env.testUrl,
                property_groups: ['colors']
            });
            
            assert.ok(response.result, 'Minimal element should work');
            const data = JSON.parse(response.result.content[2].text);
            
            // Even minimal elements should have essential properties
            let totalProps = 0;
            for (const group of Object.values(data.grouped_styles)) {
                totalProps += Object.keys(group).length;
            }
            
            assert.ok(totalProps > 0, 'Should have at least essential properties');
            console.log(`✅ Minimal element has ${totalProps} properties`);
        });
        
    } finally {
        await cleanupTestEnvironment(env);
    }
});