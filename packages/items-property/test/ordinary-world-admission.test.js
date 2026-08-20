import assert from 'node:assert/strict';
import test from 'node:test';
import { admitOrdinaryWorldMaterialization } from '../src/index.js';

const scopeRef = { entity_kind: 'g6', entity_id: 'scope-a' };

function handoff(overrides = {}) {
  const proposedItem = {
    semantic_descriptor: { semantic_type: 'spoon', name: 'простая деревянная ложка', facts: [] },
    authority_class: 'ordinary', admission_class: 'common_mundane',
    availability_class: 'common', functional_bucket: 'household',
    presence_expectation: 'routine', supporting_basis_ref: 'basis-a',
    causal_basis: { basis_kind: 'household_use', basis_refs: ['basis-a'] },
    property_basis_ref: 'property-a',
    placement_proposal: { scope_ref: 'scope-a', position_ref: 'bench-a' },
    mechanics_proposal: { mass_grams: 30, external_hand_cost: 0,
      carry_form: 'compact', packing_slot_cost: 0,
      quantity: { value: 1, unit: 'item' }, container: null }
  };
  return {
    schema: 'ordinary_pending_items_property_admission_v1',
    status: 'pending_items_property_admission', stage: 'presence_resolution',
    request_id: 'request-a', scope_ref: structuredClone(scopeRef),
    candidate_key: 'candidate-a', coverage_key: 'coverage-a',
    context_version: 'context-a',
    admission_evidence: {
      authority_class: 'ordinary', admission_class: 'common_mundane',
      availability_class: 'common', functional_bucket: 'household',
      supporting_basis_ref: 'basis-a', property_basis_ref: 'property-a',
      runtime_item_mechanics_policy_ref: 'mechanics-a',
      property_placement_context_digest: 'ed45c0d860a48fa798a6a02005daa4e9d4f7e428d93fa6241ee5bc1f71142482',
      property_catalog_version_ref: 'property-catalog-v1',
      placement_catalog_version_ref: 'placement-catalog-v1'
    },
    ...overrides,
    proposed_item: { ...proposedItem, ...overrides.proposed_item }
  };
}

function context(overrides = {}) {
  const property_placement_input = {
    scope_ref: structuredClone(scopeRef),
    property_catalog_version_ref: 'property-catalog-v1',
    placement_catalog_version_ref: 'placement-catalog-v1',
    item_kind: 'man_made', supporting_basis_ref: 'basis-a',
    causal_basis_refs: ['basis-a'], requested_position_ref: 'bench-a',
    personal_communal_refs: [], occupied_site_refs: ['household-a'],
    unowned_cause_refs: [], placement_context_refs: ['placement-a'],
    property_catalog: [{ property_basis_ref: 'property-a', state: 'committed',
      scope_ref: structuredClone(scopeRef), basis_class: 'occupied_site_default',
      source_ref: 'household-a', unowned_cause_ref: null }],
    placement_catalog: [{ position_ref: 'bench-a', state: 'committed',
      scope_ref: structuredClone(scopeRef), position_kind: 'scene_position',
      g6_ref: 'scope-a', containment_depth: 1,
      placement_context_ref: 'placement-a' }]
  };
  return {
    schema: 'rus.items.ordinary_world_admission_context.v3', version: 3,
    supporting_bases: [{ basis_ref: 'basis-a', state: 'prepared_seed',
      scope_ref: structuredClone(scopeRef), functional_buckets: ['household'],
      allowed_admission_classes: ['common_mundane'],
      prepared_seed_provenance: { seed_request_id: 'seed-a', mode: 'seed_scope',
        candidate_query: null } }],
    property_placement_input,
    mechanics_policy: { policy_ref: 'mechanics-a', max_mass_grams: 1000,
      allowed_external_hand_costs: [0, 1, 2],
      allowed_carry_forms: ['compact', 'regular'], max_packing_slot_cost: 10,
      max_quantity: 10 },
    causal_identity: { request_id: 'request-a', candidate_key: 'candidate-a',
      coverage_key: 'coverage-a', context_version: 'context-a',
      causal_ref: 'ordinary-resolution:request-a',
      source_refs: ['basis-a', 'bench-a', 'candidate-a', 'coverage-a',
        'ed45c0d860a48fa798a6a02005daa4e9d4f7e428d93fa6241ee5bc1f71142482', 'household-a', 'mechanics-a', 'placement-a', 'placement-catalog-v1', 'property-a', 'property-catalog-v1'] },
    ...overrides
  };
}

test('O1 admits an arbitrary common name through independent evidence and creates immutable v2 mechanics', () => {
  const input = handoff({ proposed_item: {
    semantic_descriptor: { semantic_type: 'ladle', name: 'не внесённый в каталог ковш', facts: [] }
  } });
  const result = admitOrdinaryWorldMaterialization({ handoff: input,
    admission_context: context() });
  assert.equal(result.pass, true);
  assert.equal(result.proposal.semantic_descriptor.name, 'не внесённый в каталог ковш');
  assert.deepEqual(result.runtime_instance_mechanics_snapshot, {
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v2', version: 2,
    provenance: { source_kind: 'ordinary_world_materialization',
      causal_ref: 'ordinary-resolution:request-a', request_id: 'request-a',
      candidate_key: 'candidate-a', coverage_key: 'coverage-a',
      context_version: 'context-a', policy_ref: 'mechanics-a',
      source_refs: ['basis-a', 'bench-a', 'candidate-a', 'coverage-a',
        'ed45c0d860a48fa798a6a02005daa4e9d4f7e428d93fa6241ee5bc1f71142482', 'household-a', 'mechanics-a', 'placement-a', 'placement-catalog-v1', 'property-a', 'property-catalog-v1'] },
    mechanics: input.proposed_item.mechanics_proposal
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.proposal), true);
  assert.equal(Object.isFrozen(result.runtime_instance_mechanics_snapshot), true);
});

test('O1 admits a work-group common tool, but rejects a bucket without its basis', () => {
  const pending = handoff();
  pending.admission_evidence.functional_bucket = 'work';
  pending.admission_evidence.supporting_basis_ref = 'basis-work';
  pending.proposed_item = { ...pending.proposed_item,
    semantic_descriptor: { semantic_type: 'mallet', name: 'деревянная колотушка', facts: [] },
    functional_bucket: 'work', supporting_basis_ref: 'basis-work',
    causal_basis: { basis_kind: 'work_use', basis_refs: ['basis-work'] } };
  const base = context();
  const admissionContext = { ...base,
    supporting_bases: [{ ...base.supporting_bases[0], basis_ref: 'basis-work',
      functional_buckets: ['work'] }],
    property_placement_input: { ...base.property_placement_input,
      supporting_basis_ref: 'basis-work', causal_basis_refs: ['basis-work'] },
    causal_identity: { ...base.causal_identity, source_refs: base.causal_identity.source_refs
      .map((ref) => ref === 'basis-a' ? 'basis-work' : ref).sort() } };
  assert.equal(admitOrdinaryWorldMaterialization({ handoff: pending,
    admission_context: admissionContext }).pass, true);
  assert.equal(admitOrdinaryWorldMaterialization({ handoff: pending,
    admission_context: { ...admissionContext, supporting_bases: base.supporting_bases } }).pass,
  false);
});

test('O1 rejects restricted admission, unsupported evidence, property, placement, mechanics and provenance', () => {
  const cases = [
    [handoff({ admission_evidence: { authority_class: 'ordinary', admission_class: 'weapon_or_armament', availability_class: 'common', functional_bucket: 'household', supporting_basis_ref: 'basis-a', property_basis_ref: 'property-a', runtime_item_mechanics_policy_ref: 'mechanics-a' } }), context()],
    [handoff({ proposed_item: { supporting_basis_ref: 'other' } }), context()],
    [handoff(), context({ property_placement_input: { ...context().property_placement_input, occupied_site_refs: [] } })],
    [handoff(), context({ property_placement_input: { ...context().property_placement_input, property_catalog: [{ ...context().property_placement_input.property_catalog[0], source_ref: 'unrelated' }] } })],
    [handoff(), context({ property_placement_evidence: { forged: true } })],
    [handoff({ proposed_item: { placement_proposal: { scope_ref: 'scope-a', position_ref: 'other' } } }), context()],
    [handoff({ proposed_item: { mechanics_proposal: { mass_grams: 1001, external_hand_cost: 0, carry_form: 'compact', packing_slot_cost: 0, quantity: { value: 1, unit: 'item' }, container: null } } }), context()],
    [handoff(), context({ causal_identity: { causal_ref: '', source_refs: ['basis-a'] } })]
  ];
  for (const [pending, admissionContext] of cases) {
    const result = admitOrdinaryWorldMaterialization({ handoff: pending,
      admission_context: admissionContext });
    assert.equal(result.pass, false);
  }
});

test('O1 hard-blocks template-less containers, currency and malformed descriptor accessors', () => {
  for (const admissionClass of ['container_capable', 'currency_or_precious',
    'weapon_or_armament', 'document_like', 'specialized_or_valuable',
    'other_restricted']) {
    const pending = handoff();
    pending.admission_evidence.admission_class = admissionClass;
    pending.proposed_item.admission_class = admissionClass;
    assert.equal(admitOrdinaryWorldMaterialization({ handoff: pending,
      admission_context: context() }).pass, false);
  }
  let reads = 0;
  const pending = handoff();
  Object.defineProperty(pending, 'schema', { enumerable: true,
    get() { reads += 1; return 'ordinary_pending_items_property_admission_v1'; } });
  assert.equal(admitOrdinaryWorldMaterialization({ handoff: pending,
    admission_context: context() }).pass, false);
  assert.equal(reads, 0);
});

test('O1 rejects restricted closed classes regardless of a common-looking descriptor', () => {
  for (const [admission_class, semantic_type, name] of [
    ['weapon_or_armament', 'ordinary_tool', 'простая деревянная ложка'],
    ['specialized_or_valuable', 'household_thing', 'обычная кухонная вещь'],
    ['document_like', 'paper_object', 'простой лист бумаги']
  ]) {
    const pending = handoff({ proposed_item: {
      semantic_descriptor: { semantic_type, name, facts: [] }
    } });
    pending.admission_evidence.admission_class = admission_class;
    pending.proposed_item.admission_class = admission_class;
    const result = admitOrdinaryWorldMaterialization({ handoff: pending,
      admission_context: context() });
    assert.equal(result.pass, false);
    assert.equal(result.errors[0].code, 'ITEM_ORDINARY_WORLD_RESTRICTED');
  }
});

test('O1 does not keyword-gate an arbitrary mundane free name when closed fields are valid', () => {
  const pending = handoff({ proposed_item: {
    semantic_descriptor: { semantic_type: 'unlisted_mundane',
      name: 'произвольная обычная вещь без словаря', facts: [] }
  } });
  assert.equal(admitOrdinaryWorldMaterialization({ handoff: pending,
    admission_context: context() }).pass, true);
});

test('O1 pins policy and exact causal identity/source set, including every causal basis', () => {
  const valid = handoff();
  valid.proposed_item.causal_basis = { basis_kind: 'household_use',
    basis_refs: ['basis-a', 'basis-b'] };
  const validContext = context({
    property_placement_input: { ...context().property_placement_input,
      causal_basis_refs: ['basis-a', 'basis-b'] },
    supporting_bases: [...context().supporting_bases, { basis_ref: 'basis-b',
      state: 'committed', scope_ref: structuredClone(scopeRef),
      prepared_seed_provenance: null, functional_buckets: ['household'],
      allowed_admission_classes: ['common_mundane'] }],
    causal_identity: { ...context().causal_identity, source_refs: ['basis-a',
      'basis-b', 'bench-a', 'candidate-a', 'coverage-a', 'ed45c0d860a48fa798a6a02005daa4e9d4f7e428d93fa6241ee5bc1f71142482', 'household-a',
      'mechanics-a', 'placement-a', 'placement-catalog-v1', 'property-a', 'property-catalog-v1'] }
  });
  assert.equal(admitOrdinaryWorldMaterialization({ handoff: valid,
    admission_context: validContext }).pass, true);
  for (const causalIdentity of [
    { ...validContext.causal_identity, candidate_key: 'swapped' },
    { ...validContext.causal_identity, source_refs: ['basis-a', 'bench-a'] },
    { ...validContext.causal_identity, source_refs: [...validContext.causal_identity.source_refs, 'extra'] }
  ]) assert.equal(admitOrdinaryWorldMaterialization({ handoff: valid,
    admission_context: { ...validContext, causal_identity: causalIdentity } }).pass,
  false);
  assert.equal(admitOrdinaryWorldMaterialization({ handoff: handoff({
    admission_evidence: { ...handoff().admission_evidence,
      runtime_item_mechanics_policy_ref: 'other-policy' }
  }), admission_context: context() }).pass, false);
  const arms = handoff(); arms.admission_evidence.functional_bucket = 'arms';
  arms.proposed_item.functional_bucket = 'arms';
  assert.equal(admitOrdinaryWorldMaterialization({ handoff: arms,
    admission_context: context({ supporting_bases: [{ ...context().supporting_bases[0],
      functional_buckets: ['arms'] }] }) }).pass, false);
  const unknown = handoff(); unknown.admission_evidence.functional_bucket = 'unknown';
  unknown.proposed_item.functional_bucket = 'unknown';
  assert.equal(admitOrdinaryWorldMaterialization({ handoff: unknown,
    admission_context: context({ supporting_bases: [{ ...context().supporting_bases[0],
      functional_buckets: ['unknown'] }] }) }).pass, false);
});

test('O1 rejects nested getters before reading them', () => {
  const input = { handoff: handoff(), admission_context: context() };
  let reads = 0;
  Object.defineProperty(input.handoff.proposed_item.mechanics_proposal, 'mass_grams', {
    enumerable: true, get() { reads += 1; return 30; }
  });
  assert.equal(admitOrdinaryWorldMaterialization(input).pass, false);
  assert.equal(reads, 0);
});
