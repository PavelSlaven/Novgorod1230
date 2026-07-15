import { deepFreeze, sha256 } from '@rus/kernel';

const JOURNEY_STATUSES = new Set(['planned', 'active', 'interrupted', 'camped', 'blocked', 'arrived', 'abandoned']);
const LEG_STATUSES = new Set(['pending', 'active', 'completed', 'interrupted', 'blocked', 'superseded']);
const TRAVEL_BOUNDARY_TYPES = new Set(['leg_completion', 'sunset', 'darkness', 'weather_transition', 'due_timer', 'body_threshold', 'resource_threshold', 'transport_problem', 'navigation_decision', 'significant_observation', 'causal_interruption', 'player_stop', 'arrival']);

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

export function validateTravelAdvanceRequest(request) {
  const value = record(request, 'TRAVEL_INPUT_INVALID', 'Travel advance request must be an object.');
  if (value.schema_version !== 'travel-advance-request.v1') fail('TRAVEL_INPUT_INVALID', 'Travel advance request has an unsupported schema version.', { schema_version: value.schema_version });
  for (const key of ['journey_id', 'journey_leg_id', 'updated_at', 'idempotency_key']) required(value[key], key);
  if (!Number.isInteger(value.expected_state_version) || value.expected_state_version < 0) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Travel advance request requires a non-negative expected state version.', { expected_state_version: value.expected_state_version });
  if (!Number.isInteger(value.progress_permille) || value.progress_permille < 0 || value.progress_permille > 1000) fail('TRAVEL_INPUT_INVALID', 'Travel advance request requires progress between 0 and 1000.', { progress_permille: value.progress_permille });
  if (!Number.isInteger(value.duration_minutes) || value.duration_minutes < 0) fail('TRAVEL_INPUT_INVALID', 'Travel advance request requires a non-negative duration.', { duration_minutes: value.duration_minutes });
  const boundary = calculateNextTravelBoundary({ journey_id: value.journey_id, current_leg_id: value.journey_leg_id, candidates: [value.boundary] });
  if (boundary.at_elapsed_minutes !== value.duration_minutes) fail('TRAVEL_INPUT_INVALID', 'Travel advance duration must end at the selected boundary.', { duration_minutes: value.duration_minutes, boundary_elapsed_minutes: boundary.at_elapsed_minutes });
  return deepFreeze({ ...structuredClone(value), boundary });
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
  const origin = validateTravelPosition(value.origin_position);
  if (origin.position_kind !== 'node') fail('TRAVEL_POSITION_INVALID', 'A new journey must start at a stationary node position.', {});
  record(value.target_ref, 'TRAVEL_INPUT_INVALID', 'Journey target_ref must be an object.');
  for (const key of ['movement_method', 'started_at', 'updated_at', 'world_revision_id', 'region_id', 'historical_period_id', 'travel_rules_digest', 'environment_catalog_digest', 'algorithm_version', 'rng_version', 'idempotency_key']) required(value[key], key);
  if (!Number.isInteger(value.state_version) || value.state_version < 0) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Journey plan requires a non-negative persistence state version.', { state_version: value.state_version });
  if (!Array.isArray(value.legs) || value.legs.length === 0) fail('TRAVEL_ROUTE_NOT_FOUND', 'Journey plan requires at least one canonical edge.', {});
  const legs = value.legs.map((leg, index) => normalizePlanLeg(leg, index));
  return deepFreeze({ ...structuredClone(value), legs });
}

export function createJourney(plan, context) {
  const normalizedPlan = buildJourneyPlan(plan);
  assertContext(context, normalizedPlan, { checkActiveJourneyConflict: true });
  const legs = normalizedPlan.legs.map((leg, index) => deepFreeze({ ...leg, status: index === 0 ? 'active' : 'pending', progress_permille: 0, elapsed_minutes: 0, started_at: index === 0 ? normalizedPlan.started_at : null, completed_at: null, interruption_id: null }));
  const first = legs[0];
  const actualPosition = edgePosition(normalizedPlan, first, 0);
  const perceivedPosition = edgePosition(normalizedPlan, first, 0);
  return deepFreeze({
    journey_id: normalizedPlan.journey_id,
    party_id: normalizedPlan.party_id,
    actor_id: normalizedPlan.actor_id,
    status: 'active',
    mode: normalizedPlan.mode,
    origin_g4_id: normalizedPlan.origin_position.g4_id,
    target_ref: clone(normalizedPlan.target_ref),
    intended_direction: normalizedPlan.intended_direction ?? null,
    pace_profile_id: normalizedPlan.pace_profile_id,
    movement_method: normalizedPlan.movement_method,
    current_leg_id: first.leg_id,
    elapsed_minutes: 0,
    legs,
    actual_position: actualPosition,
    perceived_position: perceivedPosition,
    orientation_confidence: normalizedPlan.orientation_confidence ?? 'unknown',
    deviation_level: normalizedPlan.deviation_level ?? 'none',
    started_at: normalizedPlan.started_at,
    updated_at: normalizedPlan.updated_at,
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
  for (const key of ['origin_g4_id', 'pace_profile_id', 'movement_method', 'started_at', 'updated_at', 'world_revision_id', 'region_id', 'historical_period_id', 'travel_rules_digest', 'environment_catalog_digest', 'algorithm_version', 'rng_version', 'idempotency_key']) required(value[key], key);
  record(value.target_ref, 'TRAVEL_INPUT_INVALID', 'Journey target_ref must be an object.');
  if (value.mode === 'course' && !value.intended_direction) fail('TRAVEL_INPUT_INVALID', 'Course journey requires intended_direction.', {});
  if (value.mode === 'route' && value.intended_direction != null) fail('TRAVEL_INPUT_INVALID', 'Route journey cannot contain intended_direction.', {});
  if (!Number.isInteger(value.elapsed_minutes) || value.elapsed_minutes < 0) fail('TRAVEL_INPUT_INVALID', 'Journey elapsed_minutes must be a non-negative integer.', {});
  if (!Number.isInteger(value.state_version) || value.state_version < 0) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Journey requires a non-negative persistence state version.', { state_version: value.state_version });
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

export function rerouteJourney({ journey, plan, context }) {
  const current = validateJourney(journey);
  if (current.status !== 'active' || current.actual_position.position_kind !== 'edge_progress' || current.actual_position.progress_permille !== 0) {
    fail('TRAVEL_INPUT_INVALID', 'Reroute is allowed only at the explicit start boundary of an active leg.', {});
  }
  const replacement = buildJourneyPlan(plan);
  assertContext(context, replacement);
  if (replacement.journey_id !== current.journey_id || replacement.party_id !== current.party_id || replacement.actor_id !== current.actor_id || replacement.state_version !== current.state_version) {
    fail('TRAVEL_STATE_VERSION_MISMATCH', 'Replacement plan must bind the current journey identity and state version.', {});
  }
  for (const key of ['world_revision_id', 'region_id', 'historical_period_id', 'travel_rules_digest', 'environment_catalog_digest', 'algorithm_version', 'rng_version']) {
    if (replacement[key] !== current[key]) fail('TRAVEL_DATA_GAP', 'Replacement plan must preserve the journey version pins.', { key });
  }
  const currentLeg = current.legs.find((leg) => leg.leg_id === current.current_leg_id);
  if (replacement.origin_position.g4_id !== currentLeg.from_g4_id || replacement.legs[0].from_g4_id !== currentLeg.from_g4_id) {
    fail('TRAVEL_POSITION_INVALID', 'Replacement plan must start at the current confirmed node.', {});
  }
  const existingIds = new Set(current.legs.map((leg) => leg.leg_id));
  if (replacement.legs.some((leg) => existingIds.has(leg.leg_id))) fail('TRAVEL_INPUT_INVALID', 'Replacement leg IDs must not overwrite journey history.', {});
  const maxSequence = Math.max(...current.legs.map((leg) => leg.sequence));
  const superseded = current.legs.map((leg) => ['active', 'pending', 'interrupted', 'blocked'].includes(leg.status) ? deepFreeze({ ...leg, status: 'superseded', interruption_id: null }) : leg);
  const legs = replacement.legs.map((leg, index) => deepFreeze({
    ...leg,
    sequence: maxSequence + index + 1,
    status: index === 0 ? 'active' : 'pending',
    progress_permille: 0,
    elapsed_minutes: 0,
    started_at: index === 0 ? replacement.updated_at : null,
    completed_at: null,
    interruption_id: null
  }));
  const first = legs[0];
  return validateJourney({
    ...current,
    mode: replacement.mode,
    target_ref: clone(replacement.target_ref),
    intended_direction: replacement.intended_direction ?? null,
    pace_profile_id: replacement.pace_profile_id,
    movement_method: replacement.movement_method,
    current_leg_id: first.leg_id,
    legs: [...superseded, ...legs],
    actual_position: edgePosition(current, first, 0),
    perceived_position: edgePosition(current, first, 0),
    orientation_confidence: replacement.orientation_confidence ?? current.orientation_confidence,
    deviation_level: replacement.deviation_level ?? current.deviation_level,
    updated_at: replacement.updated_at
  });
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

export function applyTravelLifecycleMetadata({ before, after, elapsed_minutes, updated_at } = {}) {
  const previous = validateJourney(before);
  const next = validateJourney(after);
  required(updated_at, 'updated_at');
  if (!Number.isInteger(elapsed_minutes) || elapsed_minutes < 0) fail('TRAVEL_INPUT_INVALID', 'Travel lifecycle elapsed_minutes must be a non-negative integer.', { elapsed_minutes });
  if (previous.journey_id !== next.journey_id || previous.party_id !== next.party_id || previous.actor_id !== next.actor_id || previous.current_leg_id == null) {
    fail('TRAVEL_INPUT_INVALID', 'Travel lifecycle metadata must bind the same active journey and leg.', {});
  }
  const legs = next.legs.map((leg) => {
    if (leg.leg_id === previous.current_leg_id) {
      return deepFreeze({ ...leg, elapsed_minutes: leg.elapsed_minutes + elapsed_minutes, completed_at: leg.status === 'completed' ? updated_at : leg.completed_at });
    }
    if (leg.leg_id === next.current_leg_id && leg.status === 'active' && leg.started_at == null) return deepFreeze({ ...leg, started_at: updated_at });
    return leg;
  });
  return validateJourney({ ...next, elapsed_minutes: previous.elapsed_minutes + elapsed_minutes, updated_at, legs });
}

export function buildTravelChangeSetProposal({ before, after, idempotency_key, expected_state_version } = {}) {
  const next = validateJourney(after);
  required(idempotency_key, 'idempotency_key');
  if (before == null) {
    if (!Number.isInteger(expected_state_version) || expected_state_version < 0) {
      fail('TRAVEL_STATE_VERSION_MISMATCH', 'A journey start must bind an explicit persistence state version.', { expected_state_version });
    }
    if (next.state_version !== expected_state_version) {
      fail('TRAVEL_STATE_VERSION_MISMATCH', 'Journey start state version does not match persistence base state.', { expected_state_version, journey_state_version: next.state_version });
    }
    return deepFreeze({
      schema_version: 'travel-change-set.v1',
      operation: 'start',
      idempotency_key,
      party_id: next.party_id,
      actor_id: next.actor_id,
      journey_id: next.journey_id,
      base_state_version: expected_state_version,
      next_state_version: expected_state_version + 1,
      journey: next,
      journey_leg_ids: next.legs.map((leg) => leg.leg_id),
      position: next.actual_position
    });
  }
  const previous = validateJourney(before);
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
    operation: 'update',
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

export function buildTravelArrivalRequest({ before, after } = {}) {
  const previous = validateJourney(before);
  const next = validateJourney(after);
  if (previous.status !== 'active' || !previous.current_leg_id) {
    fail('TRAVEL_INPUT_INVALID', 'Arrival request must start from an active journey leg.', {});
  }
  const previousLeg = previous.legs.find((leg) => leg.leg_id === previous.current_leg_id);
  const completedLeg = next.legs.find((leg) => leg.leg_id === previous.current_leg_id);
  if (!previousLeg || !completedLeg || next.status !== 'arrived' || next.current_leg_id != null || completedLeg.status !== 'completed' || completedLeg.progress_permille !== 1000) {
    fail('TRAVEL_INPUT_INVALID', 'Arrival request requires completion of the current final leg.', {});
  }
  const destination = validateTravelPosition(next.actual_position);
  if (destination.position_kind !== 'node' || destination.g4_id !== previousLeg.to_g4_id || next.perceived_position.position_kind !== 'node' || next.perceived_position.g4_id !== destination.g4_id) {
    fail('TRAVEL_POSITION_INVALID', 'Arrival request requires matching actual and perceived destination nodes.', {});
  }
  return deepFreeze({
    schema_version: 'travel-arrival-request.v1',
    party_id: next.party_id,
    actor_id: next.actor_id,
    journey_id: next.journey_id,
    from_g4_id: previousLeg.from_g4_id,
    to_g4_id: destination.g4_id,
    destination_position: destination,
    world_revision_id: next.world_revision_id,
    travel_rules_digest: next.travel_rules_digest,
    environment_catalog_digest: next.environment_catalog_digest,
    algorithm_version: next.algorithm_version,
    rng_version: next.rng_version
  });
}

export function buildTravelAdvanceResult({ before, after, request } = {}) {
  const previous = validateJourney(before);
  const next = validateJourney(after);
  const advanceRequest = validateTravelAdvanceRequest(request);
  if (advanceRequest.journey_id !== previous.journey_id || advanceRequest.journey_leg_id !== previous.current_leg_id) {
    fail('TRAVEL_INPUT_INVALID', 'Travel advance request must bind the current journey leg.', {});
  }
  if (advanceRequest.expected_state_version !== previous.state_version || next.state_version !== previous.state_version) {
    fail('TRAVEL_STATE_VERSION_MISMATCH', 'Travel advance result must preserve the expected persistence version.', { expected_state_version: advanceRequest.expected_state_version, journey_state_version: previous.state_version });
  }
  const journeyLeg = next.legs.find((leg) => leg.leg_id === advanceRequest.journey_leg_id);
  if (!journeyLeg) fail('TRAVEL_INPUT_INVALID', 'Travel advance result lost the requested journey leg.', { journey_leg_id: advanceRequest.journey_leg_id });
  return deepFreeze({
    schema_version: 'travel-advance-result.v1',
    journey: next,
    journey_leg: journeyLeg,
    position_proposal: next.actual_position,
    clock_advance_request: deepFreeze({
      schema_version: 'travel-clock-advance-request.v1',
      journey_id: next.journey_id,
      journey_leg_id: advanceRequest.journey_leg_id,
      duration_minutes: advanceRequest.duration_minutes,
      updated_at: advanceRequest.updated_at,
      boundary: advanceRequest.boundary
    }),
    arrival_request: next.status === 'arrived' ? buildTravelArrivalRequest({ before: previous, after: next }) : null
  });
}

export function calculateNextTravelBoundary(input) {
  const value = record(input, 'TRAVEL_INPUT_INVALID', 'Travel boundary input must be an object.');
  required(value.journey_id, 'journey_id');
  required(value.current_leg_id, 'current_leg_id');
  if (!Array.isArray(value.candidates) || value.candidates.length === 0) {
    fail('TRAVEL_REQUIRED_CANDIDATE_SET_EMPTY', 'Travel advance requires at least one explicit boundary candidate.', { candidate_set: 'travel_boundaries' });
  }
  const candidates = value.candidates.map((candidate) => {
    const item = record(candidate, 'TRAVEL_INPUT_INVALID', 'Travel boundary candidate must be an object.');
    required(item.boundary_id, 'boundary_id');
    if (!TRAVEL_BOUNDARY_TYPES.has(item.boundary_type)) fail('TRAVEL_INPUT_INVALID', 'Unknown travel boundary type.', { boundary_type: item.boundary_type });
    if (!Number.isInteger(item.at_elapsed_minutes) || item.at_elapsed_minutes < 0) fail('TRAVEL_INPUT_INVALID', 'Boundary elapsed time must be a non-negative integer.', { boundary_id: item.boundary_id });
    if (!Number.isInteger(item.priority) || item.priority < 0) fail('TRAVEL_INPUT_INVALID', 'Boundary priority must be a non-negative integer.', { boundary_id: item.boundary_id });
    return structuredClone(item);
  });
  candidates.sort((left, right) => left.at_elapsed_minutes - right.at_elapsed_minutes || left.priority - right.priority || left.boundary_id.localeCompare(right.boundary_id));
  return deepFreeze(candidates[0]);
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
  if (!Number.isInteger(value.base_time_minutes) || value.base_time_minutes <= 0) fail('TRAVEL_INPUT_INVALID', 'Journey leg requires a positive explicit base_time_minutes.', { leg_id: value.leg_id, base_time_minutes: value.base_time_minutes });
  return deepFreeze(structuredClone(value));
}

function validateLeg(leg) {
  const value = record(leg, 'TRAVEL_INPUT_INVALID', 'Journey leg must be an object.');
  for (const key of ['leg_id', 'edge_id', 'from_g4_id', 'to_g4_id', 'route_profile_id']) required(value[key], key);
  if (!Number.isInteger(value.sequence) || value.sequence <= 0) fail('TRAVEL_INPUT_INVALID', 'Journey leg sequence must be a positive integer.', {});
  if (!Number.isInteger(value.base_time_minutes) || value.base_time_minutes <= 0) fail('TRAVEL_INPUT_INVALID', 'Journey leg requires a positive explicit base_time_minutes.', {});
  if (!Number.isInteger(value.elapsed_minutes) || value.elapsed_minutes < 0) fail('TRAVEL_INPUT_INVALID', 'Journey leg elapsed_minutes must be a non-negative integer.', {});
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
