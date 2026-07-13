import { legacyStage2To8Services } from '../../legacy-adapter.js';
import { runStage4RegionalContextBlock } from './orchestration/run-stage-4.js';
export async function runStage4RegionalContext(context, input = {}, deps = {}) { return runStage4RegionalContextBlock(context, input, { ...legacyStage2To8Services, ...deps }); }
