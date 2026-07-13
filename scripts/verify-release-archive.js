import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const zipPath = resolve(root, 'dist', 'release.zip');
const errors = [];

const FORBIDDEN_PATTERNS = [
  /^\.env\.local$/i,
  /^\.env$/i,
  /^\.git(?:\/|$)/i,
  /^node_modules(?:\/|$)/i,
  /^tmp(?:\/|$)/i,
  /^data\/world-sessions(?:\/|$)/i,
  /^data\/world-catalogs(?:\/|$)/i,
  /^data\/regional-summary-cache(?:\/|$)/i,
  /^data\/new-game-process(?:\/|$)/i,
  /^data\/save\.json$/i,
  /^data\/temp-[^/]+\.json$/i,
  /^dist(?:\/|$)/i
];

function fail(message) {
  errors.push(message);
}

function normalizeEntry(entry) {
  return String(entry ?? '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/u, '');
}

function listZipEntries(path) {
  if (process.platform === 'win32') {
    const escaped = path.replace(/'/g, "''");
    const out = execSync(
      `powershell -NoProfile -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::OpenRead('${escaped}').Entries | ForEach-Object { $_.FullName }"`,
      { encoding: 'utf8' }
    );
    return out.trim().split(/\r?\n/u).map(normalizeEntry).filter(Boolean);
  }
  const out = execSync(`unzip -Z1 "${path}"`, { encoding: 'utf8' });
  return out.trim().split(/\r?\n/u).map(normalizeEntry).filter(Boolean);
}

function matchesForbidden(entry) {
  const normalized = normalizeEntry(entry);
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(normalized));
}

const target = process.argv[2] ? resolve(process.argv[2]) : zipPath;
if (!existsSync(target)) {
  console.error(`release archive not found: ${target}`);
  process.exit(1);
}

const entries = listZipEntries(target);
if (entries.length === 0) {
  fail('archive is empty');
}

for (const entry of entries) {
  if (matchesForbidden(entry)) {
    fail(`forbidden path in archive: ${entry}`);
  }
}

if (!entries.some((entry) => /^src\//i.test(entry) || entry === 'src')) {
  fail('archive missing src/');
}

if (errors.length) {
  console.error('release verify failed:\n' + errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log(`release verify ok (${entries.length} entries)`);
