#!/usr/bin/env node

import { createMCPClient } from '../test/helpers/mcp-client.js';
import { createTestServer } from '../test/helpers/chrome-test-server.js';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

async function captureScreenshots() {
  let testServer = null;
  let mcpClient = null;
  
  try {
    // Clean up any existing Chrome processes
    try {
      await execAsync('pkill -f "remote-debugging-port=9222"').catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      // Ignore cleanup errors
    }

    // Start test server
    testServer = await createTestServer();
    const testUrl = testServer.getUrl();
    console.log(`Test page available at: ${testUrl}`);

    // Start MCP server
    const serverPath = join(projectRoot, 'dist', 'index.js');
    mcpClient = await createMCPClient(serverPath);
    
    console.log('MCP client connected, waiting for Chrome...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const screenshots = [
      {
        name: 'hero-screenshot',
        selector: '#test-header',
        url: testUrl
      },
      {
        name: 'single-element-inspection', 
        selector: '#precise-box',
        url: testUrl
      },
      {
        name: 'multi-element-layout',
        selector: '.nested-item',
        url: testUrl,
        options: { limit: 3 }
      },
      {
        name: 'css-edits-before',
        selector: '#primary-button',
        url: testUrl
      },
      {
        name: 'css-edits-after',
        selector: '#primary-button', 
        url: testUrl,
        options: {
          css_edits: {
            'margin-left': '32px',
            'margin-top': '16px',
            'background-color': '#28a745'
          }
        }
      }
    ];

    let successCount = 0;
    for (const screenshot of screenshots) {
      try {
        console.log(`Capturing ${screenshot.name}...`);
        
        const response = await mcpClient.callTool('inspect_element', {
          css_selector: screenshot.selector,
          url: screenshot.url,
          ...(screenshot.options || {})
        });

        if (response.error) {
          throw new Error(`MCP Error: ${response.error.message}`);
        }

        // Find the image content
        const imageContent = response.result.content.find(item => item.type === 'image');
        if (!imageContent || !imageContent.data) {
          throw new Error('No image data found in response');
        }

        // Save as PNG
        const imageBuffer = Buffer.from(imageContent.data, 'base64');
        const filename = join(projectRoot, 'docs', 'images', `${screenshot.name}.png`);
        writeFileSync(filename, imageBuffer);
        
        console.log(`✅ Saved ${screenshot.name}.png (${imageBuffer.length} bytes)`);
        successCount++;

      } catch (error) {
        console.error(`❌ Failed to capture ${screenshot.name}:`, error.message);
      }
      
      // Delay between captures
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`\n✅ Successfully captured ${successCount}/${screenshots.length} screenshots`);

  } catch (error) {
    console.error('❌ Screenshot capture failed:', error);
  } finally {
    if (mcpClient) {
      await mcpClient.stop();
    }
    if (testServer) {
      await testServer.stop();
    }
    
    // Final cleanup
    try {
      await execAsync('pkill -f "Google Chrome"').catch(() => {});
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

captureScreenshots().catch(console.error);