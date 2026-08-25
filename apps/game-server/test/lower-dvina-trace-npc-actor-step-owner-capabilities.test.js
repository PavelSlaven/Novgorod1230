import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesOperationContract } from '@rus/npc-runtime';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { createTraceTurnRuntime } from
  '../src/runtime/releases/spatial-v3-production-trace-runtime.js';
import { mergePhase7Capability } from
  '../src/runtime/lower-dvina-trace-phase-7-owner-registry.js';

test('runtime injects owner adapters and handoffs', async () => {
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
  const npc = { instance_id: 'npc', machine_state: {}, perception_snapshot: {
    present_actors: [{ actor_ref: 'visible',
      source_perception_ref: 'seen:visible' }] }, relationships: [] };
  const capabilities = await captured.createNpcOwnerCapabilities({
    partyId: 'party', requestId: 'request', inputDigest: 'digest',
    state: { party_id: 'party', party_state: { turn_number: 1,
      state_version: 1 }, items: [], npcs: [npc, {
        instance_id: 'visible' }] },
    phase7Contracts: { zhdanko: npc, npcSemanticProfile: {
      profile_id: 'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
      status: 'approved', activation_boundary: { phase: 'phase_7',
        npc_participant_slot_ref: 'zhdanko_storehouse_controller' } } }
  });
  assert.ok(capabilities.some(({ operation }) =>
    operation === 'request_conversation'));
});

test('adapters expose NPC-safe refs and call owner', async () => {
  const calls = [];
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
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
  assert.ok(discovery.supports({ operation: { actor_ref: 'npc',
    discovery_kind: 'inspect', target_refs: ['seen-second'] } }));
  assert.ok(!discovery.supports({ operation: { actor_ref: 'npc',
    discovery_kind: 'look', target_refs: ['seen-second'] } }));
  assert.ok(matchesOperationContract({ op: 'request_discovery',
    actor_ref: 'npc', discovery_kind: 'inspect', target_refs: ['seen-second'] },
  discovery.capability));
  assert.ok(!matchesOperationContract({ op: 'request_discovery',
    actor_ref: 'npc', discovery_kind: 'look', target_refs: ['seen-second'] },
  discovery.capability));
  await discovery.execute(execution({ op: 'request_discovery', actor_ref: 'npc',
    discovery_kind: 'inspect', target_refs: ['seen-second'], query: 'осмотреть' }));
  const action = capabilities[1];
  await action.execute(execution({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'safe-source', use_kind: 'other', target_refs: ['safe-tool'],
    action_production: { source_refs: ['safe-source'], tool_refs: ['safe-tool'] } }));
  assert.ok(matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'safe-source', use_kind: 'other', target_refs: ['safe-tool'],
    action_production: { source_refs: ['safe-source'], tool_refs: ['safe-tool'] } },
  action.capability));
  assert.ok(!matchesOperationContract({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'safe-source', use_kind: 'other', target_refs: ['hidden'],
    action_production: { source_refs: ['safe-source'], tool_refs: ['hidden'] } },
  action.capability));
  assert.deepEqual(calls.map(([name]) => name), ['o1', 'a1']);
  assert.equal(calls[1][1].actor.actor_id, 'npc');
  assert.ok(!Object.hasOwn(calls[1][1], 'player_safe_state'));
});

test('A1 subset capability merges with item owner', () => {
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

test('A1 capability needs no Strength probe', async () => {
  const state = stateWithNpc();
  const phase7Contracts = contracts(state);
  delete phase7Contracts.genericCheckContext;
  let executed = false;
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createActionProductionOwner: () => ({
      referencesApplicable: async () => true,
      execute: async (input) => {
        executed = input.check_result?.outcome === 'clean_success';
        return { working_projection: input.working_projection, summary: 'a1' };
      }
    })
  });
  const capabilities = await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, phase7Contracts });
  const action = capabilities.find(({ operation }) => operation === 'request_item_use');
  assert.ok(action);
  await action.execute({ ...execution({ op: 'request_item_use', actor_ref: 'npc',
    item_ref: 'safe-source', use_kind: 'other', target_refs: ['safe-tool'],
    action_production: { source_refs: ['safe-source'], tool_refs: ['safe-tool'] } }),
  check_result: { outcome: 'clean_success' } });
  assert.ok(executed);
});

test('A1 advertises owner refs and target binding', async () => {
  const state = stateWithNpc();
  state.items.push({ ...npcItem('remote'), placement: { holder_npc_id: 'npc',
    holder_character_id: null, container_id: null, physical_position: 'worn' } }, { ...npcItem('foreign'),
    holder_npc_id: 'other', placement: { holder_npc_id: 'other',
      holder_character_id: null, container_id: null, physical_position: 'hands' } },
  { ...npcItem('retired'), condition_state: 'retired', state: {
    ...npcItem('retired').state, lifecycle_status: 'retired' } },
  { ...npcItem('bound'), placement: { holder_npc_id: 'npc',
    holder_character_id: null, container_id: null, physical_position: 'worn' } });
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
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

test('A1 admits revealed open-container items to P16',
  async () => {
    const state = stateWithNpc();
    state.items = [containedNpcItem('stored-source', 'open-kit'),
      containedNpcItem('stored-tool', 'open-kit')];
    state.containers = [npcOpenContainer('open-kit')];
    addNpcEvidence(state, ['stored-source', 'stored-tool']);
    addNpcContainerInventory(state);
    let received;
    const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
      createActionProductionOwner: () => ({
        referencesApplicable: async () => true,
        execute: async (input) => {
          received = input;
          return { working_projection: input.working_projection, summary: 'a1',
            action_production_atomic_write_plan: { plan_id: 'shared-p16' } };
        }
      })
    });
    const capabilities = await factory({ partyId: 'party', requestId: 'request',
      inputDigest: 'digest', state, phase7Contracts: contracts(state) });
    const action = capabilities.find(({ operation }) => operation === 'request_item_use');
    assert.ok(action, JSON.stringify(capabilities.map(({ operation }) => operation)));
    assert.deepEqual(action.capability.action_production, {
      source_refs: ['stored-source', 'stored-tool'],
      tool_refs: ['stored-source', 'stored-tool']
    });
    const result = await action.execute(execution({ op: 'request_item_use',
      actor_ref: 'npc', item_ref: 'stored-source', use_kind: 'other',
      target_refs: ['stored-tool'], action_production: {
        source_refs: ['stored-source'], tool_refs: ['stored-tool'] } }));
    assert.deepEqual(received.operation.action_production, {
      source_refs: ['stored-source'], tool_refs: ['stored-tool'] });
    assert.deepEqual(result.action_production_atomic_write_plan,
      { plan_id: 'shared-p16' });
  });

test('A1 accounts contained source mass',
  async () => {
    const state = stateWithNpc();
    state.items = [containedNpcItem('stored-source', 'open-kit'),
      containedNpcItem('stored-tool', 'open-kit')];
    state.containers = [npcOpenContainer('open-kit')];
    addNpcEvidence(state, ['stored-source', 'stored-tool']);
    state.player_profile = { attributes: { strength: { value: 10 } } };
    addNpcContainerInventory(state);
    let applyWorkingProjection;
    const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
      createActionProductionOwner: ({ applyWorkingProjection: apply }) => {
        applyWorkingProjection = apply;
        return { referencesApplicable: async () => true,
          execute: async () => ({}) };
      }
    });
    await factory({ partyId: 'party', requestId: 'request', inputDigest: 'digest',
      state, phase7Contracts: contracts(state) });
    const projection = applyWorkingProjection({
      working_projection: { actor_id: 'npc' },
      actor: { actor_id: 'npc', attributes: { strength: { value: 10 } } },
      action_production_atomic_write_plan: { source_updates: [{
        item_id: 'stored-source', after_item: {
          state: { lifecycle_status: 'retired' }
        } }], result_items: [] }
    });
    assert.equal(projection.inventory.total_weight.grams, 200);
    assert.equal(projection.items.some(({ item_id }) =>
      item_id === 'stored-source'), false);
  });

test('A1 omits concealed/closed rejected container contents',
  async () => {
  const state = stateWithNpc();
  state.items = [containedNpcItem('closed-source', 'closed-kit'),
    containedNpcItem('hidden-tool', 'open-kit', { visible: false })];
  state.containers = [npcOpenContainer('open-kit'), npcOpenContainer('closed-kit', {
    closure_state: 'closed', state: { access_state: 'closed' }
  })];
  addNpcContainerInventory(state);
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createActionProductionOwner: () => ({ referencesApplicable: async ({ source_refs }) =>
      source_refs[0] !== 'closed-source',
      execute: async () => ({}) })
  });
  const capabilities = await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, phase7Contracts: contracts(state) });
  assert.ok(!capabilities.some(({ operation }) => operation === 'request_item_use'));
});

test('publishes NPC-safe container access', async () => {
  const state = stateWithNpc();
  state.items.push({ ...npcItem('road-packet'), template_id: null,
    holder_npc_id: null, placement: { holder_npc_id: null,
      holder_character_id: null, container_id: 'road-bag',
      physical_position: null } });
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
  state.container_placements = state.containers.map(({ container_id }) => ({
    party_id: 'party', container_id, anchor_id: 'camp-anchor',
    parent_container_id: null, holder_npc_id: container_id === 'road-bag'
      ? 'npc' : null, holder_character_id: container_id === 'player-pouch'
      ? 'player' : null, physical_position: container_id === 'road-bag'
    ? 'worn' : container_id === 'player-pouch' ? 'worn' : null,
    equipment_slot_category_id: null
  }));
  state.container_profiles = [{ template_id: 'road-bag-template', capacity: 4,
    packing_slot_cost: 1, carry_form: 'regular', mass_grams: 500,
    external_hand_cost: 0 }, { template_id: 'pouch-template', capacity: 4,
    packing_slot_cost: 1, carry_form: 'regular', mass_grams: 100,
    external_hand_cost: 0 }, { template_id: 'chest-template', capacity: 4,
    packing_slot_cost: 1, carry_form: 'regular', mass_grams: 1000,
    external_hand_cost: 0 }];
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
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
    access_kinds: ['open', 'close', 'open_and_view'],
    resolution: 'domain_request'
  }, { actor_ref: 'npc', container_ref: 'road-bag',
    access_kinds: ['unlock', 'force'], resolution: 'generic_check' }] });
  assert.ok(!JSON.stringify(container.capability).includes('road-packet'));
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

test('checked container access uses generic check', async () => {
  const state = stateWithNpc();
  state.containers = [{ container_id: 'locked-kit', template_id: 'locked-kit-template',
    holder_npc_id: 'npc', open_state: 'locked', state_version: 1,
    state: { controller_npc_id: 'npc', location_ref: 'camp', zone_ref: 'shore' } }];
  state.container_placements = [{ party_id: 'party', container_id: 'locked-kit',
    anchor_id: 'camp-anchor', parent_container_id: null, holder_npc_id: 'npc',
    holder_character_id: null, physical_position: 'worn',
    equipment_slot_category_id: null }];
  state.container_profiles = [{ template_id: 'locked-kit-template', capacity: 4,
    packing_slot_cost: 1, carry_form: 'regular', mass_grams: 100,
    external_hand_cost: 0 }];
  const capabilities = await createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory()({
    partyId: 'party', requestId: 'request', inputDigest: 'digest', state,
    phase7Contracts: contracts(state) });
  const container = capabilities.find(
    ({ operation }) => operation === 'request_container_access');
  assert.deepEqual(container.capability.allowed, [{ actor_ref: 'npc',
    container_ref: 'locked-kit', access_kinds: ['close'],
    resolution: 'domain_request' }, { actor_ref: 'npc',
    container_ref: 'locked-kit',
    access_kinds: ['open', 'unlock', 'force', 'open_and_view'],
    resolution: 'generic_check' }]);
  const force = { op: 'request_container_access', actor_ref: 'npc',
    container_ref: 'locked-kit', access_kind: 'force' };
  assert.equal(matchesOperationContract(force, container.capability,
    'domain_request'), false);
  assert.equal(matchesOperationContract(force, container.capability,
    'generic_check'), true);
  const checked = execution(force);
  checked.plan.resolution = 'generic_check';
  checked.check_result = { outcome: { band: 'success' } };
  const resolved = await container.execute(checked);
  assert.equal(resolved.write_fragments[0].value.payload.state_patch.open_state,
    'open');
});

test('omits adapters without NPC-safe refs', async () => {
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    createOrdinaryDiscoveryResolver: () => async () => ({}),
    createActionProductionOwner: () => ({ execute: async () => ({}) })
  });
  const state = stateWithNpc();
  state.npcs[0].machine_state.spatial_zone_ref = 'elsewhere';
  state.items = [];
  assert.deepEqual(await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, phase7Contracts: contracts(state) }), []);
});

test('O1 uses NPC G6, not player position', async () => {
  const state = stateWithNpc();
  state.position = { location_ref: 'player-camp', zone_ref: 'player-zone',
    g5_anchor_id: 'player-anchor', g6_ref: 'g6:player' };
  Object.assign(state.npcs[0], { anchor_id: 'npc-anchor' });
  Object.assign(state.npcs[0].machine_state, { location_ref: 'npc-storehouse',
    spatial_zone_ref: 'npc-inside', g6_ref: 'g6:npc' });
  let ownerInput;
  const factory = createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
    loadOrdinaryEnablement: async ({ scopeRef }) => {
      assert.deepEqual(scopeRef, { entity_kind: 'g6', entity_id: 'g6:npc' });
      return { execution_context: { candidate_context: { target_ref: 'seen-first' },
        context_bound_capabilities: [] } };
    },
    createOrdinaryDiscoveryResolver: () => async (input) => {
      ownerInput = input;
      return { working_projection: input.working_projection, summary: 'o1' };
    }
  });
  const [discovery] = await factory({ partyId: 'party', requestId: 'request',
    inputDigest: 'digest', state, phase7Contracts: contracts(state) });
  await discovery.execute(execution({ op: 'request_discovery', actor_ref: 'npc',
    discovery_kind: 'inspect', target_refs: ['seen-first'] }));
  assert.deepEqual(ownerInput.committed_state.position, {
    location_ref: 'npc-storehouse', zone_ref: 'npc-inside',
    g5_anchor_id: 'npc-anchor', g6_ref: 'g6:npc'
  });
});

function stateWithNpc() {
  return { party_id: 'party', party_state: { state_version: 1, turn_number: 0 },
    position: { location_ref: 'camp', zone_ref: 'shore', g5_anchor_id: 'camp-anchor',
      g6_ref: 'g6:camp' },
    items: [npcItem('safe-source'), npcItem('safe-tool')],
    npcs: [{ instance_id: 'npc', anchor_id: 'camp-anchor', machine_state: { location_ref: 'camp',
      spatial_zone_ref: 'shore', g6_ref: 'g6:camp', load_category: 'light' }, perception_snapshot: { visible_objects: [
        { entity_ref: { entity_id: 'seen-first' }, source_perception_ref: 'p:1' },
        { entity_ref: { entity_id: 'seen-second' }, source_perception_ref: 'p:2' }
      ] } }] };
}

function contracts(state) {
  return { zhdanko: state.npcs[0], npcSemanticProfile: {
    profile_id: 'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
    status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' } },
    genericCheckContext: { attributes: [{ attribute_ref: 'strength',
      label: 'сила', value: 10 }] } };
}

function npcItem(item_id) {
  const snapshot = { schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1, provenance: { source_kind: 'ordinary_direct_action_result',
      root_turn_id: 'turn:source', step_index: 1, operation_ref: 'source',
      origin_kind: 'crafted', source_refs: ['safe-source'] }, mechanics: {
      mass_grams: 100, external_hand_cost: 1, carry_form: 'regular',
      packing_slot_cost: 1, quantity: null, container: null } };
  return { item_id, holder_npc_id: 'npc', condition_state: 'serviceable',
    placement: { holder_npc_id: 'npc', holder_character_id: null,
      container_id: null, physical_position: 'hands' }, state: {
      lifecycle_status: 'active', runtime_instance_mechanics_snapshot: snapshot },
    runtime_instance_mechanics_snapshot: structuredClone(snapshot) };
}

function containedNpcItem(item_id, container_id, extra = {}) {
  const item = npcItem(item_id);
  return { ...item, holder_npc_id: null, ownership: { owner_npc_id: 'npc',
    owner_character_id: null, owner_party: false, controller_npc_id: 'npc',
    controller_character_id: null, claim_state: 'owned' }, placement: {
      holder_npc_id: null, holder_character_id: null, container_id,
      physical_position: null }, ...extra };
}

function npcOpenContainer(container_id, extra = {}) {
  return { container_id, anchor_id: null, parent_container_id: null,
    holder_npc_id: 'npc', holder_character_id: null, physical_position: 'worn',
    equipment_slot_category_id: null, condition_state: 'serviceable',
    template_id: 'npc-kit-template', closure_state: 'open',
    state: { access_state: 'open' }, state_version: 1,
    ownership: { ownership_id: `ownership:${container_id}`, owner_npc_id: 'npc',
      owner_character_id: null, owner_party: false, controller_npc_id: 'npc',
      controller_character_id: null, claim_state: 'owned' }, ...extra };
}

function addNpcContainerInventory(state) {
  state.container_placements = state.containers.map(({ container_id }) => ({
    party_id: 'party', container_id, anchor_id: null, parent_container_id: null,
    holder_npc_id: 'npc', holder_character_id: null, physical_position: 'worn',
    equipment_slot_category_id: null
  }));
  state.container_profiles = [{ template_id: 'npc-kit-template', capacity: 4,
    packing_slot_cost: 1, carry_form: 'regular', mass_grams: 100,
    external_hand_cost: 0 }];
}

function addNpcEvidence(state, resourceRefs) {
  state.npcs[0].perception_snapshot.visible_objects.push(...resourceRefs.map(
    (resource_ref) => ({ resource_ref, source_perception_ref: `seen:${resource_ref}` })));
}

function execution(operation) {
  return { operation, plan: { schema: 'npc_step_plan_v1' }, request: {
    root_turn_id: 'turn', step_index: 1, committed_state_version: 1,
    actor: { actor_id: 'npc' } },
  working_projection: { actor_id: 'npc', items: [] }, prepared_chain_context: null };
}
