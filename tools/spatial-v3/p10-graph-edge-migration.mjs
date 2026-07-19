import { createHash } from 'node:crypto';

const classifications = new Set(['containment_only', 'route_chain_candidate', 'deprecated_editor_hint', 'gap']);
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const digest = (value) => createHash('sha256').update(canonical(value)).digest('hex');

/**
 * Classifies only explicit review decisions. Legacy terrain/time fields are deliberately
 * retained in source evidence but never emitted as a v3 authoritative value.
 */
export function buildGraphEdgeMigrationInventory({ graphEdges, reviewedClassifications = [] }) {
  if (!Array.isArray(graphEdges) || !Array.isArray(reviewedClassifications)) throw new TypeError('graphEdges and reviewedClassifications must be arrays');
  const decisions = new Map();
  for (const decision of reviewedClassifications) {
    if (!decision || typeof decision.legacy_graph_edge_id !== 'string' || !classifications.has(decision.classification) || typeof decision.review_reason !== 'string') throw new TypeError('reviewed classification requires explicit edge ID, finite classification and review reason');
    if (decisions.has(decision.legacy_graph_edge_id)) throw new Error(`ambiguous_graph_edge_mapping: duplicate explicit classification for ${decision.legacy_graph_edge_id}`);
    decisions.set(decision.legacy_graph_edge_id, decision);
  }
  const seen = new Set();
  const rows = graphEdges.map((edge) => {
    if (!edge || typeof edge.id !== 'string' || typeof edge.from_node_id !== 'string' || typeof edge.to_node_id !== 'string') throw new TypeError('graph edge requires explicit id and endpoint IDs');
    if (seen.has(edge.id)) throw new Error(`ambiguous_graph_edge_mapping: duplicate source edge ${edge.id}`);
    seen.add(edge.id);
    const source = { id: edge.id, from_node_id: edge.from_node_id, to_node_id: edge.to_node_id, reverse_edge_id: edge.reverse_edge_id ?? null, scale_level: edge.scale_level ?? null, edge_type: edge.edge_type ?? null };
    const review = decisions.get(edge.id);
    const invalidDiagonal = review?.classification === 'route_chain_candidate' && edge.scale_level === 'G1' && Math.abs(Number(edge.grid_delta_x ?? 0)) === 1 && Math.abs(Number(edge.grid_delta_y ?? 0)) === 1;
    const classification = invalidDiagonal ? 'gap' : (review?.classification ?? 'gap');
    const gap_code = invalidDiagonal ? 'diagonal_g1_edge_forbidden' : (classification === 'gap' ? (review?.gap_code ?? 'unreviewed_graph_edge_mapping') : null);
    const row = { legacy_graph_edge_id: edge.id, source_digest: digest(source), classification, review_reason: review?.review_reason ?? 'explicit P10 review has not been supplied', reviewed_source_ref: review?.reviewed_source_ref ?? null, route_chain_ref: classification === 'route_chain_candidate' ? review?.route_chain_ref ?? null : null, gap_code, legacy_terrain_time_authoritative: false };
    if (classification === 'route_chain_candidate' && !row.route_chain_ref) throw new Error(`route_chain_reference_missing: ${edge.id}`);
    return Object.freeze({ ...row, mapping_digest: digest(row) });
  });
  for (const edgeId of decisions.keys()) if (!seen.has(edgeId)) throw new Error(`unresolved_ref: classification source ${edgeId} is absent from graphEdges`);
  return Object.freeze(rows.sort((a, b) => a.legacy_graph_edge_id.localeCompare(b.legacy_graph_edge_id)));
}

export function summarizeGraphEdgeMigrationInventory(rows) {
  const ordered = [...rows].sort((a, b) => a.legacy_graph_edge_id.localeCompare(b.legacy_graph_edge_id));
  const counts = Object.fromEntries([...classifications].sort().map((classification) => [classification, ordered.filter((row) => row.classification === classification).length]));
  return Object.freeze({ row_count: ordered.length, counts: Object.freeze(counts), digest: digest(ordered) });
}
