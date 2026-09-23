import assert from 'node:assert/strict';
import test from 'node:test';
import { compileGeneratedNpcBindings, canonicalDigest } from '../src/index.js';
import { binding, bundle, environment } from './fixtures/approved-procedural-npc.js';

const ref = (id) => ({ id, version: 1 });
const row = (id, profile_kind, payload) => ({ id, version: 1, profile_kind,
  status: 'approved', world_revision_id: 'world', canonical_digest: canonicalDigest(payload), payload });

function input() {
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
  const regional = row('regional', null, { id: 'regional', version: 1, status: 'approved',
    world_revision_id: 'world', applicability: [{ g4_ref: g4, generation_template_ref: template }],
    gameplay_weight: 1, language_status: 'unknown', language_repertoire: null });
  const composition = { ...row('composition', null, { count_weights: [0, 0, 1],
    weighted_profile_refs: [{ profile_ref: ref('worker'), weight: 1 }], placement_policy: {
      status: 'approved', position_slot_order: ['focus', 'departure'], reserved_position_slots: ['arrival'],
      allowed_physical_class_ids: ['spatial.g6.open'], empty_context_rules: [{ physical_class_id: 'spatial.g6.water',
        condition: 'no_existing_carrier_supported_position', count: 0, carrier_creation: 'forbidden' }] } }),
  g4_id: g4.id, g4_version: 1, generation_template_id: template.id, generation_template_version: 1, min_count: 0, max_count: 2 };
  return { party_id: 'party', run_id: 'run', world_catalog_digest: 'f'.repeat(64), equipment_catalog_digest: 'd'.repeat(64),
    equipment_activation: { status: 'active' }, actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile,
    approved_bundle: bundle, environment, closure: { schema: 'rus.m2c_npc_binding_bundle.v1',
      world_revision_id: 'world', g4_ref: g4, generation_template_ref: template, composition,
      runtime_profiles: [profile, ...shared], regional_context_profiles: [regional] },
    scene: { party_id: 'party', site_id: 'generated', rows: [
      { target_table: 'party_g6_instances', id: 'g6', record: { party_id: 'party', status: 'active',
        physical_class_id: 'spatial.g6.open', host_kind: 'g5_site' } },
      ...['arrival', 'departure', 'focus'].map((slot) => ({ target_table: 'scene_position_nodes', id: slot,
        record: { party_id: 'party', status: 'active', template_slot_key: slot, g6_instance_id: 'g6', capacity: 1 } }))] } };
}

test('compiler uses exact imported weighted rows and reserved positions with stable independent RNG', () => {
  const first = compileGeneratedNpcBindings(input());
  const second = compileGeneratedNpcBindings(input());
  assert.deepEqual(first.selection_trace, second.selection_trace);
  assert.equal(first.npc_inputs.length, 2);
  assert.deepEqual(first.npc_inputs.map((value) => value.position_id), ['focus', 'departure']);
  assert.notEqual(first.npc_inputs[0].binding.actor_slot_ref, first.npc_inputs[1].binding.actor_slot_ref);
  assert.deepEqual(first.npc_inputs.map((value) => value.random.nextUint32()), second.npc_inputs.map((value) => value.random.nextUint32()));
  assert.equal(first.npc_inputs[0].approved_bundle.regional_context_profiles[0].language_status, 'unknown');
  assert.equal(first.npc_inputs[0].binding.regional_context_ref.id, 'regional');
  assert.equal(first.npc_inputs[0].binding.world_catalog_digest, 'f'.repeat(64));
  assert.equal(first.equipment_catalog.catalog_digest, 'd'.repeat(64));
});

test('approved water empty-context rule creates no actor or carrier and consumes no count draw', () => {
  const data = input();
  data.scene.rows[0].record.physical_class_id = 'spatial.g6.water';
  const result = compileGeneratedNpcBindings(data);
  assert.equal(result.npc_inputs.length, 0);
  assert.equal(result.selection_trace.count, 0);
  assert.deepEqual(result.selection_trace.choices, []);
  assert.equal(result.selection_trace.empty_context_rule.carrier_creation, 'forbidden');
});

test('canonical initial composition requires its own exact applicability and does not reuse generated scope', () => {
  const data = input();
  const canonical = ref('canonical-approach');
  data.closure.canonical_g5_ref = canonical;
  delete data.closure.generation_template_ref;
  data.closure.composition.canonical_g5_id = canonical.id;
  data.closure.composition.canonical_g5_version = canonical.version;
  data.closure.composition.generation_template_id = null;
  data.closure.composition.generation_template_version = null;
  assert.throws(() => compileGeneratedNpcBindings(data), (error) => error.code === 'NPC_COMPOSITION_REGIONAL_CONTEXT_GAP');
  const applicability = data.closure.regional_context_profiles[0].payload.applicability[0];
  applicability.canonical_g5_ref = canonical;
  delete applicability.generation_template_ref;
  const result = compileGeneratedNpcBindings(data);
  assert.deepEqual(result.npc_inputs[0].binding.canonical_g5_ref, canonical);
  assert.equal(result.npc_inputs[0].binding.generation_template_ref, undefined);
  data.closure.generation_template_ref = ref('template');
  assert.throws(() => compileGeneratedNpcBindings(data), (error) => error.code === 'NPC_COMPOSITION_SCOPE_GAP');
});

test('missing approval, exact dependency, authored weights or permitted placement fails closed', () => {
  const mutations = [
    (data) => { data.closure.composition.status = 'draft'; },
    (data) => { delete data.equipment_catalog_digest; },
    (data) => { data.closure.runtime_profiles[1].status = 'draft'; },
    (data) => { data.closure.composition.payload.weighted_profile_refs[0].weight = undefined; },
    (data) => { data.closure.regional_context_profiles[0].payload.applicability = []; },
    (data) => { data.closure.runtime_profiles[0].payload.body_profile_ref = ref('missing'); },
    (data) => { data.scene.rows[0].record.physical_class_id = 'unknown'; },
    (data) => { data.scene.rows = data.scene.rows.filter((row) => row.id !== 'departure'); }
  ];
  for (const mutate of mutations) {
    const data = input(); mutate(data);
    assert.throws(() => compileGeneratedNpcBindings(data), (error) => error.code?.startsWith('NPC_COMPOSITION_'));
  }
});
