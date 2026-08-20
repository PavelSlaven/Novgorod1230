import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadLowerDvinaTraceOrdinaryMaterializationProfile } from
  '../src/internal/lower-dvina-trace-ordinary-materialization-profile.js';
import { createLowerDvinaTraceO2aAmbientPort } from
  '../src/runtime/lower-dvina-trace-o2a-ambient-port.js';
import { projectLowerDvinaTraceO2aCapabilities,
  projectLowerDvinaTraceO2aDiscoverySources } from
  '../src/runtime/lower-dvina-trace-o2a-player-safe.js';
import { createLowerDvinaTraceTurnStepRuntimePorts } from
  '../src/runtime/lower-dvina-trace-turn-step-runtime-ports.js';
import { createLowerDvinaTracePlayerSafeWorkingProjectionAuthority } from
  '../src/runtime/lower-dvina-trace-player-safe-working.js';
import { createSpatialV3ProductionBindings } from
  '../src/runtime/releases/spatial-v3-production-binding-shared.js';

const ownerProfiles = JSON.parse(await readFile(new URL(
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json',
  import.meta.url)));

test('the exact approved first-entry binding exposes only its authored ambient portion', async () => {
  const profile = await loadLowerDvinaTraceOrdinaryMaterializationProfile({ rootDir: process.cwd() });
  const port = createLowerDvinaTraceO2aAmbientPort({ profile, committedState: {
    actor_id: 'mikula', position: { g6_id: 'trace_ld_v1_g6_wreck_shore',
      location_ref: 'trace_ld_v1_loc_wreck_shore' }
  } });
  assert.equal(typeof port, 'function');
  assert.deepEqual(port.capabilities, [{
    source_ref: 'trace_ld_v1_o2a_wreck_shore_sand',
    portion_profile_ref: 'trace_ld_v1_o2a_wreck_shore_sand_portion',
    semantic_type: 'material_portion',
    public_name: 'горсть мокрого песка'
  }]);
  assert.equal(port.supports({ origin: { source_refs: [
    'trace_ld_v1_o2a_wreck_shore_sand_portion'
  ] } }), true);
  assert.equal(port.supports({ origin: { source_refs: [
    'trace_ld_v1_loc_wreck_shore'
  ] } }), false);
  let reads = 0;
  const hostile = {};
  Object.defineProperty(hostile, 'origin', { enumerable: true, get() {
    reads++; return { source_refs: [] };
  } });
  assert.equal(port.supports(hostile), false);
  assert.equal(reads, 0);
  const projected = projectLowerDvinaTraceO2aCapabilities({ admission: port,
    projected: { actor: {}, player_safe_state: { visible_context: {
      visible_objects: [] } } } });
  assert.deepEqual(projected.player_safe_state.visible_context.visible_objects,
    [{ entity_ref: { entity_kind: 'ambient_ordinary_capability',
      entity_id: 'trace_ld_v1_o2a_wreck_shore_sand_portion' },
    display_label: 'горсть мокрого песка',
    recognition: 'code_owned_source_capability',
    visible_status: 'available' }]);
  const removed = projectLowerDvinaTraceO2aCapabilities({ admission: null,
    projected });
  assert.deepEqual(removed.player_safe_state.visible_context.visible_objects,
    []);
  const result = await port({ operation_identity: { root_turn_id: 'turn', step_index: 1,
    operation_ref: 'create_entity' }, request: { context_pin_ref: 'committed',
    source_ref: 'committed', portion_profile_ref: 'committed',
    semantic_type: 'material_portion', semantic_name: 'горсть мокрого песка',
    source_identity_refs: ['trace_ld_v1_g6_wreck_shore'],
    quantity: { value: 1, unit: 'handful' }, mass_grams: 300,
    destination_ref: 'mikula' } });
  assert.equal(result.pass, true);
  assert.equal(result.proposal.semantic_descriptor.name, 'горсть мокрого песка');
});

test('O2a ambient admission is absent for a drifted binding', async () => {
  const profile = await loadLowerDvinaTraceOrdinaryMaterializationProfile({ rootDir: process.cwd() });
  assert.deepEqual(profile.policy_refs.context_bound_permission_refs, [
    'trace_ld_v1_o2a_first_entry_region_permission',
    'trace_ld_v1_o2a_prepared_clay_permission'
  ]);
  assert.equal(profile.o2a_context_bound.status, 'approved');
  assert.equal(createLowerDvinaTraceO2aAmbientPort({ profile, committedState: {
    actor_id: 'mikula', position: { g6_id: 'other', location_ref: 'trace_ld_v1_loc_wreck_shore' }
  } }), null);
});

test('player-safe discovery exposes committed source, not expected result capability', () => {
  const projected = projectLowerDvinaTraceO2aDiscoverySources({
    sources: [{ source_ref: 'source:clay', public_name: 'запас подготовленной глины',
      disclosure_state: 'visible', capability_ref: 'hidden-capability',
      permission_refs: ['hidden-permission'] },
    { source_ref: 'source:hidden-stock', public_name: 'скрытый запас',
      disclosure_state: 'concealed', capability_ref: 'hidden-stock-capability',
      permission_refs: ['hidden-stock-permission'] }],
    projected: { player_safe_state: { visible_context: { visible_objects: [] } } }
  });
  assert.deepEqual(projected.player_safe_state.visible_context.visible_objects, [{
    entity_ref: { entity_kind: 'ordinary_resource_source', entity_id: 'source:clay' },
    display_label: 'запас подготовленной глины',
    recognition: 'code_owned_committed_source', visible_status: 'known'
  }]);
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes('ordinary_discovery_capability'), false);
  assert.equal(serialized.includes('hidden-capability'), false);
  assert.equal(serialized.includes('hidden-permission'), false);
  assert.equal(serialized.includes('source:hidden-stock'), false);
  assert.equal(serialized.includes('скрытый запас'), false);
});

test('the O2a owner intercepts only its explicit capability ref', async () => {
  const admission = async () => {
    throw new Error('legacy ambient action must not reach O2a admission');
  };
  admission.supports = ({ origin }) => origin.source_refs.includes(
    'trace_ld_v1_o2a_wreck_shore_sand_portion');
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({
    ordinaryResultPolicy: ownerProfiles.ordinary_result_policy,
    admitAmbientOrdinaryPortion: admission,
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });
  const operation = { op: 'create_entity', temp_ref: 'clay',
    semantic_type: 'material_portion', name: 'ком глины',
    origin: { kind: 'ambient_ordinary', source_refs: ['shore'] }, facts: [],
    mechanics: { mass_grams: 300, external_hand_cost: 1,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'handful' }, container: null },
    placement: { relation: 'held_by', target_ref: 'mikula' } };
  const result = await ports.executionRegistry.direct(operation)({ plan: {},
    request: { root_turn_id: 'turn', step_index: 1,
      actor: { actor_id: 'mikula', attributes: { strength: { value: 9 } },
        skills: {}, body: { body_parts: {} } } }, operation, check_result: null,
    working_projection: { actor_id: 'mikula',
      position: { location_ref: 'shore' }, destination_refs: [],
      inventory: { items: [], total_weight: { grams: 0 },
        load_category: 'light', occupied_hands: 0 }, items: [], knowledge: [] } });
  assert.equal(result.write_fragments[0].value.payload.name, 'ком глины');
});

test('the visible O2a capability grounds wording and assigns its safe name', async () => {
  const profile = structuredClone(await loadLowerDvinaTraceOrdinaryMaterializationProfile({
    rootDir: process.cwd() }));
  profile.o2a_ambient.portion_profile.semantic_type = 'river_silt_portion';
  profile.o2a_ambient.portion_profile.display_name = 'пригоршня речного ила';
  const admission = createLowerDvinaTraceO2aAmbientPort({ profile,
    committedState: { actor_id: 'mikula', position: {
      g6_id: 'trace_ld_v1_g6_wreck_shore',
      location_ref: 'trace_ld_v1_loc_wreck_shore' } } });
  const ports = createLowerDvinaTraceTurnStepRuntimePorts({
    ordinaryResultPolicy: ownerProfiles.ordinary_result_policy,
    admitAmbientOrdinaryPortion: admission,
    workingProjectionAuthority:
      createLowerDvinaTracePlayerSafeWorkingProjectionAuthority()
  });
  const ref = admission.capabilities[0].portion_profile_ref;
  const operation = { op: 'create_entity', temp_ref: 'sand',
    semantic_type: 'wet_sand_portion', name: 'песок с берега',
    origin: { kind: 'ambient_ordinary', source_refs: [ref] }, facts: [],
    mechanics: { mass_grams: 300, external_hand_cost: 1,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'handful' }, container: null },
    placement: { relation: 'held_by', target_ref: 'mikula' } };
  const execute = (candidate) => ports.executionRegistry.direct(candidate)({ plan: {},
    request: { root_turn_id: 'turn', step_index: 1,
      actor: { actor_id: 'mikula', attributes: { strength: { value: 9 } },
        skills: {}, body: { body_parts: {} } } }, operation: candidate,
    check_result: null,
    working_projection: { actor_id: 'mikula', position: {
      location_ref: 'trace_ld_v1_loc_wreck_shore' }, destination_refs: [],
      inventory: { items: [], total_weight: { grams: 0 },
        load_category: 'light', occupied_hands: 0 }, items: [], knowledge: [],
      visible_context: { visible_objects: [{ entity_ref: {
        entity_kind: 'ambient_ordinary_capability', entity_id: ref },
      display_label: 'пригоршня речного ила',
      recognition: 'code_owned_source_capability',
      visible_status: 'available' }] } } });
  assert.throws(() => execute({ ...operation, temp_ref: 'silt-fact',
    facts: [{ temp_ref: 'silt-fact-1', text: 'значимое утверждение' }] }),
  (error) => error.code === 'TRACE_TURN_STEP_AMBIENT_ADMISSION_REQUIRED');
  const result = await execute(operation);
  assert.equal(result.write_fragments[0].value.payload.name,
    'пригоршня речного ила');
  assert.equal(result.write_fragments[0].value.payload.semantic_type,
    'river_silt_portion');
});

test('production composition threads the active O2a strict admission policy', async () => {
  const profile = await loadLowerDvinaTraceOrdinaryMaterializationProfile({
    rootDir: process.cwd()
  });
  const active = await capturedTraceRuntime(profile);
  assert.equal(active.requireTurnStepAmbientOrdinaryAdmission, false);
  assert.equal(typeof active.createTurnStepAmbientOrdinaryPortionAdmission,
    'function');
  assert.equal(active.createTurnStepAmbientOrdinaryPortionAdmission({
    committedState: { actor_id: 'mikula', position: {
      g6_id: 'other', location_ref: 'trace_ld_v1_loc_wreck_shore'
    } }
  }), null);

  const legacy = await capturedTraceRuntime(null);
  assert.equal(legacy.requireTurnStepAmbientOrdinaryAdmission, false);
});

async function capturedTraceRuntime(ordinaryMaterializationProfile) {
  let captured = null;
  const release = {
    release_id: 'test-release',
    runtime_catalog_scope: 'item_container_materialization_v2',
    runtime_catalog_contract_digest: 'runtime-digest',
    world_revision_id: 'world-revision',
    world_catalog_digest: 'world-digest',
    compatible_world_pin_manifest_digest: 'manifest-digest'
  };
  const worldPool = { query: async () => ({ rows: [{
    event_id: 'event', catalog_scope: 'item_container_materialization_v2',
    catalog_revision_id: 'revision', catalog_digest: 'catalog-digest',
    import_id: 'import', import_audit_digest: 'import-digest',
    record_registry_digest: 'registry-digest',
    runtime_contract_digest: 'runtime-digest',
    compatible_world_revision_id: 'world-revision',
    compatible_world_catalog_digest: 'world-digest',
    compatible_world_pin_manifest_digest: 'manifest-digest'
  }] }) };
  const partyPool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release() {}
    })
  };
  const bindings = await createSpatialV3ProductionBindings({
    ports: { worldPool, partyPool }, release,
    config: { traceTurnDecisionSecret: 'test-secret' },
    ordinaryMaterializationProfile
  }, {
    createNpcRuntimePorts: () => ({}),
    createPhase2RuntimeFactory: (input) => {
      captured = input;
      return {};
    }
  });
  await bindings.createPublicRuntimeFacade({
    technicalCore: { executeReleaseOperation: async () => null },
    committer: { commit: async () => ({ ok: true }) }
  });
  return captured;
}
