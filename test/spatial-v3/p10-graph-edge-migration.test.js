import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraphEdgeMigrationInventory, summarizeGraphEdgeMigrationInventory } from '../../tools/spatial-v3/p10-graph-edge-migration.mjs';

test('P10 classifies legacy graph edges only through an explicit review and strips terrain/time authority', () => {
  const rows = buildGraphEdgeMigrationInventory({ graphEdges: [{ id: 'edge-a', from_node_id: 'a', to_node_id: 'b', edge_type: 'road', base_time_minutes: 12 }, { id: 'edge-b', from_node_id: 'b', to_node_id: 'a' }], reviewedClassifications: [{ legacy_graph_edge_id: 'edge-a', classification: 'route_chain_candidate', route_chain_ref: 'route-review-1', review_reason: 'reviewed topology', reviewed_source_ref: 'source-1' }, { legacy_graph_edge_id: 'edge-b', classification: 'deprecated_editor_hint', review_reason: 'editor-only link' }] });
  assert.deepEqual(rows.map((row) => [row.legacy_graph_edge_id, row.classification, row.legacy_terrain_time_authoritative]), [['edge-a', 'route_chain_candidate', false], ['edge-b', 'deprecated_editor_hint', false]]);
  assert.equal(summarizeGraphEdgeMigrationInventory(rows).counts.route_chain_candidate, 1);
});

test('P10 rejects duplicate/missing review IDs, route candidates without chains and diagonal G1 route conversion', () => {
  const edge = { id: 'e', from_node_id: 'a', to_node_id: 'b' };
  const review = { legacy_graph_edge_id: 'e', classification: 'route_chain_candidate', route_chain_ref: 'r', review_reason: 'x' };
  assert.throws(() => buildGraphEdgeMigrationInventory({ graphEdges: [edge, edge] }), /ambiguous_graph_edge_mapping/);
  assert.throws(() => buildGraphEdgeMigrationInventory({ graphEdges: [edge], reviewedClassifications: [review, review] }), /ambiguous_graph_edge_mapping/);
  assert.throws(() => buildGraphEdgeMigrationInventory({ graphEdges: [edge], reviewedClassifications: [{ ...review, route_chain_ref: null }] }), /route_chain_reference_missing/);
  const [diagonal] = buildGraphEdgeMigrationInventory({ graphEdges: [{ ...edge, scale_level: 'G1', grid_delta_x: 1, grid_delta_y: 1 }], reviewedClassifications: [review] });
  assert.deepEqual([diagonal.classification, diagonal.gap_code], ['gap', 'diagonal_g1_edge_forbidden']);
});
