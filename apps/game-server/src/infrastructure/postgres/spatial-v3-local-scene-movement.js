import { serverError } from '../../errors.js';

/** Current, same-baseline scene edges for the actor's committed root position. */
export function createSpatialV3LocalSceneMovementReader({ pool, readLocalMovementEligibility = null } = {}) {
  if (!pool?.query) throw new TypeError('Spatial v3 local movement requires a PostgreSQL pool.');
  return Object.freeze({
    async list({ partyId, actorId, positionId }) {
      if (![partyId, actorId, positionId].every(text)) gap('SPATIAL_V3_LOCAL_SOURCE_INVALID');
      const result = await pool.query(`SELECT l.id AS journey_location_id,
          l.state_version AS journey_state_version,
          e.id AS edge_id,e.reverse_edge_id,e.passage_type_id,
          party.world_revision_id,party.world_catalog_digest,
          baseline.scene_template_ref,baseline.catalog_digest AS scene_template_digest,
          e.source_scene_template_ref AS edge_scene_template_ref,
          e.source_edge_slot_key AS edge_slot_key,
          source.template_slot_key AS source_slot_key,
          source.template_instance_ordinal AS source_instance_ordinal,
          destination.template_instance_ordinal AS destination_instance_ordinal,
          reverse.id AS opposing_edge_id,reverse.source_edge_slot_key AS opposing_edge_slot_key,
          reverse.source_scene_template_ref AS opposing_scene_template_ref,
          reverse.reverse_edge_id AS opposing_reverse_edge_id,reverse.capacity AS opposing_capacity,
          reverse.action_units AS opposing_action_units,reverse.base_minutes AS opposing_base_minutes,
          reverse.passage_type_id AS opposing_passage_type_id,
          reverse.transition_environment_profile_ref AS opposing_transition_environment_profile_ref,
          reverse.movement_orientation_profile_ref AS opposing_movement_orientation_profile_ref,
          reverse.baseline_movement_method_id AS opposing_baseline_movement_method_id,
          reverse.movement_method_cost_profile_ref AS opposing_movement_method_cost_profile_ref,
          reverse.dynamic_recheck_policy_ref AS opposing_dynamic_recheck_policy_ref,
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
        JOIN party_runtime.parties party ON party.party_id=l.party_id
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
          ON reverse.party_id=e.party_id
            AND reverse.scene_baseline_id=e.scene_baseline_id
            AND reverse.from_position_id=e.to_position_id
            AND reverse.to_position_id=e.from_position_id
            AND reverse.status='active'
            AND ((reverse.id=e.reverse_edge_id AND reverse.reverse_edge_id=e.id)
              OR ($4::boolean AND e.reverse_edge_id IS NULL AND reverse.reverse_edge_id IS NULL
                AND reverse.cost_kind='action' AND reverse.base_minutes IS NULL
                AND reverse.portal_entity_id IS NULL AND reverse.availability_condition_set_ref IS NULL))
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
        ORDER BY e.id`, [partyId, actorId, positionId, readLocalMovementEligibility != null]);
      const rows = [];
      for (const row of result.rows) {
        if (row.reverse_edge_id === null && readLocalMovementEligibility) {
          row.eligibility = await readLocalMovementEligibility(row);
        }
        if (validRow(row)) rows.push(row);
      }
      return rows
        .map((row) => Object.freeze({ journey_location_id: row.journey_location_id,
          journey_state_version: Number(row.journey_state_version),
          scene_baseline_id: row.scene_baseline_id, site_id: row.site_id,
          destination_slot_key: row.destination_slot_key,
          movement_admission: Object.freeze({
            edge_id: row.edge_id, reverse_edge_id: row.reverse_edge_id,
            from_position_ref: row.from_position_ref,
            to_position_ref: row.to_position_ref,
            cost_kind: row.cost_kind, action_units: Number(row.action_units),
            base_minutes: row.base_minutes, edge_capacity: row.edge_capacity === null ? null : Number(row.edge_capacity),
            destination_capacity: Number(row.destination_capacity),
            transition_footprint_units: 1,
            destination_occupancy: Number(row.destination_occupancy),
            edge_state_version: Number(row.edge_state_version),
            reverse_edge_state_version: row.reverse_edge_id === null ? null : Number(row.reverse_edge_state_version),
            ...(row.eligibility ? {
              local_movement_eligibility_ref: row.eligibility.pin,
              max_root_owners_per_transition: row.eligibility.max_root_owners_per_transition,
              opposing_edge_id: row.opposing_edge_id,
              opposing_edge_state_version: Number(row.reverse_edge_state_version)
            } : {}),
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
    row?.destination_slot_key, edge?.edge_id,
    edge?.from_position_ref, edge?.to_position_ref].every(text)
    && ['journey_state_version', 'edge_state_version', 'reverse_edge_state_version',
      'source_node_state_version', 'destination_node_state_version', 'action_units',
      'destination_capacity', 'destination_occupancy']
      .every((key) => Number.isSafeInteger(Number(row[key])) && Number(row[key]) >= 0)
    && Number(row.action_units) > 0
    && (text(row.reverse_edge_id) && Number.isSafeInteger(Number(row.edge_capacity)) && Number(row.edge_capacity) > 0
      || row.reverse_edge_id === null && row.edge_capacity === null && row.eligibility?.pin
        && Number.isSafeInteger(row.eligibility.max_root_owners_per_transition)
        && row.eligibility.max_root_owners_per_transition >= 1)
    && Number(row.destination_capacity) > 0
    && Number(row.destination_occupancy) + 1 <= Number(row.destination_capacity);
}

const text = (value) => typeof value === 'string' && value.length > 0;
function gap(code) { throw serverError(code, 'Current local scene movement is unavailable.', { status: 409 }); }
