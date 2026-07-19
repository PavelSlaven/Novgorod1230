import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));

export const canonicalJson = (value) => {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort(compareUtf8).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  throw new TypeError('canonical JSON accepts only JSON values');
};

export const canonicalJsonBytes = (value) => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
export const manifestDigest = (manifest) => sha256(canonicalJsonBytes(manifest));

export function validateCanonicalEntries(entries) {
  if (!Array.isArray(entries)) throw new TypeError('manifest entries must be an array');
  const seen = new Set();
  const folded = new Map();
  let previous;
  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || entry.path !== entry.path.normalize('NFC') || !entry.path || entry.path.startsWith('/') || entry.path.includes('\\') || entry.path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error(`invalid manifest path: ${entry?.path}`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '')) throw new Error(`invalid manifest row: ${entry.path}`);
    if (seen.has(entry.path)) throw new Error(`duplicate manifest path: ${entry.path}`);
    seen.add(entry.path);
    const foldedPath = entry.path.toLocaleLowerCase('en-US');
    if (folded.has(foldedPath)) throw new Error(`case-colliding manifest paths: ${folded.get(foldedPath)} / ${entry.path}`);
    folded.set(foldedPath, entry.path);
    if (previous !== undefined && compareUtf8(previous, entry.path) >= 0) throw new Error(`manifest paths are not UTF-8 byte sorted: ${entry.path}`);
    previous = entry.path;
  }
  return true;
}

const normalizeRelativePath = (root, candidate) => {
  const path = relative(root, candidate).split(sep).join('/');
  if (!path || path.startsWith('../') || path === '..' || path.includes('\\') || path !== path.normalize('NFC')) throw new Error(`unsafe or non-canonical path: ${path || candidate}`);
  return path;
};

/** Builds the exact payload set. Manifest control files are deliberately excluded. */
export async function createCanonicalManifest(root, { excluded = ['manifest.json', 'manifest.sha256'] } = {}) {
  const packageRoot = resolve(root);
  const excludedSet = new Set(excluded);
  const rows = [];
  const collisions = new Map();
  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const candidate = resolve(directory, entry.name);
      const path = normalizeRelativePath(packageRoot, candidate);
      const stat = await lstat(candidate);
      if (stat.isSymbolicLink()) throw new Error(`symlink is forbidden: ${path}`);
      if (stat.isDirectory()) { await walk(candidate); continue; }
      if (!stat.isFile()) throw new Error(`non-regular file is forbidden: ${path}`);
      if (excludedSet.has(path)) continue;
      const folded = path.toLocaleLowerCase('en-US');
      const existing = collisions.get(folded);
      if (existing && existing !== path) throw new Error(`case-colliding paths: ${existing} / ${path}`);
      collisions.set(folded, path);
      const bytes = await readFile(candidate);
      rows.push({ path, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  await walk(packageRoot);
  rows.sort((left, right) => compareUtf8(left.path, right.path));
  return Object.freeze(rows);
}

export async function verifyCanonicalManifest(root, manifest, options) {
  const actual = await createCanonicalManifest(root, options);
  const expected = manifest?.files;
  if (!Array.isArray(expected)) return Object.freeze({ ok: false, error: 'manifest.files is required' });
  try { validateCanonicalEntries(expected); }
  catch (error) { return Object.freeze({ ok: false, error: String(error.message), actual, expected }); }
  const expectedBytes = canonicalJsonBytes(expected);
  const actualBytes = canonicalJsonBytes(actual);
  return Object.freeze({ ok: expectedBytes.equals(actualBytes), actual, expected, digest: manifestDigest(manifest) });
}
