import { buildStage3HistoricalFrameInput } from './input.js';
import { validateStage3HistoricalFrame } from './validation.js';

export const stage3Definition = Object.freeze({
  id: 3,
  name: 'historical_frame',
  version: 1,
  stageType: 'semantic_selection',
  buildInput: buildStage3HistoricalFrameInput,
  validate: validateStage3HistoricalFrame,
  async execute({ input, services = {} } = {}) {
    const executor = services.stage3?.executor ?? services.selectHistoricalFrame ?? services.executor;
    if (typeof executor !== 'function') throw new Error('Stage 3 requires a historical-frame selector executor.');
    const raw = await executor({ input, stage: { id: 3, slug: 'historical_frame', output_schema: 'historical_frame' } });
    const artifact = raw?.output ?? raw?.data ?? raw;
    const concerns = validateStage3HistoricalFrame(artifact, input);
    return { status: concerns.length === 0 ? 'approved' : 'repair_required', artifact, concerns };
  }
});
