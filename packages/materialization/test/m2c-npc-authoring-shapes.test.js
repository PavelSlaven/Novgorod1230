import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileGeneratedNpcBindings, materializeApprovedProceduralNpc,
  materializeApprovedActorEquipment } from '../src/index.js';
import { validateNpcRoutineProfile } from '@rus/npc-runtime';
import { binding, bundle, environment } from './fixtures/approved-procedural-npc.js';

// Approval is simulated only in memory to check candidate-to-consumer shape.
// This test never promotes the authoring artifacts or provides production evidence.
function simulatedApproval(value) {
  if (Array.isArray(value)) return value.map(simulatedApproval);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    key === 'status' && ['draft', 'candidate_approval_pending', 'authoring_candidate'].includes(item)
      ? 'approved' : simulatedApproval(item)]));
}
const read = async (table) => simulatedApproval(JSON.parse(await readFile(new URL(
  `../../../data/world-catalogs/novgorod/m2c-npc/datasets/${table}.json`, import.meta.url), 'utf8')));

test('all nine mapped NPC profiles feed existing body, clothing, tools and routine consumers', async () => {
  const [compositions, runtime, regional] = await Promise.all([
    read('spatial_v3_g4_npc_composition_bindings'), read('spatial_v3_npc_runtime_profiles'),
    read('spatial_v3_npc_regional_context_profiles')]);
  const profiles = runtime.filter((row) => row.profile_kind === 'npc_binding');
  assert.equal(profiles.length, 9);
  verifyProfiles({ compositions, runtime, regional, profiles });
});

test('canonical initial candidate reuses three approved families with separate exact applicability', async () => {
  const candidate = simulatedApproval(JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/m2c-npc/canonical-initial-candidate.json', import.meta.url), 'utf8')));
  assert.equal(candidate.runtime_profiles.length, 3);
  const runtime = [...await read('spatial_v3_npc_runtime_profiles'), ...candidate.runtime_profiles];
  verifyProfiles({ compositions: [candidate.composition], runtime,
    regional: candidate.regional_context_profiles, profiles: candidate.runtime_profiles });
});

function verifyProfiles({ compositions, runtime, regional, profiles }) {
  for (const profile of profiles) for (const sex of ['male', 'female']) {
    for (const season of ['summer', 'spring', 'spring_rasputitsa', 'autumn', 'winter']) {
      const composition = structuredClone(compositions.find((row) => row.payload.weighted_profile_refs
        .some((entry) => entry.profile_ref.id === profile.id)));
      assert.ok(composition, profile.id);
      composition.min_count = 1; composition.max_count = 1; composition.payload.count_weights = [1];
      composition.payload.weighted_profile_refs = [{ profile_ref: { id: profile.id, version: profile.version }, weight: 1 }];
      const base = structuredClone(bundle);
      base.roles[0].role_id = profile.role_ref;
      base.occupations[0].occupation_id = profile.occupation_ref;
      base.occupations[0].allowed_social_role_ids = profile.role_ref;
      for (const field of ['summer', 'winter', 'spring_rasputitsa', 'autumn']) base.occupations[0][`daily_schedule_${field}`] = 'Fixture ordinary activity';
      base.actor_profiles.region_demographic_profiles[0].id = profile.payload.demographic_profile_ref;
      base.actor_profiles.region_appearance_profiles[0].id = profile.payload.appearance_profile_ref;
      for (const row of base.actor_profiles.region_demographic_profile_entries) row.demographic_profile_id = profile.payload.demographic_profile_ref;
      for (const row of base.actor_profiles.region_appearance_profile_entries) row.appearance_profile_id = profile.payload.appearance_profile_ref;
      base.actor_profiles.universal_categories.find((row) => row.id === 'category:sex_category').stable_code = sex;
      for (const activity of runtime.filter((row) => row.profile_kind === 'activity')) {
        for (const ref of activity.payload.payload.body_effect_profile_refs) {
          const id = ref.entity_ref.entity_id;
          if (!base.temporal_records.some((row) => row.record_id === id)) base.temporal_records.push({
            record_id: id, record_kind: 'body_effect_profile', status: 'approved', payload: { body_effect_profile_id: id } });
        }
      }
      const world = composition.world_revision_id;
      const scene = { party_id: 'p', site_id: 'generated', rows: [
        { target_table: 'party_g6_instances', id: 'g6', record: { party_id: 'p', status: 'active', host_kind: 'g5_site', physical_class_id: 'spatial.g6.open' } },
        { target_table: 'scene_position_nodes', id: 'pos', record: { party_id: 'p', status: 'active', g6_instance_id: 'g6', template_slot_key: 'focus', capacity: 1 } }] };
      const compiled = compileGeneratedNpcBindings({ party_id: 'p', run_id: 'r', scene,
        closure: { schema: 'rus.m2c_npc_binding_bundle.v1', world_revision_id: world,
          g4_ref: { id: composition.g4_id, version: composition.g4_version, world_revision_id: world },
          ...(composition.canonical_g5_id
            ? { canonical_g5_ref: { id: composition.canonical_g5_id, version: composition.canonical_g5_version } }
            : { generation_template_ref: { id: composition.generation_template_id, version: composition.generation_template_version } }),
          composition, runtime_profiles: runtime, regional_context_profiles: regional },
        approved_bundle: base, environment: { ...environment, season }, equipment_activation: { status: 'active' },
        actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile,
        world_catalog_digest: 'c'.repeat(64), equipment_catalog_digest: 'e'.repeat(64) });
      const input = compiled.npc_inputs[0];
      validateNpcRoutineProfile(input.routine_profile);
      const npc = materializeApprovedProceduralNpc({ party_id: 'p', run_id: 'r', ...input });
      assert.equal(npc.npc.identity_state.sex_category, sex);
      const equipment = materializeApprovedActorEquipment({ party_id: 'p', run_id: 'r', request_id: 'entry',
        world_revision_id: world, g4_id: composition.g4_id, ...compiled.equipment_catalog,
        actor_candidate_instance_map: npc.actor_candidate_instance_map,
        initial_equipment_candidates: npc.initial_equipment_candidates });
      assert.ok(equipment.item_instances.length >= 2, `${profile.id}/${sex}/${season}`);
    }
  }
}
