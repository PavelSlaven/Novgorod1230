// Acceptance checks for all places-binding domains. Writes reports/validation.json;
// exits 1 if any check on this group's own data fails. Checks on other groups' inputs are reported
// as "external" and do not fail the run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { REPO, GROUP, readJson, readCsv, readTsv, writeJson, split, SEASONS } from './lib.mjs';
import { loadTemplateRegistry, WK_PLACE_FIRST, LOCAL_PF_ADDITIONS, V6_G4, SEEDS } from './build-place-families.mjs';
import { parseHouseholds } from './build-generation-limits.mjs';
import { build as buildPresenceRules, SUBREGIONS } from './build-presence-rules.mjs';
import { checkPeopleComposition } from './check-people-composition.mjs';

const checks = [];
const check = (domain, name, failures, extra = {}, external = false) => checks.push({ domain, name, pass: failures.length === 0, failures: failures.length, sample: failures.slice(0, 15), external, ...extra });
const P = (...p) => path.join(GROUP, ...p);
const TIME_ORDER = ['morning', 'day', 'evening', 'night'];
const ITEM_PATH = 'data/world-catalogs/novgorod/game-base-v1/items-household-personal/items/item_place_frequency.csv';
const FAUNA_PATH = 'data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/fauna/wild_habitat_presence.csv';
const REGION_INPUT = 'inputs/m2c-nature-coverage-entries.json';
const REGION_MANIFEST = 'places/region_type_pf_manifest.json';
const REGION_AUTHORING = 'scripts/pf-authoring.json';
const LOCAL_AUTHORING = 'places/pf_local_additions.json';
const REGION_SOURCE = {
  source_ref: 'codex/live-world-runtime@7cc0d341b9ac40ba30486f67a07f18ecf136e413',
  repository: 'codex/live-world-runtime', commit: '7cc0d341b9ac40ba30486f67a07f18ecf136e413',
  path: 'data/world-catalogs/novgorod/m2c-nature-coverage.json',
  blob: 'c8968f65d7567d30b5073a991bbe3357eaf5249f',
};
const REGION_FIELDS = { landscape: 'landscape_template_refs', water_body: 'water_body_template_refs', land_use: 'land_use_template_refs', place: 'place_template_refs' };
const REGION_AUTH_FIELDS = { landscape: 'landscape', water_body: 'water', land_use: 'land_use', place: 'place' };
const GAP_FIELDS = ['required_capability', 'correct_owner', 'missing_authoring_data', 'existing_nearest_data', 'why_insufficient', 'minimum_data_delta', 'affected_acceptance_test'];
function regionTypeFailures(source, manifest, families, authoring, local) {
  const failures = [];
  const same = isDeepStrictEqual;
  const key = (r) => `${r.kind}:${r.template_id}`;
  if (source.schema !== 'places_binding_m2c_nature_coverage_entries_v1' || !same(source.source, REGION_SOURCE) ||
      crypto.createHash('sha256').update(JSON.stringify(source.entries ?? null)).digest('hex') !== 'e3feddc8b0e7f650e9bddefd47724a87a9a590d0d41766ffd02c006167eb6904')
    failures.push('regional source snapshot differs from pinned 128-entry structure');
  if (!Array.isArray(source.entries) || source.entries.length !== 128) failures.push('expected 128 regional entries');
  const starts = source.start_only_water_entries;
  if (!Array.isArray(starts) || starts.length !== 2 || !same(starts?.map(key).sort(), ['water_body:wb_estuary', 'water_body:wb_nearshore_sea']) ||
      crypto.createHash('sha256').update(JSON.stringify(starts ?? null)).digest('hex') !== '4b1f6aa0f6e16098c75f19005a7be7130b72abf526f6d4a5a64bdc28d3476741')
    failures.push('expected two distinct start-only water entries');
  const rows = [...(source.entries ?? []), ...(starts ?? [])];
  const familyById = new Map(families.map((pf) => [pf.pf_id, pf]));
  const localById = new Map(local.additions.map((row) => [`pf_${row.id}`, row]));
  const plannedGaps = authoring.region_type_gap_closures ?? {};
  const expected = new Map();
  for (const row of rows) {
    const k = key(row);
    if (!REGION_FIELDS[row.kind] || !row.template_id || expected.has(k)) failures.push(`source duplicate/invalid ${k}`);
    expected.set(k, row);
  }
  if (expected.size !== 130 || !same([34, 24, 31, 39], ['landscape', 'water_body', 'land_use', 'place'].map((kind) =>
      (source.entries ?? []).filter((row) => row.kind === kind).length))) failures.push('source kind counts differ from 34/24/31/39');
  if (manifest.schema !== 'places_binding_region_type_pf_manifest_v1' || manifest.status !== 'candidate' ||
      !same(manifest.source, source.source) || manifest.source_status_warning !== source.source_status_warning)
    failures.push('manifest metadata differs from source');
  const actual = new Map();
  for (const row of manifest.entries ?? []) {
    const k = key(row);
    if (actual.has(k)) failures.push(`duplicate manifest key ${k}`);
    actual.set(k, row);
    if (!expected.has(k)) failures.push(`unexpected manifest key ${k}`);
  }
  for (const k of expected.keys()) if (!actual.has(k)) failures.push(`missing manifest key ${k}`);
  const counts = { total: 0, covered: 0, gap: 0, by_kind: {} };
  for (const [k, item] of expected) {
    const row = actual.get(k);
    if (!row) continue;
    const refs = families.filter((pf) => split(pf[REGION_FIELDS[item.kind]]).includes(item.template_id)).map((pf) => pf.pf_id).sort();
    if (!same(row.pf_refs, refs)) failures.push(`${k}: PF refs differ from current place_families.csv`);
    if (row.coverage !== (refs.length ? 'covered' : 'gap')) failures.push(`${k}: wrong coverage`);
    if (!same(row.regional_scales, item.regional_scales ?? []) || !same(row.exact_g4, item.exact_m2c_g4 ?? []))
      failures.push(`${k}: source scopes differ`);
    const expectedSources = [
      `data/world-catalogs/novgorod/game-base-v1/places-binding/${REGION_INPUT}#${source.entries?.includes(item) ? 'entries' : 'start_only_water_entries'}[kind=${item.kind},template_id=${item.template_id}]`,
      ...(item.reference_source ? [item.reference_source] : []),
    ];
    if (!same(row.source_refs, expectedSources) || !same(row.regional_source_refs, item.source_refs ?? []) || row.confidence !== 'C')
      failures.push(`${k}: source provenance/confidence differs`);
    const expectedMappings = refs.map((pfId) => {
      const family = pfId.slice(3);
      const localFamily = localById.get(pfId);
      const approvedEvidence = {
        'landscape:lt_wooded_floodplain': {
          pf_burial_ground: 'g4v3__gn_nov_g3_xp017_yp026_r2_zaostrovye_burial_area@1',
          pf_mixed_woodland: 'g4v3__gn_nov_g3_xp017_yp026_r2_zaostrovye_settlement_center@1',
        },
        'water_body:wb_nearshore_sea': Object.fromEntries(['pf_floodplain_meadow', 'pf_river_channel', 'pf_riverbank', 'pf_winter_ice_crossing'].map((pf) => [pf, 'g4v3__gn_nov_g3_xp017_yp026_r2_outer_exposed_approach@1'])),
      }[k]?.[pfId];
      const evidence_refs = approvedEvidence ? [`data/world-catalogs/novgorod/game-base-v1/places-binding/places/node_binding.csv#${approvedEvidence}`] : [];
      return {
        pf_ref: `data/world-catalogs/novgorod/game-base-v1/places-binding/places/place_families.csv#pf_id=${pfId}`,
        authoring_ref: localFamily
          ? `data/world-catalogs/novgorod/game-base-v1/places-binding/${LOCAL_AUTHORING}#additions[id=${family}].${REGION_AUTH_FIELDS[item.kind]}[${item.template_id}]`
          : `data/world-catalogs/novgorod/game-base-v1/places-binding/${REGION_AUTHORING}#families.${family}.${REGION_AUTH_FIELDS[item.kind]}[${item.template_id}]`,
        evidence_refs,
      };
    });
    if (!same(row.pf_mappings, expectedMappings) || refs.some((pfId) => !(localById.get(pfId) ?? authoring.families[pfId.slice(3)])?.[REGION_AUTH_FIELDS[item.kind]]?.includes(item.template_id)) ||
        refs.some((pfId) => !familyById.has(pfId))) failures.push(`${k}: PF mapping provenance differs`);
    if (!refs.length) {
      if (row.pf_refs?.length || row.regional_scales?.some((s) => s === 'G4' || s === 'G5') || row.exact_g4?.length)
        failures.push(`${k}: gap claims PF or exact G4/G5`);
      for (const field of GAP_FIELDS) if (typeof row[field] !== 'string' || !row[field].trim()) failures.push(`${k}: missing gap ${field}`);
      for (const field of ['required_capability', 'missing_authoring_data', 'affected_acceptance_test'])
        if (!row[field]?.includes(item.template_id)) failures.push(`${k}: generic gap ${field}`);
      const closure = plannedGaps[k];
      if (!closure || !same(Object.keys(closure).sort(), ['nearest_pf_refs', 'existing_nearest_data', 'why_insufficient', 'minimum_data_delta'].sort()) ||
          !Array.isArray(closure.nearest_pf_refs) || closure.nearest_pf_refs.some((ref) => !familyById.has(ref)) ||
          ['existing_nearest_data', 'why_insufficient', 'minimum_data_delta'].some((field) => typeof closure[field] !== 'string' || !closure[field].trim()) ||
          !same(Object.fromEntries(Object.keys(closure).map((field) => [field, row[field]])), closure)) failures.push(`${k}: gap closure differs from authoring`);
    } else if (GAP_FIELDS.some((field) => field in row) || 'nearest_pf_refs' in row) failures.push(`${k}: covered row has gap fields`);
    counts.total++;
    if (row.coverage === 'covered' || row.coverage === 'gap') {
      counts[row.coverage]++;
      const kind = counts.by_kind[row.kind] ??= { total: 0, covered: 0, gap: 0 };
      kind.total++; kind[row.coverage]++;
    }
  }
  const wanted = { total: 130, covered: 109, gap: 21, by_kind: {
    landscape: { total: 34, covered: 29, gap: 5 }, water_body: { total: 26, covered: 23, gap: 3 },
    land_use: { total: 31, covered: 24, gap: 7 }, place: { total: 39, covered: 33, gap: 6 },
  } };
  if (!same(counts, wanted) || !same(manifest.counts, wanted)) failures.push('manifest counts differ from 109 covered / 21 gap');
  if (!same(Object.keys(plannedGaps).sort(), [...expected.values()].filter((item) => !families.some((pf) => split(pf[REGION_FIELDS[item.kind]]).includes(item.template_id))).map(key).sort()))
    failures.push('gap closure keys differ from current gaps');
  for (const [k, refs] of Object.entries({
    'landscape:lt_wooded_floodplain': ['pf_burial_ground', 'pf_mixed_woodland'],
    'water_body:wb_nearshore_sea': ['pf_floodplain_meadow', 'pf_river_channel', 'pf_riverbank', 'pf_winter_ice_crossing'],
  })) if (!same(actual.get(k)?.pf_refs, refs)) failures.push(`${k}: approved PF mapping differs`);
  for (const k of ['water_body:wb_estuary', ...(source.entries ?? []).filter((row) => row.exact_m2c_g4?.length).map(key)])
    if (actual.get(k)?.coverage !== 'covered') failures.push(`${k}: start matrix type must be covered`);
  return failures;
}
function localAdditionFailures(local, wk, extract, categories) {
  const failures = [];
  const additions = local?.additions;
  if (local?.schema !== 'places_binding_local_pf_additions_v1' || local?.status !== 'candidate' ||
      !local?.transfer_debt?.includes('WK place-first-cartography') || !Array.isArray(additions))
    return ['local additions metadata/schema'];
  const wkIds = new Set(wk.environment_families.map((row) => row.id));
  const ids = additions.map((row) => row.id);
  if (ids.length !== 1 || ids[0] !== 'burial_ground') failures.push(`unknown local additions: ${ids.join(',')}`);
  if (new Set(ids).size !== ids.length) failures.push('duplicate local addition id');
  const knownNodes = new Set([
    ...extract.g4.map((row) => `${row.g4_id}@${row.g4_version}`),
    ...extract.g5.map((row) => `${row.g5_id}@${row.g5_version ?? 1}`),
  ]);
  const expectedGapRefs = [...knownNodes].filter((ref) => ref.includes('zaostrovye_burial_area')).sort();
  const slots = new Set(['facet_ground', 'facet_use_people', 'facet_senses_traces', 'facet_risks_upkeep']);
  for (const row of additions) {
    if (wkIds.has(row.id)) failures.push(`${row.id}: collides with WK`);
    if (!row.name_ru || !row.name_en || !row.kind || !row.description_en || row.status !== 'candidate' ||
        !['A', 'B', 'C'].includes(row.confidence) || !row.note?.includes('WK place-first-cartography')) failures.push(`${row.id}: identity/provenance`);
    if (!Array.isArray(row.source_refs) || !row.source_refs.length || row.source_refs.some((ref) => !/^book:\d+ §\d+$/.test(ref)))
      failures.push(`${row.id}: source_refs`);
    if (!Array.isArray(row.facets) || row.facets.length !== 4 || row.facets.some((facet) =>
      !facet.id || !Array.isArray(facet.slots) || !facet.slots.length || facet.slots.some((slot) => !slots.has(slot)) ||
      !['supported', 'partial'].includes(facet.coverage) || !Array.isArray(facet.claim_refs) || !facet.claim_refs.length ||
      facet.claim_refs.some((ref) => !row.source_refs.includes(ref)) || !Array.isArray(facet.needs) || !Array.isArray(facet.residual_needs)))
      failures.push(`${row.id}: facets`);
    const identity = row.identity_presence;
    if (identity?.category_ref !== 'burial_zone' || identity?.relation !== 'required_identity_not_frequency' ||
        identity?.count_min !== 1 || !categories.has(identity?.category_ref) || !identity?.source_refs?.length ||
        identity.source_refs.some((ref) => !row.source_refs.includes(ref)) || !['A', 'B', 'C'].includes(identity?.confidence))
      failures.push(`${row.id}: identity presence`);
    if (!Array.isArray(row.no_source) || row.no_source.length < 3 || row.no_source.some((reason) => !reason.trim()))
      failures.push(`${row.id}: explicit no_source gaps`);
    if (!isDeepStrictEqual([...row.start_territory_gap_refs].sort(), expectedGapRefs) || row.start_territory_gap_refs.some((ref) => !knownNodes.has(ref)))
      failures.push(`${row.id}: start territory gap refs`);
    if (!Array.isArray(row.exact_g4_refs) || row.exact_g4_refs.length !== 1 || !knownNodes.has(row.exact_g4_refs[0]))
      failures.push(`${row.id}: exact G4 refs`);
    if (!Array.isArray(row.lifecycle_rows) || row.lifecycle_rows.length !== 4 || row.lifecycle_rows.some((item) =>
      item.rite_kind !== 'burial' || !item.name_ru || !item.visible_traces || !item.attestation ||
      !row.source_refs.includes(item.source_refs) || !['A', 'B', 'C'].includes(item.confidence) || item.status))
      failures.push(`${row.id}: lifecycle rows`);
  }
  return failures;
}
function presenceIds(rows) {
  const keys = new Set(), ids = new Set(), failures = [];
  for (const row of rows) {
    const seasons = String(row.allowed_seasons ?? '').trim();
    const ordered = SEASONS.filter((s) => split(seasons).includes(s)).join(';');
    const canonical = seasons === 'all' || ordered === SEASONS.join(';') ? 'all' : ordered;
    const identity = [row.scope_kind, row.scope_ref, row.region_id];
    if (row.subregion_scope) identity.push(row.subregion_scope);
    identity.push(row.subject_kind, row.subject_ref, canonical);
    const key = JSON.stringify(identity.map((s) => String(s ?? '').trim()));
    const expected = `pr_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
    if (seasons !== canonical) failures.push(`${row.pr_id}: noncanonical seasons`);
    if (row.pr_id !== expected) failures.push(`${row.pr_id}: expected ${expected}`);
    if (keys.has(key)) failures.push(`${row.pr_id}: duplicate key`);
    if (ids.has(row.pr_id)) failures.push(`${row.pr_id}: duplicate ID`);
    keys.add(key); ids.add(row.pr_id);
  }
  return failures;
}
function seasonOverlaps(rows) {
  const seen = new Map(), failures = [];
  for (const r of rows) {
    const key = [r.scope_kind, r.scope_ref, r.region_id, r.subregion_scope || '', r.subject_kind, r.subject_ref].join('|');
    const tokens = String(r.allowed_seasons ?? '').split(';').map((s) => s.trim());
    if (tokens.some((s) => !s || (s !== 'all' && !SEASONS.includes(s))) || new Set(tokens).size !== tokens.length || (tokens.includes('all') && tokens.length !== 1)) {
      failures.push(`${r.pr_id}: malformed or overlapping seasons ${r.allowed_seasons}`);
      continue;
    }
    for (const season of tokens[0] === 'all' ? SEASONS : tokens) {
      const slot = `${key}|${season}`;
      if (seen.has(slot)) failures.push(`${r.pr_id}: overlaps ${seen.get(slot)} at ${slot}`);
      else seen.set(slot, r.pr_id);
    }
  }
  return failures;
}
function acceptedCoverage(expected, rules, resolutions, itemRows) {
  const failures = [], counts = new Map(expected.map((x) => [x.key, 0]));
  const sourceKey = (pool, scope, season, time = '') => `${pool}|${scope}|${season}|${time}`;
  const assign = (pool, scope, season, time, itemRef, role) => {
    const key = sourceKey(pool, scope, season, time);
    if (!counts.has(key)) { failures.push(`unexpected ${role}: ${key}`); return; }
    const source = itemRows.get(pool);
    if (pool.startsWith(`${ITEM_PATH}#`) && !source) failures.push(`${role}: unresolved item source ${pool}`);
    if (source && (!itemRef || itemRef !== source.item_or_category_ref)) failures.push(`${role}: missing or mismatched item_ref ${pool}`);
    counts.set(key, counts.get(key) + 1);
  };
  const reported = new Map();
  for (const r of resolutions) for (const season of r.seasons) {
    const key = `${r.key}|${season}`;
    if (reported.has(key)) failures.push(`duplicate resolution ${key}`);
    reported.set(key, r);
  }
  for (const r of resolutions) for (const entry of [r.chosen, ...r.equivalent, ...r.variants, ...r.dropped]) {
    const item = itemRows.get(entry.source_pool);
    if (entry.source_pool.startsWith(`${ITEM_PATH}#`) && !item) failures.push(`resolution item source missing ${entry.source_pool}`);
    if (item && (entry.item_ref !== item.item_or_category_ref || entry.source_row_id !== item.ipf_id)) failures.push(`resolution item ref/id differs from source ${entry.source_pool}`);
  }
  for (const rule of rules) for (const season of rule.allowed_seasons === 'all' ? SEASONS : split(rule.allowed_seasons)) {
    const scope = [rule.scope_kind, rule.scope_ref, rule.region_id, rule.subregion_scope || '', rule.subject_kind, rule.subject_ref].join('|');
    const resolution = reported.get(`${scope}|${season}`);
    const sources = split(rule.source_pool);
    const reportSources = resolution ? [resolution.chosen, ...resolution.equivalent].map((x) => x.source_pool).sort() : sources.slice().sort();
    if (JSON.stringify(sources.slice().sort()) !== JSON.stringify(reportSources)) failures.push(`${scope}|${season}: chosen/equivalent sources differ from rule`);
    const variants = JSON.parse(rule.variants || '[]');
    if (JSON.stringify(variants) !== JSON.stringify(resolution?.variants || [])) failures.push(`${scope}|${season}: variants differ from report`);
    for (const pool of sources) {
      const times = rule.subject_kind === 'category' ? [''] : split(rule.allowed_times).filter((time) => {
        const source = expected.find((x) => x.pool === pool && x.scope === scope && x.season === season && x.time === time);
        return Boolean(source);
      });
      for (const time of times) assign(pool, scope, season, time, rule.item_ref, 'chosen/equivalent');
    }
    for (const variant of variants) assign(variant.source_pool, scope, season, '', variant.item_ref, 'variant');
    for (const dropped of resolution?.dropped || []) assign(dropped.source_pool, scope, season, '', dropped.item_ref, 'dropped');
  }
  for (const [key, count] of counts) if (count !== 1) failures.push(`${count ? 'double assignment' : 'orphan'} ${key} (${count})`);
  return failures;
}
function itemVariantSelection(resolutions, actual) {
  const withVariants = resolutions.filter((r) => r.variants.length);
  const expected = {
    status: 'data_gap', weights_status: 'absent',
    activation_requirement: { runtime_constraint: 'uniform_among_chosen_item_and_variants_if_weights_absent', implementation_present: false },
    weight_owner: null, weight_contract: null,
    variant_keys: new Set(withVariants.map((r) => r.key)).size,
    item_alternatives: new Set(withVariants.flatMap((r) => r.variants.map((v) => `${r.key}|${v.item_ref}`))).size,
  };
  return Object.keys(expected).filter((key) => JSON.stringify(actual?.[key]) !== JSON.stringify(expected[key])).map((key) => `${key}: expected ${JSON.stringify(expected[key])}, got ${JSON.stringify(actual?.[key])}`)
    .concat(Object.keys(actual || {}).filter((key) => !(key in expected)).map((key) => `unexpected field ${key}`));
}
function subregionPropagationFailures(rules, faunaSources) {
  const failures = [];
  const faunaByPool = new Map(faunaSources.map((row) => [`${FAUNA_PATH}#${row.presence_id}`, row]));
  for (const rule of rules) {
    if (rule.subregion_scope && !SUBREGIONS.includes(rule.subregion_scope)) failures.push(`${rule.pr_id}: unknown subregion_scope ${rule.subregion_scope}`);
    if (rule.subregion_scope && rule.region_id !== 'region_novgorod_land') failures.push(`${rule.pr_id}: subregion_scope without region_novgorod_land`);
    for (const pool of split(rule.source_pool).filter((source) => source.startsWith(`${FAUNA_PATH}#`))) {
      const source = faunaByPool.get(pool);
      if (!source) failures.push(`${rule.pr_id}: unresolved fauna source ${pool}`);
      else if ((rule.subregion_scope || '') !== (source.subregion_scope || '')) failures.push(`${rule.pr_id}: subregion_scope differs from ${pool}`);
    }
  }
  return failures;
}
function seasonalOverlayFailures(nodes, families, presence) {
  const seasonalPfs = new Map(families.filter((f) => f.pf_kind === 'seasonal_overlay').map((f) =>
    [f.pf_id, SEASONS.find((season) => f.pf_id.startsWith(`pf_${season}_`))]));
  const reached = new Set(nodes.flatMap((node) => [node.pf_id, ...split(node.pf_secondary)]));
  const failures = presence.filter((rule) => reached.has(rule.scope_ref) && seasonalPfs.has(rule.scope_ref) &&
    rule.allowed_seasons !== seasonalPfs.get(rule.scope_ref)).map((rule) => `${rule.pr_id}: ${rule.scope_ref} ${rule.allowed_seasons}`);
  for (const [pf, season] of seasonalPfs) if (reached.has(pf) && !season) failures.push(`${pf}: own season unknown`);
  return failures;
}
function secondaryFailures(nodes, extract, crosswalk) {
  const failures = [];
  const contract = crosswalk.node_binding.pf_secondary;
  const sceneMap = crosswalk.scene_templates.map;
  const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('|') === fields.slice().sort().join('|');
  if (!exact(contract, ['meaning', 'candidate_basis', 'include_rule', 'overlay_rule', 'ferry_bank_rule', 'parent_closure_rule', 'primary_kind_rule', 'axis_rules']) ||
      contract.meaning !== 'candidate part of the node scene subject to parent-axis rules' || contract.candidate_basis !== 'scene_templates.map' ||
      !exact(contract.include_rule, ['rule_id', 'statement', 'confidence']) ||
      typeof contract.include_rule.rule_id !== 'string' || !contract.include_rule.rule_id.trim() ||
      typeof contract.include_rule.statement !== 'string' || !contract.include_rule.statement.trim() ||
      contract.include_rule.confidence !== 'C' || !Array.isArray(contract.axis_rules))
    return ['malformed pf_secondary contract'];
  const ruleIds = new Set([contract.include_rule.rule_id]);
  for (const [name, fields] of [['overlay_rule', ['pf_kind', 'rule_ref', 'confidence', 'reason']],
    ['ferry_bank_rule', ['primary_pf', 'parent_land_use', 'add_pf', 'rule_ref', 'confidence', 'reason']],
    ['parent_closure_rule', ['rule_ref', 'confidence', 'reason']],
    ['primary_kind_rule', ['rule_ref', 'confidence', 'reason', 'restricted_primary_kinds', 'restricted_water_edge_landscapes', 'rejected_secondary_kinds', 'forest_resource_use_exception']]]) {
    const rule = contract[name];
    if (!exact(rule, fields) || typeof rule.rule_ref !== 'string' || !rule.rule_ref || ruleIds.has(rule.rule_ref) ||
        rule.confidence !== 'C' || typeof rule.reason !== 'string' || !rule.reason) failures.push(`malformed ${name}`);
    else ruleIds.add(rule.rule_ref);
  }
  if (contract.overlay_rule?.pf_kind !== 'overlay' ||
      contract.ferry_bank_rule?.primary_pf !== 'ferry_landing' ||
      contract.ferry_bank_rule?.parent_land_use !== 'waterway_access' ||
      contract.ferry_bank_rule?.add_pf !== 'riverbank') failures.push('invalid overlay/ferry rule target');
  if (JSON.stringify(contract.primary_kind_rule?.restricted_primary_kinds) !== JSON.stringify(['water', 'natural_wetland']) ||
      JSON.stringify(contract.primary_kind_rule?.rejected_secondary_kinds) !== JSON.stringify(['natural_forest', 'route', 'natural_edge', 'settlement_space']) ||
      JSON.stringify(contract.primary_kind_rule?.forest_resource_use_exception) !== JSON.stringify({ land_use: 'forest_resource_use', allowed_secondary_kinds: ['natural_forest', 'route', 'natural_edge'] }) ||
      !Array.isArray(contract.primary_kind_rule?.restricted_water_edge_landscapes) || !contract.primary_kind_rule.restricted_water_edge_landscapes.length)
    failures.push('invalid primary kind rule');
  const validAxes = new Set(['landscape', 'land_use', 'function', 'primary_pf_kind', 'place_template_id', 'primary_place_template_refs']);
  const registry = loadTemplateRegistry();
  const axisVocab = Object.fromEntries(['landscape', 'land_use', 'function'].map((axis) =>
    [axis, new Set(extract.g4.map((g) => g.axes[axis]))]));
  axisVocab.primary_pf_kind = new Set(readCsv(P('places/place_families.csv')).map((f) => f.pf_kind));
  const validValue = (axis, value) => ['place_template_id', 'primary_place_template_refs'].includes(axis)
    ? registry.get(value)?.kind === 'place' : axisVocab[axis]?.has(value);
  const validCondition = (condition, allowNot = false) => condition && typeof condition === 'object' && !Array.isArray(condition) &&
    Object.keys(condition).length > 0 && Object.entries(condition).every(([axis, values]) =>
      (validAxes.has(axis) || (allowNot && axis.endsWith('_not') && validAxes.has(axis.slice(0, -4)))) &&
      Array.isArray(values) && values.length > 0 && values.every((v) => typeof v === 'string' && validValue(axis.replace(/_not$/, ''), v)));
  for (const rule of contract.axis_rules) {
    if (!rule || !exact(rule, ['pf_id', 'rule_ref', 'confidence', 'reason', rule.require_any ? 'require_any' : 'exclude_if']) ||
        !sceneMap || !Object.values(sceneMap).some((pfs) => pfs.includes(rule.pf_id)) ||
        typeof rule.rule_ref !== 'string' || !rule.rule_ref || ruleIds.has(rule.rule_ref) ||
        rule.confidence !== 'C' || typeof rule.reason !== 'string' || !rule.reason ||
        !validCondition(rule.require_any || rule.exclude_if, Boolean(rule.exclude_if))) {
      failures.push('malformed axis rule');
      continue;
    }
    ruleIds.add(rule.rule_ref);
  }
  const g4ById = new Map(extract.g4.map((g) => [g.g4_id, g]));
  const input = [
    ...extract.g4.map((g) => [`${g.g4_id}@${g.g4_version}`, g.scene_template_refs, g.axes]),
    ...extract.g5.map((g) => [`${g.g5_id}@${g.g5_version}`, [g.scene_template_id], g4ById.get(g.parent_g4_id)?.axes]),
  ];
  const kinds = new Map(readCsv(P('places/place_families.csv')).map((f) => [f.pf_id.slice(3), f.pf_kind]));
  const placeTemplates = new Map(readCsv(P('places/place_families.csv')).map((f) => [f.pf_id.slice(3), split(f.place_template_refs)]));
  const byNode = new Map(nodes.map((node) => [node.node_ref, node]));
  const children = new Map();
  for (const node of nodes.filter((node) => node.node_level === 'G5' && node.pf_id)) {
    if (!children.has(node.parent_node_ref)) children.set(node.parent_node_ref, []);
    children.get(node.parent_node_ref).push(node.pf_id);
  }
  for (const [ref, scenes, axes] of input) {
    const node = byNode.get(ref);
    if (!node) { failures.push(`missing node ${ref}`); continue; }
    if (!axes) { failures.push(`missing parent axes ${ref}`); continue; }
    const actual = node.pf_secondary;
    if (failures.some((failure) => failure.startsWith('malformed'))) continue;
    const primary = node.pf_id.replace(/^pf_/, '');
    const context = { ...axes, primary_pf_kind: kinds.get(primary), place_template_id: node.place_template_id,
      primary_place_template_refs: placeTemplates.get(primary) ?? [] };
    const hasValue = (axis, values) => Array.isArray(context[axis])
      ? context[axis].some((value) => values.includes(value)) : values.includes(context[axis]);
    const restricted = contract.primary_kind_rule.restricted_primary_kinds.includes(kinds.get(primary)) ||
      (kinds.get(primary) === 'water_edge' && contract.primary_kind_rule.restricted_water_edge_landscapes.includes(axes.landscape));
    const groundRejects = (pf) => restricted && contract.primary_kind_rule.rejected_secondary_kinds.includes(kinds.get(pf)) &&
      !(kinds.get(primary) === 'water_edge' && kinds.get(pf) === 'natural_edge') &&
      !(axes.land_use === contract.primary_kind_rule.forest_resource_use_exception.land_use &&
        contract.primary_kind_rule.forest_resource_use_exception.allowed_secondary_kinds.includes(kinds.get(pf)));
    const candidates = [...new Set(scenes.flatMap((ref) => {
      const scene = ref.replace(/@\d+$/, '');
      return sceneMap[scene] ?? [];
    }))].filter((pf) => `pf_${pf}` !== node.pf_id && !(contract.overlay_rule.pf_kind === 'overlay' && kinds.get(pf) === 'overlay'));
    const expected = candidates.filter((pf) => !groundRejects(pf) && contract.axis_rules.every((rule) =>
      rule.pf_id !== pf ||
      (!rule.require_any || Object.entries(rule.require_any).some(([axis, values]) => hasValue(axis, values))) &&
      (!rule.exclude_if || !Object.entries(rule.exclude_if).every(([axis, values]) => axis.endsWith('_not')
        ? !hasValue(axis.slice(0, -4), values) : hasValue(axis, values))))).map((pf) => `pf_${pf}`);
    const ferryAdded = node.pf_id === `pf_${contract.ferry_bank_rule.primary_pf}` && axes.land_use === contract.ferry_bank_rule.parent_land_use &&
      !expected.includes(`pf_${contract.ferry_bank_rule.add_pf}`);
    if (ferryAdded) expected.push(`pf_${contract.ferry_bank_rule.add_pf}`);
    const closure = node.node_level === 'G4' ? (children.get(ref) ?? []).filter((pf) => pf !== node.pf_id) : [];
    const closureAdded = closure.some((pf) => !expected.includes(pf));
    for (const pf of closure) if (!expected.includes(pf)) expected.push(pf);
    if (actual !== expected.join(';')) failures.push(`${ref}: pf_secondary expected ${expected.join(';')}, got ${actual}`);
    if (split(actual).some((pf) => kinds.get(pf.slice(3)) === 'overlay')) failures.push(`${ref}: overlay in pf_secondary`);
    const applied = [...new Set([contract.include_rule.rule_id,
      ...(candidates.some(groundRejects) ? [contract.primary_kind_rule.rule_ref] : []),
      ...candidates.flatMap((pf) => contract.axis_rules.filter((rule) => rule.pf_id === pf).map((rule) => rule.rule_ref)),
      ...(ferryAdded ? [contract.ferry_bank_rule.rule_ref] : []),
      ...(closureAdded ? [contract.parent_closure_rule.rule_ref] : [])])];
    const recorded = node.binding_basis.match(/rule_refs=([^;]*)/)?.[1].split(',').filter(Boolean) ?? [];
    for (const rule of applied.filter((rule) => !recorded.includes(rule))) failures.push(`${ref}: missing applied rule_ref ${rule}`);
    for (const rule of recorded.filter((rule) => !applied.includes(rule))) failures.push(`${ref}: stale rule_ref ${rule}`);
    if (!node.binding_basis.includes(`#node_binding.pf_secondary.include_rule[rule_id=${contract.include_rule.rule_id}]`) ||
                     !split(node.source_refs).includes('data/world-catalogs/novgorod/game-base-v1/places-binding/scripts/crosswalk-rules.json'))
      failures.push(`${ref}: secondary rule/source missing`);
  }
  return failures;
}
if (process.argv.includes('--self-test')) {
  const probe = { pr_id: 'probe_all', scope_kind: 'place_family', scope_ref: 'probe', region_id: '', subregion_scope: '', subject_kind: 'category', subject_ref: 'probe', allowed_seasons: 'all' };
  if (seasonOverlaps([probe, { ...probe, pr_id: 'probe_winter', allowed_seasons: 'winter' }]).length !== 1) throw new Error('season overlap negative probe failed');
  for (const seasons of ['all;winter', 'winter;winter', 'monsoon']) if (!seasonOverlaps([{ ...probe, allowed_seasons: seasons }]).length) throw new Error(`season field negative probe failed: ${seasons}`);
  console.log('PASS presence_rules / season_overlap_negative_probes');
  const keyed = { ...probe, pr_id: 'invalid' };
  if (!presenceIds([keyed]).some((f) => f.includes('expected'))) throw new Error('tampered presence ID negative probe failed');
  if (!presenceIds([keyed, { ...keyed, scope_ref: 'other' }]).some((f) => f.includes('duplicate ID'))) throw new Error('presence ID collision negative probe failed');
  console.log('PASS presence_rules / identity_negative_probes');
  const [first, second, third] = buildPresenceRules({ write: false }).rows;
  if ([first, second, third].some((row) => !row) ||
      presenceIds([first, second]).length ||
      presenceIds([third, first, second]).length ||
      presenceIds([first]).length)
    throw new Error('presence IDs changed after inserting or removing another row');
  console.log('PASS presence_rules / identity_stability_probe');
  const extracted = readJson(P('inputs/pr98-extract.json'));
  const crosswalk = readJson(P('scripts/crosswalk-rules.json'));
  const nodes = readCsv(P('places/node_binding.csv'));
  if (secondaryFailures(nodes, extracted, crosswalk).length) throw new Error('baseline secondary binding failed');
  const withSecondary = nodes.find((node) => node.pf_secondary);
  if (!withSecondary) throw new Error('secondary binding probes lack targets');
  const changed = (target, value) => nodes.map((node) => node === target ? { ...node, pf_secondary: value } : node);
  if (!secondaryFailures(changed(withSecondary, ''), extracted, crosswalk).length)
    throw new Error('secondary omission/extra probes failed');
  const changedBasis = (suffix) => nodes.map((node) => node === withSecondary ? {
    ...node, binding_basis: node.binding_basis.replace(/rule_refs=([^;]*)/, (_, refs) => `rule_refs=${refs}${suffix}`),
  } : node);
  if (!secondaryFailures(changedBasis(',stale_probe_v1'), extracted, crosswalk).some((f) => f.includes('stale rule_ref')))
    throw new Error('rule-ref provenance probe failed');
  const missingRef = nodes.map((node) => node === withSecondary ? {
    ...node, binding_basis: node.binding_basis.replace(/rule_refs=([^;]*)/, (_, refs) =>
      `rule_refs=${refs.split(',').filter((ref) => ref !== crosswalk.node_binding.pf_secondary.include_rule.rule_id).join(',')}`),
  } : node);
  if (!secondaryFailures(missingRef, extracted, crosswalk).some((f) => f.includes('missing applied rule_ref')))
    throw new Error('missing rule-ref probe failed');
  const invalidValue = structuredClone(crosswalk);
  invalidValue.node_binding.pf_secondary.axis_rules.find((r) => r.pf_id === 'field_margin').require_any.primary_pf_kind = ['agrarian_use'];
  if (!secondaryFailures(nodes, extracted, invalidValue).includes('malformed axis rule'))
    throw new Error('invalid whitelist vocabulary probe failed');
  const g4Closure = nodes.find((node) => node.node_level === 'G4' && node.binding_basis.includes(crosswalk.node_binding.pf_secondary.parent_closure_rule.rule_ref));
  if (!g4Closure || !secondaryFailures(changed(g4Closure, ''), extracted, crosswalk).some((f) => f.includes('pf_secondary expected')))
    throw new Error('parent closure omission probe failed');
  const badInclude = structuredClone(crosswalk);
  badInclude.node_binding.pf_secondary.include_rule.statement = '';
  if (!secondaryFailures(nodes, extracted, badInclude).includes('malformed pf_secondary contract'))
    throw new Error('empty include statement probe failed');
  const changedCrosswalk = structuredClone(crosswalk);
  const firstPf = split(withSecondary.pf_secondary)[0].replace(/^pf_/, '');
  const firstScene = split(withSecondary.scene_template_refs).map((ref) => ref.replace(/@\d+$/, ''))
    .find((scene) => changedCrosswalk.scene_templates.map[scene].includes(firstPf));
  changedCrosswalk.scene_templates.map[firstScene] = changedCrosswalk.scene_templates.map[firstScene].filter((pf) => pf !== firstPf);
  if (!secondaryFailures(nodes, extracted, changedCrosswalk).some((failure) => failure.includes('pf_secondary expected')))
    throw new Error('mutated crosswalk negative probe failed');
  for (const field of ['overlay_rule', 'ferry_bank_rule', 'parent_closure_rule', 'primary_kind_rule']) {
    const bad = structuredClone(crosswalk);
    bad.node_binding.pf_secondary[field].rule_ref = '';
    if (!secondaryFailures(nodes, extracted, bad).some((failure) => failure.includes(`malformed ${field}`)))
      throw new Error(`${field} provenance probe failed`);
  }
  const ferry = nodes.find((node) => node.node_level === 'G5' && node.pf_id === 'pf_ferry_landing' && node.authoring_axes.includes('land_use=waterway_access'));
  if (!ferry || !secondaryFailures(changed(ferry, split(ferry.pf_secondary).filter((pf) => pf !== 'pf_riverbank').join(';')), extracted, crosswalk)
    .some((failure) => failure.includes(`${ferry.node_ref}: pf_secondary expected`))) throw new Error('ferry bank omission probe failed');
  const hazard = nodes.find((node) => split(node.scene_template_refs).some((ref) => ref.startsWith('stfv3__g5_general_hazard_v1@')));
  if (!hazard || !secondaryFailures(changed(hazard, [hazard.pf_secondary, 'pf_reality_batch_01_open_conditions'].filter(Boolean).join(';')), extracted, crosswalk)
    .some((failure) => failure.includes('overlay in pf_secondary'))) throw new Error('overlay probe failed');
  const riverRoad = nodes.find((node) => node.node_level === 'G4' && node.authoring_axes.includes('function=river_reach') &&
    split(node.scene_template_refs).some((ref) => ref.startsWith('stfv3__g5_route_approach_v1@')));
  if (!riverRoad || !secondaryFailures(changed(riverRoad, [riverRoad.pf_secondary, 'pf_road'].filter(Boolean).join(';')), extracted, crosswalk).length)
    throw new Error('waterway road probe failed');
  const waterG5 = nodes.find((node) => node.node_level === 'G5' && node.pf_id === 'pf_river_channel');
  if (!waterG5 || !secondaryFailures(changed(waterG5, [waterG5.pf_secondary, 'pf_forest_track'].filter(Boolean).join(';')), extracted, crosswalk).length)
    throw new Error('water-primary forest track probe failed');
  const lane = nodes.find((node) => node.node_level === 'G5' && node.authoring_axes.includes('landscape=forest') && node.pf_id !== 'pf_village_lane');
  if (!lane || !secondaryFailures(changed(lane, [lane.pf_secondary, 'pf_village_lane'].filter(Boolean).join(';')), extracted, crosswalk).length)
    throw new Error('wild village lane probe failed');
  for (const [pf, positivePrimary] of [['town_wall_edge', 'pf_town_courtyard'], ['field_margin', 'pf_arable_field'],
    ['river_wharf', 'pf_town_courtyard']]) {
    const rule = crosswalk.node_binding.pf_secondary.axis_rules.find((r) => r.pf_id === pf);
    if (!rule?.require_any || !Object.keys(rule.require_any).length)
      throw new Error(`${pf} whitelist positive probe failed`);
    const scene = Object.keys(crosswalk.scene_templates.map).find((id) => crosswalk.scene_templates.map[id].includes(pf));
    const negative = nodes.find((node) => node.node_level === 'G5' &&
      split(node.scene_template_refs).some((ref) => ref.startsWith(`${scene}@`)) &&
      !split(node.pf_secondary).includes(`pf_${pf}`));
    if (!negative || !secondaryFailures(changed(negative, [negative.pf_secondary, `pf_${pf}`].filter(Boolean).join(';')), extracted, crosswalk).length)
      throw new Error(`${pf} whitelist negative probe failed`);
    const positiveNodes = nodes.map((node) => node === negative ? { ...node, pf_id: positivePrimary } : node);
    if (!secondaryFailures(positiveNodes, extracted, crosswalk).some((failure) => failure.includes(`${negative.node_ref}: pf_secondary expected`) && failure.includes(`pf_${pf}`)))
      throw new Error(`${pf} whitelist positive probe failed`);
    if (['town_wall_edge', 'river_wharf'].includes(pf)) {
      const nodeSignal = nodes.map((node) => node === negative ? { ...node, pf_id: 'pf_rural_yard', place_template_id: 'pt_town' } : node);
      if (!secondaryFailures(nodeSignal, extracted, crosswalk).some((failure) => failure.includes(`${negative.node_ref}: pf_secondary expected`) && failure.includes(`pf_${pf}`)))
        throw new Error(`${pf} node place-template positive probe failed`);
      const rural = nodes.map((node) => node === negative ? { ...node, pf_id: 'pf_peasant_homestead' } : node);
      if (secondaryFailures(rural, extracted, crosswalk).some((failure) => failure.includes(`${negative.node_ref}: pf_secondary expected`) && failure.includes(`pf_${pf}`)))
        throw new Error(`${pf} rural primary negative probe failed`);
    }
  }
  const shifted = structuredClone(extracted);
  const forestEdge = nodes.find((node) => node.node_level === 'G5' && node.pf_id === 'pf_riverbank' &&
    node.authoring_axes.includes('land_use=forest_resource_use') && node.authoring_axes.includes('landscape=river_channel') &&
    split(node.pf_secondary).includes('pf_forest_track'));
  if (!forestEdge) throw new Error('forest water edge probe lacks target');
  shifted.g4.find((g) => `${g.g4_id}@1` === forestEdge.parent_node_ref).axes.land_use = 'waterway_access';
  if (!secondaryFailures(nodes, shifted, crosswalk).some((failure) => failure.includes(`${forestEdge.node_ref}: pf_secondary expected`)))
    throw new Error('changed parent axes probe failed');
  const winterRule = readCsv(P('presence/presence_rules.csv')).find((rule) => rule.scope_ref === 'pf_winter_ice_crossing');
  if (!winterRule || !seasonalOverlayFailures(nodes, readCsv(P('places/place_families.csv')), [{ ...winterRule, allowed_seasons: 'all' }]).length)
    throw new Error('seasonal overlay presence probe failed');
  console.log('PASS node_binding / secondary_negative_probes');
}

const wk = readJson(WK_PLACE_FIRST);
const fam = readCsv(P('places/place_families.csv'));
const localAdditions = readJson(LOCAL_PF_ADDITIONS);
const regionSource = readJson(P(REGION_INPUT));
const regionManifest = readJson(P(REGION_MANIFEST));
const regionAuthoring = readJson(P(REGION_AUTHORING));
const ex = readJson(P('inputs/pr98-extract.json'));
const categoryIds = new Set(readCsv(P('categories/category_registry.csv')).map((row) => row.category_id));
check('place_families', 'local_additions_sourced_noncolliding_and_explicit', localAdditionFailures(localAdditions, wk, ex, categoryIds), { additions: localAdditions.additions.length });
check('region_type_pf_manifest', 'pinned_source_exact_keys_current_pf_and_typed_gaps', regionTypeFailures(regionSource, regionManifest, fam, regionAuthoring, localAdditions), { rows: regionManifest.entries?.length ?? 0 });
if (process.argv.includes('--self-test')) {
  const unknownLocal = structuredClone(localAdditions);
  unknownLocal.additions.push({ ...structuredClone(unknownLocal.additions[0]), id: 'unknown_probe' });
  if (!localAdditionFailures(unknownLocal, wk, ex, categoryIds).some((failure) => failure.includes('unknown local additions')))
    throw new Error('unknown local addition negative probe failed');
  console.log('PASS place_families / unknown_local_addition_negative_probe');
  const unsourcedLocal = structuredClone(localAdditions);
  unsourcedLocal.additions[0].source_refs = [];
  if (!localAdditionFailures(unsourcedLocal, wk, ex, categoryIds).some((failure) => failure.includes('source_refs')))
    throw new Error('local addition without book source negative probe failed');
  console.log('PASS place_families / local_addition_without_book_source_negative_probe');
  const collidingLocal = structuredClone(localAdditions);
  collidingLocal.additions[0].id = wk.environment_families[0].id;
  if (!localAdditionFailures(collidingLocal, wk, ex, categoryIds).some((failure) => failure.includes('collides with WK')))
    throw new Error('local addition WK collision negative probe failed');
  console.log('PASS place_families / local_addition_wk_collision_negative_probe');
  const copy = () => structuredClone(regionManifest);
  const probes = {
    missing_row: (m) => m.entries.pop(),
    duplicate_key: (m) => m.entries.push(structuredClone(m.entries[0])),
    unclassified_row: (m) => { const row = m.entries.find((r) => r.coverage === 'gap'); row.coverage = 'unclassified'; },
    wrong_pf_ref: (m) => { const row = m.entries.find((r) => r.coverage === 'covered'); row.pf_refs = ['pf_wrong']; },
    unrelated_node_ref: (m) => { const row = m.entries.find((r) => r.coverage === 'covered' && r.pf_mappings.length); row.pf_mappings[0].evidence_refs.push('data/world-catalogs/novgorod/game-base-v1/places-binding/places/node_binding.csv#unrelated@1'); },
    incomplete_nearest_plan: (m) => { const row = m.entries.find((r) => r.coverage === 'gap'); row.nearest_pf_refs = []; },
  };
  for (const [name, mutate] of Object.entries(probes)) {
    const m = copy(); mutate(m);
    if (!regionTypeFailures(regionSource, m, fam, regionAuthoring, localAdditions).length) throw new Error(`region manifest negative probe failed: ${name}`);
  }
  console.log('PASS region_type_pf_manifest / six_negative_probes');
}
const reg = loadTemplateRegistry();
const routes = new Set(readJson(SEEDS.route).map((r) => r.id));
const pfSet = new Set(fam.map((f) => f.pf_id));

const startTerritoryArg = process.argv.indexOf('--start-territory');
if (startTerritoryArg >= 0 && !process.argv[startTerritoryArg + 1]) throw new Error('--start-territory requires a JSON path');
check('people_composition', 'schema_refs_pf_coverage_and_schedules', checkPeopleComposition(
  readJson(P('presence/people_composition_authoring.json')),
  startTerritoryArg >= 0 ? readJson(path.resolve(process.argv[startTerritoryArg + 1])) : null,
));

// ---- place_families
{
  const ids = fam.map((f) => f.pf_id.slice(3));
  const wkWant = wk.environment_families.map((f) => f.id);
  const localWant = localAdditions.additions.map((f) => f.id);
  const want = [...wkWant, ...localWant];
  check('place_families', 'wk_families_plus_declared_local_additions_exactly_once', [
    ...want.filter((w) => ids.filter((x) => x === w).length !== 1).map((w) => `missing_or_duplicate ${w}`),
    ...ids.filter((x) => !want.includes(x)).map((x) => `unknown ${x}`),
    ...localWant.filter((id) => wkWant.includes(id)).map((id) => `local collision ${id}`),
  ], { wk_families: wkWant.length, local_additions: localWant.length, rows: fam.length });
  check('place_families', 'landscape_or_place_ref_or_explicit_not_applicable', fam.filter((f) => !f.landscape_template_refs && !f.place_template_refs && !f.templates_not_applicable).map((f) => f.pf_id));
  const bad = [];
  for (const f of fam) {
    for (const [col, kind] of [['landscape_template_refs', 'landscape'], ['land_use_template_refs', 'land_use'], ['place_template_refs', 'place'], ['water_body_template_refs', 'water_body']])
      for (const r of split(f[col])) if (reg.get(r)?.kind !== kind) bad.push(`${f.pf_id}.${col}: ${r}`);
    for (const r of split(f.route_template_refs)) if (!routes.has(r)) bad.push(`${f.pf_id}.route: ${r}`);
    for (const c of split(f.composes_with)) if (!pfSet.has(c)) bad.push(`${f.pf_id}.composes_with: ${c}`);
  }
  check('place_families', 'template_refs_resolve_in_seed_or_candidate', bad);
  const slotGaps = fam.flatMap((f) => ['facet_ground', 'facet_use_people', 'facet_senses_traces', 'facet_risks_upkeep'].filter((s) => !f[s]).map((s) => `${f.pf_id}.${s}`));
  check('place_families', 'facet_slots_filled (info)', [], { empty_slots: slotGaps });
  const layers = readJson(P('scripts/pf-authoring.json')).layer_vocabulary.layers;
  check('place_families', 'layers_in_m2c_vocabulary', fam.flatMap((f) => split(f.layers_applicable).filter((l) => !layers.includes(l)).map((l) => `${f.pf_id}: ${l}`)));

  const g4types = new Set(readTsv(V6_G4).map((r) => r.g4_location_type));
  const g4c = readCsv(P('places/crosswalk_v6_g4_location_types.csv'));
  check('place_families', 'v6_198_g4_location_types_covered', [
    ...[...g4types].filter((t) => !g4c.some((r) => r.g4_location_type === t)).map((t) => `missing ${t}`),
    ...g4c.filter((r) => r.mapping_status === 'unmapped' || (r.mapping_status === 'mapped' && !r.pf_ids)).map((r) => `unmapped ${r.g4_location_type}`),
    ...g4c.flatMap((r) => split(r.pf_ids).filter((p) => !pfSet.has(p)).map((p) => `${r.g4_location_type}: bad pf ${p}`)),
  ], { v6_types: g4types.size, mapped: g4c.filter((r) => r.mapping_status === 'mapped').length, not_applicable: g4c.filter((r) => r.mapping_status === 'not_applicable').length });
  const sc = readCsv(P('places/crosswalk_scene_templates.csv'));
  check('place_families', 'spatial_v3_17_scene_templates_covered', [
    ...ex.scene_templates.filter((s) => !sc.some((r) => r.scene_template_ref === `${s.id}@${s.version}` && (r.pf_ids || r.mapping_status === 'not_applicable'))).map((s) => s.id),
    ...sc.flatMap((r) => split(r.pf_ids).filter((p) => !pfSet.has(p)).map((p) => `${r.scene_template_ref}: bad pf ${p}`)),
  ], { scene_templates: ex.scene_templates.length });
  const mc = readCsv(P('places/crosswalk_master_location_archetypes.csv'));
  check('place_families', 'master_location_archetypes_covered', mc.filter((r) => r.mapping_status === 'unmapped').map((r) => r.location_archetype).concat(mc.flatMap((r) => split(r.pf_ids).filter((p) => !pfSet.has(p)))), { archetypes: mc.length });
}

// ---- node_binding
{
  const nb = readCsv(P('places/node_binding.csv'));
  const count = (id) => nb.filter((r) => r.node_ref.replace(/@\d+$/, '') === id).length;
  const want = [...ex.g4nodes.map((n) => n.id), ...ex.g5.map((n) => n.g5_id)];
  check('node_binding', 'one_row_per_v17_g4_g5', want.filter((id) => count(id) !== 1).concat(nb.filter((r) => !want.includes(r.node_ref.replace(/@\d+$/, ''))).map((r) => 'extra ' + r.node_ref)), { g4: ex.g4nodes.length, g5: ex.g5.length, rows: nb.length });
  check('node_binding', 'pf_exists_or_typed_gap', nb.filter((r) => (r.pf_id && !pfSet.has(r.pf_id)) || (!r.pf_id && r.binding_status !== 'gap')).map((r) => r.node_ref), { gaps: nb.filter((r) => r.binding_status === 'gap').map((r) => r.node_ref) });
  const localGapRefs = localAdditions.additions.flatMap((row) => row.start_territory_gap_refs);
  check('node_binding', 'declared_local_gap_nodes_are_bound', localGapRefs.filter((ref) => !nb.some((row) => row.node_ref === ref && row.pf_id && row.binding_status !== 'gap')), { refs: localGapRefs.length });
  const bad = [];
  for (const r of nb) {
    if (r.landscape_template_id && reg.get(r.landscape_template_id)?.kind !== 'landscape') bad.push(`${r.node_ref} landscape ${r.landscape_template_id}`);
    if (r.water_body_template_id && reg.get(r.water_body_template_id)?.kind !== 'water_body') bad.push(`${r.node_ref} water ${r.water_body_template_id}`);
    for (const p of split(r.pf_secondary)) if (!pfSet.has(p)) bad.push(`${r.node_ref} secondary ${p}`);
  }
  check('node_binding', 'template_refs_resolve', bad);
  // binding_basis files and ids exist.
  const basisFail = [];
  const natIds = new Set(ex.g4.map((g) => g.profile_id));
  const cw = readJson(P('scripts/crosswalk-rules.json'));
  for (const r of nb.filter((x) => x.binding_status !== 'gap')) {
    const files = [...r.binding_basis.matchAll(/(pr98:)?(data\/[\w\-./]+\.json)/g)];
    for (const m of files) {
      if (!m[1] && !fs.existsSync(path.join(REPO, m[2]))) basisFail.push(`${r.node_ref}: missing file ${m[0]}`);
    }
    const pid = r.binding_basis.match(/profile_id=([\w]+)/)?.[1];
    if (r.node_level === 'G4' && !natIds.has(pid)) basisFail.push(`${r.node_ref}: profile ${pid} not in extract`);
    const fn = r.binding_basis.match(/g4_function_to_pf\.map\.(\w+)/)?.[1];
    if (r.node_level === 'G4' && !(fn in cw.node_binding.g4_function_to_pf.map)) basisFail.push(`${r.node_ref}: rule key ${fn} missing`);
  }
  check('node_binding', 'binding_basis_files_and_ids_exist', basisFail);
  check('node_binding', 'secondary_access_exact_for_all_nodes', secondaryFailures(nb, ex, cw), { nodes_checked: ex.g4.length + ex.g5.length });
  const kinds = new Map(fam.map((f) => [f.pf_id, f.pf_kind]));
  const children = new Map();
  for (const row of nb.filter((r) => r.node_level === 'G5' && r.pf_id)) {
    if (!children.has(row.parent_node_ref)) children.set(row.parent_node_ref, new Set());
    children.get(row.parent_node_ref).add(row.pf_id);
  }
  const closureFailures = [], kindFailures = [];
  for (const row of nb) {
    const childPfs = children.get(row.node_ref) ?? new Set();
    if (row.node_level === 'G4') for (const pf of childPfs)
      if (pf !== row.pf_id && !split(row.pf_secondary).includes(pf)) closureFailures.push(`${row.node_ref}: missing child primary ${pf}`);
    const landscape = /(?:^|; )landscape=([^;]+)/.exec(row.authoring_axes)?.[1];
    const restricted = ['water', 'natural_wetland'].includes(kinds.get(row.pf_id)) ||
      (kinds.get(row.pf_id) === 'water_edge' && cw.node_binding.pf_secondary.primary_kind_rule.restricted_water_edge_landscapes.includes(landscape));
    if (restricted) for (const pf of split(row.pf_secondary))
      if (cw.node_binding.pf_secondary.primary_kind_rule.rejected_secondary_kinds.includes(kinds.get(pf)) && !childPfs.has(pf) &&
          !(kinds.get(row.pf_id) === 'water_edge' && kinds.get(pf) === 'natural_edge') &&
          !(row.authoring_axes.includes('land_use=forest_resource_use') &&
            cw.node_binding.pf_secondary.primary_kind_rule.forest_resource_use_exception.allowed_secondary_kinds.includes(kinds.get(pf))))
        kindFailures.push(`${row.node_ref}: incompatible ${pf}`);
  }
  check('node_binding', 'g4_contains_all_child_primary_pf', closureFailures);
  check('node_binding', 'secondary_primary_kind_compatibility', kindFailures);
  const seasonalPfs = fam.filter((f) => f.pf_kind === 'seasonal_overlay').map((f) => f.pf_id);
  const reached = new Set(nb.flatMap((node) => [node.pf_id, ...split(node.pf_secondary)]));
  const seasonalFailures = seasonalOverlayFailures(nb, fam, readCsv(P('presence/presence_rules.csv')));
  check('node_binding', 'reached_seasonal_overlay_presence_own_season', seasonalFailures,
    { reached_seasonal_pfs: seasonalPfs.filter((pf) => reached.has(pf)), violations: seasonalFailures });
}

// ---- presence_rules
{
  const rule = readJson(P('presence/frequency_rule.json'));
  const pr = readCsv(P('presence/presence_rules.csv'));
  const rebuiltResult = buildPresenceRules({ write: false });
  const rebuilt = rebuiltResult.rows;
  const columns = Object.keys(pr[0]);
  const values = (row) => columns.map((column) => Array.isArray(row[column]) ? row[column].join(';') : String(row[column] ?? ''));
  check('presence_rules', 'matches_current_input_pools', [
    ...(pr.length === rebuilt.length ? [] : [`rows ${pr.length} != rebuilt ${rebuilt.length}`]),
    ...pr.flatMap((row, i) => rebuilt[i] && JSON.stringify(values(row)) !== JSON.stringify(values(rebuilt[i])) ? [`row ${i + 2}: ${row.pr_id}`] : []),
  ], { rows: pr.length, rebuilt_rows: rebuilt.length });
  check('presence_rules', 'canonical_unique_identity', presenceIds(pr));
  const cats = new Set(readCsv(P('categories/category_registry.csv')).map((r) => r.category_id));
  const nb = readCsv(P('places/node_binding.csv'));
  const nodes = new Set(nb.map((r) => r.node_ref.replace(/@\d+$/, '')));
  const occupations = new Set(readTsv(path.join(REPO, 'data/novgorod-region/novgorod_occupations_v1.tsv')).map((r) => r.occupation_id));
  const roles = new Set(readTsv(path.join(REPO, 'data/novgorod-region/novgorod_social_roles_v1.tsv')).map((r) => r.role_id));
  const itemSources = readCsv(P('../items-household-personal/items/item_place_frequency.csv'));
  const itemById = new Map(itemSources.map((row) => [row.ipf_id, row]));
  const peopleSources = readCsv(P('presence/people_presence_authoring.csv'));
  const itemConditions = ['entry_visible_if', 'search_only_if', 'entry_exposed_weight', 'search_concealed_weight', 'placement_basis_ref', 'placement_owner_ref', 'wild_arrival_cause_required'];
  const f = [];
  for (const r of pr) {
    const c = rule.classes[r.frequency_class];
    if (!c) f.push(`${r.pr_id}: class ${r.frequency_class}`);
    else if (+r.probability_ppm !== Math.round((1000000 * c.weight) / 8) || +r.probability_ppm !== c.probability_ppm) f.push(`${r.pr_id}: ppm ${r.probability_ppm} != rule`);
    if (r.subject_kind === 'category') { if (!cats.has(r.category_ref) || r.subject_ref !== r.category_ref) f.push(`${r.pr_id}: category ${r.category_ref}`); }
    else if (!({ occupation: occupations, social_role: roles })[r.subject_kind]?.has(r.subject_ref) || r.category_ref) f.push(`${r.pr_id}: subject ${r.subject_kind}:${r.subject_ref}`);
    const ok = { place_family: pfSet.has(r.scope_ref), g4: nodes.has(r.scope_ref), g5: nodes.has(r.scope_ref), region: r.scope_ref === ex.region_id,
      landscape_template: reg.get(r.scope_ref)?.kind === 'landscape', place_template: reg.get(r.scope_ref)?.kind === 'place', scene_template: ex.scene_templates.some((s) => s.id === r.scope_ref), container_template: /^container_tpl_/.test(r.scope_ref) }[r.scope_kind];
    if (!ok) f.push(`${r.pr_id}: scope ${r.scope_kind}:${r.scope_ref}`);
    if (!(Number.isInteger(+r.count_limit) && +r.count_limit >= 1)) f.push(`${r.pr_id}: count_limit`);
    if (!['pool_row', 'pool_count_limit_rule', 'default_minimum_1', 'people_authoring'].includes(r.count_limit_basis)) f.push(`${r.pr_id}: count_limit_basis`);
    const s = split(r.allowed_seasons);
    if (!s.length || s.some((x) => x !== 'all' && !SEASONS.includes(x))) f.push(`${r.pr_id}: seasons ${r.allowed_seasons}`);
    const times = split(r.allowed_times);
    if (r.subject_kind === 'category' ? r.allowed_times !== 'all' : !times.length || times.some((t) => !TIME_ORDER.includes(t)) || r.allowed_times !== TIME_ORDER.filter((t) => times.includes(t)).join(';')) f.push(`${r.pr_id}: time ${r.allowed_times}`);
    if (r.subject_kind !== 'category' && (!r.guards || r.status !== 'candidate' || !r.source_refs)) f.push(`${r.pr_id}: people provenance/guards/status`);
    if (r.subject_kind !== 'category') {
      const sourceRows = split(r.source_pool).map((ref) => peopleSources[Number(ref.match(/^presence\/people_presence_authoring\.csv#row(\d+)$/)?.[1]) - 2]);
      if (!sourceRows.length || sourceRows.some((source) => !source || source.creation_owner !== 'presence_rule' || r.subject_kind !== source.subject_kind || r.subject_ref !== source.subject_ref || r.scope_kind !== source.scope_kind || r.scope_ref !== source.scope_ref || r.guards !== source.guards || (r.allowed_seasons === 'all' ? !SEASONS.every((season) => split(source.allowed_seasons).includes(season)) : !split(source.allowed_seasons).includes(r.allowed_seasons)) || +r.count_limit !== +source.count_limit || +r.probability_ppm !== +rule.classes[source.frequency_class]?.probability_ppm || r.refresh_class !== source.refresh_class || !r.source_refs.includes(source.source_refs))) f.push(`${r.pr_id}: people source subject/season/guards/probability differ from authoring`);
      const supported = new Set(sourceRows.flatMap((source) => source ? split(source.allowed_times) : []));
      if (times.some((time) => !supported.has(time)) || [...supported].some((time) => !times.includes(time))) f.push(`${r.pr_id}: people time union lacks source or output`);
    }
    for (const col of itemConditions) if (!Object.hasOwn(r, col)) f.push(`${r.pr_id}: missing ${col} column`);
    const sources = split(r.source_pool);
    const itemRows = sources.filter((s) => s.startsWith(`${ITEM_PATH}#`));
    if (itemRows.length) {
      if (itemRows.length !== sources.length || r.subject_kind !== 'category') f.push(`${r.pr_id}: mixed item/category sources`);
      for (const source of itemRows) {
        const row = itemById.get(source.slice(ITEM_PATH.length + 1));
        if (!row) { f.push(`${r.pr_id}: unresolved item source ${source}`); continue; }
        for (const col of itemConditions) if (['placement_basis_ref', 'placement_owner_ref'].includes(col) ? !String(r[col]).split('|').map((v) => v.trim()).includes(row[col]) : r[col] !== row[col]) f.push(`${r.pr_id}: ${col} differs from ${source}`);
        if (!row.entry_visible_if || !row.search_only_if) f.push(`${r.pr_id}: item discovery conditions empty`);
        if (row.pf_class === 'wild' && r.wild_arrival_cause_required !== 'prior_visitor_loss_or_discard') f.push(`${r.pr_id}: wild item arrival cause missing`);
      }
    } else if (itemConditions.some((col) => r[col])) f.push(`${r.pr_id}: non-item discovery conditions`);
    if (!rule.refresh_rule.values.includes(r.refresh_class)) f.push(`${r.pr_id}: refresh ${r.refresh_class}`);
  }
  check('presence_rules', 'rows_resolve_and_follow_rule', f, { rows: pr.length });
  check('presence_rules', 'one_rule_per_base_key_and_season', seasonOverlaps(pr));
  const rr = readJson(P('reports/presence-rules-report.json'));
  check('presence_rules', 'subregion_scope_report_current', isDeepStrictEqual(rr.subregion_scope, rebuiltResult.report.subregion_scope) ? [] : ['report differs from current builder'], {
    scoped_rules: rr.subregion_scope?.scoped_rules,
  });
  const expected = [], itemRows = new Map();
  const add = (pool, scope, seasons, times = ['']) => { for (const season of seasons) for (const time of times) expected.push({ pool, scope, season, time, key: `${pool}|${scope}|${season}|${time}` }); };
  if (itemById.size !== itemSources.length || itemById.has('')) throw new Error('duplicate or empty item ipf_id');
  itemSources.forEach((row) => {
    if (!row.category_id || !cats.has(row.category_id)) return;
    const pool = `${ITEM_PATH}#${row.ipf_id}`;
    const scope = `place_family|pf_${row.pf_id}|||category|${row.category_id}`;
    itemRows.set(pool, row);
    add(pool, scope, split(row.allowed_seasons));
  });
  const faunaSources = readCsv(P('../fauna-mammals-birds/fauna/wild_habitat_presence.csv'));
  if (new Set(faunaSources.map((row) => row.presence_id)).size !== faunaSources.length || faunaSources.some((row) => !row.presence_id)) throw new Error('duplicate or empty fauna presence_id');
  faunaSources.forEach((row) => {
    const scope = `place_family|${row.pf_id}|${row.region_id}|${row.subregion_scope || ''}|category|${row.category_ref}`;
    add(`${FAUNA_PATH}#${row.presence_id}`, scope, row.season === 'all' ? SEASONS : [row.season]);
  });
  peopleSources.forEach((row, i) => {
    if (row.creation_owner !== 'presence_rule') return;
    const scope = `${row.scope_kind}|${row.scope_ref}|region_novgorod_land||${row.subject_kind}|${row.subject_ref}`;
    add(`presence/people_presence_authoring.csv#row${i + 2}`, scope, split(row.allowed_seasons), split(row.allowed_times));
  });
  check('presence_rules', 'accepted_occurrences_exactly_once', acceptedCoverage(expected, pr, rr.resolutions, itemRows), { accepted_occurrences: expected.length });
  check('presence_rules', 'subregion_scope_matches_source', subregionPropagationFailures(pr, faunaSources), {
    dictionary: SUBREGIONS, scoped_rules: pr.filter((row) => row.subregion_scope).length,
  });
  check('presence_rules', 'item_variant_selection_gap', itemVariantSelection(rr.resolutions, rr.item_variant_selection), {
    variant_keys: rr.item_variant_selection?.variant_keys, item_alternatives: rr.item_variant_selection?.item_alternatives,
  });
  if (process.argv.includes('--self-test')) {
    if (!itemVariantSelection(rr.resolutions, { ...rr.item_variant_selection, activation_requirement: { ...rr.item_variant_selection.activation_requirement, implementation_present: true } }).some((f) => f.startsWith('activation_requirement:'))) throw new Error('item variant selection mutation probe failed');
    console.log('PASS presence_rules / item_variant_selection_negative_probe');
    const target = rr.resolutions.find((r) => r.variants.some((v) => v.item_ref === 'it_ps_leather_purse'));
    if (!target) throw new Error('leather purse variant probe target missing');
    const altered = rr.resolutions.map((r) => r === target ? { ...r, variants: r.variants.filter((v) => v.item_ref !== 'it_ps_leather_purse') } : r);
    const targetPool = target.variants.find((v) => v.item_ref === 'it_ps_leather_purse').source_pool;
    const reorderedItems = new Map([...itemSources].reverse().map((row) => [`${ITEM_PATH}#${row.ipf_id}`, row]));
    if (acceptedCoverage(expected, pr, rr.resolutions, reorderedItems).length) throw new Error('item source reorder probe failed');
    reorderedItems.delete(targetPool);
    if (!acceptedCoverage(expected, pr, rr.resolutions, reorderedItems).some((failure) => failure.includes(`source ${targetPool}`))) throw new Error('deleted item source probe failed');
    console.log('PASS presence_rules / stable_item_source_reorder_and_delete_probes');
    const faunaPool = pr.flatMap((r) => split(r.source_pool)).find((pool) => pool.startsWith(`${FAUNA_PATH}#`));
    const reorderedFauna = [...expected.filter((source) => !source.pool.startsWith(`${FAUNA_PATH}#`)), ...expected.filter((source) => source.pool.startsWith(`${FAUNA_PATH}#`)).reverse()];
    if (acceptedCoverage(reorderedFauna, pr, rr.resolutions, itemRows).length) throw new Error('fauna source reorder probe failed');
    if (!acceptedCoverage(reorderedFauna.filter((source) => source.pool !== faunaPool), pr, rr.resolutions, itemRows).some((failure) => failure.startsWith('unexpected ') && failure.includes(faunaPool))) throw new Error('deleted fauna source probe failed');
    console.log('PASS presence_rules / stable_fauna_source_reorder_and_delete_probes');
    const scopedRule = pr.find((rule) => rule.subregion_scope && split(rule.source_pool).some((pool) => pool.startsWith(`${FAUNA_PATH}#`)));
    const blankRule = pr.find((rule) => !rule.subregion_scope && split(rule.source_pool).some((pool) => pool.startsWith(`${FAUNA_PATH}#`)));
    if (!scopedRule || !subregionPropagationFailures([{ ...scopedRule, subregion_scope: '' }], faunaSources).some((failure) => failure.includes('subregion_scope differs'))) throw new Error('scoped fauna propagation mutation probe failed');
    if (!blankRule || !subregionPropagationFailures([{ ...blankRule, subregion_scope: SUBREGIONS[0] }], faunaSources).some((failure) => failure.includes('subregion_scope differs'))) throw new Error('blank fauna propagation mutation probe failed');
    console.log('PASS presence_rules / subregion_scope_propagation_negative_probes');
    const probe = acceptedCoverage(expected, pr.map((r) => {
      if ([r.scope_kind, r.scope_ref, r.region_id, r.subregion_scope || '', r.subject_kind, r.subject_ref].join('|') !== target.key) return r;
      return { ...r, variants: JSON.stringify(JSON.parse(r.variants || '[]').filter((v) => v.item_ref !== 'it_ps_leather_purse')) };
    }), altered, itemRows);
    if (!probe.some((f) => f.startsWith(`orphan ${targetPool}|`))) throw new Error('leather purse variant orphan diagnostic missing');
    console.log('PASS presence_rules / leather_purse_variant_orphan_negative_probe');
  }
  const people = pr.filter((r) => r.subject_kind !== 'category');
  const expectedPf = new Set(nb.map((r) => r.pf_id).filter(Boolean));
  const peopleComposition = readJson(P('presence/people_composition_authoring.json'));
  const expectedBoundPfCount = 16 + localAdditions.additions.length;
  check('presence_rules', 'people_cover_bound_pf_or_explicit_empty_composition', [
    ...[...expectedPf].filter((id) => !people.some((r) => r.scope_ref === id) && !peopleComposition.compositions.some((c) => c.pf_id === id && (c.population_groups.length || c.empty_reason))).map((id) => `missing ${id}`),
    ...(expectedPf.size === expectedBoundPfCount ? [] : [`expected ${expectedBoundPfCount} PF, got ${expectedPf.size}`]),
    ...(nb.filter((r) => r.node_level === 'G4').length === 32 && nb.filter((r) => r.node_level === 'G5').length === 195 ? [] : ['expected 32 G4 / 195 G5']),
  ], { people_rules: people.length, place_families: expectedPf.size, g4: nb.filter((r) => r.node_level === 'G4').length, g5: nb.filter((r) => r.node_level === 'G5').length });
  const crosswalks = [
    ['livestock', '../fauna-fish-invertebrates-livestock/fauna/rpgr_pf_crosswalk.csv', ['rule_ref', 'pf_id'], (r) => Boolean(r.no_source)],
    ['buildings', '../buildings-interiors-containers/buildings/sf_pf_crosswalk.csv', ['sf_id', 'pf_id'], (r) => Boolean(r.no_source)],
    ['food', '../food-drink/food/household_type_pf_crosswalk.csv', ['household_type', 'pf_id'], (r) => r.basis === 'no_source'],
    ['tools', '../crafts-tools-processes/craft_tools_gear/occupation_pf_crosswalk.csv', ['occupation_id', 'pf_id'], (r) => r.basis === 'no_source'],
    ['weapons', '../items-weapons-armour/items/role_tier_pf_crosswalk.csv', ['role_id', 'tier', 'pf_id'], (r) => r.basis === 'no_source'],
  ];
  const crosswalkFailures = [];
  const crosswalkCounts = {};
  for (const [name, file, keys, isGap] of crosswalks) {
    const rows = readCsv(P(file));
    const linkedRows = rows.filter((r) => !isGap(r));
    const gapRows = rows.filter(isGap);
    const linkedPf = new Set(linkedRows.map((r) => r.pf_id).filter(Boolean));
    const gapPf = new Set(gapRows.map((r) => r.pf_id).filter(Boolean));
    const accountedPf = new Set([...linkedPf, ...gapPf]);
    const rowKeys = rows.map((r) => keys.map((key) => r[key]).join('|'));
    for (const row of linkedRows) {
      for (const key of keys) if (!row[key]) crosswalkFailures.push(`${name}: linked row missing ${key}`);
    }
    crosswalkCounts[name] = { rows: rows.length, linked_rows: linkedRows.length, no_source_rows: gapRows.length, linked_place_families: linkedPf.size, no_source_place_families: gapPf.size };
    for (const id of expectedPf) if (!accountedPf.has(id)) crosswalkFailures.push(`${name}: unaccounted ${id}`);
    for (const id of accountedPf) if (!pfSet.has(id)) crosswalkFailures.push(`${name}: unknown ${id}`);
    for (const id of linkedPf) if (gapPf.has(id)) crosswalkFailures.push(`${name}: ${id} is both linked and no_source`);
    if (new Set(rowKeys).size !== rowKeys.length) crosswalkFailures.push(`${name}: duplicate key`);
    if (rows.some((r) => r.status !== 'candidate')) crosswalkFailures.push(`${name}: non-candidate status`);
  }
  check('presence_rules', 'c002_crosswalks_account_for_bound_pf', crosswalkFailures,
    { place_families: expectedPf.size, rows: crosswalkCounts });
  check('presence_rules', 'input_pool_rows_rejected (external)', Array(rr.rejected_rows).fill('x'), { reasons: rr.reject_reasons, by_file: rr.rejected_by_file }, true);
}

// ---- materialization_slot_rules
{
  const slots = readCsv(P('slots/materialization_slot_rules.csv'));
  const candidates = readCsv(P('slots/slot_candidates.csv'));
  const policy = readJson(P('slots/materialization_rules.json'));
  const gaps = readCsv(P('slots/no_required_slots.csv'));
  const boundPf = new Set(readCsv(P('places/node_binding.csv')).map((r) => r.pf_id).filter(Boolean));
  const cats = new Set(readCsv(P('categories/category_registry.csv')).map((r) => r.category_id));
  const buildings = new Map(readCsv(P('../buildings-interiors-containers/buildings/building_types.csv')).map((r) => [r.bt_id, r]));
  const routeModes = new Map(readCsv(P('../transport-health-recreation/transport_travel/route_modes.csv')).map((r) => [r.route_template_id, r]));
  const ruralMix = readCsv(P('../buildings-interiors-containers/buildings/settlement_building_mix.csv')).filter((r) => r.sf_id === 'sf_yard_peasant');
  const transport = new Set(readCsv(P('../transport-health-recreation/transport_travel/transport_entities.csv')).map((r) => r.tr_id));
  const presence = readCsv(P('presence/presence_rules.csv'));
  const f = [];
  const ids = new Set();
  const covered = new Set();
  const rules = new Map(policy.rules.map((r) => [r.id, r]));
  if (policy.application_scope !== 'once_per_g4_complex' || policy.g5_policy !== 'code_selects_applicable_g5_within_g4' || policy.pf_secondary_policy !== 'no_automatic_required_slot_from_secondary_pf') f.push('application scope/G5/secondary PF policy');
  if (rules.size !== policy.rules.length) f.push('duplicate rule id');
  for (const rule of policy.rules) if (!/^MSR-C003-/.test(rule.id) || !rule.text || !rule.basis || !['A', 'B', 'C'].includes(rule.confidence)) f.push(`invalid rule ${rule.id}`);
  for (const r of slots) {
    if (ids.has(r.slot_id) || !r.slot_id) f.push(`duplicate/empty slot_id ${r.slot_id}`);
    ids.add(r.slot_id);
    if (!boundPf.has(r.pf_id)) f.push(`${r.slot_id}: unbound PF ${r.pf_id}`);
    covered.add(r.pf_id);
    if (!['anchor', 'item', 'container', 'building', 'npc'].includes(r.slot_kind) || !['true', 'false'].includes(r.required)) f.push(`${r.slot_id}: kind/required`);
    if (!/^\d+$/.test(r.count_min) || !/^\d+$/.test(r.count_max) || +r.count_min > +r.count_max || (r.required === 'true' && +r.count_min < 1) || (r.required === 'false' && +r.count_min !== 0)) f.push(`${r.slot_id}: count/required`);
    if (!['all', 'winter'].includes(r.applicability) || (r.pf_id === 'pf_winter_ice_crossing') !== (r.applicability === 'winter')) f.push(`${r.slot_id}: applicability`);
    if (r.status !== 'candidate' || !['A', 'B', 'C'].includes(r.confidence) || !r.source_refs || !rules.has(r.rule_ref)) f.push(`${r.slot_id}: provenance/status/rule`);
    for (const c of split(r.candidate_category_refs)) if (!cats.has(c)) f.push(`${r.slot_id}: unknown category ${c}`);
    if (r.slot_kind === 'building' && fam.find((x) => x.pf_id === r.pf_id)?.pf_kind?.startsWith('natural')) f.push(`${r.slot_id}: natural building forbidden`);
    if (r.presence_relation !== 'identity_requirement_not_frequency' || split(r.candidate_category_refs).some((c) => presence.some((p) => p.scope_ref === r.pf_id && p.category_ref === c))) f.push(`${r.slot_id}: presence relation`);
  }
  const candidateKeys = new Set();
  for (const c of candidates) {
    const slot = slots.find((r) => r.slot_id === c.slot_id);
    const [kind, ref] = c.candidate_record_ref.split(':');
    const key = `${c.slot_id}|${c.candidate_record_ref}`;
    if (candidateKeys.has(key)) f.push(`duplicate candidate ${key}`);
    candidateKeys.add(key);
    if (!slot || !Number.isSafeInteger(+c.weight) || +c.weight < 1 || !c.source_refs || c.status !== 'candidate' || !['A', 'B', 'C'].includes(c.confidence)) f.push(`candidate provenance/weight/slot ${key}`);
    if (!(kind === 'building' && buildings.has(ref) || kind === 'transport' && transport.has(ref) || kind === 'route' && routes.has(ref))) f.push(`unresolved candidate ${key}`);
    if (slot && (slot.slot_kind === 'building' && kind !== 'building' || slot.slot_kind === 'anchor' && !['route', 'transport'].includes(kind))) f.push(`candidate kind ${key}`);
    if (kind === 'building' && slot && (!buildings.get(ref)?.pf_ids.split('|').includes(slot.pf_id.slice(3)) || !buildings.get(ref)?.source_refs)) f.push(`building owner/source ${key}`);
    if (slot?.slot_id === 'msr_ferry_crossing' && c.candidate_record_ref !== 'transport:trv_011') f.push(`unsupported ferry candidate ${key}`);
  }
  const mixByClass = (btClass) => new Set(ruralMix.filter((r) => buildings.get(r.member_id)?.bt_class === btClass).map((r) => `building:${r.member_id}`));
  const dwellingMix = mixByClass('dwelling');
  const dwellingCandidates = candidates.filter((c) => c.slot_id === 'msr_homestead_dwelling');
  for (const c of dwellingCandidates) if (!dwellingMix.has(c.candidate_record_ref)) f.push(`dwelling outside peasant settlement mix ${c.candidate_record_ref}`);
  for (const ref of dwellingMix) if (!dwellingCandidates.some((c) => c.candidate_record_ref === ref)) f.push(`missing peasant dwelling ${ref}`);
  const fenceMix = mixByClass('enclosure');
  const fenceCandidates = candidates.filter((c) => c.slot_id === 'msr_homestead_fence');
  const ruralFenceWeights = fenceCandidates.filter((c) => fenceMix.has(c.candidate_record_ref)).map((c) => +c.weight);
  const otherFenceWeights = fenceCandidates.filter((c) => !fenceMix.has(c.candidate_record_ref)).map((c) => +c.weight);
  if (!ruralFenceWeights.length || Math.max(...ruralFenceWeights) < Math.max(0, ...otherFenceWeights)) f.push('peasant fence mix has lower weight than editorial alternative');
  for (const c of fenceCandidates.filter((c) => !fenceMix.has(c.candidate_record_ref))) if (c.confidence !== 'C' || c.source_refs.includes('wk:claim:settlement-post-fence-yard')) f.push(`urban fence claim used as rural basis ${c.candidate_record_ref}`);
  for (const r of slots) if (!candidates.some((c) => c.slot_id === r.slot_id)) f.push(`${r.slot_id}: no candidates`);
  for (const rule of rules.keys()) if (!slots.some((r) => r.rule_ref === rule)) f.push(`unused rule ${rule}`);
  for (const r of gaps) {
    if (!boundPf.has(r.pf_id) || covered.has(r.pf_id) || !r.reason || !r.source_refs || r.status !== 'candidate' || !['A', 'B', 'C'].includes(r.confidence)) f.push(`${r.pf_id}: invalid no-required-slot record`);
    covered.add(r.pf_id);
  }
  for (const pf of boundPf) if (!covered.has(pf)) f.push(`uncovered ${pf}`);
  const expectedBoundPfCount = 16 + localAdditions.additions.length;
  const expectedGapCount = 12 + localAdditions.additions.length;
  if (boundPf.size !== expectedBoundPfCount || slots.length !== 5 || gaps.length !== expectedGapCount || covered.size !== expectedBoundPfCount) f.push(`coverage: ${boundPf.size} PF, ${slots.length} slots, ${gaps.length} gaps, ${covered.size} covered`);
  check('materialization_slot_rules', 'c003_required_slots_and_explicit_gaps', f, { slots: slots.length, candidates: candidates.length, gaps: gaps.length, place_families: covered.size });

  const variants = readJson(P('slots/slot_instance_variants.json'));
  const materials = new Set(readCsv(P('../buildings-interiors-containers/buildings/materials_vocab.csv')).map((r) => r.mat_id));
  const variantFailures = [];
  const variantIds = new Set();
  const variantKeys = new Set();
  const exact = (object, keys) => Object.keys(object).sort().join('|') === [...keys].sort().join('|');
  const targetFacets = {
    'transport:trv_011': ['material', 'size', 'condition'],
    'building:bt_izba_heated_single': ['condition', 'age'],
    'building:bt_wattle_fence': ['condition', 'age'],
  };
  const buildingAgeGap = 'данные не задают возраст этого конкретного экземпляра; runtime выбирает его из building_types.age_states';
  const targetFailures = (v, building) => [...new Set([...(targetFacets[v.candidate_record_ref] || []), ...(building ? ['age'] : [])])].flatMap((name) => {
    const facet = v.facets?.[name];
    if (!facet) return [`${v.variant_id}/${name}: missing facet`];
    const evidence = ['source_refs', 'rule_ref'].filter((route) => Boolean(facet[route]));
    const value = Boolean(facet.value || facet.value_ref);
    const gap = Boolean(facet.no_source);
    const failures = [];
    if (value === gap || (value && evidence.length !== 1) || (gap && evidence.length)) failures.push(`${v.variant_id}/${name}: concrete value needs one evidence route, otherwise explicit no_source`);
    if (gap && v.candidate_record_ref === 'transport:trv_011' &&
        !(name === 'material' ? /материал.*источник|источник.*материал/.test(facet.no_source) : /конкретн/.test(facet.no_source)))
      failures.push(`${v.variant_id}/${name}: gap reason`);
    if (building && ['condition', 'age'].includes(name)) {
      const states = name === 'condition' ? 'condition_states' : 'age_states';
      if (!building[states] || (gap && (!facet.no_source.includes('этого конкретного экземпляра') || !facet.no_source.includes('runtime выбирает') || !facet.no_source.includes(`building_types.${states}`))) ||
          (value && (!facet.value || !building[states].split('|').includes(facet.value))))
        failures.push(`${v.variant_id}/${name}: instance state or gap semantics`);
    }
    if (building && name === 'age' && facet.no_source !== buildingAgeGap) failures.push(`${v.variant_id}/age: building age gap`);
    return failures;
  });
  if (process.argv.includes('--self-test')) {
    for (const ref of Object.keys(targetFacets)) {
      const original = variants.find((v) => v.candidate_record_ref === ref);
      if (!original) throw new Error(`missing target variant ${ref}`);
      const [kind, id] = ref.split(':');
      for (const name of targetFacets[ref]) {
        const probe = { ...original, facets: { ...original.facets, [name]: { ...original.facets[name], value: '', value_ref: '', source_refs: '', rule_ref: '', no_source: '' } } };
        if (!targetFailures(probe, kind === 'building' ? buildings.get(id) : undefined).length) throw new Error(`slot variant missing value/gap probe failed: ${ref}/${name}`);
      }
    }
    for (const original of variants.filter((v) => v.candidate_record_ref.startsWith('building:'))) {
      const id = original.candidate_record_ref.slice('building:'.length);
      const probe = { ...original, facets: { ...original.facets, age: { ...original.facets.age, no_source: 'возраст конкретного экземпляра не установлен' } } };
      if (!targetFailures(probe, buildings.get(id)).some((failure) => failure.includes('building age gap'))) throw new Error(`slot variant building age gap probe failed: ${original.variant_id}`);
    }
    console.log('PASS slot_instance_variants / missing_value_gap_negative_probes');
  }
  for (const v of variants) {
    const key = `${v.slot_id}|${v.candidate_record_ref}`;
    if (!exact(v, ['variant_id', 'slot_id', 'candidate_record_ref', 'weight', 'applicability', 'facets', 'status']) || variantIds.has(v.variant_id) || !/^siv_\d{3}$/.test(v.variant_id)) variantFailures.push(`${key}: keys/id`);
    variantIds.add(v.variant_id);
    variantKeys.add(key);
    const candidate = candidates.find((c) => `${c.slot_id}|${c.candidate_record_ref}` === key);
    const slot = slots.find((s) => s.slot_id === v.slot_id);
    if (!candidate || !slot || v.weight !== Number(candidate.weight) || v.applicability !== slot.applicability || v.status !== 'candidate') variantFailures.push(`${key}: candidate/weight/applicability/status`);
    if (!v.facets || !exact(v.facets, ['material', 'size', 'condition', 'age'])) { variantFailures.push(`${key}: facets`); continue; }
    const [kind, id] = v.candidate_record_ref.split(':');
    const building = kind === 'building' ? buildings.get(id) : undefined;
    variantFailures.push(...targetFailures(v, building));
    for (const [name, facet] of Object.entries(v.facets)) {
      if (!facet || !exact(facet, ['value', 'value_ref', 'source_refs', 'rule_ref', 'no_source', 'confidence'])) { variantFailures.push(`${key}/${name}: keys`); continue; }
      const routes = ['source_refs', 'rule_ref', 'no_source'].filter((route) => Boolean(facet[route]));
      if (routes.length !== 1 || !['A', 'B', 'C'].includes(facet.confidence) || (facet.no_source ? Boolean(facet.value || facet.value_ref) : !Boolean(facet.value || facet.value_ref))) variantFailures.push(`${key}/${name}: evidence/value`);
      if (facet.source_refs && facet.source_refs.split('|').some((ref) => !ref.startsWith('book:') && !building?.source_refs.split('|').includes(ref))) variantFailures.push(`${key}/${name}: source`);
      if (facet.rule_ref && facet.rule_ref !== (name === 'material' && building ? `building:${id}.materials` : `route_modes.csv#${routeModes.get(id)?.rm_id}.game_use_ru`)) variantFailures.push(`${key}/${name}: rule`);
      if (name === 'material' && facet.value_ref && (!building || facet.value_ref !== building.materials || facet.value_ref.split('|').some((ref) => !materials.has(ref)))) variantFailures.push(`${key}: material ref`);
      if (name === 'material' && kind === 'route' && facet.value !== routeModes.get(id)?.game_use_ru) variantFailures.push(`${key}: route material`);
      if (name === 'size' && facet.value && facet.value !== building?.size_note && !facet.source_refs.startsWith('book:')) variantFailures.push(`${key}: size ref`);
      if (['condition', 'age'].includes(name) && facet.rule_ref) variantFailures.push(`${key}/${name}: catalogue states are not instance values`);
    }
  }
  for (const key of candidateKeys) if (!variantKeys.has(key)) variantFailures.push(`${key}: no variant`);
  if (variantKeys.size !== variants.length || variantKeys.size !== new Set(candidates.map((c) => `${c.slot_id}|${c.candidate_record_ref}`)).size) variantFailures.push('duplicate or missing variant candidate');
  check('slot_instance_variants', 'all_candidates_and_four_sourced_or_gap_facets', variantFailures, { variants: variants.length, candidates: candidates.length });
}

// ---- category_registry
{
  const r = readJson(P('reports/category-registry-report.json'));
  const own = readCsv(P('categories/place_family_categories.csv'));
  const ownIds = new Set(own.map((x) => x.category_id));
  const ownFail = [];
  const codes = new Set();
  for (const x of own) { if (codes.has(x.stable_code)) ownFail.push('dup ' + x.stable_code); codes.add(x.stable_code); if (x.parent_category_id && !ownIds.has(x.parent_category_id)) ownFail.push('parent ' + x.category_id); }
  const ownProblems = r.problems.filter((p) => (p.category_id && ownIds.has(p.category_id)) || (p.category_ids && p.category_ids.some((c) => ownIds.has(c))));
  check('category_registry', 'own_place_family_categories_valid', ownFail.concat(ownProblems.map((p) => p.kind + ' ' + (p.category_id ?? p.stable_code))), { rows: own.length });
  const ext = r.problems.filter((p) => !ownProblems.includes(p));
  check('category_registry', 'collected_registry_unique_parents_no_cycles (external)', ext.map((p) => p.kind), { problems_by_kind: r.problems_by_kind, registry_rows: r.registry_rows }, true);
  check('category_registry', 'pool_category_references_resolve (external)', Array(r.unresolved_references).fill('x'), { unresolved_by_file: r.unresolved_by_file }, true);
}

// ---- place_generation_limits
{
  const L = readCsv(P('limits/place_generation_limits.csv'));
  const g4 = new Set(ex.g4nodes.map((n) => n.id));
  const f = [];
  for (const r of L) {
    for (const [a, b] of [['households_min', 'households_max'], ['residents_min', 'residents_max'], ['npc_present_min', 'npc_present_max'], ['g4_zones_min', 'g4_zones_max']])
      if (r[a] !== '' && r[b] !== '' && +r[a] > +r[b]) f.push(`${r.pgl_id}: ${a} > ${b}`);
    const ok = { place_template: reg.get(r.scope_ref)?.kind === 'place', place_family: pfSet.has(r.scope_ref), g4: g4.has(r.scope_ref) }[r.scope_kind];
    if (!ok) f.push(`${r.pgl_id}: scope ${r.scope_ref}`);
    if (r.scope_kind === 'place_template') {
      const h = parseHouseholds(r.household_estimate_text);
      if ((h?.min ?? '') + '' !== r.households_min || (h?.max ?? '') + '' !== r.households_max) f.push(`${r.pgl_id}: households not reproducible by rule`);
    }
  }
  check('place_generation_limits', 'min_le_max_scope_exists_rule_reproducible', f, { rows: L.length });
}

// ---- category_parameters
{
  const cp = readCsv(P('parameters/category_parameters.csv'));
  const defs = new Set(readCsv(P('parameters/parameter_definitions.csv')).map((r) => r.parameter_key));
  const cats = new Set(readCsv(P('categories/category_registry.csv')).map((r) => r.category_id));
  const f = [];
  for (const r of cp) {
    if (!cats.has(r.category_id)) f.push(`${r.cp_id}: category`);
    if (!defs.has(r.parameter_key)) f.push(`${r.cp_id}: parameter`);
    if (!r.assignment_rule || !r.rule_basis) f.push(`${r.cp_id}: rule/basis`);
    if (r.value_is_sourced !== 'true' && /^\d+(\.\d+)?$/.test(r.allowed_values_or_range)) f.push(`${r.cp_id}: number without source`);
  }
  const byCat = cp.reduce((a, r) => ((a[r.category_id] ??= new Set()).add(r.parameter_key), a), {});
  for (const [c, ks] of Object.entries(byCat)) for (const k of ['mass_g', 'primary_material', 'value_band']) if (!ks.has(k)) f.push(`${c}: missing ${k}`);
  check('category_parameters', 'leaf_required_params_rules_refs', f, { rows: cp.length, categories: Object.keys(byCat).length });
}

const own = checks.filter((c) => !c.external);
const out = { generated_by: 'scripts/validate.mjs', own_checks_passed: own.filter((c) => c.pass).length, own_checks_total: own.length, checks };
writeJson(P('reports/validation.json'), out);
for (const c of checks) console.log(`${c.pass ? 'PASS' : c.external ? 'INFO' : 'FAIL'} ${c.domain} / ${c.name}${c.failures ? ` (${c.failures})` : ''}`);
if (own.some((c) => !c.pass)) process.exit(1);
