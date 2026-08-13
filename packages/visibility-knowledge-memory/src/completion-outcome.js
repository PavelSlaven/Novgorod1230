const ALLOWED_CLASSES = new Set([
  'committed_objective_fact',
  'committed_evidence_resolution_outcome',
  'committed_promise_state',
  'committed_typed_temporary_disposition'
]);
const RESERVED_PROJECTION_FIELDS = new Set([
  'visible_completion_state', 'visible_completion_dimensions',
  'visible_committed_facts', 'elapsed_game_time'
]);
const PRESENTATION_OWNER = ['@rus', 'presentation'].join('/');

export class CompletionResolutionError extends Error {
  constructor(code, details = null) {
    super(code);
    this.name = 'CompletionResolutionError';
    this.code = code;
    this.details = details;
  }
}

export function resolveCompositeCompletionOutcome(
  rules,
  committedInputs,
  sourceCommitVersion
) {
  validateRules(rules);
  if (!Number.isInteger(sourceCommitVersion) || sourceCommitVersion < 1) {
    fail('COMPLETION_SOURCE_COMMIT_VERSION_INVALID');
  }
  const facts = validateInputs(rules, committedInputs, sourceCommitVersion);
  const orderedDimensionOutcomes = rules.completion_outcome_model
    .dimension_order.map((dimensionId) => resolveDimension(
      rules.completion_dimensions.find(
        ({ dimension_id: id }) => id === dimensionId
      ),
      facts
    ));
  const selected = [];
  for (const stateId of rules.completion_outcome_model
    .primary_state_precedence) {
    const state = rules.completion_states.find(
      ({ completion_state_id: id }) => id === stateId
    );
    if (matchesState(state, facts, new Set(selected))) selected.push(stateId);
  }
  if (selected.length !== 1) {
    fail('COMPLETION_PRIMARY_STATE_AMBIGUOUS', { selected });
  }
  return freeze({
    schema: 'rus.trace_composite_completion_outcome.v1',
    primary_completion_state: selected[0],
    ordered_dimension_outcomes: orderedDimensionOutcomes,
    source_commit_version: sourceCommitVersion
  });
}

export function projectPlayerSafeCompletionOutcome({
  epilogueRules,
  completionRules,
  completionOutcome,
  visibleCommittedFacts,
  elapsedGameTime,
  visibleDetails = {}
}) {
  validateRules(completionRules);
  validateEpilogueRules(epilogueRules);
  if (completionOutcome?.schema
      !== 'rus.trace_composite_completion_outcome.v1'
      || !epilogueRules.allowed_completion_states.includes(
        completionOutcome.primary_completion_state
      )) {
    fail('EPILOGUE_COMPLETION_OUTCOME_INVALID');
  }
  if (!Array.isArray(visibleCommittedFacts)
      || visibleCommittedFacts.some((value) => !text(value))
      || new Set(visibleCommittedFacts).size !== visibleCommittedFacts.length) {
    fail('EPILOGUE_VISIBLE_FACTS_INVALID');
  }
  const visibleFacts = new Set(visibleCommittedFacts);
  const objective = new Map(completionOutcome.ordered_dimension_outcomes.map(
    ({ dimension_id: id, value_id: value }) => [id, value]
  ));
  const dimensions = epilogueRules.allowed_completion_dimensions.map(
    (dimensionId) => ({ dimension_id: dimensionId,
      value_id: visibleDimensionValue({ dimensionId,
        objectiveValue: objective.get(dimensionId), visibleFacts,
        completionRules, epilogueRules }) })
  );
  const projection = {
    schema: 'rus.trace_epilogue_narration_input.v1',
    visible_completion_state: completionOutcome.primary_completion_state,
    visible_completion_dimensions: dimensions,
    visible_committed_facts: [...visibleFacts].sort(),
    elapsed_game_time: clone(elapsedGameTime),
    ...allowlistedDetails(epilogueRules, visibleDetails)
  };
  for (const { dimension_id: id, value_id: value } of dimensions) {
    if (id === 'onisim_fate') projection.visible_onisim_fate = value;
    if (id === 'packet_state') projection.visible_packet_state = value;
    if (id === 'seal_state') projection.visible_seal_state = value;
    if (id === 'promise_state') projection.visible_promise_state = value;
  }
  const forbidden = new Set(epilogueRules.forbidden_hidden_fields);
  if (Object.keys(projection).some((key) => forbidden.has(key))) {
    fail('EPILOGUE_HIDDEN_FIELD_REJECTED');
  }
  return freeze(projection);
}

function validateInputs(rules, inputs, sourceCommitVersion) {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    fail('COMPLETION_COMMITTED_INPUTS_REQUIRED');
  }
  const declared = declaredProvenance(rules);
  const facts = new Set();
  for (const input of inputs) {
    if (!plain(input) || !ALLOWED_CLASSES.has(input.input_class)
        || !text(input.fact_id) || !text(input.producer_kind)
        || !text(input.producer_ref)
        || input.source_commit_version !== sourceCommitVersion) {
      fail('COMPLETION_COMMITTED_INPUT_INVALID', { input });
    }
    const key = `${input.producer_kind}\u0000${input.producer_ref}`;
    if (!declared.get(key)?.has(input.fact_id)) {
      fail('COMPLETION_FACT_PROVENANCE_UNDECLARED', {
        fact_id: input.fact_id,
        producer_kind: input.producer_kind,
        producer_ref: input.producer_ref
      });
    }
    if (input.input_class !== inputClassFor(input.producer_kind)) {
      fail('COMPLETION_INPUT_CLASS_PROVENANCE_MISMATCH', {
        fact_id: input.fact_id, input_class: input.input_class,
        producer_kind: input.producer_kind
      });
    }
    if (facts.has(input.fact_id)) {
      fail('COMPLETION_COMMITTED_INPUT_DUPLICATED', {
        fact_id: input.fact_id });
    }
    facts.add(input.fact_id);
  }
  return facts;
}

function declaredProvenance(rules) {
  const result = new Map();
  for (const producer of [
    ...rules.completion_fact_provenance.internal_producers,
    ...rules.completion_fact_provenance.external_committed_sources
  ]) {
    const kind = producer.producer_kind ?? producer.source_kind;
    const ref = producer.producer_ref ?? producer.source_ref;
    result.set(`${kind}\u0000${ref}`, new Set(producer.fact_ids));
  }
  return result;
}

function resolveDimension(dimension, facts) {
  const matches = dimension.values.filter(
    ({ when_any_of_committed_facts: values }) =>
      values?.some((fact) => facts.has(fact))
  );
  if (matches.length > 1) {
    fail('COMPLETION_DIMENSION_CONFLICT', { dimension_id:
      dimension.dimension_id, value_ids: matches.map(({ value_id: id }) => id) });
  }
  const selected = matches[0] ?? dimension.values.find(
    ({ when_no_known_fact: unresolved }) => unresolved === true
  );
  if (!selected) fail('COMPLETION_DIMENSION_UNRESOLVED', {
    dimension_id: dimension.dimension_id });
  return { dimension_id: dimension.dimension_id, value_id: selected.value_id };
}

function matchesState(state, facts, selectedStates) {
  return (state.all_of_committed_facts ?? []).every((fact) => facts.has(fact))
    && (!(state.any_of_committed_facts?.length)
      || state.any_of_committed_facts.some((fact) => facts.has(fact)))
    && (state.none_of_committed_facts ?? []).every((fact) => !facts.has(fact))
    && (state.none_of_completion_states ?? []).every(
      (stateId) => !selectedStates.has(stateId));
}

function visibleDimensionValue({ dimensionId, objectiveValue, visibleFacts,
  completionRules, epilogueRules }) {
  const explicit = epilogueRules.objective_to_player_visible_projection
    .dimension_projection_rules.find(({ dimension_id: id }) =>
      id === dimensionId);
  if (explicit) {
    const mapping = explicit.objective_value_visibility.find(
      ({ objective_value_id: id }) => id === objectiveValue);
    return mapping && visibleFacts.has(mapping.requires_visible_committed_fact)
      ? mapping.visible_value_id : explicit.unobserved_value_id;
  }
  const dimension = completionRules.completion_dimensions.find(
    ({ dimension_id: id }) => id === dimensionId);
  const value = dimension?.values.find(({ value_id: id }) =>
    id === objectiveValue);
  if (value?.when_no_known_fact === true) return objectiveValue;
  return value?.when_any_of_committed_facts?.some(
    (fact) => visibleFacts.has(fact)) ? objectiveValue
    : unresolvedValue(dimension);
}

function unresolvedValue(dimension) {
  const value = dimension?.values.find(
    ({ when_no_known_fact: unresolved }) => unresolved === true)?.value_id;
  if (!value) fail('EPILOGUE_VISIBLE_DIMENSION_UNRESOLVED');
  return value;
}

function allowlistedDetails(rules, details) {
  if (!plain(details)) fail('EPILOGUE_VISIBLE_DETAILS_INVALID');
  const allowed = new Set(rules.terminal_projection_allowlist);
  const result = {};
  for (const [key, value] of Object.entries(details)) {
    if (!allowed.has(key) || RESERVED_PROJECTION_FIELDS.has(key)) {
      fail('EPILOGUE_VISIBLE_FIELD_FORBIDDEN', { key });
    }
    assertNoHiddenFields(value, new Set(rules.forbidden_hidden_fields), key);
    result[key] = clone(value);
  }
  return result;
}

function inputClassFor(producerKind) {
  if (producerKind === 'phase_0c_evidence_resolution') {
    return 'committed_evidence_resolution_outcome';
  }
  if (producerKind === 'promise_policy_transition') {
    return 'committed_promise_state';
  }
  if (producerKind
      === 'typed_temporary_disposition_consequence_and_activity_cancellation') {
    return 'committed_typed_temporary_disposition';
  }
  return 'committed_objective_fact';
}

function assertNoHiddenFields(value, forbidden, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoHiddenFields(entry, forbidden,
      `${path}[${index}]`));
    return;
  }
  if (!plain(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) fail('EPILOGUE_HIDDEN_FIELD_REJECTED', {
      path: `${path}.${key}` });
    assertNoHiddenFields(child, forbidden, `${path}.${key}`);
  }
}

function validateRules(rules) {
  if (rules?.schema !== 'rus.trace_completion_rules.v1'
      || rules.owner !== '@rus/visibility-knowledge-memory'
      || rules.fallback_policy !== 'forbidden'
      || rules.completion_fact_provenance?.undeclared_fact_policy
      !== 'forbidden'
      || canonical(rules.input_contract?.allowed_input_classes)
        !== canonical([...ALLOWED_CLASSES])
      || !Array.isArray(rules.input_contract?.forbidden_input_classes)
      || rules.input_contract.forbidden_input_classes.length === 0
      || rules.input_contract.required_commit_state
        !== 'factual_commit_complete') fail('COMPLETION_RULES_INVALID');
  const order = rules.completion_outcome_model?.dimension_order;
  if (!Array.isArray(order) || order.length !== 9
      || new Set(order).size !== order.length
      || rules.completion_dimensions?.length !== order.length) {
    fail('COMPLETION_RULES_INVALID');
  }
}

function validateEpilogueRules(rules) {
  if (rules?.schema !== 'rus.trace_epilogue_rules.v1'
      || rules.owner !== PRESENTATION_OWNER
      || rules.narration_owner !== '@rus/narration'
      || rules.narration_factual_writes !== 'forbidden') {
    fail('EPILOGUE_RULES_INVALID');
  }
}

function fail(code, details = null) {
  throw new CompletionResolutionError(code, details);
}
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
function clone(value) { return structuredClone(value); }
function canonical(value) {
  return JSON.stringify([...(value ?? [])].sort());
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
