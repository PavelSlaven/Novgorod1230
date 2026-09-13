import assert from 'node:assert/strict';
import test from 'node:test';
import { withLowerDvinaTracePostActionKnowledge } from
  '../src/infrastructure/postgres/lower-dvina-trace-post-action-knowledge.js';

test('post-action knowledge read distinguishes persisted state from proven absence', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('party_npc_spatial_schedules')) return { rows: [{
        npc_id: 'npc-a', current_position_node_id: 'position-a',
        schedule_state_version: '4',
        attention_state_ref: { entity_kind: 'condition_set', entity_id: 'attention-a' },
        knowledge_state_ref: { entity_kind: 'knowledge_fact', entity_id: 'knowledge-a' },
        g6_instance_id: 'g6-a', position_state_version: '5', ambient_noise: 1,
        acoustic_uniformity: 'uniform', acoustic_state_version: '2'
      }] };
      return sql.includes('LEFT JOIN party_runtime.party_npc_knowledge_merge_states') ? { rows: [{
        npc_id: 'npc-a', state_version: '3'
      }, {
        npc_id: 'npc-b', state_version: null
      }] } : { rows: [{
        npc_id: 'npc-a', fact_id: 'seen-1',
        knowledge_ref_kind: 'sound_event',
        knowledge_classification: 'fact'
      }] };
    }
  };

  const state = await withLowerDvinaTracePostActionKnowledge(
    pool,
    'party-1',
    { party_id: 'party-1' }
  );

  assert.deepEqual(state.post_action_knowledge_states, [{
    npc_id: 'npc-a', exists: true, state_version: 3,
    fact_refs: [{ entity_kind: 'sound_event', entity_id: 'seen-1' }],
    hypothesis_refs: []
  }, {
    npc_id: 'npc-b', exists: false, state_version: null,
    fact_refs: [], hypothesis_refs: []
  }]);
  assert.deepEqual(state.post_action_perception_sources, [{
    npc_id: 'npc-a', current_position_node_id: 'position-a',
    schedule_state_version: 4,
    attention_state_ref: { entity_kind: 'condition_set', entity_id: 'attention-a' },
    knowledge_state_ref: { entity_kind: 'knowledge_fact', entity_id: 'knowledge-a' },
    g6_instance_id: 'g6-a', position_state_version: 5, ambient_noise: 1,
    acoustic_uniformity: 'uniform', acoustic_state_version: 2
  }]);
  assert.equal(Object.isFrozen(state), false);
});

test('knowledge rows without their merge state fail closed', async () => {
  const pool = {
    async query(sql) {
      if (sql.includes('party_npc_spatial_schedules')) return { rows: [] };
      return sql.includes('LEFT JOIN party_runtime.party_npc_knowledge_merge_states')
        ? { rows: [{ npc_id: 'npc-a', state_version: null }] }
        : { rows: [{ npc_id: 'npc-a', fact_id: 'orphan',
          knowledge_ref_kind: 'sound_event',
          knowledge_classification: 'fact' }] };
    }
  };

  await assert.rejects(
    withLowerDvinaTracePostActionKnowledge(
      pool,
      'party-1',
      { party_id: 'party-1' }
    ),
    (error) => error.code === 'TRACE_POST_ACTION_KNOWLEDGE_STATE_INVALID'
  );
});
