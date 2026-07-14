import { assertStage15Ports } from './ports.js';
import { runStage15NpcPlacementBlock } from './orchestration/run-stage-15.js';
export const stage15Definition=Object.freeze({id:15,name:'npc-placement',version:1,async execute({input,services={}}={}){const ports=assertStage15Ports(services.stage15??services);const result=await runStage15NpcPlacementBlock({input,...ports});return{status:result?.pass===true?'approved':'blocked',artifact:result};}});
