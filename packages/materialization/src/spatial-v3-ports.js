import { createSpatialV3PortUnavailableResult } from '@rus/contracts/spatial-v3/ports';

export function createTopologyProposalValidator() {
  return Object.freeze({ validate: async () => createSpatialV3PortUnavailableResult('materialization.topology_proposal_validator.validate') });
}
