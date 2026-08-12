import { deepFreeze } from '@rus/kernel';

const DIMENSIONS = Object.freeze(['custody', 'property', 'promise']);

export class TemporaryDispositionSelectionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TemporaryDispositionSelectionError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function selectTemporaryDispositionOptions({ option_set: optionSet,
  selected_option_refs: selectedRefs } = {}) {
  validateOptionSet(optionSet);
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
  return deepFreeze({ schema: 'temporary_disposition_selection_v1',
    contract_ref: optionSet.contract_ref,
    contract_revision: optionSet.contract_revision,
    selected_option_ids: selected });
}

function validateOptionSet(optionSet) {
  if (!plain(optionSet)
      || optionSet.schema !== 'temporary_disposition_option_set_v1'
      || !stableId(optionSet.contract_ref)
      || !Number.isSafeInteger(optionSet.contract_revision)
      || optionSet.contract_revision < 1
      || optionSet.selection_source
        !== 'raw_intent_to_closed_exact_option_id_per_dimension'
      || !plain(optionSet.eligible_option_ids)) fail(
    'TEMPORARY_DISPOSITION_OPTION_SET_INVALID',
    'Temporary disposition option set is malformed.');
  const all = [];
  for (const dimension of DIMENSIONS) {
    const ids = optionSet.eligible_option_ids[dimension];
    if (!Array.isArray(ids) || ids.length === 0
        || ids.some((id) => !stableId(id))
        || new Set(ids).size !== ids.length) fail(
      'TEMPORARY_DISPOSITION_OPTION_SET_INVALID',
      'Eligible options must be duplicate-free stable ids.', { dimension });
    all.push(...ids);
  }
  if (new Set(all).size !== all.length) fail(
    'TEMPORARY_DISPOSITION_OPTION_SET_INVALID',
    'Eligible option ids must be unique across dimensions.');
}

function fail(code, message, details = {}) {
  throw new TemporaryDispositionSelectionError(code, message, details);
}
function stableId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}
