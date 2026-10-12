import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest as spatialDigest } from
  '@rus/contracts/spatial-v3/registry';
import { createSpatialV3SiteTraversalRuntime } from
  '../src/runtime/spatial-v3-site-traversal-runtime.js';
import { withLowerDvinaTraceCurrentScene } from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { fixture } from './lower-dvina-trace-turn-step-commit-fixture.js';

const projectorUrl = process.env.ISSUE_260_MUTANT_MODULE == null
  ? new URL('../src/runtime/lower-dvina-trace-turn-step-fire-visible.js', import.meta.url).href
  : pathToFileURL(resolve(process.env.ISSUE_260_MUTANT_MODULE)).href;
const { createLowerDvinaTraceTurnStepVisibleProjector } =
  await import(projectorUrl);

const visible = (scene) => ({ schema: 'visible_context_package', version: 1,
  visible_scene: scene, visible_changes: [], sensory_details: [], visible_npc: [],
  visible_objects: [], known_context: [], uncertainties: [], allowed_tensions: [],
  do_not_imply: [] });
const active = (id, extra = {}) => ({ id, party_id: 'p', status: 'active',
  state_version: 1, ...extra });
const versioned = (id) => ({ entity_id: id, authoring_version: '1' });
const capabilityPins = [{ dependency_role: 'source_authoring',
  entity_ref: { entity_kind: 'world_revision', entity_id: 'revision' },
  version_pin: { pin_kind: 'authoring_version', authoring_version: 'revision',
    state_version: null } }];
const capability = { cohort_membership_snapshot_pin: null, load_state_pin: null,
  root_carrier_attachment_pins: null, allowed_movement_methods: ['walk'],
  available_transport_pins: null, equipment_state_pins: null,
  legal_access_fact_pins: null, allowed_pace_modes: [], dependency_pins: {
    pins: capabilityPins, canonical_digest: spatialDigest(capabilityPins).slice(7) } };
capability.canonical_digest = spatialDigest(capability);

test('canonical site arrival prepares, projects and commits destination scene once',
  async () => {
    const f = fixture({ direct: true });
    const runtimeMechanics = f.batch.value.operations.find(({ value }) =>
      value.operation_kind === 'create_entity').value.payload
      .runtime_instance_mechanics_snapshot;
    Object.assign(f.state, {
      actor_id: 'actor-1', position: { location_ref: 'shore',
        g5_anchor_id: 'anchor-shore', site_id: 'site:source',
        position_id: 'position:source', g6_instance_id: 'g6:source' },
      journey_location: { id: 'journey', scene_position_id: 'position:source',
        state_version: 1 },
      items: [{ item_id: 'origin-ground-item', name: 'корзина',
        runtime_instance_mechanics_snapshot: structuredClone(runtimeMechanics),
        placement: { anchor_id: 'anchor-shore' } }]
    });
    const connection = active('connection', { from_site_id: 'site:source',
      to_site_id: 'site:destination', passage_type_id: 'passage.local',
      cost_kind: 'action', action_units: 1, base_minutes: null,
      transition_environment_profile_ref: versioned('env'),
      movement_orientation_profile_ref: versioned('orientation'),
      availability_condition_set_ref: versioned('availability') });
    const sites = [active('site:source', { parent_g4_id: 'g4', origin: 'canonical' }),
      active('site:destination', { parent_g4_id: 'g4', origin: 'canonical' })];
    const baselines = [active('baseline:source', { host_kind: 'g5_site',
      host_id: 'site:source' }), active('baseline:destination', {
      host_kind: 'g5_site', host_id: 'site:destination' })];
    const g6 = [active('g6:source', { scene_baseline_id: 'baseline:source',
      host_kind: 'g5_site', host_id: 'site:source' }), active('g6:destination', {
      scene_baseline_id: 'baseline:destination', host_kind: 'g5_site',
      host_id: 'site:destination' })];
    const positions = [active('position:source', { g6_instance_id: 'g6:source',
      capacity: 4 }), active('position:destination', {
      g6_instance_id: 'g6:destination', capacity: 4 })];
    const endpoints = [active('endpoint:from', { site_connection_id: 'connection',
      endpoint_role: 'from', g5_site_id: 'site:source',
      position_id: 'position:source' }), active('endpoint:to', {
      site_connection_id: 'connection', endpoint_role: 'to',
      g5_site_id: 'site:destination', position_id: 'position:destination' })];
    const context = { partyId: 'p', actorId: 'actor-1', world_revision_id: 'revision',
      world_catalog_digest: 'catalog', location: { id: 'journey', party_id: 'p',
        owner_kind: 'actor', owner_id: 'actor-1', location_kind: 'scene',
        scene_position_id: 'position:source', state_version: 1 },
      position: positions[0], site: sites[0], baseline: baselines[0],
      closure: { connection_profiles: [{ id: 'profile', version: 1,
        status: 'approved', profile_scope: 'site_connection',
        passage_type_id: 'passage.local', cost_kind: 'action', action_units: 1,
        transition_environment_profile_id: 'env',
        transition_environment_profile_version: 1,
        movement_orientation_profile_id: 'orientation',
        movement_orientation_profile_version: 1,
        availability_condition_set_ref: 'availability@1',
        capacity_semantics_ref: 'footprint@1', canonical_digest: 'profile-digest' }] },
      snapshot: { sites, scene_baselines: baselines, g6_instances: g6,
        scene_positions: positions, endpoint_bindings: endpoints } };
    const current = { scene_position_id: 'position:source', location_kind: 'scene',
      journey_version: 1, from_site_id: 'site:source', to_site_id: 'site:destination',
      connection_status: 'active', connection_version: 1, cost_kind: 'action',
      action_units: 1, base_minutes: null, connection_capacity: null,
      portal_entity_id: null,
      availability_condition_set_ref: connection.availability_condition_set_ref,
      from_position: 'position:source', from_site: 'site:source',
      from_binding_status: 'active', from_binding_version: 1,
      to_position: 'position:destination', to_site: 'site:destination',
      to_binding_status: 'active', to_binding_version: 1,
      destination_g4_id: 'g4', destination_g6_id: 'g6:destination',
      destination_baseline_id: 'baseline:destination', destination_capacity: 4 };
    for (const prefix of ['source_position', 'destination_position', 'source_g6',
      'destination_g6', 'source_baseline', 'destination_baseline', 'source_site',
      'destination_site']) {
      current[`${prefix}_status`] = 'active';
      current[`${prefix}_version`] = 1;
    }
    const ownerCalls = [];
    const preparedDestinationScenes = new Map();
    const projectRealScene = (state) => {
      ownerCalls.push({ position: structuredClone(state.position),
        location_ref: state.position?.location_ref,
        g5_anchor_id: state.position?.g5_anchor_id });
      return withLowerDvinaTraceCurrentScene({ committedState: state,
        currentSpatialContext: state.current_spatial_context,
        currentSpatialContextIsFresh: true });
    };
    const prepare = createSpatialV3SiteTraversalRuntime({
      pool: { query: async (sql) => sql.includes('FOR UPDATE OF l,c')
        ? { rowCount: 1, rows: [current] }
        : { rowCount: 1, rows: [{ units: 0 }] } },
      assessAvailability: async () => ({ ok: true, status: 'open',
        condition_set_ref: 'availability@1', connection_id: 'connection' }),
      assessMovementCapability: async () => ({ ok: true, actor_id: 'actor-1',
        capability_context: structuredClone(capability) }),
      projectDestination: async ({ destinationSite, destinationPosition,
        destinationSiteId, destinationPositionId, destinationG6InstanceId }) => {
        const siteId = destinationSite?.id ?? destinationSiteId;
        const positionId = destinationPosition?.id ?? destinationPositionId;
        const g6Id = destinationPosition?.g6_instance_id
          ?? destinationG6InstanceId;
        if (preparedDestinationScenes.has(positionId)) return {
          ok: true, site_id: siteId, position_id: positionId,
          visible_context: structuredClone(preparedDestinationScenes.get(positionId))
        };
        const state = { ...structuredClone(f.state), position: {
          ...f.state.position, site_id: siteId, position_id: positionId,
          location_ref: siteId, g6_instance_id: g6Id },
        current_spatial_context: visible('Берег назначения.') };
        delete state.position.g5_anchor_id;
        const visibleContext = projectRealScene(state).current_visible_context;
        preparedDestinationScenes.set(positionId, structuredClone(visibleContext));
        return { ok: true, site_id: siteId,
          position_id: positionId, visible_context: visibleContext };
      }
    });
    const prepared = await prepare({ partyId: 'p', actorId: 'actor-1',
      requestId: 'request-1', state: { ...f.state, party_state: {
        ...f.state.party_state, turn_number: 0 } },
      playerInput: { idempotency_key: 'idem-key' }, inputDigest: canonicalDigest({
        party_id: 'p', request_id: 'request-1', idempotency_key: 'idem-key',
        raw_text: 'беру песок' }),
      context, connection });
    f.envelope.consequence = { ...f.envelope.consequence, ...prepared,
      state_changes: f.envelope.consequence.state_changes,
      visible_seed: { ...f.envelope.consequence.visible_seed,
        ...prepared.visible_seed } };

    const projector = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project: async () => assert.fail('site arrival owns projection') },
      partyId: 'p',
      loadPreparedMovementScene: async ({ state }) => ({ ...state,
        current_spatial_context: visible('Берег назначения.'),
        current_spatial_context_is_fresh: true,
        current_spatial_context_filters_entities: true }),
      projectCurrentScene: projectRealScene
    });
    f.envelope.visible_context = await projector.project({
      consequence: f.envelope.consequence,
      retrieved_state: f.state,
      time_update: f.envelope.time_update,
      mode_resolution: f.envelope.mode_resolution
    });
    await f.commit();

    const snapshot = f.plans[0].inserts.find(({ target_table }) =>
      target_table === 'party_state_snapshots').record.state_payload;
    assert.equal(snapshot.position.site_id, 'site:destination');
    assert.equal(snapshot.position.position_id, 'position:destination');
    assert.notEqual(snapshot.position.location_ref, 'shore');
    assert.notEqual(snapshot.position.g5_anchor_id, 'anchor-shore');
    assert.deepEqual({ originGroundItemVisible:
      f.envelope.visible_context.visible_objects.some(({ entity_ref }) =>
        entity_ref.entity_id === 'origin-ground-item'),
      realCurrentSceneCalculations: ownerCalls.length }, {
      originGroundItemVisible: false, realCurrentSceneCalculations: 1
    }, 'arrival must reuse one prepared scene and exclude origin ground items');
  });
