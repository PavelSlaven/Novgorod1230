import { createHash } from 'node:crypto';

const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex');
const levels = new Set(['G0', 'G1', 'G2', 'G3', 'G4']);

/**
 * Produces review-only rows for legacy graph_nodes. Input is explicit inventory,
 * never labels, slugs or coordinates; callers must query the local authoring DB.
 */
export function buildGraphNodeMigrationInventory({ graphNodes, reviewedMappings = [] }) {
  if (!Array.isArray(graphNodes) || !Array.isArray(reviewedMappings)) throw new TypeError('graphNodes and reviewedMappings must be arrays');
  const byLegacyId = new Map();
  for (const mapping of reviewedMappings) {
    if (!mapping || typeof mapping.legacy_graph_node_id !== 'string' || typeof mapping.target_spatial_node_id !== 'string' || !Number.isInteger(mapping.target_spatial_node_version) || typeof mapping.target_world_revision_id !== 'string' || typeof mapping.reviewed_source_ref !== 'string' || typeof mapping.review_reason !== 'string') {
      throw new TypeError('reviewed mapping requires explicit legacy ID, target versioned pin, reviewed source and reason');
    }
    if (byLegacyId.has(mapping.legacy_graph_node_id)) throw new Error(`ambiguous_graph_node_mapping: duplicate explicit mapping for ${mapping.legacy_graph_node_id}`);
    byLegacyId.set(mapping.legacy_graph_node_id, mapping);
  }
  const ids = new Set();
  const rows = graphNodes.map((node) => {
    if (!node || typeof node.id !== 'string' || !levels.has(node.scale_level)) throw new TypeError('graph node requires id and G0–G4 scale_level');
    if (ids.has(node.id)) throw new Error(`ambiguous_graph_node_mapping: duplicate source row ${node.id}`);
    ids.add(node.id);
    const source = { id: node.id, scale_level: node.scale_level, parent_node_id: node.parent_node_id ?? null };
    const mapping = byLegacyId.get(node.id);
    const base = {
      legacy_graph_node_id: node.id,
      legacy_scale_level: node.scale_level,
      target_spatial_level: node.scale_level,
      source_digest: digest(source)
    };
    const row = mapping
      ? { ...base, target_spatial_node_id: mapping.target_spatial_node_id, target_spatial_node_version: mapping.target_spatial_node_version, target_world_revision_id: mapping.target_world_revision_id, mapping_status: 'reviewed', reviewed_source_ref: mapping.reviewed_source_ref, review_reason: mapping.review_reason, gap_code: null }
      : { ...base, target_spatial_node_id: null, target_spatial_node_version: null, target_world_revision_id: null, mapping_status: 'gap', reviewed_source_ref: null, review_reason: 'explicit versioned review has not been supplied', gap_code: 'unreviewed_graph_node_mapping' };
    return Object.freeze({ ...row, mapping_digest: digest(row) });
  });
  for (const legacyId of byLegacyId.keys()) if (!ids.has(legacyId)) throw new Error(`unresolved_ref: mapping source ${legacyId} is absent from graphNodes`);
  return Object.freeze(rows.sort((left, right) => left.legacy_graph_node_id.localeCompare(right.legacy_graph_node_id)));
}

export function summarizeGraphNodeMigrationInventory(rows) {
  const ordered = [...rows].sort((left, right) => left.legacy_graph_node_id.localeCompare(right.legacy_graph_node_id));
  const counts = Object.fromEntries(['reviewed', 'gap', 'ambiguous', 'not_applicable'].map((status) => [status, ordered.filter((row) => row.mapping_status === status).length]));
  return Object.freeze({ row_count: ordered.length, counts: Object.freeze(counts), digest: digest(ordered) });
}
