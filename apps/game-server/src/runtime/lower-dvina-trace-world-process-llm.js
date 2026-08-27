import { serverError } from '../errors.js';

function planShape(request) {
  return JSON.stringify({ schema: 'world_process_step_plan_v1',
    request_id: request.request_id,
    process_ref: request.process?.process_ref ?? null,
    process_state_version: request.process_state_version,
    interpretation: { grounded_transition: '<grounded_transition>' },
    process_outcome: request.allowed_outcomes[0], affected_refs: [],
    fact_changes: [], reason_code: '<reason_code>' });
}

export function createLowerDvinaTraceWorldProcessStepModel({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') throw serverError(
    'TRACE_PHASE_2_DEPENDENCY_MISSING', 'World-process model is required.',
    { status: 503 });
  return async function worldProcessStep(request) {
    const response = await roleRunner.run({ scope: 'turn_runtime',
      role_id: 'world_process_step', overrides: { temperature: 0,
        maxTokens: 800 }, messages: [{ role: 'system', content: [
        'Return only one JSON object matching world_process_step_plan_v1.',
        `Use this complete valid shape:\n${planShape(request)}`,
        'Copy request_id, process_ref, and process_state_version exactly from request.',
        'Choose process_outcome only from request.allowed_outcomes; affected_refs',
        'may contain only unique refs supplied by request; fact_changes must be [].',
        'Choose only an allowed qualitative process outcome.',
        'Do not invent numbers, resources, timestamps, process IDs, damage, hidden facts, or authority.'
      ].join(' ') }, { role: 'user', content: JSON.stringify(request) }] });
    if (!response?.output || typeof response.output !== 'object'
        || Array.isArray(response.output)) throw serverError(
      'TRACE_WORLD_PROCESS_MODEL_RESPONSE_INVALID',
      'World-process role returned no JSON object.', { status: 503 });
    return response.output;
  };
}
