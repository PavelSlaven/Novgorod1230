// Builds places/place_families.csv and its crosswalk tables from WK place-first-cartography,
// world-base template seeds, the regional-environment candidate (via pr98 extract),
// v6 g4_locations, spatial-v3 scene templates and MASTER location archetypes.
import path from 'node:path';
import { REPO, GROUP, readJson, readTsv, readCsv, writeCsv, writeJson, sha256, rel } from './lib.mjs';

export const WK_PLACE_FIRST = path.join(REPO, 'data/world-catalogs/novgorod/world-knowledge/production-v1/place-first-cartography.json');
export const SEEDS = Object.fromEntries(['landscape', 'land_use', 'place', 'water_body', 'route'].map((k) => [k, path.join(REPO, `infra/world-base/${k}_templates.seed.json`)]));
export const V6_G4 = path.join(REPO, 'DOCUMENTS/documents-kg/corpus/DOCUMENTS/novgorod_graphify_g1_g4_full/source_tsv/novgorod_g2_g4_70_cells_v6_g4_locations.tsv');
export const MASTER_ME = path.join(REPO, 'data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/material_entities');

export function loadTemplateRegistry() {
  const ex = readJson(path.join(GROUP, 'inputs/pr98-extract.json'));
  const reg = new Map(); // id -> {kind, in_seed, in_novgorod_candidate, title}
  for (const [kind, p] of Object.entries(SEEDS)) for (const r of readJson(p)) reg.set(r.id, { kind, title: r.title, in_seed: true, novgorod_candidate: false, status: r.status });
  const kindOf = { landscape: 'landscape', water: 'water_body', land_use: 'land_use', place: 'place' };
  for (const [k, list] of Object.entries(ex.regional_env.promotions)) for (const x of list) {
    const e = reg.get(x.id) ?? { kind: kindOf[k], title: null, in_seed: false, status: null };
    e.novgorod_candidate = true; reg.set(x.id, e);
  }
  for (const x of ex.regional_env.pending) {
    const e = reg.get(x.id) ?? { kind: 'place', title: null, in_seed: false, status: null };
    e.novgorod_candidate = 'pending'; reg.set(x.id, e);
  }
  return reg;
}

export function loadFamilies() {
  const wk = readJson(WK_PLACE_FIRST);
  const auth = readJson(path.join(GROUP, 'scripts/pf-authoring.json'));
  const cw = readJson(path.join(GROUP, 'scripts/crosswalk-rules.json'));
  return { wk, auth, cw };
}

const pfid = (id) => 'pf_' + id;

export function build() {
  const { wk, auth, cw } = loadFamilies();
  const reg = loadTemplateRegistry();
  const ex = readJson(path.join(GROUP, 'inputs/pr98-extract.json'));
  const SLOTS = auth.facet_slots.slots;
  const wkRef = rel(WK_PLACE_FIRST);

  // Invert crosswalks: pf -> source keys.
  const inv = (map) => {
    const out = new Map();
    for (const [k, v] of Object.entries(map)) if (Array.isArray(v)) for (const f of v) { if (!out.has(f)) out.set(f, []); out.get(f).push(k); }
    return out;
  };
  const byG4type = inv(cw.v6_g4_location_types.map);
  const byScene = inv(cw.scene_templates.map);
  const byMaster = inv(cw.master_location_archetypes.map);

  const families = [], facets = [];
  for (const f of wk.environment_families) {
    const a = auth.families[f.id];
    if (!a) throw new Error('no authoring for family ' + f.id);
    const slot = Object.fromEntries(SLOTS.map((s) => [s, []]));
    const ov = auth.facet_slots.overrides[f.id];
    f.facets.forEach((x, i) => {
      const slots = ov ? ov[x.facet] : (f.facets.length === 4 ? [SLOTS[i]] : null);
      if (!slots) throw new Error(`no slot rule for ${f.id}/${x.facet}`);
      const label = `${x.facet}[${x.claim_refs.length},${x.coverage}]`;
      for (const s of slots) slot[s].push(label);
      facets.push({
        pff_id: `pff_${f.id}__${x.facet}`, pf_id: pfid(f.id), facet_id: x.facet, facet_order: i + 1, slots,
        coverage: x.coverage, claim_ref_count: x.claim_refs.length, needs: (x.needs ?? []).join(' | '), limits: x.limits ?? '',
        residual_needs: (x.residual_needs ?? []).join(' | '), claim_refs: x.claim_refs,
        source_refs: `${wkRef}#environment_families[id=${f.id}].facets[facet=${x.facet}]`, confidence: 'B', status: 'candidate',
      });
    });
    const allRefs = [...a.landscape, ...a.land_use, ...a.place, ...a.water]; // the regional candidate has no route section
    const notNov = allRefs.filter((r) => reg.get(r) && reg.get(r).novgorod_candidate === false);
    const claimCount = f.facets.reduce((n, x) => n + x.claim_refs.length, 0);
    const cov = f.facets.map((x) => x.coverage);
    families.push({
      pf_id: pfid(f.id), wk_family_ref: `${wkRef}#environment_families[id=${f.id}]`, name_ru: a.name_ru, name_en: a.name_en, pf_kind: a.kind,
      description_en: f.description, composes_with: (f.composes_with ?? []).map(pfid),
      layers_applicable: a.layers, layers_not_applicable: auth.layer_vocabulary.layers.filter((l) => !a.layers.includes(l)),
      layers_note: a.layers_note ?? '',
      facet_ground: slot.facet_ground, facet_use_people: slot.facet_use_people, facet_senses_traces: slot.facet_senses_traces, facet_risks_upkeep: slot.facet_risks_upkeep,
      facet_count: f.facets.length, wk_claim_ref_count: claimCount,
      wk_coverage: `supported ${cov.filter((c) => c === 'supported').length}; partial ${cov.filter((c) => c === 'partial').length}`,
      landscape_template_refs: a.landscape, land_use_template_refs: a.land_use, place_template_refs: a.place, water_body_template_refs: a.water, route_template_refs: a.route,
      template_refs_not_in_novgorod_candidate: notNov,
      templates_not_applicable: a.templates_not_applicable ?? '',
      v6_g4_location_types: (byG4type.get(f.id) ?? []).sort(),
      spatial_v3_scene_template_refs: (byScene.get(f.id) ?? []).sort().map((s) => s + '@1'),
      master_location_archetypes: (byMaster.get(f.id) ?? []).sort(),
      region_id: '', universal: 'true',
      source_refs: [`${wkRef}#environment_families[id=${f.id}]`, 'infra/world-base/*_templates.seed.json', 'pr98:data/world-catalogs/novgorod/regional-environment/candidates/novgorod-1230-1250-v1/candidate.json', `${rel(path.join(GROUP, 'scripts/pf-authoring.json'))}#families.${f.id}`],
      confidence: 'C', status: 'candidate', notes: a.note ?? '',
    });
  }

  // v6 g4_location_type crosswalk (198 types).
  const g4rows = readTsv(V6_G4);
  const g4t = new Map();
  for (const r of g4rows) {
    const e = g4t.get(r.g4_location_type) ?? { n: 0, pts: new Map(), title: r.title.split(': ').slice(-1)[0], scale_role: r.scale_role, status: new Map() };
    e.n++; e.pts.set(r.place_template_id, (e.pts.get(r.place_template_id) ?? 0) + 1); e.status.set(r.status, (e.status.get(r.status) ?? 0) + 1);
    g4t.set(r.g4_location_type, e);
  }
  const g4cross = [...g4t.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, e]) => {
    const m = cw.v6_g4_location_types.map[t];
    return {
      g4_location_type: t, title_ru_example: e.title, scale_role: e.scale_role, v6_row_count: e.n,
      v6_status_counts: [...e.status].map(([k, v]) => `${k}:${v}`),
      place_template_ids: [...e.pts].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}:${v}`),
      pf_ids: Array.isArray(m) ? m.map(pfid) : [], mapping_status: m === undefined ? 'unmapped' : Array.isArray(m) ? 'mapped' : 'not_applicable',
      note: typeof m === 'string' ? m : '', source_refs: `${rel(V6_G4)}#g4_location_type=${t}`, confidence: 'C', status: 'candidate',
    };
  });

  const sceneCross = ex.scene_templates.map((s) => {
    const m = cw.scene_templates.map[s.id];
    return {
      scene_template_ref: `${s.id}@${s.version}`, scene_template_status: s.status, regional_template_id: s.regional_template_id,
      g5_count_v17: ex.g5.filter((g) => g.scene_template_id === s.id).length,
      pf_ids: Array.isArray(m) ? m.map(pfid) : [], mapping_status: m === undefined ? 'unmapped' : Array.isArray(m) ? 'mapped' : 'not_applicable',
      note: typeof m === 'string' ? m : '', source_refs: `pr98:data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_templates.json#${s.id}`, confidence: 'C', status: 'candidate',
    };
  });

  const links = readCsv(path.join(MASTER_ME, 'item_location_links.csv'));
  const spawn = readCsv(path.join(MASTER_ME, 'spawn_profiles.csv'));
  const arch = new Map();
  for (const l of links) { const e = arch.get(l.location_archetype) ?? { name: l.location_name_ru, links: 0, spawn: [] }; e.links++; arch.set(l.location_archetype, e); }
  for (const s of spawn) for (const a of JSON.parse(s.location_archetypes)) { const e = arch.get(a) ?? { name: '', links: 0, spawn: [] }; e.spawn.push(`${s.profile_id}:${s.max_concrete_items}`); arch.set(a, e); }
  const masterCross = [...arch.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, e]) => {
    const m = cw.master_location_archetypes.map[k];
    return {
      location_archetype: k, name_ru: e.name, item_location_link_count: e.links, spawn_profiles_max_items: e.spawn,
      pf_ids: Array.isArray(m) ? m.map(pfid) : [], mapping_status: m === undefined ? 'unmapped' : Array.isArray(m) ? 'mapped' : 'not_applicable',
      note: typeof m === 'string' ? m : '',
      source_refs: `${rel(path.join(MASTER_ME, 'item_location_links.csv'))}#location_archetype=${k}; ${rel(path.join(MASTER_ME, 'spawn_profiles.csv'))}`,
      confidence: 'C', status: 'candidate',
    };
  });

  const P = (f) => path.join(GROUP, 'places', f);
  const counts = {
    place_families: writeCsv(P('place_families.csv'), Object.keys(families[0]), families),
    place_family_facets: writeCsv(P('place_family_facets.csv'), Object.keys(facets[0]), facets),
    crosswalk_v6_g4_location_types: writeCsv(P('crosswalk_v6_g4_location_types.csv'), Object.keys(g4cross[0]), g4cross),
    crosswalk_scene_templates: writeCsv(P('crosswalk_scene_templates.csv'), Object.keys(sceneCross[0]), sceneCross),
    crosswalk_master_location_archetypes: writeCsv(P('crosswalk_master_location_archetypes.csv'), Object.keys(masterCross[0]), masterCross),
  };
  writeJson(path.join(GROUP, 'reports/build-place-families.json'), {
    counts, source_pins: { [rel(WK_PLACE_FIRST)]: sha256(WK_PLACE_FIRST), [rel(V6_G4)]: sha256(V6_G4) },
  });
  console.log('place families', counts);
  return counts;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build-place-families.mjs')) build();
