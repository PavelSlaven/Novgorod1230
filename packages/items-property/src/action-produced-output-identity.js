import { sha256 } from '@rus/kernel';

export function createActionProducedOutputIdentity(value) {
  if (!exact(value, ['root_turn_id', 'action_ref', 'ordinal'])
      || !text(value.root_turn_id) || !text(value.action_ref)
      || !Number.isSafeInteger(value.ordinal) || value.ordinal < 1
      || value.ordinal > 8) fail();
  return `a1_result_${sha256({
    domain: 'rus.items.action_produced_output_identity.v1',
    root_turn_id: value.root_turn_id,
    action_ref: value.action_ref,
    ordinal: value.ordinal
  }).slice(0, 32)}`;
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) { return typeof value === 'string'
  && value.length > 0 && value.trim() === value; }
function fail() { throw Object.assign(new TypeError(
  'ITEM_ACTION_PRODUCED_TRANSITION_INVALID'),
{ code: 'ITEM_ACTION_PRODUCED_TRANSITION_INVALID' }); }
