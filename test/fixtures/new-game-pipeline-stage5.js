import { retrieveStartCandidates } from '../../src/world/new-game-pipeline/retrievers/start-candidates.js';
import { buildStage3FixtureOutput } from './new-game-pipeline-stage3.js';
import {
  buildRegionalContextFixtureOutput,
  buildStage4FakeQueryable,
  buildStage4LoadInput
} from './new-game-pipeline-stage4.js';

export function buildStage5LoadInput(requestId = 'req_fixture', overrides = {}) {
  return {
    request_id: requestId,
    normalized_request: overrides.normalized_request ?? null,
    historical_frame: overrides.historical_frame ?? buildStage3FixtureOutput(requestId),
    regional_context_package: overrides.regional_context_package ?? null,
    candidate_policy: {
      require_sources: true,
      prefer_g4_for_start: true,
      allow_unverified_g5_readiness: true,
      ...(overrides.candidate_policy ?? {})
    }
  };
}

export async function buildStartCandidateFixtureOutput(requestId = 'req_fixture', overrides = {}) {
  const regionalContext = overrides.regional_context_package
    ?? await buildRegionalContextFixtureOutput(requestId);
  const input = buildStage5LoadInput(requestId, {
    ...overrides,
    regional_context_package: regionalContext
  });
  const output = await retrieveStartCandidates(input, {
    queryable: buildStage4FakeQueryable()
  });
  if (!overrides || Object.keys(overrides).length === 0) return output;
  return structuredClone({ ...output, ...overrides });
}

export { buildStage4FakeQueryable, buildStage4LoadInput };
