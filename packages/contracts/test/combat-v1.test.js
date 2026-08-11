import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBAT_CONTRACT_NAMES,
  validateCombatExchangeProposal,
  validateCombatIntent,
  validateCombatSession,
  validateCombatTechnicalStepProposal,
  validateNpcCombatDecisionRequest,
  validateNpcCombatIntentPlan
} from '../src/combat-v1.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const timestamp = {
  whole_minutes: '1', subminute_numerator: '0', subminute_denominator: '1'
};
const intent = {
  schema: 'combat_intent_v1', intent_id: 'intent-1', combat_id: 'combat-1',
  actor_ref: ref('npc', 'npc-1'), intent_kind: 'engage',
  target_refs: [ref('player_character', 'player-1')], protected_refs: [],
  scope_ref: null, destination_ref: null, force_limit: 'ordinary',
  risk_posture: 'ordinary', persistence: 'until_decision_boundary',
  created_from_boundary_ref: ref('npc_decision_boundary', 'boundary-1'),
  state_version: '1', status: 'active'
};
const session = {
  schema: 'combat_session_v1', combat_id: 'combat-1', state_version: '1',
  status: 'active', started_at: timestamp, scope_ref: ref('location', 'place-1'),
  participant_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
  participant_states: [
    { actor_ref: ref('npc', 'npc-1'), combat_status: 'active', current_intent: intent, next_action_boundary_ref: null },
    { actor_ref: ref('player_character', 'player-1'), combat_status: 'active', current_intent: null, next_action_boundary_ref: null }
  ], exchange_ordinal: 0, last_exchange_ref: null,
  player_response_required: false, last_change_set_ref: null
};
const step = {
  schema: 'combat_technical_step_proposal_v1', proposal_id: 'step-1',
  combat_id: 'combat-1', exchange_ordinal: 1, actor_ref: ref('npc', 'npc-1'),
  intent_ref: ref('combat_intent', 'intent-1'), step_kind: 'attack',
  check_request: { target_defense: 10 }, preconditions_digest: 'digest-1',
  idempotency_key: 'step-key-1'
};
const request = {
  schema: 'npc_combat_decision_request_v1', request_id: 'request-1',
  boundary_id: 'boundary-1', state_version: '1', combat_id: 'combat-1',
  exchange_ordinal: 0, decided_at: timestamp, npc_ref: ref('npc', 'npc-1'),
  decision_reasons: { significance: 'material', categories: ['environment'], signal_refs: [ref('npc_decision_signal', 'signal-1')], perceived_changes: ['Opponent is armed.'] },
  current_intent: null, npc_subjective_state: {}, perceived_combat_state: {},
  relevant_memory: [], operation_contract: {}
};
const plan = {
  schema: 'npc_combat_intent_plan_v1', request_id: request.request_id,
  boundary_id: request.boundary_id, state_version: '1', combat_id: 'combat-1',
  npc_ref: ref('npc', 'npc-1'), decision: {
    intent_summary: 'Demand that the opponent lower their weapon.',
    grounded_goal: 'Stop the immediate attack without advancing.',
    adaptation: 'literal'
  },
  operation: { op: 'set_combat_intent', intent_kind: 'engage', target_refs: [ref('player_character', 'player-1')], protected_refs: [], scope_ref: null, destination_ref: null, force_limit: 'ordinary', risk_posture: 'ordinary' },
  combat_statement: {
    speech_act: 'surrender_demand',
    addressed_refs: [ref('player_character', 'player-1')],
    utterance_text: 'Lower your weapon.'
  },
  reason: 'Defend the gate.'
};

test('combat-v1 publishes exactly six strict DTO validators', () => {
  assert.equal(COMBAT_CONTRACT_NAMES.length, 6);
  assert.equal(validateCombatSession(session), true);
  assert.equal(validateCombatIntent(intent), true);
  assert.equal(validateCombatTechnicalStepProposal(step), true);
  assert.equal(validateCombatExchangeProposal({ schema: 'combat_exchange_proposal_v1', proposal_id: 'exchange-1', combat_id: 'combat-1', exchange_ordinal: 1, technical_steps: [step], preconditions_digest: 'digest-1', idempotency_key: 'exchange-key-1' }), true);
  assert.equal(validateNpcCombatDecisionRequest(request), true);
  assert.equal(validateNpcCombatIntentPlan(plan, request), true);
});

test('combat-v1 rejects duplicate participant state and mismatched plan request', () => {
  assert.equal(validateCombatSession({ ...session, participant_states: [session.participant_states[0], session.participant_states[0]] }), false);
  assert.equal(validateNpcCombatIntentPlan({ ...plan, request_id: 'other-request' }, request), false);
});

test('combat exchange binds every technical step to its combat and ordinal', () => {
  const exchange = { schema: 'combat_exchange_proposal_v1',
    proposal_id: 'exchange-1', combat_id: 'combat-1', exchange_ordinal: 1,
    technical_steps: [step], preconditions_digest: 'digest-1',
    idempotency_key: 'exchange-key-1' };
  assert.equal(validateCombatExchangeProposal(exchange), true);
  assert.equal(validateCombatExchangeProposal({ ...exchange,
    technical_steps: [{ ...step, combat_id: 'combat-2' }] }), false);
  assert.equal(validateCombatExchangeProposal({ ...exchange,
    technical_steps: [{ ...step, exchange_ordinal: 2 }] }), false);
});

test('combat intent accepts a player response boundary without weakening NPC refs', () => {
  const playerIntent = {
    ...intent,
    actor_ref: ref('player_character', 'player-1'),
    created_from_boundary_ref: ref(
      'player_combat_response_boundary',
      'combat-response-1'
    )
  };
  assert.equal(validateCombatIntent(playerIntent), true);
  assert.equal(validateCombatIntent({
    ...playerIntent,
    created_from_boundary_ref: ref('conversation_boundary', 'boundary-1')
  }), false);
});

test('combat intent lifecycle and NPC reassessment request accept contract statuses', () => {
  for (const status of ['active', 'completed', 'blocked', 'invalidated',
    'no_progress']) {
    assert.equal(validateCombatIntent({ ...intent, status }), true);
    assert.equal(validateNpcCombatDecisionRequest({
      ...request,
      current_intent: {
        intent_kind: intent.intent_kind,
        target_refs: intent.target_refs,
        status
      }
    }), true);
  }
  assert.equal(validateCombatIntent({ ...intent, status: 'stale' }), false);
  assert.equal(validateNpcCombatDecisionRequest({
    ...request,
    current_intent: {
      intent_kind: intent.intent_kind,
      target_refs: intent.target_refs,
      status: 'stale'
    }
  }), false);
});

test('combat request rejects categories outside the generic signal vocabulary', () => {
  assert.equal(validateNpcCombatDecisionRequest({
    ...request,
    decision_reasons: {
      ...request.decision_reasons,
      categories: ['combat']
    }
  }), false);
});

test('combat plan rejects the superseded placeholder decision and string statement', () => {
  assert.equal(validateNpcCombatIntentPlan({
    ...plan,
    decision: {}
  }, request), false);
  assert.equal(validateNpcCombatIntentPlan({
    ...plan,
    combat_statement: 'Lower your weapon.'
  }, request), false);
});
