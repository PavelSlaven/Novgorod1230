import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '@rus/kernel';
import {
  NPC_ROUTINE_SCHEDULE_PROJECTION_COLUMNS,
  NPC_ROUTINE_SCHEDULE_PROJECTION_SELECT,
  projectPersistedNpcRoutineSchedules
} from '../src/lower-dvina-trace-phase-1a-projection.js';

function committedRow(overrides = {}) {
  return {
    id: 'npc-schedule:party-1:npc-1',
    party_id: 'party-1',
    npc_id: 'npc-1',
    current_position_node_id: null,
    schedule_profile_ref: { entity_ref: { entity_kind: 'activity_profile', entity_id: 'watch' },
      authoring_version: '1' },
    dependency_pins: { pins: [], canonical_digest: 'pin' },
    causal_state_ref: { entity_ref: { entity_kind: 'condition_set', entity_id: 'npc-approved-routine' },
      canonical_digest: 'causal' },
    status: 'active',
    state_version: '1',
    next_transition_at_whole_minutes: '620',
    next_transition_at_subminute_numerator: '0',
    next_transition_at_subminute_denominator: '1',
    current_activity_execution_id: null,
    attention_state_ref: { entity_kind: 'condition_set', entity_id: 'npc-attention:npc-1' },
    body_state_ref: { entity_kind: 'body_state', entity_id: 'npc-body:npc-1' },
    knowledge_state_ref: { entity_kind: 'knowledge_fact', entity_id: 'npc-knowledge:npc-1' },
    relationship_state_ref: { entity_kind: 'condition_set', entity_id: 'npc-relations:npc-1' },
    updated_change_set_id: 'change-set-1',
    candidate_profile_refs: [],
    ...overrides
  };
}

test('schedule projection select is an explicit column list, not a wildcard', () => {
  assert.doesNotMatch(NPC_ROUTINE_SCHEDULE_PROJECTION_SELECT, /\*/u);
  for (const column of [...NPC_ROUTINE_SCHEDULE_PROJECTION_COLUMNS, 'candidate_profile_refs']) {
    assert.match(NPC_ROUTINE_SCHEDULE_PROJECTION_SELECT, new RegExp(`\\b${column}\\b`, 'u'));
  }
});

test('a party column outside the projection does not break the round-trip', () => {
  const expected = sha256(projectPersistedNpcRoutineSchedules([committedRow()]));
  const withFutureColumn = projectPersistedNpcRoutineSchedules([
    committedRow({ some_column_added_later: 'value' })
  ]);
  assert.equal(sha256(withFutureColumn), expected);
  assert.deepEqual(Object.keys(withFutureColumn[0]),
    [...NPC_ROUTINE_SCHEDULE_PROJECTION_COLUMNS]);
  assert.equal(withFutureColumn[0].state_version, 1);
  assert.equal(withFutureColumn[0].next_transition_at_whole_minutes, 620);
});

test('a changed projection column breaks the round-trip', () => {
  const expected = sha256(projectPersistedNpcRoutineSchedules([committedRow()]));
  for (const overrides of [{ status: 'inactive' }, { state_version: '2' },
    { next_transition_at_whole_minutes: '621' },
    { schedule_profile_ref: { entity_ref: { entity_kind: 'activity_profile', entity_id: 'other' },
      authoring_version: '1' } }]) {
    assert.notEqual(sha256(projectPersistedNpcRoutineSchedules([committedRow(overrides)])),
      expected);
  }
});

test('candidate routine profiles outside the approved projection fail closed', () => {
  assert.throws(() => projectPersistedNpcRoutineSchedules([
    committedRow({ candidate_profile_refs: ['activity_profile:ferry'] })
  ]), { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' });
});
