import { runStage6CandidatePlaceTemplatesBlock } from './orchestration/run-stage-6.js';
export const stage6Definition=Object.freeze({id:6,name:'candidate_place_templates',version:1,stageType:'read_only_retrieval',execute({context,input,services}={}){return runStage6CandidatePlaceTemplatesBlock(context,input,services);}});
