import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve('out');
let networkDisconnected = false;
const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.woff2': 'font/woff2',
};
http.createServer(async (request, response) => {
    try {
        const url = new URL(request.url, 'http://localhost');
        // Local test harness only; this server is never deployed. Disconnecting
        // sockets proves cache-only navigation without WebKit's broken offline emulation.
        if (request.method === 'POST' && url.pathname === '/__test/network') {
            networkDisconnected = url.searchParams.get('offline') === '1';
            response.writeHead(204);
            response.end();
            return;
        }
        if (networkDisconnected) {
            request.socket.destroy();
            return;
        }
        if (!url.pathname.startsWith('/v2/')) {
            response.writeHead(404);
            response.end();
            return;
        }
        let file = path.resolve(root, decodeURIComponent(url.pathname.slice(4)));
        if (!file.startsWith(`${root}/`) && file !== root) {
            throw new Error('Invalid path');
        }
        if ((await stat(file)).isDirectory()) {
            file = path.join(file, 'index.html');
        }
        response.writeHead(200, {
            'Content-Type': types[path.extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        response.end(await readFile(file));
    } catch {
        response.writeHead(404);
        response.end('Not found');
    }
}).listen(3100, '127.0.0.1', () => console.log('V2 preview: http://127.0.0.1:3100/v2/'));
