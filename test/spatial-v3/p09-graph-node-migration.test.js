import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraphNodeMigrationInventory, summarizeGraphNodeMigrationInventory } from '../../tools/spatial-v3/p09-graph-node-migration.mjs';

test('P09 inventory maps only explicit reviewed legacy IDs and records the remainder as typed gaps', () => {
  const rows = buildGraphNodeMigrationInventory({
    graphNodes: [{ id: 'g4-a', scale_level: 'G4' }, { id: 'g1-a', scale_level: 'G1' }],
    reviewedMappings: [{ legacy_graph_node_id: 'g4-a', target_spatial_node_id: 'spatial-g4-a', target_spatial_node_version: 1, target_world_revision_id: 'rev-1', reviewed_source_ref: 'src-reviewed', review_reason: 'reviewed inventory record' }]
  });
  assert.deepEqual(rows.map(({ legacy_graph_node_id, mapping_status }) => [legacy_graph_node_id, mapping_status]), [['g1-a', 'gap'], ['g4-a', 'reviewed']]);
  assert.equal(summarizeGraphNodeMigrationInventory(rows).counts.gap, 1);
});

test('P09 rejects name-like ambiguity and duplicated source/mapping IDs', () => {
  assert.throws(() => buildGraphNodeMigrationInventory({ graphNodes: [{ id: 'same', scale_level: 'G4' }, { id: 'same', scale_level: 'G4' }] }), /ambiguous_graph_node_mapping/);
  const mapping = (target_spatial_node_id) => ({ legacy_graph_node_id: 'a', target_spatial_node_id, target_spatial_node_version: 1, target_world_revision_id: 'rev-1', reviewed_source_ref: 's', review_reason: 'reviewed' });
  assert.throws(() => buildGraphNodeMigrationInventory({ graphNodes: [{ id: 'a', scale_level: 'G4' }], reviewedMappings: [mapping('one'), mapping('two')] }), /ambiguous_graph_node_mapping/);
});

test('P09 inventory digest is content-sensitive and stable under row ordering', () => {
  const first = [{ legacy_graph_node_id: 'a', mapping_status: 'gap', source_digest: 'a'.repeat(64), mapping_digest: 'b'.repeat(64) }];
  const changed = [{ ...first[0], gap_code: 'different' }];
  assert.notEqual(summarizeGraphNodeMigrationInventory(first).digest, summarizeGraphNodeMigrationInventory(changed).digest);
  assert.equal(summarizeGraphNodeMigrationInventory([...first, { ...first[0], legacy_graph_node_id: 'b' }]).digest, summarizeGraphNodeMigrationInventory([{ ...first[0], legacy_graph_node_id: 'b' }, ...first]).digest);
});
