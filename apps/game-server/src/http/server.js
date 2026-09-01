import { createServer } from 'node:http';
import { createHttpHandler } from './handler.js';
import { errorEnvelope } from './contracts.js';

export function createGameHttpServer(options = {}) {
  const handler = createHttpHandler(options);
  return createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      if (!response.headersSent) {
        const failure = errorEnvelope(error);
        response.writeHead(failure.status, { 'content-type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(failure.body));
      }
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
