import { assertStage24Ports } from './ports.js';
import { runStage24PartyDbWritePlanBlock } from './orchestration/run-stage-24.js';

export const stage24Definition = Object.freeze({
  id: 24,
  name: 'party-db-write-plan',
  version: 1,
  async execute({ input, services = {} } = {}) {
    const serviceSet = services.stage24 ?? services;
    const ports = assertStage24Ports(serviceSet);
    const result = await runStage24PartyDbWritePlanBlock({ input, ...ports });
    if (result?.pass === true) return { status: 'approved', artifact: result };
    return { status: result?.repair_route ? 'repair_required' : 'blocked', artifact: result };
  }
});
