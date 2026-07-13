import { defaultTimeOfDayPolicies } from '../../src/world/new-game-pipeline/index.js';

const REGION_ID = 'region_novgorod_land';
const PERIOD_ID = 'region_period:region_novgorod_land:1230:1250';
const SEASON_RULE_ID = 'season_winter_novgorod';

export function buildMinimalCandidateSet(requestId = 'req_fixture', { regionStatus = 'approved' } = {}) {
  return {
    version: 1,
    schema: 'historical_frame_candidate_set',
    request_id: requestId,
    regions: [{
      region_id: REGION_ID,
      title: 'Новгородская земля',
      status: regionStatus,
      sources: ['src_region']
    }],
    historical_periods: [{
      period_id: PERIOD_ID,
      region_id: REGION_ID,
      year_start: 1230,
      year_end: 1250,
      status: regionStatus,
      sources: ['src_period']
    }],
    year_ranges: [{
      year_range_id: `region_year_range:${REGION_ID}:1230:1250`,
      region_id: REGION_ID,
      start: 1230,
      end: 1250,
      status: regionStatus,
      sources: ['src_period']
    }],
    season_rules: [{
      season_rule_id: SEASON_RULE_ID,
      season_id: 'winter',
      region_id: REGION_ID,
      status: regionStatus,
      sources: ['src_season']
    }],
    time_of_day_policies: defaultTimeOfDayPolicies(),
    political_contexts: [{
      political_context_id: `political_context:${REGION_ID}`,
      region_id: REGION_ID,
      status: regionStatus,
      sources: ['src_political']
    }],
    social_contexts: [{
      social_context_id: `social_context:${REGION_ID}`,
      region_id: REGION_ID,
      status: regionStatus,
      sources: ['src_social']
    }],
    sources: [
      { source_id: 'src_region' },
      { source_id: 'src_period' },
      { source_id: 'src_season' },
      { source_id: 'src_political' },
      { source_id: 'src_social' }
    ]
  };
}

export function buildStage3FixtureOutput(requestId = 'req_fixture', overrides = {}) {
  return {
    version: 1,
    schema: 'historical_frame',
    request_id: requestId,
    selection_status: 'selected',
    era: { label: 'XIII век', selection_mode: 'constrained_random' },
    year: { value: 1237, selection_mode: 'constrained_random' },
    calendar: { season: 'winter', party_day: 1 },
    clock: { day: 1, hour: 3, minute: 45, time_of_day: 'deep_night', light_profile: 'dark' },
    region: { region_id: REGION_ID, title: 'Новгородская земля' },
    political_context: { summary: 'вечевые порядки', active_pressures: ['торговое давление'] },
    social_context: { summary: 'городская община', active_social_pressures: ['зимняя стужа'] },
    seasonal_context: { summary: 'зимние ограничения', travel_pressure: 'high' },
    downstream_constraints: {
      must_preserve: ['year', 'calendar.season', 'region.region_id', 'clock.hour', 'clock.minute', 'clock.time_of_day', 'clock.light_profile'],
      must_not_create_yet: ['place_id', 'npc_id'],
      must_resolve_later: ['start_place']
    },
    candidate_ids_used: {
      region_id: REGION_ID,
      historical_period_id: PERIOD_ID,
      season_rule_id: SEASON_RULE_ID,
      time_of_day_policy_id: 'default_deep_night_dark'
    },
    sources: ['src_region', 'src_period', 'src_season'],
    audit: { pass: true, concerns: [], evidence: ['test fixture'] },
    ...overrides
  };
}

export function buildStage3SelectorInput(requestId, candidates, selectionPolicy = {}) {
  return {
    version: 1,
    schema: 'historical_frame_selector_input',
    request_id: requestId,
    normalized_request: buildNormalizedRequest(requestId),
    available_candidates: candidates,
    selection_policy: {
      allow_random: true,
      prefer_approved_records: true,
      allow_usable_with_caution: true,
      allow_draft: false,
      allow_needs_review: false,
      reject_conflict_or_rejected: true,
      require_sources: true,
      ...selectionPolicy
    }
  };
}

export function buildNormalizedRequest(requestId) {
  return {
    version: 1,
    schema: 'new_game_normalized_request',
    request_id: requestId,
    language: 'ru',
    start_mode: 'new_party',
    player_intent_summary: 'test',
    era_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'high', notes: null },
    year_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'high', notes: null },
    season_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'high', notes: null },
    time_of_day_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'high', notes: null },
    region_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'high', notes: null },
    start_place_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'high', notes: null },
    character_request: { occupation_text: null, selection_mode: 'random', source: 'missing', confidence: 'high', notes: null },
    tone_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'high', notes: null },
    difficulty_request: { value: null, selection_mode: 'random', source: 'missing', confidence: 'high', notes: null },
    hard_constraints: [],
    soft_preferences: [],
    forbidden_content: [],
    unknowns_to_resolve: [],
    requires_clarification: false,
    clarification_questions: [],
    adaptation_flags: {
      requires_historical_adaptation: false,
      modern_terms_present: false,
      fantasy_or_impossible_terms_present: false,
      too_powerful_or_elite: false,
      requires_social_downgrade: false,
      requires_item_rights_check: false,
      requires_weapon_rights_check: false
    },
    invalid_or_unsafe_literals: [],
    audit: { pass: true, concerns: [], evidence: ['test'] },
    unknowns_to_resolve: [
      'era_request', 'year_request', 'season_request', 'time_of_day_request',
      'region_request', 'start_place_request', 'tone_request', 'difficulty_request'
    ].map((field) => ({
      field,
      resolution_stage: field === 'character_request' ? 'player_character_generator' : 'historical_frame_selector',
      policy: field === 'character_request'
        ? 'choose_from_allowed_social_roles_and_occupations'
        : 'choose_from_available_candidates'
    })).concat([{
      field: 'character_request',
      resolution_stage: 'player_character_generator',
      policy: 'choose_from_allowed_social_roles_and_occupations'
    }])
  };
}
