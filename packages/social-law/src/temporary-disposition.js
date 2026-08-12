import { deepFreeze } from '@rus/kernel';

const INPUT_KEYS = ['committed_actor_predicates', 'committed_fact_ids',
  'committed_property_owner_ref', 'committed_witness_slots', 'contract'];
const CONTRACT_KEYS = ['committed_fact_output', 'contract_id',
  'custody_options', 'final_consequence_ref', 'forbidden_semantics', 'owner',
  'phase9_selection_contract', 'promise_options', 'property_options', 'schema',
  'selection_contract', 'version'];
const SELECTION_KEYS = ['forbidden_option_ids', 'policy'];
const DIMENSIONS = ['custody', 'property', 'promise'];

export class TemporaryDispositionPlanningError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TemporaryDispositionPlanningError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

/**
 * Resolves one temporary disposition from the exact authored option contract
 * and factual committed eligibility. It never grants authority, legal
 * judgment, punishment, completion, or an option absent from the contract.
 */
export function planTemporaryDisposition(input = {}) {
  exactObject(input, INPUT_KEYS, 'input');
  validateContract(input.contract);
  validateSelectionContract(input.contract.phase9_selection_contract);
  const facts = exactStrings(input.committed_fact_ids,
    'committed_fact_ids');
  const predicates = exactStrings(input.committed_actor_predicates,
    'committed_actor_predicates');
  const witnesses = exactStrings(input.committed_witness_slots,
    'committed_witness_slots');
  if (input.committed_property_owner_ref !== null
      && !stableId(input.committed_property_owner_ref)) {
    invalid('Committed property owner must be a stable ref or null.', {
      path: 'committed_property_owner_ref' });
  }
  const forbidden = new Set(
    input.contract.phase9_selection_contract.forbidden_option_ids);
  const selected = {};
  for (const dimension of DIMENSIONS) {
    const options = input.contract[`${dimension}_options`];
    const eligible = options.filter((option) => !forbidden.has(option.option_id)
      && optionEligible(option, { facts, predicates, witnesses,
        propertyOwner: input.committed_property_owner_ref }));
    if (eligible.length === 0) mismatch(
      'No authored temporary disposition option is eligible.', { dimension });
    selected[dimension] = eligible[0];
  }
  const selectedOptionIds = Object.fromEntries(DIMENSIONS.map(
    (dimension) => [dimension, selected[dimension].option_id]));
  const committedFactOutputs = [input.contract.committed_fact_output,
    ...DIMENSIONS.map((dimension) =>
      selected[dimension].committed_fact_output)].filter(Boolean);
  return deepFreeze({ schema: 'temporary_disposition_proposal_v1',
    contract_ref: { entity_kind: 'temporary_disposition_contract',
      entity_id: input.contract.contract_id },
    contract_revision: input.contract.version,
    selected_option_ids: selectedOptionIds,
    committed_fact_outputs: committedFactOutputs,
    legal_effect: 'temporary_disposition_only', completion: 'forbidden' });
}

function optionEligible(option, input) {
  return (option.required_committed_facts ?? []).every(
    (id) => input.facts.has(id))
    && (!(option.required_any_of_committed_facts?.length)
      || option.required_any_of_committed_facts.some(
        (id) => input.facts.has(id)))
    && (option.none_of_committed_facts ?? []).every(
      (id) => !input.facts.has(id))
    && (option.required_committed_actor_predicates ?? []).every(
      (id) => input.predicates.has(id))
    && (!(option.required_committed_actor_predicates_any_of?.length)
      || option.required_committed_actor_predicates_any_of.some(
        (id) => input.predicates.has(id)))
    && (option.required_witness_slots ?? []).every(
      (id) => input.witnesses.has(id))
    && (option.owner_must_remain == null
      || option.owner_must_remain === input.propertyOwner);
}

function validateContract(contract) {
  exactObject(contract, CONTRACT_KEYS, 'contract');
  if (contract.schema !== 'rus.trace_temporary_disposition_contract.v1'
      || !stableId(contract.owner) || !stableId(contract.contract_id)
      || !Number.isSafeInteger(contract.version) || contract.version < 1
      || !plain(contract.selection_contract)
      || contract.selection_contract.eligibility_source_state
        !== 'committed_world_state_only'
      || contract.selection_contract.selected_option_cardinality
        !== 'exactly_one_per_dimension'
      || !stableId(contract.final_consequence_ref)
      || !stableId(contract.committed_fact_output)
      || !Array.isArray(contract.forbidden_semantics)
      || contract.forbidden_semantics.length === 0) {
    invalid('Temporary disposition contract is not the approved closed contract.', {
      path: 'contract' });
  }
  for (const dimension of DIMENSIONS) {
    const options = contract[`${dimension}_options`];
    if (!Array.isArray(options) || options.length === 0) invalid(
      'Each temporary disposition dimension requires authored options.', {
        dimension });
    const ids = options.map(({ option_id: id }) => id);
    if (ids.some((id) => !stableId(id)) || new Set(ids).size !== ids.length) {
      invalid('Temporary disposition option ids must be unique and stable.', {
        dimension });
    }
    for (const option of options) validateOption(option, dimension);
  }
}

function validateOption(option, dimension) {
  if (!plain(option) || !stableId(option.option_id)
      || !stableId(option.committed_fact_output)) invalid(
    'Temporary disposition option is malformed.', { dimension });
  for (const key of ['required_committed_facts',
    'required_any_of_committed_facts', 'none_of_committed_facts',
    'required_committed_actor_predicates',
    'required_committed_actor_predicates_any_of', 'required_witness_slots']) {
    if (option[key] !== undefined) exactStringArray(option[key],
      `contract.${dimension}_options[].${key}`);
  }
  if (option.owner_must_remain !== undefined
      && !stableId(option.owner_must_remain)) invalid(
    'Property owner requirement must be a stable ref.', { dimension });
}

function validateSelectionContract(value) {
  exactObject(value, SELECTION_KEYS, 'selection_contract');
  if (value.policy !== 'first_eligible_in_authored_order') invalid(
    'Only the pinned deterministic selection policy is supported.', {
      path: 'selection_contract.policy' });
  exactStringArray(value.forbidden_option_ids,
    'selection_contract.forbidden_option_ids');
}

function exactStrings(value, path) {
  exactStringArray(value, path);
  return new Set(value);
}
function exactStringArray(value, path) {
  if (!Array.isArray(value) || value.some((item) => !stableId(item))
      || new Set(value).size !== value.length) invalid(
    'Expected a duplicate-free array of stable ids.', { path });
}
function exactObject(value, keys, path) {
  if (!plain(value)
      || JSON.stringify(Object.keys(value).sort())
        !== JSON.stringify([...keys].sort())) invalid(
    'Object shape is not part of the closed contract.', { path });
}
function stableId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}
function invalid(message, details) {
  throw new TemporaryDispositionPlanningError(
    'TEMPORARY_DISPOSITION_CONTRACT_INVALID', message, details);
}
function mismatch(message, details) {
  throw new TemporaryDispositionPlanningError(
    'TEMPORARY_DISPOSITION_ELIGIBILITY_UNSATISFIED', message, details);
}
