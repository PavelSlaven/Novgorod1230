import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../../errors.js';
import {
  buildPhase2VisibleEnvelope,
  buildPhase2Writes
} from './lower-dvina-trace-phase-2-writes.js';
import { mergePhase2Knowledge } from './lower-dvina-trace-phase-2-read.js';
import { buildLowerDvinaTracePendingScreen } from
  './lower-dvina-trace-turn-presentation.js';
import {
  buildPhase2Snapshot,
  commitPhase2BodyState
} from './lower-dvina-trace-phase-2-state.js';
import { committedPendingPhase2PublicResult } from
  './lower-dvina-trace-phase-2-projection.js';
import {
  assertPhase2CurrentStateVersion
} from './lower-dvina-trace-phase-2-commit-admission.js';
import { buildLowerDvinaTracePhase2P16Plan } from
  './lower-dvina-trace-phase-2-commit-p16.js';
import { commitLowerDvinaTracePhase3 } from './lower-dvina-trace-phase-3-commit.js';
import { commitLowerDvinaTracePhase4 } from './lower-dvina-trace-phase-4-commit.js';
import { commitLowerDvinaTracePhase5 } from './lower-dvina-trace-phase-5-commit.js';
import { commitLowerDvinaTracePhase6 } from './lower-dvina-trace-phase-6-commit.js';
import { commitLowerDvinaTracePhase7 } from './lower-dvina-trace-phase-7-commit.js';
import { commitLowerDvinaTraceCombat } from './lower-dvina-trace-combat-commit.js';
import { routeLowerDvinaTracePhase8Commit } from
  './lower-dvina-trace-phase-8-commit-router.js';
import { commitLowerDvinaTracePhase9 } from
  './lower-dvina-trace-phase-9-commit.js';
import { commitLowerDvinaTracePhase10 } from
  './lower-dvina-trace-phase-10-commit.js';
import { mergePhase2Items } from './lower-dvina-trace-phase-2-commit-items.js';
import { isExpectedPostCommitPresentationFailure } from
  '../../runtime/lower-dvina-trace-post-commit-failure.js';
import {
  mergeLowerDvinaTraceTurnStepWrites,
  prepareLowerDvinaTraceTurnStepPersistence
} from './lower-dvina-trace-turn-step-persistence.js';
import {
  routeLowerDvinaTraceTurnStepCommit
} from './lower-dvina-trace-turn-step-route.js';
export async function commitLowerDvinaTracePhase2({
  partyId,
  writePlan,
  inputDigest,
  contracts,
  phase3Contracts,
  phase4Contracts, phase8Contracts, phase9Contracts, phase10Contracts,
  phase5Contracts, phase6Contracts, phase7Contracts, turn10Contracts,
  turnStepApprovedOwners,
  loadState,
  committer
}) {
  const routed = await routeLowerDvinaTraceTurnStepCommit({
    partyId, writePlan, inputDigest, contracts, loadState, committer
  });
  if (routed.handled) return routed.result;
  const factual = routed.factual;
  if (factual?.consequence?.phase9_kind) {
    const committed = await commitLowerDvinaTracePhase9({
      partyId, writePlan, inputDigest, phase9Contracts,
      turnStepApprovedOwners, loadState, committer });
    if (factual.consequence.phase9_kind !== 'temporary_disposition') {
      return committed;
    }
    if (phase10Contracts == null) return committed;
    try {
      return await commitLowerDvinaTracePhase10({ partyId, phase10Contracts,
        loadState, committer, presentationIdempotencyKey:
          factual.player_input.idempotency_key });
    } catch (error) {
      if (!isExpectedPostCommitPresentationFailure(error)) throw error;
      return committed;
    }
  }
  if (factual?.consequence?.combat_kind === 'exchange') return commitLowerDvinaTraceCombat({
    partyId, writePlan, inputDigest, loadState, committer
  });
  const phase8 = await routeLowerDvinaTracePhase8Commit({ factual, partyId,
    writePlan, inputDigest, phase8Contracts, turnStepApprovedOwners,
    loadState, committer });
  if (phase8.handled) return phase8.result;
  if (factual?.consequence?.phase7_kind) return commitLowerDvinaTracePhase7({
    partyId, writePlan, inputDigest, phase7Contracts, turn10Contracts,
    loadState, committer
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
  const nextItems = mergePhase2Items(state.items, clue);
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
  const committedPublicResult = committedPendingPhase2PublicResult({
    payload: snapshot, screen: pendingScreen
  });
  const built = await buildLowerDvinaTracePhase2P16Plan({
    partyId, state, factual, visibleEnvelope, writes, nextVersion,
    turnNumber, changeSetId, idemId, inputDigest, contracts,
    turnStepCommit: writePlan.turn_step_commit,
    localFirePlans: writePlan.local_fire_atomic_write_plans ?? [],
    approveNarration: committer.approveNarration
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
    package_digest: visibleEnvelope.package_digest,
    committed_public_result: committedPublicResult
  };
}
