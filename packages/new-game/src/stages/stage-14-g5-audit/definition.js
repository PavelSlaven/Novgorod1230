import { assertStage14Ports } from './ports.js';
import { runStage14G5AuditBlock } from './orchestration/run-stage-14.js';
export const stage14Definition=Object.freeze({id:14,name:'g5-audit',version:1,async execute({input,services={}}={}){const ports=assertStage14Ports(services.stage14??services);const result=await runStage14G5AuditBlock({input,...ports});return{status:result?.pass===true?'approved':'blocked',artifact:result};}});
