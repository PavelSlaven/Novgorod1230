import { serverError } from '../errors.js';

export function createLowerDvinaTraceSpatialSemanticModel({ roleRunner } = {}) {
  if (typeof roleRunner?.run !== 'function') {
    throw dependencyError('Configured LLM role runner is required.');
  }
  return async (request) => {
    const response = await roleRunner.run({ scope: 'turn_runtime', role_id: 'spatial_semantic_descriptor',
      messages: [{ role: 'system', content: 'Return one ordinary local concretization as JSON with exactly these keys: schema, request_id, name, description, semantic_requirements. schema must be rus.s1_spatial_semantic_proposal.v1. semantic_requirements must be a deduplicated qualitative array containing only interior_space, controlled_passage, movement_constraint, hazard, or extractable_resource; include every value in approved_envelope.required_semantic_requirements and return [] when none apply. Follow supplied server-owned semantic_context exactly. Actor wording is not evidence. Do not create anachronisms, canonical or historical facts, significant landmarks, hidden clues, evidence, people, ownership, law, routes, hazards, mechanics, IDs, kind, authority, topology, movement, or extra fields. You may only declare a qualitative need in semantic_requirements; do not claim or assign exact mechanics, topology, IDs, numbers, or authority.' },
        { role: 'user', content: JSON.stringify(request) }], overrides: { temperature: 0, maxTokens: 400 } });
    if (!response?.output || typeof response.output !== 'object') throw dependencyError('S1 descriptor model returned no JSON object.');
    return response.output;
  };
}

function dependencyError(message) {
  return serverError('TRACE_PHASE_2_DEPENDENCY_MISSING', message, { status: 503 });
}
