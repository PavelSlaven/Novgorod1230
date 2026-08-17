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
import { projectLowerDvinaTraceF1Capability } from
  '../src/runtime/releases/lower-dvina-trace-f1-production.js';
import { createSpatialV3ProductionBindings } from
  '../src/runtime/releases/spatial-v3-production-binding-shared.js';

test('production-v10 threads the exact A1 profile and resolver into Phase 2',
  async () => {
    const loadedProfile = await loadLowerDvinaTraceA1Profile();
    const active = await capturedTraceRuntime(loadedProfile);
    assert.equal(active.actionProductionProfile, loadedProfile);
    assert.equal(typeof active.createTurnStepActionProducedResolver,
      'function');

    const absent = await capturedTraceRuntime(null);
    assert.equal(absent.actionProductionProfile, null);
    assert.equal(absent.createTurnStepActionProducedResolver, null);
  });

test('A1 capability marker requires the exact profile and installed resolver',
  async () => {
    const loadedProfile = await loadLowerDvinaTraceA1Profile();
    const bag = { entity_ref: { entity_kind: 'container',
      entity_id: 'container:visible-bag' } };
    const sceneObject = { entity_ref: { entity_kind: 'item',
      entity_id: 'item:visible-scene-object' } };
    const playerSafeState = { visible_objects: [bag, sceneObject], items: [
      { item_id: 'item:garment',
        template_id: loadedProfile.profile.source_profiles[0].template_id },
      { item_id: 'item:hidden-unrelated', template_id: 'unrelated-template' }
    ] };
    const active = projectLowerDvinaTraceA1Capability({ playerSafeState,
      loadedProfile, resolverAvailable: true });
    assert.deepEqual(active.action_production,
      { semantic_grounding_available: true });
    assert.deepEqual(active.visible_objects, [bag, sceneObject, {
      entity_ref: { entity_kind: 'item', entity_id: 'item:garment' }
    }]);
    assert.equal(active.visible_objects.some(({ entity_ref: ref }) =>
      ref.entity_id === 'item:hidden-unrelated'), false);

    const afterPreserve = projectLowerDvinaTraceA1Capability({
      playerSafeState: { visible_objects: [bag, {
        entity_ref: { entity_kind: 'item', entity_id: 'item:garment' }
      }], items: [
        { item_id: 'item:garment', template_id: null },
        { item_id: 'item:knife',
          template_id: loadedProfile.profile.tool_profiles[0].template_id }
      ] }, loadedProfile, resolverAvailable: true
    });
    assert.deepEqual(afterPreserve.visible_objects, [bag, {
      entity_ref: { entity_kind: 'item', entity_id: 'item:garment' }
    }, { entity_ref: { entity_kind: 'item', entity_id: 'item:knife' } }]);

    assert.equal(projectLowerDvinaTraceA1Capability({ playerSafeState,
      loadedProfile: null, resolverAvailable: true }), playerSafeState);
    assert.equal(projectLowerDvinaTraceA1Capability({ playerSafeState,
      loadedProfile, resolverAvailable: false }), playerSafeState);

    const drifted = structuredClone(loadedProfile);
    drifted.profile.status = 'draft';
    assert.equal(projectLowerDvinaTraceA1Capability({ playerSafeState,
      loadedProfile: drifted, resolverAvailable: true }), playerSafeState);
    let modelCalls = 0;
    assert.throws(() => createLowerDvinaTraceA1ProductionResolverFactory({
      pool: { query: async () => ({ rows: [] }) }, loadedProfile: drifted,
      actionProducedModel: async () => { modelCalls += 1; }
    }), /Exact loaded A1 profile is required/u);
    assert.equal(modelCalls, 0);
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

test('F1 player-safe marker exposes only visible approved exact refs',
  async () => {
    const loadedProfile = await loadLowerDvinaTraceLocalFireProfile();
    const authority = { status: 'committed',
      context_ref: loadedProfile.profile.context_ref,
      profile_ref: loadedProfile.profile.profile_id,
      profile_version: '1', scope_ref: 'anchor:current',
      ignition_basis_item_id: 'item:ignition',
      approved_fuel_item_ids: ['item:fuel:1','item:fuel:2'] };
    const base = { items: ['item:ignition','item:fuel:1','item:fuel:2']
      .map((item_id)=>({item_id})) };
    const active = projectLowerDvinaTraceF1Capability({playerSafeState:base,
      committedState:{position:{g5_anchor_id:'anchor:current'},
        local_fire_authority:authority,local_fire_runtime:[{process_state:{
          process_ref:'process:1',status:'active'}}]},loadedProfile,
      resolverAvailable:true});
    assert.deepEqual(active.local_world_process,{semantic_grounding_available:true,
      context_ref:authority.context_ref,ignition_basis_ref:'item:ignition',
      approved_fuel_refs:['item:fuel:1','item:fuel:2'],
      active_process_refs:['process:1']});
    const partial = projectLowerDvinaTraceF1Capability({playerSafeState:{
      items:[{item_id:'item:ignition'},{item_id:'item:fuel:2'}]},
      committedState:{position:{g5_anchor_id:'anchor:current'},
        local_fire_authority:authority,local_fire_runtime:[{process_state:{
          process_ref:'process:1',status:'active'}}]},loadedProfile,
      resolverAvailable:true});
    assert.deepEqual(partial.local_world_process.approved_fuel_refs,
      ['item:fuel:2']);
    const hidden = projectLowerDvinaTraceF1Capability({playerSafeState:{items:[]},
      committedState:{position:{g5_anchor_id:'anchor:current'},
        local_fire_authority:authority},loadedProfile,resolverAvailable:true});
    assert.equal(hidden.local_world_process,undefined);
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
    localFireProfile
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
