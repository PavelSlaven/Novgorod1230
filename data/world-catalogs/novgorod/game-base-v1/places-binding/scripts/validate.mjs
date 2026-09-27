// Acceptance checks for all places-binding domains. Writes reports/validation.json;
// exits 1 if any check on this group's own data fails. Checks on other groups' inputs are reported
// as "external" and do not fail the run.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { REPO, GROUP, readJson, readCsv, readTsv, writeJson, split, SEASONS } from './lib.mjs';
import { loadTemplateRegistry, WK_PLACE_FIRST, V6_G4, SEEDS } from './build-place-families.mjs';
import { parseHouseholds } from './build-generation-limits.mjs';
import { build as buildPresenceRules } from './build-presence-rules.mjs';
import { checkPeopleComposition } from './check-people-composition.mjs';

const checks = [];
const check = (domain, name, failures, extra = {}, external = false) => checks.push({ domain, name, pass: failures.length === 0, failures: failures.length, sample: failures.slice(0, 15), external, ...extra });
const P = (...p) => path.join(GROUP, ...p);
const TIME_ORDER = ['morning', 'day', 'evening', 'night'];
function presenceIds(rows) {
  const keys = new Set(), ids = new Set(), failures = [];
  for (const row of rows) {
    const seasons = String(row.allowed_seasons ?? '').trim();
    const ordered = SEASONS.filter((s) => split(seasons).includes(s)).join(';');
    const canonical = seasons === 'all' || ordered === SEASONS.join(';') ? 'all' : ordered;
    const key = JSON.stringify([row.scope_kind, row.scope_ref, row.region_id, row.subject_kind, row.subject_ref, canonical].map((s) => String(s ?? '').trim()));
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
    const key = [r.scope_kind, r.scope_ref, r.region_id, r.subject_kind, r.subject_ref].join('|');
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
    if (item && (entry.item_ref !== item.item_or_category_ref || entry.source_row_id !== item.ipf_id)) failures.push(`resolution item ref/id differs from source ${entry.source_pool}`);
  }
  for (const rule of rules) for (const season of rule.allowed_seasons === 'all' ? SEASONS : split(rule.allowed_seasons)) {
    const scope = [rule.scope_kind, rule.scope_ref, rule.region_id, rule.subject_kind, rule.subject_ref].join('|');
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
function secondaryFailures(nodes, extract, crosswalk) {
  const failures = [];
  const contract = crosswalk.node_binding.pf_secondary;
  const sceneMap = crosswalk.scene_templates.map;
  const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('|') === fields.slice().sort().join('|');
  if (!exact(contract, ['meaning', 'candidate_basis', 'include_rule', 'exclusions']) ||
      contract.meaning !== 'part of the node scene accessible without transition' || contract.candidate_basis !== 'scene_templates.map' ||
      !exact(contract.include_rule, ['rule_id', 'statement', 'confidence']) ||
      typeof contract.include_rule.rule_id !== 'string' || !contract.include_rule.rule_id.trim() ||
      typeof contract.include_rule.statement !== 'string' || !contract.include_rule.statement.trim() ||
      contract.include_rule.confidence !== 'C' || !Array.isArray(contract.exclusions))
    return ['malformed pf_secondary contract'];
  const candidateScenes = new Set(extract.scene_templates.map((scene) => scene.id));
  const usedScenes = new Set([...extract.g4.flatMap((g) => g.scene_template_refs.map((ref) => ref.replace(/@\d+$/, ''))), ...extract.g5.map((g) => g.scene_template_id)]);
  const seen = new Set(), ruleIds = new Set([contract.include_rule.rule_id]);
  for (const exclusion of contract.exclusions) {
    if (!exact(exclusion, ['scene_template_id', 'pf_id', 'rule_ref', 'confidence', 'reason'])) {
      failures.push('malformed exclusion');
      continue;
    }
    const { scene_template_id: scene, pf_id: pf, rule_ref: rule, confidence, reason } = exclusion;
    if (typeof scene !== 'string' || !scene || typeof pf !== 'string' || !pf) {
      failures.push('malformed exclusion key');
      continue;
    }
    const key = `${scene}|${pf}`;
    if (seen.has(key)) failures.push(`duplicate exclusion ${key}`);
    seen.add(key);
    if (typeof rule !== 'string' || !rule.trim() || ruleIds.has(rule)) failures.push(`missing or duplicate exclusion rule ${key}`);
    ruleIds.add(rule);
    if (confidence !== 'C') failures.push(`invalid exclusion confidence ${key}`);
    if (!candidateScenes.has(scene) || !usedScenes.has(scene) || !sceneMap[scene]?.includes(pf)) failures.push(`stale exclusion ${key}`);
    if (typeof reason !== 'string' || !reason.trim()) failures.push(`missing exclusion reason ${key}`);
  }
  const input = [
    ...extract.g4.map((g) => [`${g.g4_id}@${g.g4_version}`, g.scene_template_refs]),
    ...extract.g5.map((g) => [`${g.g5_id}@${g.g5_version}`, [g.scene_template_id]]),
  ];
  const excluded = new Set(contract.exclusions.filter((e) => e?.scene_template_id && e?.pf_id).map((e) => `${e.scene_template_id}|${e.pf_id}`));
  const byNode = new Map(nodes.map((node) => [node.node_ref, node]));
  for (const [ref, scenes] of input) {
    const node = byNode.get(ref);
    if (!node) { failures.push(`missing node ${ref}`); continue; }
    const actual = node.pf_secondary;
    if (failures.some((failure) => failure.includes('malformed exclusion'))) continue;
    const expected = [...new Set(scenes.flatMap((ref) => {
      const scene = ref.replace(/@\d+$/, '');
      return (sceneMap[scene] ?? []).filter((pf) => !excluded.has(`${scene}|${pf}`));
    }))].filter((pf) => `pf_${pf}` !== node.pf_id).map((pf) => `pf_${pf}`).join(';');
    if (actual !== expected) failures.push(`${ref}: pf_secondary expected ${expected}, got ${actual}`);
    if (!node.binding_basis.includes(`#node_binding.pf_secondary.include_rule[rule_id=${contract.include_rule.rule_id}]`) ||
                     !split(node.source_refs).includes('data/world-catalogs/novgorod/game-base-v1/places-binding/scripts/crosswalk-rules.json'))
      failures.push(`${ref}: secondary rule/source missing`);
  }
  return failures;
}
if (process.argv.includes('--self-test')) {
  const probe = { pr_id: 'probe_all', scope_kind: 'place_family', scope_ref: 'probe', region_id: '', subject_kind: 'category', subject_ref: 'probe', allowed_seasons: 'all' };
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
  const excluded = crosswalk.node_binding.pf_secondary.exclusions[0];
  const excludedNode = nodes.find((node) => split(node.scene_template_refs).some((ref) => ref.startsWith(`${excluded.scene_template_id}@`)));
  if (!withSecondary || !excludedNode) throw new Error('secondary binding probes lack targets');
  const changed = (target, value) => nodes.map((node) => node === target ? { ...node, pf_secondary: value } : node);
  if (!secondaryFailures(changed(withSecondary, ''), extracted, crosswalk).length ||
      !secondaryFailures(changed(excludedNode, [excludedNode.pf_secondary, `pf_${excluded.pf_id}`].filter(Boolean).join(';')), extracted, crosswalk).length)
    throw new Error('secondary omission/extra probes failed');
  for (const field of ['reason', 'rule_ref', 'confidence']) {
    const bad = structuredClone(crosswalk);
    bad.node_binding.pf_secondary.exclusions[0][field] = '';
    if (!secondaryFailures(nodes, extracted, bad).length) throw new Error(`exclusion ${field} probe failed`);
  }
  const duplicateRule = structuredClone(crosswalk);
  duplicateRule.node_binding.pf_secondary.exclusions[1].rule_ref = duplicateRule.node_binding.pf_secondary.exclusions[0].rule_ref;
  if (!secondaryFailures(nodes, extracted, duplicateRule).some((failure) => failure.includes('duplicate exclusion rule')))
    throw new Error('duplicate exclusion rule probe failed');
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
  const malformed = structuredClone(crosswalk);
  malformed.node_binding.pf_secondary.exclusions.push(null);
  if (!secondaryFailures(nodes, extracted, malformed).includes('malformed exclusion')) throw new Error('malformed exclusion probe failed');
  console.log('PASS node_binding / secondary_negative_probes');
}

const wk = readJson(WK_PLACE_FIRST);
const fam = readCsv(P('places/place_families.csv'));
const reg = loadTemplateRegistry();
const routes = new Set(readJson(SEEDS.route).map((r) => r.id));
const pfSet = new Set(fam.map((f) => f.pf_id));
const ex = readJson(P('inputs/pr98-extract.json'));

const startTerritoryArg = process.argv.indexOf('--start-territory');
if (startTerritoryArg >= 0 && !process.argv[startTerritoryArg + 1]) throw new Error('--start-territory requires a JSON path');
check('people_composition', 'schema_refs_pf_coverage_and_schedules', checkPeopleComposition(
  readJson(P('presence/people_composition_authoring.json')),
  startTerritoryArg >= 0 ? readJson(path.resolve(process.argv[startTerritoryArg + 1])) : null,
));

// ---- place_families
{
  const ids = fam.map((f) => f.pf_id.slice(3));
  const want = wk.environment_families.map((f) => f.id);
  check('place_families', 'wk_44_families_exactly_once', [
    ...want.filter((w) => ids.filter((x) => x === w).length !== 1).map((w) => `missing_or_duplicate ${w}`),
    ...ids.filter((x) => !want.includes(x)).map((x) => `unknown ${x}`),
  ], { wk_families: want.length, rows: fam.length });
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
}

// ---- presence_rules
{
  const rule = readJson(P('presence/frequency_rule.json'));
  const pr = readCsv(P('presence/presence_rules.csv'));
  const rebuilt = buildPresenceRules({ write: false }).rows;
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
    const itemRows = sources.filter((s) => s.includes('/items-household-personal/items/item_place_frequency.csv#row'));
    if (itemRows.length) {
      if (itemRows.length !== sources.length || r.subject_kind !== 'category') f.push(`${r.pr_id}: mixed item/category sources`);
      for (const source of itemRows) {
        const row = itemSources[Number(source.match(/#row(\d+)$/)?.[1]) - 2];
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
  const expected = [], itemRows = new Map();
  const add = (pool, scope, seasons, times = ['']) => { for (const season of seasons) for (const time of times) expected.push({ pool, scope, season, time, key: `${pool}|${scope}|${season}|${time}` }); };
  const itemPath = 'data/world-catalogs/novgorod/game-base-v1/items-household-personal/items/item_place_frequency.csv';
  itemSources.forEach((row, i) => {
    if (!row.category_id || !cats.has(row.category_id)) return;
    const pool = `${itemPath}#row${i + 2}`;
    const scope = `place_family|pf_${row.pf_id}||category|${row.category_id}`;
    itemRows.set(pool, row);
    add(pool, scope, split(row.allowed_seasons));
  });
  const faunaPath = 'data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/fauna/wild_habitat_presence.csv';
  readCsv(P('../fauna-mammals-birds/fauna/wild_habitat_presence.csv')).forEach((row, i) => {
    const scope = `place_family|${row.pf_id}|${row.region_id}|category|${row.category_ref}`;
    add(`${faunaPath}#row${i + 2}`, scope, row.season === 'all' ? SEASONS : [row.season]);
  });
  peopleSources.forEach((row, i) => {
    if (row.creation_owner !== 'presence_rule') return;
    const scope = `${row.scope_kind}|${row.scope_ref}|region_novgorod_land|${row.subject_kind}|${row.subject_ref}`;
    add(`presence/people_presence_authoring.csv#row${i + 2}`, scope, split(row.allowed_seasons), split(row.allowed_times));
  });
  check('presence_rules', 'accepted_occurrences_exactly_once', acceptedCoverage(expected, pr, rr.resolutions, itemRows), { accepted_occurrences: expected.length });
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
    const probe = acceptedCoverage(expected, pr.map((r) => {
      if ([r.scope_kind, r.scope_ref, r.region_id, r.subject_kind, r.subject_ref].join('|') !== target.key) return r;
      return { ...r, variants: JSON.stringify(JSON.parse(r.variants || '[]').filter((v) => v.item_ref !== 'it_ps_leather_purse')) };
    }), altered, itemRows);
    if (!probe.some((f) => f.startsWith(`orphan ${targetPool}|`))) throw new Error('leather purse variant orphan diagnostic missing');
    console.log('PASS presence_rules / leather_purse_variant_orphan_negative_probe');
  }
  const people = pr.filter((r) => r.subject_kind !== 'category');
  const expectedPf = new Set(nb.map((r) => r.pf_id).filter(Boolean));
  check('presence_rules', 'people_cover_16_bound_pf', [
    ...[...expectedPf].filter((id) => !people.some((r) => r.scope_ref === id) && !readJson(P('presence/people_composition_authoring.json')).compositions.some((c) => c.pf_id === id && c.population_groups.length)).map((id) => `missing ${id}`),
    ...(expectedPf.size === 16 ? [] : [`expected 16 PF, got ${expectedPf.size}`]),
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
  check('presence_rules', 'c002_crosswalks_account_for_16_bound_pf', crosswalkFailures,
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
  if (boundPf.size !== 16 || slots.length !== 5 || gaps.length !== 12 || covered.size !== 16) f.push(`coverage: ${boundPf.size} PF, ${slots.length} slots, ${gaps.length} gaps, ${covered.size} covered`);
  check('materialization_slot_rules', 'c003_required_slots_and_explicit_gaps', f, { slots: slots.length, candidates: candidates.length, gaps: gaps.length, place_families: covered.size });

  const variants = readJson(P('slots/slot_instance_variants.json'));
  const materials = new Set(readCsv(P('../buildings-interiors-containers/buildings/materials_vocab.csv')).map((r) => r.mat_id));
  const variantFailures = [];
  const variantIds = new Set();
  const variantKeys = new Set();
  const exact = (object, keys) => Object.keys(object).sort().join('|') === [...keys].sort().join('|');
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
