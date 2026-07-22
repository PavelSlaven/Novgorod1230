import { validateSpatialRef } from './spatial-v3.js';

const LEGACY_POSITION_KEYS = Object.freeze(['anchor_id', 'minilocation_id', 'location_id', 'place_id', 'region_id']);

function requireFixtureMode(options) {
  if (!['migration', 'shadow_fixture'].includes(options?.mode)) throw new TypeError('v2 spatial adapter is permitted only for migration or shadow fixture');
}

function normalizeLegacyPosition(position = {}) {
  return Object.freeze(Object.fromEntries([...LEGACY_POSITION_KEYS].reverse().map((key) => [key, typeof position[key] === 'string' && position[key].trim() ? position[key].trim() : null])));
}

function validateLegacyPositionChain(position = {}) {
  const normalized = normalizeLegacyPosition(position);
  const errors = [];
  if (!normalized.region_id) errors.push('region_id is required');
  let gap = false;
  for (const key of ['place_id', 'location_id', 'minilocation_id', 'anchor_id']) {
    if (!normalized[key]) gap = true;
    else if (gap) errors.push(`${key} cannot exist without its parent position`);
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function validateLegacyGraphEdge(edge = {}, nodeIds = null) {
  const errors = [];
  if (!(typeof edge.id === 'string' && edge.id.trim())) errors.push('edge.id is required');
  if (!(typeof edge.from_node_id === 'string' && edge.from_node_id.trim())) errors.push('edge.from_node_id is required');
  if (!(typeof edge.to_node_id === 'string' && edge.to_node_id.trim())) errors.push('edge.to_node_id is required');
  if (edge.from_node_id === edge.to_node_id) errors.push('edge cannot connect a node to itself');
  if (!['G0', 'G1', 'G2', 'G3', 'G4', 'G5'].includes(edge.scale_level)) errors.push('edge.scale_level is invalid');
  if (!(typeof edge.edge_type === 'string' && edge.edge_type.trim())) errors.push('edge.edge_type is required');
  if (nodeIds instanceof Set && !nodeIds.has(edge.from_node_id)) errors.push('edge.from_node_id does not exist');
  if (nodeIds instanceof Set && !nodeIds.has(edge.to_node_id)) errors.push('edge.to_node_id does not exist');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

function buildLegacyGraphIndex(nodes = [], edges = []) {
  const outgoing = {};
  for (const edge of edges) if (typeof edge?.from_node_id === 'string' && edge.from_node_id.trim()) (outgoing[edge.from_node_id] ??= []).push(structuredClone(edge));
  return Object.freeze({ nodes: Object.freeze(Object.fromEntries(nodes.filter((node) => node?.id).map((node) => [node.id, structuredClone(node)]))), outgoing: Object.freeze(outgoing) });
}

export function createV2SpatialFixtureAdapter(options = {}) {
  requireFixtureMode(options);
  return Object.freeze({
    normalizePosition: normalizeLegacyPosition,
    validatePositionChain: validateLegacyPositionChain,
    validateGraphEdge: validateLegacyGraphEdge,
    buildGraphIndex: buildLegacyGraphIndex,
    resolveAdjacentEdges: (index, nodeId) => Object.freeze(structuredClone(index?.outgoing?.[nodeId] ?? []))
  });
}

/** Explicitly bounded migration/shadow-fixture adapter. It is never imported by v3 composition. */
export function adaptV2PositionForSpatialV3Fixture(legacyPosition, options = {}) {
  requireFixtureMode(options);
  if (!legacyPosition || typeof legacyPosition !== 'object' || Array.isArray(legacyPosition)) throw new TypeError('legacy position must be an object');
  const mappings = options.mappings;
  if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings)) throw new TypeError('v2 spatial adapter requires explicit reviewed mappings');
  const legacyId = LEGACY_POSITION_KEYS.map((key) => typeof legacyPosition[key] === 'string' ? legacyPosition[key].trim() : '').find(Boolean);
  const mapped = legacyId ? mappings[legacyId] : null;
  const validation = validateSpatialRef(mapped);
  if (!validation.ok) throw new RangeError('legacy position has no explicit reviewed v3 spatial mapping');
  return Object.freeze({ spatial_kind: mapped.spatial_kind, spatial_id: mapped.spatial_id });
}
