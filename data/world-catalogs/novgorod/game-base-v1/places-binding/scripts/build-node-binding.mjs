// Builds places/node_binding.csv: one row per v17 G4 (32) and G5 (195) node.
// G4: pf from authoring_axes.function (crosswalk-rules.node_binding.g4_function_to_pf),
//     landscape/water templates copied from m2c-natural template_refs.
// G5: pf by the stated suffix/scene-template rule; templates inherited from the parent G4.
// land_use_template_id and place_template_id have no v17 node-level source -> typed gap.
import path from 'node:path';
import { GROUP, readJson, writeCsv, writeJson } from './lib.mjs';

const NAT = 'pr98:data/world-catalogs/novgorod/m2c-natural/candidate.json';
const SCN = 'pr98:data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_materialization_candidates.json';
const PAR = 'pr98:data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_node_parents.json';
const CW = 'data/world-catalogs/novgorod/game-base-v1/places-binding/scripts/crosswalk-rules.json';

export function build() {
  const ex = readJson(path.join(GROUP, 'inputs/pr98-extract.json'));
  const cw = readJson(path.join(GROUP, 'scripts/crosswalk-rules.json'));
  const wk = readJson(path.join(GROUP, '../../world-knowledge/production-v1/place-first-cartography.json'));
  const composes = new Map(wk.environment_families.map((f) => [f.id, f.composes_with ?? []]));
  const fmap = cw.node_binding.g4_function_to_pf.map;
  const sceneMap = cw.scene_templates.map;
  const rows = [];
  const g4pf = new Map();

  for (const g of ex.g4) {
    let m = fmap[g.axes.function], pf = null, gap = '';
    if (m && typeof m === 'object') m = m.by_landscape_axis[g.axes.landscape];
    if (typeof m === 'string' && m.startsWith('gap:')) gap = m.slice(4).trim();
    else if (typeof m === 'string') pf = m;
    else gap = `function axis '${g.axes.function}' has no crosswalk entry`;
    g4pf.set(g.g4_id, pf);
    const secondary = [...new Set(g.scene_template_refs.flatMap((s) => sceneMap[s.replace(/@\d+$/, '')] ?? []))].filter((x) => x !== pf);
    const tr = g.template_refs;
    rows.push({
      node_ref: `${g.g4_id}@${g.g4_version}`, node_level: 'G4', parent_node_ref: '', region_id: ex.region_id,
      pf_id: pf ? 'pf_' + pf : '', pf_secondary: secondary.map((x) => 'pf_' + x),
      landscape_template_id: tr.landscape_template_id ?? '', land_use_template_id: '', place_template_id: '', water_body_template_id: tr.water_body_template_id ?? '',
      landscape_regional_link_ids: tr.landscape_regional_link_ids ?? [], water_regional_link_ids: tr.water_regional_link_ids ?? [],
      authoring_axes: `landscape=${g.axes.landscape}; land_use=${g.axes.land_use}; function=${g.axes.function}`,
      scene_template_refs: g.scene_template_refs,
      binding_basis: `pf: ${CW}#node_binding.g4_function_to_pf.map.${g.axes.function} applied to ${NAT}#natural_profiles[profile_id=${g.profile_id}].authoring_axes.function (${g.axes_directness.function}); templates: ${NAT}#natural_profiles[profile_id=${g.profile_id}].template_refs`,
      binding_status: pf ? 'bound' : 'gap',
      gaps: [gap, 'land_use_template_id: no v17 node-level source (authoring land_use axis is not a lu_* template id)', 'place_template_id: no v17 node-level source'].filter(Boolean),
      source_refs: [`${NAT}#${g.profile_id}`, CW], source_status: ex.statuses.natural, confidence: 'C', status: 'candidate',
    });
  }

  const kw = cw.node_binding.g5_suffix_rules.keywords;
  const g4ById = new Map(ex.g4.map((g) => [g.g4_id, g]));
  const counts = { rule1_keyword: 0, rule2_parent_in_scene: 0, rule3_scene_in_composes: 0, rule4_inherit_parent: 0, gap: 0 };
  for (const g5 of ex.g5) {
    const parent = g4ById.get(g5.parent_g4_id);
    const ppf = g4pf.get(g5.parent_g4_id);
    const parentShort = g5.parent_g4_id.replace(/^g4v3__gn_nov_g3_/, '');
    const suffix = '_' + g5.g5_id.replace(/^cg5v3__gn_nov_g4_/, '').slice(parentShort.length + 1);
    const scenePfs = sceneMap[g5.scene_template_id] ?? [];
    let pf = null, rule = '', gap = '';
    if (!ppf) { gap = 'parent G4 has no pf (parent gap)'; counts.gap++; }
    else {
      const hit = kw.find((k) => k.tokens.some((t) => suffix.includes(t.startsWith('_') ? t : '_' + t)));
      if (hit) { pf = hit.pf === '@parent' ? ppf : hit.pf; rule = `rule1_keyword(${hit.tokens.find((t) => suffix.includes(t.startsWith('_') ? t : '_' + t))})`; counts.rule1_keyword++; }
      else if (scenePfs.includes(ppf)) { pf = ppf; rule = 'rule2_parent_in_scene'; counts.rule2_parent_in_scene++; }
      else if (scenePfs.find((x) => composes.get(ppf).includes(x))) { pf = scenePfs.find((x) => composes.get(ppf).includes(x)); rule = 'rule3_scene_in_composes'; counts.rule3_scene_in_composes++; }
      else { pf = ppf; rule = 'rule4_inherit_parent'; counts.rule4_inherit_parent++; }
    }
    const tr = parent.template_refs;
    rows.push({
      node_ref: `${g5.g5_id}@${g5.g5_version}`, node_level: 'G5', parent_node_ref: `${g5.parent_g4_id}@1`, region_id: ex.region_id,
      pf_id: pf ? 'pf_' + pf : '', pf_secondary: scenePfs.filter((x) => x !== pf).map((x) => 'pf_' + x),
      landscape_template_id: tr.landscape_template_id ?? '', land_use_template_id: '', place_template_id: '', water_body_template_id: tr.water_body_template_id ?? '',
      landscape_regional_link_ids: tr.landscape_regional_link_ids ?? [], water_regional_link_ids: tr.water_regional_link_ids ?? [],
      authoring_axes: `inherited from parent: landscape=${parent.axes.landscape}; land_use=${parent.axes.land_use}; function=${parent.axes.function}; g5_suffix=${suffix.slice(1)}`,
      scene_template_refs: [g5.scene_template_id + '@1'],
      binding_basis: pf ? `pf: ${CW}#node_binding.g5_suffix_rules ${rule}; scene template from ${SCN}; parent from ${PAR}; templates inherited from parent ${NAT}#natural_profiles[g4=${g5.parent_g4_id}].template_refs` : '',
      binding_status: pf ? (rule.startsWith('rule4') ? 'bound_inherited' : 'bound') : 'gap',
      gaps: [gap, 'land_use_template_id: no v17 node-level source', 'place_template_id: no v17 node-level source', 'landscape/water inherited from parent G4, not attested for the G5 itself'].filter(Boolean),
      source_refs: [`${SCN}#${g5.g5_id}`, PAR, `${NAT}#${parent.profile_id}`, CW], source_status: `g5 node ${g5.status}; natural ${ex.statuses.natural}`, confidence: 'C', status: 'candidate',
    });
  }
  const n = writeCsv(path.join(GROUP, 'places/node_binding.csv'), Object.keys(rows[0]), rows);
  const summary = {
    rows: n, g4: rows.filter((r) => r.node_level === 'G4').length, g5: rows.filter((r) => r.node_level === 'G5').length,
    g5_rule_counts: counts, status_counts: rows.reduce((a, r) => ((a[r.binding_status] = (a[r.binding_status] ?? 0) + 1), a), {}),
    pf_counts: rows.reduce((a, r) => ((a[r.pf_id || 'GAP'] = (a[r.pf_id || 'GAP'] ?? 0) + 1), a), {}),
  };
  writeJson(path.join(GROUP, 'reports/build-node-binding.json'), summary);
  console.log('node binding', summary);
  return summary;
}
if (process.argv[1]?.endsWith('build-node-binding.mjs')) build();
