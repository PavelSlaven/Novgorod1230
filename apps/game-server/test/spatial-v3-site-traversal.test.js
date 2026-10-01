import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3SiteTraversalRuntime } from
  '../src/runtime/spatial-v3-site-traversal-runtime.js';
import { applySiteTraversalTransition, siteTraversalWrites } from
  '../src/infrastructure/postgres/spatial-v3-site-traversal-commit.js';
import { applyS1LocalPositionTransition } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-commit-projections.js';
import { createSpatialV3CurrentMovementCapability } from
  '../src/infrastructure/postgres/spatial-v3-current-movement-capability.js';
import { recheckSiteConnectionTraversal } from
  '../src/infrastructure/postgres/first-playable/recheck-site-connection-traversal.js';
import { createSpatialV3ExecutionEngine } from '@rus/turn/spatial-v3-execution';

const party_id = 'party';
const rational = (numerator, denominator = '1') => ({ numerator, denominator });
const seal = (payload) => ({ ...payload, canonical_digest: digest(payload) });
const active = (id, extra = {}) => ({ id, party_id, status: 'active', state_version: 1, ...extra });
const versioned = (entity_id) => ({ entity_id, authoring_version: '1' });
const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'За проходом видна новая поляна.',
  visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
  known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] };
const capabilityPins = [{ dependency_role: 'source_authoring',
  entity_ref: { entity_kind: 'world_revision', entity_id: 'revision' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: 'revision', state_version: null } }];
const capability = { cohort_membership_snapshot_pin: null, load_state_pin: null,
  root_carrier_attachment_pins: null, allowed_movement_methods: ['movement.walk'],
  available_transport_pins: null, equipment_state_pins: null, legal_access_fact_pins: null,
  allowed_pace_modes: [], dependency_pins: {
    pins: capabilityPins, canonical_digest: digest(capabilityPins).slice(7) } };
capability.canonical_digest = digest(capability);
const connection = active('connection', { from_site_id: 'site:source', to_site_id: 'site:target',
  passage_type_id: 'passage.local', cost_kind: 'time', action_units: null, base_minutes: 20,
  capacity: null, portal_entity_id: null,
  line_kind_id: 'line.path', line_kind_profile_ref: versioned('line.path'),
  line_name: 'лесной тропой', line_discriminator: null, line_direction_id: 'outbound',
  baseline_movement_method_id: 'movement.walk',
  movement_method_cost_profile_ref: versioned('method-cost'), dynamic_recheck_policy_ref: versioned('recheck'),
  source_canonical_connection_ref: versioned('canonical-connection'),
  transition_environment_profile_ref: versioned('env'),
  movement_orientation_profile_ref: versioned('orientation'),
  availability_condition_set_ref: versioned('availability.local_state_conditional') });
const profile = { id: 'profile', version: 1, status: 'approved', profile_scope: 'site_connection',
  passage_type_id: 'passage.local', cost_kind: 'time', action_units: null, base_minutes: 20,
  line_kind_id: 'line.path', line_kind_profile_id: 'line.path', line_kind_profile_version: 1,
  movement_method_cost_profile_id: 'method-cost', movement_method_cost_profile_version: 1,
  dynamic_recheck_policy_id: 'recheck', dynamic_recheck_policy_version: 1,
  transition_environment_profile_id: 'env', transition_environment_profile_version: 1,
  movement_orientation_profile_id: 'orientation', movement_orientation_profile_version: 1,
  availability_condition_set_ref: 'availability.local_state_conditional@1',
  capacity_semantics_ref: 'capacity.no_static_limit@1', canonical_digest: 'profile-digest' };
const sites = [active('site:source', { parent_g4_id: 'g4' }),
  active('site:target', { parent_g4_id: 'g4' })];
const baselines = [active('baseline:source', { host_kind: 'g5_site', host_id: 'site:source' }),
  active('baseline:target', { host_kind: 'g5_site', host_id: 'site:target' })];
const g6 = [active('g6:source', { scene_baseline_id: 'baseline:source', host_kind: 'g5_site', host_id: 'site:source' }),
  active('g6:target', { scene_baseline_id: 'baseline:target', host_kind: 'g5_site', host_id: 'site:target' })];
const positions = [active('position:source', { g6_instance_id: 'g6:source', capacity: 4 }),
  active('position:target', { g6_instance_id: 'g6:target', capacity: 4 })];
const endpoints = [active('endpoint:from', { site_connection_id: connection.id,
  endpoint_role: 'from', g5_site_id: 'site:source', position_id: 'position:source' }),
active('endpoint:to', { site_connection_id: connection.id,
  endpoint_role: 'to', g5_site_id: 'site:target', position_id: 'position:target' })];
const location = { id: 'journey', party_id, owner_kind: 'actor', owner_id: 'actor',
  location_kind: 'scene', scene_position_id: 'position:source', state_version: 1 };
const context = { partyId: party_id, actorId: 'actor', world_revision_id: 'revision',
  world_catalog_digest: 'catalog', location, position: positions[0], site: sites[0],
  baseline: baselines[0], closure: { connection_profiles: [profile] },
  snapshot: { sites, scene_baselines: baselines, g6_instances: g6,
    scene_positions: positions, endpoint_bindings: endpoints,
    line_bindings: [{ site_connection_id: 'connection', authoring_version: 3,
      canonical_digest: 'line-digest', line_name: 'лесной тропой', line_discriminator: null,
      line_kind_profile_ref: 'line.path@1', base_minutes: 20,
      movement_method_id: 'movement.walk', method_factor: rational('1'),
      movement_method_options: [{ movement_method_id: 'movement.walk', factor: rational('1') }],
      dynamic_recheck_policy: { id: 'recheck', version: 1, policy_kind: 'fixed_time_interval', interval_minutes: 15 },
      environment_factor: rational('1') }] } };
const state = { party_id, actor_id: 'actor', party_state: { state_version: 1, turn_number: 0 },
  clock: { whole_minutes: '120', subminute_numerator: '0', subminute_denominator: '1' },
  position: { position_id: 'position:source', g4_id: 'g4' },
  journey_location: { id: 'journey', scene_position_id: 'position:source', state_version: 1 } };

function recheckRow(sourceConnection = connection) {
  const row = { scene_position_id: 'position:source', location_kind: 'scene', journey_version: 1,
    from_site_id: 'site:source', to_site_id: 'site:target', connection_status: 'active',
    connection_version: 1, cost_kind: 'time', action_units: null, base_minutes: sourceConnection.base_minutes,
    line_kind_id: sourceConnection.line_kind_id, line_kind_profile_ref: sourceConnection.line_kind_profile_ref,
    line_name: sourceConnection.line_name, line_discriminator: sourceConnection.line_discriminator,
    line_direction_id: sourceConnection.line_direction_id,
    baseline_movement_method_id: sourceConnection.baseline_movement_method_id,
    movement_method_cost_profile_ref: sourceConnection.movement_method_cost_profile_ref,
    transition_environment_profile_ref: sourceConnection.transition_environment_profile_ref,
    movement_orientation_profile_ref: sourceConnection.movement_orientation_profile_ref,
    dynamic_recheck_policy_ref: sourceConnection.dynamic_recheck_policy_ref,
    connection_capacity: null, portal_entity_id: null,
    from_position: 'position:source', from_site: 'site:source', from_binding_status: 'active', from_binding_version: 1,
    to_position: 'position:target', to_site: 'site:target', to_binding_status: 'active', to_binding_version: 1,
    source_position_status: 'active', source_position_version: 1, destination_position_status: 'active', destination_position_version: 1,
    destination_capacity: 4, source_g6_status: 'active', source_g6_version: 1,
    destination_g6_status: 'active', destination_g6_version: 1, destination_g6_id: 'g6:target',
    source_baseline_status: 'active', source_baseline_version: 1,
    destination_baseline_status: 'active', destination_baseline_version: 1, destination_baseline_id: 'baseline:target',
    source_site_status: 'active', source_site_version: 1,
    destination_site_status: 'active', destination_site_version: 1, destination_g4_id: 'g4' };
  for (const field of ['availability_condition_set_ref']) row[field] = sourceConnection[field] ?? null;
  return row;
}

for (const conditionRef of [connection.availability_condition_set_ref, null]) test(
  `approved site connection prepares P18/P19 and P16 with ${conditionRef ? 'conditional' : 'unconditional'} availability`, async () => {
  const localConnection = { ...connection, availability_condition_set_ref: conditionRef };
  const localProfile = { ...profile, availability_condition_set_ref: conditionRef == null
    ? null : profile.availability_condition_set_ref };
  const localContext = { ...context, closure: { connection_profiles: [localProfile] } };
  const current = { scene_position_id: 'position:source', location_kind: 'scene',
    journey_version: 1, from_site_id: 'site:source', to_site_id: 'site:target',
    connection_status: 'active', connection_version: 1, cost_kind: 'time',
    action_units: null, base_minutes: 20, line_kind_id: 'line.path',
    line_kind_profile_ref: connection.line_kind_profile_ref,
    line_name: 'лесной тропой', line_discriminator: null, line_direction_id: 'outbound',
    baseline_movement_method_id: 'movement.walk',
    movement_method_cost_profile_ref: connection.movement_method_cost_profile_ref,
    transition_environment_profile_ref: connection.transition_environment_profile_ref,
    movement_orientation_profile_ref: connection.movement_orientation_profile_ref,
    dynamic_recheck_policy_ref: connection.dynamic_recheck_policy_ref,
    connection_capacity: null,
    portal_entity_id: null, availability_condition_set_ref: conditionRef,
    from_position: 'position:source', from_site: 'site:source',
    from_binding_status: 'active', from_binding_version: 1,
    to_position: 'position:target', to_site: 'site:target',
    to_binding_status: 'active', to_binding_version: 1,
    destination_g4_id: 'g4', destination_g6_id: 'g6:target',
    destination_baseline_id: 'baseline:target', destination_capacity: 4 };
  for (const prefix of ['source_position', 'destination_position', 'source_g6',
    'destination_g6', 'source_baseline', 'destination_baseline', 'source_site',
    'destination_site']) {
    current[`${prefix}_status`] = 'active';
    current[`${prefix}_version`] = 1;
  }
  let environmentProjection = { effects: { movement_factor: rational('1') } };
  const prepare = createSpatialV3SiteTraversalRuntime({ pool: { query: async (sql) =>
    ({ rowCount: 1, rows: [sql.includes('FOR UPDATE OF l,c') ? current : { units: 0 }] }) },
  assessAvailability: async () => ({ ok: true, status: 'open', connection_id: 'connection',
    condition_set_ref: conditionRef == null ? null : `${conditionRef.entity_id}@${conditionRef.authoring_version}` }),
  assessMovementCapability: async () => ({ ok: true, actor_id: 'actor',
    capability_context: capability }),
  projectEnvironmentAtClock: () => environmentProjection,
  projectDestination: async () => ({ ok: true, position_id: 'position:target',
    site_id: 'site:target', visible_context: visible }) });
  const consequence = await prepare({ partyId: party_id, actorId: 'actor',
    requestId: 'request', state, playerInput: { idempotency_key: 'idem' },
    inputDigest: 'input', context: localContext, connection: localConnection });
  environmentProjection = { effects: {} };
  await assert.rejects(prepare({ partyId: party_id, actorId: 'actor',
    requestId: 'request', state, playerInput: { idempotency_key: 'missing-environment' },
    inputDigest: 'missing-environment', context: localContext, connection: localConnection }),
  (error) => error.code === 'SPATIAL_V3_SITE_TRAVERSAL_DATA_GAP'
    && error.details.reason === 'current_environment_factor_missing');
  assert.equal(consequence.duration_minutes, 20);
  assert.equal(consequence.spatial_v3_traversal.result.result_kind, 'segment_completed');
  assert.equal(consequence.position_transition.to_position_ref, 'position:target');
  const snapshot = structuredClone(state);
  applyS1LocalPositionTransition({ snapshot, state,
    transition: consequence.position_transition });
  assert.equal(applySiteTraversalTransition({ snapshot, state, consequence }), true);
  assert.deepEqual(snapshot.position, { g4_id: 'g4', site_id: 'site:target',
    g6_instance_id: 'g6:target', position_id: 'position:target' });
  const written = siteTraversalWrites({ partyId: party_id,
    envelope: { consequence }, changeSetId: 'change:party:turn-step:1',
    idemId: consequence.spatial_v3_traversal.result.idempotency_record_id,
    turnNumber: 1 });
  assert.deepEqual(written.writes.inserts.map((write) => write.target_table),
    ['party_route_plans', 'party_route_plan_steps', 'party_route_plan_executions', 'traveller_travel_states']);
  const completedExecution = written.writes.inserts.find((write) =>
    write.target_table === 'party_route_plan_executions').record;
  assert.equal(completedExecution.status, 'completed');
  assert.equal(completedExecution.current_step_ordinal, null);
  assert.deepEqual(written.writes.appends.map((write) => write.target_table),
    [...Array(consequence.spatial_v3_traversal.traversal_intervals.length).fill('party_traversal_interval_results'),
      'party_route_plan_execution_events', 'party_route_plan_execution_events',
      ...Array(consequence.spatial_v3_traversal.traversal_intervals.length).fill('party_route_plan_execution_events')]);
  assert.equal(written.writes.appends.filter((write) => write.target_table === 'party_traversal_interval_results')
    .every((write) => write.record.travel_state_id === 'site-travel:' + digest({
      partyId: party_id, inputDigest: 'input', connection_id: 'connection',
      local_edge_path: [] }).slice(7)), true);
  assert.equal(written.rechecks[0].kind, 'site_connection_traversal');
  assert.deepEqual(consequence.position_transition.availability_condition_set_ref, conditionRef);

  const returned = structuredClone(consequence);
  const traversal = returned.spatial_v3_traversal;
  const last = traversal.traversal_intervals.at(-1);
  last.result = { ...last.result, result_kind: 'returned_to_departure' };
  traversal.result = last.result;
  traversal.final_travel_state = { ...traversal.final_travel_state,
    status: 'closed', closed_result: 'returned_to_departure', mirrored: true };
  const returnedWrites = siteTraversalWrites({ partyId: party_id,
    envelope: { consequence: returned }, changeSetId: 'change:party:turn-step:1',
    idemId: last.result.idempotency_record_id, turnNumber: 1 });
  const returnedExecution = returnedWrites.writes.inserts.find((write) =>
    write.target_table === 'party_route_plan_executions').record;
  assert.equal(returnedExecution.status, 'waiting_at_anchor');
  assert.equal(returnedExecution.current_step_ordinal, 0);
  assert.equal(returnedExecution.terminal_at_turn, null);
  assert.equal(returnedExecution.final_location_snapshot, null);
  assert.equal(returnedExecution.active_travel_state_id, null);
  const returnedEvents = returnedWrites.writes.appends.filter((write) =>
    write.target_table === 'party_route_plan_execution_events');
  assert.equal(returnedEvents.at(-1).record.event_kind, 'wait_started');
});

test('a line the evaluator does not call open is refused at admission, whatever else it answers', async () => {
  const prepare = (status) => createSpatialV3SiteTraversalRuntime({
    pool: { query: async () => ({ rowCount: 1, rows: [{ units: 0 }] }) },
    assessAvailability: async () => ({ ok: true, status, connection_id: connection.id,
      condition_set_ref: profile.availability_condition_set_ref }),
    assessMovementCapability: async () => ({ ok: true, actor_id: 'actor', capability_context: capability }),
    projectDestination: async () => ({ ok: true, position_id: 'position:target', site_id: 'site:target', visible_context: visible })
  })({ partyId: party_id, actorId: 'actor', requestId: 'request', state, playerInput: { idempotency_key: 'idem' },
    inputDigest: 'input', context, connection });
  for (const status of ['closed', 'open_with_requirement', undefined]) {
    await assert.rejects(prepare(status), (error) => error.code === 'SPATIAL_V3_SITE_TRAVERSAL_DATA_GAP'
      && error.details.reason === 'site_traversal_availability_denied', String(status));
  }
});

test('availability and destination projection owner are required before movement', async () => {
  const input = { partyId: party_id, actorId: 'actor', requestId: 'request', state,
    playerInput: { idempotency_key: 'idem' }, inputDigest: 'input', context, connection };
  await assert.rejects(createSpatialV3SiteTraversalRuntime({ pool: { query() {} } })(input),
    { code: 'SPATIAL_V3_SITE_TRAVERSAL_DATA_GAP' });
  const commitCheck = await recheckSiteConnectionTraversal({ transaction: { query() {} },
    partyId: party_id, check: { party_id } });
  assert.equal(commitCheck.ok, false);
});

test('approved local line traverses one timed step with exact D49 rational factors', async () => {
  const localConnection = { ...connection, cost_kind: 'time', action_units: null,
    base_minutes: 20, line_name: 'лесной тропой', line_discriminator: null,
    line_kind_profile_ref: versioned('line.path') };
  const localProfile = { ...profile, cost_kind: 'time', action_units: null,
    base_minutes: 20, line_kind_profile_ref: 'line.path@1' };
  const localContext = { ...context, closure: { connection_profiles: [localProfile] },
    snapshot: { ...context.snapshot, line_bindings: [{ site_connection_id: 'connection',
      authoring_version: 3, line_name: 'лесной тропой', line_discriminator: null,
      line_kind_profile_ref: 'line.path@1', base_minutes: 20,
      movement_method_id: 'movement.walk', method_factor: { numerator: '3', denominator: '2' },
      environment_factor: { numerator: '3', denominator: '1' },
      dynamic_recheck_policy: { id: 'recheck', version: 1,
        policy_kind: 'fixed_time_interval', interval_minutes: 15 } }] } };
  const prepare = createSpatialV3SiteTraversalRuntime({
    pool: { query: async (sql) => ({ rowCount: 1, rows: [sql.includes('FOR UPDATE OF l,c')
      ? recheckRow(localConnection)
      : { units: 0 }] }) },
    assessAvailability: async () => ({ ok: true, status: 'open', connection_id: 'connection',
      condition_set_ref: localProfile.availability_condition_set_ref }),
    assessMovementCapability: async () => ({ ok: true, actor_id: 'actor', capability_context: capability }),
    projectEnvironmentAtClock: () => ({ effects: { movement_factor: rational('3') } }),
    projectDestination: async () => ({ ok: true, position_id: 'position:target',
      site_id: 'site:target', visible_context: visible })
  });
  const consequence = await prepare({ partyId: party_id, actorId: 'actor', requestId: 'line-request',
    state, playerInput: { idempotency_key: 'line-idem' }, inputDigest: 'line-input',
    context: localContext, connection: localConnection });
  assert.equal(consequence.duration_minutes, 90, '20 × 3/2 method × 3/1 single worst environment factor');
  assert.equal(consequence.spatial_v3_traversal.plan.steps[0].step_kind, 'timed_traversal');
  assert.deepEqual(consequence.spatial_v3_traversal.clock_update.actual_elapsed,
    { numerator: '90', denominator: '1' });
  assert.equal(consequence.spatial_v3_traversal.traversal_intervals.length, 6);
  assert.ok(consequence.spatial_v3_traversal.traversal_intervals.slice(0, -1)
    .every(({ result }) => result.actual_time.numerator === '15'));
  assert.equal(consequence.spatial_v3_traversal.result.result_kind, 'segment_completed');
});

test('hidden local approach and unresolved swim hazard stay one timed line request at the shore', async () => {
  const origin = 'position:source';
  const shore = active('position:shore', { g6_instance_id: 'g6:source', capacity: 4 });
  const localConnection = { ...connection, cost_kind: 'time', action_units: null,
    base_minutes: 20, line_name: 'бродом', line_kind_profile_ref: versioned('line.path') };
  const localEndpoints = endpoints.map((endpoint) => endpoint.endpoint_role === 'from'
    ? { ...endpoint, position_id: shore.id } : endpoint);
  const localContext = { ...context, approach_departure_position: shore,
    snapshot: { ...context.snapshot, scene_positions: [...positions, shore],
      endpoint_bindings: localEndpoints, line_bindings: [{ site_connection_id: 'connection',
        authoring_version: 3, canonical_digest: 'line-swim', line_name: 'бродом',
        line_discriminator: null, line_kind_profile_ref: 'line.path@1', base_minutes: 20,
        movement_method_id: 'movement.walk', method_factor: rational('1'),
        movement_method_options: [{ movement_method_id: 'movement.walk', factor: rational('1') },
          { movement_method_id: 'movement.swim', factor: rational('4') }],
        alternative_methods: [{ movement_method_id: 'movement.swim', risk_class: 'high',
          hazard_rule_ref: 'hazard.swim_river_channel@1' }],
        dynamic_recheck_policy: { id: 'recheck', version: 1,
          policy_kind: 'fixed_time_interval', interval_minutes: 30 },
        environment_factor: rational('1') }] } };
  const approachPath = [{ edge_id: 'local-edge', from_position_id: origin, to_position_id: shore.id,
    movement_admission: { edge_id: 'local-edge', from_position_ref: origin,
      to_position_ref: shore.id, reverse_edge_id: 'local-edge-reverse', cost_kind: 'action',
      action_units: 1, base_minutes: null, edge_capacity: null, edge_state_version: 1,
      reverse_edge_state_version: 1, source_node_state_version: 1,
      destination_node_state_version: 1, destination_capacity: 4,
      transition_environment_profile_ref: null, movement_orientation_profile_ref: null,
      baseline_movement_method_id: null, movement_method_cost_profile_ref: null,
      dynamic_recheck_policy_ref: null, transition_footprint_units: 1,
      destination_status: 'open' } }];
  const swimCapability = { ...capability, allowed_movement_methods: ['movement.swim'] };
  delete swimCapability.canonical_digest;
  swimCapability.canonical_digest = digest(swimCapability);
  const prepare = createSpatialV3SiteTraversalRuntime({
    pool: { query: async (sql) => {
      if (sql.includes('FOR UPDATE OF l,c')) return { rowCount: 1,
        rows: [{ ...recheckRow(localConnection), scene_position_id: origin, from_position: shore.id }] };
      if (sql.includes('jsonb_array_elements')) return { rowCount: 1, rows: [{
        requested_edge_id: 'local-edge', requested_from_position_id: origin,
        requested_to_position_id: shore.id, edge_id: 'local-edge', from_position_id: origin,
        to_position_id: shore.id, edge_status: 'active', edge_state_version: 1,
        cost_kind: 'action', action_units: 1, base_minutes: null, edge_capacity: null,
        reverse_edge_id: 'local-edge-reverse', scene_baseline_id: 'baseline:source',
        reverse_status: 'active', reverse_state_version: 1,
        reverse_from_position_id: shore.id, reverse_to_position_id: origin,
        reverse_reverse_edge_id: 'local-edge', reverse_cost_kind: 'action',
        source_status: 'active', source_state_version: 1, source_g6_status: 'active',
        source_g6_baseline_id: 'baseline:source', destination_status: 'active',
        destination_state_version: 1, destination_capacity: 4,
        destination_g6_status: 'active', destination_g6_baseline_id: 'baseline:source',
        baseline_status: 'active', destination_occupancy: 0,
        transition_environment_profile_ref: null, movement_orientation_profile_ref: null,
        baseline_movement_method_id: null, movement_method_cost_profile_ref: null,
        dynamic_recheck_policy_ref: null }] };
      return { rowCount: 1, rows: [{ units: 0 }] };
    } },
    assessAvailability: async () => ({ ok: true, status: 'open', connection_id: 'connection',
      condition_set_ref: profile.availability_condition_set_ref }),
    assessMovementCapability: async () => ({ ok: true, actor_id: 'actor',
      capability_context: swimCapability }),
    projectEnvironmentAtClock: () => ({ effects: { movement_factor: rational('1') } }),
    projectDestination: async ({ destinationPosition, destinationPositionId }) => {
      const positionId = destinationPosition?.id ?? destinationPositionId;
      return { ok: true, position_id: positionId,
      site_id: positionId === 'position:target' ? 'site:target' : 'site:source',
      visible_context: visible };
    }
  });
  const consequence = await prepare({ partyId: party_id, actorId: 'actor', requestId: 'composite-line',
    state, playerInput: { idempotency_key: 'composite-line-idem' }, inputDigest: 'composite-line-input',
    context: localContext, connection: localConnection, local_edge_path_proofs: approachPath });
  assert.equal(consequence.duration_minutes, 30);
  assert.equal(consequence.position_transition.origin_position_ref, origin);
  assert.equal(consequence.position_transition.from_position_ref, shore.id);
  assert.deepEqual(consequence.position_transition.ordered_local_edge_path, approachPath);
  assert.equal(consequence.spatial_v3_traversal.plan.steps.length, 1);
  assert.equal(consequence.spatial_v3_traversal.result.result_kind, 'interrupted_at_anchor');
  assert.equal(consequence.spatial_v3_traversal.result.actual_time.numerator, '30');
  assert.equal(consequence.spatial_v3_traversal.result.actual_progress_after_ppm, 0);
  assert.equal(consequence.spatial_v3_traversal.final_travel_state.status, 'closed');
  assert.equal(consequence.movement.cost_kind, 'time');
  const projected = structuredClone(state);
  assert.equal(applySiteTraversalTransition({ snapshot: projected, state, consequence }), true);
  assert.equal(projected.position.position_id, shore.id);
  const writes = siteTraversalWrites({ partyId: party_id, envelope: { consequence },
    changeSetId: 'change:party:turn-step:1',
    idemId: consequence.spatial_v3_traversal.result.idempotency_record_id, turnNumber: 1 });
  const execution = writes.writes.inserts.find((row) =>
    row.target_table === 'party_route_plan_executions').record;
  assert.equal(writes.writes.updates.some((row) =>
    row.target_table === 'party_journey_locations'), false);
  const finalEvent = writes.writes.appends.filter((row) =>
    row.target_table === 'party_route_plan_execution_events').at(-1).record;
  assert.equal(execution.status, 'aborted');
  assert.equal(execution.abort_reason_code, 'interrupted_at_anchor');
  assert.equal(execution.current_step_ordinal, null);
  assert.equal(execution.terminal_at_turn, 1);
  assert.equal(execution.final_location_snapshot.resolved_position_id, shore.id);
  assert.equal(finalEvent.event_kind, 'aborted');
  assert.equal(finalEvent.from_status, 'waiting_at_anchor');
  assert.equal(finalEvent.to_status, 'aborted');
});

test('P19 repeated interval idempotency key replays one result, clock update, and append', () => {
  const dependencyPins = seal({ pins: [{ dependency_role: 'traversal',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'revision' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1', state_version: null } }] });
  const contextSnapshot = seal({ context_id: 'context' });
  const travelState = seal({ id: 'travel', party_id: party_id, execution_id: 'execution',
    step_ordinal: 0, next_interval_ordinal: 0, progress_ppm: 0,
    cumulative_actual_time: rational('0'), status: 'active',
    dependency_pins: dependencyPins, context_snapshot: contextSnapshot });
  const dynamicSnapshot = seal({ snapshot_id: 'dynamic', resolved_factors: [], resolved_delays: [] });
  const executionContext = seal({ context_id: 'execution-context' });
  const intervalInput = {
    party_id, execution_id: 'execution', idempotency_key: 'same-line-interval',
    change_set_id: 'change', idempotency_record_id: 'record', occurred_at_turn: 1,
    step_ordinal: 0, interval_ordinal: 0, clock_commit_mode: 'direct_party_clock',
    world_time_before: { whole_minutes: '120', subminute_numerator: '0', subminute_denominator: '1' },
    travel_state: travelState, progress_before_ppm: 0,
    planned_progress_after_ppm: 333_333, actual_progress_after_ppm: 333_333,
    planned_time: rational('30'), actual_time: rational('30'), cumulative_before: rational('0'),
    dynamic_snapshot: dynamicSnapshot, dynamic_dependency_pins: dependencyPins,
    execution_context_snapshot: executionContext,
    delay_occurrence_history: seal({ id: 'delay-history', committed_occurrence_keys: [] }),
    source_signals: seal({ dependency_pins: dependencyPins })
  };
  const engine = createSpatialV3ExecutionEngine();
  const first = engine.resolveTraversalInterval(intervalInput);
  const replay = engine.resolveTraversalInterval(intervalInput);
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.result, first.result);
  assert.deepEqual(replay.clock_update, first.clock_update);
  assert.deepEqual(replay.write_proposal, first.write_proposal);
  assert.equal(first.write_proposal.appends.length, 1);
  assert.equal(replay.write_proposal.appends.length, 1);
  assert.equal(first.clock_update.world_time_after.whole_minutes, '150');
});

test('known movement denial is a player-safe refusal without traversal', async () => {
  const prepare = createSpatialV3SiteTraversalRuntime({
    pool: { query: async () => ({ rowCount: 1, rows: [{ units: 0 }] }) },
    assessAvailability: async () => ({ ok: true, status: 'open', connection_id: connection.id,
      condition_set_ref: profile.availability_condition_set_ref }),
    assessMovementCapability: async () => ({ ok: false, actor_id: 'actor',
      code: 'movement_actor_unavailable' }),
    projectDestination: async () => ({ ok: true, position_id: 'position:target',
      site_id: 'site:target', visible_context: visible })
  });
  await assert.rejects(prepare({ partyId: party_id, actorId: 'actor',
    requestId: 'request', state, playerInput: { idempotency_key: 'idem' },
    inputDigest: 'input', context, connection }), (error) =>
    error.code === 'SPATIAL_V3_MOVEMENT_DENIED' && error.status === 409
      && /не может двигаться/u.test(error.message));
});
