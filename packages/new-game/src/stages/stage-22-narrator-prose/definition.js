import { assertStage22Ports } from './ports.js';
import { runStage22NarratorProseBlock } from './orchestration/run-stage-22.js';

export const stage22Definition = Object.freeze({
  id: 22,
  name: 'narrator-prose',
  version: 1,
  async execute({ input, services = {} } = {}) {
    const ports = assertStage22Ports(services.stage22 ?? services);
    const result = await runStage22NarratorProseBlock({ input, ...ports });
    return { status: result?.pass === true ? 'approved' : 'blocked', artifact: result };
  }
});
