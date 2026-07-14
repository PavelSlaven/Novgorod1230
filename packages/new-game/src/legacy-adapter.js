import { getWorldBaseQueryable } from '../../../legacy/src/world/world-base-db.js';
import { createGateResult, assertGatePassed, runStartCandidateSetGate } from '../../../legacy/src/world/new-game-pipeline/gate.js';
import { retrieveRegionalContextPackage, validateRegionalContextPackage } from '../../../legacy/src/world/new-game-pipeline/retrievers/regional-context.js';
import { retrieveStartCandidates } from '../../../legacy/src/world/new-game-pipeline/retrievers/start-candidates.js';
import { retrieveCandidatePlaceTemplates, validateCandidatePlaceTemplateSet } from '../../../legacy/src/world/new-game-pipeline/retrievers/place-templates.js';
import { retrieveNpcCandidates, validateNpcCandidateSet } from '../../../legacy/src/world/new-game-pipeline/retrievers/npc-candidates.js';
import { retrieveItemProfileCandidates } from '../../../legacy/src/world/new-game-pipeline/retrievers/item-profiles.js';


function normalizeStage8ItemProfilePolicy(policy = {}) {
  return {
    target_profiles_max: Number.isFinite(Number(policy?.target_profiles_max)) ? Number(policy.target_profiles_max) : 160,
    require_sources: policy?.require_sources !== false
  };
}
function validateStage8ItemProfileRetrieverInput(input = {}) {
  const concerns=[];
  if (input?.version !== 1) concerns.push({code:'ITEM_PROFILE_INPUT_VERSION_INVALID',field:'version',message:'Stage 8 input version must be 1.'});
  if (input?.schema !== 'item_profile_retriever_input') concerns.push({code:'ITEM_PROFILE_INPUT_SCHEMA_INVALID',field:'schema',message:'Stage 8 input schema is invalid.'});
  for (const field of ['request_id','historical_frame','regional_context_package','candidate_place_template_set','npc_candidate_set']) if (input?.[field] == null) concerns.push({code:'ITEM_PROFILE_INPUT_MISSING_FIELD',field,message:`Stage 8 input is missing ${field}.`});
  return {pass:concerns.length===0,concerns,evidence:[{kind:'stage8_input_validation'}]};
}
function validateItemProfileCandidateSet(output = {}, { input = {}, policy = {} } = {}) {
  const concerns=[];
  if (output?.version !== 1) concerns.push({code:'ITEM_PROFILE_OUTPUT_VERSION_INVALID',field:'version',message:'Stage 8 output version must be 1.'});
  if (output?.schema !== 'item_profile_candidate_set') concerns.push({code:'ITEM_PROFILE_OUTPUT_SCHEMA_INVALID',field:'schema',message:'Stage 8 output schema is invalid.'});
  if (output?.request_id !== input?.request_id) concerns.push({code:'ITEM_PROFILE_REQUEST_ID_MISMATCH',field:'request_id',message:'Stage 8 request_id must match input.'});
  if (output?.selection_status !== 'ready') concerns.push({code:'ITEM_PROFILE_CANDIDATE_SET_NOT_READY',field:'selection_status',message:'Stage 8 candidate set must be ready.'});
  if (!Array.isArray(output?.item_profile_candidates) || output.item_profile_candidates.length===0) concerns.push({code:'ITEM_PROFILE_CANDIDATE_SET_EMPTY',field:'item_profile_candidates',message:'Stage 8 requires item profile candidates.'});
  if (output?.audit?.pass !== true) concerns.push({code:'ITEM_PROFILE_AUDIT_FAILED',field:'audit.pass',message:'Stage 8 audit must pass.'});
  return {pass:concerns.length===0,concerns,evidence:[{kind:'stage8_candidate_validation',candidate_count:output?.item_profile_candidates?.length??0,require_sources:policy?.require_sources!==false}]};
}

export const legacyStage2To8Services = Object.freeze({
  getQueryable: ({ env = process.env, queryable = null } = {}) => getWorldBaseQueryable(env, queryable),
  createGateResult,
  assertGatePassed,
  runStartCandidateSetGate,
  retrieveRegionalContextPackage,
  validateRegionalContextPackage,
  retrieveStartCandidates,
  retrieveCandidatePlaceTemplates,
  validateCandidatePlaceTemplateSet,
  retrieveNpcCandidates,
  validateNpcCandidateSet,
  retrieveItemProfileCandidates,
  normalizeStage8ItemProfilePolicy,
  validateStage8ItemProfileRetrieverInput,
  validateItemProfileCandidateSet
});

export async function runNewGamePipeline(options) {
  const legacy = await import('../../../legacy/src/world/new-game-pipeline/index.js');
  return legacy.runNewGamePipeline(options);
}
