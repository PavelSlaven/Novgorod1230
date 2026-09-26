import { isDeepStrictEqual } from 'node:util';
import { canonicalDigest } from '@rus/materialization';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';

export async function recheckSiteConnectionTraversal({ transaction, partyId, check,
  assessAvailability, assessMovementCapability, projectDestination }) {
  if (typeof assessAvailability !== 'function'
    || typeof assessMovementCapability !== 'function'
    || typeof projectDestination !== 'function') return result(false);
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
    || !['expected_journey_state_version', 'connection_state_version',
      'source_endpoint_state_version', 'destination_endpoint_state_version',
      'source_position_state_version', 'destination_position_state_version',
      'source_g6_state_version', 'destination_g6_state_version',
      'source_baseline_state_version', 'destination_baseline_state_version',
      'source_site_state_version', 'destination_site_state_version',
      'destination_capacity', 'action_units'].every((key) => integer(check[key]))) {
    return result(false);
  }
  const current = await transaction.query(`SELECT
      l.scene_position_id,l.location_kind,l.state_version AS journey_version,
      c.from_site_id,c.to_site_id,c.status AS connection_status,
      c.state_version AS connection_version,c.cost_kind,c.action_units,c.base_minutes,
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
  if (current.rowCount !== 1 || row.location_kind !== 'scene'
    || row.scene_position_id !== check.from_position_ref
    || row.from_position !== check.from_position_ref
    || row.to_position !== check.to_position_ref
    || row.from_site !== check.source_site_id
    || row.to_site !== check.destination_site_id
    || row.from_site_id !== check.source_site_id
    || row.to_site_id !== check.destination_site_id
    || row.destination_g4_id !== check.destination_g4_id
    || row.destination_g6_id !== check.destination_g6_instance_id
    || row.destination_baseline_id !== check.destination_scene_baseline_id
    || row.cost_kind !== 'action' || row.base_minutes !== null
    || row.portal_entity_id !== null || Number(row.action_units) !== check.action_units
    || row.connection_capacity != null && Number(row.connection_capacity) < 1
    || !isDeepStrictEqual(row.availability_condition_set_ref,
      check.availability_condition_set_ref)
    || [row.connection_status, row.from_binding_status, row.to_binding_status,
      row.source_position_status, row.destination_position_status,
      row.source_g6_status, row.destination_g6_status,
      row.source_baseline_status, row.destination_baseline_status,
      row.source_site_status, row.destination_site_status]
      .some((status) => status !== 'active')) return result(false);
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
    || Number(row.destination_capacity) !== check.destination_capacity) return result(false);
  const occupancy = await transaction.query(`SELECT
    (SELECT count(*)::int FROM party_runtime.party_journey_locations
      WHERE party_id=$1 AND location_kind='scene' AND scene_position_id=$2)
    + coalesce((SELECT sum(occupies_capacity_units) FROM party_runtime.entity_placements
      WHERE party_id=$1 AND position_node_id=$2),0)::int AS units`,
  [partyId, check.to_position_ref]);
  if (occupancy.rowCount !== 1
    || Number(occupancy.rows[0].units) + 1 > check.destination_capacity) return result(false);
  const availability = await assessAvailability({ transaction, partyId,
    actorId: check.actor_id, connectionId: check.connection_id,
    conditionSetRef: check.availability_condition_set_ref,
    sourcePositionId: check.from_position_ref,
    destinationPositionId: check.to_position_ref, current: row });
  if (availability?.ok !== true || availability.connection_id !== check.connection_id
    || availability.condition_set_ref !== (check.availability_condition_set_ref == null ? null
      : `${check.availability_condition_set_ref.entity_id}@${check.availability_condition_set_ref.authoring_version}`)) {
    return result(false);
  }
  const capability = await assessMovementCapability({ transaction, partyId,
    actorId: check.actor_id, connectionId: check.connection_id, current: row });
  if (capability?.ok !== true || capability.actor_id !== check.actor_id
    || capability.capability_context?.canonical_digest !== check.capability_context_digest) {
    return result(false);
  }
  const destination = await projectDestination({ transaction, partyId,
    actorId: check.actor_id, connectionId: check.connection_id,
    sourcePositionId: check.from_position_ref,
    destinationPositionId: check.to_position_ref,
    destinationSiteId: check.destination_site_id,
    destinationG6InstanceId: check.destination_g6_instance_id,
    destinationSceneBaselineId: check.destination_scene_baseline_id,
    current: row });
  return result(destination?.ok === true
    && destination.position_id === check.to_position_ref
    && destination.site_id === check.destination_site_id
    && validateVisibleContext(destination.visible_context).ok
    && canonicalDigest(destination.visible_context) === check.destination_visible_digest);
}

const text = (value) => typeof value === 'string' && value.length > 0;
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const result = (ok) => Object.freeze({ ok, code: 'state_version_conflict' });
