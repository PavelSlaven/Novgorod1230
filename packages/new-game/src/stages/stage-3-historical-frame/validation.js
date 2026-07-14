import {
  STAGE_3_SELECTION_STATUSES,
  STAGE_3_SEASONS,
  STAGE_3_TIME_OF_DAY,
  STAGE_3_LIGHT_PROFILES,
  STAGE_3_REJECTED_RECORD_STATUSES,
  FORBIDDEN_DOWNSTREAM_KEYS,
  WEATHER_CREATION_RE,
  CONCRETE_EVENT_RE,
  PLAYER_STATUS_ASSIGNMENT_RE
} from './constants.js';
import { normalizeStage3CandidateSet } from './candidates.js';
import { buildStage3SelectionPolicy } from './policy.js';

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
    if (status !== 'approved') {
      concerns.push(makeConcern('HISTORICAL_FRAME_RECORD_NOT_APPROVED', 'Runtime historical frame may use approved candidate records only.', { value: status }));
    }
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

function makeConcern(code, message, extra = {}) {
  return { code, message, ...extra };
}
