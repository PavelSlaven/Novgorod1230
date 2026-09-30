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
const check = (domain, name, failures, extra = {}, external = false) => checks.push({ domain, name, pass: failures.length === 0, failures: failures.length, sample: failures.slice(0, 1000), external, ...extra });
const P = (...p) => path.join(GROUP, ...p);
const TIME_ORDER = ['morning', 'day', 'evening', 'night'];
const ENVIRONMENT_KINDS = ['surface_state', 'water_state', 'weather_effect', 'sound', 'odor', 'animal_sign', 'work_trace', 'domestic_trace', 'vegetation', 'waste', 'object_arrangement', 'light_smoke'];
const ENVIRONMENT_SENSES = ['physical', 'visual', 'audible', 'olfactory'];
const ENVIRONMENT_BASES = ['sourced', 'analogy', 'logical_necessity', 'editorial'];
const ENVIRONMENT_REEVALUATION = ['first_observation', 'season_change', 'weather_change', 'time_slot_change', 'presence_change', 'process_change'];
const ENVIRONMENT_LENSES = ['sound', 'odor', 'seasonal_surface', 'domestic_animal', 'human_companion', 'wild_animal', 'ruderal_plant', 'work_waste', 'loose_object', 'light_smoke', 'weather', 'daypart_marker'];
const ENVIRONMENT_EXCLUSION_REASONS = ['physically_inapplicable', 'functionally_inapplicable', 'duplicate_of_other_lens'];
const ENVIRONMENT_SHARED_PHENOMENA = new Map([
  ['fog', 'weather'], ['frost', 'seasonal_surface'], ['rime', 'seasonal_surface'], ['snow', 'seasonal_surface'],
  ['snowfall', 'weather'], ['thaw_drip', 'seasonal_surface'], ['rain', 'weather'], ['wind', 'weather'],
  ['twilight', 'daypart_marker'], ['dawn', 'daypart_marker'], ['night_darkness', 'daypart_marker'],
  ['heat_dust_open', 'weather'], ['black_ice', 'seasonal_surface'],
]);
const ENVIRONMENT_SHARED_IDS = new Set([...ENVIRONMENT_SHARED_PHENOMENA.keys()].map((id) => `epr_shared__${id}`));
const environmentScopes = (row) => {
  const shared = split(row.pf_scope);
  return shared.length ? shared : row.pf_id ? [row.pf_id] : [];
};
const PEOPLE_GUARDED_DOMESTIC_FAUNA = new Set(['fa_dom_cat', 'fa_dom_dog', 'fa_dom_pigeon']);
const ENVIRONMENT_PF_CLASS_BY_ID = new Map([
  ...['pf_outbuildings', 'pf_cellar_granary', 'pf_bathhouse', 'pf_smithy', 'pf_mill', 'pf_threshing_barn',
    'pf_dwelling_interior', 'pf_church_interior', 'pf_ordinary_workshop', 'pf_grain_drying_shed_ovin']
    .map((pf) => [pf, 'interior']),
  ...['pf_river_channel', 'pf_winter_ice_crossing'].map((pf) => [pf, 'water_surface']),
  ...['pf_reality_batch_01_open_conditions', 'pf_reality_first_practical_conditions', 'pf_rural_yard',
    'pf_town_street', 'pf_market_square', 'pf_river_wharf', 'pf_town_courtyard', 'pf_town_wall_edge',
    'pf_riverbank', 'pf_floodplain_meadow', 'pf_lake_shore', 'pf_arable_field', 'pf_hay_meadow',
    'pf_broadleaf_woodland', 'pf_conifer_woodland', 'pf_mixed_woodland', 'pf_forest_edge', 'pf_bog',
    'pf_marshy_stream', 'pf_village_lane', 'pf_peasant_homestead', 'pf_churchyard', 'pf_monastery_yard',
    'pf_road', 'pf_bridge_crossing', 'pf_ferry_landing', 'pf_forest_track', 'pf_hunting_ground',
    'pf_orchard_garden', 'pf_pasture', 'pf_field_margin', 'pf_fishing_camp', 'pf_burial_ground']
    .map((pf) => [pf, 'open_place']),
]);
const ENVIRONMENT_FIRE_PROCESSES = new Set(['pc_smith_forging', 'pc_wax_candle', 'pc_birch_tar', 'pc_charcoal_pit', 'pc_pottery_wheel', 'pc_grain_drying_ovin']);
const ENVIRONMENT_FIRE_SCENES = new Set(['sc_scn001', 'sc_scn002', 'sc_scn008', 'sc_scn022', 'sc_x001_bathhouse', 'sc_x002_ovin']);
const ENVIRONMENT_DOG_SCENES = new Set(['sc_scn005', 'sc_scn006']);
const ENVIRONMENT_CHURCH_SCENES = new Set(['sc_scn009', 'sc_scn050', 'sc_scn051', 'sc_scn052']);
const ENVIRONMENT_PATH = 'presence/environment_presence_authoring.csv';
const ENVIRONMENT_EXCLUSIONS_PATH = 'presence/environment_lens_exclusions.csv';
const normalizeEnvironmentClusterText = (value) => String(value || '').normalize('NFC').trim().toLowerCase()
  .replace(/\s+/gu, ' ').replace(/[.;:]$/u, '');
const ENVIRONMENT_RU_SUFFIXES = ['иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ее', 'ое', 'ая', 'яя', 'ые', 'ие', 'ый', 'ий', 'ой', 'ую', 'юю', 'ах', 'ях', 'ам', 'ям', 'ов', 'ев', 'ей', 'ом', 'ем', 'а', 'я', 'ы', 'и', 'е', 'у', 'ю'];
const ENVIRONMENT_STOP_WORDS = new Set(['и', 'а', 'но', 'или', 'у', 'в', 'во', 'на', 'над', 'под', 'по', 'из', 'за', 'от', 'до', 'для', 'при', 'между', 'рядом', 'может', 'могут', 'видно', 'слышно', 'виден', 'видны', 'граница', 'правило', 'локально']);
const environmentStem = (token) => {
  if (!/^[а-яё]+$/u.test(token)) return token;
  const normalized = token.replaceAll('ё', 'е').replace(/[ьъ]/gu, '');
  for (const suffix of ENVIRONMENT_RU_SUFFIXES) if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 3)
    return normalized.slice(0, -suffix.length);
  return normalized;
};
const environmentTokens = (value) => normalizeEnvironmentClusterText(value).replaceAll('ё', 'е')
  .replace(/pf_[a-z0-9_]+/gu, ' <place> ').replace(/fa_[a-z0-9_]+|fl_[a-z0-9_]+/gu, ' <taxon> ')
  .replace(/[^a-zа-я0-9<>]+/gu, ' ').trim().split(/\s+/u).filter(Boolean)
  .map(environmentStem).filter((token) => !ENVIRONMENT_STOP_WORDS.has(token));
const environmentAliasTokens = (value) => new Set(environmentTokens(value).filter((token) => token.length >= 3));
const environmentComparable = (value, placeName = '', taxonNames = []) => {
  const place = environmentAliasTokens(placeName);
  const taxa = new Set(taxonNames.flatMap((name) => [...environmentAliasTokens(name)]));
  let sawPlace = false, sawTaxon = false;
  const out = [];
  for (const token of environmentTokens(value)) {
    if (place.has(token)) { if (!sawPlace) out.push('<place>'); sawPlace = true; continue; }
    if (taxa.has(token)) { if (!sawTaxon) out.push('<taxon>'); sawTaxon = true; continue; }
    out.push(token);
  }
  return out.join(' ');
};
const environmentDice = (left, right) => {
  const a = new Set(left), b = new Set(right);
  if (!a.size && !b.size) return 1;
  let overlap = 0;
  for (const value of a) if (b.has(value)) overlap++;
  return (2 * overlap) / (a.size + b.size);
};
const environmentTrigrams = (value) => {
  const compact = value.replace(/\s+/gu, ' ').trim();
  if (compact.length < 3) return compact ? [compact] : [];
  return [...Array(compact.length - 2)].map((_, index) => compact.slice(index, index + 3));
};
const environmentSimilarity = (left, right) => 0.7 * environmentDice(left.split(/\s+/u).filter(Boolean), right.split(/\s+/u).filter(Boolean)) +
  0.3 * environmentDice(environmentTrigrams(left), environmentTrigrams(right));
const environmentSlug = (row) => {
  if (row.env_rule_id.startsWith('epr_shared__')) return row.env_rule_id.slice('epr_shared__'.length);
  const pf = row.pf_id.slice(3);
  const legacyPrefix = `epr_${pf}__`;
  if (row.env_rule_id.startsWith(legacyPrefix)) return row.env_rule_id.slice(legacyPrefix.length);
  const roundMatch = row.env_rule_id.match(/^epr_r\d+_(.+)$/u);
  const roundPrefix = `${pf}_`;
  if (roundMatch?.[1].startsWith(roundPrefix)) return roundMatch[1].slice(roundPrefix.length);
  return null;
};
const catalogBoilerplateDerivation = (value) => {
  const normalized = normalizeEnvironmentClusterText(value);
  const catalogPremise = /(?:точн(?:ая|ые)\s+региональн|региональн[^→]{0,80}(?:pf|сезон)|habitat\s*row|точн(?:ая|ые)\s+pf-season|каталог|таблиц|сезонн.{0,20}(?:сведен|данн|запис)|мест.{0,12}обитан)/iu.test(normalized);
  const permission = /(?:допуска|разреша|связыва|указывает|подтвержда|может|возмож)/iu.test(normalized.split('→')[0] || '');
  const abstractResult = /→[^;]*(?:сигнал|след|присутств)[^;]*(?:может|возмож|прояв)/iu.test(normalized) || /→[^;]*(?:может|возмож)[^;]*(?:сигнал|след|присутств)/iu.test(normalized);
  const [cause = '', consequenceAndBoundary = ''] = normalized.split('→');
  const consequence = consequenceAndBoundary.split('; граница:')[0];
  const causeTokens = new Set(environmentTokens(cause));
  const consequenceTokens = new Set(environmentTokens(consequence));
  const hasPrefix = (tokens, prefixes) => [...tokens].some((token) => prefixes.some((prefix) => token.startsWith(prefix)));
  const semanticProfile = [
    hasPrefix(causeTokens, ['запис', 'строк', 'справочник', 'каталог', 'таблиц', 'данн', 'распространени', 'сезонн', 'season', 'habitat']) ||
      (hasPrefix(causeTokens, ['тип']) && hasPrefix(causeTokens, ['мест'])),
    hasPrefix(causeTokens, ['вид', 'таксон']),
    hasPrefix(causeTokens, ['показыва', 'подтвержда', 'отмеч', 'охватыва', 'допуска', 'разреша', 'указыва', 'связыва']),
    hasPrefix(consequenceTokens, ['сигнал', 'след', 'присутств']) && hasPrefix(consequenceTokens, ['может', 'возмож', 'прояв']),
  ];
  const overlap = semanticProfile.filter(Boolean).length;
  const semanticSimilarity = (2 * overlap) / (overlap + 4);
  const semanticBoilerplate = semanticProfile[0] && semanticProfile[2] && semanticProfile[3] && semanticSimilarity >= 0.85;
  return /chance\s*=|редакционн(?:ая|ой|ую)\s+подач/iu.test(normalized) || (catalogPremise && permission && abstractResult) || semanticBoilerplate;
};
const exactEntityRef = (ref) => {
  const typed = String(ref || '').replace(/^(fauna|flora|item):/, '');
  return typed.match(/#((?:fa|fl|fd|it|tl|trv|mt|nm|pc)_[a-z0-9_]+)$/)?.[1] || typed;
};
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
    const parts = [row.scope_kind, row.scope_ref, row.region_id];
    if (row.subregion_scope) parts.push(row.subregion_scope);
    parts.push(row.subject_kind, row.subject_ref);
    if (row.subject_kind === 'environment') parts.push(row.condition_key);
    parts.push(canonical);
    const key = JSON.stringify(parts.map((s) => String(s ?? '').trim()));
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
    const key = [r.scope_kind, r.scope_ref, r.region_id, r.subregion_scope || '', r.subject_kind, r.subject_ref,
      ...(r.subject_kind === 'environment' ? [r.condition_key] : [])].join('|');
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
  for (const rule of rules.filter((row) => row.subject_kind !== 'environment')) for (const season of rule.allowed_seasons === 'all' ? SEASONS : split(rule.allowed_seasons)) {
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

function environmentIndices() {
  const rows = (file) => readCsv(P(file));
  const values = (file, column) => new Set(rows(file).map((row) => row[column]).filter(Boolean));
  const ground = rows('../nature-materials-weather/weather_climate/ground_water_condition_rules.csv');
  const scenes = rows('../buildings-interiors-containers/interiors/scenes.csv');
  const sceneBindings = new Map();
  for (const row of scenes) {
    const pfIds = new Set(String(row.pf_ids || '').split('|').map((pf) => pf.trim()).filter(Boolean)
      .map((pf) => pf.startsWith('pf_') ? pf : `pf_${pf}`));
    const variant = String(row.season_variants || '').toLowerCase();
    const seasonWords = [['winter', /зим/u], ['spring', /весн/u], ['summer', /лет/u], ['autumn', /осен/u]];
    const seasons = new Set(seasonWords.filter(([, pattern]) => pattern.test(variant)).map(([season]) => season));
    const binding = { pfIds, seasons };
    for (const id of [row.sc_id, row.source_scene_id].filter(Boolean)) sceneBindings.set(id, binding);
  }
  const items = [
    ...rows('../items-household-personal/items/household.csv'),
    ...rows('../items-household-personal/items/personal.csv'),
  ];
  const families = rows('places/place_families.csv');
  const facetRows = rows('places/place_family_facets.csv');
  const templates = new Set(families.flatMap((row) => Object.entries(row)
    .filter(([column]) => column.endsWith('_refs'))
    .flatMap(([, value]) => split(value).map((ref) => ref.replace(/@\d+$/, '')))));
  const familyTokens = new Set(families.flatMap((row) => Object.values(row).flatMap((value) => split(value))));
  const weatherRefs = new Set(fs.readdirSync(P('../nature-materials-weather/weather_climate'))
    .filter((file) => file.endsWith('.csv')).flatMap((file) => rows(`../nature-materials-weather/weather_climate/${file}`))
    .flatMap((row) => Object.values(row).flatMap((value) => split(value))).filter((value) => /^wx[a-z0-9_]+$/.test(value)));
  const faunaDir = P('../fauna-mammals-birds/fauna');
  const faunaTaxonTables = [
    'data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/fauna/birds.csv',
    'data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/fauna/mammals.csv',
    'data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/fauna/fish.csv',
    'data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/fauna/invertebrates_herps.csv',
    'data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/fauna/livestock_species.csv',
  ];
  const faunaRowsByPath = new Map(faunaTaxonTables.map((sourcePath) => [sourcePath, readCsv(path.join(REPO, sourcePath))]));
  const faunaRows = [...faunaRowsByPath.values()].flat();
  const canonicalFaunaRows = faunaRows.filter((row) => row.status !== 'duplicate');
  const faunaRefs = new Set(canonicalFaunaRows.map((row) => row.fa_id).filter(Boolean));
  const faunaPrimaryIdsByPath = new Map([...faunaRowsByPath].map(([sourcePath, sourceRows]) =>
    [sourcePath, new Set(sourceRows.filter((row) => row.status !== 'duplicate').map((row) => row.fa_id).filter(Boolean))]));
  const faunaIds = canonicalFaunaRows.map((row) => row.fa_id).filter(Boolean);
  const regionalFauna = new Set(canonicalFaunaRows.filter((row) =>
    row.fa_id && (row.region_scope === 'region_novgorod_land' || row.presence_region_id === 'region_novgorod_land' || row.taxon_scope === 'universal'))
    .map((row) => row.fa_id));
  const floraTables = [
    '../flora-herbs-berries-mushrooms/flora/herbs_mosses_aquatic.csv',
    '../flora-herbs-berries-mushrooms/flora/cultivated_plants.csv',
    '../flora-herbs-berries-mushrooms/flora/berries_mushrooms.csv',
    '../flora-trees-shrubs/flora/trees_shrubs.csv',
  ];
  const floraRows = floraTables.flatMap(rows);
  const taxonNames = new Map([...faunaRows, ...floraRows].filter((row) => row.fa_id || row.fl_id)
    .map((row) => [row.fa_id || row.fl_id, row.name_ru]));
  const floraIds = floraRows.map((row) => row.fl_id).filter(Boolean);
  const floraRefs = new Set(floraRows.map((row) => row.fl_id).filter(Boolean));
  const regionalFlora = new Set(floraRows.filter((row) => row.fl_id &&
    (row.universal_taxon === 'true' || row.region_id === 'region_novgorod_land' || String(row.region_scope).includes('region_novgorod_land')))
    .map((row) => row.fl_id));
  const faunaMembership = new Set();
  const faunaActivity = new Map();
  const faunaPresenceRows = rows('../fauna-mammals-birds/fauna/wild_habitat_presence.csv');
  const faunaOtherPresenceRows = rows('../fauna-fish-invertebrates-livestock/fauna/fauna_presence.csv');
  const faunaPresencePaths = new Map([
    ['data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/fauna/wild_habitat_presence.csv', new Map(faunaPresenceRows.map((row) => [row.presence_id, {
      id: row.presence_id, faId: row.fa_id, pfId: row.pf_id, regionId: row.region_id, season: row.season,
    }]))],
    ['data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/fauna/fauna_presence.csv', new Map(faunaOtherPresenceRows.map((row) => [row.fpr_id, {
      id: row.fpr_id, faId: row.fa_id, pfId: row.pf_id.startsWith('pf_') ? row.pf_id : `pf_${row.pf_id}`,
      regionId: row.region_id, season: row.season_period === 'spring_rasputitsa' ? 'spring' : row.season_period,
    }]))],
  ]);
  const faunaPresenceById = new Map([...faunaPresencePaths.values()].flatMap((presenceMap) => [...presenceMap]));
  const addFaunaActivity = (key, state) => {
    if (!faunaActivity.has(key)) faunaActivity.set(key, new Set());
    faunaActivity.get(key).add(state);
  };
  for (const row of faunaPresenceRows) if (row.region_id === 'region_novgorod_land') {
    const key = `${row.fa_id}|${row.pf_id}|${row.season}`;
    faunaMembership.add(key);
    addFaunaActivity(key, row.state);
  }
  for (const row of faunaOtherPresenceRows) {
    const season = row.season_period === 'spring_rasputitsa' ? 'spring' : row.season_period;
    if (row.region_id === 'region_novgorod_land') {
      const key = `${row.fa_id}|${row.pf_id.startsWith('pf_') ? row.pf_id : `pf_${row.pf_id}`}|${season}`;
      faunaMembership.add(key);
      addFaunaActivity(key, row.activity_state);
    }
  }
  const floraMembership = new Set();
  const floraPresenceRows = rows('../flora-herbs-berries-mushrooms/flora/flora_habitat_presence.csv');
  const treePresenceRows = rows('../flora-trees-shrubs/flora/tree_habitat_presence.csv');
  for (const row of floraPresenceRows) {
    regionalFlora.add(row.fl_id);
    if (row.region_id === 'region_novgorod_land') floraMembership.add(`${row.fl_id}|${row.pf_id.startsWith('pf_') ? row.pf_id : `pf_${row.pf_id}`}|${row.season}`);
  }
  for (const row of treePresenceRows) {
    regionalFlora.add(row.fl_id);
    if (row.region_id === 'region_novgorod_land') floraMembership.add(`${row.fl_id}|${row.pf_id}|${row.season}`);
  }
  const toolRows = rows('../crafts-tools-processes/craft_tools_gear/tools_gear.csv');
  const transports = values('../transport-health-recreation/transport_travel/transport_entities.csv', 'tr_id');
  const denied = rows('../crafts-tools-processes/materials_registry/late_materials_denylist.csv')
    .filter((row) => ['deny', 'deny_as_local'].includes(row.verdict))
    .flatMap((row) => split(row.match_stems).map((pattern) => ({ id: row.dl_id, pattern: pattern.toLowerCase(), match: 'prefix' })));
  denied.push(...rows('../fauna-fish-invertebrates-livestock/fauna/anachronism_denylist_fauna.csv')
    .flatMap((row) => String(row.patterns || '').split('|').map((pattern) => ({ id: row.deny_id, pattern: pattern.trim(), match: 'regex' })).filter((row) => row.pattern)));
  denied.push(...rows('../flora-herbs-berries-mushrooms/flora/anachronism_denylist_flora.csv')
    .flatMap((row) => [row.pattern_ru, row.pattern_lat].filter(Boolean)
      .map((pattern) => ({ id: row.deny_id, pattern: pattern.trim(), match: 'regex' })).filter((row) => row.pattern)));
  denied.push(...rows('../flora-trees-shrubs/flora/woody_denylist.csv')
    .flatMap((row) => split(row.keywords_ru).map((pattern) => ({ id: row.deny_id, pattern: pattern.trim().toLowerCase(), match: 'prefix' }))));
  const conditionSeasons = new Map();
  const setConditionSeasons = (kind, ids, seasons) => ids.forEach((id) => conditionSeasons.set(`${kind}:${id}`, new Set(seasons)));
  const realizedWeatherRows = rows('../nature-materials-weather/weather_climate/realized_weather_matrix.csv');
  setConditionSeasons('ground_rule', ['gr_snow'], ['winter', 'spring', 'autumn']);
  setConditionSeasons('ground_rule', ['gr_ice_glaze'], ['winter', 'spring', 'autumn']);
  setConditionSeasons('ground_rule', ['gr_flooded'], ['spring']);
  setConditionSeasons('ground_rule', ['gr_mud', 'gr_wet', 'gr_dry'], SEASONS);
  setConditionSeasons('water_rule', ['wr_ice'], ['winter', 'spring']);
  setConditionSeasons('water_rule', ['wr_ice_forming'], ['autumn', 'winter']);
  setConditionSeasons('water_rule', ['wr_ice_breaking', 'wr_flood'], ['spring']);
  setConditionSeasons('water_rule', ['wr_open'], ['spring', 'summer', 'autumn']);
  setConditionSeasons('weather', [...new Set(realizedWeatherRows.map((row) => row.wx_state_id).filter(Boolean))], SEASONS);
  for (const row of realizedWeatherRows) setConditionSeasons('weather', [row.row_id], row.precipitation_phase === 'snow' ? ['winter', 'spring', 'autumn'] : SEASONS);
  for (const row of rows('../nature-materials-weather/weather_climate/temperature_anomalies.csv'))
    conditionSeasons.set(`temperature:${row.anomaly_id}`, new Set(String(row.seasons).split(/[;|]/).map((season) => season.trim()).filter(Boolean)));
  return {
    groundRules: new Set(ground.filter((row) => row.target === 'ground_state').map((row) => row.rule_id)),
    waterRules: new Set(ground.filter((row) => row.target === 'water_condition').map((row) => row.rule_id)),
    weather: new Set(realizedWeatherRows.flatMap((row) => [row.wx_state_id, row.row_id]).filter(Boolean)),
    weatherPhaseByRef: new Map(realizedWeatherRows.map((row) => [row.row_id, row.precipitation_phase])),
    temperature: values('../nature-materials-weather/weather_climate/temperature_anomalies.csv', 'anomaly_id'),
    workshops: values('../crafts-tools-processes/workshops/workshops.csv', 'ws_id'),
    processes: values('../crafts-tools-processes/craft_processes/processes.csv', 'pc_id'),
    materials: new Set([
      ...values('../crafts-tools-processes/materials_registry/materials.csv', 'mt_id'),
      ...values('../nature-materials-weather/natural_materials_soils/natural_materials.csv', 'nm_id'),
      ...values('../nature-materials-weather/natural_materials_soils/ground_types.csv', 'nm_id'),
      ...values('../buildings-interiors-containers/buildings/materials_vocab.csv', 'mat_id'),
    ]),
    items: new Set([
      ...items.map((row) => row.it_id).filter(Boolean),
      ...values('../food-drink/food/ingredients.csv', 'fd_id'),
      ...toolRows.flatMap((row) => [row.tl_id, row.item_template_ref]).filter(Boolean),
      ...values('../buildings-interiors-containers/interiors/matcult_item_refs.csv', 'item_id'),
    ]),
    transports,
    scenes: new Set(scenes.flatMap((row) => [row.sc_id, row.source_scene_id]).filter(Boolean)),
    sceneBindings,
    facets: new Set(facetRows.map((row) => row.pff_id)),
    facetNames: new Set(facetRows.flatMap((row) => [row.facet_id, `${row.pf_id.slice(3)}.${row.facet_id}`])),
    spatialScenes: values('places/crosswalk_scene_templates.csv', 'scene_template_ref'),
    templates,
    familyTokens,
    weatherRefs,
    faunaRefs,
    faunaPrimaryIdsByPath,
    faunaPresencePaths,
    faunaPresenceById,
    floraRefs,
    regionalFauna,
    regionalFlora,
    faunaMembership,
    faunaActivity,
    conditionSeasons,
    floraMembership,
    taxonNames,
    presenceRefs: new Set([
      ...faunaPresenceRows.map((row) => row.presence_id), ...faunaOtherPresenceRows.map((row) => row.fpr_id),
      ...floraPresenceRows.map((row) => row.fp_id), ...treePresenceRows.map((row) => row.presence_id),
    ].filter(Boolean)),
    taxonomyFailures: [
      ...(new Set(faunaIds).size === faunaIds.length ? [] : ['duplicate fauna primary ID']),
      ...(new Set(floraIds).size === floraIds.length ? [] : ['duplicate flora primary ID']),
      ...faunaIds.filter((id) => floraRefs.has(id)).map((id) => `fauna/flora ID collision ${id}`),
    ],
    faunaDir,
    categories: values('categories/category_registry.csv', 'category_id'),
    denied,
  };
}

function environmentAuthoringFailures(rows, families, indices, requireCoverage = true) {
  const failures = [...indices.taxonomyFailures];
  const ids = new Set(), signatures = new Set(), seasonlessSignatures = new Set();
  const familyIds = new Set(families.map((row) => row.pf_id));
  const familyById = new Map(families.map((row) => [row.pf_id, row]));
  const sharedSeen = new Set();
  const classIds = new Set(ENVIRONMENT_PF_CLASS_BY_ID.keys());
  for (const pf of familyIds) if (!classIds.has(pf)) failures.push(`${pf}: missing PF physical class`);
  for (const pf of classIds) if (!familyIds.has(pf)) failures.push(`${pf}: PF physical class has no family`);
  if ([...ENVIRONMENT_PF_CLASS_BY_ID.values()].some((value) => !['interior', 'water_surface', 'open_place'].includes(value))) failures.push('unknown PF physical class');
  const resolveCondition = (ref) => {
    if (ref === 'none') return true;
    const [kind, value, extra] = ref.split(':');
    if (!value || extra) return false;
    return ({
      ground_rule: indices.groundRules.has(value), water_rule: indices.waterRules.has(value), weather: indices.weather.has(value), temperature: indices.temperature.has(value),
      presence: ['people', 'livestock', 'fire', 'transport', 'dog', 'church'].includes(value), workshop: indices.workshops.has(value), process: indices.processes.has(value),
      item: indices.items.has(value), scene: indices.scenes.has(value) || indices.spatialScenes.has(value) || indices.spatialScenes.has(`${value}@1`),
    })[kind] ?? false;
  };
  const resolveFaunaDataRef = (ref) => {
    const match = String(ref || '').match(/^(data\/[^#]+)#((?:fa|fhp|fpr)_[a-z0-9_]+)$/u);
    if (!match) return null;
    const [, sourcePath, id] = match;
    if (id.startsWith('fa_')) return indices.faunaPrimaryIdsByPath.get(sourcePath)?.has(id) ?? false;
    return indices.faunaPresencePaths.get(sourcePath)?.has(id) ?? false;
  };
  const resolveReuse = (ref) => {
    if (/^(wk:|claim:|book:|master:|src:)/.test(ref)) return true;
    if (ref.startsWith('data/')) {
      const exactFauna = resolveFaunaDataRef(ref);
      return exactFauna === null ? fs.existsSync(path.join(REPO, ref.split('#')[0])) : exactFauna;
    }
    if (ref.startsWith('category:')) return indices.categories.has(ref.slice('category:'.length));
    if (ref.startsWith('facet:')) return indices.facets.has(ref.slice('facet:'.length));
    if (ref.startsWith('scene:')) {
      const value = ref.slice('scene:'.length);
      return indices.scenes.has(value) || indices.spatialScenes.has(value) || indices.spatialScenes.has(`${value}@1`);
    }
    if (ref.startsWith('item:')) return indices.items.has(ref.slice('item:'.length));
    if (ref.startsWith('fauna:')) return indices.faunaRefs.has(ref.slice('fauna:'.length));
    if (ref.startsWith('flora:')) return indices.floraRefs.has(ref.slice('flora:'.length));
    if (ref.startsWith('fauna/')) return fs.existsSync(path.join(indices.faunaDir, ref.split('#')[0].slice('fauna/'.length)));
    return indices.scenes.has(ref) || indices.facets.has(ref) || indices.facetNames.has(ref) || indices.spatialScenes.has(ref) ||
      indices.templates.has(ref.replace(/@\d+$/, '')) || indices.familyTokens.has(ref) || indices.weatherRefs.has(ref) ||
      indices.faunaRefs.has(ref) || indices.floraRefs.has(ref) || indices.presenceRefs.has(ref) || indices.processes.has(ref) || indices.workshops.has(ref) || indices.items.has(ref) || indices.materials.has(ref) || indices.transports.has(ref) || indices.categories.has(ref);
  };
  for (const [index, row] of rows.entries()) {
    const at = row.env_rule_id || `row${index + 2}`;
    const scopes = environmentScopes(row);
    const shared = split(row.pf_scope).length > 0;
    if (!/^epr_[a-z0-9_]+$/.test(row.env_rule_id || '') || ids.has(row.env_rule_id)) failures.push(`${at}: env_rule_id`);
    ids.add(row.env_rule_id);
    if (!scopes.length || scopes.some((pf) => !familyIds.has(pf)) || new Set(scopes).size !== scopes.length) failures.push(`${at}: pf_scope/pf_id ${row.pf_scope || row.pf_id}`);
    const sharedPhenomenon = shared ? row.env_rule_id?.slice('epr_shared__'.length) : '';
    if (shared) {
      if (row.pf_id || !ENVIRONMENT_SHARED_IDS.has(row.env_rule_id) || ENVIRONMENT_SHARED_PHENOMENA.get(sharedPhenomenon) !== row.lens)
        failures.push(`${at}: shared phenomenon contract`);
      if (sharedSeen.has(row.env_rule_id)) failures.push(`${at}: duplicate shared phenomenon`);
      sharedSeen.add(row.env_rule_id);
      if (scopes.some((pf) => ENVIRONMENT_PF_CLASS_BY_ID.get(pf) === 'interior')) failures.push(`${at}: shared phenomenon enters interior`);
    } else {
      if (!familyIds.has(row.pf_id)) failures.push(`${at}: pf_id ${row.pf_id}`);
      if (familyIds.has(row.pf_id) && environmentSlug(row) === null) failures.push(`${at}: env_rule_id lacks canonical PF prefix`);
    }
    if (!/^env_[a-z0-9_]+$/.test(row.companion_ref || '') || !row.name_ru) failures.push(`${at}: companion/name`);
    if (!ENVIRONMENT_LENSES.includes(row.lens)) failures.push(`${at}: lens ${row.lens}`);
    if (!ENVIRONMENT_KINDS.includes(row.environment_kind)) failures.push(`${at}: environment_kind ${row.environment_kind}`);
    const senses = split(row.senses);
    if (!senses.length || senses.some((value) => !ENVIRONMENT_SENSES.includes(value)) || new Set(senses).size !== senses.length) failures.push(`${at}: senses ${row.senses}`);
    if (!['ubiquitous', 'common', 'contextual', 'rare'].includes(row.frequency_class)) failures.push(`${at}: frequency_class ${row.frequency_class}`);
    const seasons = split(row.allowed_seasons);
    if (!seasons.length || seasons.some((value) => !SEASONS.includes(value)) || new Set(seasons).size !== seasons.length) failures.push(`${at}: seasons ${row.allowed_seasons}`);
    const times = split(row.allowed_times);
    if (!times.length || times.some((value) => !TIME_ORDER.includes(value)) || new Set(times).size !== times.length) failures.push(`${at}: times ${row.allowed_times}`);
    const conditions = split(row.condition_refs);
    if (!conditions.length || conditions.some((ref) => !resolveCondition(ref)) || (conditions.includes('none') && conditions.length !== 1)) failures.push(`${at}: condition_refs ${row.condition_refs}`);
    if (new Set(conditions).size !== conditions.length) failures.push(`${at}: duplicate condition_refs`);
    const groundConditions = conditions.filter((ref) => ref.startsWith('ground_rule:'));
    if (seasons.includes('summer') && groundConditions.length && groundConditions.every((ref) => ['ground_rule:gr_snow', 'ground_rule:gr_ice_glaze'].includes(ref))) failures.push(`${at}: frozen ground condition in summer`);
    const temperatureConditions = conditions.filter((ref) => ref.startsWith('temperature:'));
    const exactTemperatureSet = (expected) => temperatureConditions.length === expected.length && expected.every((ref) => temperatureConditions.includes(ref));
    if (sharedPhenomenon === 'thaw_drip' && (!conditions.includes('ground_rule:gr_snow') || !exactTemperatureSet(['temperature:an_warm'])))
      failures.push(`${at}: shared thaw_drip temperature contract`);
    if (['frost', 'rime'].includes(sharedPhenomenon) && !exactTemperatureSet(['temperature:an_severe_cold', 'temperature:an_cold', 'temperature:an_normal']))
      failures.push(`${at}: shared frost/rime temperature contract`);
    if (sharedPhenomenon === 'rime' && (seasons.length !== 1 || seasons[0] !== 'winter')) failures.push(`${at}: shared rime winter-only contract`);
    const physicalCueText = `${row.name_ru} ${row.derivation}`.toLowerCase();
    const currentCueName = String(row.name_ru || '').toLowerCase();
    const rainPrecipitationCue = /(?:дожд|ливн|ливен)/u.test(currentCueName);
    const dropletPrecipitationCue = /капл/u.test(currentCueName);
    const liquidPrecipitationCue = rainPrecipitationCue || dropletPrecipitationCue;
    const genericPrecipitationRefs = new Set(['weather:wx_precip_light', 'weather:wx_precip_steady', 'weather:wx_windy_precip']);
    const hasGenericPrecipitation = conditions.some((ref) => genericPrecipitationRefs.has(ref));
    const realizedWeatherRefs = conditions.filter((ref) => ref.startsWith('weather:wxr_'));
    const realizedPhases = realizedWeatherRefs.map((ref) => indices.weatherPhaseByRef.get(ref.slice('weather:'.length))).filter(Boolean);
    const hasExactRainPhase = realizedPhases.includes('rain');
    if ((rainPrecipitationCue && !hasExactRainPhase) || (dropletPrecipitationCue && hasGenericPrecipitation))
      failures.push(`${at}: liquid precipitation lacks exact current rain phase`);
    if (liquidPrecipitationCue && hasGenericPrecipitation) failures.push(`${at}: liquid precipitation keeps generic current phase`);
    if (/(?:снегопад|снежин)/u.test(currentCueName) && hasGenericPrecipitation)
      failures.push(`${at}: snowfall lacks exact current snow phase`);
    if (liquidPrecipitationCue && realizedPhases.some((phase) => phase !== 'rain')) failures.push(`${at}: rain current precipitation phase mismatch`);
    if (/(?:снегопад|снежин)/u.test(currentCueName) && realizedPhases.some((phase) => phase !== 'snow')) failures.push(`${at}: snowfall current precipitation phase mismatch`);
    if (seasons.includes('summer') && /(?:иней|измороз)/u.test(physicalCueText)) failures.push(`${at}: frost/rime in summer`);
    const seasonalAxes = new Map();
    for (const ref of conditions) {
      const axis = ref.split(':')[0];
      if (!['ground_rule', 'water_rule', 'weather', 'temperature'].includes(axis)) continue;
      if (!seasonalAxes.has(axis)) seasonalAxes.set(axis, []);
      seasonalAxes.get(axis).push(ref);
    }
    const satisfiableSeasons = seasons.filter((season) => [...seasonalAxes.values()].every((refs) =>
      refs.some((ref) => indices.conditionSeasons.get(ref)?.has(season))));
    if (!satisfiableSeasons.length) failures.push(`${at}: unsatisfiable condition axes`);
    for (const ref of conditions.filter((value) => value.startsWith('scene:'))) {
      const binding = indices.sceneBindings.get(ref.slice('scene:'.length));
      if (!binding) continue;
      if (scopes.some((pf) => !binding.pfIds.has(pf))) failures.push(`${at}: scene PF mismatch ${ref}`);
      if (binding.seasons.size && seasons.some((season) => !binding.seasons.has(season))) failures.push(`${at}: scene season mismatch ${ref}`);
    }
    const reevaluation = split(row.reevaluate_on);
    if (!reevaluation.length || reevaluation.some((value) => !ENVIRONMENT_REEVALUATION.includes(value)) || new Set(reevaluation).size !== reevaluation.length) failures.push(`${at}: reevaluate_on ${row.reevaluate_on}`);
    for (const ref of split(row.material_refs)) if (!indices.materials.has(ref)) failures.push(`${at}: material_ref ${ref}`);
    for (const ref of split(row.process_refs)) if (!indices.processes.has(ref)) failures.push(`${at}: process_ref ${ref}`);
    for (const ref of split(row.item_refs)) if (!indices.items.has(ref)) failures.push(`${at}: item_ref ${ref}`);
    const reuseRefs = split(row.reuse_refs);
    for (const ref of reuseRefs) {
      if (!resolveReuse(ref)) failures.push(`${at}: reuse_ref ${ref}`);
      const raw = exactEntityRef(ref);
      if (/^fa_/.test(raw) && !indices.regionalFauna.has(raw)) failures.push(`${at}: nonregional fauna ${raw}`);
      if (/^fl_/.test(raw) && !indices.regionalFlora.has(raw)) failures.push(`${at}: nonregional flora ${raw}`);
      if (ref.startsWith('scene:')) {
        const binding = indices.sceneBindings.get(ref.slice('scene:'.length));
        if (binding && scopes.some((pf) => !binding.pfIds.has(pf))) failures.push(`${at}: scene PF mismatch ${ref}`);
        if (binding?.seasons.size && seasons.some((season) => !binding.seasons.has(season))) failures.push(`${at}: scene season mismatch ${ref}`);
      }
    }
    const faunaLinks = reuseRefs.map(exactEntityRef).filter((ref) => indices.faunaRefs.has(ref));
    const floraLinks = reuseRefs.map(exactEntityRef).filter((ref) => indices.floraRefs.has(ref));
    const entityLinks = [...split(row.material_refs), ...split(row.process_refs), ...split(row.item_refs),
      ...reuseRefs.map(exactEntityRef)]
      .filter((ref) => indices.materials.has(ref) || indices.processes.has(ref) || indices.items.has(ref) || indices.transports.has(ref));
    if (['domestic_animal', 'human_companion', 'wild_animal'].includes(row.lens) && !faunaLinks.length) failures.push(`${at}: ${row.lens} lacks exact fauna link`);
    if (row.lens === 'ruderal_plant' && !floraLinks.length) failures.push(`${at}: ruderal_plant lacks exact flora link`);
    const domesticGuarded = (ref) => conditions.includes('presence:livestock') || (ref === 'fa_dom_dog' && conditions.includes('presence:dog')) ||
      (PEOPLE_GUARDED_DOMESTIC_FAUNA.has(ref) && conditions.includes('presence:people'));
    if (faunaLinks.some((ref) => ref.startsWith('fa_dom_') && !domesticGuarded(ref))) failures.push(`${at}: domestic fauna lacks presence guard`);
    for (const ref of faunaLinks) if (!ref.startsWith('fa_dom_') && !scopes.some((pf) => seasons.some((season) => indices.faunaMembership.has(`${ref}|${pf}|${season}`))) && !['logical_necessity', 'analogy'].includes(row.basis))
      failures.push(`${at}: fauna ${ref} lacks exact PF/season membership`);
    const activeFaunaCue = row.lens === 'sound' || senses.includes('audible') || /(?:летит|летят|летает|летают|пролет|кружит|кружат|роится|роятся|взлет|порх)/iu.test(`${row.name_ru} ${row.derivation}`);
    if (activeFaunaCue) for (const ref of faunaLinks) for (const season of seasons) for (const pf of scopes) {
      const activity = indices.faunaActivity.get(`${ref}|${pf}|${season}`);
      if (activity?.has('dormant')) failures.push(`${at}: dormant fauna sound/flight ${ref}/${season}`);
    }
    for (const ref of floraLinks) if (!scopes.some((pf) => seasons.some((season) => indices.floraMembership.has(`${ref}|${pf}|${season}`))) && !['logical_necessity', 'analogy'].includes(row.basis))
      failures.push(`${at}: flora ${ref} lacks exact PF/season membership`);
    if (['loose_object', 'work_waste'].includes(row.lens) && !entityLinks.length) failures.push(`${at}: ${row.lens} lacks exact material/item/process link`);
    if (row.lens === 'domestic_animal' && (!faunaLinks.some((ref) => ref.startsWith('fa_dom_')) || faunaLinks.some((ref) => !domesticGuarded(ref)))) failures.push(`${at}: domestic_animal lacks guarded domestic fauna`);
    const sourceRefs = split(row.source_refs);
    if (!ENVIRONMENT_BASES.includes(row.basis) || !row.derivation || !sourceRefs.length ||
        sourceRefs.some((ref) => ref.startsWith('book:') && !/^book:[0-9]+ §[0-9]+$/.test(ref))) failures.push(`${at}: basis/derivation/source_refs`);
    for (const ref of sourceRefs) if (resolveFaunaDataRef(ref) === false) failures.push(`${at}: unresolved fauna source_ref ${ref}`);
    const presenceAnchors = sourceRefs.map((ref) => {
      const match = ref.match(/^(data\/[^#]+)#((?:fhp|fpr)_[a-z0-9_]+)$/u);
      return match && indices.faunaPresencePaths.get(match[1])?.get(match[2]);
    }).filter(Boolean);
    for (const anchor of presenceAnchors) {
      if (faunaLinks.length && !faunaLinks.includes(anchor.faId)) failures.push(`${at}: fauna presence taxon mismatch ${anchor.id}`);
      if (!scopes.includes(anchor.pfId)) failures.push(`${at}: fauna presence PF mismatch ${anchor.id}`);
      if (anchor.regionId !== 'region_novgorod_land') failures.push(`${at}: fauna presence region mismatch ${anchor.id}`);
      if (!seasons.includes(anchor.season)) failures.push(`${at}: fauna presence season mismatch ${anchor.id}`);
    }
    const allProvenance = [...sourceRefs, ...reuseRefs];
    const masterRefs = allProvenance.filter((ref) => /(?:master:|master-archive)/iu.test(ref));
    if (masterRefs.length && row.basis !== 'logical_necessity') failures.push(`${at}: master archive requires logical_necessity`);
    if (allProvenance.some((ref) => /^\/srv\//u.test(ref))) failures.push(`${at}: absolute source path`);
    if (row.basis === 'sourced' && sourceRefs.every((ref) => /places-binding\/places\/(?:place_families|place_family_facets)\.csv#/u.test(ref))) failures.push(`${at}: sourced only from PF definition`);
    if (sourceRefs.includes('book:638081 §1457')) failures.push(`${at}: unrelated burial anchor`);
    if (sourceRefs.includes('book:622242 §1632') && !/(?:молот|наковаль|кузнечн.{0,20}(?:стук|звон)|звон.{0,20}молот)/iu.test(`${row.name_ru} ${row.derivation}`)) failures.push(`${at}: smithy book anchor does not support this phenomenon`);
    if (!row.derivation.includes('→') || !row.derivation.includes('; граница:')) failures.push(`${at}: derivation cause/boundary`);
    if (!['A', 'B', 'C'].includes(row.confidence) || row.status !== 'candidate') failures.push(`${at}: confidence/status`);
    const lowerName = row.name_ru.trim().toLowerCase();
    const genericName = lowerName.replace(/[\s.,!?;:]+$/u, '');
    if (['остатки', 'следы работы', 'шум'].includes(genericName) || /^pf_/.test(lowerName) ||
        /\b(sound|odor|seasonal_surface|domestic_animal|human_companion|wild_animal|ruderal_plant|work_waste|loose_object|light_smoke|weather|daypart_marker)\b/.test(lowerName) ||
        /(первый вариант|контрастный вариант|рабочая вещь|временно отложенный предмет|материалов и работы|наблюдаемое следствие описано условно)/.test(lowerName) ||
        /^отсутствие\b/.test(lowerName) || /^(?:pf(?:_[^:]+)?|звук|запах|следы?|sound|odor)\s*:/u.test(lowerName) || /региональные сезонные признаки/u.test(lowerName)) failures.push(`${at}: generic name`);
    if (row.name_ru && row.name_ru[0] !== row.name_ru[0].toLocaleUpperCase('ru-RU')) failures.push(`${at}: name must start uppercase`);
    if (/(?:(?:^|[^а-яё])если(?:[^а-яё]|$)|при наличии|только если|лишь если|только у|лишь у|после соверш[её]нной|при действующей|только в срок|(?:^|[^а-яё])уже(?:[^а-яё]|$)|установленн|имеющ|в сезон присутствия|профил|только как|\/|\bWTR\d+\b|(?:presence|scene|weather|ground_rule|water_rule|temperature|process|item|workshop):)/iu.test(row.name_ru)) failures.push(`${at}: condition in name`);
    const consequence = normalizeEnvironmentClusterText(row.derivation.split('→').slice(1).join('→').split('; граница:')[0]).replace(/[^a-zа-яё0-9]+/gu, ' ').trim();
    const normalizedName = normalizeEnvironmentClusterText(row.name_ru).replace(/[^a-zа-яё0-9]+/gu, ' ').trim();
    if (row.derivation.includes('наблюдаемое следствие описано условно') || row.derivation.includes('возникает только описанный локальный след') ||
        catalogBoilerplateDerivation(row.derivation) || consequence === normalizedName) failures.push(`${at}: generic derivation`);
    const causalText = `${row.name_ru} ${row.derivation.split('; граница:')[0]}`.toLowerCase();
    const hasFireGuard = conditions.includes('presence:fire') || conditions.some((ref) => ref.startsWith('process:') && ENVIRONMENT_FIRE_PROCESSES.has(ref.slice('process:'.length))) ||
      conditions.some((ref) => ref.startsWith('scene:') && ENVIRONMENT_FIRE_SCENES.has(ref.slice('scene:'.length)));
    const hasTransportGuard = conditions.includes('presence:transport');
    const hasDogGuard = conditions.includes('presence:dog') || conditions.some((ref) => ref.startsWith('scene:') && ENVIRONMENT_DOG_SCENES.has(ref.slice('scene:'.length)));
    const hasChurchGuard = conditions.includes('presence:church') || conditions.some((ref) => ref.startsWith('scene:') && ENVIRONMENT_CHURCH_SCENES.has(ref.slice('scene:'.length)));
    const causalWords = causalText.match(/[a-zа-яё0-9_]+/gu) || [];
    const fireCue = causalWords.some((word) => /^(?:огонь|огн(?:я|ю|ём|е)|горящ|горит|горел|плам|печь|зол(?:а|ы|е|у|ой|ою)|дым|дымн|дымит|угл(?:и|я|ей|ём|е)|очаг|горн|копот)/u.test(word));
    const wheelCue = /(?:телег|кол[её]с[а-яё]*\s+(?:нагруз|след|коле|воз|телег|транспорт)|кол[её]с.{0,18}(?:воз|телег|ось|оси)|скрип оси|ободь|ободы|ободами|возов|(^|[^а-яё])воз(?:а|у|ом|ы|ами)?([^а-яё]|$))/u.test(causalText);
    const sledCue = /(?:(?:^|[^а-яё])сан(?:и|ей|ям|ями)(?:[^а-яё]|$)|полоз)/u.test(causalText);
    const dogCue = /(?:собак|собач|(^|[^а-яё])(?:лай|лает|лают)(?:[^а-яё]|$))/u.test(causalText);
    const churchCue = /(?:колокол|колоколь|(^|[^а-яё])било([^а-яё]|$)|заутрен|вечерн.{0,12}служб)/u.test(causalText);
    if (fireCue && !hasFireGuard) failures.push(`${at}: fire guard`);
    if (conditions.includes('presence:fire') && !fireCue) failures.push(`${at}: false fire guard`);
    if ((wheelCue || sledCue) && !hasTransportGuard) failures.push(`${at}: transport guard`);
    if (dogCue && !hasDogGuard) failures.push(`${at}: dog guard`);
    if (conditions.includes('presence:dog') && !dogCue) failures.push(`${at}: false dog guard`);
    if (churchCue && !hasChurchGuard) failures.push(`${at}: church guard`);
    if (/(?:запах.{0,30}навоз|навоз.{0,30}запах)/u.test(causalText) && !conditions.includes('presence:livestock')) failures.push(`${at}: manure odor lacks livestock guard`);
    if (row.pf_id === 'pf_smithy' && /(?:(?:сыр|мокр).{0,20}(?:грунт|земл)|гряз)/u.test(causalText) && conditions.includes('presence:dog')) failures.push(`${at}: smithy wet ground uses dog guard`);
    if (/мух.{0,40}(?:навоз|пом[её]т)|(?:навоз|пом[её]т).{0,40}мух/u.test(causalText) &&
        (!conditions.includes('presence:livestock') || seasons.some((season) => season !== 'summer'))) failures.push(`${at}: manure flies require livestock and summer`);
    if (wheelCue && seasons.includes('winter')) failures.push(`${at}: wheeled transport in winter`);
    if (sledCue && seasons.some((season) => season !== 'winter')) failures.push(`${at}: sled outside winter`);
    if (conditions.includes('weather:wx_clear') && !/(?:ясн|безоблач|солн|тень|сух|иней|мороз)/u.test(causalText)) failures.push(`${at}: false clear-weather guard`);
    if (/крапив/u.test(lowerName) && /(?:раст[её]|зел[её]н)/u.test(lowerName) && seasons.includes('winter')) failures.push(`${at}: growing nettle in winter`);
    if (/оттепел/u.test(lowerName) && seasons.some((season) => !['winter', 'spring'].includes(season))) failures.push(`${at}: thaw outside winter/spring`);
    for (const pf of scopes) {
      const pfClass = ENVIRONMENT_PF_CLASS_BY_ID.get(pf);
      if (pfClass === 'interior' && /(?:копыт.{0,30}(?:грунт|почв)|собач.{0,20}след|лис.{0,20}след|крапив|лопух|репь|трясогуз|нагрет.{0,15}земл)/u.test(causalText)) failures.push(`${at}: outdoor template in interior`);
      if (pfClass === 'water_surface' && /(?:угл(?:и|я|ей|ём|е)|(?:^|[^а-яё])дым(?:[^а-яё]|$)|крапив|лопух|репь|сух(?:ой|ая|ую).{0,15}(?:грунт|земл|почв))/u.test(causalText)) failures.push(`${at}: land template on water surface`);
      if (pf === 'pf_river_channel' && /копыт/u.test(causalText)) failures.push(`${at}: land template on water surface`);
    }
    const denyText = `${row.name_ru} ${row.companion_ref}`.toLowerCase();
    const words = denyText.split(/[^a-zа-яё0-9_]+/u).filter(Boolean);
    for (const deny of indices.denied) {
      const matched = deny.match === 'regex'
        ? (() => { try { return new RegExp(deny.pattern, 'iu').test(denyText); } catch { return false; } })()
        : words.some((word) => word.startsWith(deny.pattern));
      if (matched) failures.push(`${at}: anachronism ${deny.id}`);
    }
    const signature = [scopes.join(';'), row.companion_ref, [...conditions].sort().join(';'), [...seasons].sort().join(';'), [...times].sort().join(';')].join('|');
    if (signatures.has(signature)) failures.push(`${at}: duplicate semantic signature`);
    signatures.add(signature);
    const seasonlessName = lowerName.replace(/\s*\((зимой|весной|летом|осенью)\)\s*$/u, '');
    if (!shared) {
      const seasonlessSignature = `${row.pf_id}|${row.lens}|${seasonlessName}`;
      if (seasonlessSignatures.has(seasonlessSignature)) failures.push(`${at}: cloned seasonal variant`);
      seasonlessSignatures.add(seasonlessSignature);
    }
  }
  for (const id of ENVIRONMENT_SHARED_IDS) if (!sharedSeen.has(id)) failures.push(`${id}: missing shared phenomenon`);
  const fog = rows.find((row) => row.env_rule_id === 'epr_shared__fog');
  const fogScope = new Set(environmentScopes(fog || {}));
  const expectedFogScope = [...familyIds].filter((pf) => ENVIRONMENT_PF_CLASS_BY_ID.get(pf) !== 'interior' &&
    !['pf_reality_batch_01_open_conditions', 'pf_reality_first_practical_conditions', 'pf_hunting_ground'].includes(pf));
  for (const pf of expectedFogScope) if (!fogScope.has(pf)) failures.push(`epr_shared__fog: missing required scope ${pf}`);
  for (const pf of fogScope) if (!expectedFogScope.includes(pf)) failures.push(`epr_shared__fog: unexpected scope ${pf}`);
  const localRows = rows.filter((row) => !split(row.pf_scope).length);
  const profiles = localRows.map((row) => {
    const taxonNames = split(row.reuse_refs).map(exactEntityRef).map((ref) => indices.taxonNames.get(ref)).filter(Boolean);
    const placeName = familyById.get(row.pf_id)?.name_ru || '';
    const [causeRaw, consequenceAndBoundary = ''] = row.derivation.split('→');
    const consequenceRaw = consequenceAndBoundary.split('; граница:')[0];
    const cause = environmentComparable(causeRaw, placeName, taxonNames);
    const consequence = environmentComparable(consequenceRaw, placeName, taxonNames);
    return {
      row,
      name: environmentComparable(row.name_ru, placeName, taxonNames),
      slug: environmentComparable(environmentSlug(row) || '', row.pf_id.slice(3).replaceAll('_', ' '), []),
      cause,
      consequence,
      derivation: `${cause} → ${consequence}`,
    };
  });
  const parent = profiles.map((_, index) => index);
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (left, right) => { const a = find(left), b = find(right); if (a !== b) parent[b] = a; };
  for (let left = 0; left < profiles.length; left++) for (let right = left + 1; right < profiles.length; right++) {
    const a = profiles[left], b = profiles[right];
    const derivationScore = environmentSimilarity(a.derivation, b.derivation);
    const causeScore = environmentSimilarity(a.cause, b.cause);
    const consequenceScore = environmentSimilarity(a.consequence, b.consequence);
    if (a.row.pf_id !== b.row.pf_id && derivationScore >= 0.84 && causeScore >= 0.78 && consequenceScore >= 0.78) join(left, right);
    if (a.row.pf_id === b.row.pf_id && a.row.lens !== b.row.lens) {
      const nameScore = environmentSimilarity(a.name, b.name);
      const fuzzyClone = derivationScore >= 0.60 && nameScore >= 0.50 && consequenceScore >= 0.65;
      if (fuzzyClone) failures.push(`${a.row.pf_id}: fuzzy cross-lens clone ${a.row.env_rule_id},${b.row.env_rule_id}`);
    }
  }
  const clusters = new Map();
  for (let index = 0; index < profiles.length; index++) {
    const root = find(index);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(profiles[index].row);
  }
  for (const cluster of clusters.values()) {
    const pfs = new Set(cluster.map((row) => row.pf_id));
    if (pfs.size >= 3) failures.push(`fuzzy semantic derivation cluster across ${pfs.size} PF (${cluster.map((row) => row.env_rule_id).join(',')})`);
  }
  if (requireCoverage) for (const pf of familyIds) {
    const scoped = rows.filter((row) => environmentScopes(row).includes(pf));
    const family = familyById.get(pf);
    const ownSeason = family?.pf_kind === 'seasonal_overlay' && SEASONS.find((season) => pf.startsWith(`pf_${season}_`));
    for (const season of ownSeason ? [ownSeason] : SEASONS) if (!scoped.some((row) => split(row.allowed_seasons).includes(season))) failures.push(`${pf}: missing ${season}`);
  }
  return failures;
}

function environmentLensCoverage(rows, exclusions, families, indices) {
  const failures = [];
  const familyIds = new Set(families.map((row) => row.pf_id));
  const exclusionKeys = new Set();
  const exclusionByKey = new Map();
  for (const [index, row] of exclusions.entries()) {
    const at = `environment_lens_exclusions.csv#row${index + 2}`;
    const key = `${row.pf_id}|${row.lens}`;
    if (!familyIds.has(row.pf_id)) failures.push(`${at}: pf_id ${row.pf_id}`);
    if (!ENVIRONMENT_LENSES.includes(row.lens)) failures.push(`${at}: lens ${row.lens}`);
    if (!ENVIRONMENT_EXCLUSION_REASONS.includes(row.reason)) failures.push(`${at}: reason ${row.reason}`);
    if (row.status !== 'candidate') failures.push(`${at}: status ${row.status}`);
    if (exclusionKeys.has(key)) failures.push(`${at}: duplicate exclusion ${key}`);
    exclusionKeys.add(key);
    exclusionByKey.set(key, row);
  }
  const lensCounts = {};
  const lensCoverage = [];
  for (const pf of [...familyIds].sort()) {
    lensCounts[pf] = {};
    for (const lens of ENVIRONMENT_LENSES) {
      const count = rows.filter((row) => environmentScopes(row).includes(pf) && row.lens === lens).length;
      const excluded = exclusionKeys.has(`${pf}|${lens}`);
      lensCounts[pf][lens] = count;
      lensCoverage.push({ pf_id: pf, lens, rule_count: count, state: count > 0 ? 'covered' : excluded ? 'skipped' : 'not_authored', skip_reason: exclusionByKey.get(`${pf}|${lens}`)?.reason || '' });
      if (count > 0 && excluded) failures.push(`${pf}/${lens}: rules and exclusion both present`);
      if (count === 0 && !excluded) failures.push(`${pf}/${lens}: not_authored`);
    }
  }
  const entityIds = new Set([...indices.faunaRefs, ...indices.floraRefs, ...indices.items, ...indices.materials, ...indices.processes, ...indices.transports]);
  const linked = (row) => [
    ...split(row.reuse_refs).map(exactEntityRef),
    ...split(row.item_refs), ...split(row.material_refs), ...split(row.process_refs),
  ].some((ref) => entityIds.has(ref));
  const regionalTaxonLinked = (row) => split(row.reuse_refs).map(exactEntityRef).some((ref) => {
    if (ref.startsWith('fa_dom_')) return indices.regionalFauna.has(ref) && (split(row.condition_refs).includes('presence:livestock') || (PEOPLE_GUARDED_DOMESTIC_FAUNA.has(ref) && split(row.condition_refs).includes('presence:people')));
    if (indices.faunaRefs.has(ref)) return indices.regionalFauna.has(ref);
    if (indices.floraRefs.has(ref)) return indices.regionalFlora.has(ref);
    return false;
  });
  const entityRatioByPf = {};
  const regionalTaxonRatioByPf = {};
  for (const pf of [...familyIds].sort()) {
    const scoped = rows.filter((row) => environmentScopes(row).includes(pf));
    const count = scoped.filter(linked).length;
    entityRatioByPf[pf] = { linked: count, total: scoped.length, ratio: scoped.length ? Number((count / scoped.length).toFixed(3)) : 0 };
    const taxonCount = scoped.filter(regionalTaxonLinked).length;
    regionalTaxonRatioByPf[pf] = { linked: taxonCount, total: scoped.length, ratio: scoped.length ? Number((taxonCount / scoped.length).toFixed(3)) : 0 };
  }
  return {
    failures,
    lensCounts,
    lensCoverage,
    exclusions: exclusions.map((row) => ({ pf_id: row.pf_id, lens: row.lens, reason: row.reason })),
    entityRatioByPf,
    below50Percent: Object.entries(entityRatioByPf).filter(([, value]) => value.ratio < 0.5).map(([pf_id, value]) => ({ pf_id, ...value })),
    regionalTaxonRatioByPf,
    regionalTaxonBelow50Percent: Object.entries(regionalTaxonRatioByPf).filter(([, value]) => value.ratio < 0.5).map(([pf_id, value]) => ({ pf_id, ...value })),
  };
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
    else if (r.subject_kind === 'environment') { if (!/^env_[a-z0-9_]+$/.test(r.subject_ref) || r.category_ref || !r.condition_key) f.push(`${r.pr_id}: environment subject ${r.subject_ref}`); }
    else if (!({ occupation: occupations, social_role: roles })[r.subject_kind]?.has(r.subject_ref) || r.category_ref) f.push(`${r.pr_id}: subject ${r.subject_kind}:${r.subject_ref}`);
    const ok = { place_family: pfSet.has(r.scope_ref), g4: nodes.has(r.scope_ref), g5: nodes.has(r.scope_ref), region: r.scope_ref === ex.region_id,
      landscape_template: reg.get(r.scope_ref)?.kind === 'landscape', place_template: reg.get(r.scope_ref)?.kind === 'place', scene_template: ex.scene_templates.some((s) => s.id === r.scope_ref), container_template: /^container_tpl_/.test(r.scope_ref) }[r.scope_kind];
    if (!ok) f.push(`${r.pr_id}: scope ${r.scope_kind}:${r.scope_ref}`);
    if (!(Number.isInteger(+r.count_limit) && +r.count_limit >= 1)) f.push(`${r.pr_id}: count_limit`);
    if (!['pool_row', 'pool_count_limit_rule', 'default_minimum_1', 'people_authoring', 'environment_authoring'].includes(r.count_limit_basis)) f.push(`${r.pr_id}: count_limit_basis`);
    const s = split(r.allowed_seasons);
    if (!s.length || s.some((x) => x !== 'all' && !SEASONS.includes(x))) f.push(`${r.pr_id}: seasons ${r.allowed_seasons}`);
    const times = split(r.allowed_times);
    if (r.subject_kind === 'category' ? r.allowed_times !== 'all' : !times.length || times.some((t) => !TIME_ORDER.includes(t)) || r.allowed_times !== TIME_ORDER.filter((t) => times.includes(t)).join(';')) f.push(`${r.pr_id}: time ${r.allowed_times}`);
    if (r.subject_kind !== 'category' && (!r.guards || r.status !== 'candidate' || !r.source_refs)) f.push(`${r.pr_id}: non-category provenance/guards/status`);
    if (['occupation', 'social_role'].includes(r.subject_kind)) {
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
  const environmentSource = readCsv(P(ENVIRONMENT_PATH));
  const environmentExclusions = readCsv(P(ENVIRONMENT_EXCLUSIONS_PATH));
  const environmentOutput = pr.filter((row) => row.subject_kind === 'environment');
  const environmentRefs = environmentIndices();
  check('presence_rules', 'environment_authoring_closed_vocab_refs_anachronisms_coverage',
    environmentAuthoringFailures(environmentSource, fam, environmentRefs), {
      authoring_rows: environmentSource.length, place_families: new Set(environmentSource.flatMap(environmentScopes)).size,
    });
  const environmentCoverage = environmentLensCoverage(environmentSource, environmentExclusions, fam, environmentRefs);
  check('presence_rules', 'environment_pf_lens_coverage_and_entity_links', environmentCoverage.failures, {
    lens_counts_by_pf: environmentCoverage.lensCounts,
    lens_coverage_by_pf: environmentCoverage.lensCoverage,
    lens_exclusions: environmentCoverage.exclusions,
    entity_link_ratio_by_pf: environmentCoverage.entityRatioByPf,
    entity_link_ratio_below_50_percent: environmentCoverage.below50Percent,
    regional_taxon_link_ratio_by_pf: environmentCoverage.regionalTaxonRatioByPf,
    regional_taxon_link_ratio_below_50_percent: environmentCoverage.regionalTaxonBelow50Percent,
  });
  const environmentProjectionFailures = [];
  const environmentById = new Map(environmentSource.map((row) => [row.env_rule_id, row]));
  if (environmentById.size !== environmentSource.length) environmentProjectionFailures.push('duplicate authoring ID');
  const expectedEnvironmentPairs = new Set(environmentSource.flatMap((row) => environmentScopes(row).map((pf) => `${row.env_rule_id}|${pf}`)));
  const seenEnvironmentPairs = new Set();
  if (environmentOutput.length !== expectedEnvironmentPairs.size) environmentProjectionFailures.push(`output ${environmentOutput.length} != projected source ${expectedEnvironmentPairs.size}`);
  for (const output of environmentOutput) {
    const source = environmentById.get(output.condition_key);
    const pair = `${output.condition_key}|${output.scope_ref}`;
    if (seenEnvironmentPairs.has(pair)) environmentProjectionFailures.push(`${output.pr_id}: duplicate projection ${pair}`);
    seenEnvironmentPairs.add(pair);
    const sourceSeasons = SEASONS.filter((season) => split(source?.allowed_seasons).includes(season));
    const family = fam.find((candidate) => candidate.pf_id === output.scope_ref);
    const ownSeason = family?.pf_kind === 'seasonal_overlay' && SEASONS.find((season) => output.scope_ref.startsWith(`pf_${season}_`));
    const expectedSeasons = ownSeason || (sourceSeasons.length === SEASONS.length ? 'all' : sourceSeasons.join(';'));
    const expectedTimes = TIME_ORDER.filter((time) => split(source?.allowed_times).includes(time)).join(';');
    if (!source || output.source_pool !== `${ENVIRONMENT_PATH}#${output.condition_key}` || output.source_row_id !== output.condition_key ||
        output.scope_kind !== 'place_family' || !environmentScopes(source || {}).includes(output.scope_ref) || output.subject_ref !== source.companion_ref ||
        output.name_ru !== source.name_ru || output.lens !== source.lens || output.environment_kind !== source.environment_kind || output.frequency_class !== source.frequency_class ||
        +output.probability_ppm !== +rule.classes[source.frequency_class]?.probability_ppm || output.allowed_seasons !== expectedSeasons ||
        output.allowed_times !== expectedTimes || output.guards !== source.condition_refs ||
        output.senses !== source.senses || output.condition_refs !== source.condition_refs || output.reevaluate_on !== source.reevaluate_on ||
        output.material_refs !== source.material_refs || output.process_refs !== source.process_refs || output.item_refs !== source.item_refs ||
        output.reuse_refs !== source.reuse_refs || output.basis !== source.basis || output.derivation !== source.derivation ||
        output.source_refs !== source.source_refs || output.confidence !== 'C' || output.pool_confidence !== source.confidence ||
        output.count_limit !== '1' || output.count_limit_basis !== 'environment_authoring' || output.status !== 'candidate') environmentProjectionFailures.push(`${output.pr_id}: projection differs`);
  }
  for (const pair of expectedEnvironmentPairs) if (!seenEnvironmentPairs.has(pair)) environmentProjectionFailures.push(`missing projection ${pair}`);
  check('presence_rules', 'environment_authoring_projects_exactly_once', environmentProjectionFailures, { output_rows: environmentOutput.length });
  if (process.argv.includes('--self-test') && environmentSource.length) {
    const first = environmentSource.find((row) => !split(row.pf_scope).length);
    const sharedProbe = environmentSource.find((row) => split(row.pf_scope).length);
    if (!first || !sharedProbe) throw new Error('environment self-test requires local and shared rows');
    const expectFailure = (rows, text, requireCoverage = false) => {
      const failures = environmentAuthoringFailures(rows, fam, environmentRefs, requireCoverage);
      if (!failures.some((failure) => failure.includes(text))) throw new Error(`environment negative probe missed ${text}`);
    };
    expectFailure([{ ...first, pf_id: 'pf_unknown_probe' }], 'pf_id');
    expectFailure([{ ...sharedProbe, pf_id: 'pf_road' }], 'shared phenomenon contract');
    expectFailure([{ ...sharedProbe, pf_scope: `${sharedProbe.pf_scope};pf_dwelling_interior` }], 'shared phenomenon enters interior');
    expectFailure([{ ...sharedProbe, pf_scope: `${sharedProbe.pf_scope};${environmentScopes(sharedProbe)[0]}` }], 'pf_scope/pf_id');
    expectFailure([{ ...first, env_rule_id: 'epr_r5_wrong_place_probe' }], 'env_rule_id lacks canonical PF prefix');
    expectFailure([{ ...first, condition_refs: 'ground_rule:gr_unknown_probe' }], 'condition_refs');
    expectFailure([{ ...first, environment_kind: 'unknown_probe' }], 'environment_kind');
    expectFailure([{ ...first, lens: 'unknown_probe' }], 'lens');
    expectFailure([{ ...first, basis: '' }], 'basis/derivation/source_refs');
    expectFailure([{ ...first, derivation: 'просто утверждение' }], 'derivation cause/boundary');
    expectFailure([{ ...first, material_refs: 'mt_unknown_probe' }], 'material_ref');
    for (const [name, companion] of [
      ['бетонная лужа', 'env_concrete_puddle_probe'],
      ['фарфоровая чашка', 'env_porcelain_probe'],
      ['пластиковая верёвка', 'env_plastic_probe'],
      ['пороховой дым', 'env_gunpowder_probe'],
      ['картофельная ботва', 'env_potato_probe'],
      ['следы пилорамы', 'env_sawmill_probe'],
      ['серая крыса у склада', 'env_brown_rat_probe'],
      ['рыжий таракан в избе', 'env_german_cockroach_probe'],
      ['рис на местной пашне', 'env_rice_probe'],
    ]) expectFailure([{ ...first, name_ru: name, companion_ref: companion }], 'anachronism');
    for (const name_ru of ['остатки', 'Следы работы', 'Шум.', 'Звук: домовая мышь: региональные сезонные признаки']) expectFailure([{ ...first, name_ru }], 'generic name');
    expectFailure([{ ...first, name_ru: 'pf_road: Пыль над дорогой' }], 'generic name');
    expectFailure([{ ...first, name_ru: 'PF: Пыль над дорогой' }], 'generic name');
    expectFailure([{ ...first, name_ru: 'Крапива при наличии WTR0038' }], 'condition in name');
    expectFailure([{ ...first, name_ru: 'Корзина видна, если её поставили' }], 'condition in name');
    for (const name_ru of ['Дым лишь у горна', 'Щепа только у верстака', 'Кора после совершённой валки', 'Искры при действующей кузнице', 'Лёд только в срок вскрытия'])
      expectFailure([{ ...first, name_ru }], 'condition in name');
    for (const name_ru of ['Уже заметная пыль', 'Установленный у стены ларь', 'Имеющийся у двери мешок', 'Птица в сезон присутствия', 'След в профиле места', 'Верёвка только как возможность', 'Туман / дым'])
      expectFailure([{ ...first, name_ru }], 'condition in name');
    expectFailure([{ ...first, derivation: 'Точная региональная PF-season запись связывает вид с местом → возможен названный сигнал; граница: особь не гарантирована.' }], 'generic derivation');
    for (const derivation of [
      'Habitat row допускает вид → возможен сигнал; граница: особь не гарантирована.',
      'Точные PF-season данные допускают вид → возможен сигнал; граница: особь не гарантирована.',
      'chance=common → след заметен; граница: результат случаен.',
      'Возможность редакционной подачи подтверждена → след назван; граница: локально.',
    ]) expectFailure([{ ...first, derivation }], 'generic derivation');
    expectFailure([{ ...first, derivation: 'Сезонные сведения о местах обитания допускают присутствие вида → может проявиться соответствующий сигнал; граница: особь не гарантирована.' }], 'generic derivation');
    expectFailure([{ ...first, derivation: `Условие места выполняется → ${first.name_ru}; граница: сигнал не гарантирован.` }], 'generic derivation');
    expectFailure([{ ...first, name_ru: 'пыль лежит в колее' }], 'name must start uppercase');
    expectFailure([{ ...first, pf_id: 'pf_dwelling_interior', name_ru: 'Крапива растёт на грунте внутри избы' }], 'outdoor template in interior');
    expectFailure([{ ...first, pf_id: 'pf_river_channel', name_ru: 'Красный отблеск углей лежит на воде' }], 'land template on water surface');
    expectFailure([{ ...first, pf_id: 'pf_winter_ice_crossing', name_ru: 'Крапива растёт на сухом грунте переправы', allowed_seasons: 'winter' }], 'land template on water surface');
    expectFailure([{ ...first, name_ru: 'Дым поднимается над местом', condition_refs: 'presence:people' }], 'fire guard');
    const hardSurface = { ...first, name_ru: 'След остаётся на твёрдом настиле', derivation: 'Твёрдым настилом удерживается след → борозда заметна; граница: локально.', condition_refs: 'none' };
    if (environmentAuthoringFailures([hardSurface], fam, environmentRefs, false).some((failure) => failure.includes('fire guard'))) throw new Error('environment fire word-boundary positive probe failed');
    expectFailure([{ ...first, name_ru: 'Дождь стучит по кровле', derivation: 'Капли ударяют по кровле → слышен дробный стук; граница: во время дождя.', condition_refs: 'weather:wx_precip_steady;presence:fire' }], 'false fire guard');
    expectFailure([{ ...first, name_ru: 'Телега скрипит на дороге', allowed_seasons: 'spring', condition_refs: 'presence:people' }], 'transport guard');
    expectFailure([{ ...first, name_ru: 'Собака лает у ворот', condition_refs: 'presence:people' }], 'dog guard');
    expectFailure([{ ...first, name_ru: 'Листья шуршат под ногами', derivation: 'Сухие листья трутся друг о друга → слышен шорох; граница: локально.', condition_refs: 'presence:dog' }], 'false dog guard');
    expectFailure([{ ...first, name_ru: 'Колокольный звон слышен над улицей', condition_refs: 'presence:people' }], 'church guard');
    expectFailure([{ ...first, name_ru: 'Колёсный воз скрипит на дороге', allowed_seasons: 'winter', condition_refs: 'presence:transport' }], 'wheeled transport in winter');
    expectFailure([{ ...first, name_ru: 'Полозья саней скрипят на дороге', allowed_seasons: 'summer', condition_refs: 'presence:transport' }], 'sled outside winter');
    expectFailure([{ ...first, allowed_seasons: 'winter', condition_refs: 'ground_rule:gr_snow;water_rule:wr_open' }], 'unsatisfiable condition axes');
    const sameAxisOr = { ...first, allowed_seasons: 'winter', condition_refs: 'ground_rule:gr_snow;ground_rule:gr_dry' };
    if (environmentAuthoringFailures([sameAxisOr], fam, environmentRefs, false).some((failure) => failure.includes('unsatisfiable condition axes'))) throw new Error('environment same-axis OR positive probe failed');
    const noAxis = { ...first, lens: 'seasonal_surface', condition_refs: 'none' };
    if (environmentAuthoringFailures([noAxis], fam, environmentRefs, false).some((failure) => failure.includes('lacks ground/water/weather'))) throw new Error('environment no-axis positive probe failed');
    expectFailure([{ ...first, condition_refs: `${first.condition_refs};${first.condition_refs}` }], 'duplicate condition_refs');
    const sceneSummer = { ...first, env_rule_id: 'epr_dwelling_interior__scene_summer_probe', pf_id: 'pf_dwelling_interior', allowed_seasons: 'summer', condition_refs: 'scene:sc_scn001', reuse_refs: 'scene:sc_scn001' };
    if (environmentAuthoringFailures([sceneSummer], fam, environmentRefs, false).some((failure) => failure.includes('scene PF mismatch') || failure.includes('scene season mismatch'))) throw new Error('environment scene PF/season positive probe failed');
    expectFailure([{ ...sceneSummer, pf_id: 'pf_village_lane', env_rule_id: 'epr_village_lane__scene_pf_probe' }], 'scene PF mismatch');
    expectFailure([{ ...sceneSummer, allowed_seasons: 'winter' }], 'scene season mismatch');
    expectFailure([{ ...first, env_rule_id: 'epr_dormant_fauna_probe', pf_id: 'pf_cellar_granary', companion_ref: 'env_dormant_fauna_probe', name_ru: 'Комары звенят в зимней кладовой', lens: 'wild_animal', environment_kind: 'animal_sign', senses: 'audible', allowed_seasons: 'winter', condition_refs: 'presence:people', reuse_refs: 'fa_ins_mosquitoes', basis: 'logical_necessity' }], 'dormant fauna sound/flight');
    expectFailure([{ ...first, name_ru: 'Запах навоза держится у стойла', derivation: 'Навоз нагревается → запах становится заметен; граница: локальный след.', condition_refs: 'presence:fire' }], 'manure odor lacks livestock guard');
    expectFailure([{ ...first, pf_id: 'pf_smithy', name_ru: 'Сырой грунт темнеет у кузницы', derivation: 'Осадки смачивают землю → грунт темнеет; граница: у наружного входа.', condition_refs: 'ground_rule:gr_wet;presence:dog' }], 'smithy wet ground uses dog guard');
    expectFailure([{ ...first, name_ru: 'Мухи гудят над навозом', derivation: 'Навоз привлекает мух → слышно гудение; граница: локально.', allowed_seasons: 'spring;summer', condition_refs: 'presence:livestock', reuse_refs: 'fa_ins_house_fly' }], 'manure flies require livestock and summer');
    const crossLensProbe = [
      { ...first, env_rule_id: `epr_${first.pf_id.slice(3)}__cross_lens_1`, companion_ref: 'env_cross_lens_1', lens: 'odor', name_ru: 'Одинаковый след у сходней' },
      { ...first, env_rule_id: `epr_${first.pf_id.slice(3)}__cross_lens_2`, companion_ref: 'env_cross_lens_2', lens: 'seasonal_surface', name_ru: 'Одинаковый след у сходней' },
    ];
    expectFailure(crossLensProbe, 'cross-lens clone');
    const semanticProbe = ['pf_road', 'pf_rural_yard', 'pf_town_street'].map((pf_id, index) => ({
      ...first, pf_id, env_rule_id: `epr_${pf_id.slice(3)}__semantic_cluster_${index}`, companion_ref: `env_semantic_cluster_${index}`,
      name_ru: `Различимый местный след ${index}`, derivation: 'Одинаковая физическая причина → одинаковое наблюдаемое следствие; граница: локально.',
    }));
    expectFailure(semanticProbe, 'semantic derivation cluster across 3 PF');
    const placeVariantProbe = [
      ['pf_road', 'Осадки смачивают дорогу → мокрая поверхность темнеет; граница: локально.'],
      ['pf_village_lane', 'Осадки смачивают деревенскую улицу → мокрая поверхность темнеет; граница: локально.'],
      ['pf_town_street', 'Осадки смачивают городскую улицу → мокрая поверхность темнеет; граница: локально.'],
    ].map(([pf_id, derivation], index) => ({
      ...first, pf_id, env_rule_id: `epr_${pf_id.slice(3)}__place_variant_${index}`, companion_ref: `env_place_variant_${index}`,
      name_ru: `Мокрая поверхность темнеет, вариант ${index + 1}`, derivation,
    }));
    expectFailure(placeVariantProbe, 'fuzzy semantic derivation cluster across 3 PF');
    const sparrowAliases = ['Воробей', 'воробья', 'воробьям'].map((word) => environmentComparable(`${word} сидит у края`, '', ['Воробей']));
    if (new Set(sparrowAliases).size !== 1) throw new Error('environment taxon-inflection normalization probe failed');
    for (const cause of [
      'Летняя PF-season запись показывает вид',
      'Точные сезонные строки для места подтверждают вид',
      'Справочник распространения отмечает вид',
      'Вид отмечен для этого типа места',
      'Данные о распространении вида охватывают место',
    ]) expectFailure([{ ...first, derivation: `${cause} → возможен соответствующий сигнал; граница: сигнал не гарантирован.` }], 'generic derivation');
    for (const id of [
      'epr_r4_market_square_market_sledge',
      'epr_r4_market_square_market_cart',
      'epr_peasant_homestead__sound_peasant_homestead_m_house_mouse_resident',
      'epr_peasant_homestead__sound_peasant_homestead_b_house_sparrow_resident',
    ]) {
      const control = environmentSource.find((row) => row.env_rule_id === id);
      if (!control || catalogBoilerplateDerivation(control.derivation)) throw new Error(`environment catalog-boilerplate legal control failed: ${id}`);
    }
    const fuzzyCrossLensProbe = [
      { ...first, env_rule_id: `epr_${first.pf_id.slice(3)}__fuzzy_cross_lens_1`, companion_ref: 'env_fuzzy_cross_lens_1', lens: 'odor', name_ru: 'Запах сырой древесины у сходней', derivation: 'Влажные доски отдают сыростью → у сходней заметен запах сырой древесины; граница: локально.' },
      { ...first, env_rule_id: `epr_${first.pf_id.slice(3)}__fuzzy_cross_lens_2`, companion_ref: 'env_fuzzy_cross_lens_2', lens: 'seasonal_surface', name_ru: 'Сырая древесина пахнет возле сходней', derivation: 'Сырые доски источают влажный запах → возле сходней ощущается запах сырой древесины; граница: локально.' },
    ];
    expectFailure(fuzzyCrossLensProbe, 'fuzzy cross-lens clone');
    expectFailure([{ ...first, name_ru: 'Иней серебрит траву летом', allowed_seasons: 'summer', condition_refs: 'weather:wx_fog', derivation: 'Летняя влага замерзает на траве → появляется иней; граница: локально.' }], 'frost/rime in summer');
    const thawDrip = environmentSource.find((row) => row.env_rule_id === 'epr_shared__thaw_drip');
    const frost = environmentSource.find((row) => row.env_rule_id === 'epr_shared__frost');
    const rime = environmentSource.find((row) => row.env_rule_id === 'epr_shared__rime');
    if (!thawDrip || !frost || !rime) throw new Error('environment shared temperature self-test rows missing');
    for (const sharedTemperatureRow of [thawDrip, frost, rime]) {
      const sharedFailures = environmentAuthoringFailures([sharedTemperatureRow], fam, environmentRefs, false);
      if (sharedFailures.some((failure) => failure.includes('shared thaw_drip temperature contract') || failure.includes('shared frost/rime temperature contract') || failure.includes('shared rime winter-only contract')))
        throw new Error(`environment shared temperature positive probe failed: ${sharedTemperatureRow.env_rule_id}`);
    }
    expectFailure([{ ...thawDrip, condition_refs: thawDrip.condition_refs.replace('temperature:an_warm', 'temperature:an_normal') }], 'shared thaw_drip temperature contract');
    expectFailure([{ ...thawDrip, condition_refs: `${thawDrip.condition_refs};temperature:an_normal` }], 'shared thaw_drip temperature contract');
    expectFailure([{ ...thawDrip, condition_refs: 'temperature:an_warm' }], 'shared thaw_drip temperature contract');
    for (const sharedColdRow of [frost, rime]) {
      expectFailure([{ ...sharedColdRow, condition_refs: `${sharedColdRow.condition_refs};temperature:an_warm` }], 'shared frost/rime temperature contract');
      for (const ref of ['temperature:an_severe_cold', 'temperature:an_cold', 'temperature:an_normal'])
        expectFailure([{ ...sharedColdRow, condition_refs: split(sharedColdRow.condition_refs).filter((value) => value !== ref).join(';') }], 'shared frost/rime temperature contract');
    }
    expectFailure([{ ...rime, allowed_seasons: 'winter;autumn' }], 'shared rime winter-only contract');
    expectFailure([{ ...first, name_ru: 'Дождь мелко сеет', allowed_seasons: 'winter', condition_refs: 'weather:wx_precip_light', derivation: 'Жидкие осадки падают на землю → виден мелкий дождь; граница: локально.' }], 'liquid precipitation lacks exact current rain phase');
    expectFailure([{ ...first, name_ru: 'Косой дождь', allowed_seasons: 'winter', condition_refs: 'weather:wx_windy_precip', derivation: 'Ветер несёт жидкие осадки → дождь идёт наклонно; граница: локально.' }], 'liquid precipitation lacks exact current rain phase');
    expectFailure([{ ...first, name_ru: 'Капли обложных осадков стучат по кровле', allowed_seasons: 'winter', condition_refs: 'weather:wx_precip_steady', derivation: 'Обложные осадки падают на кровлю → слышен стук капель; граница: локально.' }], 'liquid precipitation lacks exact current rain phase');
    expectFailure([{ ...first, name_ru: 'Ливень шумит по настилу', allowed_seasons: 'autumn', condition_refs: 'weather:wx_windy_precip', derivation: 'Ветреные осадки ударяют по настилу → слышен шум ливня; граница: локально.' }], 'liquid precipitation lacks exact current rain phase');
    expectFailure([{ ...first, name_ru: 'Дождь стучит по настилу', allowed_seasons: 'autumn', condition_refs: 'weather:wx_precip_steady;ground_rule:gr_wet', derivation: 'Обложные осадки ударяют по настилу → слышен дождевой стук; граница: локально.' }], 'liquid precipitation lacks exact current rain phase');
    expectFailure([{ ...first, name_ru: 'Летний дождь стучит по настилу', allowed_seasons: 'summer', condition_refs: 'weather:wx_precip_steady', derivation: 'Обложные осадки ударяют по настилу → слышен дождевой стук; граница: локально.' }], 'liquid precipitation lacks exact current rain phase');
    expectFailure([{ ...first, name_ru: 'След дождя на мокрой земле', allowed_seasons: 'autumn', condition_refs: 'ground_rule:gr_wet', derivation: 'Влажная поверхность темнеет → виден след воды; граница: локально.' }], 'liquid precipitation lacks exact current rain phase');
    expectFailure([{ ...first, name_ru: 'Дождь стучит по настилу', allowed_seasons: 'autumn', condition_refs: 'weather:wxr_precip_steady__rain;weather:wx_precip_steady', derivation: 'Жидкие осадки ударяют по настилу → слышен дождевой стук; граница: локально.' }], 'liquid precipitation keeps generic current phase');
    for (const allowed_seasons of ['spring', 'autumn']) for (const condition_refs of ['weather:wx_precip_light', 'weather:wx_precip_steady', 'weather:wx_windy_precip'])
      expectFailure([{ ...first, name_ru: 'Дождевые капли падают на землю', allowed_seasons, condition_refs, derivation: 'Жидкие осадки падают на землю → видны капли дождя; граница: локально.' }], 'liquid precipitation lacks exact current rain phase');
    expectFailure([{ ...first, name_ru: 'Дождевые капли стучат по кровле зимой', allowed_seasons: 'winter', condition_refs: 'weather:wxr_precip_steady__snow', derivation: 'Жидкие осадки падают на кровлю → слышен дождевой стук; граница: локально.' }], 'rain current precipitation phase mismatch');
    const neutralWetSurface = { ...first, name_ru: 'Грязь проступает между плахами', allowed_seasons: 'autumn', condition_refs: 'ground_rule:gr_mud;weather:wx_precip_steady', derivation: 'Размокший грунт выдавливается в щели → грязь видна между плахами; граница: локально.' };
    if (environmentAuthoringFailures([neutralWetSurface], fam, environmentRefs, false).some((failure) => failure.includes('precipitation phase'))) throw new Error('environment neutral wet-surface positive probe failed');
    for (const allowed_seasons of SEASONS) for (const condition_refs of ['weather:wxr_precip_light__rain', 'weather:wxr_precip_steady__rain', 'weather:wxr_windy_precip__rain']) {
      const rainPositive = { ...first, name_ru: 'Дождевые капли падают на землю', allowed_seasons, condition_refs, derivation: 'Жидкие осадки падают на землю → видны капли дождя; граница: локально.' };
      if (environmentAuthoringFailures([rainPositive], fam, environmentRefs, false).some((failure) => failure.includes('precipitation phase'))) throw new Error(`environment rain exact-phase positive probe failed: ${allowed_seasons}/${condition_refs}`);
    }
    expectFailure([{ ...first, name_ru: 'Снегопад белит крышу', allowed_seasons: 'winter', condition_refs: 'weather:wx_precip_steady', derivation: 'Снежинки оседают на кровле → крыша белеет; граница: локально.' }], 'snowfall lacks exact current snow phase');
    expectFailure([{ ...first, name_ru: 'Снегопад белит крышу', allowed_seasons: 'winter', condition_refs: 'weather:wxr_precip_steady__rain', derivation: 'Снежинки оседают на кровле → крыша белеет; граница: локально.' }], 'snowfall current precipitation phase mismatch');
    const snowfallPositive = { ...first, name_ru: 'Снегопад белит крышу', allowed_seasons: 'winter', condition_refs: 'weather:wxr_precip_steady__snow', derivation: 'Снежинки оседают на кровле → крыша белеет; граница: локально.' };
    if (environmentAuthoringFailures([snowfallPositive], fam, environmentRefs, false).some((failure) => failure.includes('precipitation phase'))) throw new Error('environment snowfall exact-phase positive probe failed');
    const savedClass = ENVIRONMENT_PF_CLASS_BY_ID.get(first.pf_id);
    ENVIRONMENT_PF_CLASS_BY_ID.delete(first.pf_id);
    try { expectFailure([first], 'missing PF physical class'); } finally { ENVIRONMENT_PF_CLASS_BY_ID.set(first.pf_id, savedClass); }
    const iceSurface = environmentSource.find((row) => row.pf_id === 'pf_winter_ice_crossing' && /полоз/iu.test(`${row.name_ru} ${row.derivation}`));
    if (!iceSurface || environmentAuthoringFailures([iceSurface], fam, environmentRefs, false).some((failure) => failure.includes('land template on water surface'))) throw new Error('environment ice-surface positive probe failed');
    if (environmentAuthoringFailures([{ ...first, name_ru: 'Шум ветра над водой' }], fam, environmentRefs, false).some((failure) => failure.includes('generic name')))
      throw new Error('environment generic-name positive probe failed');
    if (environmentAuthoringFailures([{ ...first, name_ru: 'Рисунок колеи на влажной земле' }], fam, environmentRefs, false).some((failure) => failure.includes('anachronism')))
      throw new Error('environment anachronism boundary positive probe failed');
    expectFailure([{ ...first, reuse_refs: 'fa_b_unknown_probe' }], 'reuse_ref');
    expectFailure([{ ...first, reuse_refs: 'fl_unknown_probe' }], 'reuse_ref');
    expectFailure([{ ...first, reuse_refs: 'fa_mamm_house_mouse' }], 'reuse_ref');
    expectFailure([{ ...first, source_refs: `${first.source_refs};data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/fauna/fauna_presence.csv#fpr_fa_mamm_house_mouse__threshing_barn__winter` }], 'unresolved fauna source_ref');
    const mouseProbe = environmentSource.find((row) => row.env_rule_id === 'epr_threshing_barn__house_mouse_night_rustle');
    if (!mouseProbe) throw new Error('environment mouse-anchor self-test row missing');
    expectFailure([{ ...mouseProbe, source_refs: `${mouseProbe.source_refs};data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/fauna/wild_habitat_presence.csv#fhp_m_house_mouse__peasant_homestead__winter` }], 'fauna presence PF mismatch');
    expectFailure([first, { ...first }], 'env_rule_id');
    expectFailure(environmentSource.filter((row) => !environmentScopes(row).includes(first.pf_id)), `${first.pf_id}: missing`, true);
    const exclusionReasonProbe = environmentLensCoverage(environmentSource, environmentExclusions.map((row, index) => index ? row : { ...row, reason: 'no_pf_specific_source' }), fam, environmentRefs);
    if (!exclusionReasonProbe.failures.some((failure) => failure.includes('reason no_pf_specific_source'))) throw new Error('environment exclusion reason negative probe failed');
    console.log('PASS presence_rules / environment_negative_probes');
  }
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
