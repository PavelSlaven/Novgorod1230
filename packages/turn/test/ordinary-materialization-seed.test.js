import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrdinaryAggregate,
  createOrdinaryMaterializationWorkingProjection } from '@rus/materialization';
import { resolveOrdinaryMaterializationSeedScope } from '../src/index.js';

const request = Object.freeze({
  schema: 'ordinary_materialization_request_v1', request_id: 'seed-request',
  mode: 'seed_scope', scope_ref: { entity_kind: 'g6', entity_id: 'scope-a' },
  context_refs: {
    period_ref: 'period', region_ref: 'region', function_refs: ['household'],
    environment_refs: ['environment'], occupation_household_refs: ['household'],
    economic_context_ref: 'economy', occupancy_state_ref: 'occupied',
    material_culture_refs: ['culture'], property_context_ref: 'property'
  },
  policy_refs: {
    authority_policy_ref: 'authority', density_policy_ref: 'density',
    ordinary_presence_policy_ref: 'presence', runtime_item_mechanics_policy_ref: 'mechanics',
    allowed_admission_classes: ['common_mundane'],
    context_bound_permission_refs: [],
    allowed_supporting_bases: [{ basis_ref: 'basis-a', basis_state: 'committed' }]
  },
  ordinary_state: { seeded: false, density_band: null,
    remaining_identity_budget: 0, background_groups: [],
    presence_resolutions: [], closed_observation_scopes: [] },
  candidate_query: null,
  technical_limits: { max_new_entities: 2, max_new_background_groups: 2,
    max_resolution_records: 4 }
});

const catalog = [{ basis_ref: 'basis-a', state: 'committed', policy: {
  functional_buckets: ['household'],
  allowed_admission_classes: ['common_mundane'], permission_refs: []
} }];

function projection() {
  return createOrdinaryMaterializationWorkingProjection({
    ordinary_aggregate: createOrdinaryAggregate({
      scope_ref: request.scope_ref, resolution_record_cap: 4
    })
  });
}

function group() {
  return { descriptor: 'kitchen utensils', functional_bucket: 'household',
    availability_class: 'common', allowed_admission_classes: ['common_mundane'],
    causal_basis: { basis_kind: 'household_use', basis_refs: ['basis-a'] },
    property_basis_ref: 'property', permission_refs: [],
    disclosure_policy_ref: 'disclosure-a' };
}

function plan(overrides = {}) {
  return { schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
    resolution: 'seeded', density_band_proposal: 'ordinary',
    background_groups: [group()], entities: [], presence_resolutions: [],
    reason_code: 'independent_scope_seed', ...overrides };
}

function input(model, overrides = {}) {
  return { request, ordinaryMaterializationModel: model,
    workingProjection: projection(), basisCatalog: catalog,
    allowedDisclosurePolicyRefs: ['disclosure-a'],
    resolveIdentityBudget: async (value) => ({
      policy_version: 'density', density_band: value.density_band,
      identity_budget: 2, source: 'policy'
    }), ...overrides };
}

test('Stage A invokes one injected model, prepares stable candidate-free refs, and permits seeded-without-entity', async () => {
  const output = await resolveOrdinaryMaterializationSeedScope(input(
    async (safeRequest) => {
      assert.deepEqual(safeRequest, request);
      return plan();
    }
  ));
  assert.equal(output.decision.repaired, false);
  assert.equal(output.decision.resolution, 'seeded');
  assert.deepEqual(output.pending_items_property_admission, []);
  assert.equal(output.working_projection.ordinary_aggregate.seeded, true);
  assert.equal(output.working_projection.ordinary_aggregate.identity_budget, 2);
  assert.deepEqual(output.identity_budget_resolution, {
    policy_version: 'density', density_band: 'ordinary', identity_budget: 2,
    source: 'policy'
  });
  assert.equal(output.prepared_background_groups.length, 1);
  assert.match(output.prepared_background_groups[0].basis_ref, /^ordinary_group_/);
  assert.equal(output.prepared_background_groups[0].prepared_seed_provenance.candidate_query, null);
  const repeated = await resolveOrdinaryMaterializationSeedScope(input(async () => plan()));
  assert.equal(repeated.prepared_background_groups[0].basis_ref,
    output.prepared_background_groups[0].basis_ref);
});

test('Stage A performs exactly one structural repair', async () => {
  const calls = [];
  const output = await resolveOrdinaryMaterializationSeedScope(input(
    async (_request, context) => {
      calls.push(context);
      return calls.length === 1 ? { schema: 'broken' } : plan();
    }
  ));
  assert.equal(output.decision.repaired, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].repair, null);
  assert.equal(calls[1].repair.original_output, null);
});

test('Stage A never reads an invalid model accessor while preparing repair', async () => {
  let reads = 0;
  const invalid = {};
  Object.defineProperty(invalid, 'schema', { enumerable: true,
    get() { reads += 1; return 'ordinary_materialization_plan_v1'; } });
  const output = await resolveOrdinaryMaterializationSeedScope(input(
    async (_request, context) => context.repair === null ? invalid : plan()
  ));
  assert.equal(output.decision.repaired, true);
  assert.equal(reads, 0);
});

test('Stage A rejects an unknown basis, restricted class, and technical group limit', async () => {
  const unknownBasis = plan({ background_groups: [], entities: [{
    semantic_descriptor: { semantic_type: 'spoon', name: 'spoon', facts: [] },
    authority_class: 'ordinary', admission_class: 'common_mundane',
    availability_class: 'common', functional_bucket: 'household',
    presence_expectation: 'routine', supporting_basis_ref: 'basis-a',
    causal_basis: { basis_kind: 'household_use', basis_refs: ['basis-a'] },
    property_basis_ref: 'property', placement_proposal: { scope_ref: 'scope-a', position_ref: 'pos' },
    mechanics_proposal: { mass_grams: 1, external_hand_cost: 0, carry_form: 'small', packing_slot_cost: 0, quantity: { value: 1, unit: 'item' }, container: null }
  }] });
  await assert.rejects(() => resolveOrdinaryMaterializationSeedScope(input(async () => unknownBasis, {
    basisCatalog: []
  })),
    (error) => error.code === 'TURN_ORDINARY_SEED_PLAN_REJECTED'
      && error.details.code === 'ORDINARY_SEED_ENTITY_BASIS_INVALID');
  const restricted = structuredClone(unknownBasis);
  restricted.entities[0].admission_class = 'container_capable';
  await assert.rejects(() => resolveOrdinaryMaterializationSeedScope(input(async () => restricted, {
    request: { ...request, policy_refs: { ...request.policy_refs,
      allowed_admission_classes: ['common_mundane', 'container_capable'] } }
  })),
    (error) => error.code === 'TURN_ORDINARY_SEED_PLAN_REJECTED'
      && error.details.code === 'ORDINARY_SEED_ENTITY_RESTRICTED');
  await assert.rejects(() => resolveOrdinaryMaterializationSeedScope(input(async () => plan({
    background_groups: [group(), group(), group()]
  }))), (error) => error.code === 'TURN_ORDINARY_SEED_PLAN_REJECTED'
    && error.details.code === 'ORDINARY_SEED_LIMIT_EXCEEDED');
  await assert.rejects(() => resolveOrdinaryMaterializationSeedScope(input(async () => plan({
    background_groups: [], entities: [
      structuredClone(unknownBasis.entities[0]), structuredClone(unknownBasis.entities[0]),
      structuredClone(unknownBasis.entities[0])
    ]
  }))), (error) => error.code === 'TURN_ORDINARY_SEED_PLAN_REJECTED'
    && error.details.code === 'ORDINARY_SEED_LIMIT_EXCEEDED');
});

test('Stage A keeps validated common entities only as pending server-side proposals', async () => {
  const entity = {
    semantic_descriptor: { semantic_type: 'spoon', name: 'spoon', facts: [] },
    authority_class: 'ordinary', admission_class: 'common_mundane',
    availability_class: 'common', functional_bucket: 'household',
    presence_expectation: 'routine', supporting_basis_ref: 'basis-a',
    causal_basis: { basis_kind: 'household_use', basis_refs: ['basis-a'] },
    property_basis_ref: 'property', placement_proposal: { scope_ref: 'scope-a', position_ref: 'pos' },
    mechanics_proposal: { mass_grams: 1, external_hand_cost: 0, carry_form: 'small', packing_slot_cost: 0, quantity: { value: 1, unit: 'item' }, container: null }
  };
  const output = await resolveOrdinaryMaterializationSeedScope(input(async () =>
    plan({ background_groups: [], entities: [entity] })
  ));
  assert.equal(output.pending_items_property_admission.length, 1);
  const handoff = output.pending_items_property_admission[0];
  assert.equal(handoff.status, 'pending_items_property_admission');
  assert.equal(handoff.supporting_basis_ref, 'basis-a');
  for (const field of ['semantic_descriptor', 'name', 'facts', 'placement_proposal',
    'mechanics_proposal', 'quantity', 'container']) {
    assert.equal(JSON.stringify(handoff).includes(field), false);
  }
  assert.equal(output.working_projection.ordinary_aggregate.remaining_identity_budget, 2);
  assert.equal(Object.hasOwn(output, 'plan'), false);
  assert.equal(Object.hasOwn(output, 'request'), false);
});

test('Stage A no_change leaves the aggregate untouched and budget input excludes plan content', async () => {
  let budgetCalls = 0;
  const unchanged = await resolveOrdinaryMaterializationSeedScope(input(async () => plan({
    resolution: 'no_change', density_band_proposal: null,
    background_groups: [], entities: [], reason_code: 'not_needed'
  }), { resolveIdentityBudget: async () => { budgetCalls += 1; return {
    policy_version: 'density', density_band: 'ordinary', identity_budget: 2, source: 'policy'
  }; } }));
  assert.equal(unchanged.status, 'no_change');
  assert.equal(unchanged.working_projection.ordinary_aggregate.state_version, 0);
  assert.equal(budgetCalls, 0);
  let budgetInput;
  await resolveOrdinaryMaterializationSeedScope(input(async () => plan({
    reason_code: 'untrusted_reason', background_groups: []
  }), { resolveIdentityBudget: async (value) => { budgetInput = value; return {
    policy_version: 'density', density_band: value.density_band, identity_budget: 2, source: 'policy'
  }; } }));
  assert.deepEqual(Object.keys(budgetInput), [
    'density_band', 'scope_ref', 'density_policy_ref', 'hard_technical_max'
  ]);
  assert.equal(JSON.stringify(budgetInput).includes('reason'), false);
  assert.equal(JSON.stringify(budgetInput).includes('entities'), false);
});

test('Stage A valid no_change needs no budget resolver and calls the model once', async () => {
  let calls = 0;
  const output = await resolveOrdinaryMaterializationSeedScope(input(async () => {
    calls += 1;
    return plan({ resolution: 'no_change', density_band_proposal: null,
      background_groups: [], entities: [], reason_code: 'not_needed' });
  }, { resolveIdentityBudget: undefined }));
  assert.equal(output.status, 'no_change');
  assert.equal(calls, 1);
});

test('Stage A rejects a mismatched working aggregate scope', async () => {
  const mismatch = createOrdinaryMaterializationWorkingProjection({
    ordinary_aggregate: createOrdinaryAggregate({
      scope_ref: { entity_kind: 'g6', entity_id: 'other-scope' },
      resolution_record_cap: 4
    })
  });
  await assert.rejects(() => resolveOrdinaryMaterializationSeedScope(input(async () => plan(), {
    workingProjection: mismatch
  })), { code: 'TURN_ORDINARY_SEED_SCOPE_MISMATCH' });
});

test('Stage A validates every pending entity causal basis and property context', async () => {
  const base = {
    semantic_descriptor: { semantic_type: 'spoon', name: 'spoon', facts: [] }, authority_class: 'ordinary',
    admission_class: 'common_mundane', availability_class: 'common', functional_bucket: 'household',
    presence_expectation: 'routine', supporting_basis_ref: 'basis-a',
    causal_basis: { basis_kind: 'household_use', basis_refs: ['basis-a'] }, property_basis_ref: 'property',
    placement_proposal: { scope_ref: 'scope-a', position_ref: 'pos' },
    mechanics_proposal: { mass_grams: 1, external_hand_cost: 0, carry_form: 'small', packing_slot_cost: 0, quantity: { value: 1, unit: 'item' }, container: null }
  };
  const unknown = structuredClone(base); unknown.causal_basis.basis_refs = ['unknown'];
  await assert.rejects(() => resolveOrdinaryMaterializationSeedScope(input(async () => plan({ background_groups: [], entities: [unknown] }))),
    (error) => error.details.code === 'ORDINARY_SEED_ENTITY_CAUSAL_BASIS_INVALID');
  const property = structuredClone(base); property.property_basis_ref = 'other';
  await assert.rejects(() => resolveOrdinaryMaterializationSeedScope(input(async () => plan({ background_groups: [], entities: [property] }))),
    (error) => error.details.code === 'ORDINARY_SEED_ENTITY_PROPERTY_INVALID');
});

test('Stage A rejects malformed, stale, and oversized budget resolutions without getters', async () => {
  const getter = {};
  let reads = 0;
  Object.defineProperty(getter, 'policy_version', { enumerable: true, get() { reads += 1; return 'density'; } });
  for (const result of [
    getter,
    { policy_version: 'other', density_band: 'ordinary', identity_budget: 1, source: 'policy' },
    { policy_version: 'density', density_band: 'ordinary', identity_budget: 3, source: 'policy' }
  ]) {
    await assert.rejects(() => resolveOrdinaryMaterializationSeedScope(input(async () => plan({ background_groups: [] }), {
      resolveIdentityBudget: async () => result
    })), { code: 'TURN_ORDINARY_SEED_BUDGET_INVALID' });
  }
  assert.equal(reads, 0);
});

test('Stage A working projection boundary rejects getters before any direct property read', async () => {
  const hostile = {};
  let reads = 0;
  Object.defineProperty(hostile, 'ordinary_aggregate', { enumerable: true,
    get() { reads += 1; return projection().ordinary_aggregate; } });
  await assert.rejects(() => resolveOrdinaryMaterializationSeedScope(input(async () => plan(), {
    workingProjection: hostile
  })), { code: 'TURN_ORDINARY_SEED_WORKING_PROJECTION_INVALID' });
  assert.equal(reads, 0);
});
