import { normalizeStage3CandidateSet, retrieveHistoricalFrameCandidates } from './candidates.js';
import { buildStage3SelectionPolicy, buildStage3BoundaryPolicy } from './policy.js';

export async function buildStage3HistoricalFrameInput(context, options = {}, services = {}) {
  const normalizedRequest = context.requireStageOutput(2, 'normalized request');
  const explicitCandidateSet = options.availableCandidates
    ?? options.historicalFrameCandidateSet
    ?? context.historicalFrameCandidateSet
    ?? null;
  const queryable = options.queryable ?? null;

  let availableCandidates;
  if (explicitCandidateSet) {
    availableCandidates = normalizeStage3CandidateSet(explicitCandidateSet);
  } else if (queryable != null) {
    availableCandidates = await (services.retrieveHistoricalFrameCandidates ?? retrieveHistoricalFrameCandidates)({
      request_id: context.requestId,
      normalized_request: normalizedRequest,
      candidate_policy: options.candidatePolicy ?? options.selectionPolicy ?? context.historicalFrameCandidatePolicy ?? {}
    }, {
      env: options.env ?? context.env,
      queryable
    });
  } else {
    const error = new Error('HISTORICAL_FRAME_CANDIDATE_SET_MISSING');
    error.code = 'HISTORICAL_FRAME_CANDIDATE_SET_MISSING';
    throw error;
  }

  const selectionPolicy = buildStage3SelectionPolicy(options.selectionPolicy ?? context.historicalFrameSelectionPolicy ?? {});

  return {
    version: 1,
    schema: 'historical_frame_selector_input',
    request_id: context.requestId,
    normalized_request: normalizedRequest,
    available_candidates: availableCandidates,
    selection_policy: selectionPolicy,
    stage_boundary: buildStage3BoundaryPolicy()
  };
}
