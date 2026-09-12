import assert from 'node:assert/strict';
import test from 'node:test';
import { applyOrdinaryAggregateTransition, createOrdinaryAggregate } from
  '@rus/materialization';
import { validateOrdinaryMaterializationPlanV1 } from '@rus/contracts';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../src/runtime/lower-dvina-trace-ordinary-discovery.js';
import { bindOrdinaryMaterializationPlan, buildOrdinaryMaterializationMessages } from
  '../src/runtime/ordinary-materialization-llm.js';
import { enabled, group, request, verifyStageBCutover } from
  './lower-dvina-trace-o1-fixture.js';
import { presenceRequest } from
  './lower-dvina-trace-ordinary-stage-b-eval-fixture.js';

function absent(modelRequest) {
  return { schema: 'ordinary_materialization_plan_v1',
    request_id: modelRequest.request_id, resolution: 'absent',
    density_band_proposal: null, background_groups: [], entities: [],
    presence_resolutions: [{
      candidate_key: modelRequest.candidate_query.candidate_key,
      coverage_key: modelRequest.candidate_query.coverage_key,
      resolution: 'absent' }], reason_code: 'absent' };
}

test('sparse density does not become a persistent world identity ceiling', async () => {
  let modelCalls = 0;
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party', inputDigest: 'input', loadEnablement: async () => enabled(),
    verifyStageBCutover,
    ordinaryMaterializationModel: async (modelRequest) => {
      modelCalls += 1;
      if (modelRequest.mode === 'seed_scope') return {
        schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded',
        density_band_proposal: 'sparse', background_groups: [], entities: [],
        presence_resolutions: [], reason_code: 'sparse' };
      return absent(modelRequest);
    }
  });
  const result = await resolver(request('найти ложку'));
  assert.equal(modelCalls, 2, 'the next resolution gets its own model call');
  const plan = result.ordinary_materialization_atomic_write_plan;
  assert.equal(plan.next_aggregate.density_band, 'sparse');
  assert.equal(plan.next_aggregate.identity_budget, 0);
  assert.equal(plan.next_aggregate.remaining_identity_budget, 0);
  assert.deepEqual(plan.transitions.map(({ kind }) => kind),
    ['seed', 'resolve_presence']);
  assert.equal(plan.next_aggregate.presence_resolutions.length, 1);
});

for (const exhausted of ['identity budget', 'resolution cap']) {
  test(`legacy exhausted ${exhausted} does not block a later resolution`, async () => {
    const capped = exhausted === 'resolution cap';
    let aggregate = createOrdinaryAggregate({ scope_ref: {
      entity_kind: 'g6', entity_id: 'shore' }, resolution_record_cap: 1 });
    aggregate = applyOrdinaryAggregateTransition({ aggregate, transition: {
      kind: 'seed', request_identity: 'seed', expected_state_version: 0,
      density_band: 'ordinary', identity_budget: capped ? 1 : 0,
      background_groups: [] } });
    if (capped) aggregate = applyOrdinaryAggregateTransition({ aggregate, transition: {
      kind: 'resolve_presence', request_identity: 'presence-one',
      expected_state_version: 1, resolution_ref: 'resolution-one',
      candidate_key: 'candidate-one', coverage_key: 'coverage-one',
      category_key: 'category-one', context_version: 'context-one',
      resolution: 'absent' } });
    let modelCalls = 0;
    const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
      partyId: 'party', inputDigest: 'cap', verifyStageBCutover,
      loadEnablement: async () => {
        const value = enabled();
        value.ordinary_aggregate = structuredClone(aggregate);
        value.objective_context.ordinary_state = {
          seeded: true, density_band: 'ordinary',
          remaining_identity_budget: capped ? 1 : 0,
          background_groups: [],
          presence_resolutions: capped ? ['resolution-one'] : [],
          closed_observation_scopes: [] };
        value.version_pins.ordinary_state_version = aggregate.state_version;
        return value;
      },
      ordinaryMaterializationModel: async (modelRequest) => {
        modelCalls += 1;
        return absent(modelRequest);
      }
    });
    const input = request('найти другую вещь');
    input.working_projection = { visible_context: { scene: 'shore' } };
    const result = await resolver(input);
    assert.equal(modelCalls, 1);
    const plan = result.ordinary_materialization_atomic_write_plan;
    assert.equal(plan.next_aggregate.presence_resolutions.length, capped ? 2 : 1);
    assert.deepEqual(result.consequence_fragment, { visible_seed: {
      ordinary_presence_seed: { kind: 'ordinary_presence_seed',
        resolution: 'absent', query: input.operation.query }
    } });
    assert.equal(result.player_response_boundary, true);
    assert.equal(plan.next_aggregate.remaining_identity_budget,
      aggregate.identity_budget);
  });
}

test('common ordinary resolution admits one bounded stack identity', async () => {
  const resolver = createLowerDvinaTraceOrdinaryDiscoveryResolver({
    partyId: 'party', inputDigest: 'ordinary-stack', verifyStageBCutover,
    loadEnablement: async () => enabled(),
    ordinaryMaterializationModel: async (modelRequest, context) => {
      if (modelRequest.mode === 'seed_scope') return {
        schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'seeded',
        density_band_proposal: 'ordinary', background_groups: [group()],
        entities: [], presence_resolutions: [], reason_code: 'seed' };
      assert.equal(context.mechanics_policy.max_quantity, 16);
      assert.deepEqual(context.required_quantity, { value: 5, unit: 'item' });
      const basis = modelRequest.policy_refs.allowed_supporting_bases
        .find(({ basis_state: state }) => state === 'prepared_seed').basis_ref;
      return { schema: 'ordinary_materialization_plan_v1',
        request_id: modelRequest.request_id, resolution: 'materialize',
        density_band_proposal: null, background_groups: [], entities: [{
          semantic_descriptor: { semantic_type: 'dry_branch',
            name: 'пять сухих веток', facts: [] }, authority_class: 'ordinary',
          admission_class: 'common_mundane', availability_class: 'common',
          functional_bucket: 'other_ordinary', presence_expectation: 'plausible',
          supporting_basis_ref: basis, causal_basis: {
            basis_kind: 'ordinary_presence', basis_refs: [basis] },
          property_basis_ref: 'property', placement_proposal: {
            scope_ref: 'shore', position_ref: 'bench' }, mechanics_proposal: {
            mass_grams: 750, external_hand_cost: 1, carry_form: 'regular',
            packing_slot_cost: 3, quantity: { value: 5, unit: 'item' },
            container: null } }], presence_resolutions: [], reason_code: 'found' };
    }
  });
  const turnRequest = request('сухие ветки');
  turnRequest.operation.quantity = { value: 5, unit: 'item' };
  const result = await resolver(turnRequest);
  assert.equal(result.ordinary_materialization_atomic_write_plan
    .item.mechanics_snapshot.mechanics.quantity.value, 5);
  assert.equal(result.ordinary_materialization_atomic_write_plan
    .next_aggregate.presence_resolutions.length, 1);
});

test('non-common Stage B still requires an exact WK claim', () => {
  const base = presenceRequest('боевой меч');
  const request = { ...base, authority_envelope: {
    ...base.authority_envelope, candidate: {
      ...base.authority_envelope.candidate,
      admission_class: 'weapon_or_armament' } }, world_knowledge: {
    facts: [{ claim_ref: 'claim:weapon-authority' }], hard_constraints: [] } };
  const output = { resolution: 'materialize',
    semantic_materialization_kind: 'standalone_item',
    semantic_admission_class: 'weapon_or_armament', reason_code: 'supported',
    entities: [{ semantic_type: 'sword', name: 'боевой меч',
      presence_expectation: 'exceptional', mechanics_proposal: {
        mass_grams: 1200, external_hand_cost: 1, carry_form: 'long',
        packing_slot_cost: 4, quantity: { value: 1, unit: 'item' },
        container: null } }] };
  assert.match(buildOrdinaryMaterializationMessages(request)[0].content,
    /"world_knowledge_claim_refs":\["<exact supplied fact claim_ref>"\]/u);
  assert.equal(bindOrdinaryMaterializationPlan(request, output).schema, undefined);
  assert.equal(bindOrdinaryMaterializationPlan(request, { ...output,
    world_knowledge_claim_refs: ['claim:weapon-authority'] }).resolution,
  'materialize');
});

test('hard constraints are a separate fail-closed veto channel', () => {
  const base = presenceRequest('найти деревянную ложку');
  const constraintRefs = ['claim:no-wood', 'claim:no-loose-items'];
  const request = { ...base, world_knowledge: { facts: [{
    claim_ref: 'claim:household-context' }], hard_constraints:
    constraintRefs.map((claim_ref) => ({ claim_ref })) } };
  const output = { resolution: 'materialize',
    semantic_materialization_kind: 'standalone_item',
    semantic_admission_class: 'common_mundane', reason_code: 'found',
    world_knowledge_claim_refs: [], entities: [{ semantic_type: 'wooden_spoon',
      name: 'деревянная ложка', presence_expectation: 'plausible',
      mechanics_proposal: { mass_grams: 40, external_hand_cost: 0,
        carry_form: 'compact', packing_slot_cost: 1,
        quantity: { value: 1, unit: 'item' }, container: null } }] };
  for (const invalid of [
    output,
    { ...output, world_knowledge_constraint_verdict: 'clear',
      world_knowledge_constraint_refs: [constraintRefs[0]] },
    { ...output, world_knowledge_constraint_verdict: 'clear',
      world_knowledge_constraint_refs: [...constraintRefs, 'claim:unknown'] },
    { ...output, world_knowledge_constraint_verdict: 'ignored',
      world_knowledge_constraint_refs: constraintRefs },
    { ...output, world_knowledge_claim_refs: [constraintRefs[0]],
      world_knowledge_constraint_verdict: 'clear',
      world_knowledge_constraint_refs: constraintRefs }
  ]) assert.equal(bindOrdinaryMaterializationPlan(request, invalid).schema,
  undefined);
  const blocked = bindOrdinaryMaterializationPlan(request, { ...output,
    world_knowledge_constraint_verdict: 'blocked',
    world_knowledge_constraint_refs: constraintRefs });
  assert.equal(blocked.resolution, 'no_change');
  assert.equal(blocked.reason_code, 'world_knowledge_hard_constraint');
  const clear = bindOrdinaryMaterializationPlan(request, { ...output,
    world_knowledge_constraint_verdict: 'clear',
    world_knowledge_constraint_refs: [...constraintRefs].reverse() });
  assert.equal(clear.resolution, 'materialize');
});

test('unseen common objects need neither a code vocabulary entry nor a WK claim', () => {
  const probes = [
    ['ищу деревянную ложку у очага', 'wooden_spoon', 'деревянная ложка', 1],
    ['ищу обломок доски', 'board_fragment', 'обломок доски', 1],
    ['собираю пять сухих веток', 'dry_branch', 'пять сухих веток', 5],
    ['беру горсть камешков', 'small_stone', 'горсть камешков', 8],
    ['нахожу кусок старой верёвки', 'cordage', 'кусок старой верёвки', 1],
    ['ищу пустую глиняную черепицу', 'clay_tile', 'глиняная черепица', 1]
  ];
  for (const [query, semanticType, name, quantity] of probes) {
    const base = presenceRequest(query);
    const request = { ...base, world_knowledge: {
      facts: [], hard_constraints: [] } };
    const plan = bindOrdinaryMaterializationPlan(request, {
      resolution: 'materialize',
      semantic_materialization_kind: 'standalone_item',
      semantic_admission_class: 'common_mundane',
      world_knowledge_claim_refs: [], reason_code: 'ordinary_reconstruction',
      entities: [{ semantic_type: semanticType, name,
        presence_expectation: 'plausible', mechanics_proposal: {
          mass_grams: 500, external_hand_cost: 1, carry_form: 'compact',
          packing_slot_cost: 1, quantity: { value: quantity, unit: 'item' },
          container: null } }]
    });
    assert.deepEqual(validateOrdinaryMaterializationPlanV1(plan, base), [], query);
    assert.equal(plan.entities[0].semantic_descriptor.name, name, query);
  }
});
