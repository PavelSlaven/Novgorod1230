import { serverError } from '../errors.js';
import { committedTraceScenarioDefinitionRevision } from
  './lower-dvina-trace-committed-revision.js';
import { resolveTracePhase10Contracts, tracePhase10Pending } from
  './lower-dvina-trace-phase-10-completion.js';

export async function completePendingTracePhase10Replay({ partyId,
  idempotencyKey, replay, repository, bundleLoader }) {
  if (!tracePhase10Pending(replay.state)) return replay;
  const revision = committedTraceScenarioDefinitionRevision(replay.state);
  if (revision !== 18) return replay;
  const bundle = await bundleLoader({ scenarioDefinitionRevision: revision });
  const phase10Contracts = resolveTracePhase10Contracts({ bundle });
  if (typeof repository.commitPhase10FollowUp !== 'function') {
    throw serverError('TRACE_PHASE_10_REPOSITORY_PORT_MISSING',
      'Phase 10 follow-up commit port is required.', { status: 500 });
  }
  await repository.commitPhase10FollowUp({ partyId, phase10Contracts,
    presentationIdempotencyKey: idempotencyKey });
  const completed = await repository.loadPhase2Replay({ partyId,
    idempotencyKey });
  if (completed == null || tracePhase10Pending(completed.state)) {
    throw serverError('TRACE_PHASE_10_REPLAY_MISSING',
      'Committed Phase 10 follow-up is not replayable.', { status: 409 });
  }
  return completed;
}
