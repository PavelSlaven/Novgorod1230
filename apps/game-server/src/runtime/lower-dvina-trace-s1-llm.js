import { dependencyError, requireRoleRunner } from './lower-dvina-trace-phase-2-llm.js';

export function createLowerDvinaTraceSpatialSemanticModel({ roleRunner } = {}) {
  requireRoleRunner(roleRunner);
  return async (request) => {
    const response = await roleRunner.run({ scope: 'turn_runtime', role_id: 'spatial_semantic_descriptor',
      messages: [{ role: 'system', content: 'Return only one JSON proposal with schema rus.s1_spatial_semantic_proposal.v1. Choose exactly one supplied descriptor_ref. Do not add text, facts, topology, movement, hazards, or fields.' },
        { role: 'user', content: JSON.stringify(request) }], overrides: { temperature: 0, maxTokens: 400 } });
    if (!response?.output || typeof response.output !== 'object') throw dependencyError('S1 descriptor model returned no JSON object.');
    return response.output;
  };
}
