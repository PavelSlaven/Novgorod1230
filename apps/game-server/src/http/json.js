import { serverError } from '../errors.js';

export async function readJsonBody(request, { maxBytes = 1024 * 1024 } = {}) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw serverError('REQUEST_TOO_LARGE', 'JSON request body is too large.', { status: 413 });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw serverError('JSON_INVALID', 'Request body must be valid JSON.', { status: 400 });
  }
}

export function sendJson(response, status, body) {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store'
  });
  response.end(data);
}

export function sendText(response, status, body, contentType) {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  response.writeHead(status, {
    'content-type': contentType,
    'content-length': data.length,
    'cache-control': contentType.startsWith('text/html') ? 'no-store' : 'public, max-age=300'
  });
  response.end(data);
}
