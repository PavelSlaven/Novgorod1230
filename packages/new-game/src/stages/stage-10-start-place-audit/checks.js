import { FORBIDDEN_OUTPUT_KEYS } from './constants.js';
import { allowsIsolatedStart, block, chainIds, check, firstNumber, idOf, isG5Ready, isRestrictedSeasonClockRow, normalizeArray, parentIdOf, route, warn } from './shared.js';

export function validateNodeChain({ selectedScale, selectedNodeChain = {}, selectedNode, nodeById, policy }) {
  const concerns = [];
  const chain = selectedNodeChain ?? {};
  if (selectedScale === 'G1' && policy.allow_g1_fallback !== true) concerns.push(block('START_PLACE_G1_FINAL_NOT_ALLOWED', 'G1 is not allowed as final start place.'));
  if (selectedScale === 'G2' && policy.allow_g2_fallback !== true) concerns.push(block('START_PLACE_G2_FALLBACK_NOT_ALLOWED', 'G2 fallback is not allowed by audit policy.'));
  if (selectedScale === 'G3' && policy.allow_g3_fallback !== true) concerns.push(block('START_PLACE_G3_FALLBACK_NOT_ALLOWED', 'G3 fallback is not allowed by audit policy.'));
  const required = selectedScale === 'G4' ? ['g1_node_id', 'g2_node_id', 'g3_node_id', 'g4_node_id']
    : selectedScale === 'G3' ? ['g1_node_id', 'g2_node_id', 'g3_node_id']
      : selectedScale === 'G2' ? ['g1_node_id', 'g2_node_id']
        : selectedScale === 'G1' ? ['g1_node_id'] : [];
  for (const key of required) {
    if (!chain[key]) concerns.push(block('START_PLACE_PARENT_CHAIN_MISSING', `selected_node_chain.${key} is required for ${selectedScale}.`));
  }
  if (selectedScale === 'G3' && chain.g4_node_id != null) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G3 fallback must have g4_node_id=null.'));
  if (selectedScale === 'G2' && (chain.g3_node_id != null || chain.g4_node_id != null)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G2 fallback must have g3_node_id=null and g4_node_id=null.'));
  const g1 = nodeById.get(String(chain.g1_node_id));
  const g2 = nodeById.get(String(chain.g2_node_id));
  const g3 = nodeById.get(String(chain.g3_node_id));
  const g4 = nodeById.get(String(chain.g4_node_id));
  if (selectedScale === 'G4' && selectedNode && g4 && idOf(selectedNode) !== idOf(g4)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'selected_node_id must match selected_node_chain.g4_node_id for G4.'));
  if (selectedScale === 'G3' && selectedNode && g3 && idOf(selectedNode) !== idOf(g3)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'selected_node_id must match selected_node_chain.g3_node_id for G3.'));
  if (selectedScale === 'G2' && selectedNode && g2 && idOf(selectedNode) !== idOf(g2)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'selected_node_id must match selected_node_chain.g2_node_id for G2.'));
  if (g4 && g3 && parentIdOf(g4) !== idOf(g3)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G4 parent_node_id must equal G3 id.'));
  if (g3 && g2 && parentIdOf(g3) !== idOf(g2)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G3 parent_node_id must equal G2 id.'));
  if (g2 && g1 && parentIdOf(g2) !== idOf(g1)) concerns.push(block('START_PLACE_PARENT_CHAIN_BROKEN', 'G2 parent_node_id must equal G1 id.'));
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'node_chain', selected_scale_level: selectedScale, selected_node_chain: chain }]);
}

export function validateRegionCompatibility({ selectedNode, nodeById, selectedNodeChain = {}, frame, candidate, selectedLink }) {
  const concerns = [];
  const rows = [selectedNode, candidate, selectedLink, ...chainIds(selectedNodeChain).map((id) => nodeById.get(String(id))).filter(Boolean)];
  for (const row of rows) {
    const regionId = row?.region_id ?? row?.regionId ?? null;
    if (regionId && frame.region_id && regionId !== frame.region_id) concerns.push(block('START_PLACE_REGION_MISMATCH', `Selected start row belongs to ${regionId}, expected ${frame.region_id}.`));
  }
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'region_compatibility', region_id: frame.region_id }]);
}

export function validateYearCompatibility({ frame, rows }) {
  const concerns = [];
  const year = Number(frame.year);
  for (const row of rows) {
    const start = firstNumber(row, ['period_start_year', 'start_year', 'valid_from_year', 'year_start']);
    const end = firstNumber(row, ['period_end_year', 'end_year', 'valid_to_year', 'year_end']);
    if (Number.isFinite(start) && year < start) concerns.push(block('START_PLACE_YEAR_OUT_OF_RANGE', `Selected start is valid from ${start}, requested ${year}.`));
    if (Number.isFinite(end) && year > end) concerns.push(block('START_PLACE_YEAR_OUT_OF_RANGE', `Selected start is valid until ${end}, requested ${year}.`));
  }
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'year_compatibility', year }]);
}

export function validateSeasonCompatibility({ frame, rows }) {
  const concerns = [];
  const warnings = [];
  for (const row of rows) {
    const allowed = normalizeArray(row?.allowed_seasons ?? row?.season_profile?.allowed_seasons);
    const forbidden = normalizeArray(row?.forbidden_seasons ?? row?.season_profile?.forbidden_seasons);
    const restricted = isRestrictedSeasonClockRow(row);
    if (allowed.length > 0 && !allowed.includes(frame.season)) concerns.push(block('START_PLACE_SEASON_INCOMPATIBLE', `Season ${frame.season} is not allowed.`));
    if (forbidden.includes(frame.season)) concerns.push(block('START_PLACE_SEASON_INCOMPATIBLE', `Season ${frame.season} is forbidden.`));
    if (restricted && allowed.length === 0 && forbidden.length === 0) warnings.push(warn('START_PLACE_SEASON_CLOCK_EVIDENCE_MISSING', 'Restricted/seasonal place has no explicit season evidence.'));
  }
  return check(concerns.length > 0 ? 'fail' : warnings.length > 0 ? 'warning' : 'pass', [...concerns, ...warnings], [{ kind: 'season_compatibility', season: frame.season }]);
}

export function validateClockCompatibility({ frame, rows }) {
  const concerns = [];
  const warnings = [];
  const tod = frame.clock?.time_of_day;
  const light = frame.clock?.light_profile;
  for (const row of rows) {
    const allowedTod = normalizeArray(row?.allowed_time_of_day ?? row?.access_rhythm?.allowed_time_of_day);
    const forbiddenTod = normalizeArray(row?.forbidden_time_of_day ?? row?.access_rhythm?.forbidden_time_of_day);
    const requiredLight = normalizeArray(row?.light_profile_required ?? row?.required_light_profiles);
    const restricted = isRestrictedSeasonClockRow(row);
    if (allowedTod.length > 0 && !allowedTod.includes(tod)) concerns.push(block('START_PLACE_CLOCK_INCOMPATIBLE', `time_of_day ${tod} is not allowed.`));
    if (forbiddenTod.includes(tod)) concerns.push(block('START_PLACE_CLOCK_INCOMPATIBLE', `time_of_day ${tod} is forbidden.`));
    if (requiredLight.length > 0 && !requiredLight.includes(light)) concerns.push(block('START_PLACE_LIGHT_PROFILE_INCOMPATIBLE', `light_profile ${light} is not allowed.`));
    if (restricted && allowedTod.length === 0 && forbiddenTod.length === 0 && requiredLight.length === 0) warnings.push(warn('START_PLACE_SEASON_CLOCK_EVIDENCE_MISSING', 'Restricted/night-sensitive place has no explicit clock/light evidence.'));
  }
  return check(concerns.length > 0 ? 'fail' : warnings.length > 0 ? 'warning' : 'pass', [...concerns, ...warnings], [{ kind: 'clock_compatibility', clock: frame.clock }]);
}

export function validateAccessCompatibility({ edgeRows, rows, policy }) {
  const concerns = [];
  const isolatedAllowed = rows.some(allowsIsolatedStart);
  if (policy.require_access_edge === true && edgeRows.length === 0 && !isolatedAllowed) {
    concerns.push(block('START_PLACE_ACCESS_EDGE_MISSING', 'Selected node has no valid access edge and no explicit isolated/no-access start rule.'));
  }
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'access_edges', count: edgeRows.length, isolated_allowed: isolatedAllowed }]);
}

export function validatePlayerRequestCompatibility({ normalizedRequest, candidate, selectedLink }) {
  const violations = [
    ...normalizeArray(candidate?.hard_constraint_violations),
    ...normalizeArray(selectedLink?.hard_constraint_violations)
  ];
  if (violations.length > 0) return check('fail', [block('START_PLACE_PLAYER_HARD_CONSTRAINT_MISMATCH', 'Selected start violates player hard constraints.')], [{ kind: 'player_hard_constraint_violations', violations }]);
  const requestMatch = candidate?.request_match ?? selectedLink?.request_match ?? normalizedRequest?.request_match ?? null;
  if (['weak', 'low', 'mismatch'].includes(String(requestMatch).toLowerCase())) {
    return check('warning', [warn('START_PLACE_PLAYER_SOFT_PREFERENCE_WEAK_MATCH', 'Selected start weakly matches player soft preferences.')], [{ kind: 'player_request_match', request_match: requestMatch }]);
  }
  return check('pass', [], [{ kind: 'player_request_compatibility', request_match: requestMatch ?? 'neutral' }]);
}

export function validateSocialStatusCompatibility({ normalizedRequest, policy }) {
  const socialRequest = normalizedRequest?.social_status ?? normalizedRequest?.character?.social_status ?? normalizedRequest?.player_character?.social_status ?? null;
  if (!socialRequest) return check('pass', [], [{ kind: 'social_status_compatibility', status: 'not_requested' }]);
  if (policy.require_social_status_compatibility === true) return check('fail', [block('START_PLACE_SOCIAL_STATUS_COMPATIBILITY_REQUIRED', 'Social status compatibility is required but must be resolved by a later reason-aware stage.')], [{ kind: 'social_status_request', social_status: socialRequest }]);
  return check('warning', [warn('START_PLACE_SOCIAL_STATUS_REASON_REQUIRED_LATER', 'Player may be in an unexpected place; later stages must create an approved reason without changing Stage 10 place audit.')], [{ kind: 'social_status_request', social_status: socialRequest }]);
}

export function validateSupport({ kind, required, hasSupport, requiredCode, warningCode }) {
  if (hasSupport) return check('pass', [], [{ kind: `${kind}_support`, has_support: true }]);
  if (required) return check('fail', [block(requiredCode, `${kind} support is required but missing.`)], [{ kind: `${kind}_support`, has_support: false }]);
  return check('warning', [warn(warningCode, `${kind} support is weak or missing but policy does not require it.`)], [{ kind: `${kind}_support`, has_support: false }]);
}

export function validateG5Readiness({ candidate, selectedLink, placeTemplate, regionPlaceTemplate, policy }) {
  const ready = [candidate, selectedLink, placeTemplate, regionPlaceTemplate].some(isG5Ready);
  if (ready || policy.require_g5_readiness !== true) return check(ready ? 'pass' : 'warning', ready ? [] : [warn('START_PLACE_G5_READINESS_WEAK', 'G5 readiness is not proven but not required by policy.')], [{ kind: 'g5_readiness', ready }]);
  return check('fail', [block('START_PLACE_G5_READINESS_MISSING', 'G5 readiness is required but missing for selected start.')], [{ kind: 'g5_readiness', ready: false }]);
}

export function validateDownstreamEntityLeak(value) {
  const concerns = [];
  scanForbidden(value, '$', concerns);
  return check(concerns.length === 0 ? 'pass' : 'fail', concerns, [{ kind: 'downstream_entity_leak_scan', forbidden_keys: FORBIDDEN_OUTPUT_KEYS }]);
}

export function scanForbidden(value, path, concerns) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbidden(entry, `${path}[${index}]`, concerns));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_OUTPUT_KEYS.includes(key)) concerns.push(block('START_PLACE_DOWNSTREAM_ENTITY_LEAK', `Forbidden downstream entity field at ${path}.${key}.`));
    scanForbidden(nested, `${path}.${key}`, concerns);
  }
}

export function chooseRepairRoute(concerns = []) {
  const codes = new Set((concerns ?? []).map((item) => item.code));
  if (codes.has('START_PLACE_REGION_MISMATCH') || codes.has('START_PLACE_YEAR_OUT_OF_RANGE')) return route('historical_frame_selector', 'selected_start_historical_frame_mismatch');
  if ([...codes].some((code) => code.includes('TEMPLATE'))) return route('place_template_retriever', 'selected_start_place_template_invalid');
  if (codes.has('START_PLACE_NODE_NOT_FOUND') || codes.has('START_PLACE_PARENT_CHAIN_BROKEN') || codes.has('START_PLACE_ACCESS_EDGE_MISSING')) return route('start_candidate_retriever', 'selected_start_candidate_invalid');
  return route('start_node_selector', 'selected_start_node_reselect_required');
}
