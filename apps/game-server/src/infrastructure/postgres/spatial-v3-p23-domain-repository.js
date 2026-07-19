const text = (value) => typeof value === 'string' && value.trim();
const fail = (code, reason) => Object.freeze({ ok: false, error: Object.freeze({ code, reason }) });
const ref = (entity_kind, entity_id) => Object.freeze({ entity_kind, entity_id });
const version = (value) => Number(value);
const DOMAIN_ENTITY_KINDS = new Set(['actor', 'cohort', 'transport']);
const PLACEMENT_ENTITY_KINDS = new Set(['npc', 'item', 'container', 'property', 'transport', 'actor', 'cohort']);

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

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

/**
 * Target-only P23 repository port.  The domain service owns semantic validation;
 * this adapter owns only a single disposable-DB transaction, locks and exact CAS.
 */
export function createSpatialV3P23DomainRepository({ pool } = {}) {
  if (!pool?.connect) throw new TypeError('P23 PostgreSQL repository requires a pg pool');

  async function withTransaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      // A rejected domain snapshot must never leave a leased idempotency row.
      if (!result?.ok) { await client.query('ROLLBACK'); return result; }
      await client.query('COMMIT');
      return result;
    } catch (cause) {
      await client.query('ROLLBACK').catch(() => {});
      return fail('state_version_conflict', cause?.message ?? 'transaction failed');
    } finally { client.release(); }
  }

  async function acquireIdempotency(client, { party_id, key, digest }) {
    if (![party_id, key, digest].every(text)) return fail('generated_schema_mismatch', 'sealed idempotency input is required');
    // §13.1 phase 6: this function is deliberately called only after every
    // party/root/execution/endpoint lock was acquired by loadForUpdate().
    const existing = await client.query("SELECT canonical_input_digest,status,result_change_set_id FROM party_runtime.party_command_idempotency WHERE party_id=$1 AND operation_kind='p23_placement' AND idempotency_key=$2 ORDER BY id FOR UPDATE", [party_id, key]);
    if (existing.rows.length) {
      const row = existing.rows[0];
      if (row.canonical_input_digest !== digest) return fail('idempotency_conflict', 'same idempotency key has another digest');
      if (row.status === 'committed') return Object.freeze({ ok: true, replay: true, change_set_id: row.result_change_set_id });
      return fail('idempotency_conflict', 'idempotency command is already leased');
    }
    const id = `p23-idem:${party_id}:${key}`;
    await client.query("INSERT INTO party_runtime.party_command_idempotency(id,party_id,operation_kind,idempotency_key,canonical_input_digest,expected_state_version_set_digest,status,lease_token,lease_expires_at,created_at_turn) VALUES($1,$2,'p23_placement',$3,$4,$4,'leased',$5,now()+interval '30 seconds',0)", [id, party_id, key, digest, `p23-lease:${digest}`]);
    return Object.freeze({ ok: true, id });
  }

  async function loadForUpdate(client, { party_id, expected_state_versions, carrier_local = null }) {
    if (!text(party_id) || !Array.isArray(expected_state_versions)) return null;
    const expectations = expected_state_versions.map(placementExpectation);
    if (expectations.some((entry) => !entry)) return null;

    // §13.1 phase 1: one party clock precedes every other mutable resource.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`01:party_clock:${party_id}`]);
    await client.query('SELECT party_id FROM party_runtime.party_clocks WHERE party_id=$1 FOR UPDATE', [party_id]);

    // Read-only discovery is intentionally before locks: it merely identifies
    // the typed root keys; all discovered rows are locked and rechecked below.
    const rootProbe = carrier_local?.root_travel_state_id
      ? await client.query("SELECT t.id,t.route_plan_execution_id,t.movement_carrier_ref FROM party_runtime.traveller_travel_states t WHERE t.party_id=$1 AND t.id=$2", [party_id, carrier_local.root_travel_state_id])
      : { rows: [] };
    const discoveredRoot = rootProbe.rows[0];
    // An absent/forged root is validated fail-closed by the sealed slice check
    // below; it must not turn into an arbitrary lock key.
    const root = discoveredRoot && discoveredRoot.route_plan_execution_id === carrier_local?.root_execution_id && discoveredRoot.movement_carrier_ref?.entity_kind === 'transport' && text(discoveredRoot.movement_carrier_ref?.entity_id)
      ? discoveredRoot
      : null;
    const attachmentProbe = await client.query("SELECT subject_kind,subject_id,carrier_kind,carrier_id FROM party_runtime.party_carrier_attachments WHERE party_id=$1 AND status='active' ORDER BY subject_kind,subject_id,carrier_kind,carrier_id", [party_id]);
    const typedKeys = [
      ...expectations.filter((entry) => DOMAIN_ENTITY_KINDS.has(entry.entity_kind)).map((entry) => `${entry.entity_kind}:${entry.entity_id}`),
      ...(root ? [`transport:${root.movement_carrier_ref.entity_id}`] : []),
      ...attachmentProbe.rows.flatMap((edge) => [
        DOMAIN_ENTITY_KINDS.has(edge.subject_kind) ? `${edge.subject_kind}:${edge.subject_id}` : null,
        DOMAIN_ENTITY_KINDS.has(edge.carrier_kind) ? `${edge.carrier_kind}:${edge.carrier_id}` : null
      ].filter(Boolean))
    ];
    // §13.1 phase 2: typed actor/cohort/transport keys, lexically sorted.
    for (const key of sortedUnique(typedKeys)) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`02:owner:${party_id}:${key}`]);
    // §13.1 phase 3: only after owner/root keys are fixed.
    if (root) {
      for (const key of sortedUnique([`execution:${root.route_plan_execution_id}`, `travel:${root.id}`])) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`03:${party_id}:${key}`]);
    }

    const endpointProbe = await client.query("SELECT id FROM party_runtime.scene_position_nodes WHERE party_id=$1 AND status='active' ORDER BY id", [party_id]);
    const endpointKeys = sortedUnique(endpointProbe.rows.map((row) => `endpoint:${row.id}`));
    const placementKeys = sortedUnique(expectations.filter((entry) => !DOMAIN_ENTITY_KINDS.has(entry.entity_kind)).map((entry) => `placement:${entry.entity_kind}:${entry.entity_id}`));
    // P23 has no mutable G4 row; phase 4 is therefore empty.  Phase 5 locks
    // exact scene/placement endpoints after all roots and travel rows.
    for (const key of sortedUnique([...endpointKeys, ...placementKeys])) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`05:${party_id}:${key}`]);

    // A single pg client serializes statements. ORDER BY makes physical row
    // acquisition deterministic even when PostgreSQL changes its scan plan.
    const placements = await client.query('SELECT party_id,entity_kind,entity_id,placement_kind,position_node_id,host_entity_ref,occupies_capacity_units,state_version,updated_change_set_id FROM party_runtime.entity_placements WHERE party_id=$1 ORDER BY entity_kind,entity_id FOR UPDATE', [party_id]);
    const controls = await client.query('SELECT party_id,entity_kind,entity_id,owner_ref,holder_ref,controller_ref,access_profile_ref,capacity_units,state_version,updated_change_set_id FROM party_runtime.party_entity_controls WHERE party_id=$1 ORDER BY entity_kind,entity_id FOR UPDATE', [party_id]);
    const schedules = await client.query("SELECT npc_id,current_position_node_id,schedule_profile_ref,dependency_pins,causal_state_ref FROM party_runtime.party_npc_spatial_schedules WHERE party_id=$1 AND status='active' ORDER BY npc_id FOR UPDATE", [party_id]);
    const positions = await client.query("SELECT id,capacity,access_class_id FROM party_runtime.scene_position_nodes WHERE party_id=$1 AND status='active' ORDER BY id FOR UPDATE", [party_id]);
    const attached = await client.query("SELECT a.transport_id,a.g6_instance_id,a.approved_template_ref,g.source_scene_template_ref FROM party_runtime.party_transport_attached_g6 a JOIN party_runtime.party_g6_instances g ON g.id=a.g6_instance_id WHERE a.party_id=$1 AND a.status='active' ORDER BY a.transport_id,a.g6_instance_id FOR UPDATE", [party_id]);
    const attachments = await client.query("SELECT subject_kind,subject_id,carrier_kind,carrier_id FROM party_runtime.party_carrier_attachments WHERE party_id=$1 AND status='active' ORDER BY subject_kind,subject_id,carrier_kind,carrier_id FOR UPDATE", [party_id]);
    const carrierPositions = await client.query("SELECT actor_id,root_carrier_kind,root_carrier_id,position_node_id FROM party_runtime.party_actor_carrier_positions WHERE party_id=$1 AND status='active' ORDER BY actor_id FOR UPDATE", [party_id]);
    const slices = carrier_local?.slice_id
      ? await client.query("SELECT s.id,s.root_execution_id,s.root_travel_state_id,s.change_set_id,e.state_version AS root_execution_state_version,t.state_version AS root_travel_state_version,c.write_plan_digest, r.result_kind AS root_result_kind,e.journey_scope AS root_journey_scope,e.journey_owner_ref,t.movement_carrier_ref,t.status AS root_travel_status FROM party_runtime.party_synchronized_time_slices s JOIN party_runtime.party_route_plan_executions e ON e.id=s.root_execution_id JOIN party_runtime.traveller_travel_states t ON t.id=s.root_travel_state_id JOIN party_runtime.party_v3_change_sets c ON c.id=s.change_set_id LEFT JOIN party_runtime.party_synchronized_time_slice_results r ON r.slice_id=s.id AND r.participant_execution_id=s.root_execution_id WHERE s.party_id=$1 AND s.id=$2 ORDER BY s.id FOR UPDATE OF s,e,t,c", [party_id, carrier_local.slice_id])
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

  async function applyAtomically(client, { request, snapshot }) {
    const mutation = request?.domain_mutation;
    if (!mutation || !text(mutation.entity_kind) || !text(mutation.entity_id) || !text(mutation.placement_kind) || !text(mutation.position_node_id) || !Number.isInteger(mutation.capacity_units) || mutation.capacity_units < 0) return fail('generated_schema_mismatch', 'exact domain_mutation placement is required');
    const expected = request.expected_state_versions.find((item) => item.resource === 'entity_placements' && item.id === `${mutation.entity_kind}:${mutation.entity_id}`);
    if (!expected) return fail('state_version_conflict', 'placement CAS expectation is missing');
    const target = snapshot.placements.find((item) => item.entity_ref.entity_kind === mutation.entity_kind && item.entity_ref.entity_id === mutation.entity_id);
    if (!target || target.state_version !== expected.state_version) return fail('state_version_conflict', 'locked placement differs from expected version');
    const change_set_id = `p23:${request.party_id}:${request.canonical_digest}`;
    const changed = await client.query("UPDATE party_runtime.entity_placements SET placement_kind=$1,position_node_id=$2,host_entity_ref=NULL,occupies_capacity_units=$3,state_version=state_version+1,updated_change_set_id=$4 WHERE party_id=$5 AND entity_kind=$6 AND entity_id=$7 AND state_version=$8", [mutation.placement_kind, mutation.position_node_id, mutation.capacity_units, change_set_id, request.party_id, mutation.entity_kind, mutation.entity_id, expected.state_version]);
    if (changed.rowCount !== 1) return fail('state_version_conflict', 'placement changed concurrently');
    await client.query('INSERT INTO party_runtime.party_v3_change_sets(id,party_id,operation_kind,expected_state_version_set_digest,expected_state_version_set,committed_state_version_set_digest,write_plan_digest,created_at_turn,committed_at_turn) VALUES($1,$2,$3,$4,$5,$4,$4,0,0)', [change_set_id, request.party_id, 'p23_placement', request.canonical_digest, JSON.stringify(request.expected_state_versions)]);
    return Object.freeze({ ok: true, change_set_id });
  }

  async function completeIdempotency(client, { party_id, key, digest, change_set_id }) {
    const result = await client.query("UPDATE party_runtime.party_command_idempotency SET status='committed',result_change_set_id=$1,lease_token=NULL,lease_expires_at=NULL,finalized_at_turn=0,state_version=state_version+1 WHERE party_id=$2 AND operation_kind='p23_placement' AND idempotency_key=$3 AND canonical_input_digest=$4 AND status='leased'", [change_set_id, party_id, key, digest]);
    return result.rowCount === 1 ? Object.freeze({ ok: true }) : fail('idempotency_conflict', 'idempotency completion CAS failed');
  }

  return Object.freeze({ withTransaction, acquireIdempotency, loadForUpdate, applyAtomically, completeIdempotency });
}
