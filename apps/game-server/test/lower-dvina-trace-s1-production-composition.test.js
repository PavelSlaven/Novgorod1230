import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTraceSpatialSemanticProfile } from
  '../src/internal/lower-dvina-trace-spatial-semantic-profile.js';
import { isExactLowerDvinaTraceSpatialSemanticProfile } from
  '../src/internal/lower-dvina-trace-spatial-semantic-profile.js';
import { projectLowerDvinaTraceS1Capability } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';
import { createLowerDvinaTraceS1ProductionResolverFactory } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';
import { loadSpatialSemanticCommittedState } from
  '../src/infrastructure/postgres/spatial-semantic-readback.js';
import { createSpatialSemanticAuthorityRepository } from
  '../src/infrastructure/postgres/spatial-semantic-authority-repository.js';
import { createSpatialSemanticAtomicWritePlan } from
  '../src/infrastructure/postgres/spatial-semantic-atomic-write-plan.js';
import { createSpatialV3ProductionBindings } from
  '../src/runtime/releases/spatial-v3-production-binding-shared.js';

test('S1 profile loads revision 24 bundle', async () => {
  const loaded = await loadLowerDvinaTraceSpatialSemanticProfile();
  assert.equal(loaded.profile.scenario_definition_revision, 24);
});

test('S1 exact profile rejects mismatched structural requirements', async () => {
  const loaded = await loadLowerDvinaTraceSpatialSemanticProfile();
  const bundle = s1ProfileBundle(loaded);
  assert.equal(isExactLowerDvinaTraceSpatialSemanticProfile(bundle, loaded), true);
  for (const mutate of [
    (profile) => { delete profile.envelopes[0].slot_key; },
    (profile) => { profile.envelopes[0].required_semantic_requirements = []; },
    (profile) => { profile.envelopes[0].structural_variant = 'descriptive_local_reference'; },
    (profile) => { profile.envelopes[0].topology = null; }
  ]) {
    const drifted = structuredClone(loaded);
    mutate(drifted.profile);
    drifted.profile_canonical_digest = canonicalDigest(drifted.profile);
    assert.equal(isExactLowerDvinaTraceSpatialSemanticProfile(s1ProfileBundle(drifted), drifted), false);
  }
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
    assert.deepEqual(projected.visible_objects, [{ entity_ref: 'existing' }, {
      entity_ref: { entity_kind: 'spatial_local_reference', entity_id: 's1-local:shore' },
      display_label: 'Коряга', recognition: 'recognized', visible_status: 'замечен'
    }]);
    assert.deepEqual(projected.known_context, ['берег', 'Коряга: Сырая коряга у воды.']);
    assert.deepEqual(projected.spatial_semantic, { semantic_grounding_available: true,
      position_ref: 'position:shore' });
    for (const hidden of ['envelope:shore', 'capacity_total', 'profile_ref',
      'formal_spatial_refs']) assert.equal(JSON.stringify(projected).includes(hidden), false);
    const away = projectLowerDvinaTraceS1Capability({
      playerSafeState: { visible_objects: [], known_context: [] }, committedState: {
        ...committedState, position: { position_id: 'position:far' }
      }, resolverAvailable: true });
    assert.deepEqual(away.visible_objects, [{
      entity_ref: { entity_kind: 'spatial_local_reference', entity_id: 's1-local:far' },
      display_label: 'Пень', recognition: 'recognized', visible_status: 'замечен'
    }]);
    assert.deepEqual(away.known_context, ['Пень: Пень далеко.']);
    const returned = projectLowerDvinaTraceS1Capability({
      playerSafeState: { visible_objects: [], known_context: [] }, committedState,
      resolverAvailable: true });
    assert.deepEqual(returned.known_context, ['Коряга: Сырая коряга у воды.']);
    assert.deepEqual(projectLowerDvinaTraceS1Capability({
      playerSafeState: { visible_objects: [], known_context: [] }, committedState,
      resolverAvailable: true }), returned);
  });

test('production binding activates S1 only for exact loaded revision 24 profile',
  async () => {
    const loadedProfile = await loadLowerDvinaTraceSpatialSemanticProfile();
    const active = await capturedTraceRuntime(loadedProfile);
    assert.equal(typeof active.createTurnStepSpatialSemanticResolver, 'function');
    assert.equal(active.spatialSemanticProfile, loadedProfile);
    const absent = await capturedTraceRuntime(null);
    assert.equal(absent.createTurnStepSpatialSemanticResolver, null);
    assert.equal(absent.spatialSemanticProfile, null);
    const historical = structuredClone(loadedProfile);
    historical.profile.revision = 1;
    historical.profile.scenario_definition_revision = 23;
    const inactive = await capturedTraceRuntime(historical);
    assert.equal(inactive.createTurnStepSpatialSemanticResolver, null);
    assert.equal(inactive.spatialSemanticProfile, null);
  });

test('S1 production boundary rejects hostile envelopes before getters or storage',
  async () => {
    let connections = 0; let modelCalls = 0; let reads = 0;
    const resolver = createLowerDvinaTraceS1ProductionResolverFactory({
      pool: { query: async () => { connections += 1;
        throw new Error('storage must not be reached'); } },
      resolveSpatialSemanticDescriptor: async () => { modelCalls += 1; } })({
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
          description: 'Мокрый камень.', semantic_requirements: [] },
        formal_spatial_refs: formalRefs('s1-local:request:s1') }] }
  }, 'party:s1');
  assert.equal(state[0].envelope_ref, 'envelope:s1');
  assert.equal(state[0].consumed_count, 1);
  assert.equal(state[0].resolutions.length, 1);
  assert.notEqual(state[0].resolution, state[0].resolutions[0]);
});

test('S1 local ref stays visible inside open one-space without a creation marker', () => {
  const projected = projectLowerDvinaTraceS1Capability({ resolverAvailable: true,
    playerSafeState: { visible_objects: [], known_context: [] }, committedState: {
      position: { position_id: 'position:inside' }, spatial_semantic: [{
        status: 'committed', envelope_ref: 'envelope:base', capacity_total: 1,
        consumed_count: 1, envelope: { position_ref: 'position:base' }, resolutions: [{
          local_ref: 's1-local:structure', position_ref: 'position:base',
          semantics: { kind: 'ordinary_structure', name: 'Загородка', description: 'Плетень.' },
          formal_spatial_refs: { structural_variant: 'open_one_space',
            position_ref: 'position:inside' }
        }]
      }]
    } });
  assert.equal(projected.visible_objects[0].entity_ref.entity_id, 's1-local:structure');
  assert.equal(projected.spatial_semantic, undefined);
  assert.equal(JSON.stringify(projected).includes('position:inside'), false);
});

test('S1 initial authority rejects ambiguity and preserves zero or one eligible outcome', async () => {
  const rows = ['envelope:b', 'envelope:a'].map((envelope_ref) => {
    const envelope = { ...s1Envelope(), envelope_ref };
    return { envelope, capacity_total: 1, consumed_count: 0, state_version: 1,
      status: 'committed' };
  });
  const authority = createSpatialSemanticAuthorityRepository({ pool: { query: async (sql) => {
    assert.match(sql, /consumed_count < capacity_total[\s\S]*LIMIT 2/u);
    assert.doesNotMatch(sql, /ORDER BY/u);
    const eligible = rows.filter((row) => row.status === 'committed'
      && row.consumed_count < row.capacity_total);
    return { rowCount: Math.min(eligible.length, 2), rows: eligible.slice(0, 2) };
  } } });
  await assert.rejects(() => authority.loadPreModelAtPosition({ party_id: 'party:s1',
    position_ref: 'position:s1' }), { code: 'S1_SPATIAL_AUTHORITY_CONFLICT' });
  rows.find((row) => row.envelope.envelope_ref === 'envelope:b').consumed_count = 1;
  rows.find((row) => row.envelope.envelope_ref === 'envelope:b').envelope.consumed_count = 1;
  rows.find((row) => row.envelope.envelope_ref === 'envelope:b').state_version = 2;
  rows.find((row) => row.envelope.envelope_ref === 'envelope:b').envelope.state_version = 2;
  assert.equal((await authority.loadPreModelAtPosition({ party_id: 'party:s1',
    position_ref: 'position:s1' })).envelope_ref, 'envelope:a');
  rows.find((row) => row.envelope.envelope_ref === 'envelope:a').consumed_count = 1;
  rows.find((row) => row.envelope.envelope_ref === 'envelope:a').envelope.consumed_count = 1;
  rows.find((row) => row.envelope.envelope_ref === 'envelope:a').state_version = 2;
  rows.find((row) => row.envelope.envelope_ref === 'envelope:a').envelope.state_version = 2;
  await assert.rejects(() => authority.loadPreModelAtPosition({ party_id: 'party:s1',
    position_ref: 'position:s1' }), { code: 'S1_SPATIAL_AUTHORITY_MISSING' });
});

test('S1 ambiguous initial authority reaches neither descriptor model nor writes', async () => {
  let modelCalls = 0; let writes = 0;
  const envelopes = ['envelope:a', 'envelope:b'].map((envelope_ref) => ({
    envelope: { ...s1Envelope(), envelope_ref }, capacity_total: 1,
    consumed_count: 0, state_version: 1, status: 'committed'
  }));
  const resolver = createLowerDvinaTraceS1ProductionResolverFactory({ pool: {
    query: async (sql) => {
      if (!/^SELECT/u.test(sql.trim())) writes += 1;
      return sql.includes('party_spatial_semantic_resolutions')
        ? { rowCount: 0, rows: [] }
        : { rowCount: 2, rows: envelopes };
    }
  }, resolveSpatialSemanticDescriptor: async () => { modelCalls += 1; } })({ partyId: 'party:s1' });
  await assert.rejects(() => resolver(s1Request()),
    { code: 'S1_SPATIAL_AUTHORITY_CONFLICT' });
  assert.equal(modelCalls, 0);
  assert.equal(writes, 0);
});

test('S1 resolver models one open result, then replays current visible local ref', async () => {
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
    resolveSpatialSemanticDescriptor: async ({ request: { request_id } }) => {
      modelCalls += 1;
      return { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id,
        name: 'Незнакомый выступ', description: 'Сырым камнем выдается у воды.',
        semantic_requirements: [] };
    } })({ partyId: 'party:s1' });
  const planned = await resolver(s1Request());
  assert.equal(modelCalls, 1);
  assert.deepEqual(planned.spatial_semantic_atomic_write_plan.causal_identity, {
    request_id: 'request:s1', root_turn_id: 'turn:s1',
    action_ref: 's1:turn:s1:1', step_index: 1, actor_ref: 'actor:s1'
  });
  assert.equal('operation_digest' in planned.spatial_semantic_atomic_write_plan.causal_identity,
    false);
  const forged = structuredClone(planned.spatial_semantic_atomic_write_plan);
  forged.resolution.formal_spatial_proposal.rows[0].record.position_node_id = 'position:forged';
  assert.throws(() => createSpatialSemanticAtomicWritePlan(forged),
    { code: 'SPATIAL_SEMANTIC_PLAN_INVALID' });
  const afterCrash = createLowerDvinaTraceS1ProductionResolverFactory({ pool,
    resolveSpatialSemanticDescriptor: async ({ request: { request_id } }) => {
      modelCalls += 1;
      return { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id,
        name: 'Другой выступ', description: 'Ничего не было сохранено.',
        semantic_requirements: [] };
    } })({ partyId: 'party:s1' });
  await afterCrash(s1Request());
  assert.equal(modelCalls, 2);
  assert.equal(envelope.consumed_count, 0);

  const committed = { request_id: 'request:s1', local_ref: 's1-local:request:s1',
    envelope_ref: 'envelope:s1', position_ref: 'position:s1', root_turn_id: 'turn:s1',
    step_index: 1, semantics: { kind: 'local_natural_feature', name: 'Выступ',
      description: 'Камень у воды.', semantic_requirements: [] },
    formal_spatial_refs: formalRefs('s1-local:request:s1') };
  const replay = createLowerDvinaTraceS1ProductionResolverFactory({ pool: {
    query: async (sql) => sql.includes('party_spatial_semantic_resolutions')
      ? { rowCount: 1, rows: [committed] }
      : assert.fail(`unexpected replay write/read: ${sql}`)
  }, resolveSpatialSemanticDescriptor: async () => { modelCalls += 1; } })({ partyId: 'party:s1' });
  const replayed = await replay(s1Request());
  assert.equal(replayed.spatial_semantic_atomic_write_plan, undefined);
  assert.equal(modelCalls, 2);
  const localRequest = s1Request({ target: committed.local_ref, requestId: 'request:next',
    discoveryKind: 'inspect' });
  localRequest.request.player_safe_state.visible_objects = [{ entity_ref: {
    entity_kind: 'spatial_local_reference', entity_id: committed.local_ref },
  display_label: 'Выступ', recognition: 'recognized', visible_status: 'замечен' }];
  const targeted = await replay(localRequest);
  assert.equal(targeted.summary, 'Камень у воды.');
  assert.equal(modelCalls, 2);
  await assert.rejects(() => replay(s1Request({ discoveryKind: 'inspect' })),
    { code: 'TRACE_S1_SCOPE_INVALID' });
  assert.equal(modelCalls, 2);
  await assert.rejects(() => replay(s1Request({ target: 'unknown-local-ref', requestId: 'request:forged' })),
    { code: 'TRACE_S1_SCOPE_INVALID' });
  const hidden = s1Request({ target: committed.local_ref, requestId: 'request:hidden' });
  await assert.rejects(() => replay(hidden), { code: 'TRACE_S1_SCOPE_INVALID' });
  const away = s1Request({ target: committed.local_ref, position: 'position:away',
    requestId: 'request:away' });
  away.request.player_safe_state.visible_objects = structuredClone(localRequest.request.player_safe_state.visible_objects);
  await assert.rejects(() => replay(away), { code: 'TRACE_S1_SCOPE_INVALID' });
});

async function capturedTraceRuntime(spatialSemanticProfile = null) {
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
    actionProductionProfile: null,
    localFireProfile: null,
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

function s1ProfileBundle(loaded) {
  const { profile, artifact_digest, publication_identity } = loaded;
  return { definition_revision: 24, spatial_semantic_profile: profile,
    artifact_pins: { spatial_semantic_profile: { digest: artifact_digest,
      canonical_digest: loaded.profile_canonical_digest,
      revision: profile.revision, schema: profile.schema } },
    materialization_bindings: { binding_set_id:
      'lower_dvina_trace_phase_1a_materialization_bindings_v20', status: 'approved',
      scenario_definition_revision: 24, spatial_semantic_materialization: {
        profile_ref: { id: profile.profile_id, revision: profile.revision,
          schema: profile.schema, digest: artifact_digest },
        authority_provisioning: 'atomic_new_game_first_entry_p16',
        fallback_policy: 'forbidden' } },
    ...publication_identity };
}

function s1Envelope() {
  return { envelope_ref: 'envelope:s1', kind: 'local_natural_feature',
    scope_kind: 'current_position_local_reference', structural_variant: 'descriptive_local_reference',
    available_mechanics: [], required_semantic_requirements: [], topology: null,
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
function formalRefs(local_ref) {
  return { schema: 'rus.s1_formal_spatial_refs.v1', status: 'materialized',
    structural_variant: 'descriptive_local_reference', local_ref,
    placement_ref: `placement:${local_ref}`, g6_instance_ref: null, position_ref: null,
    portal_ref: null, movement_edge_refs: [], visibility_link_refs: [] };
}
function s1Request({ target = 'position:s1', position = 'position:s1', requestId = 'request:s1',
  discoveryKind = 'look', operation = undefined } = {}) {
  return { schema: 'turn_step_spatial_semantic_remainder_request_v1',
    operation: operation ?? { op: 'request_discovery', discovery_kind: discoveryKind,
      actor_ref: 'actor:s1', target_refs: [target] }, request: { request_id: requestId, root_turn_id: 'turn:s1',
      step_index: 1, committed_state_version: 4, player_safe_state: {
        spatial_semantic: { semantic_grounding_available: true,
          position_ref: 'position:s1' }, visible_objects: [] } },
    actor: { actor_id: 'actor:s1' }, working_projection: {},
    committed_state: { party_state: { turn_number: 4 }, position: { position_id: position } } };
}
