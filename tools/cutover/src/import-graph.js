import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';

export async function inspectRuntimeImportGraph({ root = process.cwd(), entries = ['apps/game-server/src/modular-entry.js', 'apps/game-web/src/main.js'] } = {}) {
  const packageMap = await workspacePackages(root);
  const queue = entries.map((entry) => resolve(root, entry));
  const visited = new Set();
  const edges = [];
  const legacyImports = [];
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    const text = await readFile(file, 'utf8');
    for (const specifier of importsOf(text)) {
      const target = await resolveImport({ root, from: file, specifier, packageMap });
      edges.push({ from: rel(root, file), specifier, to: target ? rel(root, target) : null });
      if (!target) continue;
      const targetRel = rel(root, target);
      if (targetRel === 'legacy' || targetRel.startsWith('legacy/')) legacyImports.push({ from: rel(root, file), specifier, to: targetRel });
      if (targetRel.startsWith('apps/') || targetRel.startsWith('packages/')) queue.push(target);
    }
  }
  return Object.freeze({
    version: 1,
    schema: 'rus.runtime_import_proof.v1',
    entries: Object.freeze([...entries]),
    file_count: visited.size,
    edge_count: edges.length,
    legacy_import_count: legacyImports.length,
    legacy_imports: Object.freeze(legacyImports),
    files: Object.freeze([...visited].map((file) => rel(root, file)).sort()),
    pass: legacyImports.length === 0
  });
}

async function workspacePackages(root) {
  const map = new Map();
  for (const group of ['packages', 'apps', 'tools']) {
    const base = join(root, group);
    for (const entry of await readdir(base, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory()) continue;
      const dir = join(base, entry.name);
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8').catch(() => '{}'));
      if (pkg.name) map.set(pkg.name, { dir, pkg });
    }
  }
  return map;
}

async function resolveImport({ root, from, specifier, packageMap }) {
  if (specifier.startsWith('node:')) return null;
  if (specifier.startsWith('.') || specifier.startsWith('/')) return resolveFile(specifier.startsWith('/') ? specifier : resolve(dirname(from), specifier));
  if (!specifier.startsWith('@rus/')) return null;
  const parts = specifier.split('/');
  const packageName = `${parts[0]}/${parts[1]}`;
  const record = packageMap.get(packageName);
  if (!record) return null;
  const subpath = parts.length > 2 ? `./${parts.slice(2).join('/')}` : '.';
  const exportsField = record.pkg.exports;
  let target = null;
  if (typeof exportsField === 'string' && subpath === '.') target = exportsField;
  else if (exportsField && typeof exportsField === 'object') target = exportsField[subpath] ?? (subpath === '.' ? exportsField['.'] : null);
  target = typeof target === 'string' ? target : target?.import ?? target?.default ?? null;
  if (!target) target = subpath === '.' ? './src/index.js' : subpath.replace(/^\./u, './src');
  return resolveFile(resolve(record.dir, target));
}

async function resolveFile(base) {
  const candidates = extname(base) ? [base] : [base, `${base}.js`, `${base}.mjs`, join(base, 'index.js')];
  for (const candidate of candidates) if (await stat(candidate).then((value) => value.isFile()).catch(() => false)) return candidate;
  return null;
}

function importsOf(text) {
  return [...text.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)].map((match) => match[2]);
}
function rel(root, path) { return relative(root, path).replaceAll('\\', '/'); }
