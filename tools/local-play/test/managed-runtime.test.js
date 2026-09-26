import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureArtifact, MANAGED_RUNTIME_PINS } from
  '../managed-runtime.js';

test('managed runtime owns Giga only and has no gameplay-model artifacts', () => {
  assert.equal('giga' in MANAGED_RUNTIME_PINS, true);
  assert.equal('gemma' in MANAGED_RUNTIME_PINS, false);
  assert.equal('llama' in MANAGED_RUNTIME_PINS, false);
});

test('artifact download resumes and verifies the pinned checksum', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-download-test-'));
  const target = join(directory, 'asset.bin');
  const bytes = Buffer.from('resumable pinned artifact');
  await writeFile(`${target}.part`, bytes.subarray(0, 9));
  let range;
  try {
    await ensureArtifact({ url: 'https://example.invalid/asset', path: target,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), log: () => {},
      fetchImpl: async (_url, options) => {
        range = options.headers.range;
        return new Response(bytes.subarray(9), { status: 206 });
      } });
    assert.equal(range, 'bytes=9-');
    assert.deepEqual(await readFile(target), bytes);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('concurrent provisioning downloads one shared artifact once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-lock-test-'));
  const target = join(directory, 'asset.bin');
  const bytes = Buffer.from('one artifact owner');
  const options = { url: 'https://example.invalid/asset', path: target,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), log: () => {} };
  let downloads = 0;
  try {
    await Promise.all([ensureArtifact({ ...options, fetchImpl: download }),
      ensureArtifact({ ...options, fetchImpl: download })]);
    assert.equal(downloads, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }

  async function download() {
    downloads += 1;
    return new Response(bytes);
  }
});
