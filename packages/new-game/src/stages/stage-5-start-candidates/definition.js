import { runStage5StartCandidatesBlock } from './orchestration/run-stage-5.js';
export const stage5Definition=Object.freeze({id:5,name:'start_candidates',version:1,stageType:'read_only_retrieval',execute({context,input,services}={}){return runStage5StartCandidatesBlock(context,input,services);}});
