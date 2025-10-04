import test from 'node:test';
import assert from 'node:assert';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMCPClient } from '../helpers/mcp-client.js';
import { createTestServer } from '../helpers/chrome-test-server.js';
import { parseMarkdownDiagnostic } from '../helpers/markdown-parser.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

test('Color sampling functionality', async (t) => {
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

        // Test color sampling on element with known colors
        // #test-header has: bg=#4285f4 (rgb(66,133,244)), color=white (rgb(255,255,255)), border=#3367d6 (rgb(51,103,214))
        const inspectionResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl,
            sampleBackgroundColor: true
        });

        assert.ok(inspectionResponse.result, 'Inspection should have a result');

        const result = inspectionResponse.result;
        assert.ok(result.content, 'Should have content array');
        assert.strictEqual(result.content.length, 3, 'Should have 3 content items');

        // Parse the JSON data (third item in content array)
        const jsonContent = result.content[2];
        assert.strictEqual(jsonContent.type, 'text', 'Third item should be text');
        const diagnosticData = parseMarkdownDiagnostic(jsonContent.text);

        // Validate element structure
        assert.ok(diagnosticData.elements && diagnosticData.elements.length > 0, 'Should have elements array');
        const element = diagnosticData.elements[0];

        // Validate sampled_background_color exists
        assert.ok(element.sampled_background_color, 'Should include sampled_background_color');

        // Validate sampled pixel colors exist and are valid
        assert.ok(element.sampled_background_color.background, 'Should have background pixel sample (not null)');

        const background = element.sampled_background_color.background;
        assert.ok(typeof background.r === 'number', 'Red component should be a number');
        assert.ok(typeof background.g === 'number', 'Green component should be a number');
        assert.ok(typeof background.b === 'number', 'Blue component should be a number');
        assert.ok(typeof background.a === 'number', 'Alpha component should be a number');
        assert.ok(background.r >= 0 && background.r <= 255, 'Red should be 0-255');
        assert.ok(background.g >= 0 && background.g <= 255, 'Green should be 0-255');
        assert.ok(background.b >= 0 && background.b <= 255, 'Blue should be 0-255');
        assert.ok(background.a >= 0 && background.a <= 1, 'Alpha should be 0-1');

        // Validate that sampled color is close to expected background color
        // #4285f4 = rgb(66, 133, 244)
        // Allow ±15 tolerance for rendering variations across browsers/OS
        const tolerance = 15;
        assert.ok(Math.abs(background.r - 66) <= tolerance,
            `Red component (${background.r}) should be close to 66 (±${tolerance})`);
        assert.ok(Math.abs(background.g - 133) <= tolerance,
            `Green component (${background.g}) should be close to 133 (±${tolerance})`);
        assert.ok(Math.abs(background.b - 244) <= tolerance,
            `Blue component (${background.b}) should be close to 244 (±${tolerance})`);

        // Test 2: Color sampling on button element
        const buttonResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '.test-button',
            url: testUrl,
            sampleBackgroundColor: true
        });

        const buttonResult = buttonResponse.result;
        const buttonJsonContent = buttonResult.content[2];
        const buttonData = parseMarkdownDiagnostic(buttonJsonContent.text);

        const buttonElement = buttonData.elements[0];
        assert.ok(buttonElement.sampled_background_color, 'Button should have sampled colors');

        // Validate sampled pixel color for button (.test-button has bg=#34a853 (rgb(52,168,83)))
        assert.ok(buttonElement.sampled_background_color.background, 'Button should have sampled background color');
        const buttonBackground = buttonElement.sampled_background_color.background;

        // Button uses corner sampling to avoid centered text
        // Expected: rgb(52, 168, 83) - the green background
        const buttonTolerance = 15;
        assert.ok(Math.abs(buttonBackground.r - 52) <= buttonTolerance,
            `Button background red (${buttonBackground.r}) should be close to 52 (±${buttonTolerance})`);
        assert.ok(Math.abs(buttonBackground.g - 168) <= buttonTolerance,
            `Button background green (${buttonBackground.g}) should be close to 168 (±${buttonTolerance})`);
        assert.ok(Math.abs(buttonBackground.b - 83) <= buttonTolerance,
            `Button background blue (${buttonBackground.b}) should be close to 83 (±${buttonTolerance})`);

        // Test 3: Color sampling disabled by default
        const noSamplingResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl
            // sampleBackgroundColor not specified - should default to false
        });

        const noSamplingResult = noSamplingResponse.result;
        const noSamplingJsonContent = noSamplingResult.content[2];
        const noSamplingData = parseMarkdownDiagnostic(noSamplingJsonContent.text);
        const noSamplingElement = noSamplingData.elements[0];

        assert.strictEqual(
            noSamplingElement.sampled_background_color,
            undefined,
            'Should not include sampled_background_color when sampleColors is false'
        );

        // Test 4: Small element should fail with descriptive error
        const smallElementResponse = await mcpClient.callTool('inspect_element', {
            css_selector: 'small',  // Small inline element in test page
            url: testUrl,
            sampleBackgroundColor: true
        });

        const smallResult = smallElementResponse.result;
        const smallJsonContent = smallResult.content[2];
        const smallData = parseMarkdownDiagnostic(smallJsonContent.text);
        const smallElement = smallData.elements[0];

        // Should have sampled_background_color field
        assert.ok(smallElement.sampled_background_color, 'Small element should have sampled_background_color field');

        // Should fail with descriptive reason
        if (smallElement.sampled_background_color.background === null) {
            assert.ok(smallElement.sampled_background_color.failureReason, 'Should have failure reason');
            assert.ok(
                smallElement.sampled_background_color.failureReason.includes('too small') ||
                smallElement.sampled_background_color.failureReason.includes('transparent'),
                `Failure reason should mention size or transparency, got: ${smallElement.sampled_background_color.failureReason}`
            );
        }

        // Test 5: Transparent element should return null with transparent reason
        const transparentResponse = await mcpClient.callTool('inspect_element', {
            css_selector: 'body',  // Body typically has transparent background
            url: testUrl,
            sampleBackgroundColor: true
        });

        const transparentResult = transparentResponse.result;
        const transparentJsonContent = transparentResult.content[2];
        const transparentData = parseMarkdownDiagnostic(transparentJsonContent.text);
        const transparentElement = transparentData.elements[0];

        assert.ok(transparentElement.sampled_background_color, 'Transparent element should have sampled_background_color field');

        // Body might be transparent or have a color - just verify proper handling
        if (transparentElement.sampled_background_color.background === null) {
            assert.ok(transparentElement.sampled_background_color.failureReason, 'Null color should have failure reason');
        }

        // Test 6: Element outside viewport should fail gracefully
        const outsideResponse = await mcpClient.callTool('inspect_element', {
            css_selector: '#test-header',
            url: testUrl,
            sampleBackgroundColor: true,
            autoCenter: false  // Don't center, keep element potentially outside viewport
        });

        // Should succeed even if element is off-screen (browser handles scrolling)
        assert.ok(outsideResponse.result, 'Should handle potentially off-screen elements');
        const outsideData = parseMarkdownDiagnostic(outsideResponse.result.content[2].text);
        const outsideElement = outsideData.elements[0];

        // Verify color sampling handled properly (success or graceful failure)
        assert.ok(outsideElement.sampled_background_color, 'Should have sampled_background_color field');
        if (outsideElement.sampled_background_color.background === null) {
            assert.ok(outsideElement.sampled_background_color.failureReason, 'Failed sampling should include reason');
        }

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
