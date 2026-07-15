import { deepFreeze } from '@rus/kernel';

const CONDITION_KEYS = new Set(['normal', 'poor', 'bad', 'severe']);

export class MovementRouteError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'MovementRouteError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function validateRouteTraversalInput(route, actor, context) {
  const edge = record(route, 'ROUTE_INPUT_INVALID', 'Route edge must be an object.');
  const traveler = record(actor, 'ROUTE_INPUT_INVALID', 'Actor load state must be an object.');
  const snapshot = record(context, 'ROUTE_INPUT_INVALID', 'Traversal context must be an object.');
  for (const key of ['id', 'from_node_id', 'to_node_id', 'scale', 'route_profile_id']) required(edge[key], key, key === 'scale' ? 'ROUTE_SCALE_REQUIRED' : key === 'route_profile_id' ? 'ROUTE_PROFILE_BINDING_REQUIRED' : 'ROUTE_INPUT_INVALID');
  if (finite(edge.base_gu) == null && finite(edge.base_time_minutes ?? edge.base_time) == null) fail('ROUTE_BASE_TIME_REQUIRED', 'Route must provide base_gu or base_time_minutes.', { route_id: edge.id });
  required(traveler.id, 'id');
  required(traveler.load_category, 'load_category', 'ROUTE_LOAD_CATEGORY_REQUIRED');
  required(snapshot.condition_key, 'condition_key', 'ROUTE_CONDITION_PROFILE_INVALID');
  if (!CONDITION_KEYS.has(snapshot.condition_key)) fail('ROUTE_CONDITION_PROFILE_INVALID', 'Unknown route condition.', { condition_key: snapshot.condition_key });
  const profile = validateProfile(snapshot.route_profile, edge.route_profile_id, traveler.load_category, snapshot.condition_key, snapshot.pace);
  const transport = validateTransportRequirements(edge, snapshot);
  return deepFreeze({ route: clone(edge), actor: clone(traveler), context: clone(snapshot), route_profile: profile, transport_instance_refs: transport });
}

export function assessRouteAvailability(route, context) {
  const edge = record(route, 'ROUTE_INPUT_INVALID', 'Route edge must be an object.');
  const snapshot = record(context, 'ROUTE_INPUT_INVALID', 'Traversal context must be an object.');
  required(edge.id, 'id');
  required(edge.from_node_id, 'from_node_id');
  required(edge.to_node_id, 'to_node_id');
  validateTransportRequirements(edge, snapshot);
  const blockers = [];
  if (edge.closed === true || edge.available === false) blockers.push('route_closed');
  if (edge.seasonally_blocked === true) blockers.push('seasonally_blocked');
  if (edge.requires_permission === true && snapshot.access_state?.allowed !== true) blockers.push('permission_required');
  if (edge.requires_guide === true && snapshot.guide_instance_ref == null) blockers.push('guide_required');
  const exactKnown = ['knows_exact', 'known'].includes(String(snapshot.knowledge_level ?? '').trim());
  return deepFreeze({
    available: blockers.length === 0,
    blockers,
    orientation_required: snapshot.orientation_required === true || !exactKnown,
    orientation_check_request: snapshot.orientation_required === true || !exactKnown ? clone(snapshot.orientation_check_request ?? null) : null
  });
}

export function calculateTravelTime(route, actor, context) {
  const input = validateRouteTraversalInput(route, actor, context);
  const baseGu = finite(input.route.base_gu);
  const explicitMinutes = finite(input.route.base_time_minutes ?? input.route.base_time);
  const baseMinutes = explicitMinutes != null ? explicitMinutes : baseGu * 60;
  if (baseMinutes <= 0) fail('ROUTE_BASE_TIME_REQUIRED', 'Route base time must be positive.', { route_id: input.route.id });
  const conditionMultiplier = input.route_profile.condition_multipliers[input.context.condition_key];
  const loadMultiplier = input.route_profile.load_multipliers[input.actor.load_category];
  const paceMultiplier = input.route_profile.pace_multipliers[input.context.pace];
  return deepFreeze({
    route_id: input.route.id,
    route_profile_id: input.route.route_profile_id,
    base_gu: baseGu,
    base_time_minutes: baseMinutes,
    condition_multiplier: conditionMultiplier,
    load_multiplier: loadMultiplier,
    pace_multiplier: paceMultiplier,
    final_time_minutes: Math.round(baseMinutes * conditionMultiplier * loadMultiplier * paceMultiplier)
  });
}

export function calculatePartialTraversal(input) {
  const value = record(input, 'ROUTE_INPUT_INVALID', 'Partial traversal input must be an object.');
  const edge = record(value.route, 'ROUTE_INPUT_INVALID', 'Partial traversal requires route edge.');
  required(edge.id, 'id');
  const elapsed = finite(value.elapsed_minutes);
  const total = finite(value.total_minutes);
  if (elapsed == null || elapsed < 0 || total == null || total <= 0) fail('ROUTE_PARTIAL_TRAVERSAL_INVALID', 'Elapsed and total traversal time must be valid.', { elapsed_minutes: value.elapsed_minutes, total_minutes: value.total_minutes });
  const progress = Math.min(1000, Math.floor((elapsed / total) * 1000));
  return deepFreeze({ route_id: edge.id, edge_id: edge.id, status: progress === 1000 ? 'completed' : 'partial', progress_permille: progress, elapsed_minutes: elapsed, total_minutes: total });
}

export function buildTraversalRequest(route, actor, context) {
  const input = validateRouteTraversalInput(route, actor, context);
  const availability = assessRouteAvailability(input.route, input.context);
  return deepFreeze({
    route_id: input.route.id,
    actor_id: input.actor.id,
    from_node_id: input.route.from_node_id,
    to_node_id: input.route.to_node_id,
    route_profile_id: input.route.route_profile_id,
    availability,
    time_cost: calculateTravelTime(input.route, input.actor, input.context),
    transport_instance_refs: input.transport_instance_refs,
    orientation_check_request: availability.orientation_check_request,
    failure_consequences: Array.isArray(input.route.failure_consequences) ? clone(input.route.failure_consequences) : []
  });
}

export function validateTraversalResult(result, request) {
  const value = record(result, 'ROUTE_TRAVERSAL_RESULT_INVALID', 'Traversal result must be an object.');
  const traversalRequest = record(request, 'ROUTE_TRAVERSAL_RESULT_INVALID', 'Traversal request must be an object.');
  const errors = [];
  if (value.route_id !== traversalRequest.route_id) errors.push('route_id mismatch');
  if (!['completed', 'partial', 'blocked', 'failed'].includes(value.status)) errors.push('invalid traversal status');
  if (value.status === 'completed' && value.position_node_id !== traversalRequest.to_node_id) errors.push('completed traversal must end at to_node_id');
  if (value.status === 'partial' && (!Number.isInteger(value.progress_permille) || value.progress_permille < 0 || value.progress_permille >= 1000)) errors.push('partial traversal requires progress below 1000');
  if (!Number.isFinite(Number(value.elapsed_minutes)) || Number(value.elapsed_minutes) < 0) errors.push('elapsed_minutes must be non-negative');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function validateProfile(profile, routeProfileId, loadCategory, conditionKey, pace) {
  if (!routeProfileId) fail('ROUTE_PROFILE_BINDING_REQUIRED', 'Route profile binding is required.', {});
  const value = record(profile, 'ROUTE_CONDITION_PROFILE_INVALID', 'Route traversal requires a profile snapshot.');
  if (value.profile_id !== routeProfileId) fail('ROUTE_CONDITION_PROFILE_INVALID', 'Route profile does not match route binding.', { expected: routeProfileId, actual: value.profile_id });
  for (const key of ['condition_multipliers', 'load_multipliers', 'pace_multipliers']) record(value[key], 'ROUTE_CONDITION_PROFILE_INVALID', `Route profile ${key} is required.`);
  if (!positive(value.condition_multipliers[conditionKey]) || !positive(value.load_multipliers[loadCategory]) || !positive(value.pace_multipliers[pace])) fail('ROUTE_CONDITION_PROFILE_INVALID', 'Route profile has no applicable condition, load or pace multiplier.', { condition_key: conditionKey, load_category: loadCategory, pace });
  return deepFreeze(clone(value));
}

function validateTransportRequirements(route, context) {
  if (route.requires_boat === true || route.requires_horse === true || route.requires_sled === true) fail('ROUTE_TRANSPORT_INSTANCE_REQUIRED', 'Boolean transport requirements are not valid travel contracts.', { route_id: route.id });
  if (!route.requires_transport_category) return deepFreeze([]);
  if (!Array.isArray(context.transport_instance_refs)) fail('ROUTE_TRANSPORT_INSTANCE_REQUIRED', 'Concrete transport instance references are required.', { category_id: route.requires_transport_category });
  const matches = context.transport_instance_refs.filter((item) => item && item.transport_instance_id && item.category_id === route.requires_transport_category && item.route_compatible === true && item.condition && item.current_position);
  if (matches.length === 0) fail('ROUTE_TRANSPORT_INSTANCE_REQUIRED', 'No compatible transport instance is present on the route.', { category_id: route.requires_transport_category });
  return deepFreeze(matches.map(clone));
}

function record(value, code, message) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, {}); return value; }
function required(value, field, code = 'ROUTE_INPUT_INVALID') { if (typeof value !== 'string' || !value.trim()) fail(code, `Missing required ${field}.`, { field }); return value; }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; }
function clone(value) { return deepFreeze(structuredClone(value)); }
function fail(code, message, details) { throw new MovementRouteError(code, message, details); }
