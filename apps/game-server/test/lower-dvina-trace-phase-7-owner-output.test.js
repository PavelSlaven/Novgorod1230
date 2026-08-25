import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLowerDvinaTracePhase7Commit } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-commit.js';
import { phase7OwnerOutputPlans } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-7-owner-output.js';
import { requireTurnStepOwnerCarrierBinding } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-plan-binding.js';
import { createTracePhase7BodyEffect } from
  '../src/runtime/lower-dvina-trace-phase-7-effects.js';
import { createLowerDvinaTraceS1ProductionResolverFactory } from
  '../src/runtime/releases/lower-dvina-trace-s1-production.js';
import { createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory } from
  '../src/runtime/lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceSpatialSemanticProfile } from
  '../src/internal/lower-dvina-trace-spatial-semantic-profile.js';
import { approvedPhase7Contracts as contractsFor, phase7AutonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';
import { phase7Command, phase7CommittedState, phase7PlayerInput } from
  './lower-dvina-trace-phase-7-runtime-fixture.js';

const digest = 'a'.repeat(64);

test('Phase 7 rejects every owner output family injected on selected wait', () => {
  for (const patch of [
    { ordinary_materialization_atomic_write_plan: {} },
    { action_production_atomic_write_plans: [{}] },
    { local_fire_atomic_write_plans: [{}] },
    { spatial_semantic_atomic_write_plan: {} },
    { write_fragments: [{ value: {
      operation_kind: 'request_container_access' } }] }
  ]) {
    assert.throws(() => ownerPlans({ ...neutralOwnerOutputs(), ...patch }, {
      op: 'request_activity', activity_kind: 'wait' }),
    { code: 'TRACE_PHASE_7_OWNER_OUTPUT_PLAN_INVALID' });
  }
  assert.throws(() => ownerPlans({ ...neutralOwnerOutputs(),
    ordinary_materialization_atomic_write_plan: {},
    spatial_semantic_atomic_write_plan: {}
  }, { op: 'request_discovery' }),
  { code: 'TRACE_PHASE_7_OWNER_OUTPUT_PLAN_INVALID' });
});

test('Phase 7 keeps neutral no-result output open for any selected owner', () => {
  const plans = ownerPlans(neutralOwnerOutputs(), {
    op: 'request_unlisted_owner_operation'
  });
  assert.equal(plans.operationBatch, null);
  assert.equal(plans.ordinaryPlan, null);
  assert.deepEqual(plans.actionProductionPlans, []);
  assert.deepEqual(plans.localFirePlans, []);
  assert.equal(plans.spatialSemanticPlan, null);
});

test('Phase 7 binds A1, F1 and S1 owner carriers to exact selected refs', () => {
  const request = { request_id: 'request:owner', root_turn_id: 'turn:owner',
    decision_index: 1, npc_ref: 'zhdanko-1' };
  const check = ({ operation, carrier, carrierOperation = operation,
    actionRef = null, registeredOwner = ownerFor(operation) }) =>
    requireTurnStepOwnerCarrierBinding({ semanticPlan: { operations: [operation] },
      semanticOperation: operation, semanticRequest: request,
      registeredOwner, carrier, carrierOperation, actionRef });
  const a1 = { op: 'request_item_use', actor_ref: 'zhdanko-1',
    item_ref: 'twig', use_kind: 'other', target_refs: ['knife'],
    action_production: { source_refs: ['twig'], tool_refs: ['knife'] } };
  check({ operation: a1, carrierOperation: { ...a1, ...a1.action_production },
    actionRef: 'a1:turn:owner:1', carrier: {
    actor_ref: 'zhdanko-1', source_refs: ['twig'], tool_refs: ['knife'],
    causal_identity: { request_id: 'request:owner', root_turn_id: 'turn:owner',
      step_index: 1, action_ref: 'a1:turn:owner:1' } } });
  for (const carrier of [{ actor_ref: 'other', source_refs: ['twig'],
    tool_refs: ['knife'] }, { actor_ref: 'zhdanko-1', source_refs: ['other'],
    tool_refs: ['knife'] }, { actor_ref: 'zhdanko-1', source_refs: ['twig'],
    tool_refs: ['other'] }]) {
    assert.throws(() => requireTurnStepOwnerCarrierBinding({
      semanticPlan: { operations: [a1] }, semanticOperation: a1,
      semanticRequest: request, registeredOwner: ownerFor(a1),
      carrierOperation: { ...a1, ...a1.action_production }, carrier }));
  }
  const f1 = { op: 'request_world_process', actor_ref: 'zhdanko-1',
    process_action: 'affect', process_ref: 'fire-1', process_kind: 'fire',
    source_refs: ['water'], target_refs: [] };
  check({ operation: f1, carrier: { actor_ref: 'zhdanko-1',
    process_ref: 'fire-1', source_refs: ['water'], cause: {
      kind: 'actor_step', request_id: 'request:owner', root_turn_id: 'turn:owner',
      step_index: 1 } } });
  for (const carrier of [{ actor_ref: 'zhdanko-1', process_ref: 'other-fire',
    source_refs: ['water'] }, { actor_ref: 'zhdanko-1', process_ref: 'fire-1',
    source_refs: ['other-water'] }]) {
    assert.throws(() => check({ operation: f1, carrier }));
  }
  const s1 = { op: 'request_discovery', actor_ref: 'zhdanko-1',
    discovery_kind: 'look', target_refs: ['position:s1'] };
  check({ operation: s1, actionRef: 's1:turn:owner:1', carrier: {
    actor_ref: 'zhdanko-1', target_refs: ['position:s1'], causal_identity: {
      request_id: 'request:owner', root_turn_id: 'turn:owner', step_index: 1,
      actor_ref: 'zhdanko-1', action_ref: 's1:turn:owner:1' } } });
  assert.throws(() => check({ operation: s1, actionRef: 's1:turn:owner:1',
    carrier: { actor_ref: 'zhdanko-1', target_refs: ['position:other'],
      causal_identity: { request_id: 'other-request', root_turn_id: 'turn:owner',
        step_index: 1, actor_ref: 'zhdanko-1', action_ref: 's1:turn:owner:1' } } }));
});

test('Phase 7 rejects tampered registered owner with genuine carrier refs', () => {
  const request = { request_id: 'request:owner', root_turn_id: 'turn:owner',
    decision_index: 1, npc_ref: 'zhdanko-1' };
  const cases = [{ operation: { op: 'request_discovery', actor_ref: 'zhdanko-1',
    discovery_kind: 'inspect', target_refs: ['ordinary-source'] },
  carrier: { actor_ref: 'zhdanko-1', target_refs: ['ordinary-source'] } }, {
  operation: { op: 'request_item_use', actor_ref: 'zhdanko-1', item_ref: 'twig',
    use_kind: 'other', target_refs: ['knife'] },
  carrier: { actor_ref: 'zhdanko-1', item_ref: 'twig', target_refs: ['knife'] } }, {
  operation: { op: 'request_world_process', actor_ref: 'zhdanko-1',
    process_action: 'affect', process_ref: 'fire-1', process_kind: 'fire',
    source_refs: ['water'], target_refs: [] },
  carrier: { actor_ref: 'zhdanko-1', process_action: 'affect',
    process_ref: 'fire-1', process_kind: 'fire', source_refs: ['water'], target_refs: [] } }, {
  operation: { op: 'request_movement', actor_ref: 'zhdanko-1',
    movement_kind: 'local', target_ref: 'river' },
  carrier: { actor_ref: 'zhdanko-1' } }, {
  operation: { op: 'request_container_access', actor_ref: 'zhdanko-1',
    container_ref: 'bag', access_kind: 'open_and_view' },
  carrier: { actor_ref: 'zhdanko-1', container_ref: 'bag', access_kind: 'open_and_view' } }];
  for (const { operation, carrier } of cases) {
    const binding = { semanticPlan: { operations: [operation] },
      semanticOperation: operation, semanticRequest: request, carrier,
      registeredOwner: ownerFor(operation) };
    assert.doesNotThrow(() => requireTurnStepOwnerCarrierBinding(binding));
    assert.throws(() => requireTurnStepOwnerCarrierBinding({ ...binding,
      registeredOwner: '@rus/tampered-owner' }),
    { message: 'TRACE_TURN_STEP_OWNER_OUTPUT_BINDING_INVALID' });
  }
});

test('Phase 7 rejects injected NPC S1 output on selected wait owner', async () => {
  const state = phase7CommittedState();
  state.position.position_id = 'position:s1';
  const contracts = contractsFor(state);
  const consequence = await phase7Command({ state, contracts,
    model: async (request) => phase7AutonomousPlan(request, 'wait')
  }).consequence({ retrievedState: state,
    playerInput: phase7PlayerInput(state, 'npc-s1-private') });
  const spatialPlan = structuredClone(await npcS1Plan(state));
  assert.equal(spatialPlan.change_set_id, `change:${state.party_id}:trace-phase7:${
    state.party_state.turn_number + 1}`);
  const npcConsequence = structuredClone(consequence);
  npcConsequence.phase7.actor_step_owner_outputs
    .spatial_semantic_atomic_write_plan = spatialPlan;
  await assert.rejects(
    commit({ state, contracts, consequence: npcConsequence }),
    { code: 'TRACE_PHASE_7_OWNER_OUTPUT_PLAN_INVALID' });
});

test('Phase 7 persists generic NPC container access through root P16 only',
  async () => {
    const state = phase7CommittedState();
    const bag = state.containers[0];
    Object.assign(bag, { closure_state: 'tied', condition_state: 'serviceable' });
    Object.assign(bag.state, { controller_npc_id: 'zhdanko-1',
      access_state: 'accessible' });
    state.items.push({ item_id: 'sealed-packet',
      template_id: 'trace_ld_v1_item_sealed_packet', quantity: 1,
      condition_state: 'sealed', legal_status: 'held_for_owner',
      placement: { container_id: bag.container_id }, state: {} });
    const contracts = contractsFor(state);
    contracts.npcSemanticProfile = { profile_id:
      'lower_dvina_trace_npc_actor_step_profile_v1', revision: 1,
    status: 'approved', activation_boundary: { phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller' } };
    const capabilities = await createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory()({
      partyId: state.party_id, requestId: 'npc-container', inputDigest: digest,
      state, phase7Contracts: contracts
    });
    const consequence = await phase7Command({ state, contracts,
      npcOwnerCapabilities: capabilities,
      model: async (request) => containerPlan(request, bag.container_id)
    }).consequence({ retrievedState: state,
      playerInput: phase7PlayerInput(state, 'npc-container') });
    const outputs = consequence.phase7.actor_step_owner_outputs;
    assert.equal(outputs.ordinary_materialization_atomic_write_plan, null);
    assert.deepEqual(outputs.write_fragments[0].value.payload.revealed_refs,
      ['sealed-packet']);
    assert.deepEqual(outputs.consequence_fragment.state_changes[0]
      .operation_kind, 'request_container_access');

    const [first, replay] = await Promise.all([
      commit({ state, contracts, consequence }),
      commit({ state, contracts, consequence })
    ]);
    assert.equal(first.plan.digest, replay.plan.digest);
    const containerWrite = first.plan.updates.find(({ target_table: table,
      id }) => table === 'party_containers' && id === bag.container_id);
    assert.equal(containerWrite.record.state.open_state, 'open');
    assert.equal(containerWrite.record.state.contents_state, 'known');
    const snapshot = first.plan.inserts.find(({ target_table: table }) =>
      table === 'party_state_snapshots').record.state_payload;
    assert.deepEqual(snapshot.last_turn.turn_step_operation_batch.operations[0]
      .value.payload.revealed_refs, ['sealed-packet']);
    const visible = JSON.stringify(
      first.plan.visible_package_envelope.visible_payload);
    assert.equal(visible.includes('sealed-packet'), false);
    assert.equal(visible.includes('held_for_owner'), false);

    const tampered = structuredClone(consequence);
    tampered.phase7.actor_step_owner_outputs.write_fragments[0]
      .value.operation_kind = 'request_discovery';
    await assert.rejects(commit({ state, contracts, consequence: tampered }),
      { code: 'TRACE_PHASE_7_OWNER_OUTPUT_PLAN_INVALID' });
    const consequenceTampered = structuredClone(consequence);
    consequenceTampered.phase7.actor_step_owner_outputs.consequence_fragment
      .state_changes[0].operation_kind = 'request_discovery';
    await assert.rejects(commit({ state, contracts,
      consequence: consequenceTampered }),
    { code: 'TRACE_PHASE_7_OWNER_OUTPUT_PLAN_INVALID' });
    for (const patch of [{ container_ref: 'other-container' }, {
      access_kind: 'inspect_only' }]) {
      const wrongBinding = structuredClone(consequence);
      Object.assign(wrongBinding.phase7.actor_step_owner_outputs
        .write_fragments[0].value.payload, patch);
      await assert.rejects(commit({ state, contracts,
        consequence: wrongBinding }),
      { code: 'TRACE_PHASE_7_OWNER_OUTPUT_PLAN_INVALID' });
    }
  });

async function commit({ state, contracts, consequence }) {
  const time_update = { clock_before: state.clock,
    clock_after: consequence.phase7.schedule_temporal.result.clock_after,
    exact_elapsed: { exact_minutes: { numerator: '30', denominator: '1' } } };
  const body_update = createTracePhase7BodyEffect({ contracts,
    fallback: { apply() { throw new Error('unexpected fallback'); } }
  }).apply({ committed_state: state, consequence, time_update });
  return buildLowerDvinaTracePhase7Commit({ partyId: state.party_id,
    factual: { player_input: phase7PlayerInput(state, 'persist'), mode_resolution: {
      option_id: 'rest_by_fire_and_dry_clothing',
      turn_id: consequence.phase7.autonomous.request.root_turn_id,
      decision_trace: { state_version: state.party_state.state_version,
        action_set_digest: 'action-set' } }, consequence, time_update, body_update },
    state, inputDigest: digest, visibleContext: { visible_scene: 'У костра прошло полчаса.',
      visible_changes: ['elapsed_30_minutes'], sensory_details: [], visible_npc: [],
      visible_objects: [], known_context: [], uncertainties: [] }, phase7Contracts: contracts });
}

async function npcS1Plan(state) {
  return (await npcS1Resolver(state)({ operation: {
    op: 'request_discovery', discovery_kind: 'look',
    actor_ref: 'zhdanko-1', target_refs: ['position:s1'] }, request: {
    request_id: 'npc-s1-request', root_turn_id: `turn:${state.party_id}:${
      state.party_state.turn_number + 1}`, step_index: 1,
    change_set_id: `change:${state.party_id}:trace-phase7:${
      state.party_state.turn_number + 1}`,
    committed_state_version: 4, npc_safe_state: { spatial_semantic: {
      semantic_grounding_available: true, position_ref: 'position:s1' },
    visible_objects: [] } }, actor: { actor_id: 'zhdanko-1' },
  working_projection: {}, committed_state: {
    party_state: { turn_number: state.party_state.turn_number },
    position: { position_id: 'position:s1' }
  } })).spatial_semantic_atomic_write_plan;
}

function npcS1Resolver(state) {
  const envelope = { envelope_ref: 'envelope:s1', kind: 'local_natural_feature',
    scope_kind: 'current_position_local_reference', structural_variant: 'descriptive_local_reference',
    available_mechanics: [], required_semantic_requirements: [], topology: null,
    baseline_ref: 'baseline:s1', g5_ref: 'g5:s1', g6_ref: 'g6:s1',
    position_ref: 'position:s1', property_ref: 'property:s1', function_ref: 'function:s1',
    environment_ref: 'environment:s1', semantic_context: { allowed_kind: 'local_natural_feature',
      period: 'period', region: 'region', place_type: 'place', environment: 'environment',
      material_culture: 'culture', ordinary_boundary: 'ordinary only' }, profile_ref: 'profile:s1',
    profile_version: 1, policy_ref: 'policy:s1', policy_version: 1,
    baseline_state_version: 0, g5_state_version: 0, g6_state_version: 0,
    position_state_version: 0, capacity_total: 1, consumed_count: 0, state_version: 1 };
  const resolver = createLowerDvinaTraceS1ProductionResolverFactory({ pool: {
    query: async (sql) => sql.includes('party_spatial_semantic_resolutions')
      ? { rowCount: 0, rows: [] }
      : { rowCount: 1, rows: [{ envelope, capacity_total: 1, consumed_count: 0,
        state_version: 1, status: 'committed' }] }
  }, resolveSpatialSemanticDescriptor: async ({ request }) => ({
    schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: request.request_id,
    name: 'Новый выступ', description: 'Камень у воды.', semantic_requirements: [] })
  })({ partyId: state.party_id });
  return (input) => resolver(JSON.parse(JSON.stringify(input)));
}

function npcSemanticProfile() {
  return { profile_id: 'lower_dvina_trace_npc_actor_step_profile_v1',
    revision: 1, status: 'approved', activation_boundary: {
      phase: 'phase_7',
      npc_participant_slot_ref: 'zhdanko_storehouse_controller'
    } };
}

function discoveryPlan(request, targetRef) {
  return { schema: 'npc_step_plan_v1', request_id: request.request_id,
    root_turn_id: request.root_turn_id, boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index, npc_ref: request.npc_ref,
    interpretation: { npc_goal: 'осмотреть место',
      grounded_attempt: 'оглядеть берег', adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery', actor_ref: request.npc_ref,
      discovery_kind: 'look', target_refs: [targetRef],
      query: 'осмотреть берег' }],
    check: null, reason_code: 'inspect_local_position',
    reason: 'Жданко осматривает берег.' };
}

function neutralOwnerOutputs() {
  return { write_fragments: [], consequence_fragment: null,
    ordinary_materialization_atomic_write_plan: null,
    action_production_atomic_write_plans: [],
    local_fire_atomic_write_plans: [],
    spatial_semantic_atomic_write_plan: null };
}

function ownerFor({ op }) {
  return ({ request_discovery: '@rus/turn', request_item_use: '@rus/items-property',
    request_world_process: '@rus/world-processes', request_movement: '@rus/movement-routes',
    request_container_access: '@rus/items-property' })[op];
}

function ownerPlans(ownerOutputs, semanticOperation) {
  return phase7OwnerOutputPlans({ ownerOutputs, partyId: 'phase7-party',
    changeSetId: 'change:phase7-party:trace-phase7:8', npcRef: 'zhdanko-1',
    temporalPlans: [], rootTurnId: 'turn:phase7-party:8',
    committedStateVersion: 7, semanticOperation,
    fail(code) { throw Object.assign(new Error(code), { code }); } });
}

function containerPlan(request, containerRef) {
  return { schema: 'npc_step_plan_v1', request_id: request.request_id,
    root_turn_id: request.root_turn_id, boundary_id: request.boundary_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision,
    decision_index: request.decision_index, npc_ref: request.npc_ref,
    interpretation: { npc_goal: 'проверить суму',
      grounded_attempt: 'открыть суму', adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'achieved',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_container_access', actor_ref: request.npc_ref,
      container_ref: containerRef, access_kind: 'open_and_view' }],
    check: null, reason_code: 'open_controlled_container',
    reason: 'Жданко открывает подконтрольную суму.' };
}
