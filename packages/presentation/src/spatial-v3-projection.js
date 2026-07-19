import { deepFreeze } from '@rus/kernel';
import { createMapPanel, createRoutePanel } from './read-models/panels.js';

const visibility = new Set(['clear', 'partial', 'none']);
const knowledge = new Set(['visible', 'hidden', 'misidentified']);
const readiness = new Set(['ready', 'requires_frontier_resolution', 'requires_preparation', 'temporarily_blocked', 'data_gap']);
const portalStates = new Set(['open', 'closed', 'locked', 'destroyed']);
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const sealed = (value) => deepFreeze(structuredClone(value));

function noCoordinates(records, label) {
  const forbidden = new Set(['x', 'y', 'z', 'coordinate', 'coordinates', 'distance', 'bearing', 'layout_x', 'layout_y', 'layout_z']);
  const walk = (value) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!plain(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.has(key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase())) throw new TypeError(`${label} forbids coordinate-derived relations`);
      walk(child);
    }
  };
  for (const record of records) walk(record);
}
function index(records, id, label) {
  if (!Array.isArray(records)) throw new TypeError(`${label} must be an array`);
  const result = new Map();
  for (const record of records) { if (!text(record?.[id]) || result.has(record[id])) throw new TypeError(`${label} requires unique ${id}`); result.set(record[id], record); }
  return result;
}
function portalVisibility(portal) {
  if (!plain(portal) || !portalStates.has(portal.state) || !text(portal.condition_profile_ref) || !plain(portal.visibility_by_state) || Object.keys(portal.visibility_by_state).length !== portalStates.size || [...portalStates].some((state) => !visibility.has(portal.visibility_by_state[state]))) throw new TypeError('portal visibility requires an exhaustive typed open/closed/locked/destroyed condition mapping');
  return portal.visibility_by_state[portal.state];
}
function portalAcousticLoss(portal) {
  if (!plain(portal) || !portalStates.has(portal.state) || !text(portal.condition_profile_ref) || !plain(portal.acoustic_loss_by_state) || Object.keys(portal.acoustic_loss_by_state).length !== portalStates.size || [...portalStates].some((state) => portal.acoustic_loss_by_state[state] !== 'blocked' && (!Number.isInteger(portal.acoustic_loss_by_state[state]) || portal.acoustic_loss_by_state[state] < 0))) throw new TypeError('portal acoustics requires an exhaustive typed open/closed/locked/destroyed condition mapping');
  return portal.acoustic_loss_by_state[portal.state];
}

export function createSpatialV3VisibilityResolver({ positions, g6, links = [], portals = {} } = {}) {
  noCoordinates(Array.isArray(positions) ? positions : [], 'visibility position');
  noCoordinates(Array.isArray(g6) ? g6 : [], 'visibility G6');
  noCoordinates(Array.isArray(links) ? links : [], 'visibility link');
  const byPosition = index(positions, 'id', 'visibility positions');
  const byG6 = index(g6, 'id', 'visibility g6');
  const direct = new Map();
  for (const link of links) {
    if (!byPosition.has(link?.from_position_id) || !byPosition.has(link?.to_position_id) || !visibility.has(link?.base_result)) throw new TypeError('visibility link requires typed endpoints and a base result');
    direct.set(`${link.from_position_id}\u0000${link.to_position_id}`, sealed(link));
  }
  const resolve = ({ from_position_id, to_position_id, lighting, stable_cover, dynamic_occlusion, concealment, weather } = {}) => {
    const from = byPosition.get(from_position_id); const to = byPosition.get(to_position_id);
    if (!from || !to || !byG6.has(from.g6_id) || !byG6.has(to.g6_id)) throw new TypeError('visibility resolve requires known positions');
    let base = 'none'; const link = direct.get(`${from.id}\u0000${to.id}`);
    if (from.g6_id === to.g6_id && byG6.get(from.g6_id).intra_g6_visibility_mode === 'default_clear') base = 'clear';
    if (link) {
      base = link.base_result;
      if (link.portal_id) {
        base = weakest(base, portalVisibility(portals[link.portal_id]));
      }
    }
    for (const condition of [lighting, stable_cover, dynamic_occlusion, concealment, weather]) if (!visibility.has(condition)) throw new TypeError('visibility conditions must be declared clear, partial or none');
    return sealed({ visibility: [base, lighting, stable_cover, dynamic_occlusion, concealment, weather].reduce(weakest), source: link ? 'explicit_link' : base === 'clear' ? 'default_clear_g6' : 'absent_relation' });
  };
  return Object.freeze({ resolve });
}
function weakest(a, b) { return visibilityRank(a) < visibilityRank(b) ? a : b; }
function visibilityRank(value) { return value === 'clear' ? 2 : value === 'partial' ? 1 : 0; }

export function createSpatialV3AcousticResolver({ g6, edges = [], portals = {} } = {}) {
  noCoordinates(Array.isArray(g6) ? g6 : [], 'acoustic G6');
  noCoordinates(Array.isArray(edges) ? edges : [], 'acoustic edge');
  const nodes = index(g6, 'id', 'acoustic g6');
  for (const item of nodes.values()) if (item.acoustic_uniformity !== 'uniform') throw new TypeError('acoustic g6 must be uniform');
  const outgoing = new Map();
  for (const edge of edges) {
    if (!nodes.has(edge?.from_g6_id) || !nodes.has(edge?.to_g6_id) || !Number.isInteger(edge?.base_loss) || edge.base_loss < 0 || edge.base_loss > 2) throw new TypeError('acoustic edge requires known G6 endpoints and approved base loss');
    (outgoing.get(edge.from_g6_id) ?? outgoing.set(edge.from_g6_id, []).get(edge.from_g6_id)).push(sealed(edge));
  }
  const resolve = ({ from_g6_id, to_g6_id, loudness, target_ambient_noise, condition_losses = {} } = {}) => {
    if (!nodes.has(from_g6_id) || !nodes.has(to_g6_id) || !Number.isInteger(loudness) || loudness < 0 || !Number.isInteger(target_ambient_noise) || target_ambient_noise < 0) throw new TypeError('acoustic resolve requires typed endpoints and non-negative integer loudness');
    const distances = new Map([[from_g6_id, 0]]); const queue = [[0, from_g6_id]];
    while (queue.length) { queue.sort((a, b) => a[0] - b[0]); const [loss, node] = queue.shift(); if (loss !== distances.get(node)) continue; for (const edge of outgoing.get(node) ?? []) { const extra = edge.condition_profile_ref ? condition_losses[edge.condition_profile_ref] : 0; if (!Number.isInteger(extra) || extra < 0) throw new TypeError('acoustic temporary loss must come from a declared pinned condition profile'); const portalLoss = edge.portal_id ? portalAcousticLoss(portals[edge.portal_id]) : 0; if (portalLoss === 'blocked') continue; const candidate = loss + edge.base_loss + extra + portalLoss; if (candidate < (distances.get(edge.to_g6_id) ?? Infinity)) { distances.set(edge.to_g6_id, candidate); queue.push([candidate, edge.to_g6_id]); } } }
    const minimum_loss = distances.get(to_g6_id); const remaining_loudness = minimum_loss == null ? 0 : loudness - minimum_loss - target_ambient_noise;
    return sealed({ minimum_loss: minimum_loss ?? null, remaining_loudness, audibility: remaining_loudness >= 2 ? 'clear' : remaining_loudness === 1 ? 'indistinct' : 'inaudible' });
  };
  return Object.freeze({ resolve });
}

export function projectSpatialV3NavigationBelief(input = {}) {
  const fields = ['party_id', 'character_id', 'updated_change_set_id'];
  if (!fields.every((field) => text(input[field])) || !Number.isInteger(input.updated_at_turn) || !Number.isInteger(input.state_version) || input.state_version < 1 || !['exact', 'high', 'rough', 'low', 'lost'].includes(input.confidence)) throw new TypeError('navigation belief requires persisted identity, time and confidence');
  if (input.perceived_area_ref && (!text(input.perceived_area_ref.knowledge_kind) || !text(input.perceived_area_ref.knowledge_id) || 'spatial_kind' in input.perceived_area_ref)) throw new TypeError('belief uses knowledge references, never factual topology');
  if (!Array.isArray(input.source_facts) || input.source_facts.some((fact) => fact?.knowledge_visible !== true)) throw new TypeError('belief updates require only knowledge-visible facts');
  return sealed({ party_id: input.party_id, character_id: input.character_id, perceived_area_ref: input.perceived_area_ref ?? null, perceived_direction_id: text(input.perceived_direction_id), perceived_bearing_mdeg: Number.isInteger(input.perceived_bearing_mdeg) ? input.perceived_bearing_mdeg : null, perceived_vertical_direction: input.perceived_vertical_direction ?? null, confidence: input.confidence, updated_at_turn: input.updated_at_turn, state_version: input.state_version, updated_change_set_id: input.updated_change_set_id, source_facts: input.source_facts.map(({ evidence_kind, exactness, fact_ref }) => ({ evidence_kind, exactness, fact_ref: structuredClone(fact_ref) })) });
}

export function projectSpatialV3RouteOptions(options = []) {
  if (!Array.isArray(options)) throw new TypeError('route options must be an array');
  return sealed(options.filter((option) => knowledge.has(option?.knowledge_visibility) && option.knowledge_visibility !== 'hidden').map((option) => {
    if (!text(option.option_id) || !text(option.player_label) || !readiness.has(option.mechanical_readiness)) throw new TypeError('visible route option requires player-safe identity, label and readiness');
    return { option_id: option.option_id, label: option.player_label, knowledge_state: option.knowledge_visibility === 'misidentified' ? 'uncertain' : 'known', readiness: option.mechanical_readiness, observed_conditions: Array.isArray(option.observed_conditions) ? option.observed_conditions.map(String) : [] };
  }));
}

export function deriveSpatialV3Interaction({ actor_position_id, target_visible = false, capability, executable_scene_edges = [] } = {}) {
  if (!text(actor_position_id) || !plain(capability) || !['same_position', 'adjacent_position', 'visible'].includes(capability.required_relation) || !Array.isArray(capability.allowed_position_ids) || !Array.isArray(executable_scene_edges)) throw new TypeError('interaction derivation requires capability and current executable scene edges');
  const allowed = new Set(capability.allowed_position_ids);
  const atAllowed = allowed.has(actor_position_id);
  if ((capability.required_relation === 'same_position' && atAllowed) || (capability.required_relation === 'visible' && target_visible)) return sealed({ relation: 'within_reach' });
  const oneStep = executable_scene_edges.some((edge) => edge?.from_position_id === actor_position_id && allowed.has(edge?.to_position_id) && edge.executable === true);
  if (capability.required_relation === 'adjacent_position' && oneStep) return sealed({ relation: 'requires_step' });
  return sealed({ relation: target_visible ? 'visible_only' : 'blocked' });
}

export function createSpatialV3PlayerProjection({ journey_execution = {}, scene = {}, route_options = [], world_signals = [] } = {}) {
  const safeNodes = (scene.nodes ?? []).filter((node) => knowledge.has(node?.knowledge_visibility) && node.knowledge_visibility !== 'hidden').map((node, layout_order) => {
    if (!text(node.display_token) || !text(node.label)) throw new TypeError('player scene nodes require safe display token and label');
    return { token: node.display_token, label: node.label, certainty: node.knowledge_visibility === 'misidentified' ? 'uncertain' : 'known', layout_order };
  });
  const tokens = new Map((scene.nodes ?? []).filter((node) => knowledge.has(node?.knowledge_visibility) && node.knowledge_visibility !== 'hidden').map((node) => [node.id, node.display_token]));
  const safeLinks = (scene.links ?? []).filter((link) => link?.knowledge_visibility !== 'hidden' && tokens.has(link?.from_node_id) && tokens.has(link?.to_node_id)).map((link) => ({ from_token: tokens.get(link.from_node_id), to_token: tokens.get(link.to_node_id) }));
  const status = ['active', 'waiting_at_anchor', 'suspended_at_scene', 'stranded_in_transit', 'completed'].includes(journey_execution.status) ? journey_execution.status : 'active';
  const safeSignals = (Array.isArray(world_signals) ? world_signals : []).map((signal) => ({ kind: text(signal?.kind) ?? 'unknown', approximate_direction: text(signal?.approximate_direction), approximate_area: text(signal?.approximate_area) }));
  return sealed({ version: 1, schema: 'spatial_v3_player_projection', movement: { status, message: text(journey_execution.player_message) ?? null, requires_new_decision: ['waiting_at_anchor', 'suspended_at_scene', 'stranded_in_transit'].includes(status), options: projectSpatialV3RouteOptions(route_options) }, scene_map: { nodes: safeNodes, links: safeLinks }, world_signals: safeSignals });
}

/** Adapts an already safe target projection to the existing browser panel contract. */
export function createSpatialV3ProjectionPanels(projection) {
  if (!plain(projection) || projection.version !== 1 || projection.schema !== 'spatial_v3_player_projection' || !plain(projection.movement) || !plain(projection.scene_map) || !Array.isArray(projection.world_signals)) throw new TypeError('spatial v3 player projection is required');
  return sealed({
    map: createMapPanel({ scene_map: projection.scene_map, world_signals: projection.world_signals }),
    route: createRoutePanel({ movement: projection.movement })
  });
}
