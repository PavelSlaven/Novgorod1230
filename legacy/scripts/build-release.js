import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'dist', 'release');

const allowlist = [
  'src',
  'test',
  'DOCUMENTS',
  'README.md',
  'package.json',
  'package-lock.json',
  '.github/workflows/test.yml',
  '.env.example',
  '.gitignore',
  'scripts/release-guard.js',
  'scripts/build-release.js',
  'scripts/zip-release.js',
  'scripts/verify-release-archive.js',
  'scripts/docs-graph-verify.js',
  'scripts/docs-rag-build.js',
  'scripts/docs-rag-verify.js'
];

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const rel of allowlist) {
  const source = resolve(root, rel);
  if (!existsSync(source)) continue;
  const target = resolve(outDir, rel);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

const forbidden = ['.env.local', 'tmp', 'data/temp-', 'data/world-sessions', 'data/regional-summary-cache', 'data/world-catalogs', 'data/new-game-process'];
const manifest = { createdAt: new Date().toISOString(), files: allowlist.filter((rel) => existsSync(resolve(root, rel))), forbidden };
writeFileSync(resolve(outDir, 'RELEASE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

for (const rel of forbidden) {
  const leaked = resolve(outDir, rel);
  if (existsSync(leaked)) {
    console.error(`release build leaked forbidden path: ${rel}`);
    process.exit(1);
  }
}

console.log(`release built at ${outDir}`);
