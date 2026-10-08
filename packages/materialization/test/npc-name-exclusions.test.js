import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, compileGeneratedNpcBindings, compilePlacePeopleBindings,
  createRandomSource, materializeApprovedProceduralNpc } from '../src/index.js';
import { binding, bundle, environment } from './fixtures/approved-procedural-npc.js';

const CONTEXT = 'ctx-novgorod';
const name = (id, form, sex = 'male', pool = 'pool', people = 'pp_novgorod_rus', weight = 1) => ({
  id, name_pool_id: pool, name_form: form, weight, sex_category: sex, people_ref: people
});
const identityCatalog = (entries) => ({ schema: 'rus.npc_identity_catalog.v1',
  name_bindings: [{ regional_context_id: CONTEXT, name_pool_id: 'pool', people_ref: 'pp_novgorod_rus' }],
  name_entries: entries, scale_entries: [], character_items: [] });
const withSex = (sex) => {
  const copy = structuredClone(bundle);
  copy.actor_profiles.universal_categories.find((row) => row.facet === 'sex_category').stable_code = sex;
  return copy;
};
const regional = (id = CONTEXT) => ({ schema: 'rus.npc_regional_context_profile.v1', id, version: 1, status: 'approved',
  world_revision_id: 'world', allowed_role_refs: ['role'], allowed_occupation_refs: ['occupation'],
  applicability: [{ g4_ref: { world_revision_id: 'world', id: 'g4', version: 1 },
    generation_template_ref: { id: 'template', version: 1 } }],
  origin: { label: id, directness: 'analogical', confidence: 'low', source_refs: ['src'] },
  language_status: 'unknown', language_repertoire: null });
function materialize({ catalog = identityCatalog([name('a', 'Ярослав'), name('b', 'Гюрята')]),
  occupied_names = [], sourceBundle = bundle, context = CONTEXT } = {}) {
  return materializeApprovedProceduralNpc({ party_id: 'party', run_id: 'run', environment,
    binding: { ...binding, regional_context_ref: { id: context, version: 1 },
      g4_ref: { world_revision_id: 'world', id: 'g4', version: 1 },
      generation_template_ref: { id: 'template', version: 1 } },
    approved_bundle: { ...sourceBundle, regional_context_profiles: [regional(context)],
      ...(catalog ? { npc_identity: catalog } : {}) }, occupied_names,
    random: createRandomSource({ seed: 42 }) });
}

test('excludes exact occupied forms across duplicate entries while keeping pool, people and sex filters', () => {
  const catalog = identityCatalog([
    name('same-a', 'Сокол'), name('same-b', 'Сокол'), name('free', 'Велимир'),
    name('female', 'Сокол', 'female'), name('foreign-people', 'Сокол', 'male', 'pool', 'pp_other'),
    name('other-pool', 'Сокол', 'male', 'other-pool')
  ]);
  const { npc } = materialize({ catalog, occupied_names: ['Сокол'], sourceBundle: withSex('male') });
  assert.equal(npc.identity_state.canonical_name, 'Велимир');
  assert.deepEqual(npc.identity_state.name_provenance,
    { pool_id: 'pool', entry_id: 'free', people_ref: 'pp_novgorod_rus' });
});

test('pool exhaustion reuses the single weighted draw and marks provenance without changing appearance', () => {
  const catalog = identityCatalog([name('a', 'Гюрята', 'male', 'pool', 'pp_novgorod_rus', 1),
    name('b', 'Ярослав', 'male', 'pool', 'pp_novgorod_rus', 3),
    name('c', 'Твердислав', 'male', 'pool', 'pp_novgorod_rus', 7)]);
  const plain = materialize({ catalog, sourceBundle: withSex('male') });
  const occupied = catalog.name_entries.map((row) => row.name_form);
  const before = [...occupied];
  const exhausted = materialize({ catalog, occupied_names: occupied, sourceBundle: withSex('male') });
  assert.deepEqual(occupied, before, 'caller-owned occupied names stay unchanged');
  assert.equal(exhausted.npc.identity_state.canonical_name, plain.npc.identity_state.canonical_name);
  assert.deepEqual(exhausted.npc.identity_state.name_provenance,
    { ...plain.npc.identity_state.name_provenance, reason: 'scene_pool_exhausted' });
  assert.deepEqual(exhausted.choices, plain.choices);
  for (const facet of ['sex_category', 'age_category', 'appearance']) {
    assert.deepEqual(exhausted.npc.identity_state[facet], plain.npc.identity_state[facet]);
  }
});

test('missing catalog and empty applicable pool retain their legacy nameless results', () => {
  const missing = materialize({ catalog: null, occupied_names: ['Ярослав'] }).npc;
  assert.equal(missing.identity_state.canonical_name, undefined);
  const noCandidates = materialize({ catalog: identityCatalog([name('female', 'Акулина', 'female')]),
    occupied_names: ['Ярослав'], sourceBundle: withSex('male') }).npc;
  assert.equal(noCandidates.identity_state.canonical_name, null);
  assert.deepEqual(noCandidates.identity_state.name_provenance, { reason: 'no_candidates' });
  const noBinding = materialize({ catalog: identityCatalog([name('male', 'Ярослав')]),
    occupied_names: ['Ярослав'], context: 'ctx-unbound' }).npc;
  assert.equal(noBinding.identity_state.canonical_name, null);
  assert.deepEqual(noBinding.identity_state.name_provenance, { reason: 'no_pool_binding' });
});

const ref = (id) => ({ id, version: 1 });
const row = (id, profile_kind, payload) => ({ id, version: 1, profile_kind, status: 'approved',
  world_revision_id: 'world', canonical_digest: canonicalDigest(payload), payload });
function compileGeneratedInput() {
  const g4 = ref('g4'); const template = ref('template');
  const shared = [row('body', 'body', binding.body_profile),
    row('activity', 'activity', bundle.temporal_records[0]),
    row('routine', 'routine', { status: 'approved', profile_id: 'routine' }),
    row('clothing', 'clothing', { status: 'approved', id: 'clothing', version: 1 })];
  const profile = row('worker', 'npc_binding', { profile_level: 'background', actor_profile_rule_ref: 'worker',
    demographic_profile_ref: 'demo', appearance_profile_ref: 'look', body_profile_ref: ref('body'),
    activity_profile_ref: ref('activity'), routine_profile_ref: ref('routine'), clothing_profile_ref: ref('clothing'),
    runtime_profile_refs: shared.map((item) => ref(item.id)), regional_context_refs: [ref('regional')],
    initial_equipment_templates: [], observable_activity: binding.observable_activity });
  profile.role_ref = 'role'; profile.occupation_ref = 'occupation';
  const regionalRow = row('regional', null, { id: 'regional', version: 1, status: 'approved',
    applicability: [{ g4_ref: g4, generation_template_ref: template }], gameplay_weight: 1,
    language_status: 'unknown', language_repertoire: null });
  const composition = { ...row('composition', null, { count_weights: [0, 0, 1],
    weighted_profile_refs: [{ profile_ref: ref('worker'), weight: 1 }], placement_policy: {
      status: 'approved', position_slot_order: ['focus', 'departure'], reserved_position_slots: ['arrival'],
      allowed_physical_class_ids: ['spatial.g6.open'], empty_context_rules: [] } }),
  g4_id: g4.id, g4_version: 1, generation_template_id: template.id, generation_template_version: template.version,
  min_count: 0, max_count: 2 };
  return { party_id: 'party', run_id: 'run', world_catalog_digest: 'f'.repeat(64),
    equipment_catalog_digest: 'd'.repeat(64), equipment_activation: { status: 'active' },
    actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile,
    approved_bundle: bundle, environment,
    closure: { schema: 'rus.m2c_npc_binding_bundle.v1', world_revision_id: 'world', g4_ref: g4,
      generation_template_ref: template, composition, runtime_profiles: [profile, ...shared],
      regional_context_profiles: [regionalRow] },
    scene: { party_id: 'party', site_id: 'generated', rows: [
      { target_table: 'party_g6_instances', id: 'g6', record: { party_id: 'party', status: 'active',
        physical_class_id: 'spatial.g6.open', host_kind: 'g5_site' } },
      ...['arrival', 'departure', 'focus'].map((slot) => ({ target_table: 'scene_position_nodes', id: slot,
        record: { party_id: 'party', status: 'active', template_slot_key: slot, g6_instance_id: 'g6', capacity: 1 } }))] } };
}
function compilePlaceInput() {
  const g4 = ref('g4'); const canonical = ref('canonical');
  const shared = [row('body', 'body', binding.body_profile), row('activity', 'activity', bundle.temporal_records[0]),
    row('routine', 'routine', { status: 'approved', profile_id: 'routine' }),
    row('clothing', 'clothing', { status: 'approved', id: 'clothing', version: 1 })];
  const worker = row('worker', 'npc_binding', { profile_level: 'background', actor_profile_rule_ref: 'worker',
    demographic_profile_ref: 'demo', appearance_profile_ref: 'look', body_profile_ref: ref('body'),
    activity_profile_ref: ref('activity'), routine_profile_ref: ref('routine'), clothing_profile_ref: ref('clothing'),
    runtime_profile_refs: shared.map((item) => ref(item.id)), regional_context_refs: [ref('regional')],
    initial_equipment_templates: [], observable_activity: binding.observable_activity });
  worker.role_ref = 'role'; worker.occupation_ref = 'occupation';
  const regionalRow = row('regional', null, { id: 'regional', version: 1, status: 'approved',
    applicability: [{ g4_ref: g4 }], gameplay_weight: 1, language_status: 'unknown', language_repertoire: null });
  return { party_id: 'party', run_id: 'run', world_catalog_digest: 'f'.repeat(64),
    equipment_catalog_digest: 'd'.repeat(64), equipment_activation: { status: 'active' },
    actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile,
    approved_bundle: bundle, environment,
    closure: { schema: 'rus.place_people_binding_bundle.v1', world_revision_id: 'world', g4_ref: g4,
      canonical_g5_ref: canonical, placement_policy: { status: 'approved',
        position_slot_order: ['focus', 'departure'], reserved_position_slots: ['arrival'],
        allowed_physical_class_ids: ['spatial.g6.open'], empty_context_rules: [] },
      runtime_profiles: [worker, ...shared], regional_context_profiles: [regionalRow] },
    people: [0, 1].map(() => ({ group_id: 'pf_test.a', place_family_id: 'pf_test', profile_ref: ref('worker'),
      place_population_composition_ref: { id: 'composition-test', version: 1, world_revision_id: 'world' } })),
    scene: { party_id: 'party', site_id: 'canonical-site', rows: [
      { target_table: 'party_g6_instances', id: 'g6', record: { party_id: 'party', status: 'active',
        physical_class_id: 'spatial.g6.open', host_kind: 'g5_site' } },
      ...['arrival', 'departure', 'focus'].map((slot) => ({ target_table: 'scene_position_nodes', id: slot,
        record: { party_id: 'party', status: 'active', template_slot_key: slot, g6_instance_id: 'g6', capacity: 1 } }))] } };
}

test('both public compilers copy occupied forms into actor inputs without mutating caller arrays', () => {
  const occupied_names = ['Сокол'];
  const before = [...occupied_names];
  const generated = compileGeneratedNpcBindings({ ...compileGeneratedInput(), occupied_names });
  const placePeople = compilePlacePeopleBindings({ ...compilePlaceInput(), occupied_names });
  assert.deepEqual(generated.npc_inputs.map((input) => input.occupied_names), [before, before]);
  assert.deepEqual(placePeople.npc_inputs.map((input) => input.occupied_names), [before, before]);
  assert.deepEqual(occupied_names, before);
});
