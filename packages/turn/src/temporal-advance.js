import {
  addElapsedTime,
  compareGameTimestamp,
  subtractGameTimestamp
} from '@rus/time-events-history';
import {
  resolveSameTimeCascade,
  selectEarliestTemporalBoundaryBatch
} from '@rus/time-events-history/temporal-boundaries';
import {
  collectProviderCandidates,
  cloneFrozen,
  createSlicePlan,
  createSliceResult,
  finalizeResult,
  idempotencyDigests,
  immutableConfiguration,
  normalizeHandlerOutcome,
  normalizeResolution,
  replayCommittedResult,
  validateConfiguration,
  validateRequest
} from './temporal-advance-support.js';

const engines = new WeakSet();

export function createTemporalAdvanceEngine(configuration) {
  validateConfiguration(configuration);
  const config = immutableConfiguration(configuration);
  const engine = Object.freeze({ advance(rawRequest) { return advance(config, rawRequest); } });
  engines.add(engine);
  return engine;
}

export function isTemporalAdvanceEngine(value) {
  return engines.has(value);
}

function advance(config, rawRequest) {
  const request = validateRequest(config, rawRequest);
  const digests = idempotencyDigests(request);
  const replay = replayCommittedResult(request, digests);
  if (replay) return replay;

  const processed = new Set();
  const processedBoundaryIds = [];
  const dispositions = [];
  const allProposals = [];
  const timeSliceResults = [];
  const deferredCandidates = [];
  let projection = request.relevant_state_projection;
  let clock = request.clock_before;
  let sliceIndex = 0;

  while (compareGameTimestamp(clock, request.inclusive_limit_timestamp) <= 0) {
    const candidates = collectProviderCandidates(config, request, projection, clock, processed, deferredCandidates);
    const batch = selectEarliestTemporalBoundaryBatch({
      from_timestamp: clock,
      limit_timestamp: request.inclusive_limit_timestamp,
      candidates,
      execution_requires_boundary: request.relevant_state_projection.active_execution_requires_boundary === true
        && processedBoundaryIds.length === 0
    });
    if (!batch && compareGameTimestamp(clock, request.inclusive_limit_timestamp) === 0) break;
    if (++sliceIndex > config.safety_limits.max_slices) {
      fail('temporal_boundary_cycle', 'Temporal advance exceeded its explicit slice limit.');
    }

    const toTimestamp = batch?.scheduled_at ?? request.inclusive_limit_timestamp;
    const plan = createSlicePlan(request, sliceIndex, clock, toTimestamp, batch);
    const sliceProposals = [];
    const sliceDispositions = [];
    const processedCandidates = [];

    if (compareGameTimestamp(clock, toTimestamp) < 0) {
      const continuous = config.handlers.applyContinuous(plan, cloneFrozen({ request, projection }));
      const continuousOutcome = normalizeHandlerOutcome(continuous, 'applyContinuous');
      sliceProposals.push(...continuousOutcome.proposals);
      if (continuousOutcome.state_projection) projection = continuousOutcome.state_projection;
    }

    if (batch) {
      const cascade = resolveSameTimeCascade({
        timestamp: toTimestamp,
        candidates: batch.candidates,
        max_candidates: config.safety_limits.max_candidates,
        max_iterations: config.safety_limits.max_iterations,
        resolveCandidate: (candidate) => {
          const raw = config.handlers.resolve(candidate, cloneFrozen({
            request,
            projection,
            clock_before: toTimestamp,
            slice_plan: plan
          }));
          const resolution = normalizeResolution(raw, candidate, toTimestamp, request, deferredCandidates);
          processed.add(candidate.boundary_id);
          processedBoundaryIds.push(candidate.boundary_id);
          processedCandidates.push(candidate);
          const disposition = { boundary_id: candidate.boundary_id, disposition: resolution.disposition };
          dispositions.push(disposition);
          sliceDispositions.push(disposition);
          sliceProposals.push(...resolution.proposals);
          if (resolution.state_projection) projection = resolution.state_projection;
          return { follow_up_candidates: resolution.follow_up_candidates };
        }
      });
      if (!cascade.reached_fixed_point) {
        fail('temporal_boundary_cycle', 'Temporal same-time cascade did not reach a fixed point.');
      }
    }

    const sliceResult = createSliceResult(request, plan, sliceProposals, processedCandidates, sliceDispositions);
    timeSliceResults.push(sliceResult);
    allProposals.push(...sliceProposals);
    clock = toTimestamp;
    if (compareGameTimestamp(clock, request.inclusive_limit_timestamp) === 0) break;
  }

  return finalizeResult(
    config,
    request,
    projection,
    clock,
    allProposals,
    timeSliceResults,
    processedBoundaryIds,
    dispositions,
    deferredCandidates,
    digests
  );
}
