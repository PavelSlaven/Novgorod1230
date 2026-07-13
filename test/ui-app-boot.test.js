import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appPath = resolve(root, 'src/ui/app.js');
const sceneHintsPath = resolve(root, 'src/ui/scene-hints.js');
const indexPath = resolve(root, 'src/ui/index.html');

function resolveImport(fromPath, spec) {
  const parts = fromPath.split('/').filter(Boolean).slice(0, -1);
  for (const seg of spec.split('/')) {
    if (seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

function collectRelativeImports(source, fromPath, out = new Set()) {
  const re = /from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = re.exec(source))) {
    const spec = match[1];
    if (!spec.startsWith('.')) continue;
    const url = resolveImport(fromPath, spec);
    if (!out.has(url)) out.add(url);
  }
  return out;
}

test('app.js imports humanizeSceneAnchor used during initial render', () => {
  const app = readFileSync(appPath, 'utf8');
  const sceneHints = readFileSync(sceneHintsPath, 'utf8');

  assert.match(app, /humanizeSceneAnchor/);
  assert.match(app, /import\s*\{[^}]*humanizeSceneAnchor[^}]*\}\s*from\s*'\.\/scene-hints\.js'/);
  assert.match(sceneHints, /export function humanizeSceneAnchor/);
});

test('index bootstrap placeholder injects JSON without breaking assignment target', () => {
  const html = readFileSync(indexPath, 'utf8');
  assert.match(html, /window\.__INITIAL_STATE__\s*=\s*__UI_BOOTSTRAP__/);
  assert.doesNotMatch(html, /__INITIAL_STATE__\s*;/);

  const serialized = '{"meta":{"hasSavedGame":true}}';
  const rendered = html.replace('__UI_BOOTSTRAP__', serialized);

  assert.match(rendered, /window\.__INITIAL_STATE__\s*=\s*\{"meta":\{"hasSavedGame":true\}\}/);
  assert.doesNotMatch(rendered, /window\.\{"meta"/);
  assert.doesNotMatch(rendered, /__UI_BOOTSTRAP__/);
});

test('app.js browser import graph stays within served ui and world paths', () => {
  const app = readFileSync(appPath, 'utf8');
  const queue = collectRelativeImports(app, '/app.js');
  const visited = new Set(['/app.js']);

  while (queue.size) {
    const url = queue.values().next().value;
    queue.delete(url);
    if (visited.has(url)) continue;
    visited.add(url);

    const diskPath = url.startsWith('/world/')
      ? resolve(root, 'src', url.slice(1))
      : resolve(root, 'src/ui', url.slice(1));
    const source = readFileSync(diskPath, 'utf8');
    for (const dep of collectRelativeImports(source, url)) {
      if (!visited.has(dep)) queue.add(dep);
    }
  }

  assert.deepEqual(
    [...visited].sort(),
    [
      '/app.js',
      '/diagnostics-visibility.js',
      '/graph-viewport.js',
      '/inventory-view.js',
      '/journal-render.js',
      '/knowledge-graph.js',
      '/map-panel.js',
      '/people-view.js',
      '/property-view.js',
      '/route-view.js',
      '/scene-hints.js',
      '/vitals.js',
      '/world/item-access.js'
    ]
  );
});
