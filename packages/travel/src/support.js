import { deepFreeze, sha256 } from '@rus/kernel';

export const JOURNEY_STATUSES = new Set(['planned', 'active', 'interrupted', 'camped', 'blocked', 'arrived', 'abandoned']);
export const LEG_STATUSES = new Set(['pending', 'active', 'completed', 'interrupted', 'blocked', 'superseded']);
const TRAVEL_BOUNDARY_TYPES = new Set(['leg_completion', 'sunset', 'darkness', 'weather_transition', 'due_timer', 'body_threshold', 'resource_threshold', 'transport_problem', 'navigation_decision', 'significant_observation', 'causal_interruption', 'player_stop', 'arrival']);
const INTERRUPTION_SOURCE_TYPES = new Set(['weather', 'light', 'body', 'transport', 'route', 'due_timer', 'npc_process', 'social_checkpoint', 'signal', 'trace', 'player_command', 'arrival']);

export class TravelError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'TravelError'; this.code = code; this.details = deepFreeze(structuredClone(details)); }
}
export function record(value, code, message) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, {}); return value; }
export function required(value, field) { if (typeof value !== 'string' || !value.trim()) fail('TRAVEL_INPUT_INVALID', `Missing required ${field}.`, { field }); return value; }
export function fail(code, message, details) { throw new TravelError(code, message, details); }
export function clone(value) { return deepFreeze(structuredClone(value)); }

export function validateTravelIntent(intent) {
  const value = record(intent, 'TRAVEL_INPUT_INVALID', 'Travel intent must be an object.');
  required(value.party_id, 'party_id'); required(value.actor_id, 'actor_id');
  if (!['route', 'course'].includes(value.mode)) fail('TRAVEL_INPUT_INVALID', 'Travel intent mode must be route or course.', { mode: value.mode });
  if (value.mode === 'route' && !value.route_id && !Array.isArray(value.route_chain)) fail('TRAVEL_ROUTE_SELECTION_REQUIRED', 'Route travel requires a selected route.', {});
  if (value.mode === 'course' && !value.intended_direction) fail('TRAVEL_INPUT_INVALID', 'Course travel requires intended_direction.', {});
  return clone(value);
}
export function resolveCourseEdgeCandidate(input) {
  const value = record(input, 'TRAVEL_INPUT_INVALID', 'Course edge resolution input must be an object.');
  for (const key of ['origin_g4_id', 'intended_direction', 'selected_candidate_id']) required(value[key], key);
  if (!Array.isArray(value.candidates) || value.candidates.length === 0) fail('TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY', 'Course travel requires at least one explicit fact-graph edge candidate.', { candidate_set: 'course_edges' });
  const ids = new Set();
  const candidates = value.candidates.map((candidate) => {
    const item = record(candidate, 'TRAVEL_INPUT_INVALID', 'Course edge candidate must be an object.');
    for (const key of ['candidate_id', 'edge_id', 'from_g4_id', 'to_g4_id', 'route_profile_id']) required(item[key], key);
    if (!Number.isInteger(item.base_time_minutes) || item.base_time_minutes <= 0) fail('TRAVEL_INPUT_INVALID', 'Course edge candidate requires positive base_time_minutes.', { candidate_id: item.candidate_id });
    if (ids.has(item.candidate_id)) fail('TRAVEL_DATA_GAP', 'Course edge candidates must have unique stable IDs.', { candidate_id: item.candidate_id });
    ids.add(item.candidate_id);
    const applicability = record(item.applicability, 'TRAVEL_DATA_GAP', 'Course edge candidate requires explicit applicability.');
    if (item.from_g4_id !== value.origin_g4_id || applicability.intended_direction !== value.intended_direction) fail('TRAVEL_DATA_GAP', 'Course edge candidate is outside the requested origin or direction.', { candidate_id: item.candidate_id });
    return structuredClone(item);
  });
  candidates.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id));
  const selected = candidates.find((candidate) => candidate.candidate_id === value.selected_candidate_id);
  if (!selected) fail('TRAVEL_EDGE_NOT_TRAVERSABLE', 'Selected course edge is not in the explicit candidate set.', { selected_candidate_id: value.selected_candidate_id });
  return deepFreeze(selected);
}
export function validateTravelRulesBundle({ bundle, world_revision_id, region_id, historical_period_id, catalog_digest } = {}) {
  try { const value = readTravelRulesBundle(bundle, { world_revision_id, region_id, historical_period_id, catalog_digest }); return deepFreeze({ pass: true, catalog_digest: value.catalog_digest, errors: [] }); }
  catch (error) { return deepFreeze({ pass: false, catalog_digest: null, errors: [deepFreeze({ code: error.code ?? 'TRAVEL_DATA_GAP', message: error.message })] }); }
}
export function validateTravelInterruption(interruption) {
  const value = record(interruption, 'TRAVEL_INPUT_INVALID', 'Travel interruption must be an object.');
  if (value.schema_version !== 'travel-interruption.v1') fail('TRAVEL_INPUT_INVALID', 'Travel interruption has an unsupported schema version.', { schema_version: value.schema_version });
  required(value.interruption_id, 'interruption_id'); const source = record(value.causal_source, 'TRAVEL_INPUT_INVALID', 'Travel interruption requires a causal source.');
  if (!INTERRUPTION_SOURCE_TYPES.has(source.source_type)) fail('TRAVEL_INPUT_INVALID', 'Travel interruption source type is invalid.', { source_type: source.source_type });
  required(source.source_id, 'causal_source.source_id'); return deepFreeze({ ...structuredClone(value), causal_source: structuredClone(source) });
}
export function validateTravelPosition(position) {
  const value = record(position, 'TRAVEL_POSITION_INVALID', 'Travel position must be an object.');
  if (value.position_kind === 'node') { required(value.g4_id, 'g4_id'); for (const key of ['journey_id', 'journey_leg_id', 'edge_id', 'from_g4_id', 'to_g4_id', 'progress_permille', 'last_confirmed_g4_id']) if (value[key] != null) fail('TRAVEL_POSITION_INVALID', 'Node position cannot contain edge-progress fields.', { key }); }
  else if (value.position_kind === 'edge_progress') { for (const key of ['journey_id', 'journey_leg_id', 'edge_id', 'from_g4_id', 'to_g4_id', 'last_confirmed_g4_id']) required(value[key], key); if (!Number.isInteger(value.progress_permille) || value.progress_permille < 0 || value.progress_permille > 1000) fail('TRAVEL_POSITION_INVALID', 'Edge progress must be an integer between 0 and 1000.', { progress_permille: value.progress_permille }); if (value.g5_node_id != null || value.g5_anchor_id != null) fail('TRAVEL_POSITION_INVALID', 'Edge-progress position cannot contain G5 references.', {}); }
  else fail('TRAVEL_POSITION_INVALID', 'Unknown position_kind.', { position_kind: value.position_kind });
  return clone(value);
}
export function calculateNextTravelBoundary(input) {
  const value = record(input, 'TRAVEL_INPUT_INVALID', 'Travel boundary input must be an object.'); required(value.journey_id, 'journey_id'); required(value.current_leg_id, 'current_leg_id');
  if (!Array.isArray(value.candidates) || value.candidates.length === 0) fail('TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY', 'Travel advance requires at least one explicit boundary candidate.', { candidate_set: 'travel_boundaries' });
  const candidates = value.candidates.map((candidate) => { const item = record(candidate, 'TRAVEL_INPUT_INVALID', 'Travel boundary candidate must be an object.'); required(item.boundary_id, 'boundary_id'); if (!TRAVEL_BOUNDARY_TYPES.has(item.boundary_type)) fail('TRAVEL_INPUT_INVALID', 'Unknown travel boundary type.', { boundary_type: item.boundary_type }); if (!Number.isInteger(item.at_elapsed_minutes) || item.at_elapsed_minutes < 0) fail('TRAVEL_INPUT_INVALID', 'Boundary elapsed time must be a non-negative integer.', { boundary_id: item.boundary_id }); if (!Number.isInteger(item.priority) || item.priority < 0) fail('TRAVEL_INPUT_INVALID', 'Boundary priority must be a non-negative integer.', { boundary_id: item.boundary_id }); return structuredClone(item); });
  candidates.sort((left, right) => left.at_elapsed_minutes - right.at_elapsed_minutes || left.priority - right.priority || left.boundary_id.localeCompare(right.boundary_id)); return deepFreeze(candidates[0]);
}
export function validateTravelAdvanceRequest(request) {
  const value = record(request, 'TRAVEL_INPUT_INVALID', 'Travel advance request must be an object.');
  if (value.schema_version !== 'travel-advance-request.v1') fail('TRAVEL_INPUT_INVALID', 'Travel advance request has an unsupported schema version.', { schema_version: value.schema_version });
  for (const key of ['journey_id', 'journey_leg_id', 'updated_at', 'idempotency_key']) required(value[key], key);
  if (!Number.isInteger(value.expected_state_version) || value.expected_state_version < 0) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Travel advance request requires a non-negative expected state version.', { expected_state_version: value.expected_state_version });
  if (!Number.isInteger(value.progress_permille) || value.progress_permille < 0 || value.progress_permille > 1000) fail('TRAVEL_INPUT_INVALID', 'Travel advance request requires progress between 0 and 1000.', { progress_permille: value.progress_permille });
  if (!Number.isInteger(value.duration_minutes) || value.duration_minutes < 0) fail('TRAVEL_INPUT_INVALID', 'Travel advance request requires a non-negative duration.', { duration_minutes: value.duration_minutes });
  const boundary = calculateNextTravelBoundary({ journey_id: value.journey_id, current_leg_id: value.journey_leg_id, candidates: [value.boundary] });
  if (boundary.at_elapsed_minutes !== value.duration_minutes) fail('TRAVEL_INPUT_INVALID', 'Travel advance duration must end at the selected boundary.', { duration_minutes: value.duration_minutes, boundary_elapsed_minutes: boundary.at_elapsed_minutes }); return deepFreeze({ ...structuredClone(value), boundary });
}
export function assertContext(context, journey, { checkActiveJourneyConflict = false } = {}) {
  const value = record(context, 'TRAVEL_INPUT_INVALID', 'Travel context must be an object.'); if (value.state_version !== journey.state_version) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Travel state version is stale.', { expected: journey.state_version, actual: value.state_version });
  const requiredSets = record(value.required_candidate_sets, 'TRAVEL_RULE_BUNDLE_MISSING', 'Travel context must provide required candidate sets.'); for (const [name, candidates] of Object.entries(requiredSets)) if (!Array.isArray(candidates) || candidates.length === 0) fail('TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY', 'A required travel candidate set is empty.', { candidate_set: name });
  readTravelRulesBundle(value.travel_rules_bundle, journey);
  if (checkActiveJourneyConflict && Array.isArray(value.active_journeys) && value.active_journeys.some((item) => item && item.actor_id === journey.actor_id && ['active', 'interrupted', 'camped'].includes(item.status))) fail('TRAVEL_ACTIVE_JOURNEY_CONFLICT', 'Actor already has an active journey.', { actor_id: journey.actor_id });
  if (Array.isArray(value.known_edge_ids)) for (const leg of journey.legs ?? []) if (!value.known_edge_ids.includes(leg.edge_id)) fail('TRAVEL_EDGE_NOT_TRAVERSABLE', 'Journey references an unavailable canonical edge.', { edge_id: leg.edge_id });
}
export function readTravelRulesBundle(bundle, expected) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) fail('TRAVEL_RULE_BUNDLE_MISSING', 'Travel rules bundle is required.', {});
  for (const key of ['schema_version', 'world_revision_id', 'region_id', 'historical_period_id', 'source_refs', 'records', 'bindings', 'readiness_report', 'catalog_digest']) if (bundle[key] == null || (typeof bundle[key] === 'string' && !bundle[key].trim())) fail('TRAVEL_DATA_GAP', 'Travel rules bundle is incomplete.', { field: key });
  if (bundle.schema_version !== 'travel-rules.v1' || !Array.isArray(bundle.source_refs) || bundle.source_refs.length === 0 || !bundle.records || typeof bundle.records !== 'object' || !bundle.bindings || typeof bundle.bindings !== 'object' || bundle.readiness_report.pass !== true) fail('TRAVEL_DATA_GAP', 'Travel rules bundle is not ready for runtime.', {});
  const { catalog_digest, ...digestPayload } = bundle;
  if (sha256(digestPayload) !== catalog_digest || expected.travel_rules_digest != null && expected.travel_rules_digest !== catalog_digest || expected.catalog_digest != null && expected.catalog_digest !== catalog_digest) fail('TRAVEL_DATA_GAP', 'Travel rules catalog digest is not pinned to the journey.', {});
  for (const key of ['world_revision_id', 'region_id', 'historical_period_id']) if (bundle[key] !== expected[key]) fail('TRAVEL_DATA_GAP', 'Travel rules bundle scope does not match the journey.', { key, expected: expected[key], actual: bundle[key] });
  return clone(bundle);
}
