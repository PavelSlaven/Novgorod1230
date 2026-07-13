import { retrieveNpcCandidates } from '../../src/world/new-game-pipeline/retrievers/npc-candidates.js';
import { buildNormalizedRequest, buildStage3FixtureOutput } from './new-game-pipeline-stage3.js';
import { buildRegionalContextFixtureOutput, buildStage4FakeQueryable } from './new-game-pipeline-stage4.js';
import { buildStartCandidateFixtureOutput } from './new-game-pipeline-stage5.js';
import { buildCandidatePlaceTemplateFixtureOutput } from './new-game-pipeline-stage6.js';

export function buildStage7LoadInput(requestId = 'req_fixture', overrides = {}) {
  return {
    request_id: requestId,
    normalized_request: overrides.normalized_request ?? buildNormalizedRequest(requestId),
    historical_frame: overrides.historical_frame ?? buildStage3FixtureOutput(requestId),
    regional_context_package: overrides.regional_context_package ?? null,
    start_candidate_set: overrides.start_candidate_set ?? null,
    candidate_place_template_set: overrides.candidate_place_template_set ?? null,
    npc_candidate_policy: {
      require_sources: true,
      ...(overrides.npc_candidate_policy ?? {})
    }
  };
}

export async function buildNpcCandidateFixtureOutput(requestId = 'req_fixture', overrides = {}) {
  const regionalContext = overrides.regional_context_package
    ?? await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = overrides.start_candidate_set
    ?? await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const placeTemplates = overrides.candidate_place_template_set
    ?? await buildCandidatePlaceTemplateFixtureOutput(requestId, {
      regional_context_package: regionalContext,
      start_candidate_set: startCandidates
    });
  const input = buildStage7LoadInput(requestId, {
    ...overrides,
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    candidate_place_template_set: placeTemplates
  });
  const output = await retrieveNpcCandidates(input, {
    queryable: buildStage4FakeQueryable()
  });
  if (!overrides || Object.keys(overrides).length === 0) return output;
  return structuredClone({ ...output, ...overrides });
}

export { buildStage4FakeQueryable, buildCandidatePlaceTemplateFixtureOutput, buildStartCandidateFixtureOutput };
