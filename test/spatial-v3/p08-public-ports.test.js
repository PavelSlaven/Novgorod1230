import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialContextLoader, createSpatialTopologyRepository } from '@rus/space-map/spatial-v3';
import { createTraversalResolver, createTraversalCommitValidator } from '@rus/movement-routes/spatial-v3';
import { createTopologyProposalValidator } from '@rus/materialization/spatial-v3';
import { createSpatialV3Repository, createCombinedWritePlanCommitter } from '@rus/party-store/spatial-v3';
import { createCombinedWritePlanBuilder } from '@rus/turn/spatial-v3';

const cases = [
  ['context loader', () => createSpatialContextLoader().load({})],
  ['topology repository', () => createSpatialTopologyRepository().read({})],
  ['traversal resolver', () => createTraversalResolver().resolve({})],
  ['traversal commit validator', () => createTraversalCommitValidator().validate({})],
  ['proposal validator', () => createTopologyProposalValidator().validate({})],
  ['party repository', () => createSpatialV3Repository().read({})],
  ['write-plan committer', () => createCombinedWritePlanCommitter().commit({})],
  ['write-plan builder', () => createCombinedWritePlanBuilder().build({})]
];

for (const [name, invoke] of cases) test(`P08 ${name} is a typed fail-closed target stub`, async () => {
  const result = await invoke();
  assert.equal(result.ok, false);
  assert.equal(result.status, 'target_stub');
  assert.equal(result.error.code, 'generated_schema_mismatch');
  assert.equal(result.error.message_key, 'spatial_v3.error.generated_schema_mismatch');
  assert.equal(result.error.subject_ref.entity_kind, 'world_revision');
  assert.equal(result.error.dependency_pins.pins.length, 1);
});
