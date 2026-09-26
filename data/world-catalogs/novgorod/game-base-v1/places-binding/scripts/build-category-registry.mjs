// Category registry collector (universal_categories contract, policy §4 / DDL 09.sql).
// 1) writes categories/place_family_categories.csv (this group's own domain: place_family);
// 2) collects category definition files of all game-base-v1 groups + existing v17 categories;
// 3) checks stable_code uniqueness, parent existence, cycles; checks that every category
//    reference in other groups' CSV files resolves. Writes categories/category_registry.csv
//    and reports/category-registry-report.json.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, GROUP, GAME_BASE, readJson, readCsv, writeCsv, writeJson, rel, arr } from './lib.mjs';

const EXISTING = [
  { path: 'data/knowledge-source/imports/item-container-120-v5/candidate/tables/universal_categories.json', origin: 'v17_item_container_v5', v17_status: 'approved_in_v17 (source file status draft)' },
  { path: 'data/world-catalogs/novgorod/spatial-v3/datasets/universal_categories.json', origin: 'v17_spatial_v3', v17_status: 'approved' },
];
const PR98_APPEARANCE = 'data/world-catalogs/novgorod/live-world-runtime-v17/appearance-transfer-v3-datasets/universal_categories.json';
const CONTENT_CATEGORIES = 'buildings-interiors-containers/containers/content_categories.csv';

// Several source shapes put one human label in a single field (`preferred_label`,
// `preferred_label_ru`, or similar) rather than separate name_ru/name_en columns, and that one
// field is sometimes Russian text and sometimes an English/technical identifier (e.g. v5
// universal_categories.json has both "шило" and "direct_access" under the same `preferred_label`
// key). Routing every such label into name_en regardless of language is the mapping bug the
// verifier found: it silently produced empty name_ru for the many rows whose one label was
// Russian. Detect the language instead of assuming it.
const RU = /[а-яёА-ЯЁ]/;
function namesFromLabel(explicitRu, explicitEn, label) {
  if (explicitRu || explicitEn) return { name_ru: explicitRu || '', name_en: explicitEn || '' };
  if (!label) return { name_ru: '', name_en: '' };
  return RU.test(label) ? { name_ru: label, name_en: '' } : { name_ru: '', name_en: label };
}

function placeFamilyCategories() {
  const fam = readCsv(path.join(GROUP, 'places/place_families.csv'));
  const kinds = [...new Set(fam.map((f) => f.pf_kind))].sort();
  const root = {
    category_id: 'cat_place_family', domain: 'place_family', facet: 'place_family', stable_code: 'place_family', parent_category_id: '',
    name_ru: 'Семейство места', name_en: 'Place family',
    definition: 'Root of place families: kinds of ordinary places used as the key of presence pools.',
    scope_note: 'Universal (world-wide); regional permission via region_category_options.', inclusion_rules: 'All place-first families.', exclusion_rules: 'Concrete places, nodes, templates.',
  };
  const kindRows = kinds.map((k) => ({
    category_id: `cat_place_family_kind_${k}`, domain: 'place_family', facet: 'place_family', stable_code: `place_family.kind.${k}`, parent_category_id: root.category_id,
    name_ru: '', name_en: k.replace(/_/g, ' '), definition: `Place families of kind ${k}.`, scope_note: 'Grouping level for presence rule inheritance by parent_category_id.',
    inclusion_rules: `pf_kind = ${k} in places/place_families.csv`, exclusion_rules: 'Families of another kind.',
  }));
  const famRows = fam.map((f) => ({
    category_id: `cat_${f.pf_id}`, domain: 'place_family', facet: 'place_family', stable_code: `place_family.${f.pf_id.slice(3)}`, parent_category_id: `cat_place_family_kind_${f.pf_kind}`,
    name_ru: f.name_ru, name_en: f.name_en, definition: f.description_en, scope_note: 'Key of presence pools; composes with: ' + (f.composes_with || '-'),
    inclusion_rules: `WK place-first family ${f.pf_id.slice(3)}`, exclusion_rules: 'Not a concrete place; does not assert presence of anything.',
  }));
  const rows = [root, ...kindRows, ...famRows].map((r) => ({
    ...r, preferred_label: r.name_en, title: r.name_ru || r.name_en, region_id: '', universal: 'true', pf_ref: r.category_id.startsWith('cat_pf_') ? r.category_id.slice(4) : '',
    source_domain_file: 'places-binding/places/place_families.csv', source_refs: 'data/world-catalogs/novgorod/world-knowledge/production-v1/place-first-cartography.json', status: 'candidate',
  }));
  const cols = ['category_id', 'domain', 'facet', 'stable_code', 'parent_category_id', 'name_ru', 'name_en', 'preferred_label', 'title', 'definition', 'scope_note', 'inclusion_rules', 'exclusion_rules', 'region_id', 'universal', 'pf_ref', 'source_domain_file', 'source_refs', 'status'];
  writeCsv(path.join(GROUP, 'categories/place_family_categories.csv'), cols, rows);
  return rows;
}

function listCsv(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['node_modules', '.git', 'source_snapshot', 'sources', 'authoring'].includes(e.name)) out.push(...listCsv(p)); }
    else if (e.name.endsWith('.csv')) out.push(p);
  }
  return out;
}

export function build() {
  const own = placeFamilyCategories();
  const reg = new Map(); // category_id -> row
  const problems = [];
  const reuses = []; // group rows that re-declare an existing v17 category id (allowed reuse)
  const add = (r, origin, file) => {
    if (!r.category_id) return;
    if (reg.has(r.category_id)) {
      const prev = reg.get(r.category_id);
      if (prev.origin.startsWith('v17_') && origin.startsWith('game_base_v1:')) reuses.push({ category_id: r.category_id, file, same_stable_code: !r.stable_code || r.stable_code === prev.stable_code });
      else if (prev.origin !== origin || prev.source_file !== file) problems.push({ kind: 'duplicate_category_id', category_id: r.category_id, files: [prev.source_file, file] });
      return;
    }
    reg.set(r.category_id, { ...r, origin, source_file: file });
  };
  for (const e of EXISTING) for (const c of arr(readJson(path.join(REPO, e.path)))) {
    const names = namesFromLabel('', '', c.preferred_label);
    add({ category_id: c.id, domain: c.domain, facet: c.facet, stable_code: c.stable_code, parent_category_id: c.parent_category_id ?? '', ...names, status: c.status }, e.origin, e.path);
  }
  const extract = path.join(GROUP, 'inputs/pr98-extract.json');
  const appPath = path.join(REPO, '..', 'Novgorod-runtime', PR98_APPEARANCE);
  if (fs.existsSync(appPath)) for (const c of arr(readJson(appPath))) {
    const names = namesFromLabel('', '', c.preferred_label);
    add({ category_id: c.id, domain: c.domain, facet: c.facet, stable_code: c.stable_code, parent_category_id: c.parent_category_id ?? '', ...names, status: c.status }, 'v17_actor_appearance', 'pr98:' + PR98_APPEARANCE);
  }
  else problems.push({ kind: 'source_missing', path: 'pr98:' + PR98_APPEARANCE });
  for (const r of own) add(r, 'game_base_v1:places-binding', rel(path.join(GROUP, 'categories/place_family_categories.csv')));

  // content_categories.csv (container fill-content vocabulary) uses its own shape
  // (content_category, name_ru, origin, status) with no domain/stable_code/parent columns, so the
  // generic def-file scan below (category_id + domain header) never picks it up. Ingest it
  // explicitly as domain 'container_content', using the content_category value itself as both
  // category_id and stable_code (it is already a unique snake_case code).
  const contentPath = path.join(GAME_BASE, CONTENT_CATEGORIES);
  if (fs.existsSync(contentPath)) {
    for (const r of readCsv(contentPath)) add({
      category_id: r.content_category, domain: 'container_content', facet: 'content_category', stable_code: r.content_category,
      parent_category_id: '', name_ru: r.name_ru || '', name_en: '', status: r.status || 'candidate', region_id: '',
    }, 'game_base_v1:buildings-interiors-containers', rel(contentPath));
  } else problems.push({ kind: 'source_missing', path: rel(contentPath) });

  // Collect category definition files of other groups: header has category_id and domain.
  const files = listCsv(GAME_BASE).filter((f) => !f.startsWith(GROUP));
  const defFiles = [], refFiles = [];
  for (const f of files) {
    const head = fs.readFileSync(f, 'utf8').split(/\r?\n/)[0].replace(/^﻿/, '').split(',');
    if (head.includes('category_id') && head.includes('domain')) defFiles.push(f);
    else if (head.some((h) => ['category_id', 'category_ref', 'universal_category_id'].includes(h))) refFiles.push(f);
  }
  const groupOf = (f) => path.relative(GAME_BASE, f).split(path.sep)[0];
  for (const f of defFiles) for (const r of readCsv(f)) {
    const names = namesFromLabel(r.name_ru || r.preferred_label_ru, r.name_en || r.preferred_label_en, r.preferred_label);
    add({
      category_id: r.category_id, domain: r.domain, facet: r.facet || r.layer || '', stable_code: r.stable_code || '', parent_category_id: r.parent_category_id || '',
      ...names, status: r.status || 'candidate', region_id: r.region_id || '',
    }, 'game_base_v1:' + groupOf(f), rel(f));
  }

  // Checks.
  const rows = [...reg.values()];
  for (const r of rows) if (!r.stable_code) problems.push({ kind: 'stable_code_missing', category_id: r.category_id, file: r.source_file });
  const byCode = new Map();
  for (const r of rows) if (r.stable_code) { const k = r.stable_code; if (byCode.has(k)) problems.push({ kind: 'stable_code_duplicate', stable_code: k, category_ids: [byCode.get(k), r.category_id] }); else byCode.set(k, r.category_id); }
  for (const r of rows) if (r.parent_category_id && !reg.has(r.parent_category_id)) problems.push({ kind: 'parent_missing', category_id: r.category_id, parent: r.parent_category_id, file: r.source_file });
  for (const r of rows) { // cycle check
    const seen = new Set([r.category_id]); let p = r.parent_category_id;
    while (p && reg.has(p)) { if (seen.has(p)) { problems.push({ kind: 'cycle', category_id: r.category_id }); break; } seen.add(p); p = reg.get(p).parent_category_id; }
  }
  const refProblems = [];
  let refCount = 0;
  for (const f of refFiles) for (const r of readCsv(f)) for (const col of ['category_id', 'category_ref', 'universal_category_id']) {
    if (!r[col]) continue;
    for (const v of r[col].split(';').map((s) => s.trim()).filter(Boolean)) { refCount++; if (!reg.has(v)) refProblems.push({ file: rel(f), column: col, value: v }); }
  }
  const out = rows.map((r) => ({
    category_id: r.category_id, domain: r.domain, facet: r.facet, stable_code: r.stable_code, parent_category_id: r.parent_category_id,
    name_ru: r.name_ru, name_en: r.name_en, region_id: r.region_id ?? '', origin: r.origin, source_domain_file: r.source_file, status: r.status,
  })).sort((a, b) => (a.domain + a.category_id).localeCompare(b.domain + b.category_id));
  const n = writeCsv(path.join(GROUP, 'categories/category_registry.csv'), Object.keys(out[0]), out);
  const byOrigin = out.reduce((a, r) => ((a[r.origin] = (a[r.origin] ?? 0) + 1), a), {});
  const byDomain = out.reduce((a, r) => ((a[r.domain] = (a[r.domain] ?? 0) + 1), a), {});
  const unresolvedByFile = refProblems.reduce((a, p) => ((a[p.file] = (a[p.file] ?? 0) + 1), a), {});
  const report = {
    registry_rows: n, own_place_family_rows: own.length, reused_v17_ids: reuses.length, reused_v17_with_different_stable_code: reuses.filter((x) => !x.same_stable_code).length, by_origin: byOrigin, by_domain: byDomain,
    definition_files: [...defFiles.map(rel), rel(contentPath)], reference_files: refFiles.map(rel), references_checked: refCount,
    unresolved_references: refProblems.length, unresolved_by_file: unresolvedByFile, unresolved_sample: refProblems.slice(0, 50),
    problems_by_kind: problems.reduce((a, p) => ((a[p.kind] = (a[p.kind] ?? 0) + 1), a), {}), problems: problems.slice(0, 200),
    missing_target_domains: ['flora', 'fauna', 'food', 'garment', 'behavior', 'motive', 'knowledge', 'activity'].filter((d) => !byDomain[d]),
  };
  writeJson(path.join(GROUP, 'reports/category-registry-report.json'), report);
  console.log('category registry', { rows: n, by_origin: byOrigin, unresolved_references: refProblems.length, problems: report.problems_by_kind, missing_target_domains: report.missing_target_domains });
  return { reg, report };
}
if (process.argv[1]?.endsWith('build-category-registry.mjs')) build();
