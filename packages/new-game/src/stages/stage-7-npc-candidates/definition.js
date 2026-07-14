import { runStage7NpcCandidatesBlock } from './orchestration/run-stage-7.js';
export const stage7Definition=Object.freeze({id:7,name:'npc_candidates',version:1,stageType:'read_only_retrieval',execute({context,input,services}={}){return runStage7NpcCandidatesBlock(context,input,services);}});
