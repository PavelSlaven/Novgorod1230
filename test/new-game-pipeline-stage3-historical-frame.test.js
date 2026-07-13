import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStage3HistoricalFrameInput,
  getNewGameLlmStageDefinition,
  runLlmStageGate,
  runNewGamePipeline,
  runStage3HistoricalFrame,
  validateStage3HistoricalFrame
} from '../src/world/new-game-pipeline/index.js';
import { createNewGamePipelineContext } from '../src/world/new-game-pipeline/context.js';
import {
  buildMinimalCandidateSet,
  buildNormalizedRequest,
  buildStage3FixtureOutput,
  buildStage3SelectorInput
} from './fixtures/new-game-pipeline-stage3.js';

test('valid selection from candidate set passes schema and code gate', () => {
  const requestId = 'req_valid';
  const candidates = buildMinimalCandidateSet(requestId);
  const input = buildStage3SelectorInput(requestId, candidates);
  const output = buildStage3FixtureOutput(requestId);
  const concerns = validateStage3HistoricalFrame(output, input);
  assert.equal(concerns.length, 0);
  const gate = runLlmStageGate(getNewGameLlmStageDefinition(3), output, input);
  assert.equal(gate.pass, true);
});

test('region_id and historical_period_id outside candidate set fail', () => {
  const requestId = 'req_bad_ids';
  const input = buildStage3SelectorInput(requestId, buildMinimalCandidateSet(requestId));
  const output = buildStage3FixtureOutput(requestId, {
    region: { region_id: 'region_unknown' },
    candidate_ids_used: {
      region_id: 'region_unknown',
      historical_period_id: 'period_unknown',
      season_rule_id: 'season_winter_novgorod',
      time_of_day_policy_id: 'default_deep_night_dark'
    }
  });
  const concerns = validateStage3HistoricalFrame(output, input);
  assert.ok(concerns.some((item) => item.code === 'HISTORICAL_FRAME_REGION_NOT_IN_CANDIDATES'));
  assert.ok(concerns.some((item) => item.code === 'HISTORICAL_FRAME_PERIOD_NOT_IN_CANDIDATES'));
});

test('year outside selected period fails', () => {
  const requestId = 'req_bad_year';
  const input = buildStage3SelectorInput(requestId, buildMinimalCandidateSet(requestId));
  const output = buildStage3FixtureOutput(requestId, { year: { value: 1300, selection_mode: 'explicit' } });
  const concerns = validateStage3HistoricalFrame(output, input);
  assert.ok(concerns.some((item) => item.code === 'HISTORICAL_FRAME_YEAR_OUT_OF_RANGE'));
});

test('season mismatch with season rule fails', () => {
  const requestId = 'req_bad_season';
  const input = buildStage3SelectorInput(requestId, buildMinimalCandidateSet(requestId));
  const output = buildStage3FixtureOutput(requestId, { calendar: { season: 'summer', party_day: 1 } });
  const concerns = validateStage3HistoricalFrame(output, input);
  assert.ok(concerns.some((item) => item.code === 'HISTORICAL_FRAME_SEASON_RULE_MISMATCH'));
});

test('clock/time_of_day/light_profile mismatch with time policy fails', () => {
  const requestId = 'req_bad_clock';
  const input = buildStage3SelectorInput(requestId, buildMinimalCandidateSet(requestId));
  const output = buildStage3FixtureOutput(requestId, {
    clock: { day: 1, hour: 12, minute: 0, time_of_day: 'day', light_profile: 'daylight' },
    candidate_ids_used: {
      region_id: 'region_novgorod_land',
      historical_period_id: 'region_period:region_novgorod_land:1230:1250',
      season_rule_id: 'season_winter_novgorod',
      time_of_day_policy_id: 'default_deep_night_dark'
    }
  });
  const concerns = validateStage3HistoricalFrame(output, input);
  assert.ok(concerns.some((item) => item.code === 'HISTORICAL_FRAME_CLOCK_INVALID' || item.code === 'HISTORICAL_FRAME_LIGHT_PROFILE_CONFLICT'));
});

test('forbidden downstream keys fail code gate', () => {
  const requestId = 'req_forbidden';
  const input = buildStage3SelectorInput(requestId, buildMinimalCandidateSet(requestId));
  const output = buildStage3FixtureOutput(requestId, { place_id: 'place_market' });
  const concerns = validateStage3HistoricalFrame(output, input);
  assert.ok(concerns.some((item) => item.code === 'HISTORICAL_FRAME_CREATED_LOCATION'));
});

test('empty sources with require_sources=true fails', () => {
  const requestId = 'req_no_sources';
  const input = buildStage3SelectorInput(requestId, buildMinimalCandidateSet(requestId), { require_sources: true });
  const output = buildStage3FixtureOutput(requestId, { sources: [] });
  const concerns = validateStage3HistoricalFrame(output, input);
  assert.ok(concerns.some((item) => item.code === 'HISTORICAL_FRAME_SOURCE_MISSING'));
});

test('candidate record status policy and selection_status enum are enforced', () => {
  const requestId = 'req_record_policy';
  const rejectedCandidates = buildMinimalCandidateSet(requestId, { regionStatus: 'conflict' });
  const rejectedInput = buildStage3SelectorInput(requestId, rejectedCandidates);
  const rejectedOutput = buildStage3FixtureOutput(requestId);
  const rejectedConcerns = validateStage3HistoricalFrame(rejectedOutput, rejectedInput);
  assert.ok(rejectedConcerns.some((item) => item.code === 'HISTORICAL_FRAME_REJECTED_SOURCE_USED'));

  const draftCandidates = buildMinimalCandidateSet(requestId, { regionStatus: 'draft' });
  const draftInput = buildStage3SelectorInput(requestId, draftCandidates);
  const draftOutput = buildStage3FixtureOutput(requestId);
  const draftConcerns = validateStage3HistoricalFrame(draftOutput, draftInput);
  assert.ok(draftConcerns.some((item) => item.code === 'HISTORICAL_FRAME_DRAFT_RECORD_NOT_ALLOWED'));

  const validInput = buildStage3SelectorInput(requestId, buildMinimalCandidateSet(requestId));
  const invalidSelectionStatusOutput = buildStage3FixtureOutput(requestId, { selection_status: 'conflict' });
  const selectionConcerns = validateStage3HistoricalFrame(invalidSelectionStatusOutput, validInput);
  assert.ok(selectionConcerns.some((item) => item.code === 'HISTORICAL_FRAME_SELECTION_STATUS_INVALID'));
});

test('audit.pass=true does not bypass forbidden field gate', () => {
  const requestId = 'req_audit_bypass';
  const input = buildStage3SelectorInput(requestId, buildMinimalCandidateSet(requestId));
  const output = buildStage3FixtureOutput(requestId, {
    npc_id: 'npc_001',
    audit: { pass: true, concerns: [], evidence: ['self-report only'] }
  });
  const gate = runLlmStageGate(getNewGameLlmStageDefinition(3), output, input);
  assert.equal(gate.pass, false);
  assert.ok(gate.concerns.some((item) => item.code === 'HISTORICAL_FRAME_CREATED_NPC'));
});

test('provided stageOutputs[3] in production without allowProvidedStageOutputs throws', async () => {
  const requestId = 'req_prod_stage3';
  await assert.rejects(
    runNewGamePipeline({
      enableNewGamePipeline: true,
      requestId,
      env: { NODE_ENV: 'production' },
      historicalFrameCandidateSet: buildMinimalCandidateSet(requestId),
      stageOutputs: {
        3: buildStage3FixtureOutput(requestId)
      },
      queryable: { async query() { return { rows: [] }; } },
      llmStageExecutor: async ({ stage }) => (
        stage.id === 2 ? buildNormalizedRequest(requestId) : {}
      ),
      g5Materialize: async () => ({}),
      g5Audit: async () => ({}),
      stage24Builder: async () => ({})
    }),
    /Provided stage 3 output is disabled in production/u
  );
});

test('missing candidate set and queryable throws HISTORICAL_FRAME_CANDIDATE_SET_MISSING before LLM', async () => {
  const context = createNewGamePipelineContext({ requestId: 'req_missing_candidates' });
  context.setStageOutput(2, buildNormalizedRequest('req_missing_candidates'));
  await assert.rejects(
    runStage3HistoricalFrame(context, {
      executor: async () => buildStage3FixtureOutput('req_missing_candidates')
    }),
    /HISTORICAL_FRAME_CANDIDATE_SET_MISSING/u
  );
  await assert.rejects(
    buildStage3HistoricalFrameInput(context, {}),
    /HISTORICAL_FRAME_CANDIDATE_SET_MISSING/u
  );
});
