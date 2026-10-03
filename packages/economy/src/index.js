const APPROVALS = new Set(['approved', 'approved_with_limits', 'gap', 'rejected', 'quarantined']);
const ELIGIBLE_APPROVALS = new Set(['approved', 'approved_with_limits']);
const QUOTES = new WeakSet();

export function quoteLocalAmount(input = {}) {
  const request = validateRequest(input);
  if (!request.ok) return result('invalid', request.reason);

  const from = lookupRate(input.economyView.rates, input.fromUnitId, input.regionId, input.date);
  const to = lookupRate(input.economyView.rates, input.toUnitId, input.regionId, input.date);
  if (from.status === 'invalid' || to.status === 'invalid') return result('invalid', 'rate_invalid');
  if (from.status === 'conflict' || to.status === 'conflict') return result('conflict', 'rate_conflict');
  if (from.status !== 'quoted' || to.status !== 'quoted') return result('unresolved', 'rate_unresolved');

  const quantum = lookupQuantum(input.economyView.displayQuantums, input.toUnitId);
  if (quantum.status === 'conflict') return result('conflict', 'display_quantum_conflict');
  if (quantum.status !== 'quoted') return result('unresolved', 'display_quantum_unresolved');

  const label = lookupLabel(input.economyView.unitLabels, input.toUnitId);
  if (label.status === 'conflict') return result('conflict', 'unit_label_conflict');
  if (label.status !== 'quoted') return result('unresolved', 'unit_label_unresolved');

  const amount = rational(input.amount.numerator, input.amount.denominator);
  const exact = divide(multiply(amount, from.rate), to.rate);
  const rounded = multiply(roundHalfUp(divide(exact, quantum.value)), quantum.value);
  const quote = Object.freeze({
    status: 'quoted',
    fromUnitId: input.fromUnitId,
    toUnitId: input.toUnitId,
    unitLabel: label.text,
    exactAmount: freezeRational(exact),
    roundedAmount: freezeRational(rounded),
    displayQuantum: freezeRational(quantum.value)
  });
  QUOTES.add(quote);
  return quote;
}

export function renderLocalAmount(input) {
  if (!plainObject(input)) return result('invalid', 'quote_or_label_invalid');
  const { quote, unitLabel } = input;
  if (!quote || !QUOTES.has(quote) || quote.status !== 'quoted'
      || !isText(quote.toUnitId) || !isText(quote.unitLabel)
      || !isText(unitLabel) || /[\r\n]/.test(unitLabel)
      || unitLabel !== quote.unitLabel
      || !isRationalShape(quote.roundedAmount)) {
    return result('invalid', 'quote_or_label_invalid');
  }
  const amount = rational(quote.roundedAmount.numerator, quote.roundedAmount.denominator);
  const formatted = decimalText(amount);
  if (formatted === null) return result('unresolved', 'amount_not_displayable');
  return Object.freeze({ status: 'quoted', text: `${formatted} ${unitLabel}` });
}

function validateRequest(input) {
  if (!plainObject(input) || !plainObject(input.amount)
      || !isInteger(input.amount.numerator) || !isInteger(input.amount.denominator)
      || !isText(input.fromUnitId) || !isText(input.toUnitId)
      || !isText(input.regionId) || !isDate(input.date)
      || !plainObject(input.economyView)
      || !Array.isArray(input.economyView.rates)
      || !Array.isArray(input.economyView.displayQuantums)
      || !Array.isArray(input.economyView.unitLabels)) {
    return { ok: false, reason: 'request_invalid' };
  }
  try {
    const amount = rational(input.amount.numerator, input.amount.denominator);
    if (amount.numerator < 0n) return { ok: false, reason: 'amount_negative' };
  } catch {
    return { ok: false, reason: 'amount_invalid' };
  }
  if (!validateRows(input.economyView.rates)
      || !validateRows(input.economyView.displayQuantums)
      || !validateRows(input.economyView.unitLabels)) {
    return { ok: false, reason: 'projection_invalid' };
  }
  return { ok: true };
}

function validateRows(rows) {
  return rows.every((row) => plainObject(row)
    && isText(row.unitId)
    && APPROVALS.has(row.approval));
}

function lookupRate(rows, unitId, regionId, date) {
  const candidates = rows.filter((row) => row.unitId === unitId && row.regionId === regionId);
  for (const row of candidates) {
    if (!isDate(row.validFrom) || !isDate(row.validTo) || row.validFrom > row.validTo) return { status: 'invalid' };
  }
  const matching = candidates.filter((row) => row.validFrom <= date && row.validTo >= date);
  if (matching.length === 0) return { status: 'unresolved' };
  const evaluated = matching.map((row) => ({ row, rate: positiveRate(row) }));
  const values = new Set(evaluated.filter((item) => item.rate)
    .map(({ rate }) => `${rate.numerator}/${rate.denominator}`));
  if (values.size > 1) return { status: 'conflict' };
  if (matching.some((row) => row.approval === 'gap')
      || evaluated.some(({ row, rate }) => ELIGIBLE_APPROVALS.has(row.approval) && !rate)) {
    return { status: 'unresolved' };
  }
  const eligible = evaluated.filter(({ row, rate }) => rate && ELIGIBLE_APPROVALS.has(row.approval)
    && (row.approval !== 'approved_with_limits'
      || (Array.isArray(row.approvedScopes) && row.approvedScopes.some((scope) => scope?.use === 'currency_conversion'
        && scope.regionId === regionId
        && isDate(scope.validFrom) && isDate(scope.validTo)
        && scope.validFrom <= date && scope.validTo >= date))));
  return eligible.length > 0
    ? { status: 'quoted', rate: eligible[0].rate }
    : { status: 'unresolved' };
}

function positiveRate(row) {
  try {
    const rate = rational(row.bueNumerator, row.bueDenominator);
    return rate.numerator > 0n ? rate : null;
  } catch {
    return null;
  }
}

function lookupQuantum(rows, unitId) {
  const candidates = rows.filter((row) => row.unitId === unitId);
  if (candidates.length > 1) return { status: 'conflict' };
  if (candidates.length === 0 || candidates[0].approval !== 'approved') return { status: 'unresolved' };
  try {
    const value = rational(candidates[0].numerator, candidates[0].denominator);
    return value.numerator > 0n ? { status: 'quoted', value } : { status: 'unresolved' };
  } catch {
    return { status: 'unresolved' };
  }
}

function lookupLabel(rows, unitId) {
  const candidates = rows.filter((row) => row.unitId === unitId);
  if (candidates.length > 1) return { status: 'conflict' };
  if (candidates.length === 0 || candidates[0].approval !== 'approved'
      || !isText(candidates[0].text) || /[\r\n]/.test(candidates[0].text)) {
    return { status: 'unresolved' };
  }
  return { status: 'quoted', text: candidates[0].text };
}

function rational(numerator, denominator) {
  const n = integerBigInt(numerator);
  const d = integerBigInt(denominator);
  if (d <= 0n) throw new RangeError('denominator must be positive');
  const divisor = gcd(abs(n), d);
  return { numerator: n / divisor, denominator: d / divisor };
}

function multiply(left, right) {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

function divide(left, right) {
  if (right.numerator <= 0n) throw new RangeError('divisor must be positive');
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

function roundHalfUp(value) {
  const whole = value.numerator / value.denominator;
  const remainder = value.numerator % value.denominator;
  return { numerator: whole + (2n * remainder >= value.denominator ? 1n : 0n), denominator: 1n };
}

function decimalText(value) {
  let denominator = value.denominator;
  let twos = 0;
  let fives = 0;
  while (denominator % 2n === 0n) { denominator /= 2n; twos += 1; }
  while (denominator % 5n === 0n) { denominator /= 5n; fives += 1; }
  if (denominator !== 1n) return null;
  const scale = Math.max(twos, fives);
  const scaled = value.numerator * (10n ** BigInt(scale)) / value.denominator;
  const negative = scaled < 0n;
  let digits = abs(scaled).toString();
  if (scale === 0) return `${negative ? '-' : ''}${digits}`;
  digits = digits.padStart(scale + 1, '0');
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function freezeRational(value) {
  return Object.freeze({ numerator: value.numerator.toString(), denominator: value.denominator.toString() });
}

function isRationalShape(value) {
  if (!plainObject(value) || !isInteger(value.numerator) || !isInteger(value.denominator)) return false;
  try { return integerBigInt(value.denominator) > 0n; } catch { return false; }
}

function integerBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value)) return BigInt(value);
  throw new TypeError('integer string or BigInt required');
}

function isInteger(value) {
  return typeof value === 'bigint' || (typeof value === 'string' && /^-?(0|[1-9]\d*)$/.test(value));
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function gcd(left, right) {
  while (right !== 0n) [left, right] = [right, left % right];
  return left || 1n;
}

function abs(value) {
  return value < 0n ? -value : value;
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function result(status, reason) {
  return Object.freeze({ status, reason });
}
