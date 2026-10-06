import { isDeepStrictEqual } from 'node:util';
import { canonicalDigest } from '@rus/materialization';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';

export async function recheckSiteConnectionTraversal({ transaction, partyId, check,
  assessAvailability, assessMovementCapability, projectDestination }) {
  if (typeof assessAvailability !== 'function'
    || typeof assessMovementCapability !== 'function'
    || typeof projectDestination !== 'function') return result(false, 'line_recheck_owner_missing');
  const legacyAction = check.cost_kind === 'action'
    && integer(check.action_units) && check.action_units > 0
    && check.base_minutes == null && check.line_kind_id == null
    && check.line_name == null && check.line_kind_profile_ref == null
    && check.source_canonical_connection_ref == null;
  if (check.party_id !== partyId || ![check.actor_id, check.connection_id,
    check.journey_location_id, check.from_position_ref, check.to_position_ref,
    check.source_site_id, check.destination_site_id,
    check.destination_g4_id, check.destination_g6_instance_id,
    check.destination_scene_baseline_id,
    check.capability_context_digest,
    check.destination_visible_digest].every(text)
    || check.availability_condition_set_ref != null
      && ![check.availability_condition_set_ref.entity_id,
        check.availability_condition_set_ref.authoring_version].every(text)
    || !legacyAction && (!text(check.line_kind_id) || !text(check.line_name)
      || check.line_discriminator != null && !text(check.line_discriminator)
      || check.line_direction_id != null && !text(check.line_direction_id)
      || !['line_kind_profile_ref', 'baseline_movement_method_id',
      'movement_method_cost_profile_ref', 'transition_environment_profile_ref',
      'movement_orientation_profile_ref', 'dynamic_recheck_policy_ref']
        .every((key) => check[key] != null))
    || !['expected_journey_state_version', 'connection_state_version',
      'source_endpoint_state_version', 'destination_endpoint_state_version',
      'source_position_state_version', 'destination_position_state_version',
      'source_g6_state_version', 'destination_g6_state_version',
      'source_baseline_state_version', 'destination_baseline_state_version',
      'source_site_state_version', 'destination_site_state_version',
      'destination_capacity'].every((key) => integer(check[key]))
    || legacyAction && !integer(check.action_units)
    || !legacyAction && (!integer(check.base_minutes) || check.base_minutes < 1)
    || check.destination_capacity < 1) {
    return result(false, 'line_recheck_snapshot_invalid');
  }
  const current = await transaction.query(`SELECT
      l.scene_position_id,l.location_kind,l.state_version AS journey_version,
      c.from_site_id,c.to_site_id,c.status AS connection_status,
      c.state_version AS connection_version,c.cost_kind,c.action_units,c.base_minutes,
      c.line_kind_id,c.line_kind_profile_ref,c.line_name,c.line_discriminator,c.line_direction_id,
      c.source_canonical_connection_ref,
      c.baseline_movement_method_id,c.movement_method_cost_profile_ref,
      c.transition_environment_profile_ref,c.movement_orientation_profile_ref,
      c.dynamic_recheck_policy_ref,
      c.capacity AS connection_capacity,c.portal_entity_id,
      c.availability_condition_set_ref,
      bf.position_id AS from_position,bf.g5_site_id AS from_site,
      bf.status AS from_binding_status,bf.state_version AS from_binding_version,
      bt.position_id AS to_position,bt.g5_site_id AS to_site,
      bt.status AS to_binding_status,bt.state_version AS to_binding_version,
      pf.status AS source_position_status,pf.state_version AS source_position_version,
      pt.status AS destination_position_status,pt.state_version AS destination_position_version,
      pt.capacity AS destination_capacity,
      gf.status AS source_g6_status,gf.state_version AS source_g6_version,
      gt.status AS destination_g6_status,gt.state_version AS destination_g6_version,
      gt.id AS destination_g6_id,
      bbf.status AS source_baseline_status,bbf.state_version AS source_baseline_version,
      bbt.status AS destination_baseline_status,bbt.state_version AS destination_baseline_version,
      bbt.id AS destination_baseline_id,
      sf.status AS source_site_status,sf.state_version AS source_site_version,
      st.status AS destination_site_status,st.state_version AS destination_site_version,
      st.parent_g4_id AS destination_g4_id
    FROM party_runtime.party_journey_locations l
    JOIN party_runtime.g5_site_connections c ON c.party_id=l.party_id AND c.id=$4
    JOIN party_runtime.party_site_connection_endpoint_bindings bf
      ON bf.party_id=l.party_id AND bf.site_connection_id=c.id AND bf.endpoint_role='from'
    JOIN party_runtime.party_site_connection_endpoint_bindings bt
      ON bt.party_id=l.party_id AND bt.site_connection_id=c.id AND bt.endpoint_role='to'
    JOIN party_runtime.scene_position_nodes pf ON pf.party_id=l.party_id AND pf.id=bf.position_id
    JOIN party_runtime.scene_position_nodes pt ON pt.party_id=l.party_id AND pt.id=bt.position_id
    JOIN party_runtime.party_g6_instances gf ON gf.party_id=l.party_id AND gf.id=pf.g6_instance_id
    JOIN party_runtime.party_g6_instances gt ON gt.party_id=l.party_id AND gt.id=pt.g6_instance_id
    JOIN party_runtime.party_scene_baselines bbf ON bbf.party_id=l.party_id AND bbf.id=gf.scene_baseline_id
    JOIN party_runtime.party_scene_baselines bbt ON bbt.party_id=l.party_id AND bbt.id=gt.scene_baseline_id
    JOIN party_runtime.party_g5_sites sf ON sf.party_id=l.party_id AND sf.id=c.from_site_id
    JOIN party_runtime.party_g5_sites st ON st.party_id=l.party_id AND st.id=c.to_site_id
    WHERE l.party_id=$1 AND l.owner_kind='actor' AND l.owner_id=$2 AND l.id=$3
      AND bbf.host_kind='g5_site' AND bbf.host_id=sf.id
      AND bbt.host_kind='g5_site' AND bbt.host_id=st.id
      AND gf.host_kind='g5_site' AND gf.host_id=sf.id
      AND gt.host_kind='g5_site' AND gt.host_id=st.id
    FOR UPDATE OF l,c,bf,bt,pf,pt,gf,gt,bbf,bbt,sf,st`,
  [partyId, check.actor_id, check.journey_location_id, check.connection_id]);
  const row = current.rows[0];
  if (current.rowCount !== 1) return result(false, 'line_journey_or_connection_missing');
  const rowChecks = {
    actor_position: row.location_kind === 'scene'
      && row.scene_position_id === (check.origin_position_ref ?? check.from_position_ref),
    endpoint_positions: row.from_position === check.from_position_ref
      && row.to_position === check.to_position_ref,
    endpoint_sites: row.from_site === check.source_site_id
      && row.to_site === check.destination_site_id
      && row.from_site_id === check.source_site_id && row.to_site_id === check.destination_site_id,
    destination_host: row.destination_g4_id === check.destination_g4_id
      && row.destination_g6_id === check.destination_g6_instance_id
      && row.destination_baseline_id === check.destination_scene_baseline_id,
    time_contract: (legacyAction
      ? row.cost_kind === 'action' && Number(row.action_units) === check.action_units
        && row.base_minutes === null && row.portal_entity_id === null
      : row.cost_kind === 'time' && row.action_units === null
        && Number(row.base_minutes) === check.base_minutes && row.portal_entity_id === null)
      && (row.connection_capacity == null || Number(row.connection_capacity) >= 1),
    line_identity: legacyAction
      ? row.line_kind_id == null && row.line_name == null
        && row.line_kind_profile_ref == null && row.source_canonical_connection_ref == null
      : row.line_kind_id === check.line_kind_id && row.line_name === check.line_name
      && row.line_discriminator === check.line_discriminator
      && row.line_direction_id === check.line_direction_id,
    line_profiles: legacyAction ? true
      : isDeepStrictEqual(row.line_kind_profile_ref, check.line_kind_profile_ref)
      && row.baseline_movement_method_id === check.baseline_movement_method_id
      && isDeepStrictEqual(row.movement_method_cost_profile_ref, check.movement_method_cost_profile_ref)
      && isDeepStrictEqual(row.transition_environment_profile_ref, check.transition_environment_profile_ref)
      && isDeepStrictEqual(row.movement_orientation_profile_ref, check.movement_orientation_profile_ref)
      && isDeepStrictEqual(row.dynamic_recheck_policy_ref, check.dynamic_recheck_policy_ref),
    availability_pin: isDeepStrictEqual(row.availability_condition_set_ref,
      check.availability_condition_set_ref),
    active_rows: [row.connection_status, row.from_binding_status, row.to_binding_status,
      row.source_position_status, row.destination_position_status, row.source_g6_status,
      row.destination_g6_status, row.source_baseline_status, row.destination_baseline_status,
      row.source_site_status, row.destination_site_status].every((status) => status === 'active')
  };
  const mismatch = Object.entries(rowChecks).find(([, matches]) => !matches)?.[0];
  if (mismatch) return result(false, `line_${mismatch}_mismatch`);
  const versions = {
    journey_version: 'expected_journey_state_version',
    connection_version: 'connection_state_version',
    from_binding_version: 'source_endpoint_state_version',
    to_binding_version: 'destination_endpoint_state_version',
    source_position_version: 'source_position_state_version',
    destination_position_version: 'destination_position_state_version',
    source_g6_version: 'source_g6_state_version',
    destination_g6_version: 'destination_g6_state_version',
    source_baseline_version: 'source_baseline_state_version',
    destination_baseline_version: 'destination_baseline_state_version',
    source_site_version: 'source_site_state_version',
    destination_site_version: 'destination_site_state_version'
  };
  if (Object.entries(versions).some(([actual, expected]) =>
    Number(row[actual]) !== check[expected])
    || Number(row.destination_capacity) !== check.destination_capacity) return result(false, 'line_connection_state_version_conflict');
  if (check.ordered_local_edge_path != null
    && !await recheckOrderedLocalEdgePath({ transaction, partyId,
      path: check.ordered_local_edge_path,
      originPositionId: check.origin_position_ref ?? row.from_position,
      destinationPositionId: row.from_position })) return result(false, 'ordered_local_edge_path_stale');
  const occupancy = await transaction.query(`SELECT
    (SELECT count(*)::int FROM party_runtime.party_journey_locations
      WHERE party_id=$1 AND location_kind='scene' AND scene_position_id=$2)
    + coalesce((SELECT sum(occupies_capacity_units) FROM party_runtime.entity_placements
      WHERE party_id=$1 AND position_node_id=$2),0)::int AS units`,
  [partyId, check.to_position_ref]);
  if (occupancy.rowCount !== 1
    || Number(occupancy.rows[0].units) + 1 > check.destination_capacity) return result(false, 'line_destination_capacity_changed');
  const availability = await assessAvailability({ transaction, partyId,
    actorId: check.actor_id, connectionId: check.connection_id,
    conditionSetRef: check.availability_condition_set_ref,
    sourcePositionId: check.from_position_ref,
    destinationPositionId: check.to_position_ref, current: row });
  if (availability?.ok !== true || availability.status !== 'open'
    || availability.connection_id !== check.connection_id
    || availability.condition_set_ref !== (check.availability_condition_set_ref == null ? null
      : `${check.availability_condition_set_ref.entity_id}@${check.availability_condition_set_ref.authoring_version}`)) {
    return result(false, 'line_availability_changed');
  }
  const capability = await assessMovementCapability({ transaction, partyId,
    actorId: check.actor_id, connectionId: check.connection_id, current: row });
  if (capability?.ok !== true || capability.actor_id !== check.actor_id
    || capability.capability_context?.canonical_digest !== check.capability_context_digest) {
    return result(false, 'line_movement_capability_changed');
  }
  const destination = await projectDestination({ transaction, partyId,
    actorId: check.actor_id, connectionId: check.connection_id,
    sourcePositionId: check.from_position_ref,
    destinationPositionId: check.to_position_ref,
    destinationSiteId: check.destination_site_id,
    destinationG6InstanceId: check.destination_g6_instance_id,
    destinationSceneBaselineId: check.destination_scene_baseline_id,
    current: row });
  const visible = destination?.ok === true
    && destination.position_id === check.to_position_ref
    && destination.site_id === check.destination_site_id
    && validateVisibleContext(destination.visible_context).ok
    && canonicalDigest(destination.visible_context) === check.destination_visible_digest;
  return visible ? result(true) : result(false, 'line_visible_projection_changed');
}

export async function recheckOrderedLocalEdgePath({ transaction, partyId, path,
  originPositionId, destinationPositionId }) {
  if (!text(partyId) || !Array.isArray(path)
    || !text(originPositionId) || !text(destinationPositionId)) return false;
  if (path.length === 0) return originPositionId === destinationPositionId;
  let expectedPosition = originPositionId;
  for (const edge of path) {
    const admission = edge?.movement_admission;
    if (!text(edge?.edge_id) || !text(edge?.from_position_id) || !text(edge?.to_position_id)
      || edge.from_position_id !== expectedPosition || !validPathAdmission(admission, edge)) return false;
    expectedPosition = edge.to_position_id;
  }
  if (expectedPosition !== destinationPositionId) return false;

  const locked = await transaction.query(`
    SELECT requested.ordinality,
      requested.value->>'edge_id' AS requested_edge_id,
      requested.value->>'from_position_id' AS requested_from_position_id,
      requested.value->>'to_position_id' AS requested_to_position_id,
      e.id AS edge_id,e.from_position_id,e.to_position_id,e.status AS edge_status,
      e.state_version AS edge_state_version,e.cost_kind,e.action_units,e.base_minutes,
      e.capacity AS edge_capacity,e.reverse_edge_id,e.scene_baseline_id,
      reverse.status AS reverse_status,reverse.state_version AS reverse_state_version,
      reverse.from_position_id AS reverse_from_position_id,
      reverse.to_position_id AS reverse_to_position_id,
      reverse.reverse_edge_id AS reverse_reverse_edge_id,
      reverse.cost_kind AS reverse_cost_kind,
      source.status AS source_status,source.state_version AS source_state_version,
      source_g6.status AS source_g6_status,source_g6.scene_baseline_id AS source_g6_baseline_id,
      destination.status AS destination_status,destination.state_version AS destination_state_version,
      destination.capacity AS destination_capacity,
      destination_g6.status AS destination_g6_status,
      destination_g6.scene_baseline_id AS destination_g6_baseline_id,
      baseline.status AS baseline_status,
      (SELECT count(*)::int FROM party_runtime.party_journey_locations location
        WHERE location.party_id=e.party_id AND location.location_kind='scene'
          AND location.scene_position_id=destination.id)
        + coalesce((SELECT sum(placement.occupies_capacity_units)::int
          FROM party_runtime.entity_placements placement
          WHERE placement.party_id=e.party_id AND placement.position_node_id=destination.id),0)
        AS destination_occupancy,
      e.transition_environment_profile_ref,e.movement_orientation_profile_ref,
      e.baseline_movement_method_id,e.movement_method_cost_profile_ref,e.dynamic_recheck_policy_ref
    FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY requested(value, ordinality)
    JOIN party_runtime.scene_movement_edges e
      ON e.party_id=$1 AND e.id=requested.value->>'edge_id'
    JOIN party_runtime.scene_movement_edges reverse
      ON reverse.party_id=e.party_id AND reverse.id=e.reverse_edge_id
    JOIN party_runtime.scene_position_nodes source
      ON source.party_id=e.party_id AND source.id=e.from_position_id
    JOIN party_runtime.scene_position_nodes destination
      ON destination.party_id=e.party_id AND destination.id=e.to_position_id
    JOIN party_runtime.party_g6_instances source_g6
      ON source_g6.party_id=e.party_id AND source_g6.id=source.g6_instance_id
    JOIN party_runtime.party_g6_instances destination_g6
      ON destination_g6.party_id=e.party_id AND destination_g6.id=destination.g6_instance_id
    JOIN party_runtime.party_scene_baselines baseline
      ON baseline.party_id=e.party_id AND baseline.id=e.scene_baseline_id
    ORDER BY requested.ordinality
    FOR UPDATE OF e,reverse,source,destination,source_g6,destination_g6,baseline`,
  [partyId, JSON.stringify(path)]);
  if (locked.rowCount !== path.length) return false;
  let commonBaseline = null;
  for (let index = 0; index < path.length; index += 1) {
    const expected = path[index];
    const actual = locked.rows[index];
    const admission = expected.movement_admission;
    if (actual.requested_edge_id !== expected.edge_id
      || actual.requested_from_position_id !== expected.from_position_id
      || actual.requested_to_position_id !== expected.to_position_id
      || actual.edge_id !== expected.edge_id
      || actual.from_position_id !== expected.from_position_id
      || actual.to_position_id !== expected.to_position_id
      || actual.edge_status !== 'active' || actual.reverse_status !== 'active'
      || actual.source_status !== 'active' || actual.destination_status !== 'active'
      || actual.source_g6_status !== 'active' || actual.destination_g6_status !== 'active'
      || actual.baseline_status !== 'active'
      || actual.reverse_from_position_id !== actual.to_position_id
      || actual.reverse_to_position_id !== actual.from_position_id
      || actual.reverse_reverse_edge_id !== actual.edge_id
      || actual.cost_kind !== 'action' || actual.reverse_cost_kind !== 'action'
      || actual.base_minutes !== null || Number(actual.action_units) < 1
      || actual.edge_capacity != null && Number(actual.edge_capacity) < 1
      || Number(actual.destination_capacity) < 1
      || Number(actual.destination_occupancy) + 1 > Number(actual.destination_capacity)
      || actual.scene_baseline_id !== actual.source_g6_baseline_id
      || actual.scene_baseline_id !== actual.destination_g6_baseline_id
      || !samePathAdmission(actual, admission)) return false;
    if (commonBaseline == null) commonBaseline = actual.scene_baseline_id;
    else if (actual.scene_baseline_id !== commonBaseline) return false;
  }
  return true;
}

function validPathAdmission(value, edge) {
  return value?.edge_id === edge.edge_id
    && value.from_position_ref === edge.from_position_id
    && value.to_position_ref === edge.to_position_id
    && text(value.reverse_edge_id) && value.cost_kind === 'action'
    && integer(value.action_units) && value.action_units > 0
    && value.base_minutes === null
    && (value.edge_capacity === null || integer(value.edge_capacity) && value.edge_capacity > 0)
    && integer(value.destination_capacity) && value.destination_capacity > 0
    && ['edge_state_version', 'reverse_edge_state_version', 'source_node_state_version',
      'destination_node_state_version'].every((key) => integer(value[key]))
    && ['transition_environment_profile_ref', 'movement_orientation_profile_ref',
      'baseline_movement_method_id', 'movement_method_cost_profile_ref',
      'dynamic_recheck_policy_ref'].every((key) => Object.hasOwn(value, key));
}

function samePathAdmission(actual, expected) {
  return Number(actual.edge_state_version) === expected.edge_state_version
    && actual.reverse_edge_id === expected.reverse_edge_id
    && Number(actual.reverse_state_version) === expected.reverse_edge_state_version
    && Number(actual.source_state_version) === expected.source_node_state_version
    && Number(actual.destination_state_version) === expected.destination_node_state_version
    && actual.reverse_from_position_id === expected.to_position_ref
    && actual.reverse_to_position_id === expected.from_position_ref
    && actual.reverse_reverse_edge_id === expected.edge_id
    && actual.cost_kind === expected.cost_kind
    && Number(actual.action_units) === expected.action_units
    && actual.base_minutes === expected.base_minutes
    && (actual.edge_capacity == null ? expected.edge_capacity === null
      : Number(actual.edge_capacity) === expected.edge_capacity)
    && Number(actual.destination_capacity) === expected.destination_capacity
    && ['transition_environment_profile_ref', 'movement_orientation_profile_ref',
      'baseline_movement_method_id', 'movement_method_cost_profile_ref',
      'dynamic_recheck_policy_ref'].every((key) =>
      isDeepStrictEqual(actual[key] ?? null, expected[key] ?? null));
}

const text = (value) => typeof value === 'string' && value.length > 0;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const result = (ok, reason = null) => Object.freeze({ ok, code: 'state_version_conflict',
  ...(reason ? { reason } : {}) });
