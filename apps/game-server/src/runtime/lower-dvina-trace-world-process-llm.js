import { serverError } from '../errors.js';

function choiceShape() {
  return JSON.stringify({
    interpretation: { grounded_transition: '<grounded_transition>' },
    outcome_choice: '<supplied outcome choice_id>', affected_ref_choices: [] });
}

export function createLowerDvinaTraceWorldProcessStepModel({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING', 'World-process model is required.',
    { status: 503 });
  return async function worldProcessStep(request) {
    const outcomeChoices = request.outcome_contract.map((outcome, index) => ({
      choice_id: `outcome_${index + 1}`,
      applicability: outcome.applicability
    }));
    const refChoices = worldProcessRefChoices(request);
    const response = await roleRunner.run({ scope: 'turn_runtime',
      role_id: 'world_process_step', overrides: { temperature: 0,
        maxTokens: 800 }, messages: [{ role: 'system', content: [
        'Return only the qualitative world-process semantic choice.',
        `Use this complete semantic shape:\n${choiceShape()}`,
        `Choose one applicable code-owned outcome by choice_id: ${JSON.stringify(outcomeChoices)}`,
        `Choose affected refs only through these opaque code-owned choices: ${JSON.stringify(refChoices.map(({ choice_id, source }) => ({ choice_id, source })))}`,
        'The server assembles schema, request/process identity, exact outcome pair, affected_refs, and empty fact_changes. Never copy or invent exact refs.',
        'Do not invent numbers, resources, timestamps, process IDs, damage, hidden facts, or authority.'
      ].join(' ') }, { role: 'user', content: JSON.stringify(request) }] });
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
