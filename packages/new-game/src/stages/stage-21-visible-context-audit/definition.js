import { assertStage21Ports } from './ports.js';
import { runStage21VisibleContextAuditBlock } from './orchestration/run-stage-21.js';

export const stage21Definition = Object.freeze({
  id: 21,
  name: 'visible-context-audit',
  version: 1,
  async execute({ input, services = {} } = {}) {
    const ports = assertStage21Ports(services.stage21 ?? services);
    const result = await runStage21VisibleContextAuditBlock({ input, ...ports });
    return { status: result?.pass === true ? 'approved' : 'blocked', artifact: result };
  }
});
