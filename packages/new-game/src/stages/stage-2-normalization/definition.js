import { buildStage2NormalizationInput } from './input.js';
import { validateStage2NormalizedRequest } from './validation.js';

export const stage2Definition = Object.freeze({
  id: 2,
  name: 'normalize_request',
  version: 1,
  stageType: 'contract_shaping',
  buildInput: buildStage2NormalizationInput,
  validate: validateStage2NormalizedRequest,
  async execute({ input, services = {} } = {}) {
    const executor = services.stage2?.executor ?? services.normalizeRequest ?? services.executor;
    if (typeof executor !== 'function') throw new Error('Stage 2 requires a normalization executor.');
    const raw = await executor({ input, stage: { id: 2, slug: 'normalize_request', output_schema: 'new_game_normalized_request' } });
    const artifact = raw?.output ?? raw?.data ?? raw;
    const concerns = validateStage2NormalizedRequest(artifact, input);
    return { status: concerns.length === 0 ? 'approved' : 'repair_required', artifact, concerns };
  }
});
