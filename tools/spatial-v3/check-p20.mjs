import {
  createSpatialContextLoader,
  createSceneMaterializer,
  createFrontierTopologyResolver,
  createTargetPreparationService,
  createCrossDomainProposalComposer
} from '@rus/materialization/spatial-v3-materialization';

const required = [
  createSpatialContextLoader,
  createSceneMaterializer,
  createFrontierTopologyResolver,
  createTargetPreparationService,
  createCrossDomainProposalComposer
];
if (!required.every((entry) => typeof entry === 'function')) throw new Error('P20 materialization public surface is incomplete');
console.log('P20 target-only materialization surface: OK');
