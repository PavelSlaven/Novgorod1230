// Stage 3 is a strict semantic-selection layer.
// It fixes the historical/calendar/regional frame for a new party, but it
// must choose only from a backend-provided candidate set. It must not create
// concrete locations, G1-G5 start nodes, NPCs, items, events, hidden state or
// player-facing prose. Those are later stages.

import { getRetrieverQueryable, getAllowedStatuses } from '../retrievers/common.js';

export const STAGE_3_SELECTION_STATUSES = Object.freeze([
  'selected',
  'blocked',
  'requires_clarification'
]);

export const STAGE_3_SEASONS = Object.freeze(['spring', 'summer', 'autumn', 'winter']);
export const STAGE_3_TIME_OF_DAY = Object.freeze(['morning', 'day', 'evening', 'night', 'deep_night']);
export const STAGE_3_LIGHT_PROFILES = Object.freeze(['dark', 'dim', 'daylight', 'twilight']);
export const STAGE_3_ALLOWED_RECORD_STATUSES = Object.freeze(['approved', 'usable_with_caution', 'draft', 'needs_review']);
export const STAGE_3_REJECTED_RECORD_STATUSES = Object.freeze(['conflict', 'rejected']);

export const STAGE_3_REQUIRED_FIELDS = Object.freeze([
  'version',
  'schema',
  'request_id',
  'selection_status',
  'era',
  'year',
  'calendar',
  'clock',
  'region',
  'political_context',
  'social_context',
  'seasonal_context',
  'downstream_constraints',
  'candidate_ids_used',
  'sources',
  'audit'
]);

// These exact keys are forbidden anywhere in the selected historical frame.
// Stage 3 chooses context, not the concrete start node or scene.
const FORBIDDEN_DOWNSTREAM_KEYS = Object.freeze([
  'visible_scene',
  'intro_prose',
  'starting_prose',
  'start_location_id',
  'current_position',
  'position',
  'g1_id',
  'g2_id',
  'g3_id',
  'g4_id',
  'g5_id',
  'g5_anchor_id',
  'scene_anchor_id',
  'anchor_id',
  'location_id',
  'minilocation_id',
  'place_id',
  'graph_node_id',
  'node_id',
  'route_id',
  'edge_id',
  'npc',
  'npcs',
  'npc_id',
  'npc_ids',
  'item',
  'items',
  'item_id',
  'item_ids',
  'inventory',
  'equipment',
  'hidden_state',
  'hidden_event',
  'hidden_events',
  'player_character',
  'character_profile'
]);

const WEATHER_CREATION_RE = /(?:метел|ливен|дожд[ьяе]?|снегопад|бур[яи]|гроза|туман|мороз\s*-?\s*\d|температур[аы]\s*-?\s*\d|blizzard|rainstorm|snowstorm|specific\s+weather)/iu;
const CONCRETE_EVENT_RE = /(?:нападен|набег|пожар|суд\b|казнь|битв|сражен|заговор|посольств|войско\s+стоит|приказал|riot|raid|battle|court\s+case)/iu;
const PLAYER_STATUS_ASSIGNMENT_RE = /(?:персонаж\s+(?:является|становится|назначен|должен|имеет\s+долг)|player\s+character\s+is|assign\s+the\s+character)/iu;

export async function buildStage3HistoricalFrameInput(context, options = {}) {
  const normalizedRequest = context.requireStageOutput(2, 'normalized request');
  const explicitCandidateSet = options.availableCandidates
    ?? options.historicalFrameCandidateSet
    ?? context.historicalFrameCandidateSet
    ?? null;
  const queryable = options.queryable ?? null;

  let availableCandidates;
  if (explicitCandidateSet) {
    availableCandidates = normalizeStage3CandidateSet(explicitCandidateSet);
  } else if (queryable != null) {
    availableCandidates = await retrieveHistoricalFrameCandidates({
      request_id: context.requestId,
      normalized_request: normalizedRequest,
      candidate_policy: options.candidatePolicy ?? options.selectionPolicy ?? context.historicalFrameCandidatePolicy ?? {}
    }, {
      env: options.env ?? context.env,
      queryable
    });
  } else {
    const error = new Error('HISTORICAL_FRAME_CANDIDATE_SET_MISSING');
    error.code = 'HISTORICAL_FRAME_CANDIDATE_SET_MISSING';
    throw error;
  }

  const selectionPolicy = buildStage3SelectionPolicy(options.selectionPolicy ?? context.historicalFrameSelectionPolicy ?? {});

  return {
    version: 1,
    schema: 'historical_frame_selector_input',
    request_id: context.requestId,
    normalized_request: normalizedRequest,
    available_candidates: availableCandidates,
    selection_policy: selectionPolicy,
    stage_boundary: buildStage3BoundaryPolicy()
  };
}

export function buildStage3BoundaryPolicy() {
  return {
    version: 1,
    schema: 'stage_3_historical_frame_policy',
    stage_id: 3,
    stage_slug: 'historical_frame',
    purpose: 'Select and fix the new-party historical/calendar/regional frame from available_candidates only.',
    may_select: [
      'era or historical-period label',
      'year or selected year range',
      'party_day',
      'season',
      'clock.day/hour/minute/time_of_day/light_profile',
      'region from candidate set',
      'political background as constraints',
      'social background as constraints',
      'seasonal pressure as constraints',
      'downstream constraints for later stages'
    ],
    must_not_create: [
      'specific start location or G1-G5 node',
      'scene anchor, visible scene or intro prose',
      'NPCs, named people, witnesses, enemies or helpers',
      'items, inventory, equipment or property facts',
      'player character status, debt, family, biography or goal as fact',
      'concrete weather event or exact temperature',
      'hidden event, secret, raid, battle, court case, fire or conflict'
    ],
    candidate_set_rule: 'Every selected region/period/season/time policy id must exist in available_candidates.',
    random_policy: 'selection_mode=random means choose a compatible candidate; never invent outside the candidate set.',
    audit_is_self_report_only: true
  };
}

export function buildStage3SelectionPolicy(policy = {}) {
  return {
    allow_random: policy.allow_random !== false,
    prefer_approved_records: policy.prefer_approved_records !== false,
    allow_usable_with_caution: policy.allow_usable_with_caution !== false,
    allow_draft: policy.allow_draft === true,
    allow_needs_review: policy.allow_needs_review === true,
    reject_conflict_or_rejected: policy.reject_conflict_or_rejected !== false,
    require_sources: policy.require_sources !== false,
    max_regions: Number.isFinite(Number(policy.max_regions)) ? Number(policy.max_regions) : 10,
    max_historical_periods: Number.isFinite(Number(policy.max_historical_periods)) ? Number(policy.max_historical_periods) : 20,
    max_season_rules: Number.isFinite(Number(policy.max_season_rules)) ? Number(policy.max_season_rules) : 12,
    max_political_contexts: Number.isFinite(Number(policy.max_political_contexts)) ? Number(policy.max_political_contexts) : 12,
    max_social_contexts: Number.isFinite(Number(policy.max_social_contexts)) ? Number(policy.max_social_contexts) : 12
  };
}

export async function retrieveHistoricalFrameCandidates(input = {}, deps = {}) {
  const requestId = input.request_id ?? input.requestId ?? null;
  const policy = buildStage3SelectionPolicy(input.candidate_policy ?? input.selection_policy ?? {});
  const statuses = getAllowedStatuses(policy);
  const db = getRetrieverQueryable(deps);

  const regions = await many(db, `
    SELECT id, slug, canonical_name, display_name, summary,
           period_start_year, period_end_year, political_summary, social_order_summary,
           social_summary, historical_context_summary, military_pressure_summary,
           external_pressure_summary, common_risks_summary, llm_forbidden_assumptions,
           status, confidence, sources
    FROM world_base.regions
    WHERE status = ANY($1::text[])
    ORDER BY COALESCE(display_name, canonical_name, id), id
    LIMIT $2
  `, [statuses, policy.max_regions]);

  const regionIds = regions.map((row) => row.id);
  const seasonRules = regionIds.length > 0
    ? await many(db, `
      SELECT id, region_id, season, title, slug, weather_profile, daylight_profile,
             road_effects, river_effects, forest_effects, field_effects, work_effects,
             trade_effects, war_effects, disease_effects, clothing_requirements,
             shelter_requirements, common_risks, game_use, limits, status, confidence, sources
      FROM world_base.seasonal_rules
      WHERE region_id = ANY($1::text[])
        AND status = ANY($2::text[])
        AND season = ANY($3::text[])
      ORDER BY region_id, season, title, id
      LIMIT $4
    `, [regionIds, statuses, STAGE_3_SEASONS, policy.max_season_rules * Math.max(regionIds.length, 1)])
    : [];

  const normalized = normalizeStage3CandidateSet({
    version: 1,
    schema: 'historical_frame_candidate_set',
    request_id: requestId,
    regions: regions.map((row) => ({
      region_id: row.id,
      slug: row.slug,
      title: row.display_name ?? row.canonical_name ?? row.id,
      summary: row.summary,
      status: row.status,
      confidence: row.confidence,
      sources: normalizeSources(row.sources),
      period_start_year: row.period_start_year,
      period_end_year: row.period_end_year,
      political_summary: row.political_summary,
      social_summary: row.social_order_summary ?? row.social_summary,
      historical_context_summary: row.historical_context_summary,
      forbidden_assumptions: normalizeArray(row.llm_forbidden_assumptions)
    })),
    historical_periods: regions.map((row) => ({
      period_id: `region_period:${row.id}:${row.period_start_year ?? 'open'}:${row.period_end_year ?? 'open'}`,
      region_id: row.id,
      title: `${row.display_name ?? row.canonical_name ?? row.id} active period`,
      year_start: row.period_start_year,
      year_end: row.period_end_year,
      summary: row.historical_context_summary ?? row.summary,
      political_summary: row.political_summary,
      social_summary: row.social_order_summary ?? row.social_summary,
      status: row.status,
      confidence: row.confidence,
      sources: normalizeSources(row.sources),
      source_table: 'world_base.regions'
    })),
    year_ranges: regions.map((row) => ({
      year_range_id: `region_year_range:${row.id}:${row.period_start_year ?? 'open'}:${row.period_end_year ?? 'open'}`,
      region_id: row.id,
      start: row.period_start_year,
      end: row.period_end_year,
      status: row.status,
      confidence: row.confidence,
      sources: normalizeSources(row.sources)
    })),
    season_rules: seasonRules.map((row) => ({
      season_rule_id: row.id,
      season_id: row.season,
      region_id: row.region_id,
      title: row.title,
      slug: row.slug,
      summary: row.game_use ?? row.weather_profile ?? row.title,
      travel_effects: [...normalizeArray(row.road_effects), ...normalizeArray(row.river_effects), ...normalizeArray(row.forest_effects)],
      light_effects: normalizeTextArray(row.daylight_profile),
      work_rhythm_effects: normalizeArray(row.work_effects),
      health_risk_effects: [...normalizeArray(row.disease_effects), ...normalizeArray(row.clothing_requirements), ...normalizeArray(row.shelter_requirements)],
      status: row.status,
      confidence: row.confidence,
      sources: normalizeSources(row.sources),
      source_table: 'world_base.seasonal_rules'
    })),
    time_of_day_policies: defaultTimeOfDayPolicies(),
    political_contexts: regions.map((row) => ({
      political_context_id: `political_context:${row.id}`,
      region_id: row.id,
      summary: row.political_summary ?? row.historical_context_summary ?? row.summary,
      active_pressures: normalizeTextArray(row.military_pressure_summary ?? row.external_pressure_summary ?? row.common_risks_summary),
      forbidden_assumptions: normalizeArray(row.llm_forbidden_assumptions),
      status: row.status,
      confidence: row.confidence,
      sources: normalizeSources(row.sources)
    })),
    social_contexts: regions.map((row) => ({
      social_context_id: `social_context:${row.id}`,
      region_id: row.id,
      summary: row.social_order_summary ?? row.social_summary ?? row.summary,
      active_social_pressures: normalizeTextArray(row.common_risks_summary),
      status_constraints_for_character_generation: [
        'Character status must be selected later from regional social role candidates.'
      ],
      forbidden_assumptions: normalizeArray(row.llm_forbidden_assumptions),
      status: row.status,
      confidence: row.confidence,
      sources: normalizeSources(row.sources)
    })),
    sources: buildCandidateSourceIndex([...regions, ...seasonRules])
  });

  return normalized;
}

export function normalizeStage3CandidateSet(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const regions = normalizeArray(input.regions).map((row) => ({
    ...row,
    region_id: row.region_id ?? row.id ?? null,
    sources: normalizeSources(row.sources)
  })).filter((row) => row.region_id);

  const historicalPeriods = normalizeArray(input.historical_periods).map((row) => ({
    ...row,
    period_id: row.period_id ?? row.id ?? null,
    region_id: row.region_id ?? null,
    year_start: parseNullableInt(row.year_start ?? row.start ?? row.period_start_year),
    year_end: parseNullableInt(row.year_end ?? row.end ?? row.period_end_year),
    sources: normalizeSources(row.sources)
  })).filter((row) => row.period_id);

  const yearRanges = normalizeArray(input.year_ranges).map((row) => ({
    ...row,
    year_range_id: row.year_range_id ?? row.id ?? null,
    region_id: row.region_id ?? null,
    start: parseNullableInt(row.start ?? row.year_start ?? row.period_start_year),
    end: parseNullableInt(row.end ?? row.year_end ?? row.period_end_year),
    sources: normalizeSources(row.sources)
  })).filter((row) => row.year_range_id || row.region_id);

  const seasonRules = normalizeArray(input.season_rules).map((row) => ({
    ...row,
    season_rule_id: row.season_rule_id ?? row.id ?? null,
    season_id: row.season_id ?? row.season ?? null,
    region_id: row.region_id ?? null,
    sources: normalizeSources(row.sources)
  })).filter((row) => row.season_rule_id && row.season_id);

  return {
    version: 1,
    schema: 'historical_frame_candidate_set',
    request_id: input.request_id ?? null,
    regions,
    historical_periods: historicalPeriods,
    year_ranges: yearRanges,
    season_rules: seasonRules,
    time_of_day_policies: normalizeArray(input.time_of_day_policies).length
      ? normalizeArray(input.time_of_day_policies)
      : defaultTimeOfDayPolicies(),
    political_contexts: normalizeArray(input.political_contexts),
    social_contexts: normalizeArray(input.social_contexts),
    sources: normalizeArray(input.sources).map((source) => typeof source === 'string'
      ? { source_id: source }
      : { ...source, source_id: source.source_id ?? source.id ?? null }).filter((source) => source.source_id)
  };
}

export function defaultTimeOfDayPolicies() {
  return [
    {
      time_of_day_policy_id: 'default_deep_night_dark',
      time_of_day: 'deep_night',
      hour_min: 0,
      hour_max: 4,
      light_profile: 'dark',
      summary: 'Deep night, normally dark.',
      npc_availability_notes: 'Most people are unavailable unless a later stage selects a valid night activity.',
      access_notes: 'Access must be checked later against place rules.'
    },
    {
      time_of_day_policy_id: 'default_morning_dim',
      time_of_day: 'morning',
      hour_min: 5,
      hour_max: 10,
      light_profile: 'dim',
      summary: 'Morning light. Seasonal rules may refine exact brightness.',
      npc_availability_notes: 'Work rhythm must be checked later against region and place rules.',
      access_notes: 'Access must be checked later against place rules.'
    },
    {
      time_of_day_policy_id: 'default_day_daylight',
      time_of_day: 'day',
      hour_min: 10,
      hour_max: 16,
      light_profile: 'daylight',
      summary: 'Daytime light.',
      npc_availability_notes: 'Common work and travel availability depends on region/place rules.',
      access_notes: 'Access must be checked later against place rules.'
    },
    {
      time_of_day_policy_id: 'default_evening_twilight',
      time_of_day: 'evening',
      hour_min: 16,
      hour_max: 21,
      light_profile: 'twilight',
      summary: 'Evening or dusk light.',
      npc_availability_notes: 'Availability depends on place and social rhythm.',
      access_notes: 'Access must be checked later against place rules.'
    },
    {
      time_of_day_policy_id: 'default_night_dark',
      time_of_day: 'night',
      hour_min: 21,
      hour_max: 23,
      light_profile: 'dark',
      summary: 'Night, normally dark.',
      npc_availability_notes: 'Most public activity is limited unless later justified.',
      access_notes: 'Access must be checked later against place rules.'
    }
  ];
}

export function validateStage3HistoricalFrame(output, input = {}) {
  const concerns = [];
  const candidates = normalizeStage3CandidateSet(input.available_candidates);
  const policy = buildStage3SelectionPolicy(input.selection_policy);

  if (output?.version !== 1) {
    concerns.push(makeConcern('HISTORICAL_FRAME_VERSION_MISMATCH', 'Stage 3 version must be exactly 1.', { field: 'version' }));
  }
  if (output?.request_id !== input.request_id) {
    concerns.push(makeConcern('HISTORICAL_FRAME_REQUEST_ID_MISMATCH', 'Stage 3 request_id must match input request_id.', { field: 'request_id' }));
  }
  if (!STAGE_3_SELECTION_STATUSES.includes(output?.selection_status)) {
    concerns.push(makeConcern('HISTORICAL_FRAME_SELECTION_STATUS_INVALID', 'selection_status must be selected, blocked or requires_clarification.', { field: 'selection_status' }));
  }

  concerns.push(...validateForbiddenKeys(output));
  concerns.push(...validateAuditSelfReport(output?.audit));

  if (output?.selection_status !== 'selected') {
    concerns.push(makeConcern(
      output?.selection_status === 'requires_clarification' ? 'HISTORICAL_FRAME_REQUIRES_CLARIFICATION' : 'NO_COMPATIBLE_HISTORICAL_FRAME',
      'Stage 3 did not select a valid historical frame; pipeline must stop before stage 4.',
      { field: 'selection_status' }
    ));
    if (output?.audit?.pass !== false) {
      concerns.push(makeConcern('HISTORICAL_FRAME_BLOCKED_AUDIT_MUST_FAIL', 'Blocked or clarification outputs must have audit.pass=false.', { field: 'audit.pass' }));
    }
    return concerns;
  }

  if (output?.audit?.pass !== true) {
    concerns.push(makeConcern('HISTORICAL_FRAME_AUDIT_NOT_PASSING', 'Selected historical_frame must have audit.pass=true.', { field: 'audit.pass' }));
  }

  for (const field of ['era', 'year', 'calendar', 'clock', 'region', 'political_context', 'social_context', 'seasonal_context', 'downstream_constraints', 'candidate_ids_used']) {
    if (!output?.[field] || typeof output[field] !== 'object' || Array.isArray(output[field])) {
      concerns.push(makeConcern('HISTORICAL_FRAME_MISSING_REQUIRED_FIELD', `Selected historical_frame must include object ${field}.`, { field }));
    }
  }

  const regionId = output?.region?.region_id ?? null;
  const region = candidates.regions.find((row) => row.region_id === regionId) ?? null;
  if (!region) {
    concerns.push(makeConcern('HISTORICAL_FRAME_REGION_NOT_IN_CANDIDATES', 'region.region_id must be present in available_candidates.regions.', { field: 'region.region_id', value: regionId }));
  }
  if (output?.candidate_ids_used?.region_id !== regionId) {
    concerns.push(makeConcern('HISTORICAL_FRAME_REGION_ID_MISMATCH', 'candidate_ids_used.region_id must equal region.region_id.', { field: 'candidate_ids_used.region_id' }));
  }

  const periodId = output?.candidate_ids_used?.historical_period_id ?? null;
  const period = candidates.historical_periods.find((row) => row.period_id === periodId) ?? null;
  if (!period) {
    concerns.push(makeConcern('HISTORICAL_FRAME_PERIOD_NOT_IN_CANDIDATES', 'candidate_ids_used.historical_period_id must exist in available_candidates.historical_periods.', { field: 'candidate_ids_used.historical_period_id', value: periodId }));
  } else {
    const yearValue = parseNullableInt(output?.year?.value);
    if (!Number.isInteger(yearValue)) {
      concerns.push(makeConcern('HISTORICAL_FRAME_YEAR_INVALID', 'year.value must be an integer for selected frames.', { field: 'year.value' }));
    } else if (!isYearInsidePeriod(yearValue, period)) {
      concerns.push(makeConcern('HISTORICAL_FRAME_YEAR_OUT_OF_RANGE', 'year.value must be inside selected historical period.', { field: 'year.value', value: yearValue, period_id: periodId }));
    }
  }

  const season = output?.calendar?.season ?? null;
  const seasonRuleId = output?.candidate_ids_used?.season_rule_id ?? null;
  const seasonRule = candidates.season_rules.find((row) => row.season_rule_id === seasonRuleId) ?? null;
  if (!STAGE_3_SEASONS.includes(season)) {
    concerns.push(makeConcern('HISTORICAL_FRAME_SEASON_NOT_ALLOWED', 'calendar.season must be spring, summer, autumn or winter.', { field: 'calendar.season', value: season }));
  }
  if (!seasonRule) {
    concerns.push(makeConcern('HISTORICAL_FRAME_SEASON_RULE_NOT_IN_CANDIDATES', 'candidate_ids_used.season_rule_id must exist in available_candidates.season_rules.', { field: 'candidate_ids_used.season_rule_id', value: seasonRuleId }));
  } else {
    if (seasonRule.region_id !== regionId) {
      concerns.push(makeConcern('HISTORICAL_FRAME_SEASON_REGION_MISMATCH', 'Selected season rule must belong to selected region.', { field: 'candidate_ids_used.season_rule_id' }));
    }
    if (seasonRule.season_id !== season) {
      concerns.push(makeConcern('HISTORICAL_FRAME_SEASON_RULE_MISMATCH', 'calendar.season must equal selected season rule season_id.', { field: 'calendar.season' }));
    }
  }

  concerns.push(...validateClock(output?.clock, candidates, output?.candidate_ids_used?.time_of_day_policy_id));
  concerns.push(...validateSources(output, candidates, policy));
  concerns.push(...validateRecordStatuses(output, candidates, policy));
  concerns.push(...validateContextBoundaries(output));
  concerns.push(...validateDownstreamConstraints(output?.downstream_constraints));

  return concerns;
}

function validateClock(clock = {}, candidates = {}, policyId = null) {
  const concerns = [];
  const hour = Number(clock?.hour);
  const minute = Number(clock?.minute);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    concerns.push(makeConcern('HISTORICAL_FRAME_CLOCK_INVALID', 'clock.hour must be an integer in 0..23.', { field: 'clock.hour' }));
  }
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
    concerns.push(makeConcern('HISTORICAL_FRAME_CLOCK_INVALID', 'clock.minute must be an integer in 0..59.', { field: 'clock.minute' }));
  }
  if (!STAGE_3_TIME_OF_DAY.includes(clock?.time_of_day)) {
    concerns.push(makeConcern('HISTORICAL_FRAME_CLOCK_INVALID', 'clock.time_of_day is invalid.', { field: 'clock.time_of_day' }));
  }
  if (!STAGE_3_LIGHT_PROFILES.includes(clock?.light_profile)) {
    concerns.push(makeConcern('HISTORICAL_FRAME_LIGHT_PROFILE_CONFLICT', 'clock.light_profile is invalid.', { field: 'clock.light_profile' }));
  }
  const policies = normalizeArray(candidates.time_of_day_policies).map(normalizeTimePolicy);
  const selectedPolicy = policies.find((item) => item.time_of_day_policy_id === policyId)
    ?? policies.find((item) => item.time_of_day === clock?.time_of_day && hour >= item.hour_min && hour <= item.hour_max)
    ?? null;
  if (!selectedPolicy) {
    concerns.push(makeConcern('HISTORICAL_FRAME_CLOCK_POLICY_NOT_IN_CANDIDATES', 'clock must match an available time_of_day_policy.', { field: 'candidate_ids_used.time_of_day_policy_id', value: policyId }));
    return concerns;
  }
  if (selectedPolicy.time_of_day !== clock?.time_of_day) {
    concerns.push(makeConcern('HISTORICAL_FRAME_CLOCK_INVALID', 'clock.time_of_day must match selected time policy.', { field: 'clock.time_of_day' }));
  }
  if (Number.isInteger(hour) && (hour < selectedPolicy.hour_min || hour > selectedPolicy.hour_max)) {
    concerns.push(makeConcern('HISTORICAL_FRAME_CLOCK_INVALID', 'clock.hour is outside selected time_of_day_policy range.', { field: 'clock.hour' }));
  }
  if (selectedPolicy.light_profile !== clock?.light_profile) {
    concerns.push(makeConcern('HISTORICAL_FRAME_LIGHT_PROFILE_CONFLICT', 'clock.light_profile must match selected time_of_day_policy.', { field: 'clock.light_profile' }));
  }
  return concerns;
}

function validateSources(output, candidates, policy) {
  const concerns = [];
  const outputSources = normalizeArray(output?.sources);
  if (policy.require_sources && outputSources.length === 0) {
    concerns.push(makeConcern('HISTORICAL_FRAME_SOURCE_MISSING', 'sources must be non-empty when selection_policy.require_sources=true.', { field: 'sources' }));
    return concerns;
  }
  const candidateSourceIds = new Set([
    ...candidates.sources.map((source) => source.source_id),
    ...candidates.regions.flatMap((row) => normalizeSources(row.sources)),
    ...candidates.historical_periods.flatMap((row) => normalizeSources(row.sources)),
    ...candidates.season_rules.flatMap((row) => normalizeSources(row.sources)),
    ...candidates.political_contexts.flatMap((row) => normalizeSources(row.sources)),
    ...candidates.social_contexts.flatMap((row) => normalizeSources(row.sources))
  ].filter(Boolean));
  for (const source of outputSources) {
    const sourceId = typeof source === 'string' ? source : source.source_id ?? source.id ?? null;
    if (!sourceId) {
      concerns.push(makeConcern('HISTORICAL_FRAME_SOURCE_MISSING', 'Each source entry must include source_id.', { field: 'sources' }));
    } else if (candidateSourceIds.size > 0 && !candidateSourceIds.has(sourceId)) {
      concerns.push(makeConcern('HISTORICAL_FRAME_SOURCE_NOT_IN_CANDIDATES', 'Selected source_id must exist in available candidate sources.', { field: 'sources', value: sourceId }));
    }
  }
  return concerns;
}

function validateRecordStatuses(output, candidates, policy) {
  const concerns = [];
  const usedRecords = [];
  const regionId = output?.candidate_ids_used?.region_id;
  const periodId = output?.candidate_ids_used?.historical_period_id;
  const seasonRuleId = output?.candidate_ids_used?.season_rule_id;
  usedRecords.push(candidates.regions.find((row) => row.region_id === regionId));
  usedRecords.push(candidates.historical_periods.find((row) => row.period_id === periodId));
  usedRecords.push(candidates.season_rules.find((row) => row.season_rule_id === seasonRuleId));

  for (const record of usedRecords.filter(Boolean)) {
    const status = record.status ?? 'unknown';
    if (STAGE_3_REJECTED_RECORD_STATUSES.includes(status) && policy.reject_conflict_or_rejected !== false) {
      concerns.push(makeConcern('HISTORICAL_FRAME_REJECTED_SOURCE_USED', 'Selected frame uses conflict/rejected candidate record.', { value: status }));
    }
    if (status === 'draft' && policy.allow_draft !== true) {
      concerns.push(makeConcern('HISTORICAL_FRAME_DRAFT_RECORD_NOT_ALLOWED', 'Selected frame uses draft candidate while policy disallows it.', { value: status }));
    }
    if (status === 'needs_review' && policy.allow_needs_review !== true) {
      concerns.push(makeConcern('HISTORICAL_FRAME_NEEDS_REVIEW_RECORD_NOT_ALLOWED', 'Selected frame uses needs_review candidate while policy disallows it.', { value: status }));
    }
  }
  return concerns;
}

function validateContextBoundaries(output) {
  const concerns = [];
  const seasonalText = JSON.stringify(output?.seasonal_context ?? {});
  const politicalText = JSON.stringify(output?.political_context ?? {});
  const socialText = JSON.stringify(output?.social_context ?? {});
  if (WEATHER_CREATION_RE.test(seasonalText)) {
    concerns.push(makeConcern('HISTORICAL_FRAME_CREATED_WEATHER', 'seasonal_context must not create concrete weather or exact temperature.', { field: 'seasonal_context' }));
  }
  if (CONCRETE_EVENT_RE.test(politicalText)) {
    concerns.push(makeConcern('HISTORICAL_FRAME_CREATED_DOWNSTREAM_ENTITY', 'political_context must remain background constraints, not a concrete event/NPC.', { field: 'political_context' }));
  }
  if (PLAYER_STATUS_ASSIGNMENT_RE.test(socialText)) {
    concerns.push(makeConcern('HISTORICAL_FRAME_CREATED_CHARACTER_FACT', 'social_context must not assign the player a concrete status, debt, family or role.', { field: 'social_context' }));
  }
  return concerns;
}

function validateDownstreamConstraints(value = {}) {
  const concerns = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [makeConcern('HISTORICAL_FRAME_MISSING_DOWNSTREAM_CONSTRAINTS', 'downstream_constraints must be an object.', { field: 'downstream_constraints' })];
  }
  for (const field of ['must_preserve', 'must_not_create_yet', 'must_resolve_later']) {
    if (!Array.isArray(value[field])) {
      concerns.push(makeConcern('HISTORICAL_FRAME_MISSING_DOWNSTREAM_CONSTRAINTS', `downstream_constraints.${field} must be an array.`, { field: `downstream_constraints.${field}` }));
    }
  }
  const mustPreserve = new Set(value.must_preserve ?? []);
  for (const required of ['year', 'calendar.season', 'region.region_id', 'clock.hour', 'clock.minute', 'clock.time_of_day', 'clock.light_profile']) {
    if (!mustPreserve.has(required)) {
      concerns.push(makeConcern('HISTORICAL_FRAME_MISSING_DOWNSTREAM_CONSTRAINT', `downstream_constraints.must_preserve must include ${required}.`, { field: 'downstream_constraints.must_preserve' }));
    }
  }
  return concerns;
}

function validateAuditSelfReport(audit = {}) {
  const concerns = [];
  if (!audit || typeof audit !== 'object' || Array.isArray(audit)) {
    return [makeConcern('HISTORICAL_FRAME_MISSING_REQUIRED_FIELD', 'audit must be an object.', { field: 'audit' })];
  }
  if (!Array.isArray(audit.evidence) || audit.evidence.length === 0) {
    concerns.push(makeConcern('HISTORICAL_FRAME_EMPTY_AUDIT_EVIDENCE', 'audit.evidence must be non-empty.', { field: 'audit.evidence' }));
  }
  if (audit.pass === false && (!Array.isArray(audit.concerns) || audit.concerns.length === 0)) {
    concerns.push(makeConcern('HISTORICAL_FRAME_AUDIT_CONCERNS_EMPTY', 'audit.concerns must be non-empty when audit.pass=false.', { field: 'audit.concerns' }));
  }
  return concerns;
}

function validateForbiddenKeys(value, path = []) {
  const concerns = [];
  if (!value || typeof value !== 'object') return concerns;
  if (Array.isArray(value)) {
    value.forEach((item, index) => concerns.push(...validateForbiddenKeys(item, [...path, String(index)])));
    return concerns;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (FORBIDDEN_DOWNSTREAM_KEYS.includes(key)) {
      concerns.push(makeConcern(
        inferForbiddenCode(key),
        `Stage 3 must not create downstream entity field ${childPath.join('.')}.`,
        { field: childPath.join('.') }
      ));
    }
    concerns.push(...validateForbiddenKeys(child, childPath));
  }
  return concerns;
}

function inferForbiddenCode(key) {
  if (String(key).includes('npc')) return 'HISTORICAL_FRAME_CREATED_NPC';
  if (String(key).includes('item') || key === 'items' || key === 'inventory' || key === 'equipment') return 'HISTORICAL_FRAME_CREATED_ITEM';
  if (/location|place|g[1-5]|anchor|node|route|edge|position/u.test(String(key))) return 'HISTORICAL_FRAME_CREATED_LOCATION';
  if (/scene|prose/u.test(String(key))) return 'HISTORICAL_FRAME_CREATED_SCENE';
  return 'HISTORICAL_FRAME_CREATED_DOWNSTREAM_ENTITY';
}

function isYearInsidePeriod(year, period = {}) {
  const start = parseNullableInt(period.year_start);
  const end = parseNullableInt(period.year_end);
  if (Number.isInteger(start) && year < start) return false;
  if (Number.isInteger(end) && year > end) return false;
  return true;
}

function normalizeTimePolicy(row = {}) {
  return {
    ...row,
    time_of_day_policy_id: row.time_of_day_policy_id ?? row.id ?? `${row.time_of_day}:${row.hour_min}-${row.hour_max}:${row.light_profile}`,
    hour_min: Number(row.hour_min),
    hour_max: Number(row.hour_max)
  };
}

function buildCandidateSourceIndex(rows = []) {
  const sourceIds = new Set(rows.flatMap((row) => normalizeSources(row.sources)));
  return [...sourceIds].map((source_id) => ({ source_id }));
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') return item.source_id ?? item.id ?? null;
    return null;
  }).filter(Boolean);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTextArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [String(value)];
}

function parseNullableInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

async function many(db, sql, params) {
  const { rows } = await db.query(sql, params);
  return rows;
}

function makeConcern(code, message, extra = {}) {
  return { code, message, ...extra };
}
