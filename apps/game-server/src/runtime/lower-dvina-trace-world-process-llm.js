import { serverError } from '../errors.js';

export function createLowerDvinaTraceWorldProcessStepModel({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING', 'World-process model is required.',
    { status: 503 });
  return async function worldProcessStep(request) {
    const outcomeChoices = request.outcome_contract.map((outcome, index) => ({
      choice_id: `outcome_${index + 1}`,
      meaning: outcomeMeaning(outcome.process_outcome)
    }));
    const refChoices = worldProcessRefChoices(request);
    const projection = worldProcessProjection(request, outcomeChoices, refChoices);
    const response = await roleRunner.run({ scope: 'turn_runtime',
      role_id: 'world_process_step', overrides: { temperature: 0,
        maxTokens: 20_000 }, messages: [{ role: 'system', content: [
        'Верни JSON точно этой формы: {"interpretation":{"grounded_transition":"<переход>"},"outcome_choice":"<choice_id>","affected_ref_choices":[]}.',
        'Значение outcome_choice — один строковый идентификатор из переданного списка исходов; каждый элемент affected_ref_choices — один строковый идентификатор из переданного списка ссылок. Массив affected_ref_choices может быть пустым.',
        'Заполни interpretation.grounded_transition кратким описанием перехода, опирающимся на переданные факты.',
        'Выбери один исход из outcomes и, если нужно, ссылки из affected_ref_choices.',
        'Каждое смысловое утверждение опирай на переданные факты; отсутствующие факты считай неизвестными, неразрешённые противоречия сохраняй.'
      ].join(' ') }, { role: 'user', content: JSON.stringify(projection) }] });
    if (!response?.output || typeof response.output !== 'object'
        || Array.isArray(response.output)) throw serverError(
      'TRACE_WORLD_PROCESS_MODEL_RESPONSE_INVALID',
      'World-process role returned no JSON object.', { status: 503 });
    return assembleWorldProcessStepPlan(response.output, request);
  };
}

export function assembleWorldProcessStepPlan(choice, request) {
  const index = request.outcome_contract.findIndex((_, candidateIndex) =>
    choice.outcome_choice === `outcome_${candidateIndex + 1}`);
  const outcome = request.outcome_contract[index] ?? {};
  const refChoices = worldProcessRefChoices(request);
  const affectedRefs = Array.isArray(choice.affected_ref_choices)
    ? choice.affected_ref_choices.map((choiceId) => refChoices.find(
      ({ choice_id }) => choice_id === choiceId)?.ref)
    : choice.affected_ref_choices;
  return {
    schema: 'world_process_step_plan_v1', request_id: request.request_id,
    process_ref: request.process?.process_ref ?? null,
    process_state_version: request.process_state_version,
    interpretation: structuredClone(choice.interpretation),
    process_outcome: outcome.process_outcome,
    affected_refs: Array.isArray(affectedRefs)
      && affectedRefs.every((ref) => typeof ref === 'string')
      ? structuredClone(affectedRefs) : undefined,
    fact_changes: [], reason_code: outcome.reason_code
  };
}

function worldProcessRefChoices(request) {
  const choices = [], seen = new Set();
  collectRefChoices(request, '', choices, seen);
  return choices.map((choice, index) => ({
    choice_id: `ref_${index + 1}`, ...choice
  }));
}

function worldProcessProjection(request, outcomeChoices, refChoices) {
  const environmentFacts = qualitativeFacts(request.environment_state);
  const subjectFacts = qualitativeFacts(request.subject_state);
  const processFactsForModel = processFacts(request).filter((fact) =>
    !(fact === 'Огонь горит.' && subjectFacts.some((subjectFact) =>
      subjectFact.toLocaleLowerCase('ru').includes('огонь')
      && (subjectFact.toLocaleLowerCase('ru').includes('горит')
        || subjectFact.toLocaleLowerCase('ru').includes('продолжает гореть')))));
  const quantityFacts = waterQuantityFacts(request.subject_state, subjectFacts);
  const fuelFacts = [...new Set((request.process?.fuel_bindings ?? [])
    .map(({ fuel_class }) => fuelFact(fuel_class))
    .filter(Boolean))];
  return {
    ...(processFactsForModel.length > 0 ? { process_facts: processFactsForModel } : {}),
    ...(fuelFacts.length > 0 ? { fuel_facts: fuelFacts } : {}),
    ...(subjectFacts.length > 0 ? { subject_facts: subjectFacts } : {}),
    ...(quantityFacts.length > 0 ? { quantity_facts: quantityFacts } : {}),
    ...(environmentFacts.length > 0 ? { environment_facts: environmentFacts } : {}),
    outcomes: outcomeChoices,
    affected_ref_choices: refChoices.map(({ choice_id, source }) => ({
      choice_id, role: refRole(source)
    }))
  };
}

function processFacts(request) {
  if (request.process_kind !== 'fire') throw serverError(
    'TRACE_WORLD_PROCESS_REQUEST_INVALID', 'Unsupported world process kind.',
    { status: 400 });
  return [request.process?.status === 'active'
    ? 'Огонь горит.' : 'Состояние огня не установлено.'];
}

function fuelFact(fuelClass) {
  return fuelClass === 'ordinary_solid_fuel_unit' ? 'обычное твёрдое топливо' : null;
}

function qualitativeFacts(value) {
  if (!value || typeof value !== 'object') return [];
  const facts = [...(Array.isArray(value.facts) ? value.facts : []),
    ...(Array.isArray(value.qualitative_facts) ? value.qualitative_facts : [])];
  return [...new Set(facts.filter((fact) => typeof fact === 'string'
    && fact.trim().length > 0 && !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u.test(fact)))];
}

function waterQuantityFacts(subject, facts) {
  if (!facts.some((fact) => fact.toLocaleLowerCase('ru').includes('вод'))) return [];
  const quantities = subject?.quantities;
  if (!Array.isArray(quantities) || quantities.length !== 1) return [];
  const [{ mass_grams: grams, unit }] = quantities;
  if (unit !== 'item' || !Number.isSafeInteger(grams) || grams < 1) return [];
  const liters = grams / 1000;
  const amount = liters === 0.75 ? 'трёх четвертей литра'
    : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 })
      .format(liters)} л`;
  return [`Около ${amount} воды (${grams} г).`];
}

function outcomeMeaning(outcome) {
  return ({ start: 'Процесс начинается.',
    no_effect: 'Воздействие не меняет процесс.',
    continue: 'Воздействие меняет процесс, но не завершает его.',
    complete: 'Воздействие завершает процесс.' })[outcome]
    ?? 'Исход не описан в доступных фактах.';
}

function refRole(source) {
  const key = source.slice(source.lastIndexOf('.') + 1).replace(/\[\d+\]$/u, '');
  return ({ process_ref: 'процесс', scope_ref: 'место процесса',
    causal_basis_ref: 'причина процесса', fuel_ref: 'топливо процесса',
    source_refs: 'затронутый предмет' })[key] ?? 'связанное явление';
}

function collectRefChoices(value, path, choices, seen) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectRefChoices(
      child, `${path}[${index}]`, choices, seen));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const source = path ? `${path}.${key}` : key;
    if (key.endsWith('_ref') && typeof child === 'string') {
      addRefChoice(child, source, choices, seen);
    } else if (key.endsWith('_refs') && Array.isArray(child)) {
      child.forEach((ref, index) => addRefChoice(
        ref, `${source}[${index}]`, choices, seen));
    }
    collectRefChoices(child, source, choices, seen);
  }
}

function addRefChoice(ref, source, choices, seen) {
  if (typeof ref !== 'string' || ref.length === 0 || seen.has(ref)) return;
  seen.add(ref);
  choices.push({ source, ref });
}
