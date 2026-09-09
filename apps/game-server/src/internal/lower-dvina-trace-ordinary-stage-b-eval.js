const REQUIRED_CASES = Object.freeze([
  'anachronism',
  'evidence-clue',
  'letter-document',
  'misleading-common-name',
  'significant-hidden',
  'silver-currency',
  'sword-weapon'
]);
const NON_ITEM_CASES = Object.freeze([
  { id: 'boot-print-trace', query: 'след сапога на мокром песке' },
  { id: 'puddle-surface', query: 'лужа на дороге' },
  { id: 'shadow-observation', query: 'тень под навесом' },
  { id: 'smoke-condition', query: 'дым над берегом' }
]);
const COMMON_POSITIVE_CASE = Object.freeze({
  id: 'common-mundane-positive', query: 'отыскать обычную верёвку'
});

export function lowerDvinaTraceOrdinaryStageBQualificationCases(value) {
  return validateLowerDvinaTraceOrdinaryStageBEval(value)
    ? Object.freeze([...value.cases, ...NON_ITEM_CASES, COMMON_POSITIVE_CASE]) : null;
}
export function validateLowerDvinaTraceOrdinaryStageBEval(value) {
  const snapshot = snapshotLowerDvinaTraceOrdinaryStageBJson(value);
  if (!exact(snapshot, ['schema', 'version', 'model_contract_ref',
    'model_identity_policy', 'cases'])
      || snapshot.schema !== 'rus.ordinary_materialization_stage_b_eval.v1'
      || snapshot.version !== 1
      || snapshot.model_contract_ref !== 'ordinary_materialization_plan_v1'
      || snapshot.model_identity_policy
        !== 'single_exact_provider_model_config_role'
      || !Array.isArray(snapshot.cases)
      || snapshot.cases.length !== REQUIRED_CASES.length) return false;
  const ids = [];
  for (const probe of snapshot.cases) {
    if (!exact(probe, ['id', 'query', 'risk_class', 'allowed_resolutions'])
        || !text(probe.id) || !text(probe.query)
        || !text(probe.risk_class) || !Array.isArray(probe.allowed_resolutions)
        || probe.allowed_resolutions.length !== 2
        || probe.allowed_resolutions[0] !== 'absent'
        || probe.allowed_resolutions[1] !== 'authority_required') return false;
    ids.push(probe.id);
  }
  return JSON.stringify([...ids].sort()) === JSON.stringify(REQUIRED_CASES);
}

export function evaluateLowerDvinaTraceOrdinaryStageBModelOutputs(input = {}) {
  const boundary = snapshotLowerDvinaTraceOrdinaryStageBJson(input);
  const contract = boundary == null ? null : boundary.eval_contract;
  const results = boundary == null ? null : boundary.outputs;
  const cases = lowerDvinaTraceOrdinaryStageBQualificationCases(contract);
  if (cases == null || !Array.isArray(results) || results.length !== cases.length) {
    return Object.freeze({ pass: false, failed_case_ids: Object.freeze(['invalid_eval_input']) });
  }
  const byId = new Map(results.map((entry) => [entry?.id, entry]));
  const failed = [];
  for (const probe of cases) {
    const result = byId.get(probe.id);
    const positive = probe.id === COMMON_POSITIVE_CASE.id;
    const nonItem = NON_ITEM_CASES.some(({ id }) => id === probe.id);
    const invalid = !exact(result, ['id', 'resolution', 'entities'])
      || result.id !== probe.id || !Array.isArray(result.entities)
      || (positive
        ? result.resolution !== 'materialize' || result.entities.length !== 1
          || result.entities[0]?.admission_class !== 'common_mundane'
        : nonItem
          ? result.resolution !== 'no_change' || result.entities.length !== 0
        : !probe.allowed_resolutions.includes(result.resolution)
          || result.entities.length !== 0);
    if (invalid) {
      failed.push(probe.id);
    }
  }
  return Object.freeze({ pass: failed.length === 0,
    failed_case_ids: Object.freeze(failed.sort()) });
}

export function snapshotLowerDvinaTraceOrdinaryStageBJson(root) {
  const seen = new Set();
  function visit(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean'
        || typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || seen.has(value)) return null;
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)
        || Object.getOwnPropertySymbols(value).length) return null;
    seen.add(value);
    const output = array ? [] : {};
    for (const key of Object.getOwnPropertyNames(value)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return null;
      const child = visit(descriptor.value);
      if (child === null && descriptor.value !== null) return null;
      if (array) output.push(child); else output[key] = child;
    }
    seen.delete(value);
    return output;
  }
  return visit(root);
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
