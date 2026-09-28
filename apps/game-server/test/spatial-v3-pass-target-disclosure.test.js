import assert from 'node:assert/strict';
import test from 'node:test';
import { passTargetDisclosureForExit, slotByExitOf } from
  '../src/runtime/spatial-v3-pass-target-disclosure.js';

const slot = (id, version, directional_exit_id) => ({ id, version, directional_exit_id });

test('an exit with several slots resolves to the lowest (id, version) whatever the row order (F11)', () => {
  const rows = [slot('b', 1, 'exit'), slot('a', 2, 'exit'), slot('a', 1, 'exit'), slot('c', 1, 'other')];
  const forward = slotByExitOf(rows);
  const reversed = slotByExitOf([...rows].reverse());
  assert.deepEqual([...forward], [['exit', { id: 'a', version: 1 }], ['other', { id: 'c', version: 1 }]]);
  assert.deepEqual([...reversed].sort(), [...forward].sort());
});

test('an exit without a slot has no pass-target text; a slot unknown to the catalog is a typed gap (F11)', () => {
  assert.deepEqual(passTargetDisclosureForExit(new Map(), 'exit'), { pass_target_description: null });
  assert.deepEqual(passTargetDisclosureForExit(null, 'exit'), { pass_target_description: null });
  assert.throws(() => passTargetDisclosureForExit(new Map([['exit', { id: 'unknown', version: 1 }]]), 'exit'),
    (error) => error.details?.reason === 'approved_pass_target_label_required');
});
