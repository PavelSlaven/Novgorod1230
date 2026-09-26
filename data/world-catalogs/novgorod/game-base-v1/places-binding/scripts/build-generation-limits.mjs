// Place generation limits by stated rules (no copying of the audit draft):
//  R1 households: v6 g3 register household_estimate -> first "N-M" range whose first following noun
//     (within 70 chars) is a yard noun (двор/двора/дворов/дворы, not the adjective дворовых); a leading "1 ... двор с" (one main yard with dependants) adds 1 to both ends.
//  R2 residents: only where the first noun after an "N-M" range is людей/человек;
//     otherwise gap (no sourced persons-per-household figure in WK/MASTER/v6).
//  R3 g4 zones: v6 g4_target "N" or "N-M" G4-зон.
//  R4 items_notable_max (place_family): max of MASTER spawn_profiles.max_concrete_items over the
//     MASTER location archetypes crosswalked to the family.
//  R5 v17 G4: npc_present_min/max = pr98 m2c-npc g4_compositions min/max_count; g5_anchor_max = number of
//     canonical G5 children (closed set); items_notable_max = R4 of the node's primary pf.
// Then compares with the audit draft novgorod_region_generation_limits_v1.json (report only).
import path from 'node:path';
import { REPO, GROUP, readJson, readTsv, readCsv, writeCsv, writeJson, rel } from './lib.mjs';
import { MASTER_ME } from './build-place-families.mjs';

const REG = path.join(REPO, 'DOCUMENTS/documents-kg/corpus/DOCUMENTS/novgorod_graphify_g1_g4_full/source_tsv/novgorod_g3_scale_register_v6.tsv');
const AUDIT = path.join(REPO, 'data/world-catalogs/novgorod/sources/nov-region-audit-v1/novgorod_region_generation_limits_v1.json');
const RANGE = /(\d+)\s*[-–]\s*(\d+)/g;

// Classify each "N-M" range by the first noun after it: a yard noun (двор, двора, дворов, дворы; not the
// adjective дворовых) -> households; людей/человек -> people.
const YARD = /(^|[^а-яё])двор(а|ов|ы|ом|ами)?(?![а-яё])/i, PEOPLE = /(людей|человек)/i;
function classify(t, m) {
  const after = t.slice(m.index + m[0].length, m.index + m[0].length + 70);
  const y = after.search(YARD), p = after.search(PEOPLE);
  if (y < 0 && p < 0) return null;
  if (y >= 0 && (p < 0 || y < p)) return 'yard';
  return 'people';
}
export function parseHouseholds(t) {
  for (const m of t.matchAll(RANGE)) if (classify(t, m) === 'yard') {
    const plus = /^1 [^;]*двор[^;]* с/i.test(t) ? 1 : 0;
    return { min: +m[1] + plus, max: +m[2] + plus, basis: plus ? 'R1 range+1 main yard' : 'R1 range' };
  }
  return null;
}
export function parsePeople(t) {
  for (const m of t.matchAll(RANGE)) if (classify(t, m) === 'people') return { min: +m[1], max: +m[2] };
  return null;
}
const parseG4 = (t) => { const m = t.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s+(структурных\s+городских\s+)?G4/); return m ? { min: +m[1], max: +(m[2] ?? m[1]) } : null; };

export function build() {
  const reg = readTsv(REG);
  const groups = new Map();
  for (const r of reg) {
    const k = [r.place_template_id, r.scale_class, r.household_estimate].join('|');
    const g = groups.get(k) ?? { r, n: 0 }; g.n++; groups.set(k, g);
  }
  const rows = [], gapsAll = [];
  let i = 0;
  for (const { r, n } of [...groups.values()].sort((a, b) => (a.r.place_template_id + a.r.household_estimate).localeCompare(b.r.place_template_id + b.r.household_estimate))) {
    const h = parseHouseholds(r.household_estimate), p = parsePeople(r.household_estimate), z = parseG4(r.g4_target);
    const gaps = [];
    if (!h) gaps.push('households: estimate text has no yard range');
    if (!p) gaps.push('residents: no persons-per-household source; set only where text states people');
    gaps.push('containers_max: no sourced basis');
    rows.push({
      pgl_id: `pgl_${r.place_template_id}__${r.scale_class}__${++i}`, scope_kind: 'place_template', scope_ref: r.place_template_id, scale_class: r.scale_class, region_id: 'region_novgorod_land',
      households_min: h?.min ?? '', households_max: h?.max ?? '', households_basis: h?.basis ?? '', household_estimate_text: r.household_estimate,
      household_kind_count: r.household_mix ? r.household_mix.split(';').filter((s) => s.trim()).length : '', household_mix: r.household_mix,
      residents_min: p?.min ?? '', residents_max: p?.max ?? '', residents_basis: p ? 'R2 people range in text' : '',
      npc_present_min: '', npc_present_max: '', g4_zones_min: z?.min ?? '', g4_zones_max: z?.max ?? '', items_notable_max: '', items_basis: '', containers_max: '', g5_anchor_max: '',
      rule_ref: 'scripts/build-generation-limits.mjs R1-R3', v6_row_count: n,
      source_refs: `${rel(REG)}#place_template_id=${r.place_template_id};scale_class=${r.scale_class}`, gaps, confidence: 'C', status: 'candidate',
    });
  }

  // R4 per place family.
  const spawn = readCsv(path.join(MASTER_ME, 'spawn_profiles.csv'));
  const cw = readJson(path.join(GROUP, 'scripts/crosswalk-rules.json')).master_location_archetypes.map;
  const fam = readCsv(path.join(GROUP, 'places/place_families.csv'));
  const pfItems = new Map();
  for (const s of spawn) for (const a of JSON.parse(s.location_archetypes)) for (const pf of Array.isArray(cw[a]) ? cw[a] : []) {
    const e = pfItems.get('pf_' + pf) ?? { max: 0, profiles: [] };
    e.max = Math.max(e.max, +s.max_concrete_items); e.profiles.push(`${s.profile_id}:${s.max_concrete_items}`); pfItems.set('pf_' + pf, e);
  }
  for (const f of fam) {
    const e = pfItems.get(f.pf_id);
    rows.push({
      pgl_id: `pgl_${f.pf_id}`, scope_kind: 'place_family', scope_ref: f.pf_id, scale_class: '', region_id: '',
      households_min: '', households_max: '', households_basis: '', household_estimate_text: '', household_kind_count: '', household_mix: '',
      residents_min: '', residents_max: '', residents_basis: '', npc_present_min: '', npc_present_max: '', g4_zones_min: '', g4_zones_max: '',
      items_notable_max: e?.max ?? '', items_basis: e ? `R4 max of MASTER spawn profiles ${[...new Set(e.profiles)].join(',')}` : '', containers_max: '', g5_anchor_max: '',
      rule_ref: 'scripts/build-generation-limits.mjs R4', v6_row_count: '',
      source_refs: `${rel(path.join(MASTER_ME, 'spawn_profiles.csv'))}; places-binding/places/crosswalk_master_location_archetypes.csv`,
      gaps: [e ? '' : 'items_notable_max: no MASTER spawn profile maps to this family', 'containers_max: no sourced basis'].filter(Boolean), confidence: 'C', status: 'candidate',
    });
  }

  // R5 per v17 G4.
  const ex = readJson(path.join(GROUP, 'inputs/pr98-extract.json'));
  const nb = readCsv(path.join(GROUP, 'places/node_binding.csv'));
  const pfOf = new Map(nb.map((x) => [x.node_ref.replace(/@\d+$/, ''), x.pf_id]));
  const npc = new Map(ex.npc_compositions.map((c) => [c.g4_id, c]));
  for (const g of ex.g4) {
    const c = npc.get(g.g4_id), pf = pfOf.get(g.g4_id), it = pf ? pfItems.get(pf) : null;
    rows.push({
      pgl_id: `pgl_${g.g4_id}`, scope_kind: 'g4', scope_ref: g.g4_id, scale_class: '', region_id: ex.region_id,
      households_min: '', households_max: '', households_basis: '', household_estimate_text: '', household_kind_count: '', household_mix: '',
      residents_min: '', residents_max: '', residents_basis: '',
      npc_present_min: c?.min_count ?? '', npc_present_max: c?.max_count ?? '', g4_zones_min: '', g4_zones_max: '',
      items_notable_max: it?.max ?? '', items_basis: it ? `R4 via primary ${pf}` : '', containers_max: '', g5_anchor_max: g.canonical_g5_refs.length,
      rule_ref: 'scripts/build-generation-limits.mjs R5', v6_row_count: '',
      source_refs: `pr98:data/world-catalogs/novgorod/m2c-npc/candidate.json#g4_compositions[${g.g4_id}] (${c?.status}); pr98:data/world-catalogs/novgorod/m2c-natural/candidate.json#${g.profile_id}`,
      gaps: ['households/residents: no v17 node-level source (v17 start territory is not in the v6 graph)', 'containers_max: no sourced basis', it ? '' : 'items_notable_max: primary pf gap or unmapped'].filter(Boolean),
      confidence: 'C', status: 'candidate',
    });
  }
  const n = writeCsv(path.join(GROUP, 'limits/place_generation_limits.csv'), Object.keys(rows[0]), rows);

  // Audit comparison (report only; draft values are not copied into the table).
  const audit = readJson(AUDIT);
  const cmp = [];
  for (const r of rows.filter((x) => x.scope_kind === 'place_template')) {
    const a = audit.place_type_profiles[r.scale_class];
    if (!a) { cmp.push({ scope_ref: r.scope_ref, scale_class: r.scale_class, field: 'profile', ours: '', audit: 'missing', verdict: 'audit_missing' }); continue; }
    for (const [ours, theirs] of [['households_min', 'physical_households_min'], ['households_max', 'physical_households_max']]) {
      const o = r[ours], t = a[theirs];
      cmp.push({ scope_ref: r.scope_ref, scale_class: r.scale_class, household_estimate_text: r.household_estimate_text, field: ours, ours: o, audit: t ?? '', verdict: o === '' ? 'ours_gap' : t === undefined ? 'audit_missing' : +o === +t ? 'equal' : 'differs' });
    }
  }
  const auditG4 = audit.g4_location_type_profiles;
  const g4cross = readCsv(path.join(GROUP, 'places/crosswalk_v6_g4_location_types.csv'));
  for (const t of g4cross) {
    const a = auditG4[t.g4_location_type];
    const pfs = t.pf_ids ? t.pf_ids.split(';') : [];
    const ours = pfs.map((p) => pfItems.get(p)?.max).filter((x) => x !== undefined);
    cmp.push({ scope_ref: t.g4_location_type, scale_class: 'g4_location_type', household_estimate_text: '', field: 'items_notable_max vs significant_item_max', ours: ours.length ? Math.max(...ours) : '', audit: a?.significant_item_max ?? '', verdict: !ours.length ? 'ours_gap' : a?.significant_item_max === undefined ? 'audit_missing' : Math.max(...ours) === a.significant_item_max ? 'equal' : 'differs' });
  }
  writeCsv(path.join(GROUP, 'limits/audit_comparison.csv'), ['scope_ref', 'scale_class', 'household_estimate_text', 'field', 'ours', 'audit', 'verdict'], cmp);
  const summary = {
    rows: n, by_scope: rows.reduce((a, r) => ((a[r.scope_kind] = (a[r.scope_kind] ?? 0) + 1), a), {}),
    place_template_rows_with_households: rows.filter((r) => r.scope_kind === 'place_template' && r.households_min !== '').length,
    place_template_rows_with_residents: rows.filter((r) => r.scope_kind === 'place_template' && r.residents_min !== '').length,
    families_with_items_max: rows.filter((r) => r.scope_kind === 'place_family' && r.items_notable_max !== '').length,
    audit_comparison: cmp.reduce((a, c) => ((a[c.verdict] = (a[c.verdict] ?? 0) + 1), a), {}),
  };
  writeJson(path.join(GROUP, 'reports/generation-limits-report.json'), summary);
  console.log('generation limits', summary);
  return summary;
}
if (process.argv[1]?.endsWith('build-generation-limits.mjs')) build();
