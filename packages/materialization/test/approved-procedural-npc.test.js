import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomSource,
  materializeApprovedProceduralNpc } from '../src/index.js';

import { binding, bundle, environment } from './fixtures/approved-procedural-npc.js';

test('approved procedural NPC is deterministic, complete and unnamed', () => {
  const input = { party_id: 'party', run_id: 'run', binding,
    approved_bundle: bundle, environment };
  const left = materializeApprovedProceduralNpc({ ...input,
    random: createRandomSource({ seed: 42 }) });
  const right = materializeApprovedProceduralNpc({ ...input,
    random: createRandomSource({ seed: 42 }) });
  assert.deepEqual(left, right);
  assert.equal(left.npc.identity_state.canonical_name, undefined);
  assert.equal(left.npc.identity_state.name, undefined);
  assert.equal(left.npc.skill_profile_snapshot.approved_defaults[0].skill_id,
    'fishing');
  assert.equal(left.npc.body.values.health, 100);
  assert.deepEqual(Object.keys(left.npc.base_attributes.values).sort(),
    ['attention', 'dexterity', 'endurance', 'influence', 'reason', 'strength']);
  assert.deepEqual(Object.values(left.npc.base_attributes.values).sort((a, b) => b - a),
    [13, 12, 11, 10, 9, 8]);
  assert.equal(left.npc.semantic_state.behavior_basis[0].value, 'осторожен');
  assert.equal(left.npc.machine_state.current_activity.summary, 'чинит сети');
  assert.equal(left.npc.schedule_records[0].time_band, 'daylight');
});

test('draft/caution owners and missing required equipment fail closed', () => {
  for (const status of ['draft','accepted_with_caution']) {
    assert.throws(() => materializeApprovedProceduralNpc({ party_id: 'party',
      run_id: 'run', binding: { ...binding, status }, approved_bundle: bundle,
      environment, random: createRandomSource({ seed: 1 }) }),
    { code: 'PROCEDURAL_NPC_INPUT_INVALID' });
  }
  assert.throws(() => materializeApprovedProceduralNpc({ party_id: 'party',
    run_id: 'run', binding: { ...binding, equipment_required: true },
    approved_bundle: bundle, environment,
    random: createRandomSource({ seed: 1 }) }),
  { code: 'PROCEDURAL_NPC_EQUIPMENT_DATA_GAP' });
  assert.throws(() => materializeApprovedProceduralNpc({ party_id: 'party',
    run_id: 'run', binding, approved_bundle: { ...bundle,
      roles: [{ ...bundle.roles[0], role_title: null }],
      occupations: [{ ...bundle.occupations[0], occupation_title: null }] }, environment,
    random: createRandomSource({ seed: 1 }) }),
  { code: 'PROCEDURAL_NPC_PUBLIC_LABEL_DATA_GAP' });
});

test('regional context requires exact approved scope and never infers language or appearance', () => {
  const g4 = { world_revision_id: 'world', id: 'g4', version: 1 };
  const template = { id: 'template', version: 1 };
  const regional = { schema: 'rus.npc_regional_context_profile.v1',
    id: 'gotland-guest', version: 1, status: 'approved',
    world_revision_id: 'world', allowed_role_refs: ['role'],
    allowed_occupation_refs: ['occupation'], applicability: [{
      g4_ref: g4, generation_template_ref: template }],
    origin: { label: 'Gotland', directness: 'analogical', confidence: 'low',
      source_refs: ['treaty-1191-1192'] },
    language_status: 'unknown', language_repertoire: null };
  const input = { party_id: 'party', run_id: 'run', environment,
    binding: { ...binding, regional_context_ref: { id: regional.id, version: 1 },
      g4_ref: g4, generation_template_ref: template },
    approved_bundle: { ...bundle, regional_context_profiles: [regional] } };
  const result = materializeApprovedProceduralNpc({ ...input,
    random: createRandomSource({ seed: 42 }) });
  const plain = materializeApprovedProceduralNpc({ party_id: 'party',
    run_id: 'run', environment, binding, approved_bundle: bundle,
    random: createRandomSource({ seed: 42 }) });
  assert.deepEqual(result.npc.identity_state, plain.npc.identity_state);
  assert.deepEqual(result.choices, plain.choices);
  assert.equal(result.npc.semantic_state.regional_context.origin.label, 'Gotland');
  assert.equal(result.npc.semantic_state.regional_context.language_repertoire, null);
  assert.equal(result.npc.identity_state.language, undefined);
  for (const patch of [{ status: 'draft' }, { version: 2 },
    { world_revision_id: 'other-world' }, { allowed_role_refs: ['other-role'] },
    { applicability: [{ g4_ref: { ...g4, version: 2 },
      generation_template_ref: template }] },
    { language_repertoire: [{ language_ref: 'inferred-from-origin' }] }]) {
    assert.throws(() => materializeApprovedProceduralNpc({ ...input,
      approved_bundle: { ...bundle, regional_context_profiles: [{ ...regional, ...patch }] },
      random: { nextIndex() { assert.fail('rejected context must not draw RNG'); } } }),
    { code: 'PROCEDURAL_NPC_REGIONAL_CONTEXT_DATA_GAP' });
  }
});

test('clothing resolves exact selected demographic variant without changing appearance draws', () => {
  const profile = { id: 'clothes', version: 1, status: 'approved', world_revision_id: 'world',
    allowed_role_refs: [binding.role_ref], allowed_occupation_refs: [binding.occupation_ref],
    property_binding: { owner: 'actor', holder: 'actor', controller: 'actor', source_ref: 'personal' },
    variants: ['male', 'female'].map((sex) => ({ id: sex, sex_categories: [sex], age_categories: ['adult'],
      seasons: ['summer'], required_clothing_slot_refs: ['base_garment'], equipment_templates: [{
        equipment_candidate_id: `shirt:${sex}`, status: 'approved', physical_position: 'equipped',
        equipment_slot_category_id: 'base_garment' }] })) };
  const run = (approvedBundle) => materializeApprovedProceduralNpc({ party_id: 'party', run_id: 'run',
    binding: { ...binding, clothing_profile_ref: { id: 'clothes', version: 1 } },
    approved_bundle: approvedBundle, environment, random: createRandomSource({ seed: 42 }) });
  const maleBundle = { ...bundle, clothing_profiles: [profile] };
  const male = run(maleBundle);
  assert.equal(male.clothing_binding.variant_id, 'male');
  assert.equal(male.initial_equipment_candidates[0].target_actor_slot_ref, binding.actor_slot_ref);
  const femaleBundle = structuredClone(maleBundle);
  femaleBundle.actor_profiles.universal_categories.find((row) => row.id === 'category:sex_category').stable_code = 'female';
  const female = run(femaleBundle);
  assert.equal(female.clothing_binding.variant_id, 'female');
  assert.equal(female.initial_equipment_candidates[0].equipment_candidate_id, `${binding.actor_slot_ref}:shirt:female`);
  const plain = materializeApprovedProceduralNpc({ party_id: 'party', run_id: 'run', binding,
    approved_bundle: femaleBundle, environment, random: createRandomSource({ seed: 42 }) });
  assert.deepEqual(female.npc.identity_state, plain.npc.identity_state);
  assert.deepEqual(female.choices, plain.choices);
  femaleBundle.clothing_profiles[0].variants = [profile.variants[0]];
  assert.throws(() => run(femaleBundle), { code: 'PROCEDURAL_NPC_CLOTHING_DATA_GAP' });
  const duplicate = structuredClone(maleBundle);
  duplicate.clothing_profiles[0].variants.push(profile.variants[0]);
  assert.throws(() => run(duplicate), { code: 'PROCEDURAL_NPC_CLOTHING_DATA_GAP' });
});
