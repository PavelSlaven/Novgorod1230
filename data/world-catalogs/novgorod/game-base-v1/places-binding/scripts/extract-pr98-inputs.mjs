// Deterministic extract of the PR #98 (v17 runtime) sources that live only on the
// codex/live-world-runtime branch. Writes inputs/pr98-extract.json with sha256 pins,
// so the other build scripts run without the PR #98 worktree.
import fs from 'node:fs';
import path from 'node:path';
import { PR98, GROUP, readJson, sha256, arr, writeJson } from './lib.mjs';

const NOV = path.join(PR98, 'data/world-catalogs/novgorod');
const src = {
  natural: 'data/world-catalogs/novgorod/m2c-natural/candidate.json',
  richness: 'data/world-catalogs/novgorod/m2c-natural/nature-richness-candidate-v1.json',
  nodes: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_nodes.json',
  parents: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_node_parents.json',
  scene_templates: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_templates.json',
  scene_candidates: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_materialization_candidates.json',
  scene_profiles: 'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_materialization_profiles.json',
  regional_env: 'data/world-catalogs/novgorod/regional-environment/candidates/novgorod-1230-1250-v1/candidate.json',
  npc: 'data/world-catalogs/novgorod/m2c-npc/candidate.json',
};
const P = (k) => path.join(PR98, src[k]);
for (const k of Object.keys(src)) if (!fs.existsSync(P(k))) throw new Error(`missing PR98 source ${src[k]} (set PR98_ROOT)`);

const natural = readJson(P('natural'));
const g4 = natural.natural_profiles.map((p) => ({
  profile_id: p.profile_id,
  profile_status: p.status,
  g4_id: p.g4_ref.id,
  g4_version: p.g4_ref.version,
  source_place_type: p.exact_scene_features.source_place_type,
  parent_g2_id: p.exact_scene_features.parent_g2_id,
  canonical_g5_refs: p.exact_scene_features.canonical_g5_refs,
  scene_template_refs: p.exact_scene_features.canonical_scene_template_refs,
  axes: { landscape: p.authoring_axes.landscape, land_use: p.authoring_axes.land_use, function: p.authoring_axes.function, family_ref: p.authoring_axes.family_ref },
  axes_directness: {
    landscape: p.authoring_axes.directness?.landscape?.type + '/' + p.authoring_axes.directness?.landscape?.confidence,
    land_use: p.authoring_axes.directness?.land_use?.type + '/' + p.authoring_axes.directness?.land_use?.confidence,
    function: p.authoring_axes.directness?.function?.type + '/' + p.authoring_axes.directness?.function?.confidence,
  },
  template_refs: p.template_refs,
  layers: Object.fromEntries(Object.entries(p.natural_profile.layer_applicability).map(([k, v]) => [k, v.applicability])),
}));

const nodes = arr(readJson(P('nodes')));
const parents = arr(readJson(P('parents')));
const parentOf = new Map(parents.map((x) => [x.child_id, x.parent_id]));
const cands = arr(readJson(P('scene_candidates')));
const profiles = arr(readJson(P('scene_profiles')));
const profileSource = new Map(profiles.map((x) => [x.id, x.source_entity_id]));
const g5scene = new Map();
for (const c of cands) g5scene.set(profileSource.get(c.profile_id), c.scene_template_id);
const g5 = nodes.filter((n) => n.spatial_level === 'G5').map((n) => ({
  g5_id: n.id, g5_version: n.version, status: n.status, evidence_status: n.evidence_status,
  parent_g4_id: parentOf.get(n.id) ?? null, scene_template_id: g5scene.get(n.id) ?? null,
}));
const g4nodes = nodes.filter((n) => n.spatial_level === 'G4').map((n) => ({ id: n.id, version: n.version, status: n.status }));
const region_id = nodes.find((n) => n.spatial_level === 'G0')?.id ?? null;
const scene_templates = arr(readJson(P('scene_templates'))).map((x) => ({ id: x.id, version: x.version, status: x.status, regional_template_id: x.regional_template_id }));

const env = readJson(P('regional_env'));
const envIds = {};
for (const k of ['landscape', 'water', 'land_use', 'place']) envIds[k] = env.promotions[k].map((p) => ({ id: p.universal.id, regional_id: p.regional?.id ?? null, verdict: p.audit_verdict }));
const pending = (Array.isArray(env.pending_rows) ? env.pending_rows : [env.pending_rows]).map((p) => ({ id: p.universal_row.id, status: p.candidate_status }));

const npc = readJson(P('npc'));
const npc_compositions = npc.g4_compositions.map((c) => ({
  g4_id: c.g4_ref.id, presence_mode: c.presence_mode, min_count: c.min_count, max_count: c.max_count,
  profile_refs: c.candidate_profile_refs, status: c.population_policy_status,
}));

const richness = readJson(P('richness'));

writeJson(path.join(GROUP, 'inputs/pr98-extract.json'), {
  schema: 'places_binding_pr98_extract_v1',
  note: 'Mechanical extract from the PR #98 worktree; regenerate with scripts/extract-pr98-inputs.mjs.',
  sources: Object.fromEntries(Object.entries(src).map(([k, v]) => [k, { path: 'pr98:' + v, sha256: sha256(P(k)) }])),
  statuses: { natural: natural.status, regional_env: env.status, npc: npc.status, richness: richness.status },
  region_id,
  world_revision_id: natural.target.world_revision_id,
  natural_nonblocking_limits: natural.nonblocking_limits,
  richness_weight_policy: richness.weight_policy,
  g4, g4nodes, g5, scene_templates,
  regional_env: { revision_id: env.revision_id, status: env.status, promotions: envIds, pending },
  npc_compositions,
});
console.log(`pr98 extract: g4 profiles ${g4.length}, g4 nodes ${g4nodes.length}, g5 ${g5.length}, scene templates ${scene_templates.length}, npc compositions ${npc_compositions.length}`);
