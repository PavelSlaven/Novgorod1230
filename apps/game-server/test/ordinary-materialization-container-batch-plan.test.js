import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyOrdinaryAggregateTransition,
  canonicalDigest,
  createOrdinaryAggregate
} from '@rus/materialization';
import { createOrdinaryMaterializationAtomicWritePlan } from
  '../src/infrastructure/postgres/ordinary-materialization-phase-6-commit.js';
import { createOrdinaryContainerContentsAtomicWritePlan } from
  '../src/infrastructure/postgres/ordinary-materialization-container-batch-plan.js';

const partyId = 'party-o2b';
const scope = Object.freeze({ entity_kind:'container', entity_id:'chest' });
const profile = Object.freeze({ template_id:'chest-template',capacity:4,
  packing_slot_cost:1,carry_form:'regular',mass_grams:500 });
const basis = Object.freeze({ basis_ref:'basis:stored',state:'committed',
  scope_ref:scope,prepared_seed_provenance:null,functional_buckets:['household'],
  allowed_admission_classes:['common_mundane'],permission_refs:[] });

test('O2b seals a deterministic multi-item batch and exact mechanics', () => {
  const sealed = batchInput({ masses:[80,120] });
  assert.equal(sealed.schema,
    'ordinary_container_contents_atomic_write_plan_v2');
  assert.equal(sealed.items.length, 2);
  assert.equal(sealed.technical_limits.max_new_entities, 4);
  assert.equal(sealed.mechanics.expected_used_slots, 2);
  assert.equal(sealed.mechanics.expected_total_mass_grams, 700);
  assert.deepEqual(createOrdinaryMaterializationAtomicWritePlan(sealed), sealed);
});

test('O2b seals a zero-item coverage closure without a materialize row', () => {
  const sealed = batchInput({ masses:[] });
  assert.equal(sealed.items.length, 0);
  assert.equal(sealed.transitions.at(-1).kind, 'close_coverage');
  assert.equal(sealed.mechanics.expected_used_slots, 0);
  assert.equal(sealed.mechanics.expected_total_mass_grams, 500);
  assert.equal(batchInput({masses:[10,20],maxNewEntities:2}).items.length,2);
});

test('O2b fails closed on profile gap, packing overflow and sealed drift', () => {
  assert.throws(() => batchInput({ masses:[80], includeProfile:false }),
    { code:'ITEM_INVENTORY_PROFILE_NOT_FOUND' });
  assert.throws(() => batchInput({ masses:[80,120], capacity:1 }),
    { code:'CONTAINER_CAPACITY_EXCEEDED' });
  assert.throws(() => batchInput({ masses:[80,120], maxNewEntities:1,
    includeProfile:false }), { code:'ORDINARY_CONTAINER_BATCH_LIMIT_INVALID' });
  const excessiveTransitions=structuredClone(batchInput({masses:[80,120],
    maxNewEntities:2}));
  delete excessiveTransitions.schema;
  delete excessiveTransitions.write_plan_digest;
  excessiveTransitions.transitions.splice(2,0,
    structuredClone(excessiveTransitions.transitions[0]));
  assert.throws(() => createOrdinaryContainerContentsAtomicWritePlan(
    excessiveTransitions),{code:'ORDINARY_CONTAINER_BATCH_LIMIT_INVALID'});
  const sealed = batchInput({ masses:[80] });
  const drift = structuredClone(sealed);
  drift.items[0].runtime_mechanics_snapshot.mechanics.mass_grams = 81;
  assert.throws(() => createOrdinaryMaterializationAtomicWritePlan(drift),
    { code:'ORDINARY_CONTAINER_BATCH_MECHANICS_INVALID' });
  const invented = structuredClone(sealed);
  delete invented.schema;
  delete invented.write_plan_digest;
  invented.items[0].causal_basis_kind = 'invented_source';
  invented.items[0].item_proposal.causal_basis_kind = 'invented_source';
  assert.throws(() => createOrdinaryContainerContentsAtomicWritePlan(invented),
    { code:'ORDINARY_CONTAINER_BATCH_ITEM_INVALID' });
});

export function batchInput({ masses = [80], capacity = 4, maxNewEntities = 4,
  includeProfile = true, aggregate = seededAggregate(), partyStateVersion = 0,
  containerStateVersion = 1, requestIdentity = 'o2b-batch' } = {}) {
  const items = [];
  const transitions = [];
  let next = aggregate;
  for (let index = 0; index < masses.length; index += 1) {
    const childRequest = `${requestIdentity}:item:${index}`;
    const transition = { kind:'resolve_presence',
      request_identity:childRequest,expected_state_version:next.state_version,
      resolution_ref:`resolution:${index}`,candidate_key:`candidate:${index}`,
      coverage_key:`coverage:${index}`,category_key:'household',
      context_version:'container-context-v1',resolution:'materialize',
      identity_key:`identity:${index}` };
    next = applyOrdinaryAggregateTransition({ aggregate:next, transition });
    transitions.push(transition);
    items.push(child({ index, mass:masses[index], requestIdentity:childRequest }));
  }
  const closure = { kind:'close_coverage',request_identity:requestIdentity,
    expected_state_version:next.state_version,
    coverage_key:'container:contents:exhaustive',category_key:'all_ordinary',
    context_version:'container-context-v1',resolution:'no_change' };
  next = applyOrdinaryAggregateTransition({ aggregate:next, transition:closure });
  transitions.push(closure);
  const capacitySnapshot = [];
  const inventoryInput = { party_id:partyId,items:[],item_placements:[],
    item_profiles:[],containers:[{container_id:'chest',
      template_id:'chest-template'}],container_placements:[{
        party_id:partyId,container_id:'chest',anchor_id:'anchor'}],
    container_profiles:includeProfile ? [{...profile,capacity}] : [],
    container_compatibility:[],capacity_snapshot:capacitySnapshot };
  const expectedUsed = masses.length;
  const expectedRemaining = Math.max(0, capacity - expectedUsed);
  const basisCatalog = [basis];
  const technicalLimits = {schema:
    'rus.items.existing_container_ordinary_limits.v1',version:1,
    max_new_entities:maxNewEntities};
  const ordinaryPolicy = {schema:
    'rus.items.existing_container_ordinary_policy.v2',version:2,
    unresolved_ordinary_contents:true,technical_limits:technicalLimits};
  const value = { party_id:partyId,scope_ref:scope,
    request_identity:requestIdentity,input_digest:`input:${requestIdentity}`,
    transition_digest:canonicalDigest(transitions),expected_versions:{
      party_state_version:partyStateVersion,
      ordinary_state_version:aggregate.state_version,catalog_version:1,
      property_version:1,placement_version:1,
      supporting_basis_catalog_version:1,
      supporting_basis_catalog_digest:basisCatalogDigest(basisCatalog),
      property_placement_context_digest:'property-context-digest',
      container_state_version:containerStateVersion,
      capacity_snapshot_digest:canonicalDigest(capacitySnapshot) },
    expected_supporting_basis_catalog:basisCatalog,new_prepared_bases:[],
    next_supporting_basis_catalog:basisCatalog,
    next_supporting_basis_catalog_version:1,
    next_supporting_basis_catalog_digest:basisCatalogDigest(basisCatalog),
    enablement_pin:{objective_digest:'objective-digest',enabled:true},
    technical_limits:technicalLimits,
    container_pin:{container_id:'chest',state_version:containerStateVersion,
      template_id:'chest-template',mechanics_profile_ref:'chest-mechanics',
      mechanics_profile_digest:canonicalDigest({...profile,capacity}),
      context_digest:'container-context-digest',
      ordinary_policy_digest:canonicalDigest(ordinaryPolicy)},transitions,
    next_aggregate:next,items,mechanics:{inventory_input:inventoryInput,
      expected_used_slots:expectedUsed,
      expected_remaining_slots:expectedRemaining,
      expected_total_mass_grams:profile.mass_grams
        + masses.reduce((sum, mass) => sum + mass, 0)},
    container_transition:{access_kind:'open_and_view',state_patch:{
      open_state:'open',contents_state:'known',access_state:{access:'open'}},
      revealed_refs:items.map(({item_id}) => item_id).sort()} };
  return createOrdinaryContainerContentsAtomicWritePlan(
    JSON.parse(JSON.stringify(value)));
}

function seededAggregate() {
  return applyOrdinaryAggregateTransition({
    aggregate:createOrdinaryAggregate({scope_ref:scope,resolution_record_cap:32}),
    transition:{kind:'seed',request_identity:'seed:chest',
      expected_state_version:0,density_band:'ordinary',identity_budget:16,
      background_groups:[]}
  });
}

function child({ index, mass, requestIdentity }) {
  const candidate = `candidate:${index}`, coverage = `coverage:${index}`;
  const mechanics = {mass_grams:mass,external_hand_cost:0,
    carry_form:'compact',packing_slot_cost:1,
    quantity:{value:1,unit:'item'},container:null};
  const sourceRefs = [basis.basis_ref,candidate,coverage,
    'container-property','mechanics-policy'].sort();
  const evidence = {schema:
    'rus.items.ordinary_existing_container_property_placement_evidence.v1',
    version:1,scope_ref:scope,container_id:'chest',
    property_basis_ref:'container-property',property_context_ref:'chest-property',
    owner_controller_ref:'owner:actor',
    property_placement_context_digest:'property-context-digest',
    property_catalog_version_ref:'property-catalog-v1',
    placement_catalog_version_ref:'placement-catalog-v1'};
  const item = { item_id:'',request_identity:requestIdentity,
    candidate_key:candidate,coverage_key:coverage,category_key:'household',
    context_version:'container-context-v1',functional_bucket:'household',
    admission_class:'common_mundane',supporting_basis_ref:basis.basis_ref,
    causal_basis_refs:[basis.basis_ref],causal_basis_kind:null,
    condition_state:'serviceable',permission_refs:[],
    property_basis_ref:'container-property',mechanics_policy_ref:'mechanics-policy',
    container_id:'chest',item_proposal:{schema:
      'ordinary_existing_container_item_proposal_v1',request_id:requestIdentity,
      scope_ref:scope,candidate_key:candidate,coverage_key:coverage,
      context_version:'container-context-v1',semantic_descriptor:{
        semantic_type:'household_supply',name:`ordinary item ${index}`,
        facts:['ordinary']},supporting_basis_ref:basis.basis_ref,
      causal_basis_kind:null,condition_state:'serviceable',
      property_basis_ref:'container-property',
      property_placement_evidence:evidence,placement:{container_id:'chest'},
      runtime_item_mechanics_policy_ref:'mechanics-policy'},
    mechanics_snapshot:{schema:'rus.items.runtime_instance_mechanics_snapshot.v2',
      version:2,provenance:{source_kind:'ordinary_world_materialization',
        causal_ref:`cause:${index}`,request_id:requestIdentity,
        candidate_key:candidate,coverage_key:coverage,
        context_version:'container-context-v1',policy_ref:'mechanics-policy',
        source_refs:sourceRefs},mechanics},
    runtime_mechanics_snapshot:{schema:
      'rus.items.runtime_instance_mechanics_snapshot.v1',version:1,
      provenance:{source_kind:'ordinary_world_materialization',
        root_turn_id:'turn-o2b',step_index:1,operation_ref:requestIdentity,
        origin_kind:'existing_container_ordinary',source_refs:sourceRefs},
      mechanics} };
  item.item_id = `ordinary_item_${canonicalDigest({party_id:partyId,
    scope_ref:scope,candidate_key:candidate,coverage_key:coverage,
    context_version:'container-context-v1'}).slice(0,24)}`;
  return item;
}

function basisCatalogDigest(value) {
  return canonicalDigest({domain:'ordinary_supporting_basis_catalog_v1',
    supporting_bases:value});
}
