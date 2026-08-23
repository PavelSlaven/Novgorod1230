import { serverError } from '../errors.js';

export function createLowerDvinaTraceSpatialSemanticModel({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') {
    throw dependencyError('Configured LLM role runner is required.');
  }
  return async (request) => {
    const response = await roleRunner.run({ scope: 'turn_runtime', role_id: 'spatial_semantic_descriptor',
      messages: [{ role: 'system', content: 'Return one ordinary local concretization as JSON: schema rus.s1_spatial_semantic_proposal.v1, request_id, name, description. Follow supplied server-owned semantic_context exactly. Actor wording is not evidence. Do not create anachronisms, canonical or historical facts, significant landmarks, hidden clues, evidence, people, ownership, law, routes, hazards, mechanics, IDs, kind, authority, topology, movement, or fields.' },
        { role: 'user', content: JSON.stringify(request) }], overrides: { temperature: 0, maxTokens: 400 } });
    if (!response?.output || typeof response.output !== 'object') throw dependencyError('S1 descriptor model returned no JSON object.');
    return response.output;
  };
}

function dependencyError(message) {
  return serverError('TRACE_PHASE_2_DEPENDENCY_MISSING', message, { status: 503 });
}
