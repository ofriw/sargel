import http from 'http';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class TestServer {
    constructor(port = 0, fixturePath = null) {
        this.port = port;
        this.fixturePath = fixturePath;
        this.server = null;
        this.actualPort = null;
    }

    async start() {
        return new Promise((resolve, reject) => {
            this.server = http.createServer(async (req, res) => {
                try {
                    // Serve custom fixture or default test-page.html
                    const filePath = this.fixturePath || join(__dirname, '..', 'fixtures', 'test-page.html');
                    const content = await readFile(filePath, 'utf-8');
                    
                    res.writeHead(200, {
                        'Content-Type': 'text/html',
                        'Cache-Control': 'no-cache'
                    });
                    res.end(content);
                } catch (error) {
                    console.error('Error serving test page:', error);
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Internal Server Error');
                }
            });

            this.server.on('error', reject);

            this.server.listen(this.port, 'localhost', () => {
                this.actualPort = this.server.address().port;
                console.log(`Test server started on http://localhost:${this.actualPort}`);
                resolve(this.actualPort);
            });
        });
    }

    getUrl() {
        if (!this.actualPort) {
            throw new Error('Server not started');
        }
        return `http://localhost:${this.actualPort}`;
    }

    async stop() {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    console.log('Test server stopped');
                    resolve();
                });
            });
        }
    }
}

export async function createTestServer(options = {}) {
    const { port = 0, fixturePath = null } = options;
    const server = new TestServer(port, fixturePath);
    await server.start();
    return server;
}