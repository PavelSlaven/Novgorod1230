import assert from 'node:assert/strict';
import test from 'node:test';
import { createTracePhase4Commands } from '../src/runtime/lower-dvina-trace-phase-4-command.js';
import {
  createTracePhase4VisibleProjector,
  createTracePhase4TemporalAdvance,
  negotiationEffect,
  routeToShedEffect
} from '../src/runtime/lower-dvina-trace-phase-4-effects.js';
import { resolveTracePhase4NpcDecision } from '../src/runtime/lower-dvina-trace-phase-4-npc-decision.js';
import { validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';

const contracts = Object.freeze({
  ids: { camp: 'camp', shed: 'shed', route: 'camp-to-shed', routeOption: 'follow_known_route_to_drying_shed', negotiationOption: 'offer_conditional_protection_and_seek_surrender', observation: 'onisim_alive', ratshaPolicy: 'trace_ld_v1_npc_ratsha_decisions' },
  routeActivity: { profile_id: 'route-to-shed', version: 1 }, negotiation: { profile_id: 'ratsha-negotiation' },
  route: { route_id: 'camp-to-shed', version: 1, duration_minutes: 12,
    movement_method: 'walk', reverse_route_ref: 'shed-to-camp' },
  reverseRoute: { route_id: 'shed-to-camp', version: 1,
    digest: 'reverse-route-digest' },
  sourceEndpoint: { endpoint_id: 'camp-endpoint' },
  destinationEndpoint: { endpoint_id: 'shed-endpoint' },
  access: { policy_id: 'shed-access', location_ref: 'shed', hidden_or_open_state: 'open', unmaterialized_access: 'forbidden' },
  check: { check_id: 'ratsha-check', dc: 13, attribute: 'influence', skill: 'communication', modifiers: { state: -1, item_or_evidence: 0, circumstance: 1 }, outcome_refs: { success: 'surrender-admitted', failure: 'hostile-admitted' }, admitted_followup_option_ids: { success: ['surrender_without_confession', 'surrender_and_confess'], failure: ['attack_and_escape', 'threaten_and_bargain'] } },
  confessionStatement: {
    statement_template_id: 'trace_ld_v1_statement_ratsha_confession',
    assertion: {
      assertion_id: 'trace_ld_v1_assertion_ratsha_confession',
      content_scope: 'own_actions_and_received_instruction'
    }
  },
  confessionEffect: {
    statement_effect_contract_id:
      'trace_ld_v1_statement_effect_ratsha_confession'
  },
  threatEffect: {
    statement_effect_contract_id:
      'trace_ld_v1_statement_effect_ratsha_threat_or_bargain',
    source_rule: 'speaker_current_threat_or_offer_only',
    audience_rule: 'materialized_present_audience_only'
  },
  observation: {
    trigger: {
      subject_body_condition_ref: 'onisim-injury',
      allowed_subject_states: [
        'injured_unable_to_walk',
        'stabilized_unable_to_walk'
      ]
    }
  },
  promisePolicy: {
    policy_id: 'promise',
    revision: 1,
    scope: { protection: 'bounded' }
  },
  npcPolicy: { policy_id: 'trace_ld_v1_npc_ratsha_decisions', option_set: ['attack_and_escape', 'threaten_and_bargain', 'surrender_without_confession', 'surrender_and_confess'].map((option_id) => ({ option_id })), decision_execution_bindings: ['attack_and_escape', 'threaten_and_bargain', 'surrender_without_confession', 'surrender_and_confess'].map(executionBinding) },
  npcExecutions: ['attack_and_escape', 'threaten_and_bargain', 'surrender_without_confession', 'surrender_and_confess'].map(executionBinding),
  anchors: { camp: 'camp-anchor', shed: 'shed-anchor' }, capacity: {
    contract_id: 'shed-capacity',
    zones: [{ zone_id: 'shed_approach', max_actors: 7 }]
  },
  actors: { eremey_fisher: { instance_id: 'eremey', anchor_id: 'shed-anchor' }, ratsha_storehouse_helper: { instance_id: 'ratsha', anchor_id: 'shed-anchor', machine_state: { status: 'active', surrender_state: 'not_surrendered', restraint_state: 'not_restrained' } }, onisim_boatman: { instance_id: 'onisim', anchor_id: 'shed-anchor', machine_state: { body_condition: { condition_profile_ref: 'onisim-injury', state: 'injured_unable_to_walk' } } }, participating_fisher: { instance_id: 'fisher', anchor_id: 'shed-anchor' } }
});

test('route is known-only, carries the approved group and observes Onisim alive', () => {
  const result = routeToShedEffect({
    contracts,
    inputDigest: 'a'.repeat(64),
    state: routeState(),
    playerInput: { idempotency_key: 'route-key' }
  });
  assert.equal(result.duration_minutes, 12);
  assert.equal(
    result.movement.traversal.interval_result.actual_time_numerator,
    '12'
  );
  assert.deepEqual(result.movement.traversal.participant_group, ['player', 'eremey', 'fisher']);
  assert.deepEqual(result.movement.participants, ['player', 'eremey', 'fisher']);
  assert.equal(result.movement.arrival_observation_ref, 'onisim_alive');
  assert.equal(result.movement.reverse_route_ref, 'shed-to-camp');
  assert.equal(result.movement.reverse_route_digest, 'reverse-route-digest');
  assert.equal(result.movement.navigation_check, null);
});

test('arrival observation fails closed for an unapproved Onisim position or condition', () => {
  const wrongAnchor = structuredClone(contracts);
  wrongAnchor.actors.onisim_boatman.anchor_id = 'camp-anchor';
  assert.throws(() => routeToShedEffect({
    contracts: wrongAnchor,
    inputDigest: '3'.repeat(64),
    state: routeState(),
    playerInput: { idempotency_key: 'wrong-anchor' }
  }), { code: 'TRACE_PHASE_4_ARRIVAL_SUBJECT_STATE_INVALID' });
  const wrongCondition = structuredClone(contracts);
  wrongCondition.actors.onisim_boatman.machine_state.body_condition.state =
    'able_to_walk';
  assert.throws(() => routeToShedEffect({
    contracts: wrongCondition,
    inputDigest: '4'.repeat(64),
    state: routeState(),
    playerInput: { idempotency_key: 'wrong-condition' }
  }), { code: 'TRACE_PHASE_4_ARRIVAL_SUBJECT_STATE_INVALID' });
});

test('Ratsha decision admits only an NPC-runtime selection matching the checked outcome', async () => {
  const select = async (request) => { assert.deepEqual(validateSpatialV3Contract('npc_decision_request', request), []); return { request_id: request.request_id, state_version: request.state_version, option_id: 'surrender_and_confess', command_token: request.options.find((option) => option.option_id === 'surrender_and_confess').command_token }; };
  const success = await resolveTracePhase4NpcDecision({ state: state(), contracts, checkResult: { outcome: { success: true } }, inputDigest: 'd'.repeat(64), selectNpcDecision: select });
  assert.equal(success.outcome, 'surrender');
  await assert.rejects(() => resolveTracePhase4NpcDecision({ state: state(), contracts, checkResult: { outcome: { success: true } }, inputDigest: 'e'.repeat(64), selectNpcDecision: async (request) => ({ request_id: request.request_id, state_version: request.state_version, option_id: 'attack_and_escape', command_token: 'foreign' }) }), { code: 'TRACE_PHASE_4_NPC_OPTION_REJECTED' });
});

test('attack produces a separate two-minute player-response boundary without harm or escape', async () => {
  const decision = await resolveTracePhase4NpcDecision({ state: state(), contracts, checkResult: { outcome: { success: false } }, inputDigest: 'f'.repeat(64), selectNpcDecision: async (request) => ({ request_id: request.request_id, state_version: request.state_version, option_id: 'attack_and_escape', command_token: request.options[0].command_token }) });
  const result = negotiationEffect({ contracts, inputDigest: 'b'.repeat(64), checkResult: { outcome: { success: false } }, decision });
  assert.equal(result.duration_minutes, 10);
  assert.equal(result.negotiation.offer_committed_before_check, true);
  assert.deepEqual(result.negotiation.player_response_boundary, {
    activity_ref: 'activity:attack_and_escape',
    time_profile_ref: 'trace_ld_v1_time_2m',
    duration_minutes: 2,
    status: 'player_response_required',
    automatic_harm: false,
    automatic_escape: false
  });
  assert.deepEqual(result.negotiation.activity_roots.map((root) => root.duration_minutes), [10, 2]);
  assert.deepEqual(result.negotiation.attack_facts, [
    'ratsha_attack_attempt_committed',
    'ratsha_attack_player_response_required'
  ]);
});

test('Phase 4 exposes Ratsha surrender marker only for surrender', async () => {
  const projector = createTracePhase4VisibleProjector({
    phase3Projector: { project: async () => assert.fail('unexpected fallback') }
  });
  for (const responseKind of ['surrender', 'speech', 'lie', 'bargain',
    'combat_handoff']) {
    const visible = await projector.project({ consequence: {
      phase4_kind: 'negotiation', negotiation: { semantic_exchange:
        semanticExchange(responseKind) }
    } });
    assert.equal(visible.visible_changes.includes('ratsha_surrendered'),
      responseKind === 'surrender');
  }
  const legacy = await projector.project({ consequence: {
    phase4_kind: 'negotiation', negotiation: { npc_decision: {
      outcome: 'surrender'
    } }
  } });
  assert.ok(legacy.visible_changes.includes('ratsha_surrendered'));
});

test('Phase 4 temporal owner commits route once and preserves separate negotiation roots', async () => {
  const route = routeToShedEffect({
    contracts,
    inputDigest: '1'.repeat(64),
    state: routeState(),
    playerInput: { idempotency_key: 'route-time' }
  });
  const advance = createTracePhase4TemporalAdvance({
    phase3Advance: async () => {
      throw new Error('unexpected fallback');
    }
  });
  const movement = await advance({
    consequence: route,
    clock_before: routeState().clock,
    exact_elapsed: {
      exact_minutes: { numerator: '12', denominator: '1' }
    },
    relevant_state: { temporal_boundary_candidates: [] }
  });
  assert.equal(movement.clock_after.whole_minutes, '22');
  assert.equal(movement.boundary_trace.owner, 'movement_route_owner');
  assert.equal(movement.boundary_trace.policy,
    'commit_only_with_empty_boundary_candidate_set');
  await assert.rejects(() => advance({
    consequence: route,
    clock_before: routeState().clock,
    relevant_state: {
      temporal_boundary_candidates: [{ boundary_id: 'perception-boundary' }]
    }
  }), { code: 'TRACE_PHASE_4_TEMPORAL_BOUNDARY_PENDING' });

  const attack = negotiationEffect({
    contracts,
    inputDigest: '2'.repeat(64),
    checkResult: { outcome: { success: false } },
    decision: {
      outcome: 'attack',
      continuation: {
        activity_ref: 'trace_ld_v1_time_2m',
        duration_minutes: 2,
        status: 'player_response_required',
        automatic_harm: false,
        automatic_escape: false
      }
    }
  });
  const negotiation = await advance({
    consequence: attack,
    clock_before: routeState().clock,
    exact_elapsed: {
      exact_minutes: { numerator: '10', denominator: '1' }
    },
    relevant_state: { temporal_boundary_candidates: [] }
  });
  assert.equal(negotiation.clock_after.whole_minutes, '22');
  assert.deepEqual(
    negotiation.boundary_trace.activity_roots
      .map(({ duration_minutes }) => duration_minutes),
    [10, 2]
  );
  await assert.rejects(() => advance({
    consequence: attack,
    clock_before: routeState().clock,
    relevant_state: {
      temporal_boundary_candidates: [{ boundary_id: 'body-threshold' }]
    }
  }), { code: 'TRACE_PHASE_4_TEMPORAL_BOUNDARY_PENDING' });
});

test('command availability exposes exact influence/communication DC 13 modifiers', async () => {
  const [, negotiation] = createTracePhase4Commands({ contracts, inputDigest: 'c'.repeat(64), selectNpcDecision: async () => null });
  const available = await negotiation.availability({ retrievedState: {
    actor_id: 'player',
    position: { location_ref: 'shed' },
    route_knowledge: ['camp-to-shed'],
    body_state: { health: 9 },
    promise_instances: [{
      current_state: 'not_offered',
      obligation_id: 'promise-instance',
      policy_ref: { id: 'promise', revision: 1 },
      promisor_actor_id: 'player',
      beneficiary_actor_id: 'ratsha',
      witness_actor_ids: ['eremey', 'fisher'],
      scope_snapshot: { protection: 'bounded' }
    }],
    temporal_boundary_candidates: [],
    player_response_boundary: null
  } });
  assert.equal(available.status, 'check_required');
  assert.equal(available.causal_stages[0].audit_ordinal, 0);
  assert.equal(available.causal_stages[0].fact_id,
    'promise_current_offered');
  assert.equal(available.check_requests[0].audit_ordinal, 1);
  assert.equal(
    available.check_requests[0].causal_predecessor_stage_digest,
    available.causal_stages[0].stage_digest
  );
  assert.deepEqual({
    check_id: available.check_requests[0].check_id,
    difficulty: available.check_requests[0].difficulty,
    attribute: available.check_requests[0].attribute,
    skill: available.check_requests[0].skill,
    state_modifier: available.check_requests[0].state_modifier,
    equipment_modifier: available.check_requests[0].equipment_modifier,
    circumstance_modifier: available.check_requests[0].circumstance_modifier
  }, { check_id: 'ratsha-check', difficulty: 13, attribute: 'influence',
    skill: 'communication', state_modifier: -1, equipment_modifier: 0,
    circumstance_modifier: 1 });
  const blocked = await negotiation.availability({ retrievedState: {
    actor_id: 'player',
    position: { location_ref: 'shed' },
    route_knowledge: ['camp-to-shed'],
    body_state: { health: 9 },
    promise_instances: [{
      current_state: 'not_offered', obligation_id: 'promise-instance',
      policy_ref: { id: 'promise', revision: 1 },
      promisor_actor_id: 'player', beneficiary_actor_id: 'ratsha',
      witness_actor_ids: ['eremey', 'fisher'],
      scope_snapshot: { protection: 'bounded' }
    }],
    temporal_boundary_candidates: [{ boundary_id: 'npc-schedule' }],
    player_response_boundary: null
  } });
  assert.equal(blocked.status, 'blocked');
  assert.deepEqual(blocked.check_requests, []);
});

function state() {
  return { party_state: { state_version: 1 }, clock: { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' } };
}

function routeState() {
  return {
    party_id: 'party',
    actor_id: 'player',
    party_state: { state_version: 1, turn_number: 0 },
    position: { location_ref: 'camp', g5_anchor_id: 'camp-anchor' },
    clock: {
      whole_minutes: '10',
      subminute_numerator: '0',
      subminute_denominator: '1'
    },
    player_profile: { attributes: { strength: { value: 9 } } },
    items: [],
    world_identity: { world_id: 'world' }
  };
}

function executionBinding(option_id) {
  if (option_id !== 'attack_and_escape') {
    return {
      policy_id: 'trace_ld_v1_npc_ratsha_decisions',
      option_id,
      execution_binding_id: `execution:${option_id}`,
      execution_kind: 'bounded_decision'
    };
  }
  return {
    policy_id: 'trace_ld_v1_npc_ratsha_decisions',
    option_id,
    execution_binding_id: `execution:${option_id}`,
    execution_kind: 'attack_attempt_then_mandatory_player_boundary',
    activity_profile_refs: ['activity:attack_and_escape'],
    time_contract: {
      roots: [{
        root_ref: 'activity:attack_and_escape',
        time_profile_ref: 'trace_ld_v1_time_2m',
        clock_write: 'single_if_completed'
      }]
    }
  };
}

function semanticExchange(response_kind) {
  const utterance = 'Слова Ратши.';
  return {
    response_kind,
    statements: [{ statement_id: 'ratsha-statement',
      speaker_ref: { entity_kind: 'npc' }, utterance_text: utterance }],
    audiences: [{ statement_ref: { entity_kind: 'conversation_statement',
      entity_id: 'ratsha-statement' }, received_messages: [{
      listener_ref: { entity_kind: 'player_character' }, comprehension: 'full',
      utterance_text: utterance
    }] }]
  };
}
