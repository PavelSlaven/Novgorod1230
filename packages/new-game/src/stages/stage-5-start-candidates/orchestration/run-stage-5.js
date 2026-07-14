import { commitStageOutput } from '../../shared/stage-runtime.js';
export async function runStage5StartCandidatesBlock(context, input = {}, services = {}) {
  if (typeof services.retrieveStartCandidates !== 'function' || typeof services.runStartCandidateSetGate !== 'function') throw new TypeError('Stage 5 requires candidate retrieval and gate ports.');
  const candidatePolicy=input.candidate_policy??{};
  const output=await services.retrieveStartCandidates({request_id:context.requestId,...input},services);
  const gate=services.runStartCandidateSetGate({stageId:5,stageSlug:'start_candidates',output,policy:candidatePolicy});
  return commitStageOutput(context,5,'start_candidates',output,gate);
}
