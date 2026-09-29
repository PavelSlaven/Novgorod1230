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
import crypto from 'node:crypto';
import { REPO, GROUP, GAME_BASE, readJson, readCsv, readTsv, writeCsv, writeJson, rel, split, SEASONS } from './lib.mjs';
import { loadTemplateRegistry } from './build-place-families.mjs';

const RULE = readJson(path.join(GROUP, 'presence/frequency_rule.json'));
const SCOPES = ['place_family', 'g4', 'g5', 'region', 'landscape_template', 'place_template', 'scene_template', 'container_template'];
const CONTRACT_SCOPES = ['landscape_template', 'place_template', 'scene_template', 'container_template'];
const ENVIRONMENT_AUTHORING = path.join(GROUP, 'presence/environment_presence_authoring.csv');
const TIME_ORDER = ['morning', 'day', 'evening', 'night'];

// MASTER cross-check: item_location_links.csv (read-only game-base source, not a group's authored
// output) states, per link_id, the class MASTER itself attests (spawn_frequency) and whether that
// attestation only proves historical admissibility, not proven presence (availability_class
// context_bound). A pool row that cites master_link:<id> refs but claims a higher frequency_class
// than any cited link actually attests is over-claiming; this caps it back down to what the cited
// links support and flags it, instead of trusting the pool's own class blindly.
const CLASS_RANK = { ubiquitous: 4, common: 3, contextual: 2, rare: 1 };
const MASTER_LINKS_PATH = path.join(GAME_BASE, '../sources/master-archive-v1/data/normalized_source_tables/material_entities/item_location_links.csv');
const MASTER_LINKS = new Map(readCsv(MASTER_LINKS_PATH).map((r) => [r.link_id, r]));
const AVAILABILITY_RANK = { common: 2, context_bound: 1 };
const DERIVATION_RANK = { R_SPAWN_PROFILE: 2, R_MASTER_LINK: 2, R_WHERE_USED_TEXT: 1, R_GROUP_DEFAULT: 1 };
const CONFIDENCE_RANK = { A: 3, B: 2, C: 1 };
const linkIds = (refs) => [...String(refs || '').matchAll(/master_link:(ILO\d+)/g)].map((m) => m[1]);

function capByMasterLinks(cls, sourceRefsRaw) {
  const ids = linkIds(sourceRefsRaw);
  for (const id of ids) if (!MASTER_LINKS.has(id)) throw new Error(`MASTER link ${id} not found in ${MASTER_LINKS_PATH}`);
  const attested = ids.map((id) => MASTER_LINKS.get(id).spawn_frequency).filter((c) => CLASS_RANK[c]);
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

function canonicalSeasons(raw) {
  const parsed = seasons(raw);
  if (parsed.error) throw new Error(parsed.error);
  if (parsed.ok.includes('all') || parsed.ok.length === SEASONS.length) return 'all';
  return SEASONS.filter((season) => parsed.ok.includes(season)).join(';');
}

function presenceIdentity(row, seasonValue) {
  const parts = [row.scope_kind, row.scope_ref, row.region_id, row.subject_kind, row.subject_ref];
  if (row.subject_kind === 'environment') parts.push(row.condition_key);
  parts.push(seasonValue);
  return JSON.stringify(parts.map((value) => String(value ?? '').trim()));
}

function environmentRows() {
  const source = readCsv(ENVIRONMENT_AUTHORING);
  const seasonalScopeSeasons = new Map(readCsv(path.join(GROUP, 'places/place_families.csv'))
    .filter((family) => family.pf_kind === 'seasonal_overlay')
    .map((family) => [family.pf_id, SEASONS.find((season) => family.pf_id.startsWith(`pf_${season}_`))]));
  const ids = new Set();
  return source.flatMap((row, index) => {
    const where = `presence/environment_presence_authoring.csv#${row.env_rule_id || `row${index + 2}`}`;
    if (!row.env_rule_id || ids.has(row.env_rule_id)) throw new Error(`${where}: empty or duplicate env_rule_id`);
    ids.add(row.env_rule_id);
    const frequency = ppmFor(row.frequency_class);
    if (!frequency) throw new Error(`${where}: unknown frequency class ${row.frequency_class}`);
    const allowedSeasons = canonicalSeasons(row.allowed_seasons);
    const times = TIME_ORDER.filter((time) => split(row.allowed_times).includes(time));
    if (!times.length || times.length !== new Set(split(row.allowed_times)).size) throw new Error(`${where}: invalid allowed_times`);
    const scopes = split(row.pf_scope).length ? split(row.pf_scope) : [row.pf_id].filter(Boolean);
    if (!scopes.length || new Set(scopes).size !== scopes.length) throw new Error(`${where}: empty or duplicate pf_scope/pf_id`);
    return scopes.map((scopeRef) => {
      const ownSeason = seasonalScopeSeasons.get(scopeRef);
      const projectedSeasons = ownSeason
        ? ((allowedSeasons === 'all' || split(allowedSeasons).includes(ownSeason)) ? ownSeason : '')
        : allowedSeasons;
      if (!projectedSeasons) throw new Error(`${where}: scope ${scopeRef} has no season overlap`);
      const keyRow = {
        scope_kind: 'place_family', scope_ref: scopeRef, region_id: 'region_novgorod_land',
        subject_kind: 'environment', subject_ref: row.companion_ref, condition_key: row.env_rule_id,
      };
      const identity = presenceIdentity(keyRow, projectedSeasons);
      return {
        pr_id: `pr_${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16)}`,
        ...keyRow,
        category_ref: '', item_ref: '', variants: '[]',
        frequency_class: frequency.cls, class_capped_from: '', probability_ppm: frequency.ppm,
        probability_rule_ref: `${RULE.rule_id}@${RULE.rule_version}`,
        count_limit: 1, count_limit_basis: 'environment_authoring',
        allowed_seasons: projectedSeasons, allowed_times: times.join(';'), guards: row.condition_refs || 'none',
        entry_visible_if: '', search_only_if: '', entry_exposed_weight: '', search_concealed_weight: '',
        placement_basis_ref: '', placement_owner_ref: '', wild_arrival_cause_required: '',
        refresh_class: split(row.reevaluate_on).includes('season_change') ? 'by_year_season' : 'none',
        contract_scope_kind: 'no_needs_cr', source_pool: where, source_row_id: row.env_rule_id,
        source_refs: row.source_refs, confidence: 'C', pool_confidence: row.confidence, status: row.status,
        name_ru: row.name_ru, lens: row.lens, environment_kind: row.environment_kind, senses: row.senses,
        condition_refs: row.condition_refs, reevaluate_on: row.reevaluate_on,
        material_refs: row.material_refs, process_refs: row.process_refs, item_refs: row.item_refs,
        reuse_refs: row.reuse_refs, basis: row.basis, derivation: row.derivation,
      };
    });
  });
}

export function build({ write = true } = {}) {
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
    const rows = readCsv(f);
    const idColumn = path.basename(f) === 'item_place_frequency.csv' ? 'ipf_id' : path.basename(f) === 'wild_habitat_presence.csv' ? 'presence_id' : '';
    const ids = rows.map((r) => r[idColumn]);
    const stableIds = idColumn && ids.every(Boolean) && new Set(ids).size === ids.length;
    rows.forEach((r, i) => {
      const where = `${rel(f)}#${stableIds ? r[idColumn] : `row${i + 2}`}`;
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
      const statedLimit = r.count_limit || r.max_count;
      const ruleLimit = r.count_limit_rule ? /^\w+:max (\d+) instance-group per first-arrival roll;/.exec(r.count_limit_rule) : null;
      const cl = statedLimit || ruleLimit?.[1];
      const errs = [];
      if (!cat) errs.push('category_ref empty'); else if (!cats.has(cat)) errs.push(`category_ref '${cat}' not in category_registry`);
      if (!fc) errs.push(`frequency_class '${r.frequency_class}' unknown`);
      if (!scopes.length) errs.push('no scope');
      for (const [k, ref] of scopes) { if (!SCOPES.includes(k)) errs.push(`scope_kind '${k}' unknown`); else if (!scopeOk(k, ref)) errs.push(`scope_ref '${ref}' (${k}) does not resolve`); }
      if (s.error) errs.push(s.error);
      if (!refresh) errs.push(`refresh_class '${refreshRaw}' unknown`);
      if (cl && !(Number.isInteger(+cl) && +cl >= 1)) errs.push(`count_limit '${cl}' not an integer >= 1`);
      if (r.count_limit_rule && !ruleLimit && !statedLimit) errs.push('count_limit_rule unrecognised');
      if (!r.source_refs) errs.push('source_refs empty');
      const itemPool = path.basename(f) === 'item_place_frequency.csv';
      if (itemPool && (!r.entry_visible_if || !r.search_only_if)) errs.push('item discovery conditions empty');
      if (itemPool && r.pf_class === 'wild' && r.wild_arrival_cause_required !== 'prior_visitor_loss_or_discard') errs.push('wild item arrival cause missing');
      if (errs.length) { rejects.push({ where, row_id: rowId, errors: errs }); return; }
      for (const [k, ref] of scopes) pools.push({
        scope_kind: k, scope_ref: ref, region_id: r.region_id || '', category_ref: cat, frequency_class: fc.cls, probability_ppm: fc.ppm,
        probability_rule_ref: `${RULE.rule_id}@${RULE.rule_version}`, count_limit: cl ? +cl : 1, count_limit_basis: statedLimit ? 'pool_row' : ruleLimit ? 'pool_count_limit_rule' : 'default_minimum_1',
        allowed_seasons: s.ok, refresh_class: refresh, source_pool: where, source_row_id: rowId, source_refs: r.source_refs,
        entry_visible_if: itemPool ? r.entry_visible_if : '', search_only_if: itemPool ? r.search_only_if : '',
        entry_exposed_weight: itemPool ? r.entry_exposed_weight : '', search_concealed_weight: itemPool ? r.search_concealed_weight : '',
        placement_basis_ref: itemPool ? r.placement_basis_ref : '', placement_owner_ref: itemPool ? r.placement_owner_ref : '',
        wild_arrival_cause_required: itemPool ? r.wild_arrival_cause_required : '',
        item_ref: itemPool && r.ref_kind === 'it' ? r.item_or_category_ref : '',
        derivation_rule: itemPool ? r.derivation_rule : '',
        availability: 0,
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
  const candidates = pools.map((p) => ({ ...p, subject_kind: 'category', subject_ref: p.category_ref, allowed_times: 'all', guards: '', status: 'candidate' }));
  const people = readCsv(path.join(GROUP, 'presence/people_presence_authoring.csv'));
  const occupations = new Set(readTsv(path.join(REPO, 'data/novgorod-region/novgorod_occupations_v1.tsv')).map((r) => r.occupation_id));
  const roles = new Set(readTsv(path.join(REPO, 'data/novgorod-region/novgorod_social_roles_v1.tsv')).map((r) => r.role_id));
  for (const [i, p] of people.entries()) {
    const where = `presence/people_presence_authoring.csv#row${i + 2}`;
    if (!['composition', 'presence_rule'].includes(p.creation_owner)) throw new Error(`${where}: invalid creation_owner`);
    if (p.scope_kind !== 'place_family' || !families.has(p.scope_ref)) throw new Error(`${where}: unresolved place family ${p.scope_ref}`);
    if (!({ occupation: occupations, social_role: roles })[p.subject_kind]?.has(p.subject_ref)) throw new Error(`${where}: unresolved subject ${p.subject_kind}:${p.subject_ref}`);
    const fc = ppmFor(p.frequency_class);
    if (!fc) throw new Error(`${where}: unknown frequency class ${p.frequency_class}`);
    if (!Number.isInteger(+p.count_limit) || +p.count_limit < 1) throw new Error(`${where}: invalid count_limit`);
    if (!RULE.refresh_rule.values.includes(p.refresh_class) || p.status !== 'candidate' || !p.source_refs || !p.guards || p.source_rule_ref !== 'frequency_rule.json#editorial_candidate' || p.confidence !== 'C') throw new Error(`${where}: invalid refresh, status, source, rule, guards, or confidence`);
    const seasonList = split(p.allowed_seasons);
    const times = split(p.allowed_times);
    if (!seasonList.length || seasonList.some((s) => !RULE.season_rule.dictionary.includes(s)) || !times.length || times.some((t) => !['morning', 'day', 'evening', 'night'].includes(t))) throw new Error(`${where}: invalid season or time`);
    if (p.creation_owner === 'composition') continue;
    for (const season of seasonList) for (const time of times) {
      candidates.push({ scope_kind: p.scope_kind, scope_ref: p.scope_ref, region_id: 'region_novgorod_land', category_ref: '', subject_kind: p.subject_kind, subject_ref: p.subject_ref,
        frequency_class: fc.cls, class_capped_from: '', probability_ppm: fc.ppm, probability_rule_ref: `${RULE.rule_id}@${RULE.rule_version}`, count_limit: +p.count_limit, count_limit_basis: 'people_authoring',
        allowed_seasons: season, allowed_times: time, guards: p.guards, entry_visible_if: '', search_only_if: '', entry_exposed_weight: '', search_concealed_weight: '', placement_basis_ref: '', placement_owner_ref: '', wild_arrival_cause_required: '', item_ref: '', derivation_rule: '', availability: 0, refresh_class: p.refresh_class, contract_scope_kind: 'no_needs_cr', source_pool: where, source_row_id: `${i + 2}`, source_refs: p.source_refs,
        confidence: p.confidence, pool_confidence: '', status: p.status });
    }
  }
  const baseKey = (p) => [p.scope_kind, p.scope_ref, p.region_id, p.subject_kind, p.subject_ref, ...(p.subject_kind === 'environment' ? [p.condition_key] : [])].join('|');
  const provenance = ['source_pool', 'source_row_id', 'source_refs', 'placement_basis_ref', 'placement_owner_ref', 'pool_confidence', 'class_capped_from', 'derivation_rule', 'availability'];
  const behavior = (p, includeTime = true) => JSON.stringify(Object.entries(p).filter(([k]) => !provenance.includes(k) && !['allowed_seasons', 'item_ref', 'variants'].includes(k) && (includeTime || k !== 'allowed_times')).sort(([a], [b]) => a.localeCompare(b)));
  const union = (values, separator) => [...new Set(values.flatMap((v) => String(v || '').split(separator).map((s) => s.trim()).filter(Boolean)))].sort().join(separator === ';' ? ';' : ' | ');
  const groups = new Map();
  for (const p of candidates) for (const season of p.allowed_seasons.includes('all') ? SEASONS : Array.isArray(p.allowed_seasons) ? p.allowed_seasons : split(p.allowed_seasons)) {
    const k = `${baseKey(p)}|${season}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ ...p, allowed_seasons: season });
  }
  const derivationRank = (p) => Math.max(0, ...String(p.derivation_rule || '').split('+').map((rule) => DERIVATION_RANK[rule] || 0));
  const evidence = (p) => ({ availability: p.availability, derivation: derivationRank(p), confidence: CONFIDENCE_RANK[p.pool_confidence] || 0, probability_ppm: p.probability_ppm });
  const compare = (a, b) => b.availability - a.availability || derivationRank(b) - derivationRank(a)
    || (CONFIDENCE_RANK[b.pool_confidence] || 0) - (CONFIDENCE_RANK[a.pool_confidence] || 0) || a.probability_ppm - b.probability_ppm
    || a.source_row_id.localeCompare(b.source_row_id) || a.source_pool.localeCompare(b.source_pool);
  const decisionReason = (winner, other) => winner.availability !== other.availability ? 'evidence_stronger:availability'
    : derivationRank(winner) !== derivationRank(other) ? 'evidence_stronger:derivation'
      : (CONFIDENCE_RANK[winner.pool_confidence] || 0) !== (CONFIDENCE_RANK[other.pool_confidence] || 0) ? 'evidence_stronger:confidence'
        : winner.probability_ppm !== other.probability_ppm ? 'equal_evidence_lower_ppm' : 'equal_evidence_stable_tie';
  const resolved = [], resolutionSeasons = [];
  for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    // Compare only link archetypes actually shared by linked competitors. A PF mapping is
    // deliberately not inferred from these links. For several same-archetype links use max.
    const linked = group.map((p) => linkIds(p.source_refs).map((id) => MASTER_LINKS.get(id))).filter((links) => links.length);
    const shared = linked.length ? linked.slice(1).reduce((set, links) => new Set([...set].filter((a) => links.some((link) => link.location_archetype === a))), new Set(linked[0].map((link) => link.location_archetype))) : new Set();
    for (const p of group) p.availability = Math.max(0, ...linkIds(p.source_refs).map((id) => MASTER_LINKS.get(id)).filter((link) => shared.has(link.location_archetype)).map((link) => AVAILABILITY_RANK[link.availability_class] || 0));
    const sorted = [...group].sort(compare);
    const winner = sorted[0];
    const same = sorted.filter((p) => p.item_ref === winner.item_ref && behavior(p, false) === behavior(winner, false));
    const compatible = winner.subject_kind === 'category' ? same.filter((p) => p.allowed_times === winner.allowed_times) : same;
    const chosen = { ...winner };
    for (const field of provenance.filter((field) => !['derivation_rule', 'availability'].includes(field))) chosen[field] = union(compatible.map((p) => p[field]), field === 'source_pool' || field === 'source_row_id' ? ';' : '|');
    const source = (p) => ({ source_pool: p.source_pool, source_row_id: p.source_row_id, item_ref: p.item_ref });
    const alternatives = sorted.filter((p) => !compatible.includes(p));
    chosen.variants = JSON.stringify(alternatives.filter((p) => p.item_ref && p.item_ref !== winner.item_ref).map(source));
    if (chosen.subject_kind !== 'category') chosen.allowed_times = ['morning', 'day', 'evening', 'night'].filter((t) => compatible.some((p) => split(p.allowed_times).includes(t))).join(';');
    resolved.push(chosen);
    if (group.length > 1) {
      const runner = alternatives.find((p) => p.availability !== winner.availability || derivationRank(p) !== derivationRank(winner) || p.pool_confidence !== winner.pool_confidence || p.probability_ppm !== winner.probability_ppm) || alternatives[0];
      const reason = !runner ? chosen.subject_kind !== 'category' && new Set(group.map((p) => p.allowed_times)).size > 1 ? 'time_union' : 'equivalent_merged' : decisionReason(winner, runner);
      resolutionSeasons.push({ key: key.slice(0, key.lastIndexOf('|')), season: key.slice(key.lastIndexOf('|') + 1), reason,
        tie_break: alternatives[0] && decisionReason(winner, alternatives[0]) === 'equal_evidence_stable_tie' ? 'equal_evidence_stable_tie' : '',
        behavior_conflict: alternatives.some((p) => behavior(p, false) !== behavior(winner, false)),
        chosen: source(winner), equivalent: compatible.filter((p) => p !== winner).map(source), variants: alternatives.filter((p) => p.item_ref && p.item_ref !== winner.item_ref).map(source),
        dropped: alternatives.filter((p) => !p.item_ref || p.item_ref === winner.item_ref).map(source),
        compared: runner ? sorted.map((p) => ({ ...source(p), ...evidence(p) })) : [],
      });
    }
  }
  // A full-year result has one row only when its behavior and provenance are identical in all seasons.
  const byBase = new Map();
  for (const p of resolved) { const k = baseKey(p); if (!byBase.has(k)) byBase.set(k, []); byBase.get(k).push(p); }
  const compact = [...byBase.values()].flatMap((seasonRows) => seasonRows.length === SEASONS.length && seasonRows.every((p) => behavior(p) === behavior(seasonRows[0]) && provenance.every((field) => p[field] === seasonRows[0][field]))
    ? [{ ...seasonRows[0], allowed_seasons: 'all' }] : seasonRows);
  const keys = new Set(), ids = new Set();
  const rows = compact.sort((a, b) => `${baseKey(a)}|${a.allowed_seasons}`.localeCompare(`${baseKey(b)}|${b.allowed_seasons}`)).map((p) => {
    const ordered = SEASONS.filter((s) => split(p.allowed_seasons).includes(s)).join(';');
    const seasons = p.allowed_seasons === 'all' || ordered === SEASONS.join(';') ? 'all' : ordered;
    const key = presenceIdentity(p, seasons);
    const pr_id = `pr_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}`;
    if (keys.has(key)) throw new Error(`duplicate presence key ${key}`);
    if (ids.has(pr_id)) throw new Error(`presence ID collision ${pr_id}`);
    keys.add(key); ids.add(pr_id);
    return { pr_id, ...p, allowed_seasons: seasons };
  });
  const environment = environmentRows().sort((a, b) => `${a.scope_kind}|${a.scope_ref}|${a.subject_kind}|${a.subject_ref}|${a.condition_key || ''}|${a.allowed_seasons}`.localeCompare(`${b.scope_kind}|${b.scope_ref}|${b.subject_kind}|${b.subject_ref}|${b.condition_key || ''}|${b.allowed_seasons}`));
  const allIds = new Set(rows.map((row) => row.pr_id));
  for (const row of environment) {
    if (allIds.has(row.pr_id)) throw new Error(`presence ID collision ${row.pr_id}`);
    allIds.add(row.pr_id);
  }
  const allRows = [...rows, ...environment];
  const cols = ['pr_id', 'scope_kind', 'scope_ref', 'region_id', 'category_ref', 'subject_kind', 'subject_ref', 'condition_key', 'name_ru', 'lens', 'environment_kind', 'senses', 'item_ref', 'variants', 'frequency_class', 'class_capped_from', 'probability_ppm', 'probability_rule_ref', 'count_limit', 'count_limit_basis', 'allowed_seasons', 'allowed_times', 'guards', 'condition_refs', 'reevaluate_on', 'material_refs', 'process_refs', 'item_refs', 'reuse_refs', 'basis', 'derivation', 'entry_visible_if', 'search_only_if', 'entry_exposed_weight', 'search_concealed_weight', 'placement_basis_ref', 'placement_owner_ref', 'wild_arrival_cause_required', 'refresh_class', 'contract_scope_kind', 'source_pool', 'source_row_id', 'source_refs', 'confidence', 'pool_confidence', 'status'];
  const n = write ? writeCsv(path.join(GROUP, 'presence/presence_rules.csv'), cols, allRows) : allRows.length;
  const cappedRows = allRows.filter((r) => r.class_capped_from);
  const resolutions = [];
  for (const r of resolutionSeasons) {
    const signature = JSON.stringify({ ...r, season: undefined });
    const previous = resolutions.find((x) => x._signature === signature);
    if (previous) previous.seasons.push(r.season);
    else resolutions.push({ ...r, seasons: [r.season], _signature: signature });
  }
  for (const r of resolutions) { delete r.season; delete r._signature; }
  const variantResolutions = resolutions.filter((r) => r.variants.length);
  const report = {
    rule: `${RULE.rule_id}@${RULE.rule_version}`, pool_files: poolFiles.map(rel), frequency_files_not_matching_pool_contract: poolLike, pool_rows_accepted: pools.length, environment_authoring_rows: readCsv(ENVIRONMENT_AUTHORING).length, environment_projection_rows: environment.length, rules_written: n, category_rules: allRows.filter((r) => r.subject_kind === 'category').length, people_rules: allRows.filter((r) => ['occupation', 'social_role'].includes(r.subject_kind)).length, environment_rules: environment.length,
    seasonal_candidate_rows: [...groups.values()].reduce((n, g) => n + g.length, 0), resolutions,
    item_variant_selection: {
      status: 'data_gap', weights_status: 'absent',
      activation_requirement: { runtime_constraint: 'uniform_among_chosen_item_and_variants_if_weights_absent', implementation_present: false },
      weight_owner: null, weight_contract: null,
      variant_keys: new Set(variantResolutions.map((r) => r.key)).size,
      item_alternatives: new Set(variantResolutions.flatMap((r) => r.variants.map((v) => `${r.key}|${v.item_ref}`))).size,
    },
    rejected_rows: rejects.length, rejected_by_file: rejects.reduce((a, r) => { const f = r.where.split('#')[0]; a[f] = (a[f] ?? 0) + 1; return a; }, {}),
    reject_reasons: rejects.flatMap((r) => r.errors.map((e) => e.replace(/'[^']*'/g, "'…'"))).reduce((a, e) => ((a[e] = (a[e] ?? 0) + 1), a), {}),
    rejected_sample: rejects.slice(0, 50),
    class_capped_by_master_link: cappedRows.length,
    class_capped_sample: cappedRows.slice(0, 20).map((r) => ({ pr_id: r.pr_id, scope_ref: r.scope_ref, category_ref: r.category_ref, from: r.class_capped_from, to: r.frequency_class })),
    environment_by_kind: environment.reduce((a, r) => ((a[r.environment_kind] = (a[r.environment_kind] ?? 0) + 1), a), {}),
    environment_by_lens: environment.reduce((a, r) => ((a[r.lens] = (a[r.lens] ?? 0) + 1), a), {}),
    environment_by_basis: environment.reduce((a, r) => ((a[r.basis] = (a[r.basis] ?? 0) + 1), a), {}),
    by_scope_kind: allRows.reduce((a, r) => ((a[r.scope_kind] = (a[r.scope_kind] ?? 0) + 1), a), {}),
    by_class: allRows.reduce((a, r) => ((a[r.frequency_class] = (a[r.frequency_class] ?? 0) + 1), a), {}),
  };
  if (write) {
    writeJson(path.join(GROUP, 'reports/presence-rules-report.json'), report);
    console.log('presence rules', { pool_files: poolFiles.length, accepted: pools.length, written: n, rejected: rejects.length, reasons: report.reject_reasons });
  }
  return { rows: allRows, report };
}
if (process.argv[1]?.endsWith('build-presence-rules.mjs')) build();
