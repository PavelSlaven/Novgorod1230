export function buildStage7NpcCandidatesInput(context, {
  normalizedRequest = null,
  historicalFrame = null,
  regionalContextPackage = null,
  startCandidateSet = null,
  candidatePlaceTemplateSet = null,
  npcCandidatePolicy = {}
} = {}) {
  return {
    normalized_request: normalizedRequest ?? context.getStageOutput(2) ?? null,
    historical_frame: historicalFrame ?? context.getStageOutput(3) ?? null,
    regional_context_package: regionalContextPackage ?? context.getStageOutput(4) ?? null,
    start_candidate_set: startCandidateSet ?? context.getStageOutput(5) ?? null,
    candidate_place_template_set: candidatePlaceTemplateSet ?? context.getStageOutput(6) ?? null,
    npc_candidate_policy: npcCandidatePolicy
  };
}
