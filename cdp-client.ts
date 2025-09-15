import { launch } from 'chrome-launcher';
import type { LaunchedChrome } from 'chrome-launcher';
import WebSocket from 'ws';
import { get, request } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import type { BrowserInstance, ChromeTarget, ChromeVersion } from './types.js';

// Global Chrome instance tracking
let chromeInstance: LaunchedChrome | null = null;
let isCleaningUp = false;

async function httpGet(url: string): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const request = get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ 
        status: res.statusCode || 0, 
        data 
      }));
    });
    
    request.on('error', reject);
    request.setTimeout(5000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function httpPut(url: string): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const req = request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'PUT'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ 
        status: res.statusCode || 0, 
        data 
      }));
    });
    
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

async function connectToChrome(port: number, maxRetries = 5): Promise<BrowserInstance> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const versionResponse = await httpGet(`http://localhost:${port}/json/version`);
      if (versionResponse.status === 200) {
        const version = JSON.parse(versionResponse.data) as ChromeVersion;
        const targetsResponse = await httpGet(`http://localhost:${port}/json`);
        const targets = JSON.parse(targetsResponse.data) as ChromeTarget[];
        
        return {
          port,
          version,
          targets,
          chromeInstance
        };
      }
    } catch (error) {
      const err = error as Error;
      if (i === maxRetries - 1) {
        throw new Error(`Failed to connect to Chrome after ${maxRetries} attempts: ${err.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error('Should not reach here');
}

async function cleanup(): Promise<void> {
  if (isCleaningUp || !chromeInstance) {
    return;
  }
  
  isCleaningUp = true;
  
  try {
    await chromeInstance.kill();
  } catch (error) {
    console.error('Failed to kill Chrome gracefully, forcing termination:', error);
    try {
      process.kill(chromeInstance.pid, 'SIGKILL');
    } catch (killError) {
      console.error('Failed to force kill Chrome:', killError);
    }
  } finally {
    chromeInstance = null;
    isCleaningUp = false;
  }
}

// Register cleanup handlers for all exit scenarios
function setupCleanupHandlers(): void {
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  
  signals.forEach(signal => {
    process.on(signal, async () => {
      await cleanup();
      process.exit(0);
    });
  });
  
  process.on('exit', () => {
    // Synchronous cleanup only - async operations won't work here
    if (chromeInstance && !isCleaningUp) {
      try {
        process.kill(chromeInstance.pid, 'SIGTERM');
      } catch (error) {
        // Best effort cleanup
      }
    }
  });
  
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await cleanup();
    process.exit(1);
  });
  
  process.on('unhandledRejection', async (reason) => {
    console.error('Unhandled rejection:', reason);
    await cleanup();
    process.exit(1);
  });
}

// Initialize cleanup handlers once
setupCleanupHandlers();

export async function ensureChromeWithCDP(): Promise<BrowserInstance> {
  // If we already have a Chrome instance, reuse it
  if (chromeInstance) {
    try {
      return await connectToChrome(chromeInstance.port);
    } catch (error) {
      await cleanup();
    }
  }

  // Always clear the URL map when launching a new Chrome instance
  urlToTargetMap.clear();
  
  try {
    // Create a unique user data directory for this Chrome instance
    const userDataDir = join(tmpdir(), `chrome-sargel-${randomBytes(8).toString('hex')}`);
    
    // Ensure the directory exists with proper permissions to prevent ENOENT in chrome-launcher
    mkdirSync(userDataDir, { recursive: true, mode: 0o700 });
    
    // Pre-create log files to prevent ENOENT errors when chrome-launcher tries to open them
    writeFileSync(join(userDataDir, 'chrome-out.log'), '', { flag: 'a' });
    writeFileSync(join(userDataDir, 'chrome-err.log'), '', { flag: 'a' });
    
    chromeInstance = await launch({
      port: 0, // Let Chrome choose an available port
      chromeFlags: [
        // Note: chrome-launcher automatically adds --headless if HEADLESS env var is set
        '--no-first-run',                    // Skip first run wizard
        '--no-default-browser-check',        // Skip default browser prompt  
        '--disable-default-apps',            // Don't install default apps
        '--enable-automation',               // Tell Chrome it's automated
        '--disable-features=ChromeWhatsNewUI', // No "What's New" popups
        '--disable-extensions',              // No extensions
        '--disable-component-extensions-with-background-pages', // No background extensions
        '--disable-background-networking',   // Reduce network activity
        '--disable-sync',                    // No sync prompts
        '--disable-translate',               // No translation bars
        '--disable-gpu',                     // GPU compatibility
        '--no-sandbox',                      // Required for some server environments
        '--disable-dev-shm-usage',          // Memory fix for containers
        '--window-size=1280,1024'           // Set window size
      ],
      userDataDir,                          // Use unique temp directory
      connectionPollInterval: 500,          // Check every 500ms
      maxConnectionRetries: 20,             // Try up to 10 seconds
      handleSIGINT: false                   // We'll handle signals ourselves
    });
    
    // Connect to the launched Chrome instance
    return await connectToChrome(chromeInstance.port);
    
  } catch (error) {
    const err = error as Error;
    if (err.message.includes('spawn')) {
      throw new Error('Chrome not found. Please install Google Chrome or Chromium.');
    }
    throw new Error(`Failed to launch Chrome: ${err.message}`);
  }
}

// Keep a map of URL to target ID for tab reuse
const urlToTargetMap = new Map<string, string>();

async function waitForConnection(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, 10000); // 10 second timeout
    
    ws.on('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket connection failed: ${error.message}`));
    });
  });
}

export async function connectToTarget(browser: BrowserInstance, url: string): Promise<WebSocket> {
  // Refresh targets to get current state
  const targetsResponse = await httpGet(`http://localhost:${browser.port}/json`);
  browser.targets = JSON.parse(targetsResponse.data) as ChromeTarget[];
  
  let target: ChromeTarget | undefined;
  
  // Check if we already have a tab for this URL
  if (urlToTargetMap.has(url)) {
    const targetId = urlToTargetMap.get(url)!;
    target = browser.targets.find(t => t.id === targetId);
    
    // If target still exists and is at the right URL, reuse it
    if (target && target.url === url) {
      // Reuse the existing tab
    } else {
      // Target was closed or navigated away, remove from map
      urlToTargetMap.delete(url);
      target = undefined;
    }
  }
  
  // Create new tab if needed
  if (!target) {
    const newTabResponse = await httpPut(`http://localhost:${browser.port}/json/new`);
    const newTab = JSON.parse(newTabResponse.data) as ChromeTarget;
    
    // Refresh targets to include the new tab
    const refreshedResponse = await httpGet(`http://localhost:${browser.port}/json`);
    browser.targets = JSON.parse(refreshedResponse.data) as ChromeTarget[];
    target = browser.targets.find(t => t.id === newTab.id);
    
    if (!target) {
      throw new Error('Failed to create new tab');
    }
    
    urlToTargetMap.set(url, target.id);
  }
  
  // Connect to WebSocket
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await waitForConnection(ws);
  
  // Navigate to URL if not already there
  if (target.url !== url) {
    const cdp = new CDPClient(ws);
    
    // Enable all required domains BEFORE navigation
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await cdp.send('Overlay.enable');
    
    await cdp.send('Page.navigate', { url });
    
    // Wait for navigation to complete
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Navigation timeout')), 30000);
      let loadEventFired = false;
      let domContentLoaded = false;
      
      const checkComplete = () => {
        if (loadEventFired && domContentLoaded) {
          clearTimeout(timeout);
          // Add small delay for file:// URLs to ensure DOM is stable
          setTimeout(() => resolve(undefined), url.startsWith('file://') ? 1000 : 100);
        }
      };
      
      // Use the CDP client's underlying WebSocket to listen for events
      const websocket = (cdp as any).ws as WebSocket;
      websocket.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.method === 'Page.loadEventFired') {
          loadEventFired = true;
          checkComplete();
        } else if (message.method === 'Page.domContentEventFired') {
          domContentLoaded = true;
          checkComplete();
        }
      });
      
      // Fallback: continue even if events don't fire within reasonable time
      setTimeout(() => {
        clearTimeout(timeout);
        resolve(undefined);
      }, 8000);
    });
  }
  
  return ws;
}

export class CDPClient {
  private ws: WebSocket;
  private requestId = 0;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on('message', this.handleMessage.bind(this));
  }

  private handleMessage(data: WebSocket.Data) {
    const message = JSON.parse(data.toString());
    
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(`CDP Error: ${message.error.message}`));
      } else {
        resolve(message.result);
      }
    }
  }

  async send(method: string, params?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });
      
      const message = { id, method, params };
      this.ws.send(JSON.stringify(message));
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`CDP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async setInlineStyles(nodeId: number, styles: Record<string, string>): Promise<void> {
    const styleText = Object.entries(styles)
      .map(([property, value]) => `${property}: ${value}`)
      .join('; ');
    
    await this.send('DOM.setAttributeValue', {
      nodeId,
      name: 'style',
      value: styleText
    });
  }

  close() {
    this.ws.close();
  }
}