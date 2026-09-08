import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureArtifact, inspectLocalLlmHardware, provisionAndStartGemma } from
  '../managed-runtime.js';

test('hardware gate reports facts and does not hide unsupported machines', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'novgorod-hw-test-'));
  try {
    const result = await inspectLocalLlmHardware({ dataRoot: directory,
      platform: 'win32', arch: 'x64', ramBytes: 16 * 1024 ** 3,
      command: () => ({ status: 0,
        stdout: 'Small GPU, 8192, 999.0, 9.0\n' }) });
    assert.equal(result.supported, false);
    assert.equal(result.facts.gpu.name, 'Small GPU');
    assert.match(result.reasons.join(' '), /24 GiB VRAM/u);
    assert.match(result.reasons.join(' '), /32 GiB RAM/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
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

test('managed Gemma fails closed before download when its port is occupied', async () => {
  let fetched = false;
  await assert.rejects(provisionAndStartGemma({
    portAvailable: async () => false,
    fetchImpl: async () => { fetched = true; throw new Error('unexpected'); }
  }), { code: 'LOCAL_LLM_PORT_UNAVAILABLE' });
  assert.equal(fetched, false);
});
