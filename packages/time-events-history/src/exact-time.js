import { deepFreeze, sha256 } from '@rus/kernel';

const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]*$/;

function fail(message) {
  throw new RangeError(message);
}

function hasExactly(value, expectedKeys) {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

export function canonicalizeTemporalValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (Array.isArray(value)) return value.map(canonicalizeTemporalValue);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeTemporalValue(value[key])]));
  }
  throw new TypeError('Temporal digest input must be JSON-safe canonical data');
}

export function computeTemporalDigest(value) {
  return `sha256:${sha256(canonicalizeTemporalValue(value))}`;
}

function decimal(value, field) {
  if (typeof value !== 'string' || !DECIMAL_PATTERN.test(value)) {
    fail(`${field} must be a canonical non-negative decimal string`);
  }
  return BigInt(value);
}

function positiveDecimal(value, field) {
  if (typeof value !== 'string' || !POSITIVE_DECIMAL_PATTERN.test(value)) {
    fail(`${field} denominator must be a canonical positive decimal string`);
  }
  return BigInt(value);
}

function gcd(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function freezeRational(numerator, denominator) {
  if (numerator === 0n) return deepFreeze({ numerator: '0', denominator: '1' });
  const divisor = gcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  return deepFreeze({
    numerator: reducedNumerator.toString(),
    denominator: reducedDenominator === 1n ? '1' : reducedDenominator.toString()
  });
}

export function normalizeRationalMinutes(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !hasExactly(value, ['numerator', 'denominator'])) {
    fail('rational minutes must contain exactly numerator and denominator properties');
  }
  return freezeRational(
    decimal(value.numerator, 'rational numerator'),
    positiveDecimal(value.denominator, 'rational')
  );
}

export function addRationalMinutes(left, right) {
  const a = normalizeRationalMinutes(left);
  const b = normalizeRationalMinutes(right);
  const leftNumerator = BigInt(a.numerator);
  const leftDenominator = BigInt(a.denominator);
  const rightNumerator = BigInt(b.numerator);
  const rightDenominator = BigInt(b.denominator);
  const denominatorDivisor = gcd(leftDenominator, rightDenominator);
  const leftScale = rightDenominator / denominatorDivisor;
  const rightScale = leftDenominator / denominatorDivisor;
  return freezeRational(
    leftNumerator * leftScale + rightNumerator * rightScale,
    leftDenominator * leftScale
  );
}

export function subtractRationalMinutes(left, right) {
  const a = normalizeRationalMinutes(left);
  const b = normalizeRationalMinutes(right);
  const numerator = BigInt(a.numerator) * BigInt(b.denominator)
    - BigInt(b.numerator) * BigInt(a.denominator);
  if (numerator < 0n) fail('exact rational time cannot be negative');
  return freezeRational(numerator, BigInt(a.denominator) * BigInt(b.denominator));
}

export function multiplyRationalMinutes(left, right) {
  const a = normalizeRationalMinutes(left);
  const b = normalizeRationalMinutes(right);
  const leftNumerator = BigInt(a.numerator);
  const leftDenominator = BigInt(a.denominator);
  const rightNumerator = BigInt(b.numerator);
  const rightDenominator = BigInt(b.denominator);
  const leftCrossDivisor = gcd(leftNumerator, rightDenominator);
  const rightCrossDivisor = gcd(rightNumerator, leftDenominator);
  return freezeRational(
    (leftNumerator / leftCrossDivisor) * (rightNumerator / rightCrossDivisor),
    (leftDenominator / rightCrossDivisor) * (rightDenominator / leftCrossDivisor)
  );
}

export function divideRationalMinutes(left, right) {
  const a = normalizeRationalMinutes(left);
  const b = normalizeRationalMinutes(right);
  const leftNumerator = BigInt(a.numerator);
  const leftDenominator = BigInt(a.denominator);
  const rightNumerator = BigInt(b.numerator);
  const rightDenominator = BigInt(b.denominator);
  if (rightNumerator === 0n) fail('exact rational divisor cannot be zero');
  const numeratorDivisor = gcd(leftNumerator, rightNumerator);
  const denominatorDivisor = gcd(rightDenominator, leftDenominator);
  return freezeRational(
    (leftNumerator / numeratorDivisor) * (rightDenominator / denominatorDivisor),
    (leftDenominator / denominatorDivisor) * (rightNumerator / numeratorDivisor)
  );
}

export function compareRationalMinutes(left, right) {
  const a = normalizeRationalMinutes(left);
  const b = normalizeRationalMinutes(right);
  const difference = BigInt(a.numerator) * BigInt(b.denominator)
    - BigInt(b.numerator) * BigInt(a.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function isZeroRationalMinutes(value) {
  return normalizeRationalMinutes(value).numerator === '0';
}

export function isPositiveRationalMinutes(value) {
  return normalizeRationalMinutes(value).numerator !== '0';
}

export function normalizeElapsedTime(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !hasExactly(value, ['exact_minutes'])) {
    fail('elapsed time must contain exactly the exact_minutes property');
  }
  return deepFreeze({ exact_minutes: normalizeRationalMinutes(value.exact_minutes) });
}

export function normalizeGameTimestamp(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || !hasExactly(value, ['whole_minutes', 'subminute_numerator', 'subminute_denominator'])) {
    fail('game timestamp must contain exactly whole_minutes and subminute fraction properties');
  }
  const wholeMinutes = decimal(value.whole_minutes, 'timestamp whole_minutes');
  const subminute = normalizeRationalMinutes({
    numerator: value.subminute_numerator,
    denominator: value.subminute_denominator
  });
  if (BigInt(subminute.numerator) >= BigInt(subminute.denominator)) {
    fail('timestamp subminute fraction must be proper');
  }
  return deepFreeze({
    whole_minutes: wholeMinutes.toString(),
    subminute_numerator: subminute.numerator,
    subminute_denominator: subminute.denominator
  });
}

function timestampAsRational(value) {
  const timestamp = normalizeGameTimestamp(value);
  const denominator = BigInt(timestamp.subminute_denominator);
  return freezeRational(
    BigInt(timestamp.whole_minutes) * denominator + BigInt(timestamp.subminute_numerator),
    denominator
  );
}

function rationalAsTimestamp(value) {
  const rational = normalizeRationalMinutes(value);
  const numerator = BigInt(rational.numerator);
  const denominator = BigInt(rational.denominator);
  const wholeMinutes = numerator / denominator;
  const remainder = numerator % denominator;
  const subminute = freezeRational(remainder, denominator);
  return deepFreeze({
    whole_minutes: wholeMinutes.toString(),
    subminute_numerator: subminute.numerator,
    subminute_denominator: subminute.denominator
  });
}

export function addElapsedTime(timestamp, elapsed) {
  const normalizedElapsed = normalizeElapsedTime(elapsed);
  return rationalAsTimestamp(addRationalMinutes(timestampAsRational(timestamp), normalizedElapsed.exact_minutes));
}

export function subtractGameTimestamp(later, earlier) {
  return subtractRationalMinutes(timestampAsRational(later), timestampAsRational(earlier));
}

export function compareGameTimestamp(left, right) {
  return compareRationalMinutes(timestampAsRational(left), timestampAsRational(right));
}

export function wholeMinuteIndex(timestamp) {
  return normalizeGameTimestamp(timestamp).whole_minutes;
}

export function countCrossedWholeMinuteBoundaries(before, after) {
  const normalizedBefore = normalizeGameTimestamp(before);
  const normalizedAfter = normalizeGameTimestamp(after);
  if (compareGameTimestamp(normalizedAfter, normalizedBefore) < 0) fail('whole-minute crossing window cannot be negative');
  return (BigInt(normalizedAfter.whole_minutes) - BigInt(normalizedBefore.whole_minutes)).toString();
}
