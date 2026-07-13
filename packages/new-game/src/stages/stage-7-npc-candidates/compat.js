import { legacyStage2To8Services } from '../../legacy-adapter.js';
import { runStage7NpcCandidatesBlock,runNpcCandidateSetGateBlock } from './orchestration/run-stage-7.js';
export { buildStage7NpcCandidatesInput } from './input.js';
export async function runStage7NpcCandidates(context,input={},deps={}){return runStage7NpcCandidatesBlock(context,input,{...legacyStage2To8Services,...deps});}
export function runNpcCandidateSetGate(output,policy={}){return runNpcCandidateSetGateBlock(output,policy,legacyStage2To8Services);}
export function validateNpcCandidateSetGate(output,policy={}){const gate=runNpcCandidateSetGate(output,policy);return{pass:gate.pass,concerns:gate.concerns,evidence:gate.evidence};}
