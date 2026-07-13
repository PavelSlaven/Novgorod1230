import { assertStage20Ports } from './ports.js';
import { runStage20VisibleContextBlock } from './orchestration/run-stage-20.js';

export const stage20Definition = Object.freeze({
  id: 20,
  name: 'visible-context',
  version: 1,
  async execute({ input, services = {}, repairRequest = null } = {}) {
    const ports = assertStage20Ports(services.stage20 ?? services, { repairRequest });
    const result = await runStage20VisibleContextBlock({ input, ...ports, repairRequest });
    return { status: result?.pass === true ? 'approved' : 'blocked', artifact: result };
  }
});
