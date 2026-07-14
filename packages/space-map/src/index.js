import { deepFreeze } from '@rus/kernel';

export const GRAPH_LEVELS = deepFreeze(['G0','G1','G2','G3','G4','G5']);
const POSITION_KEYS = ['region_id','place_id','location_id','minilocation_id','anchor_id','last_route_id'];

export function normalizePosition(position = {}) {
  const out = {};
  for (const key of POSITION_KEYS) out[key] = text(position[key]) || null;
  return deepFreeze(out);
}

export function validatePositionChain(position = {}) {
  const normalized = normalizePosition(position);
  const errors = [];
  if (!normalized.region_id) errors.push('region_id is required');
  const chain = ['place_id','location_id','minilocation_id','anchor_id'];
  let gap = false;
  for (const key of chain) {
    if (!normalized[key]) gap = true;
    else if (gap) errors.push(`${key} cannot exist without its parent position`);
  }
  return { ok: errors.length === 0, errors };
}

export function validateGraphNode(node = {}) {
  const errors = [];
  if (!text(node.id)) errors.push('node.id is required');
  if (!GRAPH_LEVELS.includes(text(node.scale_level))) errors.push('node.scale_level is invalid');
  if (!text(node.node_type)) errors.push('node.node_type is required');
  if (text(node.scale_level) !== 'G0' && !text(node.parent_node_id)) errors.push('non-G0 node requires parent_node_id');
  if (text(node.scale_level) === 'G1' && text(node.node_type) === 'region_cell') {
    for (const key of ['grid_x','grid_y','grid_z','cell_size_km','crossing_base_gu','crossing_base_time_hours']) {
      if (!Number.isFinite(Number(node[key]))) errors.push(`G1 region_cell requires numeric ${key}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateGraphEdge(edge = {}, nodeIds = null) {
  const errors = [];
  if (!text(edge.id)) errors.push('edge.id is required');
  if (!text(edge.from_node_id)) errors.push('edge.from_node_id is required');
  if (!text(edge.to_node_id)) errors.push('edge.to_node_id is required');
  if (text(edge.from_node_id) === text(edge.to_node_id)) errors.push('edge cannot connect a node to itself');
  if (!GRAPH_LEVELS.includes(text(edge.scale_level))) errors.push('edge.scale_level is invalid');
  if (!text(edge.edge_type)) errors.push('edge.edge_type is required');
  if (nodeIds instanceof Set) {
    if (!nodeIds.has(text(edge.from_node_id))) errors.push('edge.from_node_id does not exist');
    if (!nodeIds.has(text(edge.to_node_id))) errors.push('edge.to_node_id does not exist');
  }
  return { ok: errors.length === 0, errors };
}

export function buildGraphIndex(nodes = [], edges = []) {
  const nodeMap = new Map();
  for (const node of nodes) if (text(node?.id)) nodeMap.set(text(node.id), structuredClone(node));
  const outgoing = new Map();
  for (const edge of edges) {
    const from = text(edge?.from_node_id);
    if (!from) continue;
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(structuredClone(edge));
  }
  return deepFreeze({ nodes: Object.fromEntries(nodeMap), outgoing: Object.fromEntries([...outgoing].map(([key, value]) => [key, value])) });
}

export function resolveAdjacentEdges(index = {}, nodeId = null) {
  const id = text(nodeId);
  const edges = index?.outgoing?.[id];
  return deepFreeze(Array.isArray(edges) ? structuredClone(edges) : []);
}

function text(value) { return String(value ?? '').trim(); }
