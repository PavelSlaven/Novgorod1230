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
    ? Object.freeze(value.version === 1
      ? [...value.cases, ...NON_ITEM_CASES, COMMON_POSITIVE_CASE]
      : [...value.cases]) : null;
}
export function validateLowerDvinaTraceOrdinaryStageBEval(value) {
  const snapshot = snapshotLowerDvinaTraceOrdinaryStageBJson(value);
  if (!exact(snapshot, ['schema', 'version', 'model_contract_ref',
    'model_identity_policy', 'cases'])
      || snapshot.schema !== 'rus.ordinary_materialization_stage_b_eval.v1'
      || ![1, 2].includes(snapshot.version)
      || snapshot.model_contract_ref !== 'ordinary_materialization_plan_v1'
      || snapshot.model_identity_policy
        !== 'single_exact_provider_model_config_role'
      || !Array.isArray(snapshot.cases)
      || snapshot.cases.length === 0
      || snapshot.version === 1 && snapshot.cases.length !== REQUIRED_CASES.length) return false;
  const ids = [];
  for (const probe of snapshot.cases) {
    if (!exact(probe, snapshot.version === 1
      ? ['id', 'query', 'risk_class', 'allowed_resolutions']
      : ['id', 'query', 'allowed_resolutions', 'expected_entity'])
        || !text(probe.id) || !text(probe.query)
        || snapshot.version === 1 && !text(probe.risk_class)
        || !Array.isArray(probe.allowed_resolutions)
        || snapshot.version === 1 && (probe.allowed_resolutions.length !== 2
          || probe.allowed_resolutions[0] !== 'absent'
          || probe.allowed_resolutions[1] !== 'authority_required')
        || snapshot.version === 2 && (probe.allowed_resolutions.length < 1
          || probe.allowed_resolutions.some((resolution) =>
            !['materialize', 'absent', 'authority_required'].includes(resolution))
          || (probe.expected_entity === null
            ? probe.allowed_resolutions.includes('materialize')
            : !exact(probe.expected_entity,
              ['semantic_type', 'mechanics_proposal'])
              || !text(probe.expected_entity.semantic_type)
              || !exact(probe.expected_entity.mechanics_proposal,
                ['mass_grams', 'external_hand_cost', 'carry_form',
                  'packing_slot_cost', 'quantity'])
              || ![probe.expected_entity.mechanics_proposal.mass_grams,
                probe.expected_entity.mechanics_proposal.external_hand_cost,
                probe.expected_entity.mechanics_proposal.packing_slot_cost]
                .every((number) => Number.isInteger(number) && number >= 0)
              || !text(probe.expected_entity.mechanics_proposal.carry_form)
              || !exact(probe.expected_entity.mechanics_proposal.quantity,
                ['value', 'unit'])
              || !Number.isInteger(probe.expected_entity.mechanics_proposal.quantity.value)
              || probe.expected_entity.mechanics_proposal.quantity.value < 1
              || probe.expected_entity.mechanics_proposal.quantity.unit !== 'item'
              || !probe.allowed_resolutions.includes('materialize')))) return false;
    ids.push(probe.id);
  }
  return new Set(ids).size === ids.length && (snapshot.version === 2
    || JSON.stringify([...ids].sort()) === JSON.stringify(REQUIRED_CASES));
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
  if (byId.size !== results.length) {
    return Object.freeze({ pass: false, failed_case_ids: Object.freeze(['invalid_eval_input']) });
  }
  const failed = [];
  for (const probe of cases) {
    const result = byId.get(probe.id);
    const positive = contract.version === 1 && probe.id === COMMON_POSITIVE_CASE.id;
    const nonItem = contract.version === 1
      && NON_ITEM_CASES.some(({ id }) => id === probe.id);
    const invalid = !exact(result, ['id', 'resolution', 'entities'])
      || result.id !== probe.id || !Array.isArray(result.entities)
      || (positive
        ? result.resolution !== 'materialize' || result.entities.length !== 1
          || result.entities[0]?.admission_class !== 'common_mundane'
        : nonItem
          ? result.resolution !== 'no_change' || result.entities.length !== 0
        : !probe.allowed_resolutions.includes(result.resolution)
          || (contract.version === 2 && result.resolution === 'materialize'
            ? result.entities.length !== 1
              || result.entities[0]?.admission_class !== 'common_mundane'
              || result.entities[0]?.semantic_descriptor?.semantic_type
                !== probe.expected_entity?.semantic_type
              || !sameMechanics(result.entities[0]?.mechanics_proposal,
                probe.expected_entity?.mechanics_proposal)
            : result.entities.length !== 0));
    if (invalid) {
      failed.push(probe.id);
    }
  }
  return Object.freeze({ pass: failed.length === 0,
    failed_case_ids: Object.freeze(failed.sort()) });
}

function sameMechanics(actual, expected) {
  return actual?.mass_grams === expected?.mass_grams
    && actual?.external_hand_cost === expected?.external_hand_cost
    && actual?.carry_form === expected?.carry_form
    && actual?.packing_slot_cost === expected?.packing_slot_cost
    && actual?.quantity?.value === expected?.quantity?.value
    && actual?.quantity?.unit === expected?.quantity?.unit;
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
