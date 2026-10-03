#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const REF = '/srv/novgorod-work/worktrees/ref-pr98';
const GAMEBASE = '/srv/novgorod-work/worktrees/ref-gamebase';
const BRIDGE = '/srv/novgorod-work/fleet/tasks/b4-f1-data';
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const readOut = n => readJson(path.join(OUT, n));
const readRef = p => readJson(path.join(REF, p));
const stable = x => JSON.stringify(stableValue(x));
function stableValue(x) {
  if (Array.isArray(x)) return x.map(stableValue);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, stableValue(x[k])]));
  return x;
}
const exactKeys = (o, keys) => o && typeof o === 'object' && !Array.isArray(o)
  && stable(Object.keys(o).sort()) === stable([...keys].sort());
const PROJECT = 'data/world-catalogs/novgorod/';
const TARGET_PATH = `${PROJECT}live-world-runtime-v17/target-runtime-profiles-approved.json`;
const START_PATH = `${PROJECT}live-world-runtime-v17/target-start-candidate.json`;
const FINITE_PATH = `${PROJECT}live-world-runtime-v17/m2c-finite-source-capability-candidate.json`;
const PROPERTY_PATH = `${PROJECT}m2c-items/property-context-candidate.json`;
const APPROVAL_PATH = `${PROJECT}m2c-sol-data-approval.json`;
const GAPS = ['F1_IGNITION_BINDING','F1_FUEL_BINDING','F1_WATER_POLICY','F1_INITIAL_FIRE','F1_PROPERTY_ACCESS','F1_POSITION_TOPOLOGY','F1_QUANTITY_MASS_DEPLETION'];
const EXPECTED_CONCEPTS = ['firesteel','striking_flint','tinder','kindling','fuelwood'];
const EXPECTED_ITEM_REFS = { firesteel:'it_hh_firesteel', striking_flint:'it_hh_flint', tinder:'it_hh_tinder', kindling:'it_hh_kindling', fuelwood:null };
const ROOT_KEYS = ['schema','profile_id','revision','status','approved','import_authorized','activation_authorized','target','provenance','scope_profiles','action_policy_candidate','existence_candidates','quantities_masses_and_depletion','property_access','water_and_extinguishing','initial_fire','position_topology','scope_policy','promotion_rule','upstream_source_design_authority','upstream_property_context_authority'];
const ITEM_KEYS = ['concept','candidate_catalog_ref','display_name','candidate_property','basis','source_refs','limits'];
const SCOPE_KEYS = ['scope_id','selector','status','gap_refs','upstream_source_design_refs','upstream_property_context_ref','upstream_property_context_ref_role'];
const GAP_ROW_KEYS = ['gap_id','scope_id','selector','field','reason','required_inputs','owner','blocks','status','known_upstream_design_refs','known_upstream_property_context_ref','known_upstream_property_context_ref_role','source_refs'];
const SOURCE_KEYS = ['id','path','lines','use','checkout','resolved_path'];
const SECTION_KEYS = {
  target: ['world_revision_id','source_profile_set','source_revision','scope_rule'],
  provenance: ['directness','confidence','historical_claim','authority','limits'],
  quantities_masses_and_depletion: ['status','quantity','mass','consumption_rule','gap_refs','reason','known_upstream_designs_are_target_stock'],
  property_access: ['status','owner_ref','holder_ref','controller_ref','access_policy_ref','gap_refs','rule','reason','known_policy_context_is_current_access'],
  water_and_extinguishing: ['status','water_source_ref','water_portion_ref','extinguishing_policy','qualitative_source_ref','qualitative_limit','gap_refs'],
  initial_fire: ['status','initial_fire_ref','embers_ref','gap_refs','reason'],
  position_topology: ['status','fire_position_ref','hearth_or_fire_site_ref','topology_refs','gap_refs','rule'],
  scope_policy: ['natural_material_candidates_are_stock','canonical_arrival_inherits_generated_stock_profile','cross_scope_transfer_allowed','fallback_policy'],
  upstream_source_design_authority: ['status','approval_ref','finite_source_candidate_ref','candidate_sha256','approved_scope','excluded_by_approval','interpretation'],
  upstream_property_context_authority: ['status','approval_ref','property_context_candidate_ref','candidate_sha256','interpretation']
};
const EXPECTED_CHECKOUTS = {
  'ref-pr98': { root: REF, commit: 'b3143fad851f67d24d1b9441e03ee0afef4bb658' },
  'ref-gamebase': { root: GAMEBASE, commit: '3ab1c890c1caee2c1247ee144bf66bd35de705ec' },
  'bridge': { root: BRIDGE, commit: null }
};
const sha256 = p => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const expectedScopeIds = Array.from({ length: 33 }, (_, i) => `f1_scope_${String(i + 1).padStart(2, '0')}`);
const projectSelector = a => {
  const selector = { g4_ref: a.g4_ref };
  for (const key of ['generation_template_ref','canonical_g5_ref','scene_template_ref']) if (a[key]) selector[key] = a[key];
  return selector;
};

function resolvePointer(root, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return { ok: false, values: [] };
  let values = [root];
  for (const raw of pointer.slice(1).split('/')) {
    const token = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    const next = [];
    for (const value of values) {
      if (token === '*') {
        if (!Array.isArray(value) || value.length === 0) return { ok: false, values: [] };
        next.push(...value);
      } else if (value != null && typeof value === 'object' && Object.hasOwn(value, token)) next.push(value[token]);
      else return { ok: false, values: [] };
    }
    values = next;
  }
  return { ok: values.length > 0, values };
}
function checkSourceRanges(sourceMap) {
  const errors = [];
  const mapKeys = ['schema','target_world_revision_id','sources','candidate_value_provenance','checkouts','typed_gap_value_provenance','target_f1_gaps'];
  if (!exactKeys(sourceMap, mapKeys)) errors.push('source map has unknown or missing root fields');
  const checkoutIds = Object.keys(sourceMap.checkouts || {}).sort();
  if (stable(checkoutIds) !== stable(Object.keys(EXPECTED_CHECKOUTS).sort())) errors.push('source map checkout set mismatch');
  for (const [id, pin] of Object.entries(EXPECTED_CHECKOUTS)) {
    const actual = sourceMap.checkouts?.[id];
    if (!exactKeys(actual, ['root','commit']) || actual.root !== pin.root || actual.commit !== pin.commit) errors.push(`checkout pin ${id} mismatch`);
  }
  const ids = new Set();
  for (const source of sourceMap.sources || []) {
    if (!exactKeys(source, SOURCE_KEYS)) { errors.push(`source ${source.id || '?'} has unknown/missing source record keys`); continue; }
    if (ids.has(source.id)) errors.push(`duplicate source id ${source.id}`);
    ids.add(source.id);
    const checkout = sourceMap.checkouts?.[source.checkout];
    const pinned = EXPECTED_CHECKOUTS[source.checkout];
    if (!checkout || !pinned || checkout.root !== pinned.root || checkout.commit !== pinned.commit) errors.push(`source ${source.id}: checkout/revision pin mismatch`);
    const expectedPath = path.isAbsolute(source.path) ? source.path : path.join(checkout?.root || '', source.path);
    const relativeToCheckout = checkout ? path.relative(checkout.root, expectedPath) : '..';
    if (relativeToCheckout === '..' || relativeToCheckout.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToCheckout)) errors.push(`source ${source.id}: path escapes declared checkout`);
    if (source.resolved_path !== expectedPath || !fs.existsSync(expectedPath)) { errors.push(`source ${source.id}: unresolved checkout path`); continue; }
    const lines = fs.readFileSync(expectedPath, 'utf8').split(/\r?\n/);
    let parsed = 0;
    for (const part of String(source.lines || '').split(',')) {
      const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
      if (!m) { errors.push(`source ${source.id}: invalid line range ${part}`); continue; }
      const first = Number(m[1]), last = Number(m[2] || m[1]);
      if (first < 1 || last < first || last > lines.length) errors.push(`source ${source.id}: range ${part} outside file line bounds`);
      else if (!lines.slice(first - 1, last).some(line => line.trim())) errors.push(`source ${source.id}: range ${part} has no nonblank evidence`);
      else parsed++;
    }
    if (!parsed || !source.use.trim()) errors.push(`source ${source.id}: missing valid range/use`);
  }
  return { errors, ids };
}
function parseRanges(text) {
  return String(text || '').split(',').map(part => {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    return m ? [Number(m[1]), Number(m[2] || m[1])] : null;
  }).filter(Boolean);
}
function sourceRangeContains(sourceMap, sourceId, needle, sectionRange = null) {
  const source = sourceMap.sources.find(s => s.id === sourceId);
  if (!source) return false;
  const file = source.resolved_path;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const ranges = parseRanges(source.lines);
  return lines.some((line, i) => {
    const n = i + 1;
    const inSourceRange = ranges.some(([a, b]) => n >= a && n <= b);
    const inSection = !sectionRange || n >= sectionRange[0] && n <= sectionRange[1];
    return inSourceRange && inSection && line.includes(needle);
  });
}
function errors(candidate, sourceMap, gaps, refs) {
  const out = [], add = x => out.push(x);
  const badKeys = (obj, allowed, label) => { if (!exactKeys(obj, allowed)) add(`${label}: unknown or missing fields`); };
  badKeys(candidate, ROOT_KEYS, 'candidate');
  for (const [key, keys] of Object.entries(SECTION_KEYS)) badKeys(candidate[key], keys, key);
  if (candidate.schema !== 'rus.live_world_runtime.local_fire_profile_authoring_candidate.v1') add('wrong candidate schema');
  if (sourceMap.schema !== 'rus.live_world_runtime.f1_source_map.v1') add('wrong source map schema');
  if (gaps.schema !== 'rus.live_world_runtime.f1_typed_gaps.v1') add('wrong typed gaps schema');
  if (candidate.status !== 'candidate_unapproved' || candidate.approved !== false || candidate.import_authorized !== false || candidate.activation_authorized !== false) add('candidate must remain unapproved and inactive');
  if (!candidate.target || candidate.target.world_revision_id !== refs.target.target.world_revision_id || candidate.target.source_revision !== refs.target.version) add('target revision does not match approved target');
  if (candidate.target?.scope_rule !== 'Exact target G4 plus one exact generated G5 template or canonical G5 + scene template selector copied from target applicability; no scope widening.') add('unexpected target scope rule');
  if (!refs.target.capability_gaps?.some(g => g.code === 'M2C_TARGET_F1_SOURCE_BINDING_DATA_GAP' && g.scope === 'all33_authored_scopes' && g.profile === null)) add('approved target F1 source gap authority missing');
  if (gaps.target_world_revision_id !== refs.target.target.world_revision_id || sourceMap.target_world_revision_id !== refs.target.target.world_revision_id) add('target world revision mismatch across package');
  if (candidate.scope_profiles.length !== 33 || gaps.scope_coverage.length !== 33) add('expected exact 33-scope coverage');
  const ids = candidate.scope_profiles.map(s => s.scope_id);
  if (stable([...ids].sort()) !== stable([...expectedScopeIds].sort()) || new Set(ids).size !== expectedScopeIds.length) add('scope ids do not equal f1_scope_01..33 exactly');

  const allowedSelectors = refs.target.applicability.map(projectSelector);
  const approvedSelectorKeys = allowedSelectors.map(stable);
  const candidateSelectorKeys = candidate.scope_profiles.map(scope => stable(scope.selector));
  if (approvedSelectorKeys.length !== 33 || new Set(approvedSelectorKeys).size !== 33
      || candidateSelectorKeys.length !== 33 || new Set(candidateSelectorKeys).size !== 33
      || stable([...candidateSelectorKeys].sort()) !== stable([...approvedSelectorKeys].sort())) {
    add('scope selectors are not the exact unique approved applicability set');
  }
  const profileById = new Map(candidate.scope_profiles.map(s => [s.scope_id, s]));
  for (const scope of candidate.scope_profiles) {
    badKeys(scope, SCOPE_KEYS, `${scope.scope_id} scope`);
    const selector = scope.selector;
    if (scope.status !== 'typed_gap') add(`${scope.scope_id}: scope status must remain typed_gap`);
    const generated = !!selector?.generation_template_ref && !selector?.canonical_g5_ref && !selector?.scene_template_ref;
    const canonical = !selector?.generation_template_ref && !!selector?.canonical_g5_ref && !!selector?.scene_template_ref;
    const refsValid = [selector?.g4_ref, selector?.generation_template_ref, selector?.canonical_g5_ref, selector?.scene_template_ref].filter(Boolean).every(r => exactKeys(r, ['id','version']) && typeof r.id === 'string' && r.id.length > 0 && r.version === 1);
    if (!refsValid || !(generated || canonical) || !allowedSelectors.some(x => stable(x) === stable(selector))) add(`${scope.scope_id}: selector is not an exact approved target selector`);
    const canonicalPropertyRole = 'informational_g4_pointer_only_not_canonical_binding_or_current_access';
    const generatedPropertyRole = 'g4_policy_context_candidate_not_current_access';
    if (scope.scope_id === 'f1_scope_33') {
      if (!canonical || scope.upstream_property_context_ref_role !== canonicalPropertyRole) add('f1_scope_33: G4 property-context pointer must be explicitly informational only');
    } else if (scope.upstream_property_context_ref_role !== generatedPropertyRole) add(`${scope.scope_id}: G4 property-context role missing or invalid`);
    if (stable([...scope.gap_refs].sort()) !== stable([...GAPS].sort()) || new Set(scope.gap_refs).size !== GAPS.length) add(`${scope.scope_id}: gap refs do not equal seven required ids`);
  }
  if (candidate.existence_candidates.length !== EXPECTED_CONCEPTS.length || stable(candidate.existence_candidates.map(x => x.concept).sort()) !== stable([...EXPECTED_CONCEPTS].sort())) add('candidate concepts do not equal the five sourced type candidates');
  for (const item of candidate.existence_candidates) {
    badKeys(item, ITEM_KEYS, `${item.concept || '?'} item candidate`);
    if (!item.basis?.trim() || !Array.isArray(item.source_refs) || item.source_refs.length === 0) add(`${item.concept || '?'}: missing basis or source_refs`);
    if (!['sourced_type_plus_logical_necessity_for_spark_source','logical_necessity_candidate','sourced_process_compatibility_plus_logical_necessity'].includes(item.basis)) add(`${item.concept || '?'}: unsupported basis`);
    if (item.source_refs.some(id => !sourceMap.sources.some(s => s.id === id))) add(`${item.concept || '?'}: unresolved item source ref`);
    if (item.candidate_catalog_ref !== EXPECTED_ITEM_REFS[item.concept]) add(`${item.concept || '?'}: candidate catalog ref mismatch`);
  }
  const action = candidate.action_policy_candidate;
  badKeys(action, ['fire_is_basic_action','basis','source_ref','actions','action_meaning','provenance','actions_basis','action_refs','player_attempt_policy','authority_gap_policy','fallback_policy'], 'action policy');
  if (action.fire_is_basic_action !== true || action.basis !== 'owner_decision' || action.source_ref !== 'TASK.md § Решения владельца') add('basic fire action owner decision missing');
  if (stable(action.action_refs) !== stable(['start','add_fuel','extinguish']) || !action.actions_basis?.trim()) add('action labels or derivation changed');
  if (!action.player_attempt_policy?.includes('freely attempt') || !action.authority_gap_policy?.includes('No semantic fallback') || action.fallback_policy !== 'forbidden_for_authority_substitution_only') add('action attempt/authority fallback boundary invalid');
  if (candidate.scope_policy.fallback_policy !== 'forbidden_for_authority_substitution_only' || candidate.scope_policy.natural_material_candidates_are_stock !== false || candidate.scope_policy.canonical_arrival_inherits_generated_stock_profile !== false || candidate.scope_policy.cross_scope_transfer_allowed !== false) add('scope policy must block inferred stock/cross-scope substitution only');
  const gapSections = ['quantities_masses_and_depletion','property_access','water_and_extinguishing','initial_fire','position_topology'];
  for (const key of gapSections) if (!candidate[key] || candidate[key].status !== 'typed_gap') add(`${key}: must remain typed_gap`);
  if (candidate.quantities_masses_and_depletion.quantity !== null || candidate.quantities_masses_and_depletion.mass !== null || candidate.quantities_masses_and_depletion.consumption_rule !== null) add('target quantity/mass/depletion must remain unresolved');
  if (candidate.quantities_masses_and_depletion.known_upstream_designs_are_target_stock !== false) add('upstream design must not be treated as target stock');
  if (candidate.property_access.owner_ref !== null || candidate.property_access.holder_ref !== null || candidate.property_access.controller_ref !== null || candidate.property_access.access_policy_ref !== null || candidate.property_access.known_policy_context_is_current_access !== false) add('current property/access refs must remain unresolved');
  if (candidate.water_and_extinguishing.water_source_ref !== null || candidate.water_and_extinguishing.water_portion_ref !== null || candidate.water_and_extinguishing.extinguishing_policy !== null) add('target water binding must remain unresolved');
  if (candidate.initial_fire.initial_fire_ref !== null || candidate.initial_fire.embers_ref !== null) add('initial fire refs must remain unresolved');
  if (candidate.position_topology.fire_position_ref !== null || candidate.position_topology.hearth_or_fire_site_ref !== null || candidate.position_topology.topology_refs.length !== 0) add('target fire position/topology must remain unresolved');

  const approval = refs.approval;
  const finitePin = approval.finite_source_capability_candidate_approval?.candidate_sha256;
  const propPin = approval.approved_exact_candidates?.property_context_sha256;
  if (approval.decision !== 'APPROVE_DATA_ONLY' || sha256(path.join(REF, FINITE_PATH)) !== finitePin || sha256(path.join(REF, PROPERTY_PATH)) !== propPin) add('upstream source candidate SHA/approval pin mismatch');
  if (candidate.upstream_source_design_authority?.candidate_sha256 !== finitePin || candidate.upstream_source_design_authority?.status !== 'upstream_authoring_designs_approved_data_only' || stable(candidate.upstream_source_design_authority?.excluded_by_approval) !== stable(['current resource nodes','current quantities','property decisions','mapped import','runtime use','release activation'])) add('upstream source design approval boundary missing');
  if (candidate.upstream_property_context_authority?.candidate_sha256 !== propPin || candidate.upstream_property_context_authority?.status !== 'upstream_property_authoring_approved_data_only' || !candidate.upstream_property_context_authority?.interpretation?.includes('current owner decision')) add('upstream property context approval boundary missing');
  const finiteJoin = new Map();
  for (const row of refs.finite.applicability || []) {
    const sourceRefs = row.finite_source_capability_profile_refs || [];
    if (sourceRefs.length) finiteJoin.set(`${row.g4_ref.id}\0${row.generation_template_ref.id}`, sourceRefs);
  }
  const propertyByG4 = new Map((refs.property.g4_bindings || []).map(row => [row.g4_id, row.profile_id]));
  const expectedRefsByScope = new Map();
  for (const scope of candidate.scope_profiles) {
    const sel = scope.selector;
    const expectedDesigns = sel.generation_template_ref ? finiteJoin.get(`${sel.g4_ref.id}\0${sel.generation_template_ref.id}`) || [] : [];
    const expectedProperty = propertyByG4.get(sel.g4_ref.id) || null;
    expectedRefsByScope.set(scope.scope_id, expectedDesigns);
    if (stable(scope.upstream_source_design_refs) !== stable(expectedDesigns) || scope.upstream_property_context_ref !== expectedProperty) add(`${scope.scope_id}: upstream source/property context does not match exact G4+family input`);
  }

  const gapTypes = gaps.gap_types.map(x => x.gap_id);
  if (gaps.schema !== 'rus.live_world_runtime.f1_typed_gaps.v1' || gaps.source_gap_code !== 'M2C_TARGET_F1_SOURCE_BINDING_DATA_GAP' || gaps.scope_count !== 33 || gaps.gap_type_count !== GAPS.length || gaps.gap_count !== 231) add('typed gaps header mismatch');
  if (stable([...gapTypes].sort()) !== stable([...GAPS].sort()) || new Set(gapTypes).size !== GAPS.length) add('gap type declaration mismatch');
  const expectedPairs = new Set(expectedScopeIds.flatMap(scope => GAPS.map(gap => `${scope}\0${gap}`)));
  const actualPairs = gaps.gaps.map(gap => `${gap.scope_id}\0${gap.gap_id}`);
  if (actualPairs.length !== 231 || new Set(actualPairs).size !== 231 || stable([...new Set(actualPairs)].sort()) !== stable([...expectedPairs].sort())) add('scope-gap pairs are not the exact 33x7 product');
  const coverageIds = gaps.scope_coverage.map(s => s.scope_id);
  if (new Set(coverageIds).size !== 33 || stable([...coverageIds].sort()) !== stable([...expectedScopeIds].sort())) add('gap scope coverage ids mismatch');
  for (const row of gaps.scope_coverage) {
    const candidateScope = profileById.get(row.scope_id);
    if (!candidateScope || row.status !== 'incomplete' || stable(row.selector) !== stable(candidateScope.selector) || stable([...row.gap_refs].sort()) !== stable([...GAPS].sort()) || stable(row.upstream_design_refs) !== stable(candidateScope.upstream_source_design_refs) || row.upstream_property_context_ref !== candidateScope.upstream_property_context_ref || row.upstream_property_context_ref_role !== candidateScope.upstream_property_context_ref_role) add(`${row.scope_id}: gap coverage selector/refs do not match candidate`);
  }
  const typeField = new Map(gaps.gap_types.map(x => [x.gap_id, x.field]));
  for (const type of gaps.gap_types) badKeys(type, ['gap_id','field'], 'gap type');
  for (const row of gaps.gaps) {
    const candidateScope = profileById.get(row.scope_id);
    const upstream = expectedRefsByScope.get(row.scope_id) || [];
    badKeys(row, GAP_ROW_KEYS, `${row.scope_id}/${row.gap_id} gap row`);
    if (!candidateScope || stable(row.selector) !== stable(candidateScope.selector) || stable(row.known_upstream_design_refs) !== stable(upstream) || row.known_upstream_property_context_ref !== candidateScope?.upstream_property_context_ref || row.known_upstream_property_context_ref_role !== candidateScope?.upstream_property_context_ref_role) add(`${row.scope_id}/${row.gap_id}: gap selector/upstream refs mismatch`);
    if (typeField.get(row.gap_id) !== row.field || row.status !== 'open' || !row.reason?.trim() || !row.owner?.trim() || !Array.isArray(row.required_inputs) || row.required_inputs.length === 0) add(`${row.scope_id}/${row.gap_id}: incomplete/mistyped gap`);
    if (row.gap_id === 'F1_FUEL_BINDING' && upstream.length && !row.reason.includes('data-only approval excludes a committed/current resource node')) add(`${row.scope_id}: fuel gap fails to distinguish approved upstream design from current node`);
    if (row.gap_id === 'F1_QUANTITY_MASS_DEPLETION' && upstream.length && !row.reason.includes('approval excludes current node quantities')) add(`${row.scope_id}: quantity gap is too broad for known upstream design`);
    if (row.gap_id === 'F1_QUANTITY_MASS_DEPLETION' && !upstream.length && !row.reason.includes('No matching upstream finite-source design')) add(`${row.scope_id}: quantity gap does not state scoped absence of upstream design`);
    if (row.gap_id === 'F1_PROPERTY_ACCESS' && row.known_upstream_property_context_ref && !row.reason.includes('data-only approval excludes current property decisions')) add(`${row.scope_id}: property gap does not distinguish upstream context from current access`);
    if (row.source_refs.some(id => !sourceMap.sources.some(s => s.id === id))) add(`${row.scope_id}/${row.gap_id}: unresolved source ref`);
  }

  const sourceCheck = checkSourceRanges(sourceMap);
  for (const e of sourceCheck.errors) add(e);
  const sourceIds = sourceCheck.ids;
  if (sourceMap.sources.length !== 24) add('source map must contain 24 exact source records');
  const requiredSourceIds = ['SRC_TARGET_PROFILE','SRC_TARGET_START','SRC_GB_HOUSEHOLD_54','SRC_GB_HOUSEHOLD_55','SRC_GB_HOUSEHOLD_56','SRC_GB_HOUSEHOLD_57','SRC_WK_FIRESTEEL_89_97','SRC_WK_FIRESTEEL_CLAIM_474_511','SRC_DRAFT_ITEM_TYPES_453_486','SRC_NATURAL_MATERIALS_10','SRC_GB_NATURAL_MATERIALS_15_17','SRC_WK_COMBUSTION_58','SRC_WK_FUEL_PROCESS_8_20','SRC_WK_WATER_EXTINGUISHING_114_125','SRC_LD_PROFILE','SRC_HOUSEHOLD_KINDLING','SRC_TASK_DECISION','SRC_M2C_FINITE_SOURCE','SRC_M2C_PROPERTY_CONTEXT','SRC_M2C_SOL_DATA_APPROVAL','SRC_WR_FALLBACK','SRC_AI_AUTHORITY','SRC_PLAYER_ATTEMPT','SRC_LOCAL_FIRE_MECHANICS'];
  for (const id of requiredSourceIds) if (!sourceIds.has(id)) add(`missing required source ${id}`);
  const srcTarget = sourceMap.sources.find(s => s.id === 'SRC_TARGET_PROFILE');
  if (!srcTarget?.lines) add('target source source-range mapping is missing');
  const srcProperty = sourceMap.sources.find(s => s.id === 'SRC_M2C_PROPERTY_CONTEXT');
  if (!srcProperty || !parseRanges(srcProperty.lines).some(([a,b]) => a <= 105 && b >= 115)
      || !sourceRangeContains(sourceMap, 'SRC_M2C_PROPERTY_CONTEXT', '"valid_only_for_new_generated_scopes": true', [105,115])
      || !sourceRangeContains(sourceMap, 'SRC_M2C_PROPERTY_CONTEXT', '"canonical G5"', [105,115])) add('property-context source range omits generated-only/canonical-exclusion completeness at lines 105-115');
  for (const applicability of refs.target.applicability) {
    const selector = projectSelector(applicability);
    for (const ref of Object.values(selector)) {
      if (ref && typeof ref === 'object' && typeof ref.id === 'string' && !sourceRangeContains(sourceMap, 'SRC_TARGET_PROFILE', `"id": "${ref.id}"`, [60, 1262])) add(`target source range does not cover exact selector ref ${ref.id}`);
    }
  }
  for (const scope of candidate.scope_profiles) for (const id of scope.upstream_source_design_refs) {
    if (!sourceRangeContains(sourceMap, 'SRC_M2C_FINITE_SOURCE', `"profile_id": "${id}"`)) add(`finite-source record range does not cover design ${id}`);
  }
  for (const scope of candidate.scope_profiles) if (scope.upstream_property_context_ref && !sourceRangeContains(sourceMap, 'SRC_M2C_PROPERTY_CONTEXT', `"g4_id": "${scope.selector.g4_ref.id}"`)) add(`${scope.scope_id}: property-context source range does not cover its exact G4 binding`);
  if (!sourceRangeContains(sourceMap, 'SRC_M2C_SOL_DATA_APPROVAL', `"candidate_sha256": "${finitePin}"`) || !sourceRangeContains(sourceMap, 'SRC_M2C_SOL_DATA_APPROVAL', `"property_context_sha256": "${propPin}"`)) add('source-map approval ranges do not include exact candidate SHA pins');
  if (!sourceIds.has('SRC_WK_COMBUSTION_58')) add('combustion evidence source missing');

  const expectedCandidatePointers = [
    '/action_policy_candidate/fire_is_basic_action','/action_policy_candidate/actions','/action_policy_candidate/actions_basis','/action_policy_candidate/player_attempt_policy','/action_policy_candidate/authority_gap_policy','/action_policy_candidate/fallback_policy',
    '/existence_candidates/0','/existence_candidates/1','/existence_candidates/2','/existence_candidates/3','/existence_candidates/4','/existence_candidates/4/limits','/existence_candidates/4/candidate_property',
    '/scope_profiles/*/selector','/scope_profiles/*/upstream_source_design_refs','/scope_profiles/*/upstream_property_context_ref','/scope_profiles/*/upstream_property_context_ref_role',
    '/upstream_source_design_authority','/upstream_property_context_authority','/quantities_masses_and_depletion/reason','/quantities_masses_and_depletion/known_upstream_designs_are_target_stock',
    '/scope_policy/natural_material_candidates_are_stock','/scope_policy/canonical_arrival_inherits_generated_stock_profile','/scope_policy/cross_scope_transfer_allowed','/scope_policy/fallback_policy'
  ];
  for (const pointer of expectedCandidatePointers) if (!Object.hasOwn(sourceMap.candidate_value_provenance, pointer)) add(`missing provenance mapping ${pointer}`);
  for (const [pointer, provenance] of Object.entries(sourceMap.candidate_value_provenance || {})) {
    if (pointer.includes('*') && !['/scope_profiles/*/selector','/scope_profiles/*/upstream_source_design_refs','/scope_profiles/*/upstream_property_context_ref','/scope_profiles/*/upstream_property_context_ref_role'].includes(pointer)) add(`unsupported provenance wildcard ${pointer}`);
    if (!resolvePointer(candidate, pointer).ok) add(`unresolved provenance pointer ${pointer}`);
    const tokens = String(provenance).match(/SRC_[A-Z0-9_]+/g) || [];
    if (!tokens.length || tokens.some(id => !sourceIds.has(id))) add(`${pointer}: missing/unknown provenance source id`);
  }
  for (const [pointer, provenance] of Object.entries(sourceMap.typed_gap_value_provenance || {})) {
    if (pointer.includes('*') && !['/scope_coverage/*/selector','/scope_coverage/*/upstream_design_refs','/scope_coverage/*/upstream_property_context_ref','/scope_coverage/*/upstream_property_context_ref_role','/gaps/*/selector','/gaps/*/reason','/gaps/*/known_upstream_design_refs','/gaps/*/known_upstream_property_context_ref','/gaps/*/known_upstream_property_context_ref_role','/gaps/*/source_refs'].includes(pointer)) add(`unsupported gap provenance wildcard ${pointer}`);
    if (!resolvePointer(gaps, pointer).ok) add(`unresolved typed-gap provenance pointer ${pointer}`);
    const tokens = String(provenance).match(/SRC_[A-Z0-9_]+/g) || [];
    if (!tokens.length || tokens.some(id => !sourceIds.has(id))) add(`${pointer}: missing/unknown gap provenance source id`);
  }
  const requiredGapPointers = ['/scope_coverage/*/selector','/scope_coverage/*/upstream_design_refs','/scope_coverage/*/upstream_property_context_ref','/gaps/*/selector','/gaps/*/reason','/gaps/*/known_upstream_design_refs','/gaps/*/known_upstream_property_context_ref','/gaps/*/source_refs'];
  requiredGapPointers.push('/scope_coverage/*/upstream_property_context_ref_role','/gaps/*/known_upstream_property_context_ref_role');
  for (const pointer of requiredGapPointers) if (!Object.hasOwn(sourceMap.typed_gap_value_provenance, pointer)) add(`missing gap provenance mapping ${pointer}`);

  // Exact allow-lists ensure unknown numeric/approval fields cannot enter physical F1 data.
  const allowedNumeric = p => p === '/revision' || p === '/target/source_revision' || /^\/scope_profiles\/\d+\/selector\/(g4_ref|generation_template_ref|canonical_g5_ref|scene_template_ref)\/version$/.test(p);
  function numericWalk(value, pointer = '') {
    if (Array.isArray(value)) value.forEach((x, i) => numericWalk(x, `${pointer}/${i}`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) numericWalk(v, `${pointer}/${k}`);
    else if (typeof value === 'number' && !allowedNumeric(pointer)) add(`unapproved numeric candidate leaf ${pointer}`);
  }
  numericWalk(candidate);
  const forbiddenFlag = /^(approved|import_authorized|activation_authorized|runtime_active|production_activation)$/;
  function flagWalk(value, pointer = '') {
    if (Array.isArray(value)) value.forEach((x, i) => flagWalk(x, `${pointer}/${i}`));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
      if (forbiddenFlag.test(k) && pointer !== '' && !(pointer === '' && ['approved','import_authorized','activation_authorized'].includes(k))) add(`nested approval/activation flag ${pointer}/${k}`);
      flagWalk(v, `${pointer}/${k}`);
    }
  }
  flagWalk(candidate);
  return out;
}
function loadAll() {
  const candidate = readOut('f1-v17-candidate.json'), sourceMap = readOut('f1-source-map.json'), gaps = readOut('f1-typed-gaps.json');
  const refs = { target: readRef(TARGET_PATH), finite: readRef(FINITE_PATH), property: readRef(PROPERTY_PATH), approval: readRef(APPROVAL_PATH) };
  return [candidate, sourceMap, gaps, refs];
}
function check() {
  const e = errors(...loadAll());
  if (e.length) { console.error(e.map(x => `- ${x}`).join('\n')); process.exitCode = 1; }
  else console.log('PASS: exact target selectors, 33x7 coverage, scoped upstream designs, source pins/ranges, provenance pointers, physical-field limits and non-approval flags');
}
function selfTest() {
  const baseline = loadAll();
  assert.deepEqual(errors(...baseline), [], 'positive baseline must pass');
  const expectMutation = (label, mutate, pattern, preserve = true) => {
    const [c, s, g, r] = structuredClone(baseline);
    mutate(c, s, g, r);
    if (preserve) {
      assert.equal(c.scope_profiles.length, 33, `${label}: scope cardinality changed`);
      assert.equal(g.gaps.length, 231, `${label}: gap cardinality changed`);
      assert.equal(c.status, 'candidate_unapproved', `${label}: candidate status changed`);
      assert.equal(c.approved, false, `${label}: approval status changed`);
    }
    const result = errors(c, s, g, r);
    assert(result.some(x => pattern.test(x)), `${label}: expected diagnostic ${pattern}; received ${result.join('; ')}`);
  };
  expectMutation('missing provenance path', (_c, sm) => { delete sm.candidate_value_provenance['/existence_candidates/0']; }, /missing provenance mapping/);
  expectMutation('missing provenance source id', c => { c.existence_candidates[0].source_refs.push('SRC_NOT_REAL'); }, /unresolved item source ref/);
  expectMutation('nonempty fake G4 id', c => { c.scope_profiles[0].selector.g4_ref.id = 'g4_fake_but_nonempty'; }, /not an exact approved target selector/);
  expectMutation('synchronized approved-selector substitution', (c, _sm, g) => {
    const first = c.scope_profiles.find(x => x.scope_id === 'f1_scope_01');
    const second = c.scope_profiles.find(x => x.scope_id === 'f1_scope_02');
    first.selector = structuredClone(second.selector);
    first.upstream_source_design_refs = structuredClone(second.upstream_source_design_refs);
    first.upstream_property_context_ref = second.upstream_property_context_ref;
    first.upstream_property_context_ref_role = second.upstream_property_context_ref_role;
    const coverage = g.scope_coverage.find(x => x.scope_id === first.scope_id);
    coverage.selector = structuredClone(second.selector);
    coverage.upstream_design_refs = structuredClone(second.upstream_source_design_refs);
    coverage.upstream_property_context_ref = second.upstream_property_context_ref;
    coverage.upstream_property_context_ref_role = second.upstream_property_context_ref_role;
    for (const row of g.gaps.filter(x => x.scope_id === first.scope_id)) {
      row.selector = structuredClone(second.selector);
      row.known_upstream_design_refs = structuredClone(second.upstream_source_design_refs);
      row.known_upstream_property_context_ref = second.upstream_property_context_ref;
      row.known_upstream_property_context_ref_role = second.upstream_property_context_ref_role;
    }
  }, /scope selectors are not the exact unique approved applicability set/);
  expectMutation('canonical property pointer role erased', c => {
    delete c.scope_profiles.find(x => x.scope_id === 'f1_scope_33').upstream_property_context_ref_role;
  }, /G4 property-context pointer must be explicitly informational only/);
  expectMutation('duplicate scope id', c => { c.scope_profiles[1].scope_id = c.scope_profiles[0].scope_id; }, /scope ids do not equal/);
  expectMutation('missing scope', c => { c.scope_profiles.pop(); }, /expected exact 33-scope coverage/, false);
  expectMutation('duplicate scope-gap pair at unchanged cardinality', (_c, _s, g) => { g.gaps[1].scope_id = g.gaps[0].scope_id; g.gaps[1].gap_id = g.gaps[0].gap_id; }, /not the exact 33x7 product/);
  expectMutation('missing scope-gap pair', (_c, _s, g) => { g.gaps[0].scope_id = 'f1_scope_99'; }, /not the exact 33x7 product/);
  expectMutation('extra numeric stock field', c => { c.existence_candidates[0].quantity = 3; }, /unknown or missing fields/);
  expectMutation('nested approval field', c => { c.existence_candidates[0].approved = true; }, /unknown or missing fields/);
  expectMutation('Lower Dvina quantity copied into gap', c => { c.quantities_masses_and_depletion.quantity = 180; }, /must remain unresolved/);
  expectMutation('unsupported lighter without provenance', c => { c.existence_candidates[4] = { concept:'gasoline_lighter', candidate_catalog_ref:null, display_name:'бензиновая зажигалка', candidate_property:'ignites_fuel', basis:'editorial', source_refs:[], limits:'invented' }; }, /candidate concepts do not equal/);
  expectMutation('approved water gap', c => { c.water_and_extinguishing.status = 'approved'; }, /water_and_extinguishing: must remain typed_gap/);
  expectMutation('selector provenance range omission', (_c, sm) => { sm.sources.find(x => x.id === 'SRC_TARGET_PROFILE').lines = '1-14, 1902-1910'; }, /target source range does not cover exact selector ref/);
  expectMutation('numeric mechanic in action policy', c => { c.action_policy_candidate.fuel_rate_per_tick = 2; }, /action policy: unknown or missing fields/);
  expectMutation('foreign profile mass', c => { c.existence_candidates[0].mass_grams = 180; }, /unknown or missing fields/);
  console.log('PASS: baseline and 17 targeted negative self-tests (cardinality/status preserved where applicable)');
}
if (process.argv.includes('--self-test')) selfTest();
else if (process.argv.includes('--check')) check();
else { console.error('usage: node validate-f1-candidate.mjs --check|--self-test'); process.exitCode = 2; }
