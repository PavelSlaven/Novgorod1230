import { createSpatialV3PortUnavailableResult } from '@rus/contracts/spatial-v3/ports';
import { buildCombinedWritePlan } from './spatial-v3-write-plan.js';

export function createCombinedWritePlanBuilder(options = null) {
  return typeof options?.verifyApproval === 'function' ? Object.freeze({ build: async (input) => buildCombinedWritePlan(input, options) }) : Object.freeze({ build: async () => createSpatialV3PortUnavailableResult('turn.combined_write_plan_builder.build') });
}
