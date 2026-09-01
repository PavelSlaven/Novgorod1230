import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { integrateSpatialV3TemporalWriteFragments } from
  '@rus/turn/spatial-v3-temporal-write-integration';
import { serverError } from '../../errors.js';
import { expected, sealedCheck } from './first-playable/plan-shared.js';
import { TABLES } from './spatial-v3-write-layout.js';
import {
  bindLowerDvinaTraceTurnStepIdempotency
} from './lower-dvina-trace-turn-step-idempotency.js';
import { buildActorInstanceRechecks } from
  './lower-dvina-trace-turn-step-actor-rechecks.js';
import { ordinaryPhysicalKeys } from './lower-dvina-trace-ordinary-p16.js';
import { actionProducedPhysicalKeys,
  createActionProducedAtomicWritePlan } from
  './action-produced-atomic-write-plan.js';
import { localFirePhysicalKeys } from './local-fire-atomic-write-plan.js';
import { createSpatialSemanticAtomicWritePlan, spatialSemanticPhysicalKeys } from './spatial-semantic-atomic-write-plan.js';

export async function buildLowerDvinaTraceTurnStepCommitPlan({
  partyId, state, envelope, inputDigest, visibleEnvelope, writes,
  turnNumber, changeSetId, idemId, ordinaryPlan = null,
  actionProductionPlans = [], localFirePlans = [], spatialSemanticPlan = null,
  temporalResults = []
}) {
  const actionPlans = actionProductionPlans.map((plan) =>
    createActionProducedAtomicWritePlan(plan));
  const semanticPlan = spatialSemanticPlan == null ? null
    : createSpatialSemanticAtomicWritePlan(spatialSemanticPlan);
  if (actionPlans.some((plan) => plan.actor_ref !== state.actor_id)) {
    throw serverError(
      'TRACE_TURN_STEP_ACTION_PRODUCTION_ACTOR_MISMATCH',
      'The action-production plan is not bound to the committed actor.',
      { status: 409 }
    );
  }
  const canonicalInputDigest = normalizeDigest(inputDigest);
  if (!Array.isArray(temporalResults)) {
    throw serverError('TRACE_TURN_STEP_TEMPORAL_RESULT_INVALID',
      'Temporal results must be an ordered array.', { status: 409 });
  }
  let integrated = { ok: true, input: {
    plan_id: `p16:${partyId}:turn-step:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_turn_step',
    canonical_input_digest: canonicalInputDigest,
    expected_state_versions: expectedVersions(state, writes),
    validation_report: {
      status: 'pass',
      digest: normalizeDigest(canonicalDigest({
        envelope,
        visible_package_digest: visibleEnvelope.package_digest
      }))
    },
    idempotency: {
      id: idemId,
      key: envelope.player_input.idempotency_key,
      ...bindLowerDvinaTraceTurnStepIdempotency({
        envelope,
        inputDigest,
        semanticCommandSnapshot: {
          schema: 'rus.lower_dvina_trace_turn_step_command_snapshot.v1',
          input_digest: inputDigest,
          raw_text: envelope.player_input.raw_text,
          action_set_digest:
            envelope.mode_resolution.decision_trace.action_set_digest,
          selected_option_id: envelope.mode_resolution.option_id,
          semantic_trace:
            structuredClone(envelope.mode_resolution.decision_trace)
        },
        semanticCommandDigest: null,
        semanticDependencyPins: null,
        visibleDependencyPins: visibleEnvelope.dependency_pins,
        deriveVisiblePinsFromEnvelope: true
      }),
      request_id: envelope.player_input.request_id
    },
    change_set: { id: changeSetId },
    visible_package_envelope: visibleEnvelope,
    approved_write_sets: [writes],
    lock_context: {
      owner_keys: [`actor:${state.actor_id}`],
      execution_keys: [],
      g4_keys: [],
      physical_keys: [...Object.values(writes).flat().map(
        (write) => `party_runtime.${write.target_table}:${write.id}`
      ), ...ordinaryPhysicalKeys(ordinaryPlan),
      ...actionPlans.flatMap(actionProducedPhysicalKeys),
      ...localFirePlans.flatMap(localFirePhysicalKeys),
      ...spatialSemanticPhysicalKeys(semanticPlan)]
    },
    ordinary_materialization_atomic_write_plan: ordinaryPlan,
    action_production_atomic_write_plans: actionPlans,
    local_fire_atomic_write_plans: localFirePlans,
    spatial_semantic_atomic_write_plan: semanticPlan,
    commit_rechecks: commitRechecks({
      partyId, state, envelope, inputDigest, writes
    })
  } };
  for (const temporalResult of temporalResults) {
    integrated = integrateSpatialV3TemporalWriteFragments({
      base_write_plan_input: integrated.input,
      temporal_result: temporalResult
    });
    if (!integrated.ok) {
      throw serverError('TRACE_TURN_STEP_TEMPORAL_WRITE_CONFLICT',
        'Temporal result conflicts with the semantic turn write plan.',
        { status: 409, details: integrated.error });
    }
  }
  const approvedInputDigest = integrated.input.canonical_input_digest;
  const builder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({
      ok: candidate.party_id === partyId
        && candidate.operation_kind === 'trace_turn_step'
        && candidate.canonical_input_digest === approvedInputDigest
    })
  });
  const built = await builder.build(integrated.input);
  if (!built.ok) {
    throw serverError(
      'TRACE_TURN_STEP_WRITE_PLAN_REJECTED',
      'P16 rejected the semantic turn-step write plan.',
      { status: 409, details: built.error }
    );
  }
  return built;
}

function expectedVersions(state, writes) {
  return writes.updates
    .filter(({ target_table: table }) => TABLES[table]?.version === true)
    .map((write) => expected(write.target_table, write.id,
      turnStepCurrentVersion(state, write)));
}

export function turnStepCurrentVersion(state, write) {
  const known = {
    parties: state.party_state.state_version,
    party_server_sessions: state.party_state.session_state_version,
    party_clocks: state.party_state.clock_state_version,
    party_actor_body_states: state.party_state.body_state_version,
    party_journey_locations: state.journey_location?.state_version
  }[write.target_table];
  if (Number.isSafeInteger(known) && known >= 0) return known;
  if (write.target_table === 'party_actor_active_conditions') {
    const condition = (state.body_state.active_conditions ?? []).find(
      ({ storage_condition_id: id }) =>
        write.id === `player_character:${state.actor_id}:${id}`
    );
    if (Number.isSafeInteger(condition?.state_version)
        && condition.state_version >= 0) return condition.state_version;
  }
  const item = (state.items ?? []).find(({ item_id: id }) => id === write.id);
  const container = (state.containers ?? []).find(
    ({ container_id: id }) => id === write.id);
  if (write.target_table === 'party_containers'
      && Number.isSafeInteger(container?.state_version)
      && container.state_version >= 0) {
    return container.state_version;
  }
  const itemVersion = write.target_table === 'party_item_placements'
    ? item?.placement?.state_version ?? item?.placement_state_version
    : item?.state_version;
  if (Number.isSafeInteger(itemVersion) && itemVersion >= 0) {
    return itemVersion;
  }
  throw serverError(
    'TRACE_TURN_STEP_NORMALIZED_VERSION_MISSING',
    'A semantic update lacks its committed normalized row version.',
    { status: 409, details: {
      target_table: write.target_table,
      id: write.id
    } }
  );
}

function commitRechecks({ partyId, state, envelope, inputDigest, writes }) {
  return [
    sealedCheck('physical', {
      party_id: partyId,
      location_ref: state.position?.location_ref ?? null,
      g5_anchor_id: state.position?.g5_anchor_id ?? null
    }),
    sealedCheck('state', {
      party_id: partyId,
      expected_party_state_version: state.party_state.state_version
    }),
    sealedCheck('pin', {
      decision_trace_digest:
        canonicalDigest(envelope.mode_resolution.decision_trace)
    }),
    sealedCheck('endpoint', { destination_ref: null }),
    sealedCheck('route', { route_binding_ref: null }),
    sealedCheck('capacity', { party_id: partyId }),
    sealedCheck('time', {
      expected_clock_state_version: state.party_state.clock_state_version
    }),
    sealedCheck('change_set', { canonical_input_digest: inputDigest }),
    ...s1LocalMovementRecheck({ partyId, state, envelope }),
    ...buildActorInstanceRechecks(state, writes)
  ];
}

function s1LocalMovementRecheck({ partyId, state, envelope }) {
  const transition = envelope.consequence?.position_transition;
  if (transition?.owner !== '@rus/movement-routes') return [];
  if (!state.journey_location?.id
      || !Number.isSafeInteger(Number(state.journey_location.state_version))) {
    throw serverError('TRACE_S1_MOVEMENT_TRANSITION_INVALID',
      'S1 local movement lacks its committed journey location.', { status: 409 });
  }
  return [sealedCheck('s1_local_movement', {
    party_id: partyId,
    actor_id: state.actor_id,
    journey_location_id: state.journey_location.id,
    expected_journey_state_version: Number(state.journey_location.state_version),
    from_position_ref: transition.from_position_ref,
    to_position_ref: transition.to_position_ref,
    movement_edge_ref: transition.movement_edge_ref,
    movement_admission: transition.movement_admission
  })];
}

const normalizeDigest = (value) =>
  `sha256:${String(value).replace('sha256:', '')}`;
