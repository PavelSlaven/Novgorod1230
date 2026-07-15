import { deepFreeze } from '@rus/kernel';
import { fail, required, validateTravelAdvanceRequest, validateTravelPosition } from './support.js';
import { validateJourney } from './journey.js';

export function buildTravelChangeSetProposal({ before, after, idempotency_key, expected_state_version } = {}) {
  const next = validateJourney(after); required(idempotency_key, 'idempotency_key');
  if (before == null) {
    if (!Number.isInteger(expected_state_version) || expected_state_version < 0) fail('TRAVEL_STATE_VERSION_MISMATCH', 'A journey start must bind an explicit persistence state version.', { expected_state_version });
    if (next.state_version !== expected_state_version) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Journey start state version does not match persistence base state.', { expected_state_version, journey_state_version: next.state_version });
    return proposal('start', next, idempotency_key, expected_state_version);
  }
  const previous = validateJourney(before);
  if (previous.journey_id !== next.journey_id || previous.party_id !== next.party_id || previous.actor_id !== next.actor_id) fail('TRAVEL_INPUT_INVALID', 'Travel change-set must bind one existing journey.', {});
  if (previous.state_version !== next.state_version) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Domain transition must preserve its persistence base state version.', { before: previous.state_version, after: next.state_version });
  if (expected_state_version != null && expected_state_version !== previous.state_version) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Expected persistence state version is stale.', { expected: previous.state_version, actual: expected_state_version });
  return proposal('update', next, idempotency_key, previous.state_version);
}
export function buildTravelArrivalRequest({ before, after } = {}) {
  const previous = validateJourney(before); const next = validateJourney(after);
  if (previous.status !== 'active' || !previous.current_leg_id) fail('TRAVEL_INPUT_INVALID', 'Arrival request must start from an active journey leg.', {});
  const previousLeg = previous.legs.find((leg) => leg.leg_id === previous.current_leg_id); const completedLeg = next.legs.find((leg) => leg.leg_id === previous.current_leg_id);
  if (!previousLeg || !completedLeg || next.status !== 'arrived' || next.current_leg_id != null || completedLeg.status !== 'completed' || completedLeg.progress_permille !== 1000) fail('TRAVEL_INPUT_INVALID', 'Arrival request requires completion of the current final leg.', {});
  const destination = validateTravelPosition(next.actual_position);
  if (destination.position_kind !== 'node' || destination.g4_id !== previousLeg.to_g4_id || next.perceived_position.position_kind !== 'node' || next.perceived_position.g4_id !== destination.g4_id) fail('TRAVEL_POSITION_INVALID', 'Arrival request requires matching actual and perceived destination nodes.', {});
  return deepFreeze({ schema_version: 'travel-arrival-request.v1', party_id: next.party_id, actor_id: next.actor_id, journey_id: next.journey_id, from_g4_id: previousLeg.from_g4_id, to_g4_id: destination.g4_id, destination_position: destination, world_revision_id: next.world_revision_id, travel_rules_digest: next.travel_rules_digest, environment_catalog_digest: next.environment_catalog_digest, algorithm_version: next.algorithm_version, rng_version: next.rng_version });
}
export function buildTravelAdvanceResult({ before, after, request } = {}) {
  const previous = validateJourney(before); const next = validateJourney(after); const advanceRequest = validateTravelAdvanceRequest(request);
  if (advanceRequest.journey_id !== previous.journey_id || advanceRequest.journey_leg_id !== previous.current_leg_id) fail('TRAVEL_INPUT_INVALID', 'Travel advance request must bind the current journey leg.', {});
  if (advanceRequest.expected_state_version !== previous.state_version || next.state_version !== previous.state_version) fail('TRAVEL_STATE_VERSION_MISMATCH', 'Travel advance result must preserve the expected persistence version.', { expected_state_version: advanceRequest.expected_state_version, journey_state_version: previous.state_version });
  const journeyLeg = next.legs.find((leg) => leg.leg_id === advanceRequest.journey_leg_id); if (!journeyLeg) fail('TRAVEL_INPUT_INVALID', 'Travel advance result lost the requested journey leg.', { journey_leg_id: advanceRequest.journey_leg_id });
  return deepFreeze({ schema_version: 'travel-advance-result.v1', journey: next, journey_leg: journeyLeg, position_proposal: next.actual_position, clock_advance_request: deepFreeze({ schema_version: 'travel-clock-advance-request.v1', journey_id: next.journey_id, journey_leg_id: advanceRequest.journey_leg_id, duration_minutes: advanceRequest.duration_minutes, updated_at: advanceRequest.updated_at, boundary: advanceRequest.boundary }), arrival_request: next.status === 'arrived' ? buildTravelArrivalRequest({ before: previous, after: next }) : null });
}
function proposal(operation, journey, idempotencyKey, baseStateVersion) { return deepFreeze({ schema_version: 'travel-change-set.v1', operation, idempotency_key: idempotencyKey, party_id: journey.party_id, actor_id: journey.actor_id, journey_id: journey.journey_id, base_state_version: baseStateVersion, next_state_version: baseStateVersion + 1, journey, journey_leg_ids: journey.legs.map((leg) => leg.leg_id), position: journey.actual_position }); }
