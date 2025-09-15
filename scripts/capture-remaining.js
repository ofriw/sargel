#!/usr/bin/env node

import { createMCPClient } from '../test/helpers/mcp-client.js';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import http from 'http';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Simple HTTP server for CSS groups test
function createSimpleServer() {
  const cssGroupsHtml = readFileSync(join(projectRoot, 'test/fixtures/css-groups-test.html'), 'utf-8');
  
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(cssGroupsHtml);
  });

  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      const url = `http://localhost:${port}`;
      resolve({ 
        url, 
        stop: () => server.close() 
      });
    });
  });
}

async function captureRemainingScreenshots() {
  let testServer = null;
  let mcpClient = null;
  
  try {
    // Clean up any existing Chrome
    try {
      await execAsync('pkill -f "remote-debugging-port=9222"').catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      // Ignore cleanup errors
    }

    // Start simple server for CSS groups test
    testServer = await createSimpleServer();
    console.log(`CSS groups test page at: ${testServer.url}`);

    // Start MCP server
    const serverPath = join(projectRoot, 'dist', 'index.js');
    mcpClient = await createMCPClient(serverPath);
    
    console.log('MCP client connected, waiting for Chrome...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    const screenshots = [
      {
        name: 'property-groups-filter',
        selector: '#complex-element',
        url: testServer.url,
        options: {
          property_groups: ['layout', 'colors']
        }
      },
      {
        name: 'box-model-visual', 
        selector: '#box-model',
        url: testServer.url,
        options: {}
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

    console.log(`\n✅ Successfully captured ${successCount}/${screenshots.length} additional screenshots`);

  } catch (error) {
    console.error('❌ Screenshot capture failed:', error);
  } finally {
    if (mcpClient) {
      await mcpClient.stop();
    }
    if (testServer) {
      testServer.stop();
    }
    
    // Final cleanup
    try {
      await execAsync('pkill -f "Google Chrome"').catch(() => {});
    } catch (error) {
      // Ignore cleanup errors  
    }
  }
}

captureRemainingScreenshots().catch(console.error);