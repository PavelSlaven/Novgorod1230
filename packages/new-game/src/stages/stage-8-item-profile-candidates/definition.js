import { runStage8ItemProfileRetrieverBlock } from './orchestration/run-stage-8.js';
export const stage8Definition=Object.freeze({id:8,name:'item_profile_candidates',version:1,stageType:'read_only_retrieval',execute({input,services}={}){return runStage8ItemProfileRetrieverBlock(input,services);}});
