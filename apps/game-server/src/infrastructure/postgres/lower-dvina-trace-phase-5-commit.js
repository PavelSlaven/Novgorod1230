import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { serverError } from '../../errors.js';
import { expected, sealedCheck } from './first-playable/plan-shared.js';
import { assertPhase2CurrentStateVersion } from
  './lower-dvina-trace-phase-2-commit-admission.js';
import { nextPhase5State } from './lower-dvina-trace-phase-5-state.js';
import {
  phase5PendingScreen,
  phase5VisibleEnvelope,
  phase5Writes
} from './lower-dvina-trace-phase-5-writes.js';
import {
  mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence
} from './lower-dvina-trace-turn-step-persistence.js';
import {
  bindLowerDvinaTraceTurnStepIdempotency
} from './lower-dvina-trace-turn-step-idempotency.js';

export async function commitLowerDvinaTracePhase5({ partyId, writePlan,
  inputDigest, phase5Contracts, loadState, committer }) {
  const factual = writePlan.write_targets.find(
    ({ target }) => target === 'party_state'
  )?.value;
  if (!factual?.consequence?.phase5_kind) fail('TRACE_PHASE_5_WRITE_PLAN_INVALID');
  const state = await loadState(partyId, {
    presentationIdempotencyKey: factual.player_input.idempotency_key
  });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:trace-phase5:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    factual.player_input.idempotency_key).slice(0, 20)}`;
  let next = nextPhase5State({
    state, factual, nextVersion, turnNumber, inputDigest, changeSetId,
    contracts: phase5Contracts
  });
  const visibleContext = writePlan.write_targets.find(
    ({ target }) => target === 'party_visible_context_package'
  )?.value;
  if (!visibleContext) fail('TRACE_PHASE_5_VISIBLE_CONTEXT_MISSING');
  const visibleEnvelope = phase5VisibleEnvelope({
    partyId, nextVersion, turnNumber, changeSetId, idemId, factual,
    visibleContext, contracts: phase5Contracts
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
  const pendingScreen = phase5PendingScreen({
    state, factual, visibleEnvelope, turnNumber, nextVersion
  });
  const writes = mergeLowerDvinaTraceTurnStepWrites(phase5Writes({
    partyId, state, next, factual, visibleEnvelope, pendingScreen,
    nextVersion, turnNumber, changeSetId, idemId,
    contracts: phase5Contracts
  }), turnStep.writes);
  const expectedStateVersions = [
    expected('parties', partyId, state.party_state.state_version),
    expected('party_server_sessions', partyId,
      state.party_state.session_state_version),
    expected('party_clocks', partyId,
      state.party_state.clock_state_version),
    ...(state.phase5_treatment?.activity_execution ? [expected(
      'party_timed_activity_executions',
      state.phase5_treatment.activity_execution.id,
      Number(state.phase5_treatment.activity_execution.state_version)
    )] : [])
  ];
  const builder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({
      ok: candidate.party_id === partyId
        && candidate.operation_kind === 'trace_phase_5_treatment'
    })
  });
  const built = await builder.build({
    plan_id: `p16:${partyId}:trace-phase5:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_phase_5_treatment',
    canonical_input_digest:
      `sha256:${inputDigest.replace('sha256:', '')}`,
    expected_state_versions: expectedStateVersions,
    validation_report: {
      status: 'pass',
      digest: `sha256:${canonicalDigest(factual).replace('sha256:', '')}`
    },
    idempotency: {
      id: idemId,
      key: factual.player_input.idempotency_key,
      ...bindLowerDvinaTraceTurnStepIdempotency({
        envelope: writePlan.turn_step_commit,
        inputDigest,
        semanticCommandSnapshot: {
          schema: 'rus.lower_dvina_trace_command_snapshot.v2',
          input_digest: inputDigest,
          raw_text: factual.player_input.raw_text,
          action_set_digest:
            factual.mode_resolution.decision_trace.action_set_digest,
          selected_option_id: factual.mode_resolution.option_id,
          semantic_trace: factual.mode_resolution.decision_trace
        },
        semanticCommandDigest:
          `sha256:${canonicalDigest(inputDigest).replace('sha256:', '')}`,
        semanticDependencyPins: {
          activity: phase5Contracts.activityPins
        },
        visibleDependencyPins: visibleEnvelope.dependency_pins
      }),
      request_id: factual.player_input.request_id
    },
    change_set: { id: changeSetId },
    visible_package_envelope: visibleEnvelope,
    approved_write_sets: [writes],
    lock_context: {
      owner_keys: [
        `actor:${state.actor_id}`,
        `actor:${phase5Contracts.actors.onisim_boatman.instance_id}`,
        `actor:${phase5Contracts.actors.eremey_fisher.instance_id}`
      ],
      execution_keys: [
        factual.consequence.treatment.activity_execution.id
      ],
      g4_keys: [],
      physical_keys: Object.values(writes).flat().map(
        (write) => `party_runtime.${write.target_table}:${write.id}`
      )
    },
    commit_rechecks: commitRechecks({
      partyId, state, factual, phase5Contracts, inputDigest
    })
  });
  if (!built.ok) fail('TRACE_PHASE_5_WRITE_PLAN_REJECTED', built.error);
  const committed = await committer.commit({
    plan: built.plan, created_at_turn: turnNumber
  });
  if (!committed.ok) fail('TRACE_PHASE_5_COMMIT_FAILED', committed.error);
  return {
    ...committed,
    state_version: nextVersion,
    turn_number: turnNumber,
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  };
}

function commitRechecks({ partyId, state, factual, phase5Contracts,
  inputDigest }) {
  const bandage = state.items.find(
    ({ template_id: id }) => id === phase5Contracts.ids.bandage
  );
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
    sealedCheck('pin', { dependency_pins: phase5Contracts.activityPins }),
    sealedCheck('endpoint', { destination_ref: null }),
    sealedCheck('route', { route_binding_ref: null }),
    sealedCheck('capacity', { party_id: partyId }),
    sealedCheck('time', {
      expected_clock_state_version: state.party_state.clock_state_version
    }),
    sealedCheck('item', {
      item_id: bandage.item_id,
      expected_holder_npc_id:
        phase5Contracts.actors.eremey_fisher.instance_id,
      expected_controller_npc_id:
        phase5Contracts.actors.eremey_fisher.instance_id,
      expected_condition_state: 'clean_serviceable'
    }),
    sealedCheck('change_set', { canonical_input_digest: inputDigest }),
    sealedCheck('activity', {
      execution_id: factual.consequence.treatment.activity_execution.id,
      expected_progress_before:
        factual.consequence.treatment.progress_before
    })
  ];
}

function fail(code, details = null) {
  throw serverError(code, 'Phase 5 factual commit failed closed.', {
    status: 409, details
  });
}
