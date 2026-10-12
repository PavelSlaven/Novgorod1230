import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalDigest, compilePlacePeopleBindings, decidePlacePeople,
  materializeApprovedProceduralNpc } from '../src/index.js';
import { binding, bundle, environment } from './fixtures/approved-procedural-npc.js';

const ref = (id) => ({ id, version: 1 });
const compositionData = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/game-base-v1/places-binding/presence/people_composition_authoring.json',
  import.meta.url), 'utf8'));
const outbuildings = compositionData.compositions.find((row) => row.pf_id === 'pf_outbuildings');
const sourceGroup = outbuildings.population_groups[0];

function composition(group = sourceGroup) {
  return [{ place_family_id: outbuildings.pf_id,
    composition_ref: { id: 'composition-outbuildings', version: 1, world_revision_id: 'world' },
    population_groups: [structuredClone(group)] }];
}

function clothingProfile(profile) {
  return { id: 'clothing', version: 1, status: 'approved', world_revision_id: 'world',
    allowed_role_refs: [profile.role_ref], allowed_occupation_refs: [profile.occupation_ref],
    property_binding: { owner: 'actor', holder: 'actor', controller: 'actor', source_ref: 'fixture' },
    variants: ['male', 'female'].map((sex) => ({ id: sex, sex_categories: [sex], age_categories: ['adult'],
      seasons: ['summer'], required_clothing_slot_refs: ['base_garment'], equipment_templates: [{
        equipment_candidate_id: `shirt:${sex}`, status: 'approved', physical_position: 'equipped',
        equipment_slot_category_id: 'base_garment' }] })) };
}

function profileClosure(profile, actorApplicability) {
  const clothes = clothingProfile(profile);
  const shared = [
    { id: 'body', version: 1, profile_kind: 'body', status: 'approved', world_revision_id: 'world',
      canonical_digest: canonicalDigest(binding.body_profile), payload: binding.body_profile },
    { id: 'activity', version: 1, profile_kind: 'activity', status: 'approved', world_revision_id: 'world',
      canonical_digest: canonicalDigest(bundle.temporal_records[0]), payload: bundle.temporal_records[0] },
    { id: 'routine', version: 1, profile_kind: 'routine', status: 'approved', world_revision_id: 'world',
      canonical_digest: canonicalDigest({ status: 'approved', profile_id: 'routine' }),
      payload: { status: 'approved', profile_id: 'routine' } },
    { id: 'clothing', version: 1, profile_kind: 'clothing', status: 'approved', world_revision_id: 'world',
      canonical_digest: canonicalDigest(clothes), payload: clothes },
  ];
  const payload = { profile_level: 'background', actor_profile_rule_ref: 'worker',
    demographic_profile_ref: 'demo', appearance_profile_ref: 'look', body_profile_ref: ref('body'),
    activity_profile_ref: ref('activity'), routine_profile_ref: ref('routine'), clothing_profile_ref: ref('clothing'),
    runtime_profile_refs: shared.map((row) => ref(row.id)), regional_context_refs: [ref('regional')],
    initial_equipment_templates: [], observable_activity: binding.observable_activity,
    ...(actorApplicability ? { actor_applicability: actorApplicability } : {}) };
  const worker = { id: profile.id, version: profile.version, profile_kind: 'npc_binding', status: 'approved',
    world_revision_id: 'world', canonical_digest: canonicalDigest(payload), payload,
    role_ref: profile.role_ref, occupation_ref: profile.occupation_ref };
  const regionalPayload = { schema: 'rus.npc_regional_context_profile.v1', id: 'regional', version: 1,
    status: 'approved', world_revision_id: 'world', allowed_role_refs: [profile.role_ref],
    allowed_occupation_refs: [profile.occupation_ref], applicability: [{
      g4_ref: { ...ref('g4'), world_revision_id: 'world' } }],
    origin: { label: 'Новгород', directness: 'direct', confidence: 'high', source_refs: ['fixture'] },
    language_status: 'unknown', language_repertoire: null, gameplay_weight: 1 };
  const regional = { id: 'regional', version: 1, status: 'approved', world_revision_id: 'world',
    canonical_digest: canonicalDigest(regionalPayload), payload: regionalPayload };
  const runtimeProfiles = [worker, ...shared];
  return { party_id: 'party', run_id: 'run', world_catalog_digest: 'f'.repeat(64),
    equipment_catalog_digest: 'd'.repeat(64), equipment_activation: { status: 'active' },
    actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile,
    approved_bundle: actorBundle(profile), environment,
    closure: { schema: 'rus.place_people_binding_bundle.v1', world_revision_id: 'world', g4_ref: ref('g4'),
      canonical_g5_ref: ref('cg5'), placement_policy: { status: 'approved',
        position_slot_order: ['focus', 'departure'], reserved_position_slots: ['arrival'],
        allowed_physical_class_ids: ['spatial.g6.open'], empty_context_rules: [] },
      runtime_profiles: runtimeProfiles, regional_context_profiles: [regional] },
    scene: { party_id: 'party', site_id: 'canonical-site', rows: [
      { target_table: 'party_g6_instances', id: 'g6', record: { party_id: 'party', status: 'active',
        physical_class_id: 'spatial.g6.open', host_kind: 'g5_site' } },
      ...['arrival', 'departure', 'focus'].map((slot) => ({ target_table: 'scene_position_nodes', id: slot,
        record: { party_id: 'party', status: 'active', template_slot_key: slot, g6_instance_id: 'g6', capacity: 1 } }))] } };
}

function actorBundle(profile) {
  const actorProfiles = structuredClone(bundle.actor_profiles);
  const maleOption = actorProfiles.region_category_options.find((row) => row.category_id === 'category:sex_category');
  const femaleOption = { ...maleOption, id: 'option:sex_category:female', category_id: 'category:sex_category:female' };
  actorProfiles.region_category_options.push(femaleOption);
  actorProfiles.universal_categories.push({ ...actorProfiles.universal_categories.find((row) => row.facet === 'sex_category'),
    id: 'category:sex_category:female', stable_code: 'female' });
  actorProfiles.region_demographic_profile_entries.push({
    ...actorProfiles.region_demographic_profile_entries.find((row) => row.facet === 'sex_category'),
    id: 'entry:sex_category:female', option_id: femaleOption.id,
  });
  const role = { ...bundle.roles[0], role_id: profile.role_ref, role_title: 'слуга' };
  const occupation = { ...bundle.occupations[0], occupation_id: profile.occupation_ref,
    allowed_social_role_ids: profile.role_ref };
  return { ...structuredClone(bundle), roles: [role], occupations: [occupation], actor_profiles: actorProfiles,
    clothing_profiles: [clothingProfile(profile)] };
}

function materialize(group = sourceGroup, actorApplicability) {
  const wanted = decidePlacePeople({ party_id: 'party', scope_instance_ref: 'g5:site',
    compositions: composition(group), candidates: [{ id: sourceGroup.weighted_subjects[0].profile_ref,
      version: 1, role_ref: 'nov_role_servant', occupation_ref: 'nov_occ_household_servant' }],
    bundle: { roles: [{ role_id: 'nov_role_servant' }], occupations: [{ occupation_id: 'nov_occ_household_servant' }] },
    capacity: 1 });
  const people = wanted.people;
  const input = profileClosure({ id: people[0].profile_ref.id, version: people[0].profile_ref.version,
    role_ref: 'nov_role_servant', occupation_ref: 'nov_occ_household_servant' }, actorApplicability);
  const compiled = compilePlacePeopleBindings({ ...input, people });
  const npcInput = compiled.npc_inputs[0];
  return materializeApprovedProceduralNpc({ party_id: input.party_id, run_id: input.run_id,
    binding: npcInput.binding, approved_bundle: npcInput.approved_bundle,
    environment: npcInput.environment, random: npcInput.random });
}

test('D-2 outbuildings servant sex reaches the NPC created by production compile and materialize', () => {
  const result = materialize();
  assert.equal(result.npc.identity_state.sex_category, 'male');
});

test('profile sex override remains active when the composition slot has no sex field', () => {
  const group = structuredClone(sourceGroup);
  delete group.weighted_subjects[0].sex;
  const result = materialize(group, { sex_category: ['female'] });
  assert.equal(result.npc.identity_state.sex_category, 'female');
});
