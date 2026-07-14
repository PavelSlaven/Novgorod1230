import { legacyStage2To8Services } from '../../legacy-adapter.js';
import { runStage6CandidatePlaceTemplatesBlock,runCandidatePlaceTemplateSetGateBlock } from './orchestration/run-stage-6.js';
export { buildStage6CandidatePlaceTemplatesInput } from './input.js';
export async function runStage6CandidatePlaceTemplates(context,input={},deps={}){return runStage6CandidatePlaceTemplatesBlock(context,input,{...legacyStage2To8Services,...deps});}
export function runCandidatePlaceTemplateSetGate(output,input={}){return runCandidatePlaceTemplateSetGateBlock(output,input,legacyStage2To8Services);}
export function validateCandidatePlaceTemplateSetGate(output,input={}){const gate=runCandidatePlaceTemplateSetGate(output,input);return{pass:gate.pass,concerns:gate.concerns,evidence:gate.evidence};}
