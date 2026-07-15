import { deepFreeze, sha256 } from '@rus/kernel';

const JOURNEY_STATUSES = new Set(['planned', 'active', 'interrupted', 'camped', 'blocked', 'arrived', 'abandoned']);
const LEG_STATUSES = new Set(['pending', 'active', 'completed', 'interrupted', 'blocked', 'superseded']);

export class TravelError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TravelError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function validateTravelIntent(intent) {
  const value = record(intent, 'TRAVEL_INPUT_INVALID', 'Travel intent must be an object.');
  required(value.party_id, 'party_id');
  required(value.actor_id, 'actor_id');
  if (!['route', 'course'].includes(value.mode)) fail('TRAVEL_INPUT_INVALID', 'Travel intent mode must be route or course.', { mode: value.mode });
  if (value.mode === 'route' && !value.route_id && !Array.isArray(value.route_chain)) fail('TRAVEL_ROUTE_SELECTION_REQUIRED', 'Route travel requires a selected route.', {});
  if (value.mode === 'course' && !value.intended_direction) fail('TRAVEL_INPUT_INVALID', 'Course travel requires intended_direction.', {});
  return deepFreeze(structuredClone(value));
}

export function validateTravelRulesBundle({ bundle, world_revision_id, region_id, historical_period_id, catalog_digest } = {}) {
  try {
    const value = readTravelRulesBundle(bundle, { world_revision_id, region_id, historical_period_id, catalog_digest });
    return deepFreeze({ pass: true, catalog_digest: value.catalog_digest, errors: [] });
  } catch (error) {
    return deepFreeze({ pass: false, catalog_digest: null, errors: [deepFreeze({ code: error.code ?? 'TRAVEL_DATA_GAP', message: error.message })] });
  }
}

export function validateTravelPosition(position) {
  const value = record(position, 'TRAVEL_POSITION_INVALID', 'Travel position must be an object.');
  if (value.position_kind === 'node') {
    required(value.g4_id, 'g4_id');
    for (const key of ['journey_id', 'journey_leg_id', 'edge_id', 'from_g4_id', 'to_g4_id', 'progress_permille', 'last_confirmed_g4_id']) {
      if (value[key] != null) fail('TRAVEL_POSITION_INVALID', 'Node position cannot contain edge-progress fields.', { key });
    }
  } else if (value.position_kind === 'edge_progress') {
    for (const key of ['journey_id', 'journey_leg_id', 'edge_id', 'from_g4_id', 'to_g4_id', 'last_confirmed_g4_id']) required(value[key], key);
    if (!Number.isInteger(value.progress_permille) || value.progress_permille < 0 || value.progress_permille > 1000) fail('TRAVEL_POSITION_INVALID', 'Edge progress must be an integer between 0 and 1000.', { progress_permille: value.progress_permille });
    if (value.g5_node_id != null || value.g5_anchor_id != null) fail('TRAVEL_POSITION_INVALID', 'Edge-progress position cannot contain G5 references.', {});
  } else {
    fail('TRAVEL_POSITION_INVALID', 'Unknown position_kind.', { position_kind: value.position_kind });
  }
  return deepFreeze(structuredClone(value));
}

export function buildJourneyPlan(input) {
  const value = record(input, 'TRAVEL_INPUT_INVALID', 'Journey plan must be an object.');
  validateTravelIntent({ party_id: value.party_id, actor_id: value.actor_id, mode: value.mode, route_id: value.route_id, route_chain: value.route_chain, intended_direction: value.intended_direction });
  validateTravelPosition(value.origin_position);
  for (const key of ['world_revision_id', 'region_id', 'historical_period_id', 'travel_rules_digest', 'environment_catalog_digest', 'algorithm_version', 'rng_version', 'idempotency_key']) required(value[key], key);
  if (!Array.isArray(value.legs) || value.legs.length === 0) fail('TRAVEL_ROUTE_NOT_FOUND', 'Journey plan requires at least one canonical edge.', {});
  const legs = value.legs.map((leg, index) => normalizePlanLeg(leg, index));
  return deepFreeze({ ...structuredClone(value), legs });
}

export function createJourney(plan, context) {
  const normalizedPlan = buildJourneyPlan(plan);
  assertContext(context, normalizedPlan, { checkActiveJourneyConflict: true });
  const legs = normalizedPlan.legs.map((leg, index) => deepFreeze({ ...leg, status: index === 0 ? 'active' : 'pending', progress_permille: 0, elapsed_minutes: 0, interruption_id: null }));
  const first = legs[0];
  const actualPosition = edgePosition(normalizedPlan, first, 0);
  const perceivedPosition = edgePosition(normalizedPlan, first, 0);
  return deepFreeze({
    journey_id: normalizedPlan.journey_id,
    party_id: normalizedPlan.party_id,
    actor_id: normalizedPlan.actor_id,
    status: 'active',
    mode: normalizedPlan.mode,
    target_ref: clone(normalizedPlan.target_ref),
    pace_profile_id: normalizedPlan.pace_profile_id,
    current_leg_id: first.leg_id,
    legs,
    actual_position: actualPosition,
    perceived_position: perceivedPosition,
    orientation_confidence: normalizedPlan.orientation_confidence ?? 'unknown',
    deviation_level: normalizedPlan.deviation_level ?? 'none',
    world_revision_id: normalizedPlan.world_revision_id,
    region_id: normalizedPlan.region_id,
    historical_period_id: normalizedPlan.historical_period_id,
    travel_rules_digest: normalizedPlan.travel_rules_digest,
    environment_catalog_digest: normalizedPlan.environment_catalog_digest,
    algorithm_version: normalizedPlan.algorithm_version,
    rng_version: normalizedPlan.rng_version,
    state_version: normalizedPlan.state_version,
    idempotency_key: normalizedPlan.idempotency_key
  });
}

export function validateJourney(journey) {
  const value = record(journey, 'TRAVEL_INPUT_INVALID', 'Journey must be an object.');
  if (!JOURNEY_STATUSES.has(value.status)) fail('TRAVEL_INPUT_INVALID', 'Unknown journey status.', { status: value.status });
  required(value.journey_id, 'journey_id');
  required(value.party_id, 'party_id');
  required(value.actor_id, 'actor_id');
  if (!Array.isArray(value.legs) || value.legs.length === 0) fail('TRAVEL_INPUT_INVALID', 'Journey must contain legs.', {});
  const legs = value.legs.map((leg) => validateLeg(leg));
  const activeLegs = legs.filter((leg) => leg.status === 'active');
  if (['active', 'interrupted', 'camped', 'blocked'].includes(value.status)) {
    required(value.current_leg_id, 'current_leg_id');
    const current = legs.find((leg) => leg.leg_id === value.current_leg_id);
    if (!current) fail('TRAVEL_INPUT_INVALID', 'current_leg_id must belong to journey.', { current_leg_id: value.current_leg_id });
    if (value.status === 'active' && (activeLegs.length !== 1 || current.status !== 'active')) fail('TRAVEL_INPUT_INVALID', 'Active journey must have exactly one active current leg.', {});
  }
  if (value.status === 'arrived' && value.current_leg_id != null) fail('TRAVEL_INPUT_INVALID', 'Arrived journey cannot have current_leg_id.', {});
  validateTravelPosition(value.actual_position);
  validateTravelPosition(value.perceived_position);
  return deepFreeze({ ...structuredClone(value), legs });
}

export function advanceJourney({ journey, context, progress_permille, perceived_position = null }) {
  const current = validateJourney(journey);
  assertContext(context, current);
  if (current.status === 'arrived' || current.status === 'abandoned') fail('TRAVEL_NO_ACTIVE_JOURNEY', 'Completed journey cannot advance.', { status: current.status });
  if (current.status !== 'active') fail('TRAVEL_NO_ACTIVE_JOURNEY', 'Only active journey can advance.', { status: current.status });
  if (!Number.isInteger(progress_permille) || progress_permille < 0 || progress_permille > 1000) fail('TRAVEL_INPUT_INVALID', 'Progress must be an integer between 0 and 1000.', { progress_permille });
  const legs = current.legs.map((leg) => leg.leg_id !== current.current_leg_id ? leg : deepFreeze({ ...leg, progress_permille, status: progress_permille === 1000 ? 'completed' : 'active' }));
  const changed = legs.find((leg) => leg.leg_id === current.current_leg_id);
  const next = legs.find((leg) => leg.sequence === changed.sequence + 1);
  if (progress_permille < 1000) {
    const actualPosition = edgePosition(current, changed, progress_permille);
    return deepFreeze({ ...current, legs, actual_position: actualPosition, perceived_position: resolvePerceivedPosition(perceived_position, actualPosition) });
  }
  if (next) {
    const nextLeg = deepFreeze({ ...next, status: 'active', progress_permille: 0 });
    const updatedLegs = legs.map((leg) => leg.leg_id === nextLeg.leg_id ? nextLeg : leg);
    return deepFreeze({ ...current, legs: updatedLegs, current_leg_id: nextLeg.leg_id, actual_position: edgePosition(current, nextLeg, 0), perceived_position: edgePosition(current, nextLeg, 0) });
  }
  const destination = changed.to_g4_id;
  const arrivedPosition = deepFreeze({ position_kind: 'node', g4_id: destination, g5_node_id: null, g5_anchor_id: null, last_route_id: changed.route_profile_id ?? null });
  return deepFreeze({ ...current, status: 'arrived', current_leg_id: null, legs, actual_position: arrivedPosition, perceived_position: clone(arrivedPosition) });
}

export function interruptJourney({ journey, interruption, context }) {
  const current = validateJourney(journey);
  assertContext(context, current);
  if (current.status !== 'active') fail('TRAVEL_NO_ACTIVE_JOURNEY', 'Only active journey can be interrupted.', { status: current.status });
  const item = record(interruption, 'TRAVEL_INPUT_INVALID', 'Interruption must be an object.');
  required(item.interruption_id, 'interruption_id');
  return deepFreeze({ ...current, status: 'interrupted', legs: current.legs.map((leg) => leg.leg_id === current.current_leg_id ? deepFreeze({ ...leg, status: 'interrupted', interruption_id: item.interruption_id }) : leg) });
}

export function campJourney({ journey, camp, context }) {
  const current = validateJourney(journey);
  assertContext(context, current);
  if (current.status !== 'active') fail('TRAVEL_NO_ACTIVE_JOURNEY', 'Only an active journey can establish a camp.', { status: current.status });
  const request = record(camp, 'TRAVEL_INPUT_INVALID', 'Camp request must be an object.');
  required(request.camp_id, 'camp_id');
  required(request.reason, 'reason');
  return deepFreeze({
    ...current,
    status: 'camped',
    legs: current.legs.map((leg) => leg.leg_id === current.current_leg_id
      ? deepFreeze({ ...leg, status: 'interrupted', interruption_id: request.camp_id })
      : leg)
  });
}

export function resumeJourney({ journey, context }) {
  const current = validateJourney(journey);
  assertContext(context, current);
  if (!['interrupted', 'camped', 'blocked'].includes(current.status)) fail('TRAVEL_NO_ACTIVE_JOURNEY', 'Only paused journey can resume.', { status: current.status });
  return deepFreeze({ ...current, status: 'active', legs: current.legs.map((leg) => leg.leg_id === current.current_leg_id ? deepFreeze({ ...leg, status: 'active', interruption_id: null }) : leg) });
}

export function changeJourneyPace({ journey, pace_profile_id, context }) {
  const current = validateJourney(journey);
  assertContext(context, current);
  required(pace_profile_id, 'pace_profile_id');
  return deepFreeze({ ...current, pace_profile_id });
}

export function abandonJourney({ journey, context }) {
  const current = validateJourney(journey);
  assertContext(context, current);
  if (current.status === 'arrived') fail('TRAVEL_NO_ACTIVE_JOURNEY', 'Arrived journey cannot be abandoned.', {});
  return deepFreeze({ ...current, status: 'abandoned', current_leg_id: null });
}

export function completeJourney({ journey, context }) {
  return advanceJourney({ journey, context, progress_permille: 1000 });
}

export function buildTravelChangeSetProposal({ before, after, idempotency_key, expected_state_version } = {}) {
  const previous = validateJourney(before);
  const next = validateJourney(after);
  required(idempotency_key, 'idempotency_key');
  if (previous.journey_id !== next.journey_id || previous.party_id !== next.party_id || previous.actor_id !== next.actor_id) {
    fail('TRAVEL_INPUT_INVALID', 'Travel change-set must bind one existing journey.', {});
  }
  if (previous.state_version !== next.state_version) {
    fail('TRAVEL_STATE_VERSION_MISMATCH', 'Domain transition must preserve its persistence base state version.', { before: previous.state_version, after: next.state_version });
  }
  if (expected_state_version != null && expected_state_version !== previous.state_version) {
    fail('TRAVEL_STATE_VERSION_MISMATCH', 'Expected persistence state version is stale.', { expected: previous.state_version, actual: expected_state_version });
  }
  return deepFreeze({
    schema_version: 'travel-change-set.v1',
    idempotency_key,
    party_id: next.party_id,
    actor_id: next.actor_id,
    journey_id: next.journey_id,
    base_state_version: previous.state_version,
    next_state_version: previous.state_version + 1,
    journey: next,
    journey_leg_ids: next.legs.map((leg) => leg.leg_id),
    position: next.actual_position
  });
}

function assertContext(context, journey, { checkActiveJourneyConflict = false } = {}) {
  const value = record(context, 'TRAVEL_INPUT_INVALID', 'Travel context must be an object.');
  if (value.state_version !== journey.state_version) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Travel state version is stale.', { expected: journey.state_version, actual: value.state_version });
  const requiredSets = record(value.required_candidate_sets, 'TRAVEL_RULE_BUNDLE_MISSING', 'Travel context must provide required candidate sets.');
  for (const [name, candidates] of Object.entries(requiredSets)) {
    if (!Array.isArray(candidates) || candidates.length === 0) fail('TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY', 'A required travel candidate set is empty.', { candidate_set: name });
  }
  readTravelRulesBundle(value.travel_rules_bundle, journey);
  if (checkActiveJourneyConflict && Array.isArray(value.active_journeys) && value.active_journeys.some((item) => item && item.actor_id === journey.actor_id && ['active', 'interrupted', 'camped'].includes(item.status))) {
    fail('TRAVEL_ACTIVE_JOURNEY_CONFLICT', 'Actor already has an active journey.', { actor_id: journey.actor_id });
  }
  if (Array.isArray(value.known_edge_ids)) {
    for (const leg of journey.legs ?? []) if (!value.known_edge_ids.includes(leg.edge_id)) fail('TRAVEL_EDGE_NOT_TRAVERSABLE', 'Journey references an unavailable canonical edge.', { edge_id: leg.edge_id });
  }
}

function readTravelRulesBundle(bundle, expected) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) fail('TRAVEL_RULE_BUNDLE_MISSING', 'Travel rules bundle is required.', {});
  for (const key of ['schema_version', 'world_revision_id', 'region_id', 'historical_period_id', 'source_refs', 'records', 'bindings', 'readiness_report', 'catalog_digest']) {
    if (bundle[key] == null || (typeof bundle[key] === 'string' && !bundle[key].trim())) fail('TRAVEL_DATA_GAP', 'Travel rules bundle is incomplete.', { field: key });
  }
  if (bundle.schema_version !== 'travel-rules.v1' || !Array.isArray(bundle.source_refs) || bundle.source_refs.length === 0 || !bundle.records || typeof bundle.records !== 'object' || !bundle.bindings || typeof bundle.bindings !== 'object' || bundle.readiness_report.pass !== true) {
    fail('TRAVEL_DATA_GAP', 'Travel rules bundle is not ready for runtime.', {});
  }
  const { catalog_digest, ...digestPayload } = bundle;
  if (sha256(digestPayload) !== catalog_digest || expected.travel_rules_digest != null && expected.travel_rules_digest !== catalog_digest || expected.catalog_digest != null && expected.catalog_digest !== catalog_digest) fail('TRAVEL_DATA_GAP', 'Travel rules catalog digest is not pinned to the journey.', {});
  for (const key of ['world_revision_id', 'region_id', 'historical_period_id']) if (bundle[key] !== expected[key]) fail('TRAVEL_DATA_GAP', 'Travel rules bundle scope does not match the journey.', { key, expected: expected[key], actual: bundle[key] });
  return deepFreeze(structuredClone(bundle));
}

function normalizePlanLeg(leg, index) {
  const value = record(leg, 'TRAVEL_INPUT_INVALID', 'Journey leg must be an object.');
  for (const key of ['leg_id', 'edge_id', 'from_g4_id', 'to_g4_id', 'route_profile_id']) required(value[key], key);
  if (!Number.isInteger(value.sequence) || value.sequence !== index + 1) fail('TRAVEL_INPUT_INVALID', 'Journey legs must have contiguous sequences.', { sequence: value.sequence, index });
  return deepFreeze(structuredClone(value));
}

function validateLeg(leg) {
  const value = record(leg, 'TRAVEL_INPUT_INVALID', 'Journey leg must be an object.');
  if (!LEG_STATUSES.has(value.status)) fail('TRAVEL_INPUT_INVALID', 'Unknown journey leg status.', { status: value.status });
  if (!Number.isInteger(value.progress_permille) || value.progress_permille < 0 || value.progress_permille > 1000) fail('TRAVEL_INPUT_INVALID', 'Leg progress must be an integer between 0 and 1000.', {});
  if (value.status === 'completed' && value.progress_permille !== 1000) fail('TRAVEL_INPUT_INVALID', 'Completed journey leg must have 1000 progress.', {});
  return deepFreeze(structuredClone(value));
}

function edgePosition(journey, leg, progress_permille) {
  return deepFreeze({ position_kind: 'edge_progress', journey_id: journey.journey_id, journey_leg_id: leg.leg_id, edge_id: leg.edge_id, from_g4_id: leg.from_g4_id, to_g4_id: leg.to_g4_id, progress_permille, last_confirmed_g4_id: leg.from_g4_id, g5_node_id: null, g5_anchor_id: null });
}

function resolvePerceivedPosition(value, actualPosition) {
  if (value == null) return clone(actualPosition);
  const perceived = validateTravelPosition(value);
  if (perceived.position_kind !== 'edge_progress' || ['journey_id', 'journey_leg_id', 'edge_id', 'from_g4_id', 'to_g4_id'].some((key) => perceived[key] !== actualPosition[key])) {
    fail('TRAVEL_POSITION_INVALID', 'Perceived edge position must reference the current canonical leg.', { actual_edge_id: actualPosition.edge_id });
  }
  return perceived;
}

function record(value, code, message) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, {}); return value; }
function required(value, field) { if (typeof value !== 'string' || !value.trim()) fail('TRAVEL_INPUT_INVALID', `Missing required ${field}.`, { field }); return value; }
function fail(code, message, details) { throw new TravelError(code, message, details); }
function clone(value) { return deepFreeze(structuredClone(value)); }
