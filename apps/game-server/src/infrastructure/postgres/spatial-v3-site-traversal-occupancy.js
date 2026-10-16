export async function readSiteTraversalDestinationOccupancy({ pool, partyId, positionId }) {
  const result = await pool.query(`SELECT
    (SELECT count(*)::int FROM party_runtime.party_journey_locations
      WHERE party_id=$1 AND location_kind='scene' AND scene_position_id=$2)
    + coalesce((SELECT sum(occupies_capacity_units) FROM party_runtime.entity_placements
      WHERE party_id=$1 AND position_node_id=$2),0)::int AS units`,
  [partyId, positionId]);
  return result.rowCount === 1 ? Number(result.rows[0].units) : null;
}

export async function readSiteTraversalOpenExecutions({ pool, partyId, journeyOwnerRef,
  successorExecutionId }) {
  return pool.query(`SELECT to_jsonb(p) AS plan, to_jsonb(e) AS execution
    FROM party_runtime.party_route_plan_executions e
    JOIN party_runtime.party_route_plans p ON p.id=e.route_plan_id
    WHERE e.party_id=$1 AND e.journey_owner_ref=$2::jsonb
      AND e.journey_scope='world_travel'
      AND e.status NOT IN ('completed','aborted','superseded')
      AND e.id<>$3
    ORDER BY e.id`, [partyId, JSON.stringify(journeyOwnerRef), successorExecutionId]);
}
