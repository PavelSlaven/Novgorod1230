import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesOperationContract } from '@rus/npc-runtime';
import { createLowerDvinaTraceN1OwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-n1-owner-capabilities.js';
import { createLowerDvinaTraceS1ProductionResolverFactory,
  projectLowerDvinaTraceNpcS1Capability } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';
import { createTraceTurnRuntime } from
  '../src/runtime/releases/spatial-v3-production-trace-runtime.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceSpatialSemanticProfile } from
  '../src/internal/lower-dvina-trace-spatial-semantic-profile.js';
import { mergePhase7Capability } from
  '../src/runtime/lower-dvina-trace-phase-7-owner-registry.js';

test('N1 factory passes current O1 and A1 adapters into production runtime', () => {
  let captured;
  createTraceTurnRuntime({ partyPool: { query() {}, connect() {} },
    committer: { commit() {} }, env: {},
    config: { traceTurnDecisionSecret: 'test-secret' },
    ordinaryMaterializationProfile: null, ordinaryContainerContentsProfile: null,
    ordinaryStageBApproval: { model_identity: { provider: 'test', model: 'test',
      scope: 'turn_runtime', role_id: 'ordinary_materialization', config_hash: 'test' } }, actionProductionProfile: null,
    localFireProfile: null, spatialSemanticProfile: null,
    createNpcRuntimePorts: () => ({}),
    createPhase2RuntimeFactory: (input) => { captured = input; return {}; } });
  assert.equal(typeof captured.createNpcOwnerCapabilities, 'function');
});

test('N1 adapters expose only current NPC-safe refs and call selected owner', async () => {
  const calls = [];
  const factory = createLowerDvinaTraceN1OwnerCapabilitiesFactory({
    loadOrdinaryEnablement: async () => ({ execution_context: {
      candidate_context: { target_ref: 'seen-first' },
      context_bound_capabilities: [{ source_ref: 'seen-second' }] } }),
    createOrdinaryDiscoveryResolver: () => async (input) => {
      calls.push(['o1', input]);
      return { working_projection: input.working_projection, summary: 'o1',
        ordinary_materialization_atomic_write_plan: null };
    },
    createActionProductionOwner: () => ({
      async execute(input) {
        calls.push(['a1', input]);
        return { working_projection: input.working_projection, summary: 'a1',
          action_production_atomic_write_plan: null };
      }
    })
  });
  const state = stateWithNpc();
  const capabilities = await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, phase7Contracts: contracts(state) });
  assert.deepEqual(capabilities.map(({ operation }) => operation), [
    'request_discovery', 'request_item_use'
  ]);
  const discovery = capabilities[0];
  assert.equal(discovery.supports({ operation: { actor_ref: 'npc',
    discovery_kind: 'inspect', target_refs: ['seen-second'] } }), true);
  assert.equal(discovery.supports({ operation: { actor_ref: 'npc',
    discovery_kind: 'look', target_refs: ['seen-second'] } }), false);
  assert.equal(matchesOperationContract({ op: 'request_discovery',
    actor_ref: 'npc', discovery_kind: 'inspect', target_refs: ['seen-second'] },
  discovery.capability), true);
  assert.equal(matchesOperationContract({ op: 'request_discovery',
    actor_ref: 'npc', discovery_kind: 'look', target_refs: ['seen-second'] },
  discovery.capability), false);
  await discovery.execute(execution({ op: 'request_discovery', actor_ref: 'npc',
    discovery_kind: 'inspect', target_refs: ['seen-second'], query: 'осмотреть' }));
  const action = capabilities[1];
  await action.execute(execution({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'safe-source', use_kind: 'other', target_refs: ['safe-tool'],
    action_production: { source_refs: ['safe-source'], tool_refs: ['safe-tool'] } }));
  assert.equal(matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'safe-source', use_kind: 'other', target_refs: ['safe-tool'],
    action_production: { source_refs: ['safe-source'], tool_refs: ['safe-tool'] } },
  action.capability), true);
  assert.equal(matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'safe-source', use_kind: 'other', target_refs: ['hidden'],
    action_production: { source_refs: ['safe-source'], tool_refs: ['hidden'] } },
  action.capability), false);
  assert.deepEqual(calls.map(([name]) => name), ['o1', 'a1']);
  assert.equal(calls[1][1].actor.actor_id, 'npc');
  assert.equal(Object.hasOwn(calls[1][1], 'player_safe_state'), false);
});

test('N1 A1 subset capability stays valid beside existing item owner', () => {
  const contract = mergePhase7Capability({ owner: '@rus/items-property', allowed: [
    { item_ref: 'road-bag', use_kind: 'operate', target_refs: ['shore'] }
  ] }, { owner: '@rus/items-property', item_refs: ['source', 'tool'],
    use_kinds: ['other'], action_production: {
      source_refs: ['source', 'tool'], tool_refs: ['source', 'tool'] } });
  assert.equal(matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'road-bag', use_kind: 'operate', target_refs: ['shore'] }, contract), true);
  assert.equal(matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'source', use_kind: 'other', target_refs: ['tool'], action_production: {
      source_refs: ['source'], tool_refs: ['tool'] } }, contract), true);
  assert.equal(matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'source', use_kind: 'other', target_refs: ['hidden'], action_production: {
      source_refs: ['source'], tool_refs: ['hidden'] } }, contract), false);
});

test('N1 A1 advertises only owner-applicable refs and exact target binding', async () => {
  const state = stateWithNpc();
  state.items.push({ item_id: 'remote', holder_npc_id: 'npc' },
    { item_id: 'foreign', holder_npc_id: 'other' },
    { item_id: 'retired', holder_npc_id: 'npc' },
    { item_id: 'bound', holder_npc_id: 'npc' });
  const factory = createLowerDvinaTraceN1OwnerCapabilitiesFactory({
    createActionProductionOwner: () => ({
      referencesApplicable: async ({ source_refs, tool_refs }) =>
        [...source_refs, ...tool_refs].every((ref) =>
          ['safe-source', 'safe-tool'].includes(ref)),
      execute: async (input) => ({ working_projection: input.working_projection,
        summary: 'a1', action_production_atomic_write_plan: null })
    })
  });
  const [action] = await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, phase7Contracts: contracts(state) });
  assert.deepEqual(action.capability.action_production, {
    source_refs: ['safe-source', 'safe-tool'], tool_refs: ['safe-source', 'safe-tool']
  });
  assert.equal(action.supports({ operation: { actor_ref: 'npc',
    item_ref: 'safe-source', use_kind: 'other', target_refs: ['safe-tool'],
    action_production: { source_refs: ['safe-source'], tool_refs: ['safe-tool'] } } }), true);
  assert.equal(action.supports({ operation: { actor_ref: 'npc',
    item_ref: 'safe-source', use_kind: 'other', target_refs: [],
    action_production: { source_refs: ['safe-source'], tool_refs: ['safe-tool'] } } }), false);
});

test('N1 publishes current NPC-safe container access kinds', async () => {
  const state = stateWithNpc();
  state.items.push({ item_id: 'road-packet', template_id: 'packet',
    placement: { container_id: 'road-bag' } });
  state.containers = [{ container_id: 'road-bag', template_id: 'road-bag-template',
    holder_npc_id: 'npc', closure_state: 'tied', state_version: 1,
    state: { controller_npc_id: 'npc', location_ref: 'camp', zone_ref: 'shore' } },
  { container_id: 'player-pouch', template_id: 'pouch-template',
    holder_character_id: 'player', closure_state: 'closed', state_version: 1,
    state: { controller_character_id: 'player', location_ref: 'camp',
      zone_ref: 'shore', access_state: 'accessible' } },
  { container_id: 'remote-controlled', template_id: 'chest-template',
    closure_state: 'closed', state_version: 1,
    state: { controller_npc_id: 'npc', location_ref: 'far', zone_ref: 'road',
      access_state: 'accessible' } }];
  const factory = createLowerDvinaTraceN1OwnerCapabilitiesFactory({
    createActionProductionOwner: () => ({ execute: async () => ({}) })
  });
  const capabilities = await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, phase7Contracts: contracts(state) });
  const container = capabilities.find(
    ({ operation }) => operation === 'request_container_access');
  assert.equal(capabilities.some(
    ({ operation }) => operation === 'request_item_use'), true);
  assert.deepEqual(container.capability, { owner: '@rus/items-property', allowed: [{
    actor_ref: 'npc', container_ref: 'road-bag',
    access_kinds: ['open', 'close', 'unlock', 'force', 'open_and_view']
  }] });
  assert.equal(JSON.stringify(container.capability).includes('road-packet'), false);
  assert.equal(container.supports({ operation: { op: 'request_container_access',
    actor_ref: 'npc', container_ref: 'road-bag', access_kind: 'open_and_view' } }), true);
  assert.equal(container.supports({ operation: { op: 'request_container_access',
    actor_ref: 'npc', container_ref: 'player-pouch', access_kind: 'open' } }), false);
  assert.equal(matchesOperationContract({ op: 'request_container_access',
    actor_ref: 'npc', container_ref: 'road-bag', access_kind: 'open_and_view' },
  container.capability), true);
  assert.equal(matchesOperationContract({ op: 'request_container_access',
    actor_ref: 'other', container_ref: 'road-bag', access_kind: 'open_and_view' },
  container.capability), false);
  const resolved = await container.execute(execution({
    op: 'request_container_access', actor_ref: 'npc',
    container_ref: 'road-bag', access_kind: 'open_and_view'
  }));
  assert.deepEqual(resolved.write_fragments[0].value.payload.revealed_refs,
    ['road-packet']);
  assert.equal(resolved.ordinary_materialization_atomic_write_plan, undefined);
  assert.equal(resolved.working_projection.actor_id, 'npc');
  assert.equal(resolved.working_projection.items.some(
    ({ item_id }) => item_id === 'player-pouch'), false);
});

test('N1 omits adapters when current NPC-safe owner refs disappear', async () => {
  const factory = createLowerDvinaTraceN1OwnerCapabilitiesFactory({
    createOrdinaryDiscoveryResolver: () => async () => ({}),
    createActionProductionOwner: () => ({ execute: async () => ({}) })
  });
  const state = stateWithNpc();
  state.npcs[0].machine_state.spatial_zone_ref = 'elsewhere';
  state.items = [];
  assert.deepEqual(await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, phase7Contracts: contracts(state) }), []);
});

test('N1 discovery routes O1 first, then current NPC-safe S1 scope', async () => {
  let o1Calls = 0; let s1Calls = 0;
  const [bundle, spatialSemanticProfile] = await Promise.all([
    loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: 25 }),
    loadLowerDvinaTraceSpatialSemanticProfile()
  ]);
  const factory = createLowerDvinaTraceN1OwnerCapabilitiesFactory({
    loadOrdinaryEnablement: async () => ({ execution_context: {
      candidate_context: { target_ref: 'seen-first' },
      context_bound_capabilities: [] } }),
    createOrdinaryDiscoveryResolver: () => async (input) => {
      o1Calls += 1;
      return { working_projection: input.working_projection, summary: 'o1' };
    },
    createSpatialSemanticResolver: () => async (input) => {
      s1Calls += 1;
      assert.equal(input.request.player_safe_state, undefined);
      assert.deepEqual(input.request.npc_safe_state, {
        spatial_semantic: { semantic_grounding_available: true,
          position_ref: 'position:s1' }, visible_objects: [] });
      return { working_projection: input.working_projection, summary: 's1' };
    },
    spatialSemanticProfile,
    projectNpcSpatialSemanticCapability: () => ({
      spatial_semantic: { semantic_grounding_available: true,
        position_ref: 'position:s1' }, visible_objects: [] })
  });
  const state = stateWithNpc();
  state.position.position_id = 'position:s1';
  const [discovery] = await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, bundle, phase7Contracts: contracts(state) });
  await discovery.execute(execution({ op: 'request_discovery', actor_ref: 'npc',
    discovery_kind: 'inspect', target_refs: ['seen-first'] }));
  assert.equal(o1Calls, 1);
  assert.equal(s1Calls, 0);
  await discovery.execute(execution({ op: 'request_discovery', actor_ref: 'npc',
    discovery_kind: 'look', target_refs: ['position:s1'] }));
  assert.equal(s1Calls, 1);
});

test('N1 replays exhausted committed S1 local ref without descriptor model', async () => {
  let descriptorCalls = 0; let resolverInput;
  const [bundle, spatialSemanticProfile] = await Promise.all([
    loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: 25 }),
    loadLowerDvinaTraceSpatialSemanticProfile()
  ]);
  const state = stateWithNpc();
  state.position.position_id = 'position:s1';
  state.npcs[0].perception_snapshot.visible_objects.push({ entity_ref: {
    entity_id: 's1-local:shore' }, source_perception_ref: 'p:s1-local' });
  state.spatial_semantic = [{ status: 'committed', envelope_ref: 'envelope:s1',
    capacity_total: 1, consumed_count: 1,
    envelope: { position_ref: 'position:s1' }, resolutions: [s1Resolution()] }];
  const factory = createLowerDvinaTraceN1OwnerCapabilitiesFactory({
    createSpatialSemanticResolver: ({ partyId }) => {
      const resolve = createLowerDvinaTraceS1ProductionResolverFactory({ pool: {
        query: async (sql) => sql.includes('party_spatial_semantic_resolutions')
          ? { rowCount: 1, rows: [s1Resolution()] }
          : assert.fail(`unexpected S1 query: ${sql}`)
      }, resolveSpatialSemanticDescriptor: async () => { descriptorCalls += 1; } })({ partyId });
      return async (input) => { resolverInput = structuredClone(input); return resolve(input); };
    },
    spatialSemanticProfile,
    projectNpcSpatialSemanticCapability: ({ committedState, npcSnapshot }) =>
      projectLowerDvinaTraceNpcS1Capability({ npcSnapshot, committedState,
        resolverAvailable: true })
  });
  const [discovery] = await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, bundle, phase7Contracts: contracts(state) });
  const replayed = await discovery.execute({ ...execution({ op: 'request_discovery',
    actor_ref: 'npc', discovery_kind: 'inspect', target_refs: ['s1-local:shore'] }),
  request: { request_id: 'request:replay', root_turn_id: 'turn',
    committed_state_version: 1 } });
  assert.equal(replayed.spatial_semantic_atomic_write_plan, undefined);
  assert.equal(descriptorCalls, 0);
  assert.equal(resolverInput.request.player_safe_state, undefined);
  assert.deepEqual(resolverInput.request.npc_safe_state, { visible_objects: [{ entity_ref: {
    entity_kind: 'spatial_local_reference', entity_id: 's1-local:shore' },
  display_label: 'Коряга', recognition: 'recognized', visible_status: 'замечен' }],
  known_context: ['Коряга: Сырая коряга у воды.'] });
});

test('N1 removes S1 discovery when profile, resolver, or current scope is absent',
  async () => {
    const [bundle, profile] = await Promise.all([
      loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: 25 }),
      loadLowerDvinaTraceSpatialSemanticProfile()
    ]);
  const state = stateWithNpc();
  state.position.position_id = 'position:s1';
    for (const options of [
      { spatialSemanticProfile: null, createSpatialSemanticResolver: () => async () => ({}) },
      { spatialSemanticProfile: profile, createSpatialSemanticResolver: null },
      { spatialSemanticProfile: profile, createSpatialSemanticResolver: () => async () => ({}),
        projectNpcSpatialSemanticCapability: () => null }
    ]) {
      const factory = createLowerDvinaTraceN1OwnerCapabilitiesFactory(options);
      assert.deepEqual(await factory({ partyId: 'party', requestId: 'request',
        inputDigest: 'digest', state, bundle, phase7Contracts: contracts(state) }), []);
    }
  });


function stateWithNpc() {
  return { position: { location_ref: 'camp', zone_ref: 'shore', g6_ref: 'g6:camp' },
    items: [{ item_id: 'safe-source', holder_npc_id: 'npc' },
      { item_id: 'safe-tool', holder_npc_id: 'npc' }],
    npcs: [{ instance_id: 'npc', machine_state: { location_ref: 'camp',
      spatial_zone_ref: 'shore' }, perception_snapshot: { visible_objects: [
        { entity_ref: { entity_id: 'seen-first' }, source_perception_ref: 'p:1' },
        { entity_ref: { entity_id: 'seen-second' }, source_perception_ref: 'p:2' }
      ] } }] };
}

function contracts(state) {
  return { zhdanko: state.npcs[0], npcSemanticProfile: {
    profile_id: 'lower_dvina_trace_n1_npc_semantic_profile_v1', revision: 1,
    status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' } } };
}

function execution(operation) {
  return { operation, plan: { schema: 'npc_step_plan_v1' }, request: {
    root_turn_id: 'turn', step_index: 1, committed_state_version: 1 },
  working_projection: { actor_id: 'npc', items: [] }, prepared_chain_context: null };
}

function s1Resolution() {
  return { local_ref: 's1-local:shore', position_ref: 'position:s1',
    semantics: { name: 'Коряга', description: 'Сырая коряга у воды.',
      kind: 'local_natural_feature' } };
}
