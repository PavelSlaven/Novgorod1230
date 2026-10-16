import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export async function loadPhase2JourneyLocation(partyPool, partyId, actorId) {
  const journey = await partyPool.query(
    `SELECT journey.id,journey.location_kind,journey.scene_position_id,
            journey.transit_anchor_id,journey.travel_state_id,
            journey.state_version,
            position.g6_instance_id
       FROM party_runtime.party_journey_locations journey
       LEFT JOIN party_runtime.scene_position_nodes position
         ON position.party_id=journey.party_id
        AND position.id=journey.scene_position_id
      WHERE journey.party_id=$1 AND journey.owner_kind='actor'
        AND journey.owner_id=$2`,
    [partyId, actorId]);
  return normalizeJourneyLocationRows(journey.rows);
}

export function normalizeJourneyLocation(row) {
  const locationKind = row?.location_kind
    ?? (text(row?.scene_position_id) ? 'scene' : null);
  if (row == null || typeof row !== 'object' || !text(row.id)
      || !['scene', 'transit_anchor', 'in_transit'].includes(locationKind)) {
    throw phase2IntegrityError();
  }
  const stateVersion = typeof row.state_version === 'number'
    ? row.state_version
    : typeof row.state_version === 'string'
      && /^(?:0|[1-9][0-9]*)$/u.test(row.state_version)
      ? Number(row.state_version) : null;
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 0) {
    throw phase2IntegrityError();
  }
  if (locationKind === 'scene') {
    if (!text(row.scene_position_id) || !text(row.g6_instance_id)
        || row.transit_anchor_id != null || row.travel_state_id != null) {
      throw phase2IntegrityError();
    }
    return { id: row.id, scene_position_id: row.scene_position_id,
      g6_instance_id: row.g6_instance_id, state_version: stateVersion };
  }
  if (row.scene_position_id != null || row.g6_instance_id != null) {
    throw phase2IntegrityError();
  }
  if (locationKind === 'in_transit') {
    if (row.transit_anchor_id != null || !text(row.travel_state_id)) {
      throw phase2IntegrityError();
    }
    return { id: row.id, location_kind: 'in_transit',
      scene_position_id: null, transit_anchor_id: null,
      travel_state_id: row.travel_state_id, g6_instance_id: null,
      state_version: stateVersion };
  }
  if (!text(row.transit_anchor_id) || row.travel_state_id != null) {
    throw phase2IntegrityError();
  }
  return { id: row.id, location_kind: 'transit_anchor',
    scene_position_id: null, transit_anchor_id: row.transit_anchor_id,
    travel_state_id: null, g6_instance_id: null, state_version: stateVersion };
}

export function normalizeJourneyLocationRows(rows) {
  if (!Array.isArray(rows) || rows.length > 1) throw phase2IntegrityError();
  return rows.length === 0 ? null : normalizeJourneyLocation(rows[0]);
}

export function withJourneyLocation(state, journeyLocation) {
  delete state.journey_location;
  if (journeyLocation == null) {
    delete state.position.position_id;
    delete state.position.g6_id;
    delete state.position.g6_instance_id;
    delete state.position.site_id;
    return state;
  }
  state.journey_location = journeyLocation;
  if (journeyLocation.location_kind == null
      || journeyLocation.location_kind === 'scene') {
    state.position.position_id = journeyLocation.scene_position_id;
    state.position.g6_id = journeyLocation.g6_instance_id;
  } else {
    delete state.position.position_id;
    delete state.position.g6_id;
    delete state.position.g6_instance_id;
    delete state.position.site_id;
  }
  return state;
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
