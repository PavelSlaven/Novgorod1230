import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '../src/npc-semantic-decision.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const timestamp = { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' };

test('combat NPC decisions use the active strict contract', async () => {
  const boundary = buildNpcDecisionBoundary({ decision_mode: 'combat', decision_context_id: 'combat-7', scheduled_at: timestamp, npc_ref: ref('npc', 'speaker'), same_time_batch_ref: ref('temporal_batch', 'batch-1'), significance: 'material', categories: ['self'], signal_refs: [ref('npc_decision_signal', 'signal-1')], state_version: '2' });
  const request = { schema: 'npc_combat_decision_request_v1', request_id: 'combat-request-1', boundary_id: boundary.boundary_id, state_version: '2', combat_id: 'combat-7', exchange_ordinal: 0, decided_at: timestamp, npc_ref: ref('npc', 'speaker'), decision_reasons: { significance: 'material', categories: ['self'], signal_refs: [ref('npc_decision_signal', 'signal-1')], perceived_changes: ['armed'] }, current_intent: null, npc_subjective_state: {}, perceived_combat_state: {}, relevant_memory: [], operation_contract: {} };
  const result = await requestNpcSemanticDecision({ boundary, request, semanticModel: async () => ({ schema: 'npc_combat_intent_plan_v1', request_id: request.request_id, boundary_id: boundary.boundary_id, state_version: '2', combat_id: 'combat-7', npc_ref: ref('npc', 'speaker'), decision: {}, operation: { op: 'set_combat_intent', intent_kind: 'engage', target_refs: [ref('player_character', 'player')], protected_refs: [], scope_ref: null, destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary' }, combat_statement: null, reason: 'Defend.' }), revalidateStateVersion: async () => 2 });
  assert.equal(result.status, 'planned');
});
