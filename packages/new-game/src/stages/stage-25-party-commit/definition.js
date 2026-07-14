import { assertStage25Ports } from './ports.js';
import { runStage25PartyCommitBlock } from './orchestration/run-stage-25.js';

export const stage25Definition = Object.freeze({
  id: 25,
  name: 'party-commit',
  version: 1,
  async execute({ input, services = {} } = {}) {
    const serviceSet = services.stage25 ?? services;
    const ports = assertStage25Ports(serviceSet);
    const result = await runStage25PartyCommitBlock({ input, ...ports });
    if (result?.pass === true) return { status: 'approved', artifact: result };
    return { status: result?.repair_route ? 'repair_required' : 'blocked', artifact: result };
  }
});
