export function buildStage6CandidatePlaceTemplatesInput(context, {
  normalizedRequest = null,
  historicalFrame = null,
  regionalContextPackage = null,
  startCandidateSet = null,
  templatePolicy = {}
} = {}) {
  return {
    normalized_request: normalizedRequest ?? context.getStageOutput(2) ?? null,
    historical_frame: historicalFrame ?? context.getStageOutput(3) ?? null,
    regional_context_package: regionalContextPackage ?? context.getStageOutput(4) ?? null,
    start_candidate_set: startCandidateSet ?? context.getStageOutput(5) ?? null,
    template_policy: templatePolicy
  };
}
