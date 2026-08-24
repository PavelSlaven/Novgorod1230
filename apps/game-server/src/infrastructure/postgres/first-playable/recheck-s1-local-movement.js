import { isDeepStrictEqual } from 'node:util';

export async function recheckS1LocalMovement({ transaction, partyId, check }) {
  if (!text(check.actor_id) || !text(check.journey_location_id)
      || !integer(check.expected_journey_state_version)
      || ![check.from_position_ref, check.to_position_ref,
        check.movement_edge_ref].every(text)
      || !validAdmission(check.movement_admission, check)) return resultOf(false);
  const result = await transaction.query(
    `SELECT l.state_version AS journey_state_version,
            l.scene_position_id AS journey_position_id,
            e.from_position_id,e.to_position_id,e.status AS edge_status,e.state_version AS edge_state_version,
            e.cost_kind,e.action_units,e.base_minutes,e.capacity AS edge_capacity,e.reverse_edge_id,
            e.transition_environment_profile_ref,e.movement_orientation_profile_ref,
            e.baseline_movement_method_id,e.movement_method_cost_profile_ref,e.dynamic_recheck_policy_ref,
            reverse.state_version AS reverse_edge_state_version,reverse.status AS reverse_edge_status,
            reverse.from_position_id AS reverse_from_position_id,reverse.to_position_id AS reverse_to_position_id,
            reverse.reverse_edge_id AS reverse_reverse_edge_id,
            source.status AS source_status,source.state_version AS source_node_state_version,
            destination.status AS destination_status,destination.state_version AS destination_node_state_version,
            destination.capacity AS destination_capacity
       FROM party_runtime.party_journey_locations l
       JOIN party_runtime.scene_movement_edges e
         ON e.party_id=l.party_id AND e.id=$4
       JOIN party_runtime.scene_movement_edges reverse
         ON reverse.party_id=e.party_id AND reverse.id=e.reverse_edge_id
       JOIN party_runtime.scene_position_nodes source
         ON source.party_id=l.party_id AND source.id=e.from_position_id
       JOIN party_runtime.scene_position_nodes destination
         ON destination.party_id=l.party_id AND destination.id=e.to_position_id
      WHERE l.party_id=$1 AND l.id=$2 AND l.owner_kind='actor' AND l.owner_id=$3
      FOR UPDATE OF l,e,reverse,source,destination`,
    [partyId, check.journey_location_id, check.actor_id,
      check.movement_edge_ref]
  );
  const actual = result.rows[0];
  const admitted = result.rowCount === 1
    && Number(actual?.journey_state_version) === check.expected_journey_state_version
    && actual?.journey_position_id === check.from_position_ref
    && actual?.from_position_id === check.from_position_ref
    && actual?.to_position_id === check.to_position_ref
    && actual?.edge_status === 'active'
    && actual?.reverse_edge_status === 'active'
    && actual?.source_status === 'active'
    && actual?.destination_status === 'active'
    && sameAdmission(actual, check.movement_admission);
  if (!admitted) return resultOf(false);
  const occupancy = await transaction.query(`SELECT
    (SELECT COUNT(*)::int FROM party_runtime.party_journey_locations
      WHERE party_id=$1 AND location_kind='scene' AND scene_position_id=$2)
    + COALESCE((SELECT SUM(occupies_capacity_units) FROM party_runtime.entity_placements
      WHERE party_id=$1 AND position_node_id=$2),0)::int AS destination_occupancy`,
  [partyId, check.to_position_ref]);
  return resultOf(occupancy.rowCount === 1
    && Number(occupancy.rows[0]?.destination_occupancy)
      + check.movement_admission.transition_footprint_units
      <= check.movement_admission.destination_capacity);
}

const text = (value) => typeof value === 'string' && value.length > 0;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
function validAdmission(value, check) {
  return value?.edge_id === check.movement_edge_ref && value.from_position_ref === check.from_position_ref
    && value.to_position_ref === check.to_position_ref && text(value.reverse_edge_id)
    && value.cost_kind === 'action' && integer(value.action_units) && value.action_units > 0
    && value.base_minutes === null && integer(value.edge_capacity) && value.edge_capacity > 0
    && integer(value.destination_capacity) && value.destination_capacity > 0
    && value.transition_footprint_units === 1
    && ['edge_state_version', 'reverse_edge_state_version', 'source_node_state_version', 'destination_node_state_version']
      .every((key) => integer(value[key]))
    && ['transition_environment_profile_ref', 'movement_orientation_profile_ref',
      'baseline_movement_method_id', 'movement_method_cost_profile_ref',
      'dynamic_recheck_policy_ref'].every((key) => Object.hasOwn(value, key));
}
function sameAdmission(actual, expected) {
  return Number(actual?.edge_state_version) === expected.edge_state_version
    && actual?.reverse_edge_id === expected.reverse_edge_id
    && Number(actual?.reverse_edge_state_version) === expected.reverse_edge_state_version
    && actual?.reverse_from_position_id === expected.to_position_ref
    && actual?.reverse_to_position_id === expected.from_position_ref
    && actual?.reverse_reverse_edge_id === expected.edge_id
    && Number(actual?.source_node_state_version) === expected.source_node_state_version
    && Number(actual?.destination_node_state_version) === expected.destination_node_state_version
    && actual?.cost_kind === expected.cost_kind
    && Number(actual?.action_units) === expected.action_units
    && actual?.base_minutes === expected.base_minutes
    && Number(actual?.edge_capacity) === expected.edge_capacity
    && Number(actual?.destination_capacity) === expected.destination_capacity
    && ['transition_environment_profile_ref', 'movement_orientation_profile_ref',
      'baseline_movement_method_id', 'movement_method_cost_profile_ref',
      'dynamic_recheck_policy_ref'].every((key) =>
      isDeepStrictEqual(actual?.[key] ?? null, expected[key] ?? null));
}
const resultOf = (ok, code = 'state_version_conflict') => Object.freeze({ ok, code });
