import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const errors = [];
const zipArgIndex = process.argv.indexOf('--zip');
const zipPath = zipArgIndex >= 0 ? resolve(process.argv[zipArgIndex + 1] ?? '') : null;

const SUBMISSION_FORBIDDEN_PATTERNS = [
  /^\.env\.local$/i,
  /^\.env(?:\.|$)/i,
  /^\.git(?:\/|$)/i,
  /^node_modules(?:\/|$)/i,
  /^tmp(?:\/|$)/i,
  /^data\/temp-[^/]+\.json$/i,
  /^data(?:\/|$)/i,
  /^dist(?:\/|$)/i,
  /\.log$/i,
  /\.png$/i,
  /requestRaw|responseRaw|sourceDossier/i
];

function run(command) {
  try {
    return execSync(command, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

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

function matchesSubmissionForbidden(entry) {
  const normalized = normalizeEntry(entry);
  return SUBMISSION_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(normalized));
}

function verifySubmissionZip(path) {
  if (!existsSync(path)) {
    fail(`submission archive not found: ${path}`);
    return;
  }
  const entries = listZipEntries(path);
  if (entries.length === 0) {
    fail('submission archive is empty');
    return;
  }
  for (const entry of entries) {
    if (matchesSubmissionForbidden(entry)) {
      fail(`forbidden path in submission archive: ${entry}`);
    }
  }
}

if (zipPath) {
  verifySubmissionZip(zipPath);
  if (errors.length) {
    console.error('release-guard failed:\n' + errors.map((item) => `- ${item}`).join('\n'));
    process.exit(1);
  }
  console.log(`release-guard zip ok: ${zipPath}`);
  process.exit(0);
}

const tracked = run('git ls-files -z').split('\0').filter(Boolean);

for (const path of tracked) {
  if (path === '.env.local' || path.startsWith('.env.') && path !== '.env.example') {
    fail(`tracked secret file: ${path}`);
  }
  if (/^data\/new-game-process\/.*\.html$/i.test(path)) {
    fail(`tracked runtime artifact: ${path}`);
  }
}

if (existsSync(resolve(root, '.env.local')) && process.env.ALLOW_LOCAL_SECRETS !== '1') {
  fail('.env.local exists in release workspace');
}

for (const dir of ['src', 'test']) {
  const base = resolve(root, dir);
  if (!existsSync(base)) continue;
  walk(base, (filePath) => {
    if (!/\.(js|html|md|json)$/i.test(filePath)) return;
    const rel = filePath.slice(root.length + 1).replace(/\\/g, '/');
    if (rel === '.env.example' || rel.startsWith('test/')) return;
    const text = readFileSync(filePath, 'utf8');
    if (/DEEPSEEK_API_KEY\s*=\s*[^\s#]+/i.test(text) && !/your[_-]?key|example|placeholder/i.test(text)) {
      fail(`possible committed API key in ${rel}`);
    }
    if (/requestRaw|responseRaw|sourceDossier/.test(text) && /\.html$/i.test(rel)) {
      fail(`raw diagnostic marker in tracked file: ${rel}`);
    }
  });
}

for (const path of tracked) {
  if (!/^data\/new-game-process\/.*\.html$/i.test(path)) continue;
  const text = readFileSync(resolve(root, path), 'utf8');
  if (/requestRaw|responseRaw|sourceDossier/.test(text)) {
    fail(`tracked raw diagnostic artifact: ${path}`);
  }
}

if (errors.length) {
  console.error('release-guard failed:\n' + errors.map((item) => `- ${item}`).join('\n'));
  process.exit(1);
}

console.log('release-guard ok');

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git') continue;
      walk(full, onFile);
    } else {
      onFile(full);
    }
  }
}
