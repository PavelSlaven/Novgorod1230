import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildStage2NormalizationInput,
  validateStage2NormalizedRequest
} from '@rus/new-game/stages/stage-2';
import {
  normalizeStage3CandidateSet,
  validateStage3HistoricalFrame
} from '@rus/new-game/stages/stage-3';
import { runStage4RegionalContextBlock } from '@rus/new-game/stages/stage-4';
import { runStage5StartCandidatesBlock } from '@rus/new-game/stages/stage-5';
import { runStage6CandidatePlaceTemplatesBlock } from '@rus/new-game/stages/stage-6';
import { runStage7NpcCandidatesBlock } from '@rus/new-game/stages/stage-7';
import { runStage8ItemProfileRetrieverBlock } from '@rus/new-game/stages/stage-8';

function context(outputs = {}) {
  const stageOutputs = new Map(Object.entries(outputs).map(([key, value]) => [Number(key), value]));
  return {
    requestId: 'req-1',
    startText: 'Хочу начать случайным ремесленником',
    playerName: null,
    uiFields: null,
    clientDefaults: null,
    getStageOutput: (id) => stageOutputs.get(id) ?? null,
    requireStageOutput: (id) => {
      if (!stageOutputs.has(id)) throw new Error(`missing ${id}`);
      return stageOutputs.get(id);
    },
    setStageOutput: (id, value) => stageOutputs.set(id, value),
    setGateResult: () => {},
    setStageResult: () => {},
    note: () => {}
  };
}

test('Stage 2 remains a contract shaper and rejects resolved world ids', () => {
  const ctx = context();
  const input = buildStage2NormalizationInput(ctx);
  assert.equal(input.schema, 'new_game_raw_request');
  const invalid = {
    version: 1,
    schema: 'new_game_normalized_request',
    request_id: 'req-1',
    language: 'ru',
    start_mode: 'new_party',
    player_intent_summary: 'случайный ремесленник',
    era_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'low' },
    year_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'low' },
    season_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'low' },
    time_of_day_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'low' },
    region_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'low', region_id: 'forbidden' },
    start_place_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'low' },
    character_request: { selection_mode: 'random', source: 'player_text', confidence: 'medium', notes: [] },
    tone_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'low' },
    difficulty_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'low' },
    hard_constraints: [], soft_preferences: [], forbidden_content: [], unknowns_to_resolve: [],
    requires_clarification: false, clarification_questions: [],
    adaptation_flags: { contains_modern_terms: false, contains_impossible_terms: false, requires_historical_adaptation: false },
    invalid_or_unsafe_literals: [], audit: { pass: true, concerns: [], evidence: ['normalized'] }
  };
  const concerns = validateStage2NormalizedRequest(invalid, input);
  assert.ok(concerns.some((item) => item.code === 'NORMALIZER_CREATED_OR_RESOLVED_WORLD_ID'));
});

test('Stage 3 only accepts candidate-bound historical frames', () => {
  const candidates = normalizeStage3CandidateSet({
    regions: [{ id: 'novgorod', status: 'approved', sources: ['s1'] }],
    historical_periods: [{ id: 'p1', region_id: 'novgorod', year_start: 1230, year_end: 1250, status: 'approved', sources: ['s1'] }],
    season_rules: [{ id: 'winter-rule', season: 'winter', region_id: 'novgorod', status: 'approved', sources: ['s1'] }],
    sources: ['s1']
  });
  const output = {
    version: 1, schema: 'historical_frame', request_id: 'req-1', selection_status: 'selected',
    era: {}, year: { value: 1230 }, calendar: { season: 'winter' },
    clock: { day: 1, hour: 22, minute: 0, time_of_day: 'night', light_profile: 'dark' },
    region: { region_id: 'novgorod' }, political_context: {}, social_context: {}, seasonal_context: {},
    downstream_constraints: { must_preserve: ['year','calendar.season','region.region_id','clock.hour','clock.minute','clock.time_of_day','clock.light_profile'], must_not_create_yet: [], must_resolve_later: [] },
    candidate_ids_used: { region_id: 'novgorod', historical_period_id: 'p1', season_rule_id: 'winter-rule', time_of_day_policy_id: 'default_night_dark' },
    sources: ['s1'], audit: { pass: true, concerns: [], evidence: ['candidate-bound'] }
  };
  assert.deepEqual(validateStage3HistoricalFrame(output, { request_id: 'req-1', available_candidates: candidates, selection_policy: {} }), []);
  output.region.region_id = 'invented';
  assert.ok(validateStage3HistoricalFrame(output, { request_id: 'req-1', available_candidates: candidates, selection_policy: {} }).some((item) => item.code === 'HISTORICAL_FRAME_REGION_NOT_IN_CANDIDATES'));
});

test('Stages 4-7 execute only through explicit retrieval and validation ports', async () => {
  const ctx = context({2:{},3:{},4:{},5:{},6:{}});
  const valid = { pass: true, concerns: [], evidence: [{ kind: 'mock' }] };
  assert.deepEqual(await runStage4RegionalContextBlock(ctx, { historical_frame: {} }, {
    retrieveRegionalContextPackage: async () => ({ schema: 'regional_context_package' }),
    validateRegionalContextPackage: () => valid
  }), { schema: 'regional_context_package' });
  assert.deepEqual(await runStage5StartCandidatesBlock(ctx, {}, {
    retrieveStartCandidates: async () => ({ candidates: ['x'] }),
    runStartCandidateSetGate: () => valid
  }), { candidates: ['x'] });
  assert.deepEqual(await runStage6CandidatePlaceTemplatesBlock(ctx, {}, {
    retrieveCandidatePlaceTemplates: async () => ({ candidate_template_links: ['x'] }),
    validateCandidatePlaceTemplateSet: () => valid
  }), { candidate_template_links: ['x'] });
  assert.deepEqual(await runStage7NpcCandidatesBlock(ctx, {}, {
    retrieveNpcCandidates: async () => ({ npc_candidates: ['x'] }),
    validateNpcCandidateSet: () => valid
  }), { npc_candidates: ['x'] });
});

test('Stage 8 blocks invalid input and never materializes concrete items', async () => {
  const services = {
    normalizeStage8ItemProfilePolicy: (value) => value ?? {},
    validateStage8ItemProfileRetrieverInput: () => ({ pass: false, concerns: [{ code: 'bad' }], evidence: [] }),
    validateItemProfileCandidateSet: () => ({ pass: false, concerns: [{ code: 'bad' }], evidence: [] }),
    retrieveItemProfileCandidates: async () => { throw new Error('must not run'); }
  };
  const result = await runStage8ItemProfileRetrieverBlock({}, services);
  assert.equal(result.status, 'requires_repair');
  assert.equal(result.repair_request.can_create_item, false);
  assert.equal(result.repair_request.can_create_inventory, false);
});

test('legacy Stage 2-8 files are implementation-free compatibility facades', async () => {
  const names = ['stage2-normalization.js','stage3-historical-frame.js','stage4-regional-context.js','stage5-start-candidates.js','stage6-candidate-place-templates.js','stage7-npc-candidates.js','stage8-item-profile-candidates.js'];
  for (const name of names) {
    const text = await readFile(new URL(`../../legacy/src/world/new-game-pipeline/stages/${name}`, import.meta.url), 'utf8');
    assert.match(text, /@rus\/new-game\/stages\/stage-[2-8]\/compat/);
    assert.doesNotMatch(text, /function\s+/);
    assert.ok(text.split('\n').length <= 3);
  }
});

test('Stage 2-8 compatibility APIs preserve all baseline named exports', async () => {
  const baselineFiles = [
    [2, 'stage2-normalization-0.9.0.js'],
    [3, 'stage3-historical-frame-0.9.0.js'],
    [4, 'stage4-regional-context-0.9.0.js'],
    [5, 'stage5-start-candidates-0.9.0.js'],
    [6, 'stage6-candidate-place-templates-0.9.0.js'],
    [7, 'stage7-npc-candidates-0.9.0.js'],
    [8, 'stage8-item-profile-candidates-0.9.0.js']
  ];
  for (const [stageId, fileName] of baselineFiles) {
    const source = await readFile(new URL(`../fixtures/stage2-8-baseline/${fileName}`, import.meta.url), 'utf8');
    const expected = [...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z0-9_]+)/gmu)].map((match) => match[1]);
    const compatibilityApi = await import(`@rus/new-game/stages/stage-${stageId}/compat`);
    for (const name of expected) assert.ok(name in compatibilityApi, `Stage ${stageId} lost export ${name}`);
  }
});
