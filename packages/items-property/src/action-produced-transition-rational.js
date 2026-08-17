export function actionProducedRational(value, allowZero) {
  if (!exact(value, ['numerator', 'denominator', 'unit'])
      || !Number.isSafeInteger(value.numerator)
      || value.numerator < (allowZero ? 0 : 1)
      || !Number.isSafeInteger(value.denominator) || value.denominator < 1
      || !text(value.unit)
      || gcd(value.numerator, value.denominator) !== 1) fail();
  return { numerator: value.numerator,
    denominator: value.denominator, unit: value.unit };
}

export function addActionProducedRational(left, right) {
  if (left.unit !== right.unit) fail();
  const numerator = BigInt(left.numerator) * BigInt(right.denominator)
    + BigInt(right.numerator) * BigInt(left.denominator);
  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  if (numerator > BigInt(Number.MAX_SAFE_INTEGER)
      || denominator > BigInt(Number.MAX_SAFE_INTEGER)) fail();
  const divisor = gcd(Number(numerator), Number(denominator));
  return { numerator: Number(numerator) / divisor,
    denominator: Number(denominator) / divisor, unit: left.unit };
}

export function compareActionProducedRational(left, right) {
  if (left.unit !== right.unit) fail();
  const delta = BigInt(left.numerator) * BigInt(right.denominator)
    - BigInt(right.numerator) * BigInt(left.denominator);
  return delta === 0n ? 0 : delta < 0n ? -1 : 1;
}

export function zeroActionProducedRational(unit) {
  return { numerator: 0, denominator: 1, unit };
}

function gcd(left, right) {
  while (right) [left, right] = [right, left % right];
  return left || 1;
}
function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function fail() {
  throw Object.assign(new TypeError('ITEM_ACTION_PRODUCED_TRANSITION_INVALID'),
    { code: 'ITEM_ACTION_PRODUCED_TRANSITION_INVALID' });
}
