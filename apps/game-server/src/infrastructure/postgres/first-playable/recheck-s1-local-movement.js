export async function recheckS1LocalMovement({ transaction, partyId, check }) {
  if (!text(check.actor_id) || !text(check.journey_location_id)
      || !integer(check.expected_journey_state_version)
      || ![check.from_position_ref, check.to_position_ref,
        check.movement_edge_ref].every(text)) return resultOf(false);
  const result = await transaction.query(
    `SELECT l.state_version AS journey_state_version,
            l.scene_position_id AS journey_position_id,
            e.from_position_id,e.to_position_id,e.status AS edge_status,
            source.status AS source_status,destination.status AS destination_status
       FROM party_runtime.party_journey_locations l
       JOIN party_runtime.scene_movement_edges e
         ON e.party_id=l.party_id AND e.id=$4
       JOIN party_runtime.scene_position_nodes source
         ON source.party_id=l.party_id AND source.id=e.from_position_id
       JOIN party_runtime.scene_position_nodes destination
         ON destination.party_id=l.party_id AND destination.id=e.to_position_id
      WHERE l.party_id=$1 AND l.id=$2 AND l.owner_kind='actor' AND l.owner_id=$3
      FOR UPDATE OF l,e,source,destination`,
    [partyId, check.journey_location_id, check.actor_id,
      check.movement_edge_ref]
  );
  const actual = result.rows[0];
  return resultOf(result.rowCount === 1
    && Number(actual?.journey_state_version) === check.expected_journey_state_version
    && actual?.journey_position_id === check.from_position_ref
    && actual?.from_position_id === check.from_position_ref
    && actual?.to_position_id === check.to_position_ref
    && actual?.edge_status === 'active'
    && actual?.source_status === 'active'
    && actual?.destination_status === 'active');
}

const text = (value) => typeof value === 'string' && value.length > 0;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const resultOf = (ok, code = 'state_version_conflict') => Object.freeze({ ok, code });
