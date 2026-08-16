/**
 * The deliberately small owner-native transition for an already committed
 * finite source.  It is not an inventory stack or a generic resource engine:
 * callers supply one source, one exact causal identity and one exact portion.
 */
export function planFiniteResourceDecrement(value = {}) {
  const input = clone(value);
  exact(input, ['source_resource_node_id', 'expected_state_version', 'causal_transition_identity', 'source', 'requested_decrement']);
  text(input.source_resource_node_id); text(input.causal_transition_identity);
  if (!Number.isSafeInteger(input.expected_state_version) || input.expected_state_version < 1) fail();
  exact(input.source, ['state_version', 'lifecycle_state', 'quantity']);
  if (input.source.state_version !== input.expected_state_version
      || input.source.lifecycle_state !== 'active') fail();
  const before = rational(input.source.quantity), decrement = rational(input.requested_decrement);
  if (before.unit !== decrement.unit || compare(before, decrement) < 0 || isZero(decrement)) fail();
  const after = subtract(before, decrement);
  return deepFreeze({
    schema: 'rus.items.finite_resource_decrement.v1',
    source_resource_node_id: input.source_resource_node_id,
    expected_state_version: input.expected_state_version,
    causal_transition_identity: input.causal_transition_identity,
    before_quantity: before,
    decrement_quantity: decrement,
    after_quantity: after,
    next_state_version: input.expected_state_version + 1,
    lifecycle_state_after: isZero(after) ? 'depleted' : 'active'
  });
}

/** One-shot bounded initialization.  The semantic boundary may select only a
 * committed alternative; it can never submit a free numeric estimate. */
export function resolveFiniteSourceInitialAmount(value = {}) {
  const input = clone(value);
  exact(input, ['initialization_identity', 'committed_amount', 'approved_alternatives', 'selected_amount']);
  text(input.initialization_identity);
  if (input.committed_amount !== null) {
    const amount = rational(input.committed_amount);
    if (input.selected_amount !== null || input.approved_alternatives.length !== 0) fail();
    return deepFreeze({ status:'already_committed', initialization_identity:input.initialization_identity, amount });
  }
  if (!Array.isArray(input.approved_alternatives) || input.approved_alternatives.length < 1) fail();
  const alternatives=input.approved_alternatives.map(rational);
  const selected=rational(input.selected_amount);
  if (new Set(alternatives.map(key)).size !== alternatives.length
      || !alternatives.some((entry)=>key(entry)===key(selected))) fail();
  return deepFreeze({ status:'initialized', initialization_identity:input.initialization_identity, amount:selected });
}

function rational(value) {
  exact(value, ['numerator', 'denominator', 'unit']);
  text(value.unit);
  if (!Number.isSafeInteger(value.numerator) || value.numerator < 0
      || !Number.isSafeInteger(value.denominator) || value.denominator < 1) fail();
  const divisor = gcd(value.numerator, value.denominator);
  return { numerator: value.numerator / divisor, denominator: value.denominator / divisor, unit: value.unit };
}
function subtract(left, right) {
  const numerator = BigInt(left.numerator) * BigInt(right.denominator)
    - BigInt(right.numerator) * BigInt(left.denominator);
  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  if (numerator < 0n || numerator > BigInt(Number.MAX_SAFE_INTEGER)
      || denominator > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  const divisor = gcd(Number(numerator), Number(denominator));
  return { numerator: Number(numerator) / divisor, denominator: Number(denominator) / divisor, unit: left.unit };
}
function compare(left, right) { const delta = BigInt(left.numerator) * BigInt(right.denominator) - BigInt(right.numerator) * BigInt(left.denominator); return delta === 0n ? 0 : delta < 0n ? -1 : 1; }
function isZero(value) { return value.numerator === 0; }
function key(value) { return `${value.numerator}/${value.denominator}:${value.unit}`; }
function gcd(a, b) { while (b) [a, b] = [b, a % b]; return a || 1; }
function text(value) { if (typeof value !== 'string' || value.trim() !== value || !value) fail(); }
function exact(value, keys) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail(); }
function fail() { const error = new TypeError('FINITE_RESOURCE_TRANSITION_INVALID'); error.code = 'FINITE_RESOURCE_TRANSITION_INVALID'; throw error; }
function clone(value) { const seen = new WeakSet(); const visit = (entry) => { if (entry === null || typeof entry === 'string' || typeof entry === 'boolean' || (typeof entry === 'number' && Number.isFinite(entry))) return entry; const array = Array.isArray(entry); if (!entry || typeof entry !== 'object' || seen.has(entry) || Object.getPrototypeOf(entry) !== (array ? Array.prototype : Object.prototype) || Object.getOwnPropertySymbols(entry).length) fail(); seen.add(entry); const result = array ? [] : {}; for (const key of Object.getOwnPropertyNames(entry)) { if (array && key === 'length') continue; const descriptor = Object.getOwnPropertyDescriptor(entry, key); if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(); if (array) { if (key !== String(result.length)) fail(); result.push(visit(descriptor.value)); } else result[key] = visit(descriptor.value); } return result; }; return visit(value); }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
