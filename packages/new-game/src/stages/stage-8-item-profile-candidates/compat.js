import { legacyStage2To8Services } from '../../legacy-adapter.js';
import { buildStage8ItemProfileInputFromPipeline as coreBuild } from './input.js';
import { runStage8ItemProfileRetrieverBlock,runStage8ItemProfileCandidatesBlock,runItemProfileCandidateSetGateBlock,buildStage8ManagedPipelineResult } from './orchestration/run-stage-8.js';
export { STAGE8_INPUT_SCHEMA,STAGE8_OUTPUT_SCHEMA } from './policy.js';
export { buildStage8ManagedPipelineResult };
export const normalizeStage8ItemProfilePolicy=legacyStage2To8Services.normalizeStage8ItemProfilePolicy;
export const validateStage8ItemProfileRetrieverInput=legacyStage2To8Services.validateStage8ItemProfileRetrieverInput;
export function buildStage8ItemProfileInputFromPipeline(context,options={}){return coreBuild(context,options,legacyStage2To8Services);}
export function runStage8ItemProfileRetriever(input,deps={}){return runStage8ItemProfileRetrieverBlock(input,{...legacyStage2To8Services,...deps});}
export function runStage8ItemProfileCandidates(context,input=null,deps={}){return runStage8ItemProfileCandidatesBlock(context,input,{...legacyStage2To8Services,...deps});}
export function runItemProfileCandidateSetGate(output,input={}){return runItemProfileCandidateSetGateBlock(output,input,legacyStage2To8Services);}
export function validateItemProfileCandidateSetGate(output,input={}){const gate=runItemProfileCandidateSetGate(output,input);return{pass:gate.pass,concerns:gate.concerns,evidence:gate.evidence};}
