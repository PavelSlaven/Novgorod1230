import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNewGameLlmStageDefinition,
  runLlmStageGate,
  runNewGamePipeline,
  validateStage2NormalizedRequest
} from '../src/world/new-game-pipeline/index.js';

test('empty input + allow_random_if_missing=true yields random/missing blocks and passes', () => {
  const input = {
    request_id: 'req_empty',
    player_text: '',
    ui_fields: normalizeUiFields(),
    client_defaults: { allow_random_if_missing: true, default_unknown_policy: 'random', language: 'ru' }
  };
  const output = buildEmptyRandomOutput('req_empty');
  const concerns = validateStage2NormalizedRequest(output, input);
  assert.equal(concerns.length, 0);
});

test('explicit random player text uses explicit_player_random without invented values', () => {
  const input = {
    request_id: 'req_random',
    player_text: 'случайный персонаж в случайном месте',
    ui_fields: normalizeUiFields(),
    client_defaults: { allow_random_if_missing: true, default_unknown_policy: 'random', language: 'ru' }
  };
  const output = buildExplicitRandomOutput('req_random');
  const concerns = validateStage2NormalizedRequest(output, input);
  assert.equal(concerns.length, 0);
  for (const field of [
    'era_request', 'year_request', 'season_request', 'time_of_day_request',
    'region_request', 'start_place_request', 'tone_request', 'difficulty_request'
  ]) {
    assert.equal(output[field].value, null);
    assert.equal(output[field].source, 'explicit_player_random');
    assert.equal(output[field].selection_mode, 'random');
  }
});

test('blacksmith novgorod winter request keeps text hints without resolved ids', () => {
  const input = {
    request_id: 'req_blacksmith',
    player_text: 'хочу быть кузнецом в Новгороде зимой 1230',
    ui_fields: normalizeUiFields(),
    client_defaults: { allow_random_if_missing: true, default_unknown_policy: 'random', language: 'ru' }
  };
  const output = buildBlacksmithHintsOutput('req_blacksmith');
  const concerns = validateStage2NormalizedRequest(output, input);
  assert.equal(concerns.length, 0);
  assert.equal(output.character_request.occupation_text, 'кузнец');
  assert.equal(output.region_request.value, 'Новгород');
  assert.equal(output.season_request.value, 'winter');
  assert.equal(output.year_request.value, 1230);
  assert.equal(output.social_role_id, undefined);
  assert.equal(output.occupation_id, undefined);
  assert.equal(output.region_id, undefined);
});

test('pistol and magic request records adaptation flags without hard fail', () => {
  const input = {
    request_id: 'req_fantasy',
    player_text: 'хочу пистолет и магию',
    ui_fields: normalizeUiFields(),
    client_defaults: { allow_random_if_missing: true, default_unknown_policy: 'random', language: 'ru' }
  };
  const output = buildFantasyTermsOutput('req_fantasy');
  const concerns = validateStage2NormalizedRequest(output, input);
  assert.equal(concerns.length, 0);
  assert.equal(output.adaptation_flags.modern_terms_present, true);
  assert.equal(output.adaptation_flags.fantasy_or_impossible_terms_present, true);
  assert.ok(output.invalid_or_unsafe_literals.length >= 2);
});

test('resolved role/occupation/skill ids fail code gate', () => {
  const input = baseInput('req_ids');
  const output = {
    ...buildEmptyRandomOutput('req_ids'),
    social_role_id: 'role_merchant',
    occupation_id: 'occ_merchant',
    skill_id: 'skill_trade'
  };
  const concerns = validateStage2NormalizedRequest(output, input);
  assert.ok(concerns.some((item) => item.code === 'NORMALIZER_CREATED_OR_RESOLVED_WORLD_ID'));
});

test('npc/item/place/graph ids fail code gate', () => {
  const input = baseInput('req_entity_ids');
  const output = {
    ...buildEmptyRandomOutput('req_entity_ids'),
    npc_id: 'npc_001',
    item_id: 'item_001',
    place_id: 'place_market',
    graph_node_id: 'g4'
  };
  const concerns = validateStage2NormalizedRequest(output, input);
  assert.ok(concerns.some((item) => item.code === 'NORMALIZER_CREATED_OR_RESOLVED_WORLD_ID'));
});

test('missing player field marked explicit fails validation', () => {
  const input = {
    request_id: 'req_explicit_missing',
    player_text: '',
    ui_fields: normalizeUiFields(),
    client_defaults: { allow_random_if_missing: true, default_unknown_policy: 'random', language: 'ru' }
  };
  const output = buildEmptyRandomOutput('req_explicit_missing');
  output.region_request = {
    value: 'Новгород',
    selection_mode: 'explicit',
    source: 'player_text',
    confidence: 'high',
    notes: null
  };
  const concerns = validateStage2NormalizedRequest(output, input);
  assert.ok(concerns.some((item) => item.code === 'NORMALIZER_MISSING_FIELD_MARKED_EXPLICIT'));
});

test('requires_clarification=false with clarification questions fails validation', () => {
  const input = baseInput('req_clarify');
  const output = buildEmptyRandomOutput('req_clarify');
  output.requires_clarification = false;
  output.clarification_questions = ['Уточните регион.'];
  const concerns = validateStage2NormalizedRequest(output, input);
  assert.ok(concerns.some((item) => item.code === 'NORMALIZER_CLARIFICATION_QUESTIONS_WITH_FALSE_FLAG'));
});

test('audit.pass=true does not bypass forbidden field gate', () => {
  const definition = getNewGameLlmStageDefinition(2);
  const input = baseInput('req_audit_bypass');
  const output = {
    ...buildEmptyRandomOutput('req_audit_bypass'),
    occupation_id: 'occ_merchant',
    audit: { pass: true, concerns: [], evidence: ['self-report only'] }
  };
  const gate = runLlmStageGate(definition, output, input);
  assert.equal(gate.pass, false);
  assert.ok(gate.concerns.some((item) => item.code === 'NORMALIZER_CREATED_OR_RESOLVED_WORLD_ID'));
});

test('provided stageOutputs[2] in production without allowProvidedStageOutputs throws', async () => {
  await assert.rejects(
    runNewGamePipeline({
      enableNewGamePipeline: true,
      requestId: 'req_prod_bypass',
      env: { NODE_ENV: 'production' },
      stageOutputs: {
        2: buildEmptyRandomOutput('req_prod_bypass')
      },
      queryable: { async query() { return { rows: [] }; } },
      llmStageExecutor: async () => ({}),
      g5Materialize: async () => ({}),
      g5Audit: async () => ({}),
      stage24Builder: async () => ({})
    }),
    /Provided stage 2 output is disabled in production/u
  );
});

function baseInput(requestId, playerText = '') {
  return {
    request_id: requestId,
    player_text: playerText,
    ui_fields: normalizeUiFields(),
    client_defaults: { allow_random_if_missing: true, default_unknown_policy: 'random', language: 'ru' }
  };
}

function normalizeUiFields(overrides = {}) {
  return {
    era: null,
    region: null,
    character_type: null,
    start_place: null,
    tone: null,
    difficulty: null,
    additional_constraints: null,
    ...overrides
  };
}

function randomBlock(notes = null) {
  return {
    value: null,
    selection_mode: 'random',
    source: 'missing',
    confidence: 'high',
    notes
  };
}

function adaptationFlags(overrides = {}) {
  return {
    requires_historical_adaptation: false,
    modern_terms_present: false,
    fantasy_or_impossible_terms_present: false,
    too_powerful_or_elite: false,
    requires_social_downgrade: false,
    requires_item_rights_check: false,
    requires_weapon_rights_check: false,
    ...overrides
  };
}

function unknownEntry(field, resolutionStage = 'historical_frame_selector', policy = 'choose_from_available_candidates') {
  return { field, resolution_stage: resolutionStage, policy };
}

function buildEmptyRandomOutput(requestId) {
  const randomFields = [
    'era_request', 'year_request', 'season_request', 'time_of_day_request',
    'region_request', 'start_place_request', 'tone_request', 'difficulty_request'
  ];
  const output = {
    version: 1,
    schema: 'new_game_normalized_request',
    request_id: requestId,
    language: 'ru',
    start_mode: 'new_party',
    player_intent_summary: 'Игрок не задал конкретных условий; требуется случайный допустимый старт из базы.',
    character_request: {
      selection_mode: 'random',
      source: 'missing',
      confidence: 'high',
      notes: 'Generate character after region, time and start place are resolved.'
    },
    hard_constraints: [],
    soft_preferences: [],
    forbidden_content: [],
    requires_clarification: false,
    clarification_questions: [],
    adaptation_flags: adaptationFlags(),
    invalid_or_unsafe_literals: [],
    audit: {
      pass: true,
      concerns: [],
      evidence: ['Missing fields are allowed by client_defaults.allow_random_if_missing=true.']
    }
  };
  for (const field of randomFields) {
    output[field] = randomBlock(`Resolve ${field} from available candidates.`);
  }
  output.unknowns_to_resolve = [
    ...randomFields.map((field) => unknownEntry(field)),
    unknownEntry('character_request', 'player_character_generator', 'choose_from_allowed_social_roles_and_occupations')
  ];
  return output;
}

function buildExplicitRandomOutput(requestId) {
  const output = buildEmptyRandomOutput(requestId);
  output.player_intent_summary = 'Игрок просит случайного персонажа в случайном месте.';
  for (const field of [
    'era_request', 'year_request', 'season_request', 'time_of_day_request',
    'region_request', 'start_place_request', 'tone_request', 'difficulty_request'
  ]) {
    output[field] = {
      value: null,
      selection_mode: 'random',
      source: 'explicit_player_random',
      confidence: 'high',
      notes: `Resolve ${field} from available candidates.`
    };
  }
  output.character_request = {
    selection_mode: 'random',
    source: 'explicit_player_random',
    confidence: 'high',
    notes: 'Generate character after region, time and start place are resolved.'
  };
  return output;
}

function buildBlacksmithHintsOutput(requestId) {
  const output = buildEmptyRandomOutput(requestId);
  output.player_intent_summary = 'Игрок хочет быть кузнецом в Новгороде зимой 1230 года.';
  output.era_request = {
    value: 'XIII век',
    selection_mode: 'constrained_random',
    source: 'player_text',
    confidence: 'high',
    notes: 'Exact year must be selected by historical_frame_selector.'
  };
  output.year_request = {
    value: 1230,
    selection_mode: 'explicit',
    source: 'player_text',
    confidence: 'high',
    notes: null
  };
  output.season_request = {
    value: 'winter',
    selection_mode: 'explicit',
    source: 'player_text',
    confidence: 'high',
    notes: null
  };
  output.region_request = {
    value: 'Новгород',
    selection_mode: 'explicit',
    source: 'player_text',
    confidence: 'medium',
    notes: 'Must be resolved against world_base.regions.'
  };
  output.character_request = {
    occupation_text: 'кузнец',
    occupation_category_hint: 'craft',
    selection_mode: 'constrained_random',
    source: 'player_text',
    confidence: 'medium',
    notes: 'Exact character profile must be generated after world_base context is loaded.'
  };
  output.unknowns_to_resolve = [
    unknownEntry('era_request'),
    unknownEntry('start_place_request', 'start_candidate_retriever', 'choose_from_allowed_start_nodes'),
    unknownEntry('time_of_day_request'),
    unknownEntry('tone_request'),
    unknownEntry('difficulty_request'),
    unknownEntry('character_request', 'player_character_generator', 'choose_from_allowed_social_roles_and_occupations')
  ];
  return output;
}

function buildFantasyTermsOutput(requestId) {
  const output = buildEmptyRandomOutput(requestId);
  output.player_intent_summary = 'Игрок просит пистолет и магию; требуется историческая адаптация.';
  output.adaptation_flags = adaptationFlags({
    requires_historical_adaptation: true,
    modern_terms_present: true,
    fantasy_or_impossible_terms_present: true,
    requires_weapon_rights_check: true
  });
  output.invalid_or_unsafe_literals = [
    { literal: 'пистолет', reason: 'modern_weapon', source: 'player_text' },
    { literal: 'магия', reason: 'fantasy_or_impossible', source: 'player_text' }
  ];
  return output;
}
