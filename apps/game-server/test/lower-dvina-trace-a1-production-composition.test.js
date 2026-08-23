import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLowerDvinaTraceA1Profile } from
  '../src/internal/lower-dvina-trace-a1-profile.js';
import { loadLowerDvinaTraceLocalFireProfile } from
  '../src/internal/lower-dvina-trace-local-fire-profile.js';
import { loadLowerDvinaTraceSpatialSemanticProfile } from
  '../src/internal/lower-dvina-trace-spatial-semantic-profile.js';
import { projectLowerDvinaTraceA1Capability } from
  '../src/runtime/lower-dvina-trace-a1-player-safe.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from
  '../src/runtime/releases/lower-dvina-trace-a1-production.js';
import { projectLowerDvinaTraceF1Capability } from
  '../src/runtime/releases/lower-dvina-trace-f1-production.js';
import { projectLowerDvinaTraceS1Capability } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';
import { createLowerDvinaTraceS1ProductionResolverFactory } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';
import { createLowerDvinaTraceSpatialSemanticModel } from
  '../src/runtime/lower-dvina-trace-s1-llm.js';
import { loadSpatialSemanticCommittedState } from
  '../src/infrastructure/postgres/spatial-semantic-readback.js';
import { createSpatialV3ProductionBindings } from
  '../src/runtime/releases/spatial-v3-production-binding-shared.js';

test('S1 profile loads revision 24 bundle', async () => {
  const loaded = await loadLowerDvinaTraceSpatialSemanticProfile();
  assert.equal(loaded.profile.scenario_definition_revision, 24);
});

test('S1 LLM receives profile-owned semantic context, never envelope refs', async () => {
  let modelRequest;
  const model = createLowerDvinaTraceSpatialSemanticModel({ roleRunner: { run: async ({ messages }) => {
    modelRequest = JSON.parse(messages[1].content);
    return { output: { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 'request',
      name: 'Каменная гряда', description: 'Низкие мокрые камни.' } };
  } } });
  await model({ schema: 'rus.s1_spatial_semantic_model_request.v1', request_id: 'request',
    semantic_context: { allowed_kind: 'local_natural_feature', period: '1230, Rus',
      region: 'Lower Dvina', place_type: 'shore', environment: 'wet sand',
      material_culture: 'wood and stone', ordinary_boundary: 'ordinary only' },
    proposal_schema: 'rus.s1_spatial_semantic_proposal.v1', proposal_example: {} });
  assert.equal(modelRequest.semantic_context.region, 'Lower Dvina');
  assert.equal(JSON.stringify(modelRequest).includes('envelope_ref'), false);
});

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
    const base = { position:{g5_anchor_id:'anchor:current'},
      items: [ignition,{item_id:'item:unlisted-fuel'}] };
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
    const hidden = projectLowerDvinaTraceF1Capability({playerSafeState:{
      position:{g5_anchor_id:'anchor:current'},items:[]},
      committedState:{position:{g5_anchor_id:'anchor:current'},items:[]},
      loadedProfile,resolverAvailable:true});
    assert.equal(hidden.local_world_process,undefined);
  });

test('S1 player-safe projection keeps current committed detail descriptive after reload',
  async () => {
    const committedState = { position: { position_id: 'position:shore' },
      spatial_semantic: [
        { status: 'committed', envelope_ref: 'envelope:shore', capacity_total: 2,
          consumed_count: 1, envelope: { position_ref: 'position:shore' },
          resolutions: [{ local_ref: 's1-local:shore', position_ref: 'position:shore',
            semantics: { name: 'Коряга', description: 'Сырая коряга у воды.',
              kind: 'local_natural_feature' } }] },
        { status: 'committed', envelope_ref: 'envelope:far', capacity_total: 1,
          consumed_count: 1, envelope: { position_ref: 'position:far' },
          resolutions: [{ local_ref: 's1-local:far', position_ref: 'position:far',
            semantics: { name: 'Пень', description: 'Пень далеко.',
              kind: 'ordinary_structure' } }] }
      ] };
    const projected = projectLowerDvinaTraceS1Capability({
      playerSafeState: { visible_objects: [{ entity_ref: 'existing' }], known_context: ['берег'] },
      committedState, resolverAvailable: true });
    assert.deepEqual(projected.visible_objects, [{ entity_ref: 'existing' }]);
    assert.deepEqual(projected.known_context, ['берег', 'Коряга: Сырая коряга у воды.']);
    assert.deepEqual(projected.spatial_semantic, { semantic_grounding_available: true,
      envelope_ref: 'envelope:shore', position_ref: 'position:shore' });
    const away = projectLowerDvinaTraceS1Capability({
      playerSafeState: { visible_objects: [], known_context: [] }, committedState: {
        ...committedState, position: { position_id: 'position:far' }
      }, resolverAvailable: true });
    assert.deepEqual(away.visible_objects, []);
    assert.deepEqual(away.known_context, ['Пень: Пень далеко.']);
    const returned = projectLowerDvinaTraceS1Capability({
      playerSafeState: { visible_objects: [], known_context: [] }, committedState,
      resolverAvailable: true });
    assert.deepEqual(returned.known_context, ['Коряга: Сырая коряга у воды.']);
  });

test('production binding installs S1 resolver without profile gating',
  async () => {
    const loadedProfile = { profile: { status: 'approved' } };
    const active = await capturedTraceRuntime(null, null, loadedProfile);
    assert.equal(typeof active.createTurnStepSpatialSemanticResolver, 'function');
    const absent = await capturedTraceRuntime(null, null, null);
    assert.equal(typeof absent.createTurnStepSpatialSemanticResolver, 'function');
  });

test('S1 production boundary rejects hostile envelopes before getters or storage',
  async () => {
    let connections = 0; let modelCalls = 0; let reads = 0;
    const resolver = createLowerDvinaTraceS1ProductionResolverFactory({
      pool: { query: async () => { connections += 1;
        throw new Error('storage must not be reached'); } },
      spatialSemanticModel: async () => { modelCalls += 1; } })({
        partyId: 'party:test' });
    const topLevel = {};
    Object.defineProperty(topLevel, 'request', { enumerable: true,
      get() { reads += 1; return {}; } });
    const nested = { request: {} };
    Object.defineProperty(nested.request, 'player_safe_state', {
      enumerable: true, get() { reads += 1; return {}; } });
    for (const hostile of [topLevel, nested]) {
      await assert.rejects(() => resolver(hostile),
        { code: 'TRACE_S1_INPUT_INVALID' });
    }
    assert.equal(reads, 0);
    assert.equal(connections, 0);
  assert.equal(modelCalls, 0);
});

test('S1 readback accepts exhausted committed envelope with its resolution', async () => {
  const envelope = { ...s1Envelope(), consumed_count: 1, state_version: 2 };
  const state = await loadSpatialSemanticCommittedState({ query: async (sql) =>
    sql.includes('party_spatial_semantic_envelopes')
      ? { rows: [{ envelope, capacity_total: 1, consumed_count: 1,
        state_version: 2, status: 'committed' }] }
      : { rows: [{ request_id: 'request:s1', local_ref: 's1-local:request:s1',
        envelope_ref: 'envelope:s1', position_ref: 'position:s1',
        root_turn_id: 'turn:s1', step_index: 1,
        semantics: { kind: 'local_natural_feature', name: 'Гряда',
          description: 'Мокрый камень.', mechanics_class: 'descriptive_only' } }] }
  }, 'party:s1');
  assert.equal(state[0].envelope_ref, 'envelope:s1');
  assert.equal(state[0].consumed_count, 1);
  assert.equal(state[0].resolutions.length, 1);
});

test('S1 resolver models one open result, then replays only current position marker', async () => {
  let modelCalls = 0;
  const envelope = s1Envelope();
  const pool = { query: async (sql) => {
    if (sql.includes('party_spatial_semantic_resolutions')) {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes('party_spatial_semantic_envelopes')) return { rowCount: 1,
      rows: [{ envelope, capacity_total: 1, consumed_count: 0,
        state_version: 1, status: 'committed' }] };
    assert.fail(`unexpected S1 query: ${sql}`);
  } };
  const resolver = createLowerDvinaTraceS1ProductionResolverFactory({ pool,
    spatialSemanticModel: async ({ request_id }) => {
      modelCalls += 1;
      return { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id,
        name: 'Незнакомый выступ', description: 'Сырым камнем выдается у воды.' };
    } })({ partyId: 'party:s1' });
  const planned = await resolver(s1Request());
  assert.equal(modelCalls, 1);
  assert.deepEqual(planned.spatial_semantic_atomic_write_plan.causal_identity, {
    request_id: 'request:s1', root_turn_id: 'turn:s1',
    action_ref: 's1:turn:s1:1', step_index: 1, actor_ref: 'actor:s1'
  });
  assert.equal('operation_digest' in planned.spatial_semantic_atomic_write_plan.causal_identity,
    false);
  const afterCrash = createLowerDvinaTraceS1ProductionResolverFactory({ pool,
    spatialSemanticModel: async ({ request_id }) => {
      modelCalls += 1;
      return { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id,
        name: 'Другой выступ', description: 'Ничего не было сохранено.' };
    } })({ partyId: 'party:s1' });
  await afterCrash(s1Request());
  assert.equal(modelCalls, 2);
  assert.equal(envelope.consumed_count, 0);

  const committed = { request_id: 'request:s1', local_ref: 's1-local:request:s1',
    envelope_ref: 'envelope:s1', position_ref: 'position:s1', root_turn_id: 'turn:s1',
    step_index: 1, semantics: { kind: 'local_natural_feature', name: 'Выступ',
      description: 'Камень у воды.', mechanics_class: 'descriptive_only' } };
  const replay = createLowerDvinaTraceS1ProductionResolverFactory({ pool: {
    query: async (sql) => sql.includes('party_spatial_semantic_resolutions')
      ? { rowCount: 1, rows: [committed] }
      : assert.fail(`unexpected replay write/read: ${sql}`)
  }, spatialSemanticModel: async () => { modelCalls += 1; } })({ partyId: 'party:s1' });
  const replayed = await replay(s1Request());
  assert.equal(replayed.spatial_semantic_atomic_write_plan, undefined);
  assert.equal(modelCalls, 2);
  await assert.rejects(() => replay(s1Request({ target: committed.local_ref })),
    { code: 'TRACE_S1_SCOPE_INVALID' });
});

test('exhausted S1 envelope exposes no resolver marker or model path', async () => {
  let reads = 0; let modelCalls = 0;
  const playerSafeState = projectLowerDvinaTraceS1Capability({
    playerSafeState: { visible_objects: [] }, resolverAvailable: true,
    committedState: { position: { position_id: 'position:s1' },
      spatial_semantic: [{ status: 'committed', envelope_ref: 'envelope:s1',
        capacity_total: 1, consumed_count: 1,
        envelope: { position_ref: 'position:s1' }, resolutions: [] }] }
  });
  assert.equal(playerSafeState.spatial_semantic, undefined);
  const request = s1Request();
  request.request.player_safe_state = playerSafeState;
  const resolver = createLowerDvinaTraceS1ProductionResolverFactory({
    pool: { query: async () => { reads += 1; return { rowCount: 0, rows: [] }; } },
    spatialSemanticModel: async () => { modelCalls += 1; }
  })({ partyId: 'party:s1' });
  await assert.rejects(() => resolver(request), { code: 'TRACE_S1_SCOPE_INVALID' });
  assert.equal(reads, 1, 'replay lookup remains read-only');
  assert.equal(modelCalls, 0);
});

test('S1 player-safe projection rejects hostile committed snapshots without reads',
  async () => {
    const base = { visible_objects: [{ entity_ref: 'visible' }] };
    let reads = 0;
    const getter = {};
    Object.defineProperty(getter, 'spatial_semantic', { enumerable: true,
      get() { reads += 1; return []; } });
    const withSymbol = { position: null, [Symbol('hidden')]: true };
    const custom = Object.create(null); custom.position = null;
    const cycle = {}; cycle.self = cycle;
    const shared = {}; const alias = { first: shared, second: shared };
    for (const committedState of [getter, withSymbol, custom, cycle, alias]) {
      const projected = projectLowerDvinaTraceS1Capability({
        playerSafeState: base, committedState,
        resolverAvailable: true });
      assert.deepEqual(projected, base);
      assert.equal(projected.spatial_semantic, undefined);
    }
    assert.equal(reads, 0);
  });

async function capturedTraceRuntime(actionProductionProfile,
  localFireProfile = null, spatialSemanticProfile = null) {
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
    spatialSemanticProfile
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

function s1Envelope() {
  return { envelope_ref: 'envelope:s1', kind: 'local_natural_feature',
    scope_kind: 'current_position_local_reference', mechanics_class: 'descriptive_only',
    baseline_ref: 'baseline:s1', g5_ref: 'g5:s1', g6_ref: 'g6:s1',
    position_ref: 'position:s1', property_ref: 'property:s1',
    function_ref: 'function:s1', environment_ref: 'environment:s1',
    semantic_context: { allowed_kind: 'local_natural_feature', period: 'period', region: 'region',
      place_type: 'place', environment: 'environment', material_culture: 'culture',
      ordinary_boundary: 'ordinary only' }, profile_ref: 'profile:s1',
    profile_version: 1, policy_ref: 'policy:s1', policy_version: 1,
    baseline_state_version: 0, g5_state_version: 0, g6_state_version: 0,
    position_state_version: 0, capacity_total: 1, consumed_count: 0, state_version: 1 };
}
function s1Request({ target = 'position:s1', position = 'position:s1',
  operation = undefined } = {}) {
  return { schema: 'turn_step_spatial_semantic_remainder_request_v1',
    operation: operation ?? { op: 'request_discovery', discovery_kind: 'look',
      actor_ref: 'actor:s1', target_refs: [target] }, request: { request_id: 'request:s1', root_turn_id: 'turn:s1',
      step_index: 1, committed_state_version: 4, player_safe_state: {
        spatial_semantic: { semantic_grounding_available: true,
          envelope_ref: 'envelope:s1', position_ref: 'position:s1' }, visible_objects: [] } },
    actor: { actor_id: 'actor:s1' }, working_projection: {},
    committed_state: { party_state: { turn_number: 4 }, position: { position_id: position } } };
}
