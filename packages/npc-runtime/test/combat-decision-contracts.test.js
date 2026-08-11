import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNpcCombatDecisionRequest, buildNpcCombatIntentPlan,
  validateNpcCombatPlanApplicability } from '../src/combat-decision-contracts.js';
import { buildNpcSemanticDecisionTrace,
  validateNpcSemanticDecisionTrace } from '../src/semantic-decision-contracts.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const request = {
  schema: 'npc_combat_decision_request_v1', request_id: 'combat-request-1',
  boundary_id: 'boundary-1', state_version: '2', combat_id: 'combat-1',
  exchange_ordinal: 0,
  decided_at: { whole_minutes: '1', subminute_numerator: '0', subminute_denominator: '1' },
  npc_ref: ref('npc', 'npc-1'),
  decision_reasons: { significance: 'material', categories: ['self'], signal_refs: [ref('npc_decision_signal', 'signal-1')], perceived_changes: ['A sword was drawn.'] },
  current_intent: null, npc_subjective_state: {}, perceived_combat_state: {},
  relevant_memory: [], operation_contract: {
    allowed_intent_kinds: ['engage'],
    engageable_actor_refs: [ref('player_character', 'player-1')],
    controllable_actor_refs: [], protectable_refs: [],
    holdable_scope_refs: [], reachable_destination_refs: [],
    break_contact_destination_refs: [],
    allowed_force_limits: ['ordinary'],
    allowed_risk_postures: ['ordinary'], surrender_available: false,
    cease_hostility_available: false, combat_statement_available: false
  }
};

test('NPC combat request and plan preserve request identity references', () => {
  const builtRequest = buildNpcCombatDecisionRequest(request);
  const plan = buildNpcCombatIntentPlan({
    schema: 'npc_combat_intent_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, state_version: '2', combat_id: 'combat-1',
    npc_ref: ref('npc', 'npc-1'), decision: {
      intent_summary: 'Protect myself from the immediate threat.',
      grounded_goal: 'Keep the opponent from advancing.',
      adaptation: 'literal'
    },
    operation: { op: 'set_combat_intent', intent_kind: 'engage', target_refs: [ref('player_character', 'player-1')], protected_refs: [], scope_ref: null, destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary' },
    combat_statement: null, reason: 'Protect myself.'
  }, builtRequest);
  assert.equal(Object.isFrozen(builtRequest), true);
  assert.equal(plan.boundary_id, request.boundary_id);
  assert.deepEqual(validateNpcCombatPlanApplicability(plan, builtRequest), {
    pass: true,
    errors: []
  });
  assert.equal(validateNpcCombatPlanApplicability({
    ...plan,
    operation: {
      ...plan.operation,
      target_refs: [ref('player_character', 'unknown')]
    }
  }, builtRequest).pass, false);
  const speakingRequest = { ...structuredClone(builtRequest),
    operation_contract: { ...structuredClone(builtRequest.operation_contract),
      combat_statement_available: true } };
  const statement = { speech_act: 'surrender_demand',
    addressed_refs: [ref('player_character', 'player-1')],
    utterance_text: 'Lower your weapon.' };
  assert.equal(validateNpcCombatPlanApplicability({ ...plan,
    combat_statement: statement }, speakingRequest).pass, true);
  assert.equal(validateNpcCombatPlanApplicability({ ...plan,
    combat_statement: { ...statement,
      addressed_refs: [ref('player_character', 'unknown')] }
  }, speakingRequest).pass, false);
  assert.equal(validateNpcCombatPlanApplicability({ ...plan,
    operation: { ...plan.operation, intent_kind: 'surrender',
      target_refs: [] }, combat_statement: statement
  }, { ...speakingRequest, operation_contract: {
    ...speakingRequest.operation_contract,
    allowed_intent_kinds: ['engage', 'surrender'], surrender_available: true
  } }).pass, true);
  assert.throws(() => buildNpcCombatIntentPlan({ ...plan, boundary_id: 'other' }, builtRequest));
  const trace = buildNpcSemanticDecisionTrace({ request: builtRequest, plan,
    root_turn_id: 'turn-1', working_revision: 2,
    applied_change_set_id: 'change-1' });
  assert.equal(trace.npc_ref, 'npc-1');
  assert.equal(trace.committed_state_version, 2);
  assert.equal(validateNpcSemanticDecisionTrace(trace, builtRequest), true);
});
