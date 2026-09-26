import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../../../..');
const base = 'data/world-catalogs/novgorod/';
const expansion = `${base}spatial-v3/candidates/m2c-g4-expansion-v1/datasets/`;
const output = resolve(import.meta.dirname, 'owner-coverage-candidate-v1.json');
const json = async (path) => JSON.parse(await readFile(resolve(root, path)));
const one = (rows, message) => { assert.equal(rows.length, 1, message); return rows[0]; };

export async function buildCoverage() {
  const [starts, compositions, canonicalCompositions, templates, sceneCandidates,
    acoustic, g6Slots] = await Promise.all([
    json(`${base}live-world-runtime-v17/additional-starts-candidate.json`).then((row) => row.starts),
    json(`${base}m2c-npc/datasets/spatial_v3_g4_npc_composition_bindings.json`),
    json(`${base}m2c-npc/canonical-initial/datasets/spatial_v3_g4_npc_composition_bindings.json`),
    json(`${expansion}spatial_v3_g5_generation_templates.json`),
    json(`${expansion}spatial_v3_scene_materialization_candidates.json`),
    json(`${base}m2c-acoustic/approved/spatial_v3_g6_acoustic_baselines.json`),
    json(`${expansion}spatial_v3_g6_template_slots.json`)
  ]);
  assert.equal(starts.length, 6);
  return {
    schema: 'rus.live_world_runtime.owner_coverage_candidate.v1',
    status: 'pending_independent_data_approval',
    activation_authorized: false,
    source_paths: [
      `${base}live-world-runtime-v17/additional-starts-candidate.json`,
      `${base}m2c-npc/datasets/spatial_v3_g4_npc_composition_bindings.json`,
      `${base}m2c-npc/canonical-initial/datasets/spatial_v3_g4_npc_composition_bindings.json`,
      `${expansion}spatial_v3_g5_generation_templates.json`,
      `${expansion}spatial_v3_scene_materialization_candidates.json`,
      `${base}m2c-acoustic/approved/spatial_v3_g6_acoustic_baselines.json`,
      `${expansion}spatial_v3_g6_template_slots.json`
    ],
    starts: starts.map((start) => {
      const placement = start.initial_placement;
      const g4 = placement.g4_ref;
      const canonical = placement.canonical_g5_ref;
      const scene = placement.scene_template_ref;
      const composition = one(compositions.filter((row) => row.g4_id === g4.id && row.g4_version === g4.version), `${start.scenario_id}: G4 composition`);
      const template = one(templates.filter((row) => row.id === composition.generation_template_id && row.version === composition.generation_template_version), `${start.scenario_id}: generation template`);
      const generatedScene = one(sceneCandidates.filter((row) => row.profile_id === template.scene_materialization_profile_id && row.profile_version === template.scene_materialization_profile_version), `${start.scenario_id}: generated scene`);
      const exactNpc = canonicalCompositions.filter((row) => row.g4_id === g4.id && row.g4_version === g4.version && row.canonical_g5_id === canonical.id && row.canonical_g5_version === canonical.version);
      assert.ok(exactNpc.length <= 1, `${start.scenario_id}: ambiguous canonical NPC`);
      const sameScene = generatedScene.scene_template_id === scene.id && generatedScene.scene_template_version === scene.version;
      const slots = g6Slots.filter((row) => row.scene_template_id === scene.id && row.scene_template_version === scene.version).map((row) => row.scene_slot_key);
      assert.ok(slots.length && new Set(slots).size === slots.length, `${start.scenario_id}: G6 slots`);
      const acousticRows = acoustic.filter((row) => row.canonical_g5_id === canonical.id && row.canonical_g5_version === canonical.version);
      const covered = slots.every((slot) => acousticRows.filter((row) => row.scene_template_id === scene.id && row.scene_template_version === scene.version && row.g6_scene_slot_key === slot).length === 1);
      const generatedAcoustic = slots.map((slot) => acoustic.filter((row) => row.g5_template_id === template.id
        && row.g5_template_version === template.version && row.scene_template_id === scene.id
        && row.scene_template_version === scene.version && row.g6_scene_slot_key === slot));
      const acousticDerivable = sameScene && generatedAcoustic.every((rows) => rows.length === 1);
      return {
        scenario_id: start.scenario_id, g4_ref: g4, canonical_g5_ref: canonical, scene_template_ref: scene,
        npc: exactNpc.length ? { coverage: 'exact_approved', row_ref: { id: exactNpc[0].id, version: exactNpc[0].version } }
          : { coverage: sameScene ? 'mechanical_scene_match_pending_canonical_binding' : 'semantic_candidate_required',
            source_composition_ref: { id: composition.id, version: composition.version },
            generation_template_ref: { id: template.id, version: template.version },
            generated_scene_template_ref: { id: generatedScene.scene_template_id, version: generatedScene.scene_template_version },
            source_count_range: [composition.min_count, composition.max_count],
            source_profile_refs: composition.payload.weighted_profile_refs,
            source_position_slot_order: composition.payload.placement_policy.position_slot_order },
        acoustic: { coverage: covered ? 'exact_approved' : acousticDerivable
          ? 'mechanical_scene_and_ambient_match_pending_canonical_binding' : 'semantic_candidate_required',
          approved_row_refs: acousticRows.map((row) => ({ id: row.id, version: row.version, g6_scene_slot_key: row.g6_scene_slot_key, ambient_noise: row.ambient_noise })),
          generated_source_row_refs: generatedAcoustic.flat().map((row) => ({ id: row.id, version: row.version, g6_scene_slot_key: row.g6_scene_slot_key, ambient_noise: row.ambient_noise })),
          missing_g6_scene_slot_keys: slots.filter((slot) => !acousticRows.some((row) => row.scene_template_id === scene.id && row.scene_template_version === scene.version && row.g6_scene_slot_key === slot)) }
      };
    })
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const bytes = `${JSON.stringify(await buildCoverage(), null, 2)}\n`;
  if (process.argv.includes('--write')) await writeFile(output, bytes);
  else if (process.argv.includes('--check')) assert.equal(await readFile(output, 'utf8'), bytes);
  else process.stdout.write(bytes);
}
