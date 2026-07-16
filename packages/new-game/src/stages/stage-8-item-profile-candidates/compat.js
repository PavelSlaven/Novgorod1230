import { buildStage8ItemProfileInputFromPipeline as coreBuild } from './input.js';
import { normalizeStage8ItemProfilePolicy, retrieveApprovedItemProfileCandidates, validateItemProfileCandidateSet, validateStage8ItemProfileRetrieverInput } from './approved-catalog.js';
import { runStage8ItemProfileRetrieverBlock,runStage8ItemProfileCandidatesBlock,runItemProfileCandidateSetGateBlock,buildStage8ManagedPipelineResult } from './orchestration/run-stage-8.js';
export { STAGE8_INPUT_SCHEMA,STAGE8_OUTPUT_SCHEMA } from './policy.js';
export { buildStage8ManagedPipelineResult, normalizeStage8ItemProfilePolicy, validateStage8ItemProfileRetrieverInput };
const approvedServices={normalizeStage8ItemProfilePolicy,validateStage8ItemProfileRetrieverInput,retrieveItemProfileCandidates:retrieveApprovedItemProfileCandidates,validateItemProfileCandidateSet};
export function buildStage8ItemProfileInputFromPipeline(context,options={}){return coreBuild(context,options,approvedServices);}
export function retrieveItemProfileCandidates(input){return retrieveApprovedItemProfileCandidates(input);}
export function runStage8ItemProfileRetriever(input,deps={}){return runStage8ItemProfileRetrieverBlock(input,{...approvedServices,...deps});}
export function runStage8ItemProfileCandidates(context,input=null,deps={}){return runStage8ItemProfileCandidatesBlock(context,input,{...approvedServices,...deps});}
export function runItemProfileCandidateSetGate(output,input={}){return runItemProfileCandidateSetGateBlock(output,input,approvedServices);}
export function validateItemProfileCandidateSetGate(output,input={}){const gate=runItemProfileCandidateSetGate(output,input);return{pass:gate.pass,concerns:gate.concerns,evidence:gate.evidence};}
