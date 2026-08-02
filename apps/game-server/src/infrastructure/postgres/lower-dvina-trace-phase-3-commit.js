import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { serverError } from '../../errors.js';
import {
  expected, sealedCheck
} from './first-playable/plan-shared.js';
import {
  assertPhase2CurrentStateVersion
} from './lower-dvina-trace-phase-2-commit-admission.js';
import {
  nextState,
  phase3ActivityRef
} from './lower-dvina-trace-phase-3-state.js';
import {
  pendingScreenFor,
  phase3Writes,
  visibleEnvelopeFor
} from './lower-dvina-trace-phase-3-write-projection.js';

export async function commitLowerDvinaTracePhase3({
  partyId,
  writePlan,
  inputDigest,
  phase3Contracts,
  loadState,
  committer
}) {
  const factual = target(writePlan, 'party_state');
  const visibleContext = target(
    writePlan,
    'party_visible_context_package'
  );
  if (!factual?.consequence?.phase3_kind || !visibleContext) {
    fail('TRACE_PHASE_3_WRITE_PLAN_INVALID');
  }
  const state = await loadState(partyId, {
    presentationIdempotencyKey:
      factual.player_input.idempotency_key
  });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:trace-phase3:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    factual.player_input.idempotency_key
  ).slice(0, 20)}`;
  const next = nextState({
    state, factual, nextVersion, turnNumber, inputDigest, changeSetId
  });
  const visibleEnvelope = visibleEnvelopeFor({
    partyId, nextVersion, turnNumber, changeSetId, idemId,
    visibleContext, factual, phase3Contracts
  });
  next.last_turn.visible_package = {
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    change_set_id: changeSetId
  };
  const pendingScreen = pendingScreenFor({
    state: next, factual, visibleEnvelope
  });
  const writes = phase3Writes({
    partyId, state, next, factual, visibleEnvelope, pendingScreen,
    nextVersion, turnNumber, changeSetId, idemId, inputDigest,
    phase3Contracts
  });
  const canonicalInputDigest = normalizeDigest(inputDigest);
  const builder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({
      ok: candidate.party_id === partyId
        && candidate.operation_kind === 'trace_phase_3_turn'
        && candidate.canonical_input_digest === canonicalInputDigest
    })
  });
  const built = await builder.build({
    plan_id: `p16:${partyId}:trace-phase3:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_phase_3_turn',
    canonical_input_digest: canonicalInputDigest,
    expected_state_versions: [
      expected('parties', partyId, state.party_state.state_version),
      expected('party_server_sessions', partyId,
        state.party_state.session_state_version),
      expected('party_clocks', partyId,
        state.party_state.clock_state_version),
      ...(factual.body_update?.applied === true ? [expected(
        'party_actor_body_states', `player_character:${state.actor_id}`,
        state.party_state.body_state_version
      ), ...expectedChangedConditions(state,
        factual.body_update.state_after)] : [])
    ],
    validation_report: {
      status: 'pass',
      digest: normalizeDigest(canonicalDigest({
        option_id: factual.mode_resolution.option_id,
        phase3_kind: factual.consequence.phase3_kind
      }))
    },
    idempotency: {
      id: idemId,
      key: factual.player_input.idempotency_key,
      semantic_command_snapshot: {
        schema: 'rus.lower_dvina_trace_command_snapshot.v2',
        input_digest: inputDigest,
        raw_text: factual.player_input.raw_text,
        action_set_digest:
          factual.mode_resolution.decision_trace.action_set_digest,
        selected_option_id: factual.mode_resolution.option_id,
        semantic_trace: factual.mode_resolution.decision_trace
      },
      semantic_command_digest: normalizeDigest(canonicalDigest({
        input_digest: inputDigest,
        selected_option_id: factual.mode_resolution.option_id
      })),
      semantic_dependency_pins: {
        activity: phase3Contracts.activityPins.find(
          ({ id }) => id === phase3ActivityRef(factual)
        )
      },
      request_id: factual.player_input.request_id
    },
    change_set: { id: changeSetId },
    visible_package_envelope: visibleEnvelope,
    approved_write_sets: [writes],
    lock_context: {
      owner_keys: [`actor:${state.actor_id}`],
      execution_keys: [],
      g4_keys: [],
      physical_keys: Object.values(writes).flat().map(
        (write) => `party_runtime.${write.target_table}:${write.id}`
      )
    },
    commit_rechecks: phase3CommitRechecks({
      partyId,
      state,
      factual,
      phase3Contracts,
      inputDigest
    })
  });
  if (!built.ok) {
    throw serverError(
      'TRACE_PHASE_3_WRITE_PLAN_REJECTED',
      'P16 rejected the Phase 3 factual write plan.',
      { status: 409, details: built.error }
    );
  }
  const committed = await committer.commit({
    plan: built.plan,
    created_at_turn: turnNumber
  });
  if (!committed.ok) {
    fail(
      committed.error?.code === 'idempotency_conflict'
        ? 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT'
        : 'TRACE_PHASE_3_COMMIT_FAILED',
      { commit_error: committed.error }
    );
  }
  return {
    ...committed,
    state_version: nextVersion,
    turn_number: turnNumber,
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  };
}

function expectedChangedConditions(state, nextBodyState) {
  const changed = new Set((nextBodyState.active_conditions ?? [])
    .filter(({ condition_outcome: outcome }) => Boolean(outcome))
    .map(({ storage_condition_id: id }) => id));
  return (state.body_state.active_conditions ?? [])
    .filter(({ storage_condition_id: id }) => changed.has(id))
    .map((condition) => expected(
      'party_actor_active_conditions',
      `player_character:${state.actor_id}:${condition.storage_condition_id}`,
      condition.state_version
    ));
}

function target(writePlan, name) {
  return writePlan.write_targets.find(({ target }) => target === name)?.value;
}
function phase3CommitRechecks({
  partyId,
  state,
  factual,
  phase3Contracts,
  inputDigest
}) {
  const movement = factual.consequence.phase3_kind === 'movement'
    ? factual.consequence.movement
    : null;
  return [
    sealedCheck('physical', {
      party_id: partyId,
      location_ref: state.position.location_ref,
      g5_anchor_id: state.position.g5_anchor_id
    }),
    sealedCheck('state', {
      party_id: partyId,
      expected_party_state_version: state.party_state.state_version
    }),
    sealedCheck('pin', {
      activity_pin: phase3Contracts.activityPins.find(
      ({ id }) => id === phase3ActivityRef(factual)
      )
    }),
    sealedCheck('endpoint', {
      destination_ref: movement?.destination.location_ref ?? null
    }),
    sealedCheck('route', {
      route_binding_ref: movement?.route_ref ?? null
    }),
    sealedCheck('capacity', movement ? {
      party_id: partyId,
      capacity_model: 'trace_phase3_location_actor_capacity',
      destination_anchor_id: movement.destination.g5_anchor_id,
      destination_location_ref: movement.destination.location_ref,
      capacity_contract_ref: phase3Contracts.capacity.contract_id,
      access_policy_ref: phase3Contracts.access.policy_id,
      zone_ref: movement.destination.zone_ref,
      max_actors: phase3Contracts.capacity.zones.find(
        ({ zone_id: id }) => id === movement.destination.zone_ref
      )?.max_actors,
      incoming_participant_slot: 'player_clerk',
      allowed_participant_slots:
        phase3Contracts.capacity.admission_model.allowed_participant_slots,
      expected_present_npcs: phase3Contracts.actors.map((actor) => ({
        npc_id: actor.instance_id,
        participant_slot_ref: actor.ref
      }))
    } : { party_id: partyId }),
    sealedCheck('time', {
      expected_clock_state_version: state.party_state.clock_state_version
    }),
    sealedCheck('change_set', {
      canonical_input_digest: inputDigest
    })
  ];
}
function fail(code, details = null) {
  throw serverError(code, 'Phase 3 factual commit failed closed.', {
    status: 409,
    details
  });
}
const normalizeDigest = (value) =>
  `sha256:${String(value).replace('sha256:', '')}`;
