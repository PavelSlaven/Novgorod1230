import { deepFreeze } from '@rus/kernel';
import { computeSpatialV3CanonicalDigest, createSpatialV3TypedError } from '@rus/contracts/spatial-v3/registry';
import { expectedStateVersionsCoverCapability, validCapabilityContext, validExpectedStateVersions, validMovementCostSummary, validMovementRiskSummary, validPins, validReason, validStaticSnapshot } from './spatial-v3-validation.js';
import { matchesTarget, validCommandProposal } from './spatial-v3-proposals.js';
import { createRoutePlanActivationValidatorImpl } from './spatial-v3-activation.js';

const READINESS = new Set(['ready', 'requires_frontier_resolution', 'requires_preparation', 'temporarily_blocked', 'data_gap']);
const ENDPOINT_KINDS = new Set(['scene_position', 'site_connection_endpoint', 'world_route_endpoint', 'transit_anchor', 'route_anchor_scene', 'stranded_state']);
const REQUEST_KINDS = new Set(['ordinary', 'rescue', 'repair', 'migration']);
const SCOPES = new Set(['world_travel', 'carrier_local']);
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const copy = (value) => structuredClone(value);
const freeze = (value) => deepFreeze(copy(value));
const digest = (value) => computeSpatialV3CanonicalDigest(value);
const endpointKey = (endpoint) => endpoint ? `${endpoint.endpoint_kind}:${endpoint.endpoint_id}` : null;
const sameEndpoint = (a, b) => endpointKey(a) === endpointKey(b);

function pins(subjectId = 'spatial-v3-target') {
  const entry = {
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: subjectId },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '4.2.0-target.1' }
  };
  return { pins: [entry], canonical_digest: digest([entry]).replace('sha256:', '') };
}

function failure(code, subjectId, diagnostics = {}) {
  return freeze({ ok: false, error: createSpatialV3TypedError(code, {
    subject_ref: { entity_kind: 'world_revision', entity_id: text(subjectId) ?? 'spatial-v3-target' },
    dependency_pins: pins(text(subjectId) ?? 'spatial-v3-target'), diagnostics
  }) });
}

function validEndpoint(value, allowStranded = false) {
  return value && typeof value === 'object' && ENDPOINT_KINDS.has(value.endpoint_kind)
    && text(value.endpoint_id) && (allowStranded || value.endpoint_kind !== 'stranded_state');
}

function validTarget(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.target_kind === 'factual_spatial') return !!value.factual_target_ref && !value.knowledge_target_ref;
  return value.target_kind === 'knowledge_spatial' && !!value.knowledge_target_ref && !value.factual_target_ref;
}

function validateQuery(query) {
  if (!query || typeof query !== 'object' || !text(query.request_id) || !text(query.party_id)) return 'request_id and party_id are required';
  if (!REQUEST_KINDS.has(query.request_kind) || !SCOPES.has(query.journey_scope)) return 'request_kind or journey_scope is invalid';
  if (!query.journey_owner_ref || !['actor', 'cohort', 'transport'].includes(query.journey_owner_ref.entity_kind) || !text(query.journey_owner_ref.entity_id)) return 'journey_owner_ref must be a movement owner';
  if (!validEndpoint(query.start_endpoint_ref, query.request_kind !== 'ordinary')) return 'start_endpoint_ref is invalid for request kind';
  if ((query.target_request == null) === (query.intended_direction_id == null)) return 'target_request and intended_direction_id must be XOR';
  if (query.target_request && !validTarget(query.target_request)) return 'target_request is invalid';
  if (!['factual', 'character_known', 'admin'].includes(query.knowledge_scope)) return 'knowledge_scope is invalid';
  if (query.knowledge_scope === 'character_known' && (!query.knowledge_subject_ref || query.knowledge_subject_ref.entity_kind !== 'actor' || !text(query.knowledge_subject_ref.entity_id))) return 'character_known requires actor knowledge_subject_ref';
  if (query.knowledge_scope !== 'character_known' && query.knowledge_subject_ref != null) return 'factual/admin forbid knowledge_subject_ref';
  if (query.target_request && query.knowledge_scope === 'character_known' && query.target_request.target_kind !== 'knowledge_spatial') return 'character_known target must be a knowledge token';
  if (query.target_request && query.knowledge_scope !== 'character_known' && query.target_request.target_kind !== 'factual_spatial') return 'factual/admin target must be factual';
  if (!validExpectedStateVersions(query.expected_state_versions)) return 'expected_state_versions are incomplete, unordered or unsealed';
  if (!Number.isInteger(query.planning_state_version) || query.planning_state_version < 1) return 'planning_state_version is required';
  if (!validCapabilityContext(query.capability_context) || !expectedStateVersionsCoverCapability(query.capability_context, query.expected_state_versions)) return 'capability_context must be sealed and covered by expected_state_versions';
  if (query.journey_scope === 'carrier_local' && (query.journey_owner_ref.entity_kind !== 'actor' || query.start_endpoint_ref.endpoint_kind !== 'scene_position')) return 'carrier_local requires actor and scene_position source';
  if (query.request_kind === 'ordinary' && (query.recovery_binding_ref || query.administrative_authorization_pins)) return 'ordinary forbids recovery/admin authorization';
  if (query.request_kind === 'rescue' && (query.start_endpoint_ref.endpoint_kind !== 'stranded_state' || query.knowledge_scope !== 'factual' || !query.recovery_binding_ref || query.intended_direction_id != null)) return 'rescue requires exact stranded factual recovery';
  if (['repair', 'migration'].includes(query.request_kind) && (query.knowledge_scope !== 'admin' || !query.administrative_authorization_pins)) return 'repair/migration require administrative authorization';
  const sealed = { ...query }; delete sealed.canonical_digest;
  return query.canonical_digest === digest(sealed) ? null : 'path_query canonical_digest does not cover the complete request';
}

function endpointSnapshot(endpoint, supplied) {
  if (!supplied || typeof supplied !== 'object' || !sameEndpoint(supplied.endpoint_ref, endpoint) || !validPins(supplied.dependency_pins)) return null;
  const keys = ['resolved_scene_baseline_id', 'resolved_position_id', 'resolved_transit_anchor_id', 'resolved_travel_state_id', 'route_point_context_digest'];
  const allowed = new Set(['endpoint_ref', 'dependency_pins', ...keys, 'canonical_digest']);
  if (Object.keys(supplied).some((key) => !allowed.has(key))) return null;
  const has = (key) => text(supplied[key]);
  if (endpoint.endpoint_kind === 'scene_position' || endpoint.endpoint_kind === 'site_connection_endpoint' || endpoint.endpoint_kind === 'world_route_endpoint' || endpoint.endpoint_kind === 'route_anchor_scene') {
    if (!has('resolved_scene_baseline_id') || !has('resolved_position_id') || has('resolved_transit_anchor_id') || has('resolved_travel_state_id') || supplied.route_point_context_digest != null) return null;
  } else if (endpoint.endpoint_kind === 'transit_anchor') {
    if (supplied.resolved_transit_anchor_id !== endpoint.endpoint_id || !text(supplied.route_point_context_digest) || has('resolved_scene_baseline_id') || has('resolved_position_id') || has('resolved_travel_state_id')) return null;
  } else if (endpoint.endpoint_kind === 'stranded_state') {
    if (supplied.resolved_travel_state_id !== endpoint.endpoint_id || has('resolved_scene_baseline_id') || has('resolved_position_id') || has('resolved_transit_anchor_id') || supplied.route_point_context_digest != null) return null;
  } else return null;
  const sealed = { ...supplied }; delete sealed.canonical_digest;
  if (supplied.canonical_digest !== digest(sealed)) return null;
  return freeze(supplied);
}

function normaliseEdge(edge) {
  if (!edge || typeof edge !== 'object' || !text(edge.id) || !validEndpoint(edge.from_endpoint_ref, true) || !validEndpoint(edge.to_endpoint_ref, true)) return null;
  if (!['scene_edge', 'site_connection', 'world_route_segment', 'transit_anchor_transition', 'route_anchor_transition'].includes(edge.edge_kind)) return null;
  const expectedKinds = {
    scene_edge: ['scene_position', 'scene_position'], site_connection: ['site_connection_endpoint', 'site_connection_endpoint'],
    world_route_segment: null, transit_anchor_transition: ['transit_anchor', 'transit_anchor'],
    route_anchor_transition: ['route_anchor_scene', 'route_anchor_scene']
  };
  if (edge.edge_kind === 'world_route_segment') {
    const allowed = new Set(['world_route_endpoint', 'transit_anchor']);
    if (!allowed.has(edge.from_endpoint_ref.endpoint_kind) || !allowed.has(edge.to_endpoint_ref.endpoint_kind)) return null;
  } else if (edge.from_endpoint_ref.endpoint_kind !== expectedKinds[edge.edge_kind][0] || edge.to_endpoint_ref.endpoint_kind !== expectedKinds[edge.edge_kind][1]) return null;
  if (!validStaticSnapshot(edge.step_kind, edge.static_contract_snapshot)) return null;
  if (!validMovementCostSummary(edge.cost_summary) || !validMovementRiskSummary(edge.risk_summary)) return null;
  const readiness = edge.readiness ?? 'ready';
  if (!READINESS.has(readiness)) return null;
  if (readiness === 'requires_frontier_resolution' && (!edge.command_proposal || typeof edge.command_proposal !== 'object')) return null;
  if (readiness === 'requires_preparation' && (!edge.command_proposal || typeof edge.command_proposal !== 'object')) return null;
  if (['temporarily_blocked', 'data_gap'].includes(readiness) && (!Array.isArray(edge.blocking_reasons) || !edge.blocking_reasons.length || !edge.blocking_reasons.every((reason) => validReason(reason, readiness)))) return null;
  return freeze({ ...edge, readiness });
}


function findPaths(edges, start, target, direction) {
  const outgoing = new Map();
  for (const edge of edges) {
    if (direction && edge.direction_id !== direction) continue;
    const key = endpointKey(edge.from_endpoint_ref);
    const rows = outgoing.get(key) ?? []; rows.push(edge); outgoing.set(key, rows);
  }
  for (const rows of outgoing.values()) rows.sort((a, b) => a.id.localeCompare(b.id));
  const startKey = endpointKey(start); const queue = [{ endpoint: start, edges: [] }]; const complete = [];
  const visited = new Set([`${startKey}|`]);
  while (queue.length) {
    const current = queue.shift();
    if (current.edges.length && (!target || matchesTarget(current.endpoint, target))) { complete.push(current.edges); if (target) continue; }
    for (const edge of outgoing.get(endpointKey(current.endpoint)) ?? []) {
      const next = edge.to_endpoint_ref; const ids = `${current.edges.map(({ id }) => id).join(',')},${edge.id}`;
      const key = `${endpointKey(next)}|${ids}`;
      if (current.edges.length >= 32 || visited.has(key)) continue;
      visited.add(key); queue.push({ endpoint: next, edges: [...current.edges, edge] });
    }
  }
  return complete;
}

function unknownCost(kind) { const value = { cost_kind: kind, action_units_min: null, action_units_max: null, minutes_min: null, minutes_max: null, precision: 'unknown' }; return freeze({ ...value, canonical_digest: digest(value) }); }
function unknownRisk() { const value = { risk_class: 'unknown', knowledge_precision: 'hidden', visible_risk_tags: [] }; return freeze({ ...value, canonical_digest: digest(value) }); }
function addRational(left, right) { const numerator = left.numerator * right.denominator + right.numerator * left.denominator; const denominator = left.denominator * right.denominator; const divisor = gcd(numerator, denominator); return { numerator: numerator / divisor, denominator: denominator / divisor }; }
function gcd(left, right) { return right ? gcd(right, left % right) : left; }
function sumCost(kind, edges, forceUnknown = false) {
  if (forceUnknown || edges.some((edge) => edge.cost_summary.precision === 'unknown')) return unknownCost(kind);
  const summaries = edges.map((edge) => edge.cost_summary);
  const actions = summaries.filter((value) => value.action_units_min != null);
  const minutes = summaries.filter((value) => value.minutes_min != null);
  const action_units_min = actions.length ? actions.reduce((sum, value) => sum + value.action_units_min, 0) : null;
  const action_units_max = actions.length ? actions.reduce((sum, value) => sum + value.action_units_max, 0) : null;
  const minutes_min = minutes.length ? minutes.map((value) => value.minutes_min).reduce(addRational) : null;
  const minutes_max = minutes.length ? minutes.map((value) => value.minutes_max).reduce(addRational) : null;
  if ((kind === 'action' && !actions.length) || (kind === 'time' && !minutes.length) || (kind === 'segmented' && !actions.length && !minutes.length)) return unknownCost(kind);
  const precision = summaries.every((value) => value.precision === 'exact') ? 'exact' : 'bounded';
  const value = { cost_kind: kind, action_units_min, action_units_max, minutes_min, minutes_max, precision };
  return freeze({ ...value, canonical_digest: digest(value) });
}
function mergeRisk(edges, forceUnknown = false) {
  if (forceUnknown || edges.some((edge) => edge.risk_summary.knowledge_precision === 'hidden')) return unknownRisk();
  const levels = ['none', 'low', 'moderate', 'high', 'extreme']; const precisions = ['exact', 'rough', 'rumor'];
  const value = { risk_class: edges.reduce((highest, edge) => levels.indexOf(edge.risk_summary.risk_class) > levels.indexOf(highest) ? edge.risk_summary.risk_class : highest, 'none'), knowledge_precision: edges.reduce((least, edge) => precisions.indexOf(edge.risk_summary.knowledge_precision) > precisions.indexOf(least) ? edge.risk_summary.knowledge_precision : least, 'exact'), visible_risk_tags: [...new Set(edges.flatMap((edge) => edge.risk_summary.visible_risk_tags ?? []))].sort() };
  if (value.knowledge_precision === 'rumor' && value.risk_class === 'none') value.risk_class = 'unknown';
  return freeze({ ...value, canonical_digest: digest(value) });
}

function optionFromPath(query, path, snapshots, factualTarget, targetPins, optionOrdinal) {
  const readiness = path.find((edge) => edge.readiness !== 'ready')?.readiness ?? 'ready';
  const visibility = path.at(-1)?.knowledge_visibility ?? (query.knowledge_scope === 'character_known' ? 'visible' : 'hidden');
  const firstBlocking = path.find((edge) => edge.readiness !== 'ready');
  const base = {
    option_id: `${query.request_id}:option:${optionOrdinal}`,
    planning_request_id: query.request_id, path_query_digest: query.canonical_digest, party_id: query.party_id,
    journey_owner_ref: query.journey_owner_ref, journey_scope: query.journey_scope, request_kind: query.request_kind,
    recovery_binding_ref: query.recovery_binding_ref ?? null, administrative_authorization_pins: query.administrative_authorization_pins ?? null,
    knowledge_scope: query.knowledge_scope, knowledge_subject_ref: query.knowledge_subject_ref ?? null,
    target_request: query.target_request ?? null, intended_direction_id: query.intended_direction_id ?? null,
    resolved_factual_target_ref: factualTarget ?? null, target_resolution_dependency_pins: targetPins ?? null,
    mechanical_readiness: readiness, knowledge_visibility: visibility,
    cost_summary: sumCost(query.cost_mode, path, query.knowledge_scope === 'character_known' && visibility === 'hidden'), risk_summary: mergeRisk(path, query.knowledge_scope === 'character_known' && visibility === 'hidden'),
    knowledge_basis: path.at(-1)?.knowledge_basis ?? (query.knowledge_scope === 'factual' ? 'objective' : 'exact'),
    expected_state_versions: query.expected_state_versions
    , capability_context: query.capability_context
  };
  if (readiness === 'ready') {
    const steps = path.map((edge, ordinal) => freeze({ ordinal, step_kind: edge.step_kind, departure_endpoint_snapshot: snapshots[ordinal], arrival_endpoint_snapshot: snapshots[ordinal + 1], static_contract_snapshot: edge.static_contract_snapshot }));
    const option = { ...base, executable: true, blocking_reasons: [], topology_command_proposal: null, preparation_command_proposal: null, steps };
    return freeze({ ...option, canonical_digest: digest(option) });
  }
  const proposal = firstBlocking?.command_proposal ?? null;
  const severity = readiness === 'temporarily_blocked' ? 'temporary' : readiness === 'data_gap' ? 'hard_block' : null;
  const reasons = firstBlocking?.blocking_reasons ?? (severity ? [{ reason_code: readiness === 'data_gap' ? 'route_contract_missing' : 'temporarily_blocked', severity, diagnostic_message: 'Planning cannot continue.' }] : []);
  const option = { ...base, executable: false, blocking_reasons: reasons, steps: [], topology_command_proposal: readiness === 'requires_frontier_resolution' ? proposal : null, preparation_command_proposal: readiness === 'requires_preparation' ? proposal : null };
  return freeze({ ...option, canonical_digest: digest(option) });
}

/**
 * Pure P18 planner. Its collaborators receive all factual reads as arguments;
 * this package never reads a database, v2 state, filesystem or a hidden cache.
 */
export function createMovementPlanner({ resolveKnowledgeTarget, loadTopology, snapshotEndpoint, validateCapability } = {}) {
  if (typeof loadTopology !== 'function' || typeof snapshotEndpoint !== 'function' || typeof validateCapability !== 'function') throw new TypeError('P18 planner requires explicit loadTopology, snapshotEndpoint and validateCapability ports');
  async function resolve(query) {
    const invalid = validateQuery(query);
    if (invalid) return failure('generated_schema_mismatch', query?.party_id, { stage: 'path_query', reason: invalid });
    const request = freeze(query);
    let factualTarget = request.target_request?.factual_target_ref ?? null; let targetPins = null;
    if (request.target_request?.target_kind === 'knowledge_spatial') {
      if (typeof resolveKnowledgeTarget !== 'function') return failure('knowledge_target_resolution_gap', request.party_id, { request_id: request.request_id, reason: 'knowledge resolver is not wired' });
      const resolved = await resolveKnowledgeTarget(freeze({ target_request: request.target_request, knowledge_subject_ref: request.knowledge_subject_ref, expected_state_versions: request.expected_state_versions }));
      if (!resolved?.ok || !resolved.factual_target_ref || !resolved.dependency_pins) return failure('knowledge_target_resolution_gap', request.party_id, { request_id: request.request_id });
      factualTarget = resolved.factual_target_ref; targetPins = resolved.dependency_pins;
    }
    const topology = await loadTopology(freeze({ party_id: request.party_id, journey_owner_ref: request.journey_owner_ref, journey_scope: request.journey_scope, knowledge_scope: request.knowledge_scope, knowledge_subject_ref: request.knowledge_subject_ref, expected_state_versions: request.expected_state_versions }));
    if (!topology?.ok || !Array.isArray(topology.edges)) return failure('route_contract_missing', request.party_id, { request_id: request.request_id, reason: 'explicit topology is unavailable' });
    const capability = await validateCapability(freeze({ query: request, topology, capability_context: request.capability_context }));
    if (!capability?.ok) return failure(capability?.code ?? 'movement_capability_missing', request.party_id, { request_id: request.request_id });
    if (factualTarget && !validPins(targetPins ?? topology.target_resolution_dependency_pins)) return failure('route_plan_version_pin_missing', request.party_id, { request_id: request.request_id, reason: 'factual target resolution pins are required' });
    targetPins ??= topology.target_resolution_dependency_pins;
    const edges = topology.edges.map(normaliseEdge);
    if (edges.some((edge) => !edge)) return failure('route_endpoint_invalid', request.party_id, { request_id: request.request_id, reason: 'topology contains an untyped relation' });
    if (edges.some((edge) => !validCommandProposal(edge, request))) return failure('route_plan_version_pin_missing', request.party_id, { request_id: request.request_id, reason: 'readiness command proposal is not a sealed Appendix B contract' });
    if (request.journey_scope === 'carrier_local' && edges.some((edge) => edge.edge_kind !== 'scene_edge')) return failure('movement_endpoint_kind_invalid', request.party_id, { request_id: request.request_id, reason: 'carrier_local may traverse scene edges only' });
    const candidates = findPaths(edges, request.start_endpoint_ref, factualTarget, request.intended_direction_id)
      .filter((path) => request.knowledge_scope !== 'character_known' || path.every((edge) => ['visible', 'misidentified'].includes(edge.knowledge_visibility)));
    if (!candidates.length) return failure(factualTarget ? 'route_contract_missing' : 'knowledge_target_resolution_gap', request.party_id, { request_id: request.request_id, target: factualTarget ?? request.intended_direction_id });
    const options = [];
    for (let index = 0; index < candidates.length; index += 1) {
      const path = candidates[index]; const snapshots = [];
      if (path.some((edge) => edge.step_kind === 'timed_traversal' && !request.capability_context.allowed_movement_methods.includes(edge.static_contract_snapshot.traversal_snapshot.selected_movement_method_id))) return failure('movement_capability_missing', request.party_id, { request_id: request.request_id, reason: 'selected traversal method is absent from capability context' });
      for (const endpoint of [request.start_endpoint_ref, ...path.map((edge) => edge.to_endpoint_ref)]) {
        const value = await snapshotEndpoint(freeze({ endpoint_ref: endpoint, party_id: request.party_id, expected_state_versions: request.expected_state_versions }));
        const snapshot = endpointSnapshot(endpoint, value?.snapshot ?? value);
        if (!snapshot) return failure('route_plan_snapshot_missing', request.party_id, { request_id: request.request_id, endpoint_ref: endpoint });
        snapshots.push(snapshot);
      }
      if (factualTarget && !matchesTarget(path.at(-1).to_endpoint_ref, factualTarget)) continue;
      options.push(optionFromPath(request, path, snapshots, factualTarget, targetPins, index));
    }
    if (!options.length) return failure('route_contract_missing', request.party_id, { request_id: request.request_id, reason: 'no exact endpoint reaches factual target' });
    return freeze({ ok: true, path_query: request, options, canonical_digest: digest(options.map(({ canonical_digest }) => canonical_digest)) });
  }
  return Object.freeze({ resolve });
}

export function createRoutePlanActivationValidator(options = {}) {
  return createRoutePlanActivationValidatorImpl({ failure, endpointSnapshot, text, digest, validTarget, readiness: READINESS }, options);
}
