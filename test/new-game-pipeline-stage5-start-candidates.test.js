import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retrieveStartCandidates,
  runNewGamePipeline,
  runStage5StartCandidates,
  validateStartCandidateSet
} from '../src/world/new-game-pipeline/index.js';
import { createNewGamePipelineContext } from '../src/world/new-game-pipeline/context.js';
import { buildMinimalCandidateSet, buildNormalizedRequest, buildStage3FixtureOutput } from './fixtures/new-game-pipeline-stage3.js';
import { buildRegionalContextFixtureOutput } from './fixtures/new-game-pipeline-stage4.js';
import {
  buildStage4FakeQueryable,
  buildStage5LoadInput,
  buildStartCandidateFixtureOutput
} from './fixtures/new-game-pipeline-stage5.js';

test('valid start_candidate_set from world_base stub passes gate', async () => {
  const requestId = 'req_valid_stage5';
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const input = buildStage5LoadInput(requestId, { regional_context_package: regionalContext });
  const output = await retrieveStartCandidates(input, { queryable: buildStage4FakeQueryable() });
  const validation = validateStartCandidateSet(output, { policy: input.candidate_policy });
  assert.equal(validation.pass, true);
  assert.equal(output.selection_status, 'ready');
  assert.equal(output.audit.pass, true);
  assert.ok(output.candidate_summary.startable_candidate_count >= 1);
});

test('G4 candidate has full parent chain and score', async () => {
  const output = await buildStartCandidateFixtureOutput('req_chain');
  const g4 = output.candidates.find((candidate) => candidate.scale_level === 'G4');
  assert.ok(g4);
  assert.equal(g4.candidate_id, 'start_candidate_g4');
  assert.ok(g4.node_chain.g1_node_id);
  assert.ok(g4.node_chain.g4_node_id);
  assert.ok(Number.isFinite(g4.score.value));
  assert.equal(g4.compatibility.region_match, true);
});

test('selection_status blocked when no startable candidates', async () => {
  const output = await buildStartCandidateFixtureOutput('req_blocked');
  output.selection_status = 'blocked';
  output.audit.pass = false;
  const validation = validateStartCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NO_ALLOWED_START_CANDIDATES'));
});

test('empty candidates array fails gate', async () => {
  const output = await buildStartCandidateFixtureOutput('req_empty_candidates');
  output.selection_status = 'ready';
  output.candidates = [];
  output.downstream_constraints.must_choose_from_candidate_ids = [];
  const validation = validateStartCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NEW_GAME_GATE_EMPTY_REQUIRED_SET'));
});

test('forbidden downstream field in output fails', async () => {
  const output = await buildStartCandidateFixtureOutput('req_forbidden');
  output.visible_scene = { prose: 'too early' };
  const validation = validateStartCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'START_CANDIDATE_CREATED_SCENE'));
});

test('broken parent chain fails gate', async () => {
  const output = await buildStartCandidateFixtureOutput('req_broken_chain');
  output.candidates[0].node_chain.g1_node_id = null;
  const validation = validateStartCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'START_CANDIDATE_BROKEN_PARENT_CHAIN'));
});

test('missing source_trace fails when require_sources=true', async () => {
  const output = await buildStartCandidateFixtureOutput('req_missing_sources');
  output.candidates[0].source_trace = [];
  const validation = validateStartCandidateSet(output, { policy: { require_sources: true } });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'START_CANDIDATE_SOURCE_MISSING'));
});

test('G4 without g5_ready fails when unverified readiness disabled', async () => {
  const output = await buildStartCandidateFixtureOutput('req_g5_not_ready');
  for (const candidate of output.candidates) {
    if (candidate.scale_level === 'G4') candidate.compatibility.g5_ready = false;
  }
  const validation = validateStartCandidateSet(output, {
    policy: { prefer_g4_for_start: true, allow_unverified_g5_readiness: false }
  });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'START_CANDIDATE_G5_NOT_READY'));
});

test('audit.pass=false fails gate', async () => {
  const output = await buildStartCandidateFixtureOutput('req_audit_fail');
  output.audit = { pass: false, concerns: [{ code: 'SELF_REPORT', message: 'weak set' }], evidence: ['fixture'] };
  const validation = validateStartCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'START_CANDIDATE_AUDIT_FAILED'));
});

test('provided stageOutputs[5] in production without allowProvidedStageOutputs throws', async () => {
  const requestId = 'req_prod_stage5';
  const startCandidates = await buildStartCandidateFixtureOutput(requestId);
  await assert.rejects(
    runNewGamePipeline({
      enableNewGamePipeline: true,
      requestId,
      env: { NODE_ENV: 'production' },
      historicalFrameCandidateSet: buildMinimalCandidateSet(requestId),
      stageOutputs: {
        5: startCandidates
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
    /Provided stage 5 output is disabled in production/u
  );
});

test('missing queryable throws START_CANDIDATE_QUERYABLE_MISSING before commit', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_no_queryable_stage5' });
  const regionalContext = await buildRegionalContextFixtureOutput('req_no_queryable_stage5');
  context.setStageOutput(3, buildStage3FixtureOutput('req_no_queryable_stage5'));
  context.setStageOutput(4, regionalContext);
  await assert.rejects(
    runStage5StartCandidates(context, buildStage5LoadInput('req_no_queryable_stage5', {
      regional_context_package: regionalContext
    }), {}),
    /START_CANDIDATE_QUERYABLE_MISSING/u
  );
  assert.equal(context.getStageOutput(5), null);
});

test('runStage5StartCandidates commits only when validation passes', async () => {
  const requestId = 'req_runner_ok_stage5';
  const context = createNewGamePipelineContext({ requestId });
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const output = await runStage5StartCandidates(context, buildStage5LoadInput(requestId, {
    regional_context_package: regionalContext
  }), {
    queryable: buildStage4FakeQueryable()
  });
  assert.equal(output.schema, 'start_candidate_set');
  assert.equal(context.getGateResult(5).pass, true);
  assert.equal(context.getGateResult(5).gate_kind, 'start_candidate_set_commit_gate');
});

test('empty graph blocks before stage 5 commit', async () => {
  const requestId = 'req_empty_graph_stage5';
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const context = createNewGamePipelineContext({ requestId });
  await assert.rejects(
    runStage5StartCandidates(context, buildStage5LoadInput(requestId, {
      regional_context_package: regionalContext
    }), {
      queryable: buildStage4FakeQueryable({ emptyGraph: true })
    }),
    /stage gate failed|NO_ALLOWED_START_CANDIDATES|route templates|canonical graph edges/i
  );
  assert.equal(context.getGateResult(5)?.pass, false);
});
