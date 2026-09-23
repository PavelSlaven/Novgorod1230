import { serverError } from '../../errors.js';

/** Current, same-baseline scene edges for the actor's committed root position. */
export function createSpatialV3LocalSceneMovementReader({ pool } = {}) {
  if (!pool?.query) throw new TypeError('Spatial v3 local movement requires a PostgreSQL pool.');
  return Object.freeze({
    async list({ partyId, actorId, positionId }) {
      if (![partyId, actorId, positionId].every(text)) gap('SPATIAL_V3_LOCAL_SOURCE_INVALID');
      const result = await pool.query(`SELECT l.id AS journey_location_id,
          l.state_version AS journey_state_version,
          e.id AS edge_id,e.reverse_edge_id,
          e.from_position_id AS from_position_ref,e.to_position_id AS to_position_ref,
          e.cost_kind,e.action_units,e.base_minutes,e.capacity AS edge_capacity,
          e.transition_environment_profile_ref,e.movement_orientation_profile_ref,
          e.baseline_movement_method_id,e.movement_method_cost_profile_ref,
          e.dynamic_recheck_policy_ref,e.state_version AS edge_state_version,
          reverse.state_version AS reverse_edge_state_version,
          source.state_version AS source_node_state_version,
          destination.state_version AS destination_node_state_version,
          destination.capacity AS destination_capacity,
          destination.template_slot_key AS destination_slot_key,
          baseline.id AS scene_baseline_id,baseline.host_id AS site_id,
          (SELECT COUNT(*)::int FROM party_runtime.party_journey_locations occupancy
            WHERE occupancy.party_id=e.party_id AND occupancy.location_kind='scene'
              AND occupancy.scene_position_id=e.to_position_id)
          + COALESCE((SELECT SUM(occupies_capacity_units) FROM party_runtime.entity_placements occupancy
            WHERE occupancy.party_id=e.party_id AND occupancy.position_node_id=e.to_position_id),0)::int
            AS destination_occupancy
        FROM party_runtime.party_journey_locations l
        JOIN party_runtime.scene_position_nodes source
          ON source.party_id=l.party_id AND source.id=l.scene_position_id AND source.status='active'
        JOIN party_runtime.party_g6_instances g6
          ON g6.party_id=l.party_id AND g6.id=source.g6_instance_id AND g6.status='active'
        JOIN party_runtime.party_scene_baselines baseline
          ON baseline.party_id=l.party_id AND baseline.id=g6.scene_baseline_id
            AND baseline.status='active' AND baseline.host_kind='g5_site'
        JOIN party_runtime.party_g5_sites site
          ON site.party_id=l.party_id AND site.id=baseline.host_id
            AND site.status='active' AND site.origin IN ('canonical','generated')
        JOIN party_runtime.scene_movement_edges e
          ON e.party_id=l.party_id AND e.scene_baseline_id=baseline.id
            AND e.from_position_id=source.id AND e.status='active'
        JOIN party_runtime.scene_movement_edges reverse
          ON reverse.party_id=e.party_id AND reverse.id=e.reverse_edge_id
            AND reverse.scene_baseline_id=e.scene_baseline_id
            AND reverse.from_position_id=e.to_position_id
            AND reverse.to_position_id=e.from_position_id
            AND reverse.reverse_edge_id=e.id AND reverse.status='active'
        JOIN party_runtime.scene_position_nodes destination
          ON destination.party_id=e.party_id AND destination.id=e.to_position_id
            AND destination.status='active'
        JOIN party_runtime.party_g6_instances destination_g6
          ON destination_g6.party_id=e.party_id AND destination_g6.id=destination.g6_instance_id
            AND destination_g6.scene_baseline_id=baseline.id AND destination_g6.status='active'
        WHERE l.party_id=$1 AND l.owner_kind='actor' AND l.owner_id=$2
          AND l.location_kind='scene' AND l.scene_position_id=$3
          AND e.cost_kind='action' AND e.action_units > 0 AND e.base_minutes IS NULL
          AND e.portal_entity_id IS NULL AND e.availability_condition_set_ref IS NULL
        ORDER BY e.id`, [partyId, actorId, positionId]);
      return result.rows.filter((row) => validRow(row))
        .map((row) => Object.freeze({ journey_location_id: row.journey_location_id,
          journey_state_version: Number(row.journey_state_version),
          scene_baseline_id: row.scene_baseline_id, site_id: row.site_id,
          destination_slot_key: row.destination_slot_key,
          movement_admission: Object.freeze({
            edge_id: row.edge_id, reverse_edge_id: row.reverse_edge_id,
            from_position_ref: row.from_position_ref,
            to_position_ref: row.to_position_ref,
            cost_kind: row.cost_kind, action_units: Number(row.action_units),
            base_minutes: row.base_minutes, edge_capacity: Number(row.edge_capacity),
            destination_capacity: Number(row.destination_capacity),
            transition_footprint_units: 1,
            destination_occupancy: Number(row.destination_occupancy),
            edge_state_version: Number(row.edge_state_version),
            reverse_edge_state_version: Number(row.reverse_edge_state_version),
            source_node_state_version: Number(row.source_node_state_version),
            destination_node_state_version: Number(row.destination_node_state_version),
            transition_environment_profile_ref: row.transition_environment_profile_ref,
            movement_orientation_profile_ref: row.movement_orientation_profile_ref,
            baseline_movement_method_id: row.baseline_movement_method_id,
            movement_method_cost_profile_ref: row.movement_method_cost_profile_ref,
            dynamic_recheck_policy_ref: row.dynamic_recheck_policy_ref
          }) }));
    }
  });
}

function validRow(row) {
  const edge = row && { ...row, transition_footprint_units: 1 };
  return [row?.journey_location_id, row?.scene_baseline_id, row?.site_id,
    row?.destination_slot_key, edge?.edge_id, edge?.reverse_edge_id,
    edge?.from_position_ref, edge?.to_position_ref].every(text)
    && ['journey_state_version', 'edge_state_version', 'reverse_edge_state_version',
      'source_node_state_version', 'destination_node_state_version', 'action_units',
      'edge_capacity', 'destination_capacity', 'destination_occupancy']
      .every((key) => Number.isSafeInteger(Number(row[key])) && Number(row[key]) >= 0)
    && Number(row.action_units) > 0 && Number(row.edge_capacity) > 0
    && Number(row.destination_capacity) > 0
    && Number(row.destination_occupancy) + 1 <= Number(row.destination_capacity);
}

const text = (value) => typeof value === 'string' && value.length > 0;
function gap(code) { throw serverError(code, 'Current local scene movement is unavailable.', { status: 409 }); }
