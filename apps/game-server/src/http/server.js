import { createServer } from 'node:http';
import { createHttpHandler } from './handler.js';

export function createGameHttpServer(options = {}) {
  const handler = createHttpHandler(options);
  return createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ version: 1, schema: 'rus_api_error', ok: false, error: { code: 'UNHANDLED_SERVER_ERROR', message: error.message } }));
    });
  });
}

export async function listen(server, { host, port } = {}) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server.address();
}
