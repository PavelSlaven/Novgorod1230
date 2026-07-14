import { assertStage26Executors } from './ports.js';
import { runStage26FirstGameScreenBlock } from './orchestration/run-stage-26.js';

export const stage26Definition = Object.freeze({
  id: 26,
  name: 'first-game-screen',
  version: 1,
  async execute({ input, services = {} } = {}) {
    const serviceSet = services.stage26 ?? services;
    const executors = assertStage26Executors(serviceSet);
    const result = await runStage26FirstGameScreenBlock({ input, ...executors, maxRepairCycles: serviceSet.maxRepairCycles ?? 2 });
    if (result?.pass === true) return { status: 'approved', artifact: result };
    return {
      status: result?.repair_route && result.repair_route.return_to_stage !== 'blocked' ? 'repair_required' : 'blocked',
      artifact: result
    };
  }
});
