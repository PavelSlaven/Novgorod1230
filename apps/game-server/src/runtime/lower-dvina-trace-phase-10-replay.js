import { serverError } from '../errors.js';
import { committedTraceScenarioDefinitionRevision } from
  './lower-dvina-trace-committed-revision.js';
import { resolveTracePhase10Contracts, tracePhase10Pending } from
  './lower-dvina-trace-phase-10-completion.js';
import { runWithinTurnDeadline } from './llm-turn-budget.js';

export async function completePendingTracePhase10Replay({ partyId,
  idempotencyKey, replay, repository, bundleLoader, turnBudget = null }) {
  if (!tracePhase10Pending(replay.state)) return replay;
  const revision = committedTraceScenarioDefinitionRevision(replay.state);
  if (![18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31].includes(revision)) return replay;
  const bundle = await runWithinTurnDeadline(turnBudget, () => bundleLoader({
    scenarioDefinitionRevision: revision,
  }));
  const phase10Contracts = resolveTracePhase10Contracts({ bundle });
  if (typeof repository.commitPhase10FollowUp !== 'function') {
    throw serverError('TRACE_PHASE_10_REPOSITORY_PORT_MISSING',
      'Phase 10 follow-up commit port is required.', { status: 500 });
  }
  await runWithinTurnDeadline(turnBudget, () =>
    repository.commitPhase10FollowUp({ partyId, phase10Contracts,
      presentationIdempotencyKey: idempotencyKey, turnBudget })
  );
  const completed = await repository.loadPhase2Replay({ partyId,
    idempotencyKey, turnBudget });
  if (completed == null || tracePhase10Pending(completed.state)) {
    throw serverError('TRACE_PHASE_10_REPLAY_MISSING',
      'Committed Phase 10 follow-up is not replayable.', { status: 409 });
  }
  return completed;
}

export function committedPendingReplayResult({ partyId, idempotencyKey,
  inputDigest, replay }) {
  const state = replay?.state, turn = state?.last_turn, screen = replay?.screen;
  const anchor = screen?.current_projection_anchor, visible = turn?.visible_package;
  const result = replay?.public_result;
  const strings = [state?.party_id, turn?.idempotency_key, replay?.input_digest,
    screen?.screen_status, screen?.turn_id, screen?.party_id,
    anchor?.package_id, anchor?.package_digest, visible?.package_id,
    visible?.package_digest, result?.party_id, result?.option_id,
    result?.screen?.screen_status, result?.screen?.turn_id,
    result?.screen?.party_id, result?.screen?.current_projection_anchor?.package_id,
    result?.screen?.current_projection_anchor?.package_digest, turn?.option_id];
  if (!strings.every((value) => typeof value === 'string' && value.length > 0)
      || screen.screen_status !== 'committed_presentation_pending'
      || state.party_id !== partyId || turn.idempotency_key !== idempotencyKey
      || replay.input_digest !== inputDigest
      || !Number.isInteger(state?.party_state?.state_version)
      || !Number.isInteger(state?.party_state?.turn_number)
      || !Number.isInteger(screen?.turn_number)
      || !Number.isInteger(anchor?.committed_state_version)
      || !Number.isInteger(result?.turn_number)
      || !Number.isInteger(result?.state_version)
      || !Number.isInteger(result?.screen?.turn_number)
      || !Number.isInteger(result?.screen?.current_projection_anchor
        ?.committed_state_version)
      || screen.party_id !== partyId
      || screen.turn_number !== state.party_state.turn_number
      || anchor?.committed_state_version !== state.party_state.state_version
      || anchor?.package_id !== visible?.package_id
      || anchor?.package_digest !== visible?.package_digest
      || result?.party_id !== partyId
      || result.turn_number !== state.party_state.turn_number
      || result.state_version !== state.party_state.state_version
      || result.option_id !== turn.option_id
      || result.screen?.screen_status !== screen.screen_status
      || result.screen?.turn_id !== screen.turn_id
      || result.screen?.party_id !== screen.party_id
      || result.screen?.turn_number !== screen.turn_number
      || result.screen?.current_projection_anchor?.committed_state_version
        !== anchor.committed_state_version
      || result.screen?.current_projection_anchor?.package_id !== anchor.package_id
      || result.screen?.current_projection_anchor?.package_digest !== anchor.package_digest) {
    return null;
  }
  return structuredClone(result);
}
