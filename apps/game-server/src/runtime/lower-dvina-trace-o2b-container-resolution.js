import {
  applyOrdinaryAggregateTransition,
  canonicalDigest,
  createOrdinaryCandidateKey,
  createOrdinaryCategoryKey,
  createOrdinaryContextVersion,
  createOrdinaryCoverageKey,
  createOrdinaryResolutionRef
} from '@rus/materialization';
import { createRuntimeInstanceMechanicsSnapshot,
  validateOrdinaryContainerContentsMechanics } from '@rus/items-property';
import { createOrdinaryContainerContentsAtomicWritePlan } from
  '../infrastructure/postgres/ordinary-materialization-container-batch-plan.js';
import { basisDigest } from
  '../infrastructure/postgres/ordinary-materialization-phase-6-commit-internal.js';

export function buildO2bContainerResolution({ committed, raw, seeded,
  operation, partyId, inputDigest }) {
  let aggregate = committed.aggregate;
  const transitions = [];
  const density = raw.resolution === 'no_change' ? 'sparse'
    : seeded.decision.density_band;
  const budget = raw.resolution === 'no_change' ? 0
    : seeded.identity_budget_resolution.identity_budget;
  const seedTransition = { kind:'seed', request_identity:
    committed.modelRequest.request_id, expected_state_version:
    aggregate.state_version, density_band:density, identity_budget:budget,
  background_groups:[] };
  aggregate = applyOrdinaryAggregateTransition({ aggregate,
    transition:seedTransition });
  transitions.push(seedTransition);
  const items = raw.resolution === 'no_change' ? [] : raw.entities.map(
    (entity, index) => {
      const built = buildItem({ entity, index, committed, aggregate,
        operation, partyId });
      aggregate = applyOrdinaryAggregateTransition({ aggregate,
        transition:built.transition });
      transitions.push(built.transition);
      return built.item;
    });
  if (new Set(items.map(({ item_id:id }) => id)).size !== items.length) {
    throw coded('ORDINARY_CONTAINER_BATCH_ITEM_ORDER_INVALID');
  }
  const closure = { kind:'close_coverage', request_identity:
    `${committed.modelRequest.request_id}:closure`, expected_state_version:
    aggregate.state_version, ...committed.identity, resolution:'no_change' };
  aggregate = applyOrdinaryAggregateTransition({ aggregate,
    transition:closure });
  transitions.push(closure);
  const mechanics = validateOrdinaryContainerContentsMechanics({
    inventory_input:committed.value.inventory_input,
    proposed_items:items.map((item) => ({ item_id:item.item_id,
      template_id:null, quantity:1, placement:{container_id:item.container_id},
      runtime_mechanics_snapshot:item.runtime_mechanics_snapshot })),
    container_id:committed.context.container_ref
  });
  if (!mechanics.pass) throw coded(mechanics.errors[0]?.code);
  const { value, context } = committed;
  const expectedBases = structuredClone(value.supporting_bases);
  const nextBases = structuredClone(value.supporting_bases);
  const plan = createOrdinaryContainerContentsAtomicWritePlan({
    party_id:partyId,
    scope_ref:{entity_kind:'container',entity_id:context.container_ref},
    request_identity:closure.request_identity,
    input_digest:canonicalDigest({inputDigest,
      stage_a_request:committed.modelRequest}),
    transition_digest:canonicalDigest(transitions), expected_versions:{
      party_state_version:value.party_state_version,
      ordinary_state_version:value.ordinary_state_version,
      catalog_version:value.catalog_version,
      property_version:value.property_version,
      placement_version:value.placement_version,
      supporting_basis_catalog_version:value.supporting_basis_catalog_version,
      supporting_basis_catalog_digest:value.supporting_basis_catalog_digest,
      property_placement_context_digest:value.property_placement_context_digest,
      container_state_version:value.container.state_version,
      capacity_snapshot_digest:canonicalDigest(value.capacity_snapshot) },
    expected_supporting_basis_catalog:expectedBases, new_prepared_bases:[],
    next_supporting_basis_catalog:nextBases,
    next_supporting_basis_catalog_version:value.supporting_basis_catalog_version,
    next_supporting_basis_catalog_digest:basisDigest(nextBases),
    enablement_pin:{objective_digest:value.enablement.objective_digest,
      enabled:true}, technical_limits:context.ordinary_policy.technical_limits,
    container_pin:{container_id:context.container_ref,
      state_version:value.container.state_version, template_id:context.template_id,
      mechanics_profile_ref:context.mechanics_profile_ref,
      mechanics_profile_digest:context.mechanics_profile_digest,
      context_digest:context.context_digest,
      ordinary_policy_digest:canonicalDigest(context.ordinary_policy)},
    transitions, next_aggregate:aggregate, items,
    mechanics:{inventory_input:value.inventory_input,
      expected_used_slots:mechanics.used_slots,
      expected_remaining_slots:mechanics.remaining_slots,
      expected_total_mass_grams:mechanics.total_mass_grams},
    container_transition:{access_kind:'open_and_view', state_patch:{
      open_state:'open', contents_state:'known', access_state:{access:'open'}},
    revealed_refs:items.map(({item_id}) => item_id).sort()}
  });
  return Object.freeze({ pass:true,
    materialized_items:structuredClone(items.map(playerHiddenChild)),
    ordinary_materialization_atomic_write_plan:plan, errors:[] });
}

function buildItem({ entity, index, committed, aggregate, operation, partyId }) {
  const context = committed.context;
  const objective = committed.objective;
  if (entity.authority_class !== 'ordinary'
      || entity.admission_class !== 'common_mundane'
      || entity.availability_class !== 'common'
      || entity.semantic_descriptor.facts.length !== 0
      || entity.property_basis_ref !== context.property_ref
      || entity.placement_proposal.scope_ref !== context.container_ref
      || entity.placement_proposal.position_ref !== context.container_ref
      || !mechanicsAllowed(entity.mechanics_proposal,
        context.mechanics_policy)) {
    throw coded('ORDINARY_CONTAINER_BATCH_ITEM_INVALID');
  }
  const scope = {entity_kind:'container',entity_id:context.container_ref};
  const policy = objective.policy_refs.ordinary_presence_policy_ref;
  const candidate_key = createOrdinaryCandidateKey({scope_ref:scope,
    semantic_type:entity.semantic_descriptor.semantic_type,
    functional_bucket:entity.functional_bucket,
    admission_class:entity.admission_class,
    availability_class:entity.availability_class, policy_version:policy});
  const coverage_key = createOrdinaryCoverageKey({scope_ref:scope,
    coverage_kind:'existing_container_item', coverage_ref:candidate_key,
    policy_version:policy});
  const category_key = createOrdinaryCategoryKey({scope_ref:scope,
    functional_bucket:entity.functional_bucket,
    admission_class:entity.admission_class,
    availability_class:entity.availability_class, policy_version:policy});
  const context_version = createOrdinaryContextVersion({scope_ref:scope,
    context_refs:objective.context_refs, ordinary_presence_policy_ref:policy,
    property_basis_ref:context.property_ref,
    property_placement_context_digest:
      committed.value.property_placement_context_digest});
  const request_identity = `${committed.modelRequest.request_id}:item:${index}`;
  const transition = {kind:'resolve_presence', request_identity,
    expected_state_version:aggregate.state_version,
    resolution_ref:createOrdinaryResolutionRef({scope_ref:scope,candidate_key,
      coverage_key,context_version,request_identity,policy_version:policy}),
    candidate_key, coverage_key, category_key, context_version,
    resolution:'materialize', identity_key:
      `ordinary_identity_${canonicalDigest({candidate_key,coverage_key,
        context_version}).slice(0,24)}`};
  const source_refs = uniqueSorted([entity.supporting_basis_ref,
    ...entity.causal_basis.basis_refs, context.property_ref,
    context.owner_controller_ref, context.mechanics_policy.policy_ref,
    context.site_function_ref,context.economic_context_ref,
    ...context.context_bound_permission_refs,context.profile_ref,
    context.profile_digest,context.policy_ref,context.context_digest,
    committed.value.property_placement_context_digest,
    committed.value.property_placement_context.property_catalog_version_ref,
    committed.value.property_placement_context.placement_catalog_version_ref,
    candidate_key, coverage_key]);
  const mechanics = entity.mechanics_proposal;
  const runtime = createRuntimeInstanceMechanicsSnapshot({schema:
    'rus.items.runtime_instance_mechanics_snapshot.v1', version:1,
  provenance:{source_kind:'ordinary_world_materialization',
    root_turn_id:operation.root_turn_id, step_index:operation.step_index,
    operation_ref:operation.operation_ref,
    origin_kind:'existing_container_ordinary', source_refs}, mechanics});
  const evidence = {schema:
    'rus.items.ordinary_existing_container_property_placement_evidence.v1',
  version:1, scope_ref:structuredClone(scope), container_id:context.container_ref,
  property_basis_ref:context.property_ref,
  property_context_ref:objective.context_refs.property_context_ref,
  owner_controller_ref:context.owner_controller_ref,
  property_placement_context_digest:
    committed.value.property_placement_context_digest,
  property_catalog_version_ref:
    committed.value.property_placement_context.property_catalog_version_ref,
  placement_catalog_version_ref:
    committed.value.property_placement_context.placement_catalog_version_ref};
  const item_id = `ordinary_item_${canonicalDigest({party_id:partyId,
    scope_ref:scope,candidate_key,coverage_key,context_version}).slice(0,24)}`;
  const causalBasisRefs = uniqueSorted(entity.causal_basis.basis_refs);
  return { transition, item:{item_id,request_identity,candidate_key,coverage_key,
    category_key,context_version,functional_bucket:entity.functional_bucket,
    admission_class:'common_mundane', supporting_basis_ref:
      entity.supporting_basis_ref, causal_basis_refs:causalBasisRefs,
    causal_basis_kind:null, condition_state:'serviceable', permission_refs:[],
    property_basis_ref:context.property_ref,
    mechanics_policy_ref:context.mechanics_policy.policy_ref,
    container_id:context.container_ref, item_proposal:{schema:
      'ordinary_existing_container_item_proposal_v1', request_id:request_identity,
      scope_ref:structuredClone(scope),candidate_key,coverage_key,context_version,
      semantic_descriptor:structuredClone(entity.semantic_descriptor),
      supporting_basis_ref:entity.supporting_basis_ref,causal_basis_kind:null,
      condition_state:'serviceable',property_basis_ref:context.property_ref,
      property_placement_evidence:evidence,
      placement:{container_id:context.container_ref},
      runtime_item_mechanics_policy_ref:context.mechanics_policy.policy_ref},
    mechanics_snapshot:{schema:
      'rus.items.runtime_instance_mechanics_snapshot.v2',version:2,
    provenance:{source_kind:'ordinary_world_materialization',
      causal_ref:context.context_digest,request_id:request_identity,
      candidate_key,coverage_key,context_version,
      policy_ref:context.mechanics_policy.policy_ref,
      source_refs:structuredClone(source_refs)},
    mechanics:structuredClone(mechanics)},
    runtime_mechanics_snapshot:runtime} };
}

function mechanicsAllowed(value, policy) {
  return exact(value, ['mass_grams','external_hand_cost','carry_form',
    'packing_slot_cost','quantity','container'])
    && exact(policy, ['policy_ref','min_mass_grams','max_mass_grams',
      'max_external_hand_cost','max_packing_slot_cost','allowed_carry_forms'])
    && exact(value.quantity, ['value','unit'])
    && value.mass_grams >= policy.min_mass_grams
    && value.mass_grams <= policy.max_mass_grams
    && value.packing_slot_cost <= policy.max_packing_slot_cost
    && value.external_hand_cost <= policy.max_external_hand_cost
    && policy.allowed_carry_forms.includes(value.carry_form)
    && value.quantity.unit === 'item' && value.quantity.value === 1
    && value.container === null;
}
function playerHiddenChild(item) { return {item_id:item.item_id,
  semantic_type:item.item_proposal.semantic_descriptor.semantic_type,
  authority:'ordinary',disclosure:'concealed',admission_class:'common_mundane',
  is_container:false,evidence:false,authentic_document:false,
  hidden_history:false,secret_cache:false,
  placement:{container_id:item.container_id}}; }
function uniqueSorted(values) { return [...new Set(values)].sort(); }
function exact(value, keys) { return value != null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value,key)); }
function coded(code) { return Object.assign(new Error(code),{code}); }
