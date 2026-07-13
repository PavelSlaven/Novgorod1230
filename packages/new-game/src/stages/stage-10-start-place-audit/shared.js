import { ALLOWED_REPAIR_STAGES, REQUIRED_CHECK_KEYS } from './constants.js';

export function route(returnToStage, repairKind) {
  return sanitizeRepairRoute({ return_to_stage: returnToStage, repair_kind: repairKind });
}

export function sanitizeRepairRoute(repairRoute) {
  const returnToStage = ALLOWED_REPAIR_STAGES.includes(repairRoute?.return_to_stage)
    ? repairRoute.return_to_stage
    : 'start_node_selector';
  return {
    return_to_stage: returnToStage,
    repair_kind: repairRoute?.repair_kind ?? 'start_place_audit_failed'
  };
}

export function isAllowedRepairRoute(repairRoute) {
  return !!repairRoute && ALLOWED_REPAIR_STAGES.includes(repairRoute.return_to_stage) && isNonEmptyString(repairRoute.repair_kind);
}

export function check(status, concerns = [], evidence = []) {
  return { status, pass: status !== 'fail', concerns, evidence };
}

export function emptyChecks() {
  return Object.fromEntries(REQUIRED_CHECK_KEYS.map((key) => [key, check('pending', [], [])]));
}

export function selectedStartShape(selected = {}) {
  return {
    selected_candidate_id: selected.selected_candidate_id ?? null,
    selected_candidate_place_template_link_id: selected.selected_candidate_place_template_link_id ?? null,
    selected_node_id: selected.selected_node_id ?? null,
    selected_scale_level: selected.selected_scale_level ?? null,
    selected_place_template_id: selected.selected_place_template_id ?? null
  };
}

export function requireSchema(concerns, value, schema, code) {
  if (!value || value.schema !== schema) concerns.push(block(code, `Expected schema ${schema}.`));
}

export function requireReady(concerns, value, code) {
  if (value?.selection_status !== 'ready') concerns.push(block(code, `Expected selection_status=ready for ${value?.schema ?? 'upstream output'}.`));
}

export function block(code, message, extra = {}) {
  return { code, severity: 'hard_block', message, ...extra };
}

export function warn(code, message, extra = {}) {
  return { code, severity: 'warning', message, ...extra };
}

export function frameFrom(historicalFrame = {}) {
  return {
    region_id: historicalFrame.region?.region_id ?? historicalFrame.region_id ?? historicalFrame.regionId ?? null,
    year: historicalFrame.year?.value ?? historicalFrame.year ?? null,
    season: historicalFrame.calendar?.season ?? historicalFrame.season ?? null,
    clock: historicalFrame.clock ?? {}
  };
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function candidateIdOf(candidate) {
  return candidate?.candidate_id ?? candidate?.id ?? candidate?.start_candidate_id ?? null;
}

export function linkIdOf(link) {
  return link?.candidate_place_template_link_id ?? link?.template_link_id ?? link?.link_id ?? link?.id ?? null;
}

export function linkCandidateIdOf(link) {
  return link?.candidate_id ?? link?.start_candidate_id ?? link?.selected_candidate_id ?? null;
}

export function linkPlaceTemplateIdOf(link) {
  return link?.place_template_id ?? link?.template_id ?? link?.selected_place_template_id ?? null;
}

export function knownCandidateNodeIds(candidate = {}) {
  return new Set(candidateNodeIds(candidate));
}

export function candidateNodeIds(candidate = {}) {
  return unique([
    candidate?.canonical_node?.node_id,
    candidate?.canonical_node?.id,
    candidate?.node_id,
    candidate?.graph_node_id,
    candidate?.start_node_id,
    candidate?.selected_node_id,
    candidate?.location_node_id,
    candidate?.g4_node_id,
    candidate?.g3_node_id,
    candidate?.g2_node_id,
    candidate?.g1_node_id,
    ...(candidate?.node_chain ? chainIds(candidate.node_chain) : []),
    ...(candidate?.parent_chain ? chainIds(candidate.parent_chain) : [])
  ]);
}

export function chainIds(chain = {}) {
  return unique([chain.g1_node_id, chain.g2_node_id, chain.g3_node_id, chain.g4_node_id]);
}

export function idOf(row = {}) {
  return row?.id ?? row?.node_id ?? null;
}

export function parentIdOf(row = {}) {
  return row?.parent_node_id ?? row?.parent_id ?? null;
}

export function firstNumber(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

export function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry != null).map(String);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export function isRestrictedSeasonClockRow(row = {}) {
  const text = JSON.stringify({
    type: row?.place_kind ?? row?.node_type ?? row?.access_rule ?? row?.limits ?? row?.seasonal_rule ?? row?.risk_level ?? row?.restriction_level ?? null
  }).toLowerCase();
  return ['restricted', 'seasonal', 'night', 'access', 'permission', 'controlled', 'flood', 'winter'].some((needle) => text.includes(needle));
}

export function allowsIsolatedStart(row = {}) {
  const value = row?.allow_isolated_start ?? row?.isolated_start_allowed ?? row?.no_access_start_allowed ?? row?.access_rule ?? row?.limits ?? null;
  if (value === true) return true;
  return typeof value === 'string' && /isolated|no-access|no_access|без доступа|изолирован/i.test(value);
}

export function isG5Ready(row = {}) {
  return row?.g5_ready === true || row?.g5_readiness === true || row?.g5_readiness?.ready === true || row?.can_materialize_g5 === true;
}

export function collectSourceIds(value, seen = new Set()) {
  const ids = [];
  if (value == null) return ids;
  if (typeof value === 'string') return [];
  if (typeof value !== 'object') return ids;
  if (seen.has(value)) return ids;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) ids.push(...collectSourceIds(entry, seen));
    return ids;
  }
  for (const key of ['source_id', 'sourceId']) {
    if (isNonEmptyString(value[key])) ids.push(value[key]);
  }
  for (const key of ['sources', 'source_ids', 'sourceIds']) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      for (const entry of nested) {
        if (isNonEmptyString(entry)) ids.push(entry);
        else ids.push(...collectSourceIds(entry, seen));
      }
    } else if (isNonEmptyString(nested)) {
      ids.push(nested);
    }
  }
  for (const key of ['source_trace', 'evidence']) ids.push(...collectSourceIds(value[key], seen));
  return ids;
}

export function unique(values) {
  return [...new Set((values ?? []).filter((value) => value != null && String(value).trim().length > 0).map(String))];
}

export function hasHardBlock(audit) {
  return (audit?.concerns ?? []).some((item) => item?.severity === 'hard_block')
    || Object.values(audit?.checks ?? {}).some((item) => item?.status === 'fail');
}

export function isMissingRelation(error) {
  const code = error?.code;
  const message = String(error?.message ?? '').toLowerCase();
  return code === '42P01' || message.includes('does not exist') || message.includes('not found') || message.includes('no such table') || message.includes('unsupported sql');
}

export function safeClone(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}
