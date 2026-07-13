import { assertGatePassed, runCodeGate } from '../gate.js';
import { runStage4RegionalContext } from './stage4-regional-context.js';
import { runStage5StartCandidates } from './stage5-start-candidates.js';
import { runStage6CandidatePlaceTemplates } from './stage6-candidate-place-templates.js';
import { runStage7NpcCandidates } from './stage7-npc-candidates.js';
import { retrieveItemProfileCandidates } from '../retrievers/item-profiles.js';

export { runStage4RegionalContext } from './stage4-regional-context.js';
export { runStage5StartCandidates } from './stage5-start-candidates.js';
export { runStage6CandidatePlaceTemplates } from './stage6-candidate-place-templates.js';
export { runStage7NpcCandidates } from './stage7-npc-candidates.js';

export async function runStage8ItemProfileCandidates(context, input = {}) {
  const output = await retrieveItemProfileCandidates({ request_id: context.requestId, ...input });
  return commitCodeStage(context, 8, 'item_profile_candidates', output, { requiredArrays: ['item_profile_candidates'] });
}


export async function runNewGameRetrievalStages4To8(context, {
  normalizedRequest = null,
  historicalFrame,
  queryable = null,
  env = context.env,
  policies = {}
} = {}) {
  const resolvedNormalizedRequest = normalizedRequest ?? context.getStageOutput(2) ?? null;
  const regionalContext = context.getStageOutput(4) ?? await runStage4RegionalContext(context, {
    normalized_request: resolvedNormalizedRequest,
    historical_frame: historicalFrame,
    load_policy: policies.load_policy
  }, { env, queryable });

  const startCandidates = context.getStageOutput(5) ?? await runStage5StartCandidates(context, {
    normalized_request: resolvedNormalizedRequest,
    historical_frame: historicalFrame,
    regional_context_package: regionalContext,
    candidate_policy: policies.candidate_policy
  }, { env, queryable });

  const placeTemplates = context.getStageOutput(6) ?? await runStage6CandidatePlaceTemplates(context, {
    normalized_request: resolvedNormalizedRequest,
    historical_frame: historicalFrame,
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    template_policy: policies.template_policy
  }, { env, queryable });

  const npcCandidates = context.getStageOutput(7) ?? await runStage7NpcCandidates(context, {
    normalized_request: resolvedNormalizedRequest,
    historical_frame: historicalFrame,
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    candidate_place_template_set: placeTemplates,
    npc_candidate_policy: policies.npc_candidate_policy
  }, { env, queryable });

  const itemProfileCandidates = await runStage8ItemProfileCandidates(context, {
    normalized_request: resolvedNormalizedRequest,
    historical_frame: historicalFrame,
    regional_context_package: regionalContext,
    candidate_place_template_set: placeTemplates,
    npc_candidate_set: npcCandidates,
    item_profile_policy: policies.item_profile_policy
  });

  return {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    candidate_place_template_set: placeTemplates,
    npc_candidate_set: npcCandidates,
    item_profile_candidate_set: itemProfileCandidates
  };
}

function commitCodeStage(context, stageId, stageSlug, output, { requiredArrays = [], requiredFields = [] } = {}) {
  const gate = runCodeGate({ stageId, stageSlug, output, requiredArrays, requiredFields });
  context.setGateResult(stageId, gate);
  assertGatePassed(gate);
  context.setStageOutput(stageId, output);
  context.note(stageId, {
    label: stageSlug,
    message: `${stageSlug} ready`,
    responseRaw: { gate }
  });
  return output;
}
