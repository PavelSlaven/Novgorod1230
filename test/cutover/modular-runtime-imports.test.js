import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { inspectRuntimeImportGraph } from '../../tools/cutover/src/index.js';

test('modular production import graph does not resolve into legacy', async () => {
  const proof = await inspectRuntimeImportGraph({ root: fileURLToPath(new URL('../..', import.meta.url)) });
  assert.equal(proof.pass, true, JSON.stringify(proof.legacy_imports, null, 2));
  assert.equal(proof.legacy_import_count, 0);
  assert.ok(proof.file_count > 10);
});
