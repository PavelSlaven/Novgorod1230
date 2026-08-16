import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLowerDvinaTraceOrdinaryMaterializationProfile } from
  '../src/internal/lower-dvina-trace-ordinary-materialization-profile.js';
import { createLowerDvinaTraceO2aAmbientPort } from
  '../src/runtime/lower-dvina-trace-o2a-ambient-port.js';
import { createSpatialV3ProductionBindings } from
  '../src/runtime/releases/spatial-v3-production-binding-shared.js';

test('the exact approved first-entry binding exposes only its authored ambient portion', async () => {
  const profile = await loadLowerDvinaTraceOrdinaryMaterializationProfile({ rootDir: process.cwd() });
  const port = createLowerDvinaTraceO2aAmbientPort({ profile, committedState: {
    actor_id: 'mikula', position: { g6_id: 'trace_ld_v1_g6_wreck_shore',
      location_ref: 'trace_ld_v1_loc_wreck_shore' }
  } });
  assert.equal(typeof port, 'function');
  const result = await port({ operation_identity: { root_turn_id: 'turn', step_index: 1,
    operation_ref: 'create_entity' }, request: { context_pin_ref: 'committed',
    source_ref: 'committed', portion_profile_ref: 'committed',
    quantity: { value: 1, unit: 'handful' }, mass_grams: 300,
    destination_ref: 'mikula' } });
  assert.equal(result.pass, true);
  assert.equal(result.proposal.semantic_descriptor.name, 'горсть мокрого песка');
});

test('O2a ambient admission is absent for a drifted binding', async () => {
  const profile = await loadLowerDvinaTraceOrdinaryMaterializationProfile({ rootDir: process.cwd() });
  assert.equal(createLowerDvinaTraceO2aAmbientPort({ profile, committedState: {
    actor_id: 'mikula', position: { g6_id: 'other', location_ref: 'trace_ld_v1_loc_wreck_shore' }
  } }), null);
});

test('production composition threads the active O2a strict admission policy', async () => {
  const profile = await loadLowerDvinaTraceOrdinaryMaterializationProfile({
    rootDir: process.cwd()
  });
  const active = await capturedTraceRuntime(profile);
  assert.equal(active.requireTurnStepAmbientOrdinaryAdmission, true);
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
