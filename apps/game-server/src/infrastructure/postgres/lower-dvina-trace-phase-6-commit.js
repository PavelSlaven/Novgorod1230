import { canonicalDigest } from '@rus/materialization';
import { committedPendingPhase2PublicResult } from
  './lower-dvina-trace-phase-2-projection.js';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { integrateSpatialV3TemporalWriteFragments } from
  '@rus/turn/spatial-v3-temporal-write-integration';
import { serverError } from '../../errors.js';
import { expected, sealedCheck } from './first-playable/plan-shared.js';
import {
  phase6TargetedAdmissionEvidence,
  phase6TargetedAdmissionPhysicalKeys
} from
  './first-playable/recheck-phase6-admission.js';
import { assertPhase2CurrentStateVersion } from
  './lower-dvina-trace-phase-2-commit-admission.js';
import { expectedChangedConditions } from './lower-dvina-trace-phase-3-commit-support.js';
import { nextPhase6State } from './lower-dvina-trace-phase-6-state.js';
import { validatePhase6TemporalFragments } from './lower-dvina-trace-phase-6-temporal-fragments.js';
import {
  phase6PendingScreen,
  phase6VisibleEnvelope,
  phase6Writes
} from './lower-dvina-trace-phase-6-writes.js';
import {
  mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence
} from './lower-dvina-trace-turn-step-persistence.js';
import { bindLowerDvinaTraceFactualTurnStepIdempotency } from
  './lower-dvina-trace-turn-step-idempotency.js';

export async function commitLowerDvinaTracePhase6({ partyId, writePlan,
  inputDigest, phase6Contracts, loadState, committer }) {
  const factual = target(writePlan, 'party_state');
  const visibleContext = target(writePlan,
    'party_visible_context_package');
  if (factual?.consequence?.phase6_kind !== 'synchronized_carry'
      || factual.consequence.carry?.intent?.root_clock_write_count !== 1
      || !visibleContext) {
    fail('TRACE_PHASE_6_WRITE_PLAN_INVALID');
  }
  const state = await loadState(partyId, {
    presentationIdempotencyKey: factual.player_input.idempotency_key
  });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:trace-phase6:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    factual.player_input.idempotency_key
  ).slice(0, 20)}`;
  assertOwnerResult({ factual, state, changeSetId, idemId, phase6Contracts });
  let next = nextPhase6State({ state, factual, nextVersion, turnNumber,
    changeSetId, inputDigest });
  const visibleEnvelope = phase6VisibleEnvelope({
    partyId, nextVersion, turnNumber, changeSetId, idemId, factual,
    visibleContext
  });
  next.last_turn.visible_package = {
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    change_set_id: changeSetId
  };
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({
    partyId, writePlan, state, snapshot: next, factual, changeSetId, idemId
  });
  next = turnStep.snapshot;
  const pendingScreen = phase6PendingScreen({
    state, factual, visibleEnvelope, turnNumber, nextVersion
  });
  const writes = mergeLowerDvinaTraceTurnStepWrites(phase6Writes({ partyId,
    state, next, factual, turnNumber, changeSetId, idemId, visibleEnvelope,
    pendingScreen }), turnStep.writes);
  const builder = createCombinedWritePlanBuilder({
      verifyApproval: async (candidate) => ({
        ok: candidate.party_id === partyId
          && candidate.operation_kind === 'trace_phase_6_carry'
      })
    });
  const baseInput = {
    plan_id: `p16:${partyId}:trace-phase6:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_phase_6_carry',
    canonical_input_digest: normalizeDigest(inputDigest),
    expected_state_versions: expectedVersions({ state, factual }),
    validation_report: {
      status: 'pass',
      digest: normalizeDigest(canonicalDigest(factual))
    },
    idempotency: {
      id: idemId,
      key: factual.player_input.idempotency_key,
      ...bindLowerDvinaTraceFactualTurnStepIdempotency({
        envelope: writePlan.turn_step_commit,
        inputDigest, factual,
        semanticCommandDigest: normalizeDigest(canonicalDigest({
          input_digest: inputDigest,
          option_id: factual.mode_resolution.option_id
        })),
        semanticDependencyPins:
          factual.consequence.carry.traversal.dependency_pins,
        visibleDependencyPins: visibleEnvelope.dependency_pins
      }),
      request_id: factual.player_input.request_id
    },
    change_set: { id: changeSetId },
    visible_package_envelope: visibleEnvelope,
    approved_write_sets: [writes],
    lock_context: {
      owner_keys: ownerKeys(factual, state),
      execution_keys: [
        factual.consequence.carry.intent.execution_id,
        factual.consequence.carry.traversal.ids.execution_id
      ],
      g4_keys: [],
      physical_keys: [...new Set([
        ...Object.values(writes).flat().map(
          (write) => `party_runtime.${write.target_table}:${write.id}`
        ),
        ...phase6TargetedAdmissionPhysicalKeys(
          factual.consequence.carry.intent,
          partyId
        )
      ])]
    },
    commit_rechecks: commitRechecks({ partyId, state, factual,
      phase6Contracts, inputDigest })
  };
  validatePhase6TemporalFragments({ partyId, state,
    intent: factual.consequence.carry.intent, changeSetId });
  const integrated = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: baseInput,
    temporal_result:
      factual.consequence.carry.intent.temporal_advance_result
  });
  if (!integrated.ok) fail('TRACE_PHASE_6_TEMPORAL_WRITE_CONFLICT',
    integrated.error);
  const built = await builder.build(integrated.input);
  if (!built.ok) fail('TRACE_PHASE_6_WRITE_PLAN_REJECTED', built.error);
  const committedPublicResult = committedPendingPhase2PublicResult({
    payload: next, screen: pendingScreen
  });
  const committed = await committer.commit({
    plan: built.plan,
    created_at_turn: turnNumber
  });
  if (!committed.ok) fail('TRACE_PHASE_6_COMMIT_FAILED', committed.error);
  return {
    ...committed,
    state_version: nextVersion,
    turn_number: turnNumber,
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    committed_public_result: committedPublicResult
  };
}
export async function buildLowerDvinaTracePhase6Commit({ partyId, factual,
  state, inputDigest, visibleContext, phase6Contracts }) {
  const writePlan = {
    base_state_version: state.party_state.state_version,
    write_targets: [{ target: 'party_state', value: factual }, {
      target: 'party_visible_context_package', value: visibleContext
    }]
  };
  let captured = null;
  await commitLowerDvinaTracePhase6({
    partyId, writePlan, inputDigest, phase6Contracts,
    loadState: async () => state,
    committer: { async commit(input) {
      captured = input;
      return { ok: true };
    } }
  });
  return captured;
}
function assertOwnerResult({ factual, state, changeSetId, idemId,
  phase6Contracts }) {
  const carry = factual.consequence.carry;
  const intent = carry.intent;
  const interval = carry.traversal?.interval_result;
  if (carry.traversal?.owner !== '@rus/movement-routes'
      || interval?.result_change_set_id !== changeSetId
      || interval.idempotency_record_id !== idemId
      || Number(interval.progress_before_ppm) !== intent.progress_before_ppm
      || Number(interval.actual_progress_after_ppm)
        !== intent.progress_after_ppm
      || interval.actual_time_numerator !== intent.exact_elapsed.numerator
      || interval.actual_time_denominator !== '1'
      || carry.traversal.planning_state_version
        !== state.party_state.state_version
      || factual.time_update.clock_after.whole_minutes
        !== carry.traversal.clock_update.world_time_after.whole_minutes
      || (intent.execution_after.status === 'completed'
        && !validTerminalEnvironment(intent, phase6Contracts))) {
    fail('TRACE_PHASE_6_OWNER_RESULT_INVALID');
  }
}

function validTerminalEnvironment(intent, contracts) {
  const snapshot = intent.terminal_environment_snapshot;
  if (snapshot == null) return false;
  const { scope, causal_basis: causalBasis, ...profile } = snapshot;
  return canonicalDigest(profile) === canonicalDigest(
    contracts.terminalEnvironment)
    && canonicalDigest(scope) === canonicalDigest({
      location_ref: intent.terminal_group_position.location_ref,
      g5_node_id: intent.terminal_group_position.g5_node_id,
      g5_anchor_id: intent.terminal_group_position.g5_anchor_id,
      zone_ref: intent.terminal_group_position.zone_ref
    })
    && causalBasis?.kind === 'authored_terminal_environment'
    && causalBasis.environment_profile_ref
      === contracts.terminalEnvironment.environment_profile_id
    && causalBasis.route_ref === contracts.route.route_id
    && causalBasis.anchor_template_ref
      === contracts.terminalPlacement.group.anchor_template_ref;
}
function expectedVersions({ state, factual }) {
  const intent = factual.consequence.carry.intent;
  const values = [
    expected('parties', state.party_id, state.party_state.state_version),
    expected('party_server_sessions', state.party_id,
      state.party_state.session_state_version),
    expected('party_clocks', state.party_id,
      state.party_state.clock_state_version)
  ];
  if (factual.body_update?.applied === true) {
    values.push(expected('party_actor_body_states',
      `player_character:${state.actor_id}`,
      state.party_state.body_state_version));
    values.push(...expectedChangedConditions(state,
      factual.body_update.state_after));
  }
  if (state.phase6_carry_execution != null) {
    values.push(expected('party_timed_activity_executions',
      intent.execution_id, intent.attempt.ordinal + 1));
    values.push(expected('party_route_plan_executions',
      factual.consequence.carry.traversal.ids.execution_id,
      intent.attempt.ordinal + 2));
    values.push(expected('traveller_travel_states',
      factual.consequence.carry.traversal.ids.travel_state_id,
      intent.attempt.ordinal));
  }
  if (usesPreparedS1Arrival(state, factual) && state.journey_location != null) values.push(
    expected('party_journey_locations', state.journey_location.id,
      state.journey_location.state_version));
  return values;
}
function commitRechecks({ partyId, state, factual, phase6Contracts,
  inputDigest }) {
  const carry = factual.consequence.carry;
  return [
    sealedCheck('physical', {
      party_id: partyId,
      ...phase6TargetedAdmissionEvidence({ state, intent: carry.intent })
    }),
    sealedCheck('state', {
      party_id: partyId,
      expected_party_state_version: state.party_state.state_version
    }),
    sealedCheck('pin', {
      dependency_pins: carry.traversal.dependency_pins,
      route_ref: phase6Contracts.route.route_id
    }),
    sealedCheck('endpoint', {
      destination_ref: carry.traversal.target_endpoint
    }),
    sealedCheck('route', {
      route_binding_ref: carry.intent.route_ref,
      progress_before_ppm: carry.intent.progress_before_ppm
    }),
    sealedCheck('capacity', usesPreparedS1Arrival(state, factual) ? {
      party_id: partyId, capacity_model: 'world_route_s1_arrival',
      actor_id: state.actor_id,
      destination_position_id: state.first_entry_preparation.spatial_v3.target.position_id,
      destination_capacity: state.first_entry_preparation.spatial_v3.target.base_static_template.position.capacity,
      destination_access_class: state.first_entry_preparation.spatial_v3.target.base_static_template.position.access_class_id,
      expected_journey_state_version: state.journey_location?.state_version ?? null
    } : {
      party_id: partyId,
      contract_id: phase6Contracts.capacity.contract_id
    }),
    sealedCheck('time', {
      expected_clock_state_version: state.party_state.clock_state_version
    }),
    sealedCheck('change_set', { canonical_input_digest: inputDigest })
  ];
}
function usesPreparedS1Arrival(state, factual) {
  return factual.consequence.carry.intent.execution_after.status === 'completed'
    && state.first_entry_preparation?.spatial_v3?.target?.status === 'prepared';
}
function ownerKeys(factual, state) {
  const intent = factual.consequence.carry.intent;
  return [...new Set([
    `actor:${state.actor_id}`,
    ...intent.internal_rebinding.initial_carrier_ids.map(
      (id) => `actor:${id}`),
    `actor:${intent.internal_rebinding.replacement_carrier_id}`,
    `actor:${intent.carried_actor_id}`
  ])];
}

const target = (writePlan, name) => writePlan.write_targets
  .find(({ target: id }) => id === name)?.value;

const normalizeDigest = (value) =>
  `sha256:${String(value).replace('sha256:', '')}`;

function fail(code, details = null) {
  throw serverError(code, 'Phase 6 factual commit failed closed.', {
    status: 409,
    details
  });
}
