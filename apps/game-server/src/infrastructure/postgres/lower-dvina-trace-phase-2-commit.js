import { canonicalDigest } from '@rus/materialization';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { serverError } from '../../errors.js';
import { expected } from './first-playable/plan-shared.js';
import {
  buildPhase2VisibleEnvelope,
  buildPhase2Writes
} from './lower-dvina-trace-phase-2-writes.js';
import { mergePhase2Knowledge } from './lower-dvina-trace-phase-2-read.js';
import {
  buildLowerDvinaTracePendingScreen
} from './lower-dvina-trace-turn-presentation.js';
import {
  buildPhase2Snapshot,
  commitPhase2BodyState
} from './lower-dvina-trace-phase-2-state.js';
import {
  assertPhase2CurrentStateVersion
} from './lower-dvina-trace-phase-2-commit-admission.js';
import {
  buildLowerDvinaTracePhase2CommitRechecks
} from './lower-dvina-trace-phase-2-commit-rechecks.js';
import { phase2LockContext } from './lower-dvina-trace-phase-2-commit-plan.js';
import {
  commitLowerDvinaTracePhase3
} from './lower-dvina-trace-phase-3-commit.js';
import {
  commitLowerDvinaTracePhase4
} from './lower-dvina-trace-phase-4-commit.js';
import { commitLowerDvinaTracePhase5 } from './lower-dvina-trace-phase-5-commit.js';
import { commitLowerDvinaTracePhase6 } from './lower-dvina-trace-phase-6-commit.js';
import { commitLowerDvinaTracePhase7 } from './lower-dvina-trace-phase-7-commit.js';
import {
  mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence
} from './lower-dvina-trace-turn-step-persistence.js';
import {
  routeLowerDvinaTraceTurnStepCommit
} from './lower-dvina-trace-turn-step-route.js';
import {
  bindLowerDvinaTraceTurnStepIdempotency
} from './lower-dvina-trace-turn-step-idempotency.js';
export async function commitLowerDvinaTracePhase2({
  partyId,
  writePlan,
  inputDigest,
  contracts,
  phase3Contracts,
  phase4Contracts,
  phase5Contracts, phase6Contracts, phase7Contracts,
  turnStepApprovedOwners,
  loadState,
  committer
}) {
  const routed = await routeLowerDvinaTraceTurnStepCommit({
    partyId, writePlan, inputDigest, contracts, loadState, committer
  });
  if (routed.handled) return routed.result;
  const factual = routed.factual;
  if (factual?.consequence?.phase7_kind) return commitLowerDvinaTracePhase7({
    partyId, writePlan, inputDigest, phase7Contracts, loadState, committer
  });
  if (factual?.consequence?.phase6_kind) return commitLowerDvinaTracePhase6({ partyId, writePlan, inputDigest, phase6Contracts, loadState, committer });
  if (factual?.consequence?.phase5_kind) {
    return commitLowerDvinaTracePhase5({
      partyId, writePlan, inputDigest, phase5Contracts, loadState, committer
    });
  }
  if (factual?.consequence?.phase3_kind) {
    return commitLowerDvinaTracePhase3({
      partyId,
      writePlan,
      inputDigest,
      phase3Contracts,
      turnStepApprovedOwners,
      loadState,
      committer
    });
  }
  if (factual?.consequence?.phase4_kind) {
    return commitLowerDvinaTracePhase4({
      partyId, writePlan, inputDigest, phase4Contracts, loadState, committer
    });
  }
  const visibleContext = writePlan.write_targets
    .find(({ target }) => target === 'party_visible_context_package')?.value;
  if (!factual || !visibleContext
      || factual.player_input.party_id !== partyId
      || factual.mode_resolution.option_id
        !== 'inspect_wreck_in_detail') {
    throw serverError(
      'TRACE_PHASE_2_WRITE_PLAN_INVALID',
      'Code-owned Phase 2 factual write plan is incomplete.',
      { status: 409 }
    );
  }
  const state = await loadState(partyId, {
    presentationIdempotencyKey:
      factual.player_input.idempotency_key
  });
  assertPhase2CurrentStateVersion({ writePlan, factual, state });
  const nextVersion = state.party_state.state_version + 1,
    turnNumber = state.party_state.turn_number + 1;
  const changeSetId = `change:${partyId}:trace-phase2:${turnNumber}`;
  const idemId =
    `idem:${partyId}:${canonicalDigest(
      factual.player_input.idempotency_key
    ).slice(0, 20)}`;
  const clue = factual.consequence.clue_materialization;
  const nextItems = mergeItems(state.items, clue);
  const nextKnowledge = mergePhase2Knowledge(state.knowledge ?? [],
    factual.consequence.knowledge_records);
  const nextBodyState = commitPhase2BodyState({
    before: state.body_state,
    proposed: factual.body_update.state_after
  });
  const visibleEnvelope = buildPhase2VisibleEnvelope({
    partyId, turnNumber, nextVersion, changeSetId, idemId,
    context: visibleContext, contracts
  });
  const baseSnapshot = buildPhase2Snapshot({
    state, factual, nextVersion, turnNumber, nextItems,
    nextKnowledge, nextBodyState, visibleEnvelope, changeSetId, inputDigest
  });
  const turnStep = prepareLowerDvinaTraceTurnStepPersistence({
    partyId, writePlan, state, snapshot: baseSnapshot, factual,
    changeSetId, idemId, phase3Contracts, turnStepApprovedOwners
  });
  const snapshot = turnStep.snapshot;
  const pendingScreen = buildLowerDvinaTracePendingScreen({
    state, turnId: factual.mode_resolution.turn_id,
    nextVersion, turnNumber, visibleEnvelope
  });
  const writes = mergeLowerDvinaTraceTurnStepWrites(buildPhase2Writes({
    partyId, state, snapshot, factual, visibleEnvelope, pendingScreen,
    nextVersion, turnNumber, changeSetId, idemId, clue, inputDigest,
    nextBodyState
  }), turnStep.writes);
  const built = await buildP16Plan({
    partyId, state, factual, visibleEnvelope, writes, nextVersion,
    turnNumber, changeSetId, idemId, inputDigest, contracts,
    turnStepCommit: writePlan.turn_step_commit
  });
  const committed = await committer.commit({
    plan: built.plan,
    created_at_turn: turnNumber
  });
  if (!committed.ok) {
    throw serverError(
      committed.error?.code === 'idempotency_conflict'
        ? 'TRACE_PHASE_2_IDEMPOTENCY_CONFLICT'
        : 'TRACE_PHASE_2_COMMIT_FAILED',
      'Phase 2 factual commit failed closed.',
      { status: 409, details: committed.error }
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

async function buildP16Plan(input) {
  const {
    partyId, state, factual, visibleEnvelope, writes, turnNumber,
    changeSetId, idemId, inputDigest, contracts, turnStepCommit
  } = input;
  const canonicalInputDigest = normalizeDigest(inputDigest);
  const builder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({
      ok: candidate.party_id === partyId
        && candidate.operation_kind === 'trace_wreck_inspection'
        && candidate.canonical_input_digest === canonicalInputDigest
    })
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
    lock_context: phase2LockContext(writes, state),
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
function mergeItems(items, clue) {
  const next = structuredClone(items);
  if (clue && !next.some(
    (item) => item.template_id === clue.template_id
  )) {
    const exactPickup = Boolean(clue.pickup_transition);
    next.push({
      item_id: clue.instance_id,
      template_id: clue.template_id,
      ...(exactPickup ? {
        profile_id: clue.profile_id,
        quantity: clue.quantity
      } : {}),
      placement: structuredClone(clue.placement),
      state: exactPickup ? {
        semantic_category: clue.semantic_category,
        property_state: structuredClone(clue.property_state),
        causal_basis: clue.causal_basis,
        evidence_ref: 'trace_ld_v1_evidence_blue_wool',
        inventory_profile_snapshot:
          structuredClone(clue.inventory_profile),
        inventory_effect: structuredClone(clue.inventory_effect),
        pickup_transition: structuredClone(clue.pickup_transition)
      } : {
        semantic_category: clue.semantic_category,
        property_state: clue.property_state,
        causal_basis: clue.causal_basis,
        evidence_ref: 'trace_ld_v1_evidence_blue_wool',
        placement_contract: clue.placement
      }
    });
  }
  return next;
}

const normalizeDigest = (value) => `sha256:${String(value).replace('sha256:', '')}`;
