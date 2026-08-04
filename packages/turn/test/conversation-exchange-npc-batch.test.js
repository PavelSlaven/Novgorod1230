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

test('one NPC and same-time batch cannot enter two decision modes', () => {
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

  assert.throws(() => normalizeNpcBoundaryBatch({
    boundaries,
    direct_addressee_refs: [ref('npc', 'guard')]
  }, new Set(), new Set()), ({ code }) =>
    code === 'TURN_CONVERSATION_NPC_DECISION_DUPLICATE');
});
