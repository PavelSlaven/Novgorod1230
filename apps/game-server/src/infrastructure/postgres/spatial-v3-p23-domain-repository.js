const text = (value) => typeof value === 'string' && value.trim();
const ref = (entity_kind, entity_id) => Object.freeze({ entity_kind, entity_id });
const version = (value) => Number(value);
const PLACEMENT_ENTITY_KINDS = new Set(['npc', 'item', 'container', 'property', 'transport', 'actor', 'cohort']);

function placementExpectation(value) {
  if (value?.resource !== 'entity_placements' || !text(value.id) || !Number.isInteger(value.state_version)) return null;
  const [entity_kind, ...idParts] = value.id.split(':');
  const entity_id = idParts.join(':');
  return PLACEMENT_ENTITY_KINDS.has(entity_kind) && text(entity_id)
    ? Object.freeze({ entity_kind, entity_id, state_version: value.state_version })
    : null;
}

function placement(row) {
  return Object.freeze({ party_id: row.party_id, entity_ref: ref(row.entity_kind, row.entity_id), placement_kind: row.placement_kind, position_node_id: row.position_node_id, host_entity_ref: row.host_entity_ref, occupies_capacity_units: row.occupies_capacity_units, state_version: version(row.state_version), updated_change_set_id: row.updated_change_set_id });
}

/** Target-only P23 read/recheck port. CombinedAtomicCommitter is the sole writer. */
export function createSpatialV3P23DomainRepository({ pool } = {}) {
  if (!pool?.connect) throw new TypeError('P23 PostgreSQL repository requires a pg pool');

  async function loadSnapshot(query, { party_id, expected_state_versions, carrier_local = null }) {
    if (!text(party_id) || !Array.isArray(expected_state_versions)) return null;
    const expectations = expected_state_versions.map(placementExpectation);
    if (expectations.some((entry) => !entry)) return null;

    const rootProbe = carrier_local?.root_travel_state_id
      ? await query.query("SELECT t.id,t.route_plan_execution_id,t.movement_carrier_ref FROM party_runtime.traveller_travel_states t WHERE t.party_id=$1 AND t.id=$2", [party_id, carrier_local.root_travel_state_id])
      : { rows: [] };
    const discoveredRoot = rootProbe.rows[0];
    const root = discoveredRoot && discoveredRoot.route_plan_execution_id === carrier_local?.root_execution_id && discoveredRoot.movement_carrier_ref?.entity_kind === 'transport' && text(discoveredRoot.movement_carrier_ref?.entity_id)
      ? discoveredRoot
      : null;
    const placements = await query.query('SELECT party_id,entity_kind,entity_id,placement_kind,position_node_id,host_entity_ref,occupies_capacity_units,state_version,updated_change_set_id FROM party_runtime.entity_placements WHERE party_id=$1 ORDER BY entity_kind,entity_id', [party_id]);
    const controls = await query.query('SELECT party_id,entity_kind,entity_id,owner_ref,holder_ref,controller_ref,access_profile_ref,capacity_units,state_version,updated_change_set_id FROM party_runtime.party_entity_controls WHERE party_id=$1 ORDER BY entity_kind,entity_id', [party_id]);
    const schedules = await query.query("SELECT npc_id,current_position_node_id,schedule_profile_ref,dependency_pins,causal_state_ref FROM party_runtime.party_npc_spatial_schedules WHERE party_id=$1 AND status='active' ORDER BY npc_id", [party_id]);
    const positions = await query.query("SELECT id,capacity,access_class_id FROM party_runtime.scene_position_nodes WHERE party_id=$1 AND status='active' ORDER BY id", [party_id]);
    const attached = await query.query("SELECT a.transport_id,a.g6_instance_id,a.approved_template_ref,g.source_scene_template_ref FROM party_runtime.party_transport_attached_g6 a JOIN party_runtime.party_g6_instances g ON g.id=a.g6_instance_id WHERE a.party_id=$1 AND a.status='active' ORDER BY a.transport_id,a.g6_instance_id", [party_id]);
    const attachments = await query.query("SELECT subject_kind,subject_id,carrier_kind,carrier_id FROM party_runtime.party_carrier_attachments WHERE party_id=$1 AND status='active' ORDER BY subject_kind,subject_id,carrier_kind,carrier_id", [party_id]);
    const carrierPositions = await query.query("SELECT actor_id,root_carrier_kind,root_carrier_id,position_node_id FROM party_runtime.party_actor_carrier_positions WHERE party_id=$1 AND status='active' ORDER BY actor_id", [party_id]);
    const slices = carrier_local?.slice_id
      ? await query.query("SELECT s.id,s.root_execution_id,s.root_travel_state_id,s.change_set_id,e.state_version AS root_execution_state_version,t.state_version AS root_travel_state_version,c.write_plan_digest, r.result_kind AS root_result_kind,e.journey_scope AS root_journey_scope,e.journey_owner_ref,t.movement_carrier_ref,t.status AS root_travel_status FROM party_runtime.party_synchronized_time_slices s JOIN party_runtime.party_route_plan_executions e ON e.id=s.root_execution_id JOIN party_runtime.traveller_travel_states t ON t.id=s.root_travel_state_id JOIN party_runtime.party_v3_change_sets c ON c.id=s.change_set_id LEFT JOIN party_runtime.party_synchronized_time_slice_results r ON r.slice_id=s.id AND r.participant_execution_id=s.root_execution_id WHERE s.party_id=$1 AND s.id=$2 ORDER BY s.id", [party_id, carrier_local.slice_id])
      : { rows: [] };
    const controlRows = controls.rows.map((row) => Object.freeze({ entity_ref: ref(row.entity_kind, row.entity_id), owner_ref: row.owner_ref, holder_ref: row.holder_ref, controller_ref: row.controller_ref, access_profile_ref: row.access_profile_ref, capacity_units: row.capacity_units }));
    const scheduleRows = schedules.rows.map((row) => Object.freeze({ npc_ref: ref('npc', row.npc_id), active: true, current_endpoint_ref: Object.freeze({ endpoint_kind: 'scene_position', endpoint_id: row.current_position_node_id }), schedule_profile_ref: row.schedule_profile_ref, dependency_pins: row.dependency_pins, causal_state_ref: row.causal_state_ref }));
    let carrier = null;
    if (attached.rows.length) {
      const row = attached.rows[0]; const chain = attachments.rows.filter((edge) => edge.carrier_kind === 'transport' && edge.carrier_id === row.transport_id).map((edge) => Object.freeze({ subject_ref: ref(edge.subject_kind, edge.subject_id), carrier_ref: ref(edge.carrier_kind, edge.carrier_id) }));
      const actorPosition = carrierPositions.rows.find((item) => item.root_carrier_kind === 'transport' && item.root_carrier_id === row.transport_id);
      carrier = Object.freeze({ transport_ref: ref('transport', row.transport_id), approved_attached_scene_template_ref: row.approved_template_ref, bound_attached_g6: Object.freeze({ id: row.g6_instance_id, template_ref: row.source_scene_template_ref }), active_attachment_chain: chain, actor_carrier_position: actorPosition ? Object.freeze({ actor_ref: ref('actor', actorPosition.actor_id), root_carrier_ref: ref(actorPosition.root_carrier_kind, actorPosition.root_carrier_id), local_position_node_id: actorPosition.position_node_id }) : null });
    }
    const slice = slices.rows[0] ? Object.freeze({ ...slices.rows[0], root_execution_state_version: version(slices.rows[0].root_execution_state_version), root_travel_state_version: version(slices.rows[0].root_travel_state_version) }) : null;
    const lockedPlacements = placements.rows.map(placement);
    const expected_state_versions_valid = expectations.every((expected) => lockedPlacements.some((row) => row.entity_ref.entity_kind === expected.entity_kind && row.entity_ref.entity_id === expected.entity_id && row.state_version === expected.state_version));
    return Object.freeze({ party_id, placements: lockedPlacements, controls: controlRows, npc_schedules: scheduleRows, active_route_endpoint_ids: positions.rows.map((row) => row.id), position_capacities: positions.rows.map((row) => Object.freeze({ id: row.id, capacity: row.capacity, access_class_id: row.access_class_id })), carrier, synchronized_slice: slice, expected_state_versions_valid });
  }

  return Object.freeze({
    loadSnapshot: (input) => loadSnapshot(pool, input),
    recheck: async ({ transaction, request }) => {
      const snapshot = await loadSnapshot(transaction, request);
      return Object.freeze({ ok: snapshot?.expected_state_versions_valid !== false, snapshot });
    }
  });
}
