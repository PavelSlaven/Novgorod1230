export function buildStage5StartCandidatesInput(context, {
  normalizedRequest = null,
  historicalFrame = null,
  regionalContextPackage = null,
  candidatePolicy = {}
} = {}) {
  return {
    normalized_request: normalizedRequest ?? context.getStageOutput(2) ?? null,
    historical_frame: historicalFrame ?? context.getStageOutput(3) ?? null,
    regional_context_package: regionalContextPackage ?? context.getStageOutput(4) ?? null,
    candidate_policy: candidatePolicy
  };
}
