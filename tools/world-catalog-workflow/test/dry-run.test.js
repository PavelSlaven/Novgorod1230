import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportDryRun, digestValue } from '../src/index.js';

const existing = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];

test('dry-run is deterministic and classifies create/update/unchanged', () => {
  const incoming = [{ id: 'a', value: 1 }, { id: 'b', value: 3 }, { id: 'c', value: 4 }];
  const first = buildImportDryRun({ existing, incoming });
  const second = buildImportDryRun({ existing, incoming });
  assert.deepEqual(first, second);
  assert.deepEqual(first.creates.map((x) => x.id), ['c']);
  assert.deepEqual(first.updates.map((x) => x.id), ['b']);
  assert.deepEqual(first.unchanged, ['a']);
  assert.equal(first.digest, digestValue({ creates: first.creates, updates: first.updates, unchanged: first.unchanged, deprecations: first.deprecations }));
});

test('dry-run does not silently delete absent records', () => {
  const result = buildImportDryRun({ existing, incoming: [{ id: 'a', value: 1 }] });
  assert.deepEqual(result.deprecations, []);
  assert.deepEqual(result.unmentioned_existing, ['b']);
});
