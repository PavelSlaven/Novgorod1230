import { runStage10StartPlaceAuditGate } from './audit.js';
import { normalizeStage10Ports } from './ports.js';

export const stage10Definition = Object.freeze({
  id: 10,
  name: 'start-place-audit',
  version: 1,
  stageType: 'semantic_and_database_audit',
  async execute({ input, services = {} } = {}) {
    const artifact = await runStage10StartPlaceAuditGate(input, normalizeStage10Ports(services.stage10 ?? services));
    return { status: artifact?.pass === true ? 'approved' : 'blocked', artifact };
  }
});
