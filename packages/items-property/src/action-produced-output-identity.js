export function createActionProducedOutputIdentity(value) {
  if (!exact(value, ['root_turn_id', 'action_ref', 'ordinal'])
      || !text(value.root_turn_id) || !text(value.action_ref)
      || !Number.isSafeInteger(value.ordinal) || value.ordinal < 1
      || value.ordinal > 8) fail();
  return `a1-result:${value.action_ref}:output:${value.ordinal}`;
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
