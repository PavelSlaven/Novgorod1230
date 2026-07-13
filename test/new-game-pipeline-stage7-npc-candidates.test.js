import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retrieveNpcCandidates,
  runNewGamePipeline,
  runStage7NpcCandidates,
  validateNpcCandidateSet
} from '../src/world/new-game-pipeline/index.js';
import { createNewGamePipelineContext } from '../src/world/new-game-pipeline/context.js';
import { buildMinimalCandidateSet, buildNormalizedRequest, buildStage3FixtureOutput } from './fixtures/new-game-pipeline-stage3.js';
import { buildRegionalContextFixtureOutput, buildStage4FakeQueryable } from './fixtures/new-game-pipeline-stage4.js';
import { buildStartCandidateFixtureOutput } from './fixtures/new-game-pipeline-stage5.js';
import { buildCandidatePlaceTemplateFixtureOutput } from './fixtures/new-game-pipeline-stage6.js';
import {
  buildNpcCandidateFixtureOutput,
  buildStage7LoadInput
} from './fixtures/new-game-pipeline-stage7.js';

test('valid npc_candidate_set from world_base stub passes gate', async () => {
  const requestId = 'req_valid_stage7';
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const placeTemplates = await buildCandidatePlaceTemplateFixtureOutput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates
  });
  const input = buildStage7LoadInput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    candidate_place_template_set: placeTemplates
  });
  const output = await retrieveNpcCandidates(input, { queryable: buildStage4FakeQueryable() });
  const validation = validateNpcCandidateSet(output, { policy: input.npc_candidate_policy });
  assert.equal(validation.pass, true);
  assert.equal(output.selection_status, 'ready');
  assert.equal(output.audit.pass, true);
  assert.ok(output.npc_candidates.length >= 1);
  assert.ok(output.npc_candidates[0].social_role.social_role_id);
});

test('npc candidate preserves nested social_role and archetype refs', async () => {
  const output = await buildNpcCandidateFixtureOutput('req_nested_refs');
  const candidate = output.npc_candidates[0];
  assert.equal(candidate.social_role.social_role_id, 'role_merchant');
  assert.equal(candidate.npc_archetype.npc_archetype_id, 'arch_merchant');
  assert.equal(candidate.occupation.occupation_id, 'occ_merchant');
  assert.ok(candidate.place_compatibility.allowed_candidate_place_template_link_ids.length >= 1);
});

test('selection_status empty when no allowed candidates survive gates', async () => {
  const output = await buildNpcCandidateFixtureOutput('req_empty_npc');
  output.selection_status = 'empty';
  output.npc_candidates = [];
  output.audit.pass = false;
  const validation = validateNpcCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NO_ALLOWED_NPC_CANDIDATES' || item.code === 'NPC_CANDIDATE_SCHEMA_MISMATCH'));
});

test('ready status with empty npc_candidates fails gate', async () => {
  const output = await buildNpcCandidateFixtureOutput('req_ready_no_candidates');
  output.selection_status = 'ready';
  output.npc_candidates = [];
  const input = buildStage7LoadInput('req_ready_no_candidates');
  const validation = validateNpcCandidateSet(output, { policy: input.npc_candidate_policy });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NO_ALLOWED_NPC_CANDIDATES'));
});

test('forbidden materialized NPC field in output fails gate', async () => {
  const output = await buildNpcCandidateFixtureOutput('req_forbidden_npc');
  output.npc_candidates[0].name = 'Иван';
  const validation = validateNpcCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NPC_CANDIDATE_CREATED_NAME'));
});

test('missing place template compatibility fails gate', async () => {
  const output = await buildNpcCandidateFixtureOutput('req_no_place_match');
  output.npc_candidates[0].place_compatibility.allowed_candidate_place_template_link_ids = [];
  const validation = validateNpcCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NPC_CANDIDATE_PLACE_TEMPLATE_MISMATCH'));
});

test('season mismatch fails gate', async () => {
  const output = await buildNpcCandidateFixtureOutput('req_season_fail');
  output.npc_candidates[0].time_and_season_compatibility.season_match = false;
  const validation = validateNpcCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NPC_CANDIDATE_SEASON_CONFLICT'));
});

test('duplicate npc_candidate_id fails gate', async () => {
  const output = await buildNpcCandidateFixtureOutput('req_dup_npc');
  const duplicate = structuredClone(output.npc_candidates[0]);
  output.npc_candidates.push(duplicate);
  const validation = validateNpcCandidateSet(output);
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NPC_CANDIDATE_SCHEMA_MISMATCH'));
});

test('missing source_trace on candidate fails when require_sources=true', async () => {
  const output = await buildNpcCandidateFixtureOutput('req_missing_trace');
  output.npc_candidates[0].source_trace = [];
  const validation = validateNpcCandidateSet(output, { policy: { require_sources: true } });
  assert.equal(validation.pass, false);
  assert.ok(validation.concerns.some((item) => item.code === 'NPC_CANDIDATE_SOURCE_MISSING'));
});

test('audit.pass=false fails gate', async () => {
  const output = await buildNpcCandidateFixtureOutput('req_audit_fail');
  output.audit = { pass: false, concerns: [{ code: 'SELF_REPORT', message: 'weak set' }], evidence: ['fixture'] };
  const validation = validateNpcCandidateSet(output);
  assert.equal(validation.pass, false);
});

test('provided stageOutputs[7] in production without allowProvidedStageOutputs throws', async () => {
  const requestId = 'req_prod_stage7';
  const npcCandidates = await buildNpcCandidateFixtureOutput(requestId);
  await assert.rejects(
    runNewGamePipeline({
      enableNewGamePipeline: true,
      requestId,
      env: { NODE_ENV: 'production' },
      historicalFrameCandidateSet: buildMinimalCandidateSet(requestId),
      stageOutputs: {
        7: npcCandidates
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
    /Provided stage 7 output is disabled in production/u
  );
});

test('missing queryable throws NPC_CANDIDATE_QUERYABLE_MISSING before commit', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_no_queryable_stage7' });
  const regionalContext = await buildRegionalContextFixtureOutput('req_no_queryable_stage7');
  const startCandidates = await buildStartCandidateFixtureOutput('req_no_queryable_stage7', {
    regional_context_package: regionalContext
  });
  const placeTemplates = await buildCandidatePlaceTemplateFixtureOutput('req_no_queryable_stage7', {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates
  });
  context.setStageOutput(3, buildStage3FixtureOutput('req_no_queryable_stage7'));
  context.setStageOutput(4, regionalContext);
  context.setStageOutput(5, startCandidates);
  context.setStageOutput(6, placeTemplates);
  await assert.rejects(
    runStage7NpcCandidates(context, buildStage7LoadInput('req_no_queryable_stage7', {
      regional_context_package: regionalContext,
      start_candidate_set: startCandidates,
      candidate_place_template_set: placeTemplates
    }), {}),
    /NPC_CANDIDATE_QUERYABLE_MISSING/u
  );
  assert.equal(context.getStageOutput(7), null);
});

test('runStage7NpcCandidates commits only when validation passes', async () => {
  const requestId = 'req_runner_ok_stage7';
  const context = createNewGamePipelineContext({ requestId });
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const placeTemplates = await buildCandidatePlaceTemplateFixtureOutput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates
  });
  const output = await runStage7NpcCandidates(context, buildStage7LoadInput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    candidate_place_template_set: placeTemplates,
    historical_frame: buildStage3FixtureOutput(requestId)
  }), {
    queryable: buildStage4FakeQueryable()
  });
  assert.equal(output.schema, 'npc_candidate_set');
  assert.equal(context.getGateResult(7).pass, true);
  assert.equal(context.getGateResult(7).gate_kind, 'npc_candidate_set_gate');
});

test('empty npc archetypes block stage 7 before commit', async () => {
  const requestId = 'req_empty_archetypes_stage7';
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const placeTemplates = await buildCandidatePlaceTemplateFixtureOutput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates
  });
  const context = createNewGamePipelineContext({ requestId });
  await assert.rejects(
    runStage7NpcCandidates(context, buildStage7LoadInput(requestId, {
      regional_context_package: regionalContext,
      start_candidate_set: startCandidates,
      candidate_place_template_set: placeTemplates,
      historical_frame: buildStage3FixtureOutput(requestId)
    }), {
      queryable: buildStage4FakeQueryable({ emptyNpcArchetypes: true })
    }),
    /stage gate failed|NPC_CANDIDATE_ARCHETYPE_NOT_FOUND|NO_ALLOWED_NPC_CANDIDATES/i
  );
  assert.equal(context.getGateResult(7)?.pass, false);
});
