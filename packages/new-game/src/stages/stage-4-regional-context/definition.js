import { runStage4RegionalContextBlock } from './orchestration/run-stage-4.js';
export const stage4Definition=Object.freeze({id:4,name:'regional_context',version:1,stageType:'read_only_retrieval',execute({context,input,services}={}){return runStage4RegionalContextBlock(context,input,services);}});
