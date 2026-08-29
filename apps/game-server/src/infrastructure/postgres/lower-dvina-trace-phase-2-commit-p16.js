import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { serverError } from '../../errors.js';
import { expected } from './first-playable/plan-shared.js';
import {
  buildLowerDvinaTracePhase2CommitRechecks
} from './lower-dvina-trace-phase-2-commit-rechecks.js';
import { phase2LockContext } from './lower-dvina-trace-phase-2-commit-plan.js';
import {
  bindLowerDvinaTraceTurnStepIdempotency
} from './lower-dvina-trace-turn-step-idempotency.js';

export async function buildLowerDvinaTracePhase2P16Plan(input) {
  const {
    partyId, state, factual, visibleEnvelope, writes, turnNumber,
    changeSetId, idemId, inputDigest, contracts, turnStepCommit,
    localFirePlans, approveNarration
  } = input;
  const canonicalInputDigest = normalizeDigest(inputDigest);
  const builder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({
      ok: candidate.party_id === partyId
        && candidate.operation_kind === 'trace_wreck_inspection'
        && candidate.canonical_input_digest === canonicalInputDigest
    }),
    approveNarration
  });
  const built = await builder.build({
    plan_id: `p16:${partyId}:trace-phase2:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: 'trace_wreck_inspection',
    canonical_input_digest: canonicalInputDigest,
    expected_state_versions: expectedVersions(
      partyId,
      state,
      factual.body_update.state_after
    ),
    validation_report: {
      status: 'pass',
      digest: normalizeDigest(canonicalDigest({
        input_digest: inputDigest,
        option_id: 'inspect_wreck_in_detail',
        consequence_ref: factual.consequence.consequence_ref
      }))
    },
    idempotency: {
      id: idemId,
      key: factual.player_input.idempotency_key,
      ...bindLowerDvinaTraceTurnStepIdempotency({
        envelope: turnStepCommit,
        inputDigest,
        semanticCommandSnapshot: {
          schema: 'rus.lower_dvina_trace_phase_2_command_snapshot.v1',
          input_digest: inputDigest,
          raw_text: factual.player_input.raw_text,
          action_set_digest:
            factual.mode_resolution.decision_trace.action_set_digest,
          selected_option_id: factual.mode_resolution.option_id,
          semantic_trace: factual.mode_resolution.decision_trace
        },
        semanticCommandDigest: normalizeDigest(canonicalDigest({
          input_digest: inputDigest,
          selected_option_id: factual.mode_resolution.option_id
        })),
        semanticDependencyPins: { activity: contracts.activityPin },
        visibleDependencyPins: visibleEnvelope.dependency_pins
      }),
      request_id: factual.player_input.request_id
    },
    change_set: { id: changeSetId },
    visible_package_envelope: visibleEnvelope,
    approved_write_sets: [writes],
    local_fire_atomic_write_plans: localFirePlans,
    lock_context: phase2LockContext(writes, state, localFirePlans),
    commit_rechecks: buildLowerDvinaTracePhase2CommitRechecks({
      partyId, state, factual, contracts, inputDigest
    })
  });
  if (!built.ok) {
    throw serverError(
      'TRACE_PHASE_2_WRITE_PLAN_REJECTED',
      'P16 rejected the Phase 2 factual write plan.',
      { status: 409, details: built.error }
    );
  }
  return built;
}

function expectedVersions(partyId, state, nextBodyState) {
  const changedConditionIds = new Set(
    (nextBodyState.active_conditions ?? [])
      .filter(({ condition_outcome: outcome }) => Boolean(outcome))
      .map(({ storage_condition_id: id }) => id)
  );
  return [
    expected('parties', partyId, state.party_state.state_version),
    expected('party_server_sessions', partyId,
      state.party_state.session_state_version),
    expected('party_clocks', partyId,
      state.party_state.clock_state_version),
    expected('party_actor_body_states',
      `player_character:${state.actor_id}`,
      state.party_state.body_state_version)
  ].concat((state.body_state.active_conditions ?? [])
    .filter((condition) =>
      changedConditionIds.has(condition.storage_condition_id)
    ).map((condition) =>
    expected(
      'party_actor_active_conditions',
      `player_character:${state.actor_id}:${condition.storage_condition_id}`,
      condition.state_version
    )));
}

const normalizeDigest = (value) => `sha256:${String(value).replace('sha256:', '')}`;
