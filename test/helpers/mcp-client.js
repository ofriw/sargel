import { spawn } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';
import { EventEmitter } from 'events';

export class MCPClient extends EventEmitter {
    constructor(command, args = []) {
        super();
        this.command = command;
        this.args = args;
        this.process = null;
        this.nextId = 1;
        this.pendingRequests = new Map();
        this.isInitialized = false;
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.process = spawn(this.command, this.args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let buffer = '';
            
            this.process.stdout.on('data', (data) => {
                buffer += data.toString();
                
                // Process complete JSON-RPC messages (newline delimited)
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep the incomplete line in buffer
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const message = JSON.parse(line.trim());
                            this.handleMessage(message);
                        } catch (error) {
                            console.error('Failed to parse JSON:', line, error);
                        }
                    }
                }
            });

            this.process.stderr.on('data', (data) => {
                // Forward stderr for debugging
                console.error('MCP Server stderr:', data.toString());
            });

            this.process.on('error', (error) => {
                reject(error);
            });

            this.process.on('exit', (code, signal) => {
                if (code !== 0) {
                    console.error(`MCP server exited with code ${code}, signal ${signal}`);
                }
                this.emit('exit', code, signal);
            });

            // Start the MCP handshake
            this.performHandshake()
                .then(() => resolve(this))
                .catch(reject);
        });
    }

    async performHandshake() {
        // Step 1: Send initialize request
        const initResponse = await this.sendRequest('initialize', {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: {
                name: 'test-client',
                version: '1.0.0'
            }
        });

        if (!initResponse.result) {
            throw new Error('Initialize request failed');
        }

        // Step 2: Send initialized notification
        await this.sendNotification('notifications/initialized', {});
        
        this.isInitialized = true;
        this.emit('initialized');
    }

    handleMessage(message) {
        if (message.id && this.pendingRequests.has(message.id)) {
            // This is a response to a request we sent
            const { resolve, reject, timeout } = this.pendingRequests.get(message.id);
            this.pendingRequests.delete(message.id);
            
            clearTimeout(timeout);
            
            if (message.error) {
                reject(new Error(`RPC Error ${message.error.code}: ${message.error.message}`));
            } else {
                resolve(message);
            }
        } else if (message.method) {
            // This is a notification from the server
            this.emit('notification', message);
        }
    }

    sendRequest(method, params, timeoutMs = 60000) {
        const id = this.nextId++;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request timeout: ${method}`));
            }, timeoutMs);

            this.pendingRequests.set(id, { resolve, reject, timeout });

            const request = {
                jsonrpc: '2.0',
                id,
                method,
                params
            };

            this.sendMessage(request);
        });
    }

    sendNotification(method, params) {
        const notification = {
            jsonrpc: '2.0',
            method,
            params
        };

        this.sendMessage(notification);
    }

    sendMessage(message) {
        if (!this.process || !this.process.stdin.writable) {
            throw new Error('MCP server process not available');
        }

        const messageStr = JSON.stringify(message) + '\n';
        this.process.stdin.write(messageStr);
    }

    async listTools() {
        if (!this.isInitialized) {
            throw new Error('Client not initialized');
        }

        return await this.sendRequest('tools/list', {});
    }

    async callTool(name, args) {
        if (!this.isInitialized) {
            throw new Error('Client not initialized');
        }

        return await this.sendRequest('tools/call', {
            name,
            arguments: args
        });
    }

    async stop() {
        if (this.process) {
            this.process.kill();
            
            return new Promise((resolve) => {
                this.process.on('exit', () => {
                    resolve();
                });
                
                // Force kill after 5 seconds
                setTimeout(() => {
                    if (this.process && !this.process.killed) {
                        this.process.kill('SIGKILL');
                    }
                    resolve();
                }, 5000);
            });
        }
    }
}

export async function createMCPClient(serverPath, serverArgs = []) {
    const client = new MCPClient('node', [serverPath, ...serverArgs]);
    await client.start();
    return client;
}