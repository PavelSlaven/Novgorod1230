export async function readSiteTraversalDestinationOccupancy({ pool, partyId, positionId }) {
  const result = await pool.query(`SELECT
    (SELECT count(*)::int FROM party_runtime.party_journey_locations
      WHERE party_id=$1 AND location_kind='scene' AND scene_position_id=$2)
    + coalesce((SELECT sum(occupies_capacity_units) FROM party_runtime.entity_placements
      WHERE party_id=$1 AND position_node_id=$2),0)::int AS units`,
  [partyId, positionId]);
  return result.rowCount === 1 ? Number(result.rows[0].units) : null;
}
