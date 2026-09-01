export async function recheckWorldRouteArrival({ transaction, partyId, check }) {
  if (!text(check.actor_id) || !text(check.destination_position_id)
      || !integer(check.destination_capacity)
      || !text(check.destination_access_class)
      || check.destination_capacity < 1
      || !nullableVersion(check.expected_journey_state_version)) return result(false);
  const target = await transaction.query(
    `SELECT p.id,p.capacity,p.access_class_id,p.status
       FROM party_runtime.scene_position_nodes p
       JOIN party_runtime.party_g6_instances g ON g.party_id=p.party_id AND g.id=p.g6_instance_id
       JOIN party_runtime.party_scene_baselines b ON b.party_id=g.party_id AND b.id=g.scene_baseline_id
      WHERE p.party_id=$1 AND p.id=$2 AND p.status='active'
        AND g.status='active' AND b.status='active'
      FOR UPDATE OF p,g,b`, [partyId, check.destination_position_id]);
  const row = target.rows[0];
  if (target.rowCount !== 1 || Number(row.capacity) !== check.destination_capacity
      || row.access_class_id !== check.destination_access_class) {
    return result(false);
  }
  const journey = await transaction.query(
    `SELECT id,state_version FROM party_runtime.party_journey_locations
      WHERE party_id=$1 AND owner_kind='actor' AND owner_id=$2 FOR UPDATE`,
    [partyId, check.actor_id]);
  const current = journey.rows[0];
  if (journey.rowCount > 1 || (check.expected_journey_state_version == null
    ? current != null : Number(current?.state_version)
      !== check.expected_journey_state_version)) return result(false);
  const occupancy = await transaction.query(
    `SELECT (SELECT COUNT(*)::int FROM party_runtime.party_journey_locations
               WHERE party_id=$1 AND location_kind='scene' AND scene_position_id=$2
                 AND NOT (owner_kind='actor' AND owner_id=$3))
            + COALESCE((SELECT SUM(occupies_capacity_units) FROM party_runtime.entity_placements
               WHERE party_id=$1 AND position_node_id=$2),0)::int AS used`,
    [partyId, check.destination_position_id, check.actor_id]);
  return result(Number(occupancy.rows[0]?.used) + 1 <= check.destination_capacity);
}
const text = (value) => typeof value === 'string' && value.length > 0;
const integer = (value) => Number.isSafeInteger(value);
const nullableVersion = (value) => value == null
  || Number.isSafeInteger(value) && value >= 0;
const result = (ok) => Object.freeze({ ok, code: 'state_version_conflict' });
