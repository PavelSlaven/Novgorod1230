import { addElapsedTime } from '@rus/time-events-history';
import {
  getCommittedInventoryLoad
} from './lower-dvina-trace-committed-inventory.js';
import {
  executeTraceLocalTraversal
} from './lower-dvina-trace-local-traversal.js';

export function createTracePhase4Consequence({ inputDigest, duration, kind, detail }) {
  return { version: 1, schema: 'turn_consequence_package', status: 'resolved',
    activity_attempt_id: `attempt:${inputDigest.slice(0, 32)}`, duration_minutes: duration,
    phase4_kind: kind, ...detail, visible_seed: {}, hidden_update: {}, state_changes: [], suggested_actions: [] };
}

export function routeToShedEffect({
  contracts, inputDigest, state, playerInput
}) {
  const onisim = contracts.actors.onisim_boatman;
  const bodyCondition = onisim.machine_state?.body_condition;
  if (onisim.anchor_id !== contracts.anchors.shed
      || bodyCondition?.condition_profile_ref
        !== contracts.observation.trigger.subject_body_condition_ref
      || !contracts.observation.trigger.allowed_subject_states.includes(
        bodyCondition?.state
      )) {
    fail('TRACE_PHASE_4_ARRIVAL_SUBJECT_STATE_INVALID');
  }
  const inventory = getCommittedInventoryLoad(state);
  if (!inventory.mass.pass || !inventory.hands.pass
      || !inventory.load.pass) {
    fail('TRACE_PHASE_4_INVENTORY_LOAD_INVALID');
  }
  const participants = [
    state.actor_id,
    contracts.actors.eremey_fisher.instance_id,
    contracts.actors.participating_fisher.instance_id
  ];
  const traversal = executeTraceLocalTraversal({
    state,
    playerInput,
    inputDigest,
    namespace: 'trace-phase4',
    route: contracts.route,
    activity: contracts.routeActivity,
    sourceEndpoint: contracts.sourceEndpoint,
    destinationEndpoint: contracts.destinationEndpoint,
    destinationLocationRef: contracts.ids.shed,
    destinationAnchorId: contracts.anchors.shed,
    accessPolicy: contracts.access,
    capacityContract: contracts.capacity,
    inventoryLoad: {
      total_mass_grams: inventory.mass.total_mass_grams,
      hands_used: inventory.hands.hands_used,
      load_category: inventory.load.load_category
    },
    participantGroup: participants
  });
  return createTracePhase4Consequence({ inputDigest, duration: 12, kind: 'movement', detail: {
    movement: { activity_ref: contracts.routeActivity.profile_id, route_ref: contracts.route.route_id,
      source_location_ref: state.position.location_ref, destination_location_ref: contracts.ids.shed,
      participants,
      route_knowledge: 'known', navigation_check: null,
      reverse_route_ref: contracts.reverseRoute.route_id,
      reverse_route_digest: contracts.reverseRoute.digest,
      arrival_observation_ref: contracts.ids.observation, onisim_status: 'alive_observed',
      inventory_load: structuredClone(traversal.inventory_load),
      traversal }
  } });
}

export function negotiationEffect({
  contracts,
  inputDigest,
  checkResult,
  decision,
  offerStage,
  checkRequest
}) {
  const outcomeRef = contracts.check.outcome_refs[checkResult.outcome.success ? 'success' : 'failure'];
  const optionId = decision.trace?.option_id;
  const confession = decision.trace?.option_id === 'surrender_and_confess'
    ? {
        statement_ref: contracts.confessionStatement.statement_template_id,
        assertion: structuredClone(contracts.confessionStatement.assertion),
        content_scope: contracts.confessionStatement.assertion.content_scope,
        effect_contract_ref:
          contracts.confessionEffect.statement_effect_contract_id,
        required_audience_ids: [
          contracts.actors.eremey_fisher.instance_id,
          contracts.actors.participating_fisher.instance_id
        ],
        truth_projection: 'forbidden',
        requires_independent_confirmation: true
      }
    : null;
  const threat = optionId === 'threaten_and_bargain'
    ? {
        effect_contract_ref:
          contracts.threatEffect.statement_effect_contract_id,
        source_rule: contracts.threatEffect.source_rule,
        audience_rule: contracts.threatEffect.audience_rule,
        required_audience_ids: [
          contracts.actors.eremey_fisher.instance_id,
          contracts.actors.participating_fisher.instance_id
        ],
        truth_projection: 'forbidden'
      }
    : null;
  const attackFacts = optionId === 'attack_and_escape'
    ? [
        'ratsha_attack_attempt_committed',
        'ratsha_attack_player_response_required'
      ]
    : [];
  return createTracePhase4Consequence({ inputDigest, duration: 10, kind: 'negotiation', detail: {
    negotiation: { activity_ref: contracts.negotiation.profile_id, offer_committed_before_check: true,
      offer_stage: structuredClone(offerStage),
      check_request: structuredClone(checkRequest),
      check_result: structuredClone(checkResult), outcome_ref: outcomeRef, npc_decision: structuredClone(decision),
      participating_fisher_id: contracts.actors.participating_fisher.instance_id,
      promise_state: 'offer_only', objective_fact_outputs: [],
      confession, threat, attack_facts: attackFacts,
      player_response_boundary: decision.continuation,
      activity_roots: decision.continuation ? [{ activity_ref: contracts.negotiation.profile_id, duration_minutes: 10 }, { activity_ref: decision.continuation.activity_ref, duration_minutes: 2, status: 'player_response_required', automatic_harm: false, automatic_escape: false }] : [{ activity_ref: contracts.negotiation.profile_id, duration_minutes: 10 }] }
  } });
}

export function createTracePhase4TemporalAdvance({ phase3Advance }) {
  return async (input) => {
    if (input.consequence?.phase4_kind == null) return phase3Advance(input);
    const candidates = input.relevant_state.temporal_boundary_candidates;
    if (!Array.isArray(candidates)) fail('TRACE_PHASE_4_TEMPORAL_STATE_INVALID');
    if (candidates.length > 0) {
      fail('TRACE_PHASE_4_TEMPORAL_BOUNDARY_PENDING');
    }
    if (input.consequence.phase4_kind === 'movement') {
      const traversal = input.consequence.movement.traversal;
      if (traversal.interval_result.clock_commit_mode !== 'direct_party_clock'
          || traversal.interval_result.actual_time_numerator !== '12'
          || traversal.interval_result.actual_time_denominator !== '1') {
        fail('TRACE_PHASE_4_TEMPORAL_STATE_INVALID');
      }
      return temporalResult({
        before: traversal.clock_before,
        after: traversal.clock_update.world_time_after,
        exactMinutes: 12,
        owner: 'movement_route_owner',
        candidates,
        roots: [{ activity_ref: input.consequence.movement.activity_ref,
          duration_minutes: 12 }]
      });
    }
    const roots = input.consequence.negotiation.activity_roots;
    const minutes = roots.reduce(
      (sum, root) => sum + Number(root.duration_minutes), 0
    );
    return temporalResult({
      before: input.clock_before,
      after: addElapsedTime(input.clock_before, {
        exact_minutes: { numerator: String(minutes), denominator: '1' }
      }),
      exactMinutes: minutes,
      owner: '@rus/time-events-history/temporal-boundaries',
      candidates,
      roots
    });
  };
}

export function createTracePhase4VisibleProjector({ phase3Projector }) {
  return { async project(input) {
    if (input.consequence?.phase4_kind == null) return phase3Projector.project(input);
    const c = input.consequence;
    if (c.phase4_kind === 'movement') return { version: 1, schema: 'visible_context_package', visible_scene: 'У старой сушильни Онисим жив, ранен и не может идти; Ратша здесь.', visible_changes: ['onisim_found_alive'], sensory_details: [], visible_npc: [], visible_objects: [], known_context: ['Ратша присутствует; ситуация требует решения.'], uncertainties: ['Причины случившегося не установлены.'], allowed_tensions: ['danger'], do_not_imply: ['hidden_truth', 'zhdanko_motive'] };
    return { version: 1, schema: 'visible_context_package', visible_scene: c.negotiation.npc_decision.outcome === 'surrender' ? 'Ратша сдался.' : 'Ратша не принял сдачу.', visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: ['objective_truth'] };
  } };
}

function temporalResult({ before, after, exactMinutes, owner, candidates, roots }) {
  return {
    clock_before: structuredClone(before),
    clock_after: structuredClone(after),
    exact_elapsed: {
      exact_minutes: { numerator: String(exactMinutes), denominator: '1' }
    },
    nearest_boundary: null,
    boundary_trace: {
      owner,
      policy: 'commit_only_with_empty_boundary_candidate_set',
      evaluated_candidate_count: candidates.length,
      processed_boundary_ids: [],
      activity_roots: structuredClone(roots)
    }
  };
}

function fail(code) {
  const error = new Error('The approved Phase 4 effect is incomplete.');
  error.code = code;
  throw error;
}
