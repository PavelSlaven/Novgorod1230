// Presence-rule collector: scans pool CSV files of all game-base-v1 groups and converts every
// pool row into one presence rule by presence/frequency_rule.json. The group authors only the
// rule and this collector; pool rows belong to the owning groups.
//
// Pool file contract (detected by header; scope aliases landscape_template_id, g4_ref, g5_ref accepted):
//   frequency_class                         required
//   category_ref | category_id              required (must resolve in categories/category_registry.csv)
//   scope: place_family_id | pf_id | pf_ids (';' list)  -> scope_kind place_family
//          or scope_kind + scope_ref (place_family|g4|g5|region|landscape_template|place_template|scene_template|container_template)
//   optional: region_id, count_limit|max_count, allowed_seasons|season_period|seasons|season, refresh_class, source_refs, confidence
import fs from 'node:fs';
import path from 'node:path';
import { GROUP, GAME_BASE, readJson, readCsv, writeCsv, writeJson, rel, split } from './lib.mjs';
import { loadTemplateRegistry } from './build-place-families.mjs';

const RULE = readJson(path.join(GROUP, 'presence/frequency_rule.json'));
const SCOPES = ['place_family', 'g4', 'g5', 'region', 'landscape_template', 'place_template', 'scene_template', 'container_template'];
const CONTRACT_SCOPES = ['landscape_template', 'place_template', 'scene_template', 'container_template'];

// MASTER cross-check: item_location_links.csv (read-only game-base source, not a group's authored
// output) states, per link_id, the class MASTER itself attests (spawn_frequency) and whether that
// attestation only proves historical admissibility, not proven presence (availability_class
// context_bound). A pool row that cites master_link:<id> refs but claims a higher frequency_class
// than any cited link actually attests is over-claiming; this caps it back down to what the cited
// links support and flags it, instead of trusting the pool's own class blindly.
const CLASS_RANK = { ubiquitous: 4, common: 3, contextual: 2, rare: 1 };
const MASTER_LINKS_PATH = path.join(GAME_BASE, 'sources/master-archive-v1/data/normalized_source_tables/material_entities/item_location_links.csv');
const MASTER_LINKS = fs.existsSync(MASTER_LINKS_PATH)
  ? new Map(readCsv(MASTER_LINKS_PATH).map((r) => [r.link_id, r.spawn_frequency]))
  : new Map();

function capByMasterLinks(cls, sourceRefsRaw) {
  const ids = [...String(sourceRefsRaw || '').matchAll(/master_link:(ILO\d+)/g)].map((m) => m[1]);
  const attested = ids.map((id) => MASTER_LINKS.get(id)).filter((c) => CLASS_RANK[c]);
  if (!attested.length) return { cls, capped: false };
  const maxAttested = attested.reduce((best, c) => (CLASS_RANK[c] > CLASS_RANK[best] ? c : best), attested[0]);
  if (CLASS_RANK[cls] > CLASS_RANK[maxAttested]) return { cls: maxAttested, capped: true, from: cls };
  return { cls, capped: false };
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

export function ppmFor(cls) {
  const c = RULE.classes[cls] ?? RULE.classes[RULE.class_aliases[cls]];
  return c ? { cls: RULE.classes[cls] ? cls : RULE.class_aliases[cls], ppm: Math.round((1000000 * c.weight) / 8), weight: c.weight } : null;
}

function seasons(raw) {
  const vals = split(String(raw ?? '').replace(/[|,]/g, ';')).map((s) => s.toLowerCase());
  if (!vals.length) return { ok: ['all'] };
  const out = new Set();
  for (const v of vals) {
    const m = RULE.season_rule.dictionary.includes(v) || v === 'all' ? v : RULE.season_rule.aliases[v];
    if (!m) return { error: `season '${v}' not in dictionary` };
    out.add(m);
  }
  return { ok: out.has('all') ? ['all'] : RULE.season_rule.dictionary.filter((s) => out.has(s)) };
}

export function build() {
  const families = new Set(readCsv(path.join(GROUP, 'places/place_families.csv')).map((r) => r.pf_id));
  const nodes = readCsv(path.join(GROUP, 'places/node_binding.csv'));
  const g4 = new Set(nodes.filter((n) => n.node_level === 'G4').map((n) => n.node_ref.replace(/@\d+$/, '')));
  const g5 = new Set(nodes.filter((n) => n.node_level === 'G5').map((n) => n.node_ref.replace(/@\d+$/, '')));
  const tpl = loadTemplateRegistry();
  const cats = new Set(readCsv(path.join(GROUP, 'categories/category_registry.csv')).map((r) => r.category_id));
  const regions = new Set(['region_novgorod_land']);
  const scopeOk = (k, ref) => ({
    place_family: () => families.has(ref), g4: () => g4.has(ref), g5: () => g5.has(ref), region: () => regions.has(ref),
    landscape_template: () => tpl.get(ref)?.kind === 'landscape', place_template: () => tpl.get(ref)?.kind === 'place',
    scene_template: () => /^stfv3__g5_[a-z_]+_v1$/.test(ref), container_template: () => /^container_tpl_/.test(ref),
  })[k]?.() ?? false;

  const pools = [], rejects = [];
  const files = listCsv(GAME_BASE).filter((f) => !f.startsWith(GROUP));
  const poolFiles = [], poolLike = [];
  for (const f of files) {
    const head = fs.readFileSync(f, 'utf8').split(/\r?\n/)[0].replace(/^﻿/, '').split(',');
    const hasScope = ['place_family_id', 'pf_id', 'pf_ids', 'scope_ref', 'landscape_template_id', 'g4_ref', 'g5_ref'].some((h) => head.includes(h));
    if (head.includes('frequency_class') && hasScope && (head.includes('category_ref') || head.includes('category_id'))) poolFiles.push(f);
    else if (head.includes('frequency_class')) poolLike.push({ file: rel(f), has_scope_column: hasScope, has_category_column: head.includes('category_ref') || head.includes('category_id') });
  }
  for (const f of poolFiles) {
    readCsv(f).forEach((r, i) => {
      const where = `${rel(f)}#row${i + 2}`;
      const rowId = Object.values(r)[0];
      const cat = r.category_ref || r.category_id;
      const rawFc = ppmFor((r.frequency_class || '').trim());
      const cap = rawFc ? capByMasterLinks(rawFc.cls, r.source_refs) : null;
      const fc = rawFc && cap ? { ...ppmFor(cap.cls), cls: cap.cls } : rawFc;
      let scopes = [];
      if (r.scope_kind && r.scope_ref) scopes = [[r.scope_kind, r.scope_ref]];
      else if (r.place_family_id || r.pf_id || r.pf_ids) for (const v of split((r.place_family_id || r.pf_id || r.pf_ids).replace(/,/g, ';'))) scopes.push(['place_family', v.startsWith('pf_') ? v : 'pf_' + v]);
      else if (r.g5_ref) scopes = [['g5', r.g5_ref.replace(/@\d+$/, '')]];
      else if (r.g4_ref) scopes = [['g4', r.g4_ref.replace(/@\d+$/, '')]];
      else if (r.landscape_template_id) scopes = [['landscape_template', r.landscape_template_id]];
      const s = seasons(r.allowed_seasons ?? r.season_period ?? r.seasons ?? r.season);
      const refreshRaw = (r.refresh_class || 'none').trim();
      const refresh = RULE.refresh_rule.values.includes(refreshRaw) ? refreshRaw : RULE.refresh_rule.aliases[refreshRaw];
      const cl = r.count_limit || r.max_count;
      const errs = [];
      if (!cat) errs.push('category_ref empty'); else if (!cats.has(cat)) errs.push(`category_ref '${cat}' not in category_registry`);
      if (!fc) errs.push(`frequency_class '${r.frequency_class}' unknown`);
      if (!scopes.length) errs.push('no scope');
      for (const [k, ref] of scopes) { if (!SCOPES.includes(k)) errs.push(`scope_kind '${k}' unknown`); else if (!scopeOk(k, ref)) errs.push(`scope_ref '${ref}' (${k}) does not resolve`); }
      if (s.error) errs.push(s.error);
      if (!refresh) errs.push(`refresh_class '${refreshRaw}' unknown`);
      if (cl && !(Number.isInteger(+cl) && +cl >= 1)) errs.push(`count_limit '${cl}' not an integer >= 1`);
      if (!r.source_refs) errs.push('source_refs empty');
      if (errs.length) { rejects.push({ where, row_id: rowId, errors: errs }); return; }
      for (const [k, ref] of scopes) pools.push({
        scope_kind: k, scope_ref: ref, region_id: r.region_id || '', category_ref: cat, frequency_class: fc.cls, probability_ppm: fc.ppm,
        probability_rule_ref: `${RULE.rule_id}@${RULE.rule_version}`, count_limit: cl ? +cl : 1, count_limit_basis: cl ? 'pool_row' : 'default_minimum_1',
        allowed_seasons: s.ok, refresh_class: refresh, source_pool: where, source_row_id: rowId, source_refs: r.source_refs,
        // probability_ppm is always derived by the unapproved, uncalibrated frequency_rule.json convention
        // (confidence C, see its basis[]), regardless of how confident the pool was in the underlying item/place
        // link. confidence here can never be stronger than that. pool_confidence keeps the pool's own rating for
        // transparency without letting it inflate the ppm claim's confidence.
        confidence: 'C', pool_confidence: r.confidence || '',
        class_capped_from: cap && cap.capped ? cap.from : '',
        contract_scope_kind: CONTRACT_SCOPES.includes(k) ? 'yes' : 'no_needs_cr',
      });
    });
  }
  // Deduplicate on (scope_kind, scope_ref, region_id, category_ref): keep the highest ppm, merge pool refs.
  const key = (p) => [p.scope_kind, p.scope_ref, p.region_id, p.category_ref].join('|');
  const merged = new Map(), conflicts = [];
  for (const p of pools) {
    const k = key(p), prev = merged.get(k);
    if (!prev) { merged.set(k, { ...p, source_pool: [p.source_pool], source_refs: [p.source_refs] }); continue; }
    if (prev.probability_ppm !== p.probability_ppm || prev.count_limit !== p.count_limit) conflicts.push({ key: k, a: prev.source_pool[0], b: p.source_pool });
    if (p.probability_ppm > prev.probability_ppm) Object.assign(prev, { frequency_class: p.frequency_class, probability_ppm: p.probability_ppm });
    prev.count_limit = Math.max(prev.count_limit, p.count_limit);
    if (!prev.class_capped_from && p.class_capped_from) prev.class_capped_from = p.class_capped_from;
    prev.allowed_seasons = prev.allowed_seasons.includes('all') || p.allowed_seasons.includes('all') ? ['all'] : RULE.season_rule.dictionary.filter((s) => prev.allowed_seasons.includes(s) || p.allowed_seasons.includes(s));
    prev.source_pool.push(p.source_pool); prev.source_refs.push(p.source_refs);
  }
  const rows = [...merged.values()].sort((a, b) => key(a).localeCompare(key(b))).map((p, i) => ({ pr_id: `pr_${String(i + 1).padStart(6, '0')}`, ...p, source_refs: [...new Set(p.source_refs)].join(' | '), status: 'candidate' }));
  const cols = ['pr_id', 'scope_kind', 'scope_ref', 'region_id', 'category_ref', 'frequency_class', 'class_capped_from', 'probability_ppm', 'probability_rule_ref', 'count_limit', 'count_limit_basis', 'allowed_seasons', 'refresh_class', 'contract_scope_kind', 'source_pool', 'source_row_id', 'source_refs', 'confidence', 'pool_confidence', 'status'];
  const n = writeCsv(path.join(GROUP, 'presence/presence_rules.csv'), cols, rows);
  const cappedRows = rows.filter((r) => r.class_capped_from);
  const report = {
    rule: `${RULE.rule_id}@${RULE.rule_version}`, pool_files: poolFiles.map(rel), frequency_files_not_matching_pool_contract: poolLike, pool_rows_accepted: pools.length, rules_written: n,
    duplicates_merged: pools.length - n, conflicting_duplicates: conflicts.length, conflicts: conflicts.slice(0, 50),
    rejected_rows: rejects.length, rejected_by_file: rejects.reduce((a, r) => { const f = r.where.split('#')[0]; a[f] = (a[f] ?? 0) + 1; return a; }, {}),
    reject_reasons: rejects.flatMap((r) => r.errors.map((e) => e.replace(/'[^']*'/g, "'…'"))).reduce((a, e) => ((a[e] = (a[e] ?? 0) + 1), a), {}),
    rejected_sample: rejects.slice(0, 50),
    class_capped_by_master_link: cappedRows.length,
    class_capped_sample: cappedRows.slice(0, 20).map((r) => ({ pr_id: r.pr_id, scope_ref: r.scope_ref, category_ref: r.category_ref, from: r.class_capped_from, to: r.frequency_class })),
    by_scope_kind: rows.reduce((a, r) => ((a[r.scope_kind] = (a[r.scope_kind] ?? 0) + 1), a), {}),
    by_class: rows.reduce((a, r) => ((a[r.frequency_class] = (a[r.frequency_class] ?? 0) + 1), a), {}),
  };
  writeJson(path.join(GROUP, 'reports/presence-rules-report.json'), report);
  console.log('presence rules', { pool_files: poolFiles.length, accepted: pools.length, written: n, rejected: rejects.length, reasons: report.reject_reasons });
  return report;
}
if (process.argv[1]?.endsWith('build-presence-rules.mjs')) build();
