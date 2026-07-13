import { legacyStage2To8Services } from '../../legacy-adapter.js';
export * from './index.js';
export { buildStage3HistoricalFrameInput as buildStage3HistoricalFrameInputCore } from './input.js';
import { buildStage3HistoricalFrameInput as coreBuild } from './input.js';
import { retrieveHistoricalFrameCandidates as coreRetrieve } from './candidates.js';
export function retrieveHistoricalFrameCandidates(input = {}, deps = {}) {
  return coreRetrieve(input, { ...deps, getQueryable: legacyStage2To8Services.getQueryable });
}
export function buildStage3HistoricalFrameInput(context, options = {}) {
  return coreBuild(context, options, { retrieveHistoricalFrameCandidates });
}
