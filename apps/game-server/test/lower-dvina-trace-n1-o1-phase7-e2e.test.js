import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { createLowerDvinaTraceN1OwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-n1-owner-capabilities.js';
import { approvedPhase7Contracts } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7Command, phase7CommittedState, phase7PlayerInput,
  persistPhase7Consequence } from './lower-dvina-trace-phase-7-runtime-fixture.js';
import { enabled, group, request, verifyStageBCutover } from
  './lower-dvina-trace-o1-fixture.js';

const digest = 'a'.repeat(64);

test('N1 routes persisted O1 remainder into one Phase 7 P16 root', async () => {
  const baseline = await seedAndResolveAbsent();
  let persisted = persistedEnablement(baseline);
  let modelCalls = 0;
  const state = npcAtOrdinaryScope();
  const contracts = approvedPhase7Contracts(state);
  contracts.npcSemanticProfile = n1Profile();
  const resolverFactory = ({ partyId, inputDigest }) =>
    createLowerDvinaTraceOrdinaryDiscoveryResolver({ partyId, inputDigest,
      verifyStageBCutover, loadEnablement: async () => structuredClone(persisted),
      ordinaryMaterializationModel: async (modelRequest) => {
        modelCalls += 1;
        assert.equal(modelRequest.mode, 'resolve_presence');
        return present(modelRequest);
      } });
  const n1 = createLowerDvinaTraceN1OwnerCapabilitiesFactory({
    loadOrdinaryEnablement: async () => structuredClone(persisted),
    createOrdinaryDiscoveryResolver: resolverFactory
  });
  const consequence = await phase7Command({ state, contracts,
    createBoundaryNpcOwnerCapabilities: ({ state: boundaryState }) => n1({
      partyId: state.party_id, requestId: 'phase7-o1', inputDigest: digest,
      state: boundaryState, phase7Contracts: contracts }),
    model: async (semanticRequest) => discoveryPlan(semanticRequest, 'shore')
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'n1-o1') });
  const ordinary = consequence.phase7.actor_step_owner_outputs
    .ordinary_materialization_atomic_write_plan;
  assert.equal(modelCalls, 1, 'unresolved ordinary target costs one Stage B call');
  assert.equal(ordinary.resolution, 'materialize');
  assert.equal(consequence.phase7.schedule_execution.semantic_operation.op,
    'request_discovery');

  const committed = await persistPhase7Consequence({ state, contracts, consequence });
  assert.equal(committed.plan.plan_id,
    `p16:${state.party_id}:trace-phase7:${state.party_state.turn_number + 1}`);
  assert.equal(committed.plan.ordinary_materialization_atomic_write_plan.item
    .item_proposal.semantic_descriptor.name, 'простая верёвка');
  assert.equal(committed.snapshot.items.some(({ name }) => name === 'простая верёвка'),
    true);
  assert.equal(committed.snapshot.npcs.find(({ instance_id }) =>
    instance_id === 'zhdanko-1').machine_state.npc_schedule_history.length, 1);

  persisted = persistedEnablement(ordinary);
  for (const rootTurnId of ['turn:phase7-party:8', 'turn:phase7-party:9',
    'turn:phase7-party:10']) {
    const [capability] = await n1({ partyId: state.party_id,
      requestId: `replay:${rootTurnId}`, inputDigest: digest, state,
      phase7Contracts: contracts });
    const replay = await capability.execute(n1Execution(rootTurnId));
    assert.equal(replay.ordinary_materialization_atomic_write_plan, undefined);
  }
  assert.equal(modelCalls, 1, 'retry, replay and restart reuse committed O1 identity');

  const resolver = resolverFactory({ partyId: state.party_id, inputDigest: digest });
  for (const target of ['authored:shore-record', ordinary.item.item_id]) {
    await resolver({ ...request('осмотреть цель'), operation: {
      target_refs: [target], query: 'осмотреть цель' }, committed_state: {
      position: { g6_id: 'shore', g5_anchor_id: 'shore-anchor' } } });
  }
  assert.equal(modelCalls, 1, 'authored and committed targets do not enter O1 model');

  for (const mutate of [
    (plan) => { plan.scope_ref.entity_id = 'other-shore'; },
    (plan) => { plan.request_identity = 'turn:other:ordinary:presence'; },
    (plan) => { plan.item.mechanics_snapshot.provenance.root_turn_id = 'turn:other'; }
  ]) {
    const tampered = structuredClone(consequence);
    mutate(tampered.phase7.actor_step_owner_outputs
      .ordinary_materialization_atomic_write_plan);
    await assert.rejects(
      persistPhase7Consequence({ state, contracts, consequence: tampered }),
      { code: 'TRACE_PHASE_7_OWNER_OUTPUT_PLAN_INVALID' });
  }
});

async function seedAndResolveAbsent() {
  let stageBCalls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'phase7-party', inputDigest: digest, verifyStageBCutover,
    loadEnablement: async () => enabled(), ordinaryMaterializationModel: async (modelRequest) => {
      if (modelRequest.mode === 'seed_scope') return seeded(modelRequest);
      stageBCalls += 1;
      return absent(modelRequest);
    }
  });
  const result = await resolver(request('осмотреть берег'));
  assert.equal(stageBCalls, 1);
  return result.ordinary_materialization_atomic_write_plan;
}

function persistedEnablement(plan) {
  const value = enabled();
  const aggregate = structuredClone(plan.next_aggregate);
  const supporting_bases = structuredClone(plan.next_supporting_basis_catalog);
  value.ordinary_aggregate = aggregate;
  value.execution_context.supporting_bases = supporting_bases;
  value.objective_context.ordinary_state = {
    seeded: aggregate.seeded, density_band: aggregate.density_band,
    remaining_identity_budget: aggregate.remaining_identity_budget,
    background_groups: aggregate.background_groups.map(({ group_ref }) => group_ref),
    presence_resolutions: aggregate.presence_resolutions.map(
      ({ resolution_ref }) => resolution_ref),
    closed_observation_scopes: aggregate.closed_observation_scopes.map(
      ({ coverage_key }) => coverage_key)
  };
  value.version_pins = { ...value.version_pins,
    ordinary_state_version: aggregate.state_version,
    supporting_basis_catalog_version: 2,
    supporting_basis_catalog_digest: canonicalDigest({
      domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases
    }) };
  return value;
}

function seeded(modelRequest) {
  return { schema: 'ordinary_materialization_plan_v1',
    request_id: modelRequest.request_id, resolution: 'seeded',
    density_band_proposal: 'ordinary', background_groups: [group()], entities: [],
    presence_resolutions: [], reason_code: 'seed' };
}

function absent(modelRequest) {
  return { schema: 'ordinary_materialization_plan_v1',
    request_id: modelRequest.request_id, resolution: 'absent',
    density_band_proposal: null, background_groups: [], entities: [],
    presence_resolutions: [{ candidate_key: modelRequest.candidate_query.candidate_key,
      coverage_key: modelRequest.candidate_query.coverage_key, resolution: 'absent' }],
    reason_code: 'absent' };
}

function present(modelRequest) {
  const basis = modelRequest.policy_refs.allowed_supporting_bases.find(
    ({ basis_state }) => basis_state === 'prepared_seed').basis_ref;
  return { schema: 'ordinary_materialization_plan_v1',
    request_id: modelRequest.request_id, resolution: 'materialize',
    density_band_proposal: null, background_groups: [], presence_resolutions: [],
    entities: [{ semantic_descriptor: { semantic_type: 'cordage',
      name: 'простая верёвка', facts: [] }, authority_class: 'ordinary',
    admission_class: 'common_mundane', availability_class: 'common',
    functional_bucket: 'other_ordinary', presence_expectation: 'routine',
    supporting_basis_ref: basis, causal_basis: { basis_kind: 'ordinary_presence',
      basis_refs: [basis] }, property_basis_ref: 'property',
    placement_proposal: { scope_ref: 'shore', position_ref: 'bench' },
    mechanics_proposal: { mass_grams: 350, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 1,
      quantity: { value: 1, unit: 'item' }, container: null } }],
    reason_code: 'ordinary_present' };
}

function npcAtOrdinaryScope() {
  const state = phase7CommittedState();
  state.position.g6_id = 'shore';
  state.position.g5_anchor_id = 'shore-anchor';
  const npc = state.npcs.find(({ instance_id }) => instance_id === 'zhdanko-1');
  npc.machine_state.location_ref = state.position.location_ref;
  npc.machine_state.spatial_zone_ref = state.position.zone_ref;
  return state;
}

function n1Profile() {
  return { profile_id: 'lower_dvina_trace_n1_npc_semantic_profile_v1',
    revision: 1, status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' } };
}

function discoveryPlan(requestValue, target_ref) {
  return { schema: 'npc_step_plan_v1', request_id: requestValue.request_id,
    root_turn_id: requestValue.root_turn_id, boundary_id: requestValue.boundary_id,
    committed_state_version: requestValue.committed_state_version,
    working_revision: requestValue.working_revision,
    decision_index: requestValue.decision_index, npc_ref: requestValue.npc_ref,
    interpretation: { npc_goal: 'осмотреть берег',
      grounded_attempt: 'осмотреть доступное место', adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery', actor_ref: requestValue.npc_ref,
      discovery_kind: 'inspect', target_refs: [target_ref], query: 'найти верёвку' }],
    check: null, reason_code: 'ordinary_inspection', reason: 'Жданко осматривает берег.' };
}

function n1Execution(root_turn_id) {
  const request_id = `${root_turn_id}:npc:1`;
  return { operation: { op: 'request_discovery', actor_ref: 'zhdanko-1',
    discovery_kind: 'inspect', target_refs: ['shore'], query: 'найти верёвку' },
  plan: discoveryPlan({ request_id, root_turn_id, boundary_id: 'boundary:1',
    committed_state_version: 7, working_revision: 1, decision_index: 1,
    npc_ref: 'zhdanko-1' }, 'shore'), request: { request_id, root_turn_id,
    step_index: 1, committed_state_version: 7 }, working_projection: {},
  prepared_chain_context: null };
}
