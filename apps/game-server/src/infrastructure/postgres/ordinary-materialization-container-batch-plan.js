import {
  assertAndNormalizeOrdinaryAggregate,
  canonicalDigest
} from '@rus/materialization';
import { validateOrdinaryContainerContentsMechanics } from
  '@rus/items-property';
import {
  basisDigest,
  clonePhase6Data,
  exact,
  fail,
  freezePhase6Data,
  normalizeSupportingBases,
  safeVersion,
  sameText,
  sameTextList,
  text,
  validTransitionShape,
  version
} from './ordinary-materialization-phase-6-commit-internal.js';
import { validateOrdinaryContainerBatchItem } from
  './ordinary-materialization-container-batch-item.js';

const SCHEMA = 'ordinary_container_contents_atomic_write_plan_v2';

export function createOrdinaryContainerContentsAtomicWritePlan(value = {}) {
  value = clonePhase6Data(value);
  if (Object.hasOwn(value, 'schema') || Object.hasOwn(value, 'write_plan_digest')) {
    exact(value, [...fields(), 'schema', 'write_plan_digest']);
    if (value.schema !== SCHEMA || !sameText(value.write_plan_digest)) {
      fail('ORDINARY_CONTAINER_BATCH_PLAN_INVALID');
    }
    const { schema, write_plan_digest, ...raw } = value;
    const normalized = createOrdinaryContainerContentsAtomicWritePlan(raw);
    if (normalized.write_plan_digest !== write_plan_digest) {
      fail('ORDINARY_CONTAINER_BATCH_PLAN_INVALID');
    }
    return normalized;
  }
  exact(value, fields());
  const scope = exact(value.scope_ref, ['entity_kind','entity_id']);
  if (scope.entity_kind !== 'container') fail('ORDINARY_CONTAINER_BATCH_SCOPE_INVALID');
  [value.party_id, scope.entity_id, value.request_identity,
    value.input_digest].forEach(text);
  const limits = exact(value.technical_limits,
    ['schema','version','max_new_entities']);
  const materializeCount = Array.isArray(value.transitions)
    ? value.transitions.filter((transition) => transition?.kind === 'resolve_presence'
      && transition.resolution === 'materialize').length : -1;
  if (limits.schema !== 'rus.items.existing_container_ordinary_limits.v1'
      || limits.version !== 1
      || !Number.isSafeInteger(limits.max_new_entities)
      || limits.max_new_entities < 1 || limits.max_new_entities > 8
      || !Array.isArray(value.items)
      || value.items.length > limits.max_new_entities
      || materializeCount > limits.max_new_entities) {
    fail('ORDINARY_CONTAINER_BATCH_LIMIT_INVALID');
  }
  const pins = exact(value.expected_versions, ['party_state_version',
    'ordinary_state_version','catalog_version','property_version',
    'placement_version','supporting_basis_catalog_version',
    'supporting_basis_catalog_digest','property_placement_context_digest',
    'container_state_version','capacity_snapshot_digest']);
  Object.entries(pins).filter(([key]) => !key.endsWith('_digest'))
    .forEach(([, entry]) => version(entry));
  [pins.supporting_basis_catalog_digest,pins.property_placement_context_digest,
    pins.capacity_snapshot_digest].forEach(text);
  const aggregate = assertAndNormalizeOrdinaryAggregate(value.next_aggregate);
  if (aggregate.scope_ref.entity_kind !== 'container'
      || aggregate.scope_ref.entity_id !== scope.entity_id) {
    fail('ORDINARY_CONTAINER_BATCH_SCOPE_INVALID');
  }
  validateTransitions(value, aggregate, pins);
  const expectedBases = normalizeSupportingBases(
    value.expected_supporting_basis_catalog, scope, aggregate, false);
  const newBases = normalizeSupportingBases(
    value.new_prepared_bases, scope, aggregate, true);
  const nextBases = normalizeSupportingBases(
    value.next_supporting_basis_catalog, scope, aggregate, false);
  const expectedNextVersion = pins.supporting_basis_catalog_version
    + (newBases.length ? 1 : 0);
  if (basisDigest(expectedBases) !== pins.supporting_basis_catalog_digest
      || canonicalDigest([...expectedBases,...newBases]
        .sort((a,b) => a.basis_ref.localeCompare(b.basis_ref)))
        !== canonicalDigest(nextBases)
      || value.next_supporting_basis_catalog_version !== expectedNextVersion
      || value.next_supporting_basis_catalog_digest !== basisDigest(nextBases)) {
    fail('ORDINARY_CONTAINER_BATCH_BASIS_INVALID');
  }
  const enablement = exact(value.enablement_pin, ['objective_digest','enabled']);
  if (!sameText(enablement.objective_digest) || enablement.enabled !== true) {
    fail('ORDINARY_CONTAINER_BATCH_ENABLEMENT_INVALID');
  }
  const container = validateContainerPin(value.container_pin, scope, pins);
  const items = value.items.map((item) => validateOrdinaryContainerBatchItem({
    item, plan:value, aggregate, bases:nextBases, container
  }));
  if (!sameTextList(items.map(({ item_id: id }) => id),
    [...items.map(({ item_id: id }) => id)].sort())) {
    fail('ORDINARY_CONTAINER_BATCH_ITEM_ORDER_INVALID');
  }
  validateMechanics(value.mechanics, items, container, pins);
  validateContainerTransition(value.container_transition, container, items);
  const plan = { schema: SCHEMA, party_id:value.party_id, scope_ref:scope,
    request_identity:value.request_identity, input_digest:value.input_digest,
    transition_digest:value.transition_digest, expected_versions:pins,
    expected_supporting_basis_catalog:expectedBases,
    new_prepared_bases:newBases, next_supporting_basis_catalog:nextBases,
    next_supporting_basis_catalog_version:expectedNextVersion,
    next_supporting_basis_catalog_digest:basisDigest(nextBases),
    enablement_pin:enablement, technical_limits:limits, container_pin:container,
    transitions:value.transitions, next_aggregate:aggregate, items,
    mechanics:value.mechanics, container_transition:value.container_transition };
  return freezePhase6Data({ ...plan,
    write_plan_digest:canonicalDigest(plan) });
}

function fields() {
  return ['party_id','scope_ref','request_identity','input_digest',
    'transition_digest','expected_versions',
    'expected_supporting_basis_catalog','new_prepared_bases',
    'next_supporting_basis_catalog','next_supporting_basis_catalog_version',
    'next_supporting_basis_catalog_digest','enablement_pin','technical_limits',
    'container_pin',
    'transitions','next_aggregate','items','mechanics','container_transition'];
}

function validateTransitions(value, aggregate, pins) {
  if (!Array.isArray(value.transitions) || value.transitions.length < 1
      || value.transitions.some((transition) => !validTransitionShape(transition))
      || aggregate.state_version !== pins.ordinary_state_version
        + value.transitions.length
      || value.transitions.at(-1).kind !== 'close_coverage'
      || value.transitions.at(-1).request_identity !== value.request_identity
      || value.transition_digest !== canonicalDigest(value.transitions)) {
    fail('ORDINARY_CONTAINER_BATCH_TRANSITION_INVALID');
  }
  const seedCount = value.transitions.filter(({ kind }) => kind === 'seed').length;
  const materialize = value.transitions.filter(({ kind, resolution }) =>
    kind === 'resolve_presence' && resolution === 'materialize');
  if (seedCount !== 1 || value.transitions[0].kind !== 'seed'
      || value.transitions.some(({ kind }) =>
        !['seed','resolve_presence','close_coverage'].includes(kind))
      || materialize.length !== value.items.length) {
    fail('ORDINARY_CONTAINER_BATCH_TRANSITION_INVALID');
  }
  const seed = value.transitions[0];
  const records = aggregate.presence_resolutions;
  const closure = aggregate.closed_observation_scopes;
  if (pins.ordinary_state_version !== 0
      || aggregate.last_committed_request_identity !== value.request_identity
      || aggregate.last_committed_transition_kind !== 'close_coverage'
      || aggregate.density_band !== seed.density_band
      || aggregate.identity_budget !== seed.identity_budget
      || records.length !== materialize.length
      || records.some((record,index) => canonicalDigest(record)
        !== canonicalDigest(presenceRecord(materialize[index])))
      || closure.length !== 1
      || canonicalDigest(closure[0]) !== canonicalDigest(
        closureRecord(value.transitions.at(-1)))) {
    fail('ORDINARY_CONTAINER_BATCH_TRANSITION_INVALID');
  }
}

function presenceRecord(value) { return { resolution_ref:value.resolution_ref,
  request_identity:value.request_identity,candidate_key:value.candidate_key,
  coverage_key:value.coverage_key,category_key:value.category_key,
  context_version:value.context_version,resolution:value.resolution,
  identity_key:value.identity_key }; }
function closureRecord(value) { return { request_identity:value.request_identity,
  coverage_key:value.coverage_key,category_key:value.category_key,
  context_version:value.context_version,resolution:value.resolution }; }

function validateContainerPin(value, scope, pins) {
  const pin = exact(value, ['container_id','state_version','template_id',
    'mechanics_profile_ref','mechanics_profile_digest','context_digest',
    'ordinary_policy_digest']);
  if (pin.container_id !== scope.entity_id
      || safeVersion(pin.state_version) !== pins.container_state_version
      || ![pin.template_id,pin.mechanics_profile_ref,
        pin.mechanics_profile_digest,pin.context_digest,
        pin.ordinary_policy_digest]
        .every((entry) => sameText(entry))) {
    fail('ORDINARY_CONTAINER_BATCH_CONTAINER_PIN_INVALID');
  }
  return pin;
}

function validateMechanics(value, items, container, pins) {
  const mechanics = exact(value, ['inventory_input','expected_used_slots',
    'expected_remaining_slots','expected_total_mass_grams']);
  const input = mechanics.inventory_input;
  const capacity = input?.capacity_snapshot;
  const inventoryContainer = Array.isArray(input?.containers)
    ? input.containers.find(({ container_id: id }) => id === container.container_id)
    : null;
  const profile = Array.isArray(input?.container_profiles)
    ? input.container_profiles.find(({ template_id: id }) =>
      id === container.template_id) : null;
  const currentItems = Array.isArray(input?.items) ? input.items : [];
  const currentPlacements = Array.isArray(input?.item_placements)
    ? input.item_placements : [];
  if (!profile) fail('ITEM_INVENTORY_PROFILE_NOT_FOUND');
  if (!Array.isArray(capacity) || !inventoryContainer
      || inventoryContainer.template_id !== container.template_id
      || canonicalDigest(profile) !== container.mechanics_profile_digest
      || capacity.length !== currentItems.length
      || capacity.some((row) => {
        const current = currentItems.find(({ item_id: id }) => id === row.item_id);
        const placement = currentPlacements.find(({ item_id: id }) =>
          id === row.item_id);
        return !current || placement?.container_id !== container.container_id
          || current.template_id !== row.template_id
          || current.quantity !== row.quantity
          || canonicalDigest(current.runtime_instance_mechanics_snapshot ?? null)
            !== canonicalDigest(
              row.state?.runtime_instance_mechanics_snapshot ?? null);
      })) fail('ORDINARY_CONTAINER_BATCH_MECHANICS_CONTEXT_INVALID');
  const result = validateOrdinaryContainerContentsMechanics({
    inventory_input:mechanics.inventory_input,
    proposed_items:items.map((item) => ({ item_id:item.item_id,
      template_id:null,quantity:1,placement:{container_id:item.container_id},
      runtime_mechanics_snapshot:item.runtime_mechanics_snapshot })),
    container_id:container.container_id
  });
  if (!result.pass
      || result.used_slots !== mechanics.expected_used_slots
      || result.remaining_slots !== mechanics.expected_remaining_slots
      || result.total_mass_grams !== mechanics.expected_total_mass_grams
      || canonicalDigest(mechanics.inventory_input.capacity_snapshot)
        !== pins.capacity_snapshot_digest) {
    fail(result.errors[0]?.code ?? 'ORDINARY_CONTAINER_BATCH_MECHANICS_INVALID');
  }
}

function validateContainerTransition(value, container, items) {
  const transition = exact(value, ['access_kind','state_patch','revealed_refs']);
  const patch = exact(transition.state_patch,
    ['open_state','contents_state','access_state']);
  if (!['open','open_and_view'].includes(transition.access_kind)
      || patch.open_state !== 'open' || patch.contents_state !== 'known'
      || patch.access_state?.access !== 'open'
      || !sameTextList(transition.revealed_refs,
        items.map(({ item_id }) => item_id).sort())
      || container.container_id.length === 0) {
    fail('ORDINARY_CONTAINER_BATCH_REVEAL_INVALID');
  }
}
