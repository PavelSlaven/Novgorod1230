import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { compileProceduralScenePartyPackages,
  compileProceduralSceneProfile } from '../src/index.js';
import { loadApprovedProceduralCompiledCatalog } from '@rus/runtime-catalog';

const root = new URL('../../..', import.meta.url);
const v1Path = new URL('data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'final-candidate-pack-v1/candidate.json', root);
const v2Path = new URL('data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'final-candidate-pack-v2/candidate.json', root);

async function catalog() {
  const [v1, v2] = await Promise.all([v1Path, v2Path].map(async (path) =>
    JSON.parse(await readFile(path, 'utf8'))));
  const pin = { schema: 'rus.runtime_catalog_pin.v2',
    catalog_revision_id: v2.target_revision_id,
    catalog_digest: v2.target_catalog_digest,
    import_audit_digest: 'a'.repeat(64),
    compatible_world_revision_id: 'novgorod_spatial_v3_production_v6_candidate_001',
    compatible_world_catalog_digest:
      '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad' };
  return loadApprovedProceduralCompiledCatalog({ pin, verifiedCatalog: {
    schema: 'rus.verified_item_catalog.v2', verified: true,
    pin: structuredClone(pin), import_audit: {
      approval_attestation_digest:
        '2917b993a9e9c63e1989725cee35e63bd0ed32dfece583a782dfb27f1c3f4772',
      import_audit_digest: pin.import_audit_digest },
    records_by_table: { procedural_scene_compiled_records: [
      ...v1.candidate_rows_by_table.procedural_scene_compiled_records,
      v2.append_only_delta.record
    ].map((record) => ({ ...record, version: String(record.version) })),
    universal_categories: []
  }}});
}

function sceneFor(verified, family, suffix = 'one') {
  const profile = verified.profiles.find(({ payload }) => payload.family === family);
  const closure = profile.payload.spatial_closure_ref;
  return { scene_template_id: closure.scene_template_id, g5_id: closure.g5_id,
    g5_node_id: `g5:${suffix}:${family}`, g6_instance_id: `g6:${suffix}:${family}`,
    position_id: `position:${suffix}:${family}` };
}
function worldPin(verified) { return { world_revision_id:
  verified.pin.compatible_world_revision_id, world_catalog_digest:
  verified.pin.compatible_world_catalog_digest }; }

test('V2 compiler covers all families and preserves complete regional facets',
  async () => {
    const verified = await catalog();
    const expected = new Map([
      ['natural_shore', ['natural_layers']],
      ['inland_fishing_worksite', ['storage', 'tool', 'work_material', 'work_zone']],
      ['drying_storage_workspace', ['storage', 'work_zone']]
    ]);
    for (const [family, layers] of expected) {
    const compiled = compileProceduralSceneProfile({
      verified_procedural_compiled_catalog: verified,
      scene: sceneFor(verified, family), world_pin: worldPin(verified) });
      assert.deepEqual(compiled.required_layers, layers);
      assert.deepEqual(compiled.components.map(({ layer }) => layer), layers);
      assert.ok(compiled.historical_source_data_gap_codes.length === 0
        || compiled.readiness.unresolved_current_gaps.length > 0);
      assert.ok(compiled.regional_facets.every(({ approved_members }) =>
        approved_members.every(({ universal, regional }) =>
          universal?.status === 'approved' && regional?.status === 'approved')));
      if (family === 'natural_shore') {
        assert.deepEqual(compiled.readiness.functional_layers, []);
        assert.equal(compiled.readiness.required_layers_mapped, true);
        assert.equal(compiled.readiness.required_layers_satisfied, true);
      }
    }
  });

test('V2 compiler is deterministic and matches unseen catalog data without family code',
  async () => {
    const verified = await catalog();
    const unseen = structuredClone(verified);
    const original = unseen.profiles.find(({ payload }) =>
      payload.family === 'natural_shore');
    const copy = structuredClone(original);
    copy.record_id = 'profile:unseen_equivalent_shore_v3';
    copy.payload.family = 'unseen_equivalent_shore';
    copy.payload.spatial_closure_ref.scene_template_id = 'scene:unseen';
    copy.payload.spatial_closure_ref.g5_id = 'g5:unseen';
    unseen.profiles.push(copy);
    const mapping = structuredClone(unseen.mappings.find(({ payload }) =>
      payload.family_candidate_ref === 'novgorod_natural_shore_v3@1'));
    mapping.record_id = 'mapping:unseen_shore';
    mapping.payload.family_candidate_ref = 'unseen_equivalent_shore_v3@1';
    unseen.mappings.push(mapping);
    const scene = { scene_template_id: 'scene:unseen', g5_id: 'g5:unseen',
      g5_node_id: 'g5:unseen-instance', g6_instance_id: 'g6:unseen',
      position_id: 'position:unseen' };
    const first = compileProceduralSceneProfile({
      verified_procedural_compiled_catalog: unseen, scene, world_pin: worldPin(verified) });
    const second = compileProceduralSceneProfile({
      verified_procedural_compiled_catalog: unseen, scene, world_pin: worldPin(verified) });
    assert.deepEqual(first, second);
    assert.equal(first.family, 'unseen_equivalent_shore');
  });

test('packages are stable, policy stays pending P16, and V1/wrong/tampered input fails',
  async () => {
    const verified = await catalog();
    const fishing = sceneFor(verified, 'inland_fishing_worksite');
    const drying = sceneFor(verified, 'drying_storage_workspace');
    const actors = [{ instance_id: 'npc:z', g5_node_id: fishing.g5_node_id,
      role_ref: { id: 'nov_role_fisher' }, occupation_ref: { id: 'nov_occ_fisher' },
      machine_state: { current_activity: { activity_profile_ref: 'activity_assist_fishing_net_v1' } } },
    { instance_id: 'npc:a', g5_node_id: fishing.g5_node_id,
      role_ref: { id: 'nov_role_fisher' }, occupation_ref: { id: 'nov_occ_fisher' },
      machine_state: { current_activity: { activity_profile_ref: 'activity_assist_fishing_net_v1' } } }];
    const input = { party_id: 'party:test', run_id: 'run:test', world_pin: worldPin(verified),
      verified_procedural_compiled_catalog: verified, actors };
    const forward = compileProceduralScenePartyPackages({ ...input, scenes: [fishing, drying] });
    const reverse = compileProceduralScenePartyPackages({ ...input, scenes: [drying, fishing] });
    assert.deepEqual(forward, reverse);
    const packageFishing = forward.packages.find(({ family }) => family === 'inland_fishing_worksite');
    assert.equal(packageFishing.allocation_policy.status, 'pending_p16_inventory_validation');
    assert.equal(packageFishing.allocation_policy.actor_instance_id, 'npc:a');
    assert.equal(packageFishing.allocation_policy.policy.property_basis.owner_ref,
      'selected_actor_instance');
    const wrongActivity = compileProceduralScenePartyPackages({ ...input,
      actors: [{ ...actors[0], machine_state: { current_activity: {} } }],
      scenes: [fishing] });
    assert.equal(wrongActivity.packages[0].allocation_policy.status,
      'pending_p16_actor_activity_data_gap');
    assert.equal(wrongActivity.packages[0].profile.readiness.functional_layers.find(
      ({ layer }) => layer === 'tool').status, 'pending_actor_activity');
    assert.equal(packageFishing.profile.readiness.functional_layers.find(
      ({ layer }) => layer === 'tool').status, 'pending_p16_owner');
    assert.equal(packageFishing.profile.readiness.functional_layers.find(
      ({ layer }) => layer === 'work_material').status, 'pending_p16_owner');
    for (const layer of ['storage', 'work_zone']) assert.equal(
      packageFishing.profile.readiness.functional_layers.find((entry) =>
        entry.layer === layer).status, 'mapped');
    assert.equal(packageFishing.profile.readiness.functional_layers.find(
      ({ layer }) => layer === 'container').status, 'unresolved');
    assert.equal(packageFishing.profile.readiness.required_layers_mapped, false);
    assert.equal(packageFishing.profile.readiness.required_layers_satisfied, false);
    const dryingProfile = forward.packages.find(({ family }) =>
      family === 'drying_storage_workspace').profile;
    assert.equal(dryingProfile.readiness.functional_layers.find(({ layer }) =>
      layer === 'tool').status, 'not_applicable_active_process_only');
    assert.throws(() => compileProceduralSceneProfile({
      verified_procedural_compiled_catalog: verified,
      scene: { ...fishing, g5_id: 'wrong:g5' }, world_pin: worldPin(verified) }),
    { code: 'PROCEDURAL_SCENE_PROFILE_DATA_GAP' });
    const old = structuredClone(verified);
    old.allocation_policy = null;
    assert.throws(() => compileProceduralSceneProfile({
      verified_procedural_compiled_catalog: old, scene: fishing,
      world_pin: worldPin(verified) }),
    { code: 'PROCEDURAL_SCENE_PROFILE_COMPILER_INVALID' });
    const tampered = structuredClone(verified);
    tampered.mappings[0].payload.layer = '';
    assert.throws(() => compileProceduralSceneProfile({
      verified_procedural_compiled_catalog: tampered,
      scene: sceneFor(tampered, 'drying_storage_workspace'),
      world_pin: worldPin(tampered) }),
    { code: 'PROCEDURAL_SCENE_PROFILE_DATA_GAP' });
  });
