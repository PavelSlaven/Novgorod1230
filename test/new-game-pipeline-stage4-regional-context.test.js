import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retrieveRegionalContextPackage,
  runNewGamePipeline,
  runStage4RegionalContext,
  validateRegionalContextPackage
} from '../src/world/new-game-pipeline/index.js';
import { createNewGamePipelineContext } from '../src/world/new-game-pipeline/context.js';
import { buildNormalizedRequest } from './fixtures/new-game-pipeline-stage3.js';
import {
  buildMinimalCandidateSet,
  buildStage3FixtureOutput
} from './fixtures/new-game-pipeline-stage3.js';
import {
  buildRegionalContextFixtureOutput,
  buildStage4FakeQueryable,
  buildStage4LoadInput
} from './fixtures/new-game-pipeline-stage4.js';

test('valid package from full world_base stub passes gate', async () => {
  const requestId = 'req_valid_stage4';
  const input = buildStage4LoadInput(requestId);
  const output = await retrieveRegionalContextPackage(input, { queryable: buildStage4FakeQueryable() });
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  assert.equal(validation.pass, true);
  assert.equal(output.audit.pass, true);
});

test('region_identity.region_id mismatch with historical_frame fails', async () => {
  const requestId = 'req_region_mismatch';
  const input = buildStage4LoadInput(requestId);
  const output = await buildRegionalContextFixtureOutput(requestId);
  output.region_identity.region_id = 'region_other';
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'REGIONAL_CONTEXT_REGION_MISMATCH'));
});

test('source_trace conflict or rejected status fails', async () => {
  const requestId = 'req_conflict_trace';
  const input = buildStage4LoadInput(requestId);
  const output = await buildRegionalContextFixtureOutput(requestId);
  output.source_trace = output.source_trace.map((entry, index) => (
    index === 0 ? { ...entry, status: 'conflict' } : entry
  ));
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'REGIONAL_CONTEXT_CONFLICT_RECORD_USED'));
});

test('draft record without policy allowance fails', async () => {
  const requestId = 'req_draft_trace';
  const input = buildStage4LoadInput(requestId, { load_policy: { allow_draft: false } });
  const output = await buildRegionalContextFixtureOutput(requestId);
  output.source_trace = output.source_trace.map((entry, index) => (
    index === 0 ? { ...entry, status: 'draft' } : entry
  ));
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'REGIONAL_CONTEXT_DRAFT_RECORD_NOT_ALLOWED'));
});

test('require_sources=true with missing source_records fails', async () => {
  const requestId = 'req_missing_sources';
  const input = buildStage4LoadInput(requestId, { load_policy: { require_sources: true } });
  const output = await buildRegionalContextFixtureOutput(requestId);
  output.source_records = [];
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'REGIONAL_CONTEXT_SOURCE_NOT_FOUND'));
});

test('forbidden downstream field in output fails', async () => {
  const requestId = 'req_forbidden_field';
  const input = buildStage4LoadInput(requestId);
  const output = await buildRegionalContextFixtureOutput(requestId);
  output.g5_anchor_id = 'anchor_hidden';
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'REGIONAL_CONTEXT_CREATED_G5'));
});

test('missing critical group fails gate', async () => {
  const requestId = 'req_missing_group';
  const input = buildStage4LoadInput(requestId);
  const output = await buildRegionalContextFixtureOutput(requestId);
  output.landscape_context.allowed_landscapes = [];
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'REGIONAL_CONTEXT_MISSING_LANDSCAPE_RULES'));
});

test('audit.pass=false fails gate', async () => {
  const requestId = 'req_audit_fail';
  const input = buildStage4LoadInput(requestId);
  const output = await buildRegionalContextFixtureOutput(requestId);
  output.audit = { pass: false, concerns: [{ code: 'SELF_REPORT', message: 'weak context' }], evidence: ['fixture'] };
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'REGIONAL_CONTEXT_AUDIT_NOT_PASSED'));
});

test('audit.pass=true does not bypass forbidden field gate', async () => {
  const requestId = 'req_audit_bypass';
  const input = buildStage4LoadInput(requestId);
  const output = await buildRegionalContextFixtureOutput(requestId);
  output.npc_ids = ['npc_hidden'];
  output.audit = { pass: true, concerns: [], evidence: ['self-report only'] };
  const validation = validateRegionalContextPackage(output, {
    historicalFrame: input.historical_frame,
    loadPolicy: input.load_policy
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'REGIONAL_CONTEXT_CREATED_NPC'));
});

test('provided stageOutputs[4] in production without allowProvidedStageOutputs throws', async () => {
  const requestId = 'req_prod_stage4';
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  await assert.rejects(
    runNewGamePipeline({
      enableNewGamePipeline: true,
      requestId,
      env: { NODE_ENV: 'production' },
      historicalFrameCandidateSet: buildMinimalCandidateSet(requestId),
      stageOutputs: {
        4: regionalContext
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
    /Provided stage 4 output is disabled in production/u
  );
});

test('missing queryable throws REGIONAL_CONTEXT_QUERYABLE_MISSING before commit', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_no_queryable' });
  context.setStageOutput(3, buildStage3FixtureOutput('req_no_queryable'));
  await assert.rejects(
    runStage4RegionalContext(context, {
      historical_frame: buildStage3FixtureOutput('req_no_queryable')
    }, {}),
    /REGIONAL_CONTEXT_QUERYABLE_MISSING/u
  );
  assert.equal(context.getStageOutput(4), null);
});

test('runStage4RegionalContext commits only when validation passes', async () => {
  const requestId = 'req_runner_ok';
  const context = createNewGamePipelineContext({ requestId });
  const output = await runStage4RegionalContext(context, buildStage4LoadInput(requestId), {
    queryable: buildStage4FakeQueryable()
  });
  assert.equal(output.schema, 'regional_context_package');
  assert.equal(context.getGateResult(4).pass, true);
  assert.equal(context.getGateResult(4).gate_kind, 'regional_context_validation');
});
