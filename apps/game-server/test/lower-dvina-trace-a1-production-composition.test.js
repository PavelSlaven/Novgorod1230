import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLowerDvinaTraceA1Profile } from
  '../src/internal/lower-dvina-trace-a1-profile.js';
import { loadLowerDvinaTraceLocalFireProfile } from
  '../src/internal/lower-dvina-trace-local-fire-profile.js';
import { projectLowerDvinaTraceA1Capability } from
  '../src/runtime/lower-dvina-trace-a1-player-safe.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from
  '../src/runtime/releases/lower-dvina-trace-a1-production.js';
import { resolveA1OperationScope } from
  '../src/runtime/releases/lower-dvina-trace-a1-pre-attempt.js';
import { projectLowerDvinaTraceF1Capability } from
  '../src/runtime/releases/lower-dvina-trace-f1-production.js';
import { createSpatialV3ProductionBindings } from
  '../src/runtime/releases/spatial-v3-production-binding-shared.js';
import { materializeLocalFireActivation } from
  '../../../packages/materialization/src/lower-dvina-trace-local-fire.js';

test('production-v10 threads the exact A1 profile and resolver into Phase 2',
  async () => {
    const loadedProfile = await loadLowerDvinaTraceA1Profile();
    const active = await capturedTraceRuntime(loadedProfile);
    assert.equal(active.actionProductionProfile, loadedProfile);
    assert.equal(typeof active.createTurnStepActionProductionOwner,
      'function');

    const absent = await capturedTraceRuntime(null);
    assert.equal(absent.actionProductionProfile, null);
    assert.equal(absent.createTurnStepActionProductionOwner, null);
  });

test('A1 capability marker requires the exact profile and installed resolver',
  async () => {
    const loadedProfile = await loadLowerDvinaTraceA1Profile();
    const bag = { entity_ref: { entity_kind: 'container',
      entity_id: 'container:visible-bag' } };
    const sceneObject = { entity_ref: { entity_kind: 'item',
      entity_id: 'item:visible-scene-object' } };
    const playerSafeState = { visible_objects: [bag, sceneObject], items: [
      { item_id: 'item:visible-scene-object', template_id: 'unlisted-stick' },
      { item_id: 'item:hidden-unrelated', template_id: 'unrelated-template' }
    ] };
    const active = projectLowerDvinaTraceA1Capability({ playerSafeState,
      loadedProfile, resolverAvailable: true });
    assert.equal(active.action_production.semantic_grounding_available, true);
    assert.equal(active.action_production.max_new_entities, 4);
    assert.deepEqual(active.action_production.allowed_identity_modes,
      loadedProfile.profile.allowed_identity_modes);
    assert.deepEqual(active.action_production.allowed_origins,
      loadedProfile.profile.allowed_origins);
    assert.deepEqual(active.action_production.allowed_output_classes,
      loadedProfile.profile.allowed_output_classes);
    assert.deepEqual(active.visible_objects, [bag, sceneObject]);
    assert.equal(active.visible_objects.some(({ entity_ref: ref }) =>
      ref.entity_id === 'item:hidden-unrelated'), false);
    assert.equal(projectLowerDvinaTraceA1Capability({
      playerSafeState: { visible_objects: [bag], inventory: {
        items: ['item:carried']
      } }, loadedProfile, resolverAvailable: true
    }).action_production.semantic_grounding_available, true);
    assert.equal(projectLowerDvinaTraceA1Capability({
      playerSafeState: { visible_objects: [bag], inventory: {
        items: [{ item_id: 'item:reloaded-carried', template_id: 'stick' }]
      } }, loadedProfile, resolverAvailable: true
    }).action_production.semantic_grounding_available, true);
    let itemIdReads = 0;
    const getterItem = {};
    Object.defineProperty(getterItem, 'item_id', {
      enumerable: true,
      get() {
        itemIdReads += 1;
        return 'item:hostile';
      }
    });
    assert.equal(projectLowerDvinaTraceA1Capability({
      playerSafeState: { visible_objects: [bag], inventory: {
        items: [getterItem]
      } }, loadedProfile, resolverAvailable: true
    }).action_production, undefined);
    assert.equal(itemIdReads, 0);
    assert.equal(projectLowerDvinaTraceA1Capability({
      playerSafeState: { visible_objects: [bag], items: [
        { item_id: 'item:hidden-unrelated', template_id: 'unrelated-template' }
      ] }, loadedProfile, resolverAvailable: true
    }).action_production, undefined);
    assert.equal(projectLowerDvinaTraceA1Capability({
      playerSafeState: { actor_id: 'character:player', items: [{
        item_id: 'item:held', placement: {
          holder_character_id: 'character:player'
        }
      }] }, loadedProfile, resolverAvailable: true
    }).action_production.semantic_grounding_available, true);
    assert.equal(projectLowerDvinaTraceA1Capability({
      playerSafeState: { actor_id: 'character:player', items: [{
        item_id: 'item:held', placement: { anchor_id: 'anchor:shore' }
      }] }, loadedProfile, resolverAvailable: true
    }).action_production, undefined);

    const afterPreserve = projectLowerDvinaTraceA1Capability({
      playerSafeState: { visible_objects: [bag, {
        entity_ref: { entity_kind: 'item', entity_id: 'item:garment' }
      }], items: [
        { item_id: 'item:garment', template_id: null },
        { item_id: 'item:knife', template_id: 'any-visible-tool' }
      ] }, loadedProfile, resolverAvailable: true
    });
    assert.deepEqual(afterPreserve.visible_objects, [bag, {
      entity_ref: { entity_kind: 'item', entity_id: 'item:garment' }
    }]);

    assert.equal(projectLowerDvinaTraceA1Capability({ playerSafeState,
      loadedProfile: null, resolverAvailable: true }), playerSafeState);
    assert.equal(projectLowerDvinaTraceA1Capability({ playerSafeState,
      loadedProfile, resolverAvailable: false }), playerSafeState);

    const drifted = structuredClone(loadedProfile);
    drifted.profile.status = 'draft';
    assert.equal(projectLowerDvinaTraceA1Capability({ playerSafeState,
      loadedProfile: drifted, resolverAvailable: true }), playerSafeState);
    assert.throws(() => createLowerDvinaTraceA1ProductionResolverFactory({
      pool: { query: async () => ({ rows: [] }) }, loadedProfile: drifted
    }), /Exact loaded A1 profile is required/u);
  });

test('A1 owner projects its validated semantic operation bounds', async () => {
  const loadedProfile = await loadLowerDvinaTraceA1Profile();
  const createOwner = createLowerDvinaTraceA1ProductionResolverFactory({
    pool: { query: async () => ({ rows: [] }) }, loadedProfile
  });
  const owner = createOwner({ partyId: 'party', requestId: 'request' });
  assert.deepEqual(owner.actionProductionContract, {
    semantic_contract: 'action_produced_result_v1',
    material_extent_rules: {
      preserve_source: { one_source: [null],
        multiple_sources: ['minor', 'half', 'major', 'whole'] },
      independent_outputs: { partial_transformation: ['minor', 'half', 'major'],
        other: ['whole'] },
      no_useful_result: [null]
    },
    allowed_physical_forms: ['compact', 'regular', 'long', 'bulky'],
    max_new_entities: loadedProfile.profile.max_new_entities,
    allowed_identity_modes: loadedProfile.profile.allowed_identity_modes,
    allowed_origins: loadedProfile.profile.allowed_origins,
    allowed_result_classes: loadedProfile.profile.allowed_result_classes,
    allowed_output_classes: loadedProfile.profile.allowed_output_classes
  });
  assert.equal(Object.isFrozen(owner.actionProductionContract), true);
  assert.equal(Object.isFrozen(owner.actionProductionContract
    .allowed_identity_modes), true);
});

test('A1 admits unchecked domain request but keeps checked evidence strict', () => {
  const unchecked = a1EvidenceEnvelope();
  assert.equal(Object.hasOwn(unchecked, 'check_result'), false);
  assert.doesNotThrow(() => resolveA1OperationScope(unchecked,
    unchecked.operation, { max_new_entities: 4 }, true));

  const checked = a1EvidenceEnvelope({ resolution: 'generic_check',
    check: { difficulty_id: 'standard' } });
  assert.throws(() => resolveA1OperationScope(checked, checked.operation,
    { max_new_entities: 4 }, true), { code: 'TRACE_A1_SCOPE_INVALID' });
});

test('production-v11 threads exact F1 profile, resolver and temporal owner',
  async () => {
    const loaded = await loadLowerDvinaTraceLocalFireProfile();
    const active = await capturedTraceRuntime(null, loaded);
    assert.equal(active.localFireProfile, loaded);
    assert.equal(typeof active.createTurnStepWorldProcessResolver, 'function');
    assert.equal(typeof active.temporalAdvanceOwner.advance, 'function');
    const absent = await capturedTraceRuntime(null, null);
    assert.equal(absent.localFireProfile, null);
    assert.equal(absent.createTurnStepWorldProcessResolver, null);
  });

test('F1 player-safe marker exposes visible ignition and active process refs',
  async () => {
  const loadedProfile = await loadLowerDvinaTraceLocalFireProfile();
  const kindling = { item_id:'item:kindling',template_id:'kindling-template',
    quantity:1,state_version:1,state:{lifecycle_status:'active',
      inventory_profile_snapshot:{item_template_ref:'kindling-template',
        mass_grams:300},local_fire_fuel:{schema:
        'rus.items.local_fire_fuel.v1',fuel_class:'ordinary_solid_fuel_unit',
        whole_unit:true}},placement:{item_id:'item:kindling',anchor_id:
        'anchor:current',container_id:null,holder_npc_id:null,
        holder_character_id:null,physical_position:null,
        equipment_slot_category_id:null,attached_item_id:null},ownership:{
        item_id:'item:kindling'}};
  const boundFuel = structuredClone(kindling);
  boundFuel.item_id = 'item:bound-fuel';
  boundFuel.template_id = 'bound-fuel-template';
  boundFuel.state.inventory_profile_snapshot.item_template_ref =
    'bound-fuel-template';
  boundFuel.placement.item_id = 'item:bound-fuel';
  boundFuel.ownership.item_id = 'item:bound-fuel';
  const water = { item_id:'item:water',template_id:'water-template',quantity:1,
    state_version:1,state:{lifecycle_status:'active',
      inventory_profile_snapshot:{item_template_ref:'water-template',
        mass_grams:750},ordinary_metadata:{semantic_type:'water_portion'}},
    placement:{item_id:'item:water',anchor_id:null,container_id:null,
      holder_npc_id:null,holder_character_id:'player',physical_position:'hands',
      equipment_slot_category_id:null,attached_item_id:null},ownership:{
      item_id:'item:water'}};
  const ignition = { item_id:'item:ignition', state:{lifecycle_status:'active',
      local_fire_ignition_basis:{schema:
        'rus.items.local_fire_ignition_basis.v1'}} };
  const base = { actor_id:'player',position:{g5_anchor_id:'anchor:current'},
      items: [ignition,kindling,boundFuel,water] };
  const active = projectLowerDvinaTraceF1Capability({playerSafeState:base,
    committedState:{position:{g5_anchor_id:'anchor:current'},
        items:[ignition,kindling,boundFuel,water],local_fire_runtime:[{process_state:{
          process_ref:'process:1',status:'active',scope_ref:'anchor:current',
          causal_basis_ref:'item:ignition',fuel_bindings:[{
            fuel_ref:'item:bound-fuel'}]}}]},loadedProfile,
      resolverAvailable:true});
  assert.deepEqual(active.local_world_process,{semantic_grounding_available:true,
      context_ref:loadedProfile.profile.context_ref,scope_ref:'anchor:current',
      ignition_basis_refs:['item:ignition'],active_process_refs:['process:1'],
      allowed:[{op:'request_world_process',actor_ref:'player',
        process_action:'start',process_ref:null,process_kind:'fire',
        source_refs:['item:kindling'],target_refs:['item:ignition'],
        description:'Разжечь огонь.'},{op:'request_world_process',
        actor_ref:'player',process_action:'affect',process_ref:'process:1',
        process_kind:'fire',source_refs:['item:kindling'],target_refs:[],
        description:'Воздействовать на огонь.'},{op:'request_world_process',
        actor_ref:'player',process_action:'affect',process_ref:'process:1',
        process_kind:'fire',source_refs:['item:water'],target_refs:[],
        description:'Воздействовать на огонь.'}]});
    const hidden = projectLowerDvinaTraceF1Capability({playerSafeState:{
      position:{g5_anchor_id:'anchor:current'},items:[]},
      committedState:{position:{g5_anchor_id:'anchor:current'},items:[]},
      loadedProfile,resolverAvailable:true});
    assert.equal(hidden.local_world_process,undefined);
});

test('F1 activation provisions one player-owned whole water portion', async () => {
  const loadedProfile = await loadLowerDvinaTraceLocalFireProfile();
  const activation = materializeLocalFireActivation('party', 'player', 'shore',
    'run', loadedProfile.profile, (...parts) => parts.join(':'));
  const water = activation.items.filter((item) =>
    item.state?.ordinary_metadata?.semantic_type === 'water_portion');
  assert.equal(water.length, 1);
  assert.equal(water[0].quantity, 1);
  assert.equal(water[0].owner_character_id, 'player');
  assert.equal(water[0].controller_character_id, 'player');
});

async function capturedTraceRuntime(actionProductionProfile,
  localFireProfile = null) {
  let captured = null;
  const release = {
    release_id: 'spatial-v3-production-v10',
    runtime_catalog_scope: 'item_container_materialization_v2',
    runtime_catalog_contract_digest: 'runtime-digest',
    world_revision_id: 'world-revision', world_catalog_digest: 'world-digest',
    compatible_world_pin_manifest_digest: 'manifest-digest'
  };
  const worldPool = { query: async () => ({ rows: [{
    event_id: 'event', catalog_scope: release.runtime_catalog_scope,
    catalog_revision_id: 'revision', catalog_digest: 'catalog-digest',
    import_id: 'import', import_audit_digest: 'import-digest',
    record_registry_digest: 'registry-digest',
    runtime_contract_digest: release.runtime_catalog_contract_digest,
    compatible_world_revision_id: release.world_revision_id,
    compatible_world_catalog_digest: release.world_catalog_digest,
    compatible_world_pin_manifest_digest:
      release.compatible_world_pin_manifest_digest
  }] }) };
  const partyPool = { query: async () => ({ rows: [] }),
    connect: async () => ({ query: async () => ({ rows: [] }),
      release() {} }) };
  const bindings = await createSpatialV3ProductionBindings({
    ports: { worldPool, partyPool }, release,
    config: { traceTurnDecisionSecret: 'test-secret' },
    actionProductionProfile,
    localFireProfile,
    spatialSemanticProfile: null
  }, {
    createNpcRuntimePorts: () => ({}),
    createPhase2RuntimeFactory: (input) => { captured = input; return {}; }
  });
  await bindings.createPublicRuntimeFacade({
    technicalCore: { executeReleaseOperation: async () => null },
    committer: { commit: async () => ({ ok: true }) }
  });
  return captured;
}

function a1EvidenceEnvelope({ resolution = 'domain_request',
  check = null } = {}) {
  const operation = { actor_ref: 'party-1', item_ref: 'item:pole',
    target_refs: ['item:knife'], action_production: {
      source_refs: ['item:pole'], tool_refs: ['item:knife'],
      requested_output_count: null } };
  return { operation, actor: { actor_id: 'party-1' },
    request: { step_index: 1, root_turn_id: 'turn:unchecked',
      committed_state_version: 1 },
    committed_state: { party_state: { turn_number: 1 } },
    plan: { resolution, check, activity: { owner: 'semantic' } } };
}
