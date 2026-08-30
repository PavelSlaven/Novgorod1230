import { serverError } from '../errors.js';

function choiceShape() {
  return JSON.stringify({
    interpretation: { grounded_transition: '<grounded_transition>' },
    outcome_choice: '<supplied outcome choice_id>', affected_refs: [] });
}

export function createLowerDvinaTraceWorldProcessStepModel({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING', 'World-process model is required.',
    { status: 503 });
  return async function worldProcessStep(request) {
    const choices = request.outcome_contract.map((outcome, index) => ({
      choice_id: `outcome_${index + 1}`,
      applicability: outcome.applicability
    }));
    const response = await roleRunner.run({ scope: 'turn_runtime',
      role_id: 'world_process_step', overrides: { temperature: 0,
        maxTokens: 800 }, messages: [{ role: 'system', content: [
        'Return only the qualitative world-process semantic choice.',
        `Use this complete semantic shape:\n${choiceShape()}`,
        `Choose one applicable code-owned outcome by choice_id: ${JSON.stringify(choices)}`,
        'The server assembles schema, request/process identity, exact outcome pair, and empty fact_changes. affected_refs may contain only unique refs supplied by request.',
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
  return {
    schema: 'world_process_step_plan_v1', request_id: request.request_id,
    process_ref: request.process?.process_ref ?? null,
    process_state_version: request.process_state_version,
    interpretation: structuredClone(choice.interpretation),
    process_outcome: outcome.process_outcome,
    affected_refs: structuredClone(choice.affected_refs),
    fact_changes: [], reason_code: outcome.reason_code
  };
}
