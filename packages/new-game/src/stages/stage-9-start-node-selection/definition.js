import { assertStage9Ports } from './ports.js';
import { runStage9StartNodeSelector } from './orchestration.js';

export const stage9Definition = Object.freeze({
  id: 9,
  name: 'start-node-selection',
  version: 1,
  stageType: 'candidate_bound_semantic_selection',
  async execute({ input, services = {} } = {}) {
    const result = await runStage9StartNodeSelector(input, assertStage9Ports(services.stage9 ?? services));
    const status = result?.status === 'ready' ? 'approved'
      : result?.status === 'requires_repair' ? 'repair_required' : 'blocked';
    return { status, artifact: result };
  }
});
