import { legacyStage2To8Services } from '../../legacy-adapter.js';
import { runStage5StartCandidatesBlock } from './orchestration/run-stage-5.js';
export { buildStage5StartCandidatesInput } from './input.js';
export async function runStage5StartCandidates(context,input={},deps={}){return runStage5StartCandidatesBlock(context,input,{...legacyStage2To8Services,...deps});}
export function validateStartCandidateSet(output,{policy={}}={}){const gate=legacyStage2To8Services.runStartCandidateSetGate({stageId:5,stageSlug:'start_candidates',output,policy});return{pass:gate.pass,concerns:gate.concerns,evidence:gate.evidence};}
