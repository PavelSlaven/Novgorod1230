// Extracts a compact read-only index of the 32 M2c G4 natural profiles from PR #98
// (nature-successor-candidate-v2.json) into _shared/g4_nature_index.json.
// Source file is not modified. Run: node _shared/scripts/extract-g4-index.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { PR98, SHARED, writeJson } from './lib.mjs';

const rel = 'data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json';
const src = path.join(PR98, rel);
const buf = fs.readFileSync(src);
const j = JSON.parse(buf);
const v = (x, k) => (x && x.value ? x.value[k] ?? null : null);
const PREFIX = 'g4v3__gn_nov_g3_xp017_yp026_r2_';

const g4 = j.natural_profiles.map((p) => {
  const la = p.natural_profile.layer_applicability;
  const members = [];
  for (const layer of Object.keys(la)) for (const a of la[layer].alternatives || []) {
    members.push({ layer, kind: a.kind, ref: a.taxon_or_material_ref, frequency_category: a.frequency_category, weight: a.editorial_weight, season_condition: a.season_condition || '', member_id: a.id });
  }
  const applicability = Object.fromEntries(Object.entries(la).map(([k, x]) => [k, x.applicability]));
  return {
    g4_id: p.g4_ref.id,
    g4_short: p.g4_ref.id.replace(PREFIX, ''),
    natural_profile_id: p.profile_id,
    place_function: p.exact_scene_features.source_place_type,
    landscape_template_id: p.template_refs.landscape_template_id,
    water_body_template_id: p.template_refs.water_body_template_id,
    axes: { landscape: p.authoring_axes.landscape, land_use: p.authoring_axes.land_use, family_ref: p.authoring_axes.family_ref },
    surface: v(la.surface, 'class'), relief: v(la.relief, 'class'),
    water_body_type: la.water_body.value ? la.water_body.value.water_body_type : null,
    bank: v(la.bank_structure, 'class'),
    tree: v(la.tree_layer, 'class'), shrub: v(la.shrub_layer, 'class'), ground: v(la.ground_cover, 'class'), riparian: v(la.riparian_vegetation, 'class'),
    ambient_materials: v(la.natural_materials, 'ambient_materials') || [],
    audible: v(la.audible_context, 'class'), light_exposure: v(la.light, 'exposure'), seasonal_stability: v(la.seasonal_state, 'stability'),
    applicability, members,
  };
});

writeJson(path.join(SHARED, 'g4_nature_index.json'), {
  schema: 'game_base_v1.g4_nature_index.v1',
  status: 'derived_read_only_index',
  source: { root: 'pr98', path: rel, sha256: crypto.createHash('sha256').update(buf).digest('hex'), candidate_status: j.status },
  g4_count: g4.length,
  g4,
});
console.log('g4_nature_index.json:', g4.length, 'G4');
