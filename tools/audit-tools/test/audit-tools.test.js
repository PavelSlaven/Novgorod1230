import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAuditManifest, verifyAuditEntries } from '../src/index.js';

test('audit manifest hashes a safe source tree', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rus-audit-'));
  await writeFile(join(dir, 'README.md'), 'ok');
  const manifest = await createAuditManifest(dir);
  assert.equal(manifest.file_count, 1);
  assert.equal(manifest.entries[0].sha256.length, 64);
});

test('audit verification blocks release archives and secrets', () => {
  const hash = 'a'.repeat(64);
  assert.equal(verifyAuditEntries([{ path:'release.zip', size:1, sha256:hash }]).ok, false);
  assert.equal(verifyAuditEntries([{ path:'.env', size:1, sha256:hash }]).ok, false);
});
