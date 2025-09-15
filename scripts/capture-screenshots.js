#!/usr/bin/env node

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Ensure images directory exists
mkdirSync(join(projectRoot, 'docs', 'images'), { recursive: true });

class MCPClient {
  constructor() {
    this.requestId = 1;
    this.mcpProcess = null;
    this.responses = new Map();
    this.pendingRequests = new Map();
  }

  async start() {
    const serverPath = join(projectRoot, 'dist', 'index.js');
    this.mcpProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: projectRoot
    });

    // Handle stdout (MCP responses)
    this.mcpProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const message = JSON.parse(line);
          console.log('Received:', JSON.stringify(message, null, 2));
          if (message.id && this.pendingRequests.has(message.id)) {
            const resolve = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);
            resolve(message);
          }
        } catch (e) {
          console.log('Non-JSON line:', line);
        }
      }
    });

    this.mcpProcess.stderr.on('data', (data) => {
      console.log('MCP Server:', data.toString());
    });

    // Initialize MCP connection
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'screenshot-capture', version: '1.0.0' }
    });

    await this.sendRequest('initialized', {});
  }

  async sendRequest(method, params = {}) {
    const id = this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, resolve);
      
      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for method: ${method}`));
        }
      }, 45000);

      this.mcpProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  async callTool(name, arguments_) {
    return this.sendRequest('tools/call', {
      name,
      arguments: arguments_
    });
  }

  async stop() {
    if (this.mcpProcess) {
      this.mcpProcess.kill();
    }
  }
}

async function captureScreenshot(client, name, selector, url, options = {}) {
  console.log(`Capturing ${name}...`);
  
  try {
    const response = await client.callTool('inspect_element', {
      css_selector: selector,
      url,
      ...options
    });

    if (response.error) {
      throw new Error(`MCP Error: ${response.error.message}`);
    }

    // Find the image content in the response
    const imageContent = response.result.content.find(item => item.type === 'image');
    if (!imageContent || !imageContent.data) {
      throw new Error('No image data found in response');
    }

    // Convert base64 to buffer and save as PNG
    const imageBuffer = Buffer.from(imageContent.data, 'base64');
    const filename = join(projectRoot, 'docs', 'images', `${name}.png`);
    writeFileSync(filename, imageBuffer);
    
    console.log(`✅ Saved ${name}.png (${imageBuffer.length} bytes)`);
    return true;

  } catch (error) {
    console.error(`❌ Failed to capture ${name}:`, error.message);
    return false;
  }
}

async function main() {
  console.log('Starting MCP screenshot capture...');
  
  const client = new MCPClient();
  const testPageUrl = `file://${projectRoot}/test/fixtures/test-page.html`;
  const cssGroupsUrl = `file://${projectRoot}/test/fixtures/css-groups-test.html`;

  try {
    await client.start();
    console.log('MCP client connected');
    
    // Wait a moment for the server to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    const screenshots = [
      // Hero screenshot - basic inspection
      {
        name: 'hero-screenshot',
        selector: '#test-header', 
        url: testPageUrl,
        options: {}
      },
      
      // Single element inspection with precise box
      {
        name: 'single-element-inspection',
        selector: '#precise-box',
        url: testPageUrl,
        options: {}
      },
      
      // Multi-element layout
      {
        name: 'multi-element-layout', 
        selector: '.nested-item',
        url: testPageUrl,
        options: { limit: 3 }
      },
      
      // CSS edits before (original state)
      {
        name: 'css-edits-before',
        selector: '#primary-button',
        url: testPageUrl,
        options: {}
      },
      
      // CSS edits after (with modifications)  
      {
        name: 'css-edits-after',
        selector: '#primary-button',
        url: testPageUrl,
        options: {
          css_edits: {
            'margin-left': '32px',
            'margin-top': '16px',
            'background-color': '#28a745'
          }
        }
      },
      
      // Property groups filtering
      {
        name: 'property-groups-filter',
        selector: '.test-element',
        url: cssGroupsUrl,
        options: {
          property_groups: ['layout', 'colors']
        }
      }
    ];

    let successCount = 0;
    for (const screenshot of screenshots) {
      const success = await captureScreenshot(
        client,
        screenshot.name,
        screenshot.selector, 
        screenshot.url,
        screenshot.options
      );
      if (success) successCount++;
      
      // Small delay between captures
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n✅ Successfully captured ${successCount}/${screenshots.length} screenshots`);
    
  } catch (error) {
    console.error('❌ Screenshot capture failed:', error);
    process.exit(1);
  } finally {
    await client.stop();
  }
}

main().catch(console.error);