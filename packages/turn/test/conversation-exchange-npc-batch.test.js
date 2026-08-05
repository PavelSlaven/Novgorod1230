import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { normalizeNpcBoundaryBatch } from
  '../src/conversation-exchange-npc-batch.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

test('one NPC and same-time batch may enter separate decision modes', () => {
  const common = {
    scheduled_at: at,
    npc_ref: ref('npc', 'guard'),
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: 'material',
    categories: ['communication'],
    signal_refs: [ref('npc_decision_signal', 'signal-1')],
    state_version: '4'
  };
  const boundaries = ['conversation', 'autonomous'].map((decision_mode) =>
    buildNpcDecisionBoundary({ ...common, decision_mode }));

  const normalized = normalizeNpcBoundaryBatch({
    boundaries,
    direct_addressee_refs: [ref('npc', 'guard')]
  }, new Set(), new Set());

  assert.deepEqual(normalized.boundaries.map(({ decision_mode: mode }) => mode),
    ['autonomous', 'conversation']);
  assert.equal(new Set(normalized.boundaries.map(
    ({ boundary_id: boundaryId }) => boundaryId)).size, 2);
});
