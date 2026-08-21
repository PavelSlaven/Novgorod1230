export function validateFiniteInitialAmountEstimatePolicy(value, path, errors,
  exactObject, stringConst, nonemptyString, issue) {
  if (!exactObject(value, ['schema', 'minimum', 'maximum'], path, errors)) return;
  stringConst(value.schema, 'finite_source_initial_amount_estimate_policy_v1',
    `${path}.schema`, errors);
  const minimum = amount(value.minimum, `${path}.minimum`, errors,
    exactObject, nonemptyString, issue);
  const maximum = amount(value.maximum, `${path}.maximum`, errors,
    exactObject, nonemptyString, issue);
  if (minimum && maximum && (minimum.unit !== maximum.unit
      || compare(minimum, maximum) > 0)) {
    issue(errors, path, 'range', `${path} must use one unit and ordered bounds.`);
  }
}

export function validateFiniteInitialAmountEstimateBinding({ entity, path,
  policy, errors, issue }) {
  const estimate = entity.finite_source_initial_amount_estimate;
  if (policy == null) {
    if (estimate !== undefined) issue(errors,
      `${path}.finite_source_initial_amount_estimate`, 'forbidden',
      'finite source initialization estimate was not requested.');
    return;
  }
  if (estimate === undefined) {
    issue(errors, `${path}.finite_source_initial_amount_estimate`, 'required',
      'finite source initialization estimate is required.');
    return;
  }
  const selected = plainAmount(estimate?.amount);
  const minimum = plainAmount(policy.minimum);
  const maximum = plainAmount(policy.maximum);
  if (estimate?.schema !== 'finite_source_initial_amount_estimate_v1'
      || !selected || !minimum || !maximum || selected.unit !== minimum.unit
      || selected.unit !== maximum.unit || compare(selected, minimum) < 0
      || compare(selected, maximum) > 0) {
    issue(errors, `${path}.finite_source_initial_amount_estimate`, 'range',
      'finite source initialization estimate must be inside the supplied bounds.');
  }
}

export function validateFiniteInitialAmountEstimate(value, path, errors,
  exactObject, stringConst, nonemptyString, issue) {
  if (!exactObject(value, ['schema', 'amount'], path, errors)) return;
  stringConst(value.schema, 'finite_source_initial_amount_estimate_v1',
    `${path}.schema`, errors);
  amount(value.amount, `${path}.amount`, errors, exactObject, nonemptyString,
    issue);
}

function amount(value, path, errors, exactObject, nonemptyString, issue) {
  if (!exactObject(value, ['numerator', 'denominator', 'unit'], path, errors)) {
    return null;
  }
  nonemptyString(value.unit, `${path}.unit`, errors);
  if (!Number.isSafeInteger(value.numerator) || value.numerator < 1) {
    issue(errors, `${path}.numerator`, 'range',
      `${path}.numerator must be a positive safe integer.`);
  }
  if (!Number.isSafeInteger(value.denominator) || value.denominator < 1) {
    issue(errors, `${path}.denominator`, 'range',
      `${path}.denominator must be a positive safe integer.`);
  }
  return plainAmount(value);
}

function plainAmount(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 3
    && Number.isSafeInteger(value.numerator) && value.numerator > 0
    && Number.isSafeInteger(value.denominator) && value.denominator > 0
    && typeof value.unit === 'string' && value.unit.trim() === value.unit
    && value.unit.length > 0 ? value : null;
}

function compare(left, right) {
  const value = BigInt(left.numerator) * BigInt(right.denominator)
    - BigInt(right.numerator) * BigInt(left.denominator);
  return value === 0n ? 0 : value < 0n ? -1 : 1;
}
