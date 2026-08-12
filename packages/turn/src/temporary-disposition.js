import { deepFreeze } from '@rus/kernel';

const DIMENSIONS = Object.freeze(['custody', 'property', 'promise']);
const CONTRACT_KEYS = Object.freeze(['committed_fact_output', 'contract_id',
  'custody_options', 'final_consequence_ref', 'forbidden_semantics', 'owner',
  'promise_options', 'property_options', 'schema', 'selection_contract',
  'version']);

export class TemporaryDispositionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TemporaryDispositionError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function resolveTemporaryDispositionOptions(input = {}) {
  validateInput(input);
  const facts = new Set(input.committed_fact_ids);
  const predicates = new Set(input.committed_actor_predicates);
  const witnesses = new Set(input.committed_witness_slots);
  const eligible = {};
  for (const dimension of DIMENSIONS) {
    eligible[dimension] = input.contract[`${dimension}_options`]
      .filter((option) => optionEligible(option, { facts, predicates,
        witnesses, propertyOwner: input.committed_property_owner_ref }))
      .map(({ option_id: optionId }) => optionId);
    if (eligible[dimension].length === 0) fail(
      'TEMPORARY_DISPOSITION_ELIGIBILITY_UNSATISFIED',
      'No authored temporary disposition option is eligible.', { dimension });
  }
  return deepFreeze({ schema: 'temporary_disposition_option_set_v1',
    contract_ref: input.contract.contract_id,
    contract_revision: input.contract.version,
    selection_source:
      'raw_intent_to_closed_exact_option_id_per_dimension',
    eligible_option_ids: eligible });
}

export function commitTemporaryDispositionSelection({ contract, option_set:
  optionSet, selected_option_refs: selectedRefs } = {}) {
  validateContract(contract);
  validateOptionSet(optionSet, contract);
  if (!Array.isArray(selectedRefs)
      || selectedRefs.some((ref) => !stableId(ref))
      || new Set(selectedRefs).size !== selectedRefs.length) fail(
    'TEMPORARY_DISPOSITION_SELECTION_INVALID',
    'Selected option refs must be unique stable ids.');
  const selected = {};
  for (const dimension of DIMENSIONS) {
    const matches = selectedRefs.filter((ref) =>
      optionSet.eligible_option_ids[dimension].includes(ref));
    if (matches.length !== 1) fail(
      matches.length > 1 ? 'TEMPORARY_DISPOSITION_SELECTION_CONFLICT'
        : 'TEMPORARY_DISPOSITION_SELECTION_NOT_ADMITTED',
      'Raw intent must select exactly one eligible option per dimension.',
      { dimension });
    selected[dimension] = matches[0];
  }
  if (selectedRefs.length !== DIMENSIONS.length) fail(
    'TEMPORARY_DISPOSITION_SELECTION_NOT_ADMITTED',
    'Selection contains refs outside the closed eligible option set.');
  const selectedOptions = Object.fromEntries(DIMENSIONS.map((dimension) => [
    dimension, contract[`${dimension}_options`].find(
      ({ option_id: optionId }) => optionId === selected[dimension])
  ]));
  return deepFreeze({ schema: 'temporary_disposition_proposal_v1',
    contract_ref: { entity_kind: 'temporary_disposition_contract',
      entity_id: contract.contract_id }, contract_revision: contract.version,
    selected_option_ids: selected,
    committed_fact_outputs: [contract.committed_fact_output,
      ...DIMENSIONS.map((dimension) =>
        selectedOptions[dimension].committed_fact_output)].filter(Boolean),
    legal_effect: 'temporary_disposition_only', completion: 'forbidden' });
}

function validateInput(input) {
  if (!plain(input)) invalid('Temporary disposition input is required.');
  validateContract(input.contract);
  for (const key of ['committed_fact_ids', 'committed_actor_predicates',
    'committed_witness_slots']) validateStableIds(input[key], key);
  if (input.committed_property_owner_ref !== null
      && !stableId(input.committed_property_owner_ref)) invalid(
    'Committed property owner must be a stable ref or null.');
}

function validateContract(contract) {
  if (!plain(contract)
      || JSON.stringify(Object.keys(contract).sort())
        !== JSON.stringify([...CONTRACT_KEYS].sort())
      || contract.schema !== 'rus.trace_temporary_disposition_contract.v1'
      || contract.owner !== '@rus/turn' || !stableId(contract.contract_id)
      || !Number.isSafeInteger(contract.version) || contract.version < 1
      || contract.selection_contract?.eligibility_source_state
        !== 'committed_world_state_only'
      || contract.selection_contract?.selection_source
        !== 'raw_intent_to_closed_exact_option_id_per_dimension'
      || contract.selection_contract?.selected_option_cardinality
        !== 'exactly_one_per_dimension'
      || !stableId(contract.final_consequence_ref)
      || !stableId(contract.committed_fact_output)
      || !Array.isArray(contract.forbidden_semantics)
      || contract.forbidden_semantics.length === 0) invalid(
    'Temporary disposition contract is not the approved @rus/turn contract.');
  for (const dimension of DIMENSIONS) {
    const options = contract[`${dimension}_options`];
    if (!Array.isArray(options) || options.length === 0
        || options.some((option) => !plain(option)
          || !stableId(option.option_id)
          || !stableId(option.committed_fact_output))
        || new Set(options.map(({ option_id: id }) => id)).size
          !== options.length) invalid(
      'Temporary disposition options are malformed.', { dimension });
  }
  const allOptionIds = DIMENSIONS.flatMap((dimension) =>
    contract[`${dimension}_options`].map(({ option_id: id }) => id));
  if (new Set(allOptionIds).size !== allOptionIds.length) invalid(
    'Temporary disposition option ids must be unique across dimensions.');
}

function validateOptionSet(optionSet, contract) {
  if (!plain(optionSet)
      || optionSet.schema !== 'temporary_disposition_option_set_v1'
      || optionSet.contract_ref !== contract.contract_id
      || optionSet.contract_revision !== contract.version
      || optionSet.selection_source
        !== 'raw_intent_to_closed_exact_option_id_per_dimension'
      || !plain(optionSet.eligible_option_ids)) invalid(
    'Temporary disposition option set does not match the approved contract.');
  for (const dimension of DIMENSIONS) {
    validateStableIds(optionSet.eligible_option_ids[dimension],
      `eligible_option_ids.${dimension}`);
    const approved = new Set(contract[`${dimension}_options`].map(
      ({ option_id: id }) => id));
    if (optionSet.eligible_option_ids[dimension].length === 0
        || optionSet.eligible_option_ids[dimension].some(
          (id) => !approved.has(id))) invalid(
      'Eligible option set contains an unapproved option.', { dimension });
  }
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

function validateStableIds(value, path) {
  if (!Array.isArray(value) || value.some((id) => !stableId(id))
      || new Set(value).size !== value.length) invalid(
    'Expected a duplicate-free array of stable ids.', { path });
}
function invalid(message, details = {}) { fail(
  'TEMPORARY_DISPOSITION_CONTRACT_INVALID', message, details); }
function fail(code, message, details = {}) {
  throw new TemporaryDispositionError(code, message, details);
}
function stableId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}
