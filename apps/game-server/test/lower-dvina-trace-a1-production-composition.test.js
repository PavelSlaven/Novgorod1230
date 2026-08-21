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
    const ignition = { item_id:'item:ignition', state:{lifecycle_status:'active',
      local_fire_ignition_basis:{schema:
        'rus.items.local_fire_ignition_basis.v1'}} };
    const base = { items: [ignition,{item_id:'item:unlisted-fuel'}] };
    const active = projectLowerDvinaTraceF1Capability({playerSafeState:base,
      committedState:{position:{g5_anchor_id:'anchor:current'},
        items:[ignition],local_fire_runtime:[{process_state:{
          process_ref:'process:1',status:'active',scope_ref:'anchor:current',
          causal_basis_ref:'item:ignition',fuel_bindings:[{
            fuel_ref:'item:unlisted-fuel'}]}}]},loadedProfile,
      resolverAvailable:true});
    assert.deepEqual(active.local_world_process,{semantic_grounding_available:true,
      context_ref:loadedProfile.profile.context_ref,scope_ref:'anchor:current',
      ignition_basis_refs:['item:ignition'],active_process_refs:['process:1']});
    const hidden = projectLowerDvinaTraceF1Capability({playerSafeState:{items:[]},
      committedState:{position:{g5_anchor_id:'anchor:current'},items:[]},
      loadedProfile,resolverAvailable:true});
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
