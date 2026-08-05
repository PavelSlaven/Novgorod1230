import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { integrateSpatialV3TemporalWriteFragments } from
  '@rus/turn/spatial-v3-temporal-write-integration';
import { serverError } from '../../errors.js';
import { assertPhase2CurrentStateVersion } from
  './lower-dvina-trace-phase-2-commit-admission.js';
import { nextPhase7State } from './lower-dvina-trace-phase-7-state.js';
import {
  phase7PendingScreen,
  phase7VisibleEnvelope,
  phase7Writes
} from './lower-dvina-trace-phase-7-writes.js';
import {
  bindLowerDvinaTraceFactualTurnStepIdempotency
} from './lower-dvina-trace-turn-step-idempotency.js';
import {
  mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence
} from './lower-dvina-trace-turn-step-persistence.js';
import {
  commitRechecks,
  expectedVersions,
  scheduleItemKeys
} from './lower-dvina-trace-phase-7-commit-policy.js';

export async function commitLowerDvinaTracePhase7({ partyId, writePlan,
  inputDigest, phase7Contracts, loadState, committer }) {
  const factual = target(writePlan, 'party_state');
  const visibleContext = target(writePlan, 'party_visible_context_package');
  if (factual?.consequence?.phase7_kind !== 'fire_rest'
      || factual.consequence.duration_minutes !== 30
      || !factual.consequence.phase7
      || !visibleContext) {
    fail('TRACE_PHASE_7_WRITE_PLAN_INVALID');
  }
  const state = await loadState(partyId, {
    presentationIdempotencyKey: factual.player_input.idempotency_key
  });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const nextVersion = state.party_state.state_version + 1;
  const turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:trace-phase7:${turnNumber}`;
  const idemId = `idem:${partyId}:${canonicalDigest(
    factual.player_input.idempotency_key
  ).slice(0, 20)}`;
  assertOwnerResult({ factual, state, phase7Contracts, changeSetId });
  let next = nextPhase7State({
    state,
    factual,
    nextVersion,
    turnNumber,
    changeSetId,
    inputDigest
  });
  const visibleEnvelope = phase7VisibleEnvelope({
    partyId,
    nextVersion,
    turnNumber,
    changeSetId,
    idemId,
    factual,
    visibleContext,
    phase7Contracts
  });
  next.last_turn.visible_package = {
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest,
    change_set_id: changeSetId
  };
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({
    partyId,
    writePlan,
    state,
    snapshot: next,
    factual,
    changeSetId,
    idemId
  });
  next = turnStep.snapshot;
  const pendingScreen = phase7PendingScreen({
    state,
    factual,
    visibleEnvelope,
    turnNumber,
    nextVersion
  });
  const writes = mergeLowerDvinaTraceTurnStepWrites(phase7Writes({
    partyId,
    state,
    next,
    factual,
    turnNumber,
    changeSetId,
    idemId,
    visibleEnvelope,
    pendingScreen
  }), turnStep.writes);
  const builder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({
      ok: candidate.party_id === partyId
        && candidate.operation_kind === 'trace_phase_7_fire_rest'
    })
  });
  const baseInput = {
    plan_id: `p16:${partyId}:trace-phase7:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_phase_7_fire_rest',
    canonical_input_digest: normalizeDigest(inputDigest),
    expected_state_versions: expectedVersions({ partyId, state, factual }),
    validation_report: {
      status: 'pass',
      digest: normalizeDigest(canonicalDigest({
        input_digest: inputDigest,
        option_id: factual.mode_resolution.option_id,
        decision_request_id:
          factual.consequence.phase7.autonomous.request.request_id,
        schedule_execution_ref:
          factual.consequence.phase7.schedule_execution.execution_binding_ref
      }))
    },
    idempotency: {
      id: idemId,
      key: factual.player_input.idempotency_key,
      ...bindLowerDvinaTraceFactualTurnStepIdempotency({
        envelope: writePlan.turn_step_commit,
        inputDigest,
        factual,
        semanticCommandDigest: normalizeDigest(canonicalDigest({
          input_digest: inputDigest,
          option_id: factual.mode_resolution.option_id
        })),
        semanticDependencyPins: visibleEnvelope.dependency_pins,
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
        `actor:${factual.consequence.phase7.autonomous.request.npc_ref}`
      ],
      execution_keys: [
        factual.consequence.activity_attempt_id,
        factual.consequence.phase7.autonomous.request.request_id
      ],
      g4_keys: [],
      physical_keys: [...new Set([
        ...Object.values(writes).flat().map(
          (write) => `party_runtime.${write.target_table}:${write.id}`
        ),
        `party_runtime.party_npcs:${
          factual.consequence.phase7.autonomous.request.npc_ref}`,
        ...scheduleItemKeys(state, factual)
      ])]
    },
    commit_rechecks: commitRechecks({
      partyId,
      state,
      factual,
      phase7Contracts,
      inputDigest
    })
  };
  const firstIntegrated = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: baseInput,
    temporal_result: factual.consequence.phase7.temporal.result
  });
  if (!firstIntegrated.ok) {
    fail('TRACE_PHASE_7_TEMPORAL_WRITE_CONFLICT', firstIntegrated.error);
  }
  const integrated = integrateSpatialV3TemporalWriteFragments({
    base_write_plan_input: firstIntegrated.input,
    temporal_result: factual.consequence.phase7.schedule_temporal.result
  });
  if (!integrated.ok) {
    fail('TRACE_PHASE_7_TEMPORAL_WRITE_CONFLICT', integrated.error);
  }
  const built = await builder.build(integrated.input);
  if (!built.ok) fail('TRACE_PHASE_7_WRITE_PLAN_REJECTED', built.error);
  const committed = await committer.commit({
    plan: built.plan,
    created_at_turn: turnNumber
  });
  if (!committed.ok) fail('TRACE_PHASE_7_COMMIT_FAILED', committed.error);
  return {
    ...committed,
    state_version: nextVersion,
    turn_number: turnNumber,
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  };
}

export async function buildLowerDvinaTracePhase7Commit({ partyId, factual,
  state, inputDigest, visibleContext, phase7Contracts }) {
  const writePlan = {
    base_state_version: state.party_state.state_version,
    write_targets: [{ target: 'party_state', value: factual }, {
      target: 'party_visible_context_package', value: visibleContext
    }]
  };
  let captured = null;
  await commitLowerDvinaTracePhase7({
    partyId,
    writePlan,
    inputDigest,
    phase7Contracts,
    loadState: async () => state,
    committer: {
      async commit(input) {
        captured = input;
        return { ok: true };
      }
    }
  });
  return captured;
}

function assertOwnerResult({ factual, state, phase7Contracts, changeSetId }) {
  const phase7 = factual.consequence.phase7;
  const temporal = phase7.temporal;
  const scheduleTemporal = phase7.schedule_temporal;
  const schedule = phase7.schedule_execution;
  if (temporal.elapsed_before_decision !== 25
      || temporal.result.temporal_status !== 'paused'
      || scheduleTemporal?.result?.temporal_status !== 'completed'
      || scheduleTemporal.elapsed_after_decision !== 5
      || scheduleTemporal.result.clock_before.whole_minutes
        !== temporal.result.clock_after.whole_minutes
      || scheduleTemporal.result.clock_after.whole_minutes
        !== schedule.clock_after.whole_minutes
      || temporal.result.clock_before.whole_minutes !== state.clock.whole_minutes
      || schedule.exact_elapsed.exact_minutes.numerator !== '5'
      || schedule.exact_elapsed.exact_minutes.denominator !== '1'
      || schedule.root_clock_write_count !== 1
      || schedule.clock_after.whole_minutes
        !== factual.time_update.clock_after.whole_minutes
      || schedule.parent_state_version !== state.party_state.state_version
      || !phase7Contracts.allowedScheduleExecutions.some(
        ({ execution_binding_id: id }) =>
          id === schedule.execution_binding_ref)
      || temporal.result.combined_change_set.change_set_id
        !== changeSetId
      || scheduleTemporal.result.combined_change_set.change_set_id
        !== changeSetId
      || factual.body_update.applied !== true
      || factual.body_update.proposal.profile_ref
        !== phase7Contracts.bodyEffect.effect_profile_id) {
    fail('TRACE_PHASE_7_OWNER_RESULT_INVALID');
  }
}

const target = (writePlan, name) => writePlan.write_targets
  .find(({ target: id }) => id === name)?.value;

const normalizeDigest = (value) =>
  `sha256:${String(value).replace('sha256:', '')}`;

function fail(code, details = null) {
  throw serverError(code, 'Phase 7 factual commit failed closed.', {
    status: 409,
    details
  });
}
