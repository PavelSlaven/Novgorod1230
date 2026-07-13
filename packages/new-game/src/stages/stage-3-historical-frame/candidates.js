import { STAGE_3_SEASONS } from './constants.js';
import { buildStage3SelectionPolicy } from './policy.js';

export async function retrieveHistoricalFrameCandidates(input = {}, deps = {}) {
  const requestId = input.request_id ?? input.requestId ?? null;
  const policy = buildStage3SelectionPolicy(input.candidate_policy ?? input.selection_policy ?? {});
  const statuses = getAllowedStatuses(policy);
  const db = deps.queryable ?? deps.getQueryable?.(deps);
  if (!db || typeof db.query !== 'function') {
    const error = new Error('WORLD_BASE_QUERYABLE_MISSING');
    error.code = 'WORLD_BASE_QUERYABLE_MISSING';
    throw error;
  }

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

function getAllowedStatuses(policy = {}) {
  const statuses = ['approved'];
  if (policy.allow_usable_with_caution !== false) statuses.push('usable_with_caution');
  if (policy.allow_draft === true) statuses.push('draft');
  if (policy.allow_needs_review === true) statuses.push('needs_review');
  return [...new Set(statuses)];
}
