import { deepFreeze, sha256, stableStringify } from '@rus/kernel';

// The map-maker's legacy graph-document grammar is intentionally local to the
// authoring tool. It must not pull the v2 position API through the v3 default.
const GRAPH_LEVELS = Object.freeze(['G0', 'G1', 'G2', 'G3', 'G4', 'G5']);

const LAYOUT_KEYS = new Set(['x', 'y', 'fx', 'fy', 'position', 'layout', 'screen_x', 'screen_y']);
const SAFE_SCALE = new Set(GRAPH_LEVELS);

export function importGraphDocument(raw = {}, options = {}) {
  const sourceId = text(options.sourceId) || null;
  const rawNodes = extractNodes(raw);
  const rawEdges = extractEdges(raw);
  const nodes = [];
  const layoutNodes = [];

  for (const entry of rawNodes) {
    const value = unwrapData(entry);
    const node = stripLayout(value);
    node.id = text(node.id);
    node.scale_level = text(node.scale_level);
    node.node_type = text(node.node_type);
    if (node.parent_node_id != null) node.parent_node_id = text(node.parent_node_id);
    nodes.push(node);
    const coordinates = readCoordinates(value);
    if (coordinates) layoutNodes.push({ node_id: node.id, ...coordinates, pinned: Boolean(value.pinned ?? value.fixed) });
  }

  const edges = rawEdges.map((entry, index) => {
    const value = unwrapData(entry);
    const edge = stripLayout(value);
    edge.from_node_id = text(edge.from_node_id ?? edge.source);
    edge.to_node_id = text(edge.to_node_id ?? edge.target);
    edge.scale_level = text(edge.scale_level);
    edge.edge_type = text(edge.edge_type ?? edge.relation);
    delete edge.source;
    delete edge.target;
    delete edge.relation;
    edge.id = text(edge.id) || `edge_${sha256({ from: edge.from_node_id, to: edge.to_node_id, type: edge.edge_type, index }).slice(0, 20)}`;
    return edge;
  });

  const gameGraph = {
    schema_version: 'rus.game_graph.v1',
    source_id: sourceId,
    nodes,
    edges
  };
  const validation = validateGameGraph(gameGraph);
  if (!validation.ok) throw new TypeError(`invalid game graph: ${validation.errors.join('; ')}`);

  const layoutSidecar = {
    schema_version: 'rus.map_layout.v1',
    graph_digest: digestGraph(gameGraph),
    viewport: null,
    nodes: layoutNodes
  };
  const layoutValidation = validateLayoutSidecar(layoutSidecar, gameGraph);
  if (!layoutValidation.ok) throw new TypeError(`invalid layout sidecar: ${layoutValidation.errors.join('; ')}`);
  return deepFreeze({ game_graph: gameGraph, layout_sidecar: layoutSidecar });
}

export function validateGameGraph(graph = {}) {
  const errors = [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const ids = new Set();
  const nodeById = new Map();
  if (graph.schema_version !== 'rus.game_graph.v1') errors.push('schema_version must be rus.game_graph.v1');
  for (const node of nodes) {
    const id = text(node?.id);
    if (ids.has(id)) errors.push(`duplicate node id: ${id}`);
    if (id) ids.add(id);
    nodeById.set(id, node);
    const result = validateGraphNode(node);
    for (const issue of result.errors) errors.push(`node ${id || '?'}: ${issue}`);
    for (const key of LAYOUT_KEYS) if (Object.hasOwn(node ?? {}, key)) errors.push(`node ${id || '?'} contains layout field ${key}`);
  }
  const edgeIds = new Set();
  for (const edge of edges) {
    const id = text(edge?.id);
    if (edgeIds.has(id)) errors.push(`duplicate edge id: ${id}`);
    if (id) edgeIds.add(id);
    const result = validateGraphEdge(edge, ids);
    for (const issue of result.errors) errors.push(`edge ${id || '?'}: ${issue}`);
    for (const key of LAYOUT_KEYS) if (Object.hasOwn(edge ?? {}, key)) errors.push(`edge ${id || '?'} contains layout field ${key}`);
  }
  for (const node of nodes) {
    if (node.scale_level === 'G0') continue;
    const parent = nodeById.get(text(node.parent_node_id));
    if (!parent) continue;
    const childRank = GRAPH_LEVELS.indexOf(node.scale_level);
    const parentRank = GRAPH_LEVELS.indexOf(parent.scale_level);
    if (parentRank >= childRank) errors.push(`node ${node.id}: parent scale must be above child scale`);
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function createSquareLayout(graph = {}, options = {}) {
  const validation = validateGameGraph(graph);
  if (!validation.ok) throw new TypeError(`invalid game graph: ${validation.errors.join('; ')}`);
  const spacingX = positiveNumber(options.spacingX, 180);
  const spacingY = positiveNumber(options.spacingY, 130);
  const originX = finiteNumber(options.originX, 90);
  const originY = finiteNumber(options.originY, 70);
  const sorted = [...graph.nodes].sort((a, b) => {
    const scale = GRAPH_LEVELS.indexOf(a.scale_level) - GRAPH_LEVELS.indexOf(b.scale_level);
    return scale || text(a.parent_node_id).localeCompare(text(b.parent_node_id)) || text(a.id).localeCompare(text(b.id));
  });
  const columns = Math.max(1, Math.floor(positiveNumber(options.columns, Math.ceil(Math.sqrt(Math.max(sorted.length, 1))))));
  const nodes = sorted.map((node, index) => ({
    node_id: node.id,
    x: originX + (index % columns) * spacingX,
    y: originY + Math.floor(index / columns) * spacingY,
    pinned: false
  }));
  const rows = Math.max(1, Math.ceil(sorted.length / columns));
  return deepFreeze({
    schema_version: 'rus.map_layout.v1',
    graph_digest: digestGraph(graph),
    viewport: {
      width: Math.max(spacingX, originX * 2 + Math.max(columns - 1, 0) * spacingX),
      height: Math.max(spacingY, originY * 2 + Math.max(rows - 1, 0) * spacingY)
    },
    nodes
  });
}

export function validateLayoutSidecar(layout = {}, graph = {}) {
  const errors = [];
  const graphValidation = validateGameGraph(graph);
  if (!graphValidation.ok) errors.push(...graphValidation.errors.map((issue) => `graph: ${issue}`));
  if (layout.schema_version !== 'rus.map_layout.v1') errors.push('schema_version must be rus.map_layout.v1');
  if (text(layout.graph_digest) !== digestGraph(graph)) errors.push('graph_digest does not match game graph');
  const nodeIds = new Set((graph.nodes ?? []).map((node) => text(node.id)));
  const seen = new Set();
  for (const item of Array.isArray(layout.nodes) ? layout.nodes : []) {
    const id = text(item?.node_id);
    if (!nodeIds.has(id)) errors.push(`layout references unknown node: ${id}`);
    if (seen.has(id)) errors.push(`duplicate layout node: ${id}`);
    seen.add(id);
    if (!Number.isFinite(Number(item?.x)) || !Number.isFinite(Number(item?.y))) errors.push(`layout node ${id || '?'} requires finite x/y`);
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function projectRenderableGraph(graph = {}, layout = {}) {
  const validation = validateLayoutSidecar(layout, graph);
  if (!validation.ok) throw new TypeError(`invalid graph/layout pair: ${validation.errors.join('; ')}`);
  const coordinates = new Map(layout.nodes.map((item) => [item.node_id, item]));
  const nodes = graph.nodes.map((node) => ({ ...node, render_position: coordinates.get(node.id) ?? null }));
  return deepFreeze({
    schema_version: 'rus.renderable_graph.v1',
    graph_digest: layout.graph_digest,
    viewport: layout.viewport,
    nodes,
    edges: structuredClone(graph.edges)
  });
}

export function renderGraphSvg(renderable = {}, options = {}) {
  const width = Math.max(320, Number(renderable.viewport?.width) || 1200);
  const height = Math.max(240, Number(renderable.viewport?.height) || 800);
  const radius = positiveNumber(options.nodeRadius, 18);
  const positions = new Map((renderable.nodes ?? []).filter((node) => node.render_position).map((node) => [node.id, node.render_position]));
  const edgeSvg = (renderable.edges ?? []).map((edge) => {
    const from = positions.get(edge.from_node_id);
    const to = positions.get(edge.to_node_id);
    if (!from || !to) return '';
    return `<line data-edge-id="${escapeXml(edge.id)}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`;
  }).join('');
  const nodeSvg = (renderable.nodes ?? []).map((node) => {
    const pos = positions.get(node.id);
    if (!pos) return '';
    const label = text(node.name ?? node.label ?? node.id);
    return `<g data-node-id="${escapeXml(node.id)}"><circle cx="${pos.x}" cy="${pos.y}" r="${radius}"/><text x="${pos.x + radius + 6}" y="${pos.y + 5}">${escapeXml(label)}</text></g>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><style>line{stroke:#777;stroke-width:2}circle{fill:#fff;stroke:#222;stroke-width:2}text{font:14px sans-serif;fill:#111}</style>${edgeSvg}${nodeSvg}</svg>`;
}

function digestGraph(graph) {
  return sha256(stableStringify({ schema_version: graph.schema_version, source_id: graph.source_id ?? null, nodes: graph.nodes ?? [], edges: graph.edges ?? [] }));
}
function validateGraphNode(node = {}) {
  const errors = [];
  if (!text(node.id)) errors.push('node.id is required');
  if (!GRAPH_LEVELS.includes(text(node.scale_level))) errors.push('node.scale_level is invalid');
  if (!text(node.node_type)) errors.push('node.node_type is required');
  if (text(node.scale_level) !== 'G0' && !text(node.parent_node_id)) errors.push('non-G0 node requires parent_node_id');
  if (text(node.scale_level) === 'G1' && text(node.node_type) === 'region_cell') {
    for (const key of ['grid_x', 'grid_y', 'grid_z', 'cell_size_km', 'crossing_base_gu', 'crossing_base_time_hours']) if (!Number.isFinite(Number(node[key]))) errors.push(`G1 region_cell requires numeric ${key}`);
  }
  return { ok: errors.length === 0, errors };
}
function validateGraphEdge(edge = {}, nodeIds = null) {
  const errors = [];
  if (!text(edge.id)) errors.push('edge.id is required');
  if (!text(edge.from_node_id)) errors.push('edge.from_node_id is required');
  if (!text(edge.to_node_id)) errors.push('edge.to_node_id is required');
  if (text(edge.from_node_id) === text(edge.to_node_id)) errors.push('edge cannot connect a node to itself');
  if (!GRAPH_LEVELS.includes(text(edge.scale_level))) errors.push('edge.scale_level is invalid');
  if (!text(edge.edge_type)) errors.push('edge.edge_type is required');
  if (nodeIds instanceof Set && !nodeIds.has(text(edge.from_node_id))) errors.push('edge.from_node_id does not exist');
  if (nodeIds instanceof Set && !nodeIds.has(text(edge.to_node_id))) errors.push('edge.to_node_id does not exist');
  return { ok: errors.length === 0, errors };
}
function extractNodes(raw) {
  if (Array.isArray(raw.nodes)) return raw.nodes;
  if (Array.isArray(raw.elements?.nodes)) return raw.elements.nodes;
  throw new TypeError('graph nodes array is required');
}
function extractEdges(raw) {
  if (Array.isArray(raw.edges)) return raw.edges;
  if (Array.isArray(raw.links)) return raw.links;
  if (Array.isArray(raw.elements?.edges)) return raw.elements.edges;
  return [];
}
function unwrapData(value) { return value?.data && typeof value.data === 'object' ? value.data : value; }
function stripLayout(value = {}) {
  const out = {};
  for (const [key, entry] of Object.entries(value ?? {})) if (!LAYOUT_KEYS.has(key)) out[key] = structuredClone(entry);
  return out;
}
function readCoordinates(value = {}) {
  const position = value.position && typeof value.position === 'object' ? value.position : value.layout && typeof value.layout === 'object' ? value.layout : value;
  const x = Number(position.x ?? position.screen_x);
  const y = Number(position.y ?? position.screen_y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
function positiveNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : fallback; }
function finiteNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function text(value) { return String(value ?? '').trim(); }
function escapeXml(value) { return text(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[char]); }
