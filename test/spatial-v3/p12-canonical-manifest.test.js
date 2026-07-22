import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { canonicalJsonBytes, createCanonicalManifest, validateCanonicalEntries, verifyCanonicalManifest } from '../../tools/spatial-v3/p12-canonical-manifest.mjs';

test('P12 canonical JSON is UTF-8/LF and object-order independent', () => {
  assert.deepEqual(canonicalJsonBytes({ z: 'я', a: [true, null] }), Buffer.from('{"a":[true,null],"z":"я"}\n', 'utf8'));
});
test('P12 canonical entries reject traversal, NFD, case collisions and non-byte sorting', () => {
  const hash = 'a'.repeat(64);
  assert.throws(() => validateCanonicalEntries([{ path: '../escape', bytes: 0, sha256: hash }]));
  assert.throws(() => validateCanonicalEntries([{ path: 'e\u0301.txt', bytes: 0, sha256: hash }]));
  assert.throws(() => validateCanonicalEntries([{ path: 'A.txt', bytes: 0, sha256: hash }, { path: 'a.txt', bytes: 0, sha256: hash }]));
  assert.throws(() => validateCanonicalEntries([{ path: 'z.txt', bytes: 0, sha256: hash }, { path: 'a.txt', bytes: 0, sha256: hash }]));
});
test('P12 canonical exact-set verification rejects extra, missing and altered rows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'p12-canonical-'));
  try {
    await mkdir(join(root, 'nested')); await writeFile(join(root, 'nested', 'a.txt'), 'a');
    const files = await createCanonicalManifest(root);
    assert.equal((await verifyCanonicalManifest(root, { files })).ok, true);
    assert.equal((await verifyCanonicalManifest(root, { files: [] })).ok, false);
    await writeFile(join(root, 'nested', 'extra.txt'), 'x');
    assert.equal((await verifyCanonicalManifest(root, { files })).ok, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('P12 canonical collector rejects symlinks', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'p12-canonical-symlink-'));
  try {
    await writeFile(join(root, 'source.txt'), 'x');
    try { await symlink(join(root, 'source.txt'), join(root, 'link.txt')); }
    catch { t.skip('symlink creation is unavailable on this Windows host'); return; }
    await assert.rejects(createCanonicalManifest(root), /symlink is forbidden/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
