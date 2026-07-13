import { assertStage23Ports } from './ports.js';
import { runStage23NarratorProseAuditBlock } from './orchestration/run-stage-23.js';

export const stage23Definition = Object.freeze({
  id: 23,
  name: 'narrator-prose-audit',
  version: 1,
  async execute({ input, services = {} } = {}) {
    const ports = assertStage23Ports(services.stage23 ?? services);
    const result = await runStage23NarratorProseAuditBlock({ input, ...ports });
    if (result?.pass === true) return { status: 'approved', artifact: result };
    return { status: result?.repair_route ? 'repair_required' : 'blocked', artifact: result };
  }
});
