import { row } from './first-playable/plan-shared.js';

export function appendWorldRouteJourney({ writes, partyId, state, movement,
  changeSetId }) {
  const current = state.journey_location;
  const target = movement?.destination?.scene_position_id ?? null;
  if (target == null) {
    if (current != null) writes.deletes.push(row('party_journey_locations',
      current.id, { id: current.id, party_id: partyId }));
    return;
  }
  const id = current?.id ?? `journey-location:${partyId}:${state.actor_id}`;
  const record = { id, party_id: partyId, owner_kind: 'actor',
    owner_id: state.actor_id, location_kind: 'scene', scene_position_id: target,
    transit_anchor_id: null, travel_state_id: null,
    ...(current == null ? { state_version: 1 } : {}),
    updated_change_set_id: changeSetId };
  (current == null ? writes.inserts : writes.updates).push(
    row('party_journey_locations', id, record));
}
