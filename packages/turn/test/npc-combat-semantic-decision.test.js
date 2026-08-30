import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '../src/npc-semantic-decision.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const timestamp = { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' };

test('combat NPC decisions use the active strict contract', async () => {
  const boundary = buildNpcDecisionBoundary({ decision_mode: 'combat', decision_context_id: 'combat-7', scheduled_at: timestamp, npc_ref: ref('npc', 'speaker'), same_time_batch_ref: ref('temporal_batch', 'batch-1'), significance: 'material', categories: ['self'], signal_refs: [ref('npc_decision_signal', 'signal-1')], state_version: '2' });
  const request = { schema: 'npc_combat_decision_request_v1', request_id: 'combat-request-1', boundary_id: boundary.boundary_id, state_version: '2', combat_id: 'combat-7', exchange_ordinal: 0, decided_at: timestamp, npc_ref: ref('npc', 'speaker'), decision_reasons: { significance: 'material', categories: ['self'], signal_refs: [ref('npc_decision_signal', 'signal-1')], perceived_changes: ['armed'] }, current_intent: null, npc_subjective_state: {}, perceived_combat_state: {}, relevant_memory: [], operation_contract: {} };
  const result = await requestNpcSemanticDecision({ boundary, request, semanticModel: async () => ({ schema: 'npc_combat_intent_plan_v1', request_id: request.request_id, boundary_id: boundary.boundary_id, state_version: '2', combat_id: 'combat-7', npc_ref: ref('npc', 'speaker'), decision: { intent_summary: 'Defend against the immediate threat.', grounded_goal: 'Keep the attacker at a distance.', adaptation: 'literal' }, operation: { op: 'set_combat_intent', intent_kind: 'engage', target_refs: [ref('player_character', 'player')], protected_refs: [], scope_ref: null, destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary' }, combat_statement: null, reason: 'Defend.' }), revalidateStateVersion: async () => 2 });
  assert.equal(result.status, 'planned');
});

test('combat repair receives stable structural diagnostics', async () => {
  const decisionBoundary = buildNpcDecisionBoundary({ decision_mode: 'combat',
    decision_context_id: 'combat-8', scheduled_at: timestamp,
    npc_ref: ref('npc', 'speaker'),
    same_time_batch_ref: ref('temporal_batch', 'batch-2'),
    significance: 'material', categories: ['self'],
    signal_refs: [ref('npc_decision_signal', 'signal-2')], state_version: '2' });
  const request = { schema: 'npc_combat_decision_request_v1',
    request_id: 'combat-request-2', boundary_id: decisionBoundary.boundary_id,
    state_version: '2', combat_id: 'combat-8', exchange_ordinal: 0,
    decided_at: timestamp, npc_ref: ref('npc', 'speaker'),
    decision_reasons: { significance: 'material', categories: ['self'],
      signal_refs: [ref('npc_decision_signal', 'signal-2')],
      perceived_changes: ['armed'] }, current_intent: null,
    npc_subjective_state: {}, perceived_combat_state: {}, relevant_memory: [],
    operation_contract: {} };
  const valid = { schema: 'npc_combat_intent_plan_v1',
    request_id: request.request_id, boundary_id: request.boundary_id,
    state_version: '2', combat_id: request.combat_id,
    npc_ref: request.npc_ref, decision: { intent_summary: 'Defend.',
      grounded_goal: 'Keep distance.', adaptation: 'literal' },
    operation: { op: 'set_combat_intent', intent_kind: 'engage',
      target_refs: [ref('player_character', 'player')], protected_refs: [],
      scope_ref: null, destination_ref: null, force_limit: 'ordinary',
      risk_posture: 'ordinary' }, combat_statement: null, reason: 'Threat.' };
  const calls = [];
  const result = await requestNpcSemanticDecision({ boundary: decisionBoundary,
    request, semanticModel: async (_request, context) => {
      calls.push(context);
      return calls.length === 1
        ? { ...valid, operation: { ...valid.operation, target_refs: [] } }
        : valid;
    }, revalidateStateVersion: async () => 2 });
  assert.equal(result.status, 'planned');
  assert.deepEqual(calls[1].repair.validation_errors, [{
    code: 'npc_combat_ref_choice_invalid', path: '$.operation',
    message: 'selected_ref_choices must match the selected intent cardinality.'
  }]);
});
