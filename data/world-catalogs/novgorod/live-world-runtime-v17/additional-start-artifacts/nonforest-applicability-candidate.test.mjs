import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildCandidate } from './nonforest-applicability-candidate.mjs';

const root = resolve(import.meta.dirname, '../../../../..');
const path = 'data/world-catalogs/novgorod/live-world-runtime-v17/additional-start-artifacts/nonforest-applicability-candidate-v1.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('three nonforest applicability transfers equal pinned approved sources byte for byte', async () => {
  const expected = await buildCandidate();
  const actual = await readFile(resolve(root, path));
  assert.deepEqual(actual, expected);
  const candidate = JSON.parse(actual);
  assert.equal(candidate.starts.length, 3);
  for (const { start, transfer } of candidate.starts) {
    assert.equal(sha256(await readFile(resolve(root, start.path))), start.sha256);
    assert.equal(sha256(await readFile(resolve(root, transfer.path))), transfer.sha256);
  }
  for (const source of candidate.source_pins) {
    assert.equal(sha256(await readFile(resolve(root, source.path))), source.sha256);
  }
  assert.equal(candidate.status, 'pending_independent_data_approval');
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
});
