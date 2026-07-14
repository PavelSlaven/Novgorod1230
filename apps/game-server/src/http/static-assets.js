import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
});

export function createStaticAssetResolver({ webRoot } = {}) {
  const root = resolve(webRoot);
  return Object.freeze({
    async read(pathname) {
      const relative = routeToFile(pathname);
      if (!relative) return null;
      const target = resolve(root, relative);
      if (target !== root && !target.startsWith(`${root}${sep}`)) return null;
      const body = await readFile(target).catch(() => null);
      if (body == null) return null;
      return Object.freeze({ body, contentType: MIME[extname(target)] ?? 'application/octet-stream' });
    }
  });
}

function routeToFile(pathname) {
  if (pathname === '/') return 'public/index.html';
  if (pathname === '/styles.css') return 'public/styles.css';
  if (pathname.startsWith('/src/')) return pathname.slice(1);
  return null;
}
