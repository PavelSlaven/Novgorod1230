import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3SiteTraversalRuntime } from
  '../src/runtime/spatial-v3-site-traversal-runtime.js';
import { applySiteTraversalTransition, siteTraversalWrites } from
  '../src/infrastructure/postgres/spatial-v3-site-traversal-commit.js';
import { recheckSiteConnectionTraversal } from
  '../src/infrastructure/postgres/first-playable/recheck-site-connection-traversal.js';

const party_id = 'party';
const active = (id, extra = {}) => ({ id, party_id, status: 'active', state_version: 1, ...extra });
const versioned = (entity_id) => ({ entity_id, authoring_version: '1' });
const visible = { version: 1, schema: 'visible_context_package', visible_scene: 'За проходом видна новая поляна.',
  visible_changes: [], sensory_details: [], visible_npc: [], visible_objects: [],
  known_context: [], uncertainties: [], allowed_tensions: [], do_not_imply: [] };
const capabilityPins = [{ dependency_role: 'source_authoring',
  entity_ref: { entity_kind: 'world_revision', entity_id: 'revision' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: 'revision', state_version: null } }];
const capability = { cohort_membership_snapshot_pin: null, load_state_pin: null,
  root_carrier_attachment_pins: null, allowed_movement_methods: ['walk'],
  available_transport_pins: null, equipment_state_pins: null, legal_access_fact_pins: null,
  allowed_pace_modes: ['normal'], dependency_pins: {
    pins: capabilityPins, canonical_digest: digest(capabilityPins).slice(7) } };
capability.canonical_digest = digest(capability);
const connection = active('connection', { from_site_id: 'site:source', to_site_id: 'site:target',
  passage_type_id: 'passage.local', cost_kind: 'action', action_units: 1, base_minutes: null,
  capacity: null, portal_entity_id: null,
  transition_environment_profile_ref: versioned('env'),
  movement_orientation_profile_ref: versioned('orientation'),
  availability_condition_set_ref: versioned('availability.local_state_conditional') });
const profile = { id: 'profile', version: 1, status: 'approved', profile_scope: 'site_connection',
  passage_type_id: 'passage.local', cost_kind: 'action', action_units: 1,
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
    scene_positions: positions, endpoint_bindings: endpoints } };
const state = { party_id, actor_id: 'actor', party_state: { state_version: 1, turn_number: 0 },
  position: { position_id: 'position:source', g4_id: 'g4' },
  journey_location: { id: 'journey', scene_position_id: 'position:source', state_version: 1 } };

test('approved site connection prepares action-cost P18/P19 result and one atomic P16 write set', async () => {
  const current = { scene_position_id: 'position:source', location_kind: 'scene',
    journey_version: 1, from_site_id: 'site:source', to_site_id: 'site:target',
    connection_status: 'active', connection_version: 1, cost_kind: 'action',
    action_units: 1, base_minutes: null, connection_capacity: null,
    portal_entity_id: null, availability_condition_set_ref: connection.availability_condition_set_ref,
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
  const prepare = createSpatialV3SiteTraversalRuntime({ pool: { query: async (sql) =>
    ({ rowCount: 1, rows: [sql.includes('FOR UPDATE OF l,c') ? current : { units: 0 }] }) },
  assessAvailability: async () => ({ ok: true, connection_id: connection.id,
    condition_set_ref: profile.availability_condition_set_ref }),
  assessMovementCapability: async () => ({ ok: true, actor_id: 'actor',
    capability_context: capability }),
  projectDestination: async () => ({ ok: true, position_id: 'position:target',
    site_id: 'site:target', visible_context: visible }) });
  const consequence = await prepare({ partyId: party_id, actorId: 'actor',
    requestId: 'request', state, playerInput: { idempotency_key: 'idem' },
    inputDigest: 'input', context, connection });
  assert.equal(consequence.duration_minutes, 0);
  assert.equal(consequence.spatial_v3_traversal.result.result_kind, 'completed');
  assert.equal(consequence.position_transition.to_position_ref, 'position:target');
  const snapshot = structuredClone(state);
  assert.equal(applySiteTraversalTransition({ snapshot, state, consequence }), true);
  assert.deepEqual(snapshot.position, { g4_id: 'g4', site_id: 'site:target',
    g6_instance_id: 'g6:target', position_id: 'position:target' });
  const written = siteTraversalWrites({ partyId: party_id,
    envelope: { consequence }, changeSetId: 'change:party:turn-step:1',
    idemId: consequence.spatial_v3_traversal.result.idempotency_record_id,
    turnNumber: 1 });
  assert.deepEqual(written.writes.inserts.map((write) => write.target_table),
    ['party_route_plans', 'party_route_plan_steps', 'party_route_plan_executions']);
  assert.deepEqual(written.writes.appends.map((write) => write.target_table),
    ['party_action_step_runs', 'party_route_plan_execution_events',
      'party_route_plan_execution_events', 'party_route_plan_execution_events']);
  assert.equal(written.rechecks[0].kind, 'site_connection_traversal');
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
