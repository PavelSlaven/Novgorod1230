const REQUIRED_CASES = Object.freeze([
  'anachronism',
  'evidence-clue',
  'letter-document',
  'misleading-common-name',
  'significant-hidden',
  'silver-currency',
  'sword-weapon'
]);
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
  if (!validateLowerDvinaTraceOrdinaryStageBEval(contract)
      || !Array.isArray(results) || results.length !== contract.cases.length) {
    return Object.freeze({ pass: false, failed_case_ids: Object.freeze(['invalid_eval_input']) });
  }
  const byId = new Map(results.map((entry) => [entry?.id, entry]));
  const failed = [];
  for (const probe of contract.cases) {
    const result = byId.get(probe.id);
    if (!exact(result, ['id', 'resolution', 'entities'])
        || result.id !== probe.id || !probe.allowed_resolutions.includes(result.resolution)
        || !Array.isArray(result.entities) || result.entities.length !== 0) {
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
