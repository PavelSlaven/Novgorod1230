import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const MIME = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp'
});

export function createStaticAssetResolver({ webRoot, contractsRoot = null } = {}) {
  const root = resolve(webRoot);
  const sharedRoot = contractsRoot ? resolve(contractsRoot) : null;
  return Object.freeze({
    async read(pathname) {
      const route = routeToFile(pathname);
      if (!route) return null;
      const selectedRoot = route.shared ? sharedRoot : root;
      if (!selectedRoot) return null;
      const target = resolve(selectedRoot, route.relative);
      if (target !== selectedRoot && !target.startsWith(`${selectedRoot}${sep}`)) return null;
      const body = await readFile(target).catch(() => null);
      if (body == null) return null;
      return Object.freeze({ body, contentType: MIME[extname(target)] ?? 'application/octet-stream' });
    }
  });
}

function routeToFile(pathname) {
  if (pathname === '/') return { relative: 'public/index.html', shared: false };
  if (pathname === '/portrait-lab' || pathname === '/portrait-lab/') {
    return { relative: 'public/portrait-lab.html', shared: false };
  }
  if (pathname === '/styles.css') return { relative: 'public/styles.css', shared: false };
  if (pathname === '/portrait-lab.css') {
    return { relative: 'public/portrait-lab.css', shared: false };
  }
  if (pathname.startsWith('/assets/')) {
    const assetPath = pathname.slice('/assets/'.length);
    if (!assetPath || assetPath.includes('\\') || assetPath.split('/').some((segment) => segment === '.' || segment === '..')) {
      return null;
    }
    return { relative: `public/assets/${assetPath}`, shared: false };
  }
  if (pathname.startsWith('/src/')) {
    return { relative: pathname.slice(1), shared: false };
  }
  if (pathname === '/packages/contracts/src/portrait-spec-v1.js') {
    return { relative: 'portrait-spec-v1.js', shared: true };
  }
  return null;
}
