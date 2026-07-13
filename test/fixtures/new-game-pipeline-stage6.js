import { retrieveCandidatePlaceTemplates } from '../../src/world/new-game-pipeline/retrievers/place-templates.js';
import { buildNormalizedRequest, buildStage3FixtureOutput } from './new-game-pipeline-stage3.js';
import { buildRegionalContextFixtureOutput, buildStage4FakeQueryable } from './new-game-pipeline-stage4.js';
import { buildStage5LoadInput, buildStartCandidateFixtureOutput } from './new-game-pipeline-stage5.js';

export function buildStage6LoadInput(requestId = 'req_fixture', overrides = {}) {
  return {
    request_id: requestId,
    normalized_request: overrides.normalized_request ?? buildNormalizedRequest(requestId),
    historical_frame: overrides.historical_frame ?? buildStage3FixtureOutput(requestId),
    regional_context_package: overrides.regional_context_package ?? null,
    start_candidate_set: overrides.start_candidate_set ?? null,
    template_policy: {
      require_sources: true,
      ...(overrides.template_policy ?? {})
    }
  };
}

export async function buildCandidatePlaceTemplateFixtureOutput(requestId = 'req_fixture', overrides = {}) {
  const regionalContext = overrides.regional_context_package
    ?? await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = overrides.start_candidate_set
    ?? await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const input = buildStage6LoadInput(requestId, {
    ...overrides,
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates
  });
  const output = await retrieveCandidatePlaceTemplates(input, {
    queryable: buildStage4FakeQueryable()
  });
  if (!overrides || Object.keys(overrides).length === 0) return output;
  return structuredClone({ ...output, ...overrides });
}

export { buildStage4FakeQueryable, buildStage5LoadInput, buildStartCandidateFixtureOutput };
