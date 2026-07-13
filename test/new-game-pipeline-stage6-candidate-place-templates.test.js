import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retrieveCandidatePlaceTemplates,
  runNewGamePipeline,
  runStage6CandidatePlaceTemplates,
  validateCandidatePlaceTemplateSet
} from '../src/world/new-game-pipeline/index.js';
import { createNewGamePipelineContext } from '../src/world/new-game-pipeline/context.js';
import { buildMinimalCandidateSet, buildNormalizedRequest, buildStage3FixtureOutput } from './fixtures/new-game-pipeline-stage3.js';
import { buildRegionalContextFixtureOutput, buildStage4FakeQueryable } from './fixtures/new-game-pipeline-stage4.js';
import {
  buildCandidatePlaceTemplateFixtureOutput,
  buildStage6LoadInput
} from './fixtures/new-game-pipeline-stage6.js';
import { buildStartCandidateFixtureOutput } from './fixtures/new-game-pipeline-stage5.js';

test('valid candidate_place_template_set from world_base stub passes gate', async () => {
  const requestId = 'req_valid_stage6';
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const input = buildStage6LoadInput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    historical_frame: buildStage3FixtureOutput(requestId)
  });
  const output = await retrieveCandidatePlaceTemplates(input, { queryable: buildStage4FakeQueryable() });
  const validation = validateCandidatePlaceTemplateSet(output, input);
  assert.equal(validation.pass, true);
  assert.equal(output.selection_status, 'ready');
  assert.equal(output.audit.pass, true);
  assert.ok(output.candidate_template_links.length >= 1);
  assert.ok(output.candidate_template_links[0].candidate_place_template_link_id);
});

test('link preserves candidate place_template_id when candidate has direct id', async () => {
  const output = await buildCandidatePlaceTemplateFixtureOutput('req_direct_template');
  const link = output.candidate_template_links.find((item) => item.candidate_id === 'start_candidate_g4');
  assert.ok(link);
  assert.equal(link.place_template_id, 'pt_market');
  assert.match(link.candidate_place_template_link_id, /^candidate_place_template_link:start_candidate_g4:pt_market$/u);
});

test('selection_status empty when no compatible templates', async () => {
  const output = await buildCandidatePlaceTemplateFixtureOutput('req_empty_templates');
  output.selection_status = 'empty';
  output.candidate_template_links = [];
  output.audit.pass = false;
  const validation = validateCandidatePlaceTemplateSet(output, buildStage6LoadInput('req_empty_templates'));
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NO_ALLOWED_PLACE_TEMPLATES_FOR_CANDIDATES'));
});

test('empty candidate_template_links with ready status fails gate', async () => {
  const output = await buildCandidatePlaceTemplateFixtureOutput('req_ready_no_links');
  output.selection_status = 'ready';
  output.candidate_template_links = [];
  const input = buildStage6LoadInput('req_ready_no_links');
  const validation = validateCandidatePlaceTemplateSet(output, input);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'CANDIDATE_PLACE_TEMPLATE_READY_WITHOUT_LINKS'));
});

test('forbidden downstream field in link fails gate', async () => {
  const output = await buildCandidatePlaceTemplateFixtureOutput('req_forbidden_link');
  output.candidate_template_links[0].visible_scene = { prose: 'too early' };
  const input = buildStage6LoadInput('req_forbidden_link');
  const validation = validateCandidatePlaceTemplateSet(output, input);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'CANDIDATE_PLACE_TEMPLATE_DOWNSTREAM_ENTITY_CREATED'));
});

test('unknown candidate_id in link fails gate', async () => {
  const output = await buildCandidatePlaceTemplateFixtureOutput('req_unknown_candidate');
  output.candidate_template_links[0].candidate_id = 'missing_candidate';
  const input = buildStage6LoadInput('req_unknown_candidate');
  const validation = validateCandidatePlaceTemplateSet(output, input);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'CANDIDATE_PLACE_TEMPLATE_UNKNOWN_CANDIDATE'));
});

test('duplicate candidate_place_template_link_id fails gate', async () => {
  const output = await buildCandidatePlaceTemplateFixtureOutput('req_dup_link');
  const duplicate = structuredClone(output.candidate_template_links[0]);
  output.candidate_template_links.push(duplicate);
  const input = buildStage6LoadInput('req_dup_link');
  const validation = validateCandidatePlaceTemplateSet(output, input);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'CANDIDATE_PLACE_TEMPLATE_LINK_ID_DUPLICATE'));
});

test('missing source_trace on link fails gate', async () => {
  const output = await buildCandidatePlaceTemplateFixtureOutput('req_missing_trace');
  output.candidate_template_links[0].source_trace = [];
  const input = buildStage6LoadInput('req_missing_trace');
  const validation = validateCandidatePlaceTemplateSet(output, input);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'CANDIDATE_PLACE_TEMPLATE_SOURCE_TRACE_MISSING'));
});

test('audit.pass=false fails gate', async () => {
  const output = await buildCandidatePlaceTemplateFixtureOutput('req_audit_fail');
  output.audit = { pass: false, concerns: [{ code: 'SELF_REPORT', message: 'weak set' }], evidence: ['fixture'] };
  const input = buildStage6LoadInput('req_audit_fail');
  const validation = validateCandidatePlaceTemplateSet(output, input);
  assert.equal(validation.pass, false);
  assert.ok(
    validation.concerns.some((item) => item.code === 'CANDIDATE_PLACE_TEMPLATE_AUDIT_FAILED' || item.code === 'SELF_REPORT')
  );
});

test('provided stageOutputs[6] in production without allowProvidedStageOutputs throws', async () => {
  const requestId = 'req_prod_stage6';
  const placeTemplates = await buildCandidatePlaceTemplateFixtureOutput(requestId);
  await assert.rejects(
    runNewGamePipeline({
      enableNewGamePipeline: true,
      requestId,
      env: { NODE_ENV: 'production' },
      historicalFrameCandidateSet: buildMinimalCandidateSet(requestId),
      stageOutputs: {
        6: placeTemplates
      },
      queryable: buildStage4FakeQueryable(),
      llmStageExecutor: async ({ stage, context }) => {
        if (stage.id === 2) return buildNormalizedRequest(requestId);
        if (stage.id === 3) return buildStage3FixtureOutput(requestId);
        return {};
      },
      g5Materialize: async () => ({}),
      g5Audit: async () => ({}),
      stage24Builder: async () => ({})
    }),
    /Provided stage 6 output is disabled in production/u
  );
});

test('missing queryable throws CANDIDATE_PLACE_TEMPLATE_QUERYABLE_MISSING before commit', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_no_queryable_stage6' });
  const regionalContext = await buildRegionalContextFixtureOutput('req_no_queryable_stage6');
  const startCandidates = await buildStartCandidateFixtureOutput('req_no_queryable_stage6', {
    regional_context_package: regionalContext
  });
  context.setStageOutput(3, buildStage3FixtureOutput('req_no_queryable_stage6'));
  context.setStageOutput(4, regionalContext);
  context.setStageOutput(5, startCandidates);
  await assert.rejects(
    runStage6CandidatePlaceTemplates(context, buildStage6LoadInput('req_no_queryable_stage6', {
      regional_context_package: regionalContext,
      start_candidate_set: startCandidates,
      historical_frame: buildStage3FixtureOutput('req_no_queryable_stage6')
    }), {}),
    /CANDIDATE_PLACE_TEMPLATE_QUERYABLE_MISSING/u
  );
  assert.equal(context.getStageOutput(6), null);
});

test('runStage6CandidatePlaceTemplates commits only when validation passes', async () => {
  const requestId = 'req_runner_ok_stage6';
  const context = createNewGamePipelineContext({ requestId });
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const output = await runStage6CandidatePlaceTemplates(context, buildStage6LoadInput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    historical_frame: buildStage3FixtureOutput(requestId)
  }), {
    queryable: buildStage4FakeQueryable()
  });
  assert.equal(output.schema, 'candidate_place_template_set');
  assert.equal(context.getGateResult(6).pass, true);
  assert.equal(context.getGateResult(6).gate_kind, 'candidate_place_template_contract_validation');
});

test('empty region templates block stage 6 before commit', async () => {
  const requestId = 'req_empty_templates_stage6';
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const context = createNewGamePipelineContext({ requestId });
  await assert.rejects(
    runStage6CandidatePlaceTemplates(context, buildStage6LoadInput(requestId, {
      regional_context_package: regionalContext,
      start_candidate_set: startCandidates,
      historical_frame: buildStage3FixtureOutput(requestId)
    }), {
      queryable: buildStage4FakeQueryable({ emptyPlaceTemplates: true })
    }),
    /stage gate failed|NO_ALLOWED_PLACE_TEMPLATES|CANDIDATE_PLACE_TEMPLATE/i
  );
  assert.equal(context.getGateResult(6)?.pass, false);
});
