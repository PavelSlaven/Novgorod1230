import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest, compilePlacePeopleBindings, decidePlacePeople } from '../src/index.js';
import { binding, bundle, environment } from './fixtures/approved-procedural-npc.js';

const ref = (id) => ({ id, version: 1 });
const profile = (id, role_ref, occupation_ref) => ({ id, version: 1, role_ref, occupation_ref });
const CANDIDATES = [profile('m2c_npc_household_servant_v1', 'nov_role_servant', 'nov_occ_household_servant'),
  profile('m2c_npc_fisher_v1', 'nov_role_fisher', 'nov_occ_fisher'),
  profile('m2c_npc_householder_v1', 'nov_role_smerd_householder', 'nov_occ_peasant')];
const BUNDLE = { roles: [{ role_id: 'nov_role_servant' }, { role_id: 'nov_role_fisher' }, { role_id: 'nov_role_smerd_householder' }],
  occupations: [{ occupation_id: 'nov_occ_household_servant' }, { occupation_id: 'nov_occ_fisher' }, { occupation_id: 'nov_occ_peasant' }] };
const group = (group_id, subjects, min_count = 1, max_count = min_count, count_weights = [1]) => ({ group_id, min_count,
  max_count, count_weights, weighted_subjects: subjects.map(([subject_kind, subject_ref, profile_ref = null]) =>
    ({ subject_kind, subject_ref, profile_ref, weight: 1 })) });
const composition = (...groups) => ({ composition_ref: { id: 'pf_test', version: 1 }, population_groups: groups });
const rule = (subject_ref, ppm, subject_kind = 'occupation') => ({ rule_id: `pr_${subject_ref}`, rule_version: 1,
  status: 'approved', scope_ref: 'pf_test', subject_kind, subject_ref, presence_probability_ppm: ppm, count_limit: 1,
  refresh_class: 'none' });
const decide = (over = {}) => decidePlacePeople({ party_id: 'party', scope_instance_ref: 'g5:site', composition: null, rules: [],
  period_number: 4920, candidates: CANDIDATES, bundle: BUNDLE, capacity: 2, ...over });

test('a composition group with min_count 1 always puts a resolved person on the place, deterministically by seed', () => {
  const comp = composition(group('pf_test.servant', [['occupation', 'nov_occ_household_servant', 'm2c_npc_household_servant_v1']]));
  for (let i = 0; i < 40; i += 1) {
    const result = decide({ composition: comp, party_id: `party-${i}` });
    assert.equal(result.people.length, 1);
    assert.deepEqual(result.people[0].profile_ref, { id: 'm2c_npc_household_servant_v1', version: 1 });
    assert.equal(result.people[0].origin, 'composition');
    assert.deepEqual(result, decide({ composition: comp, party_id: `party-${i}` }));
  }
});

test('count_weights pick the number of people; a subject without an exact profile_ref is matched by its role or occupation', () => {
  const comp = composition(group('pf_test.yard', [['social_role', 'nov_role_smerd_householder']], 0, 2, [0, 0, 1]));
  const result = decide({ composition: comp });
  assert.equal(result.people.length, 2);
  assert.ok(result.people.every((person) => person.profile_ref.id === 'm2c_npc_householder_v1'));
  assert.deepEqual(result.people.map((person) => person.ordinal), [0, 1]);
});

test('a subject with no approved profile, an ambiguous one or a role missing from the actor bundle creates nobody and reports a gap', () => {
  const missing = decide({ composition: composition(group('g.ferry', [['occupation', 'nov_occ_ferryman']])) });
  assert.deepEqual(missing.people, []);
  assert.deepEqual(missing.gaps.map((gap) => [gap.code, gap.subject_ref]), [['people_profile_missing', 'nov_occ_ferryman']]);
  const twin = [...CANDIDATES, profile('m2c_npc_fisher_v2', 'nov_role_fisher', 'nov_occ_fisher')];
  assert.equal(decide({ composition: composition(group('g.f', [['occupation', 'nov_occ_fisher']])), candidates: twin })
    .gaps[0].code, 'people_profile_ambiguous');
  const noRole = decide({ composition: composition(group('g.s', [['occupation', 'nov_occ_household_servant']])),
    bundle: { roles: [], occupations: BUNDLE.occupations } });
  assert.deepEqual([noRole.people.length, noRole.gaps[0].code], [0, 'people_actor_bundle_missing']);
});

test('an older approved version of the same profile id is not a second candidate; the newest version is bound', () => {
  const comp = composition(group('g.f', [['occupation', 'nov_occ_fisher']]));
  const older = [...CANDIDATES, { ...profile('m2c_npc_fisher_v1', 'nov_role_fisher', 'nov_occ_fisher'), version: 2 }];
  const result = decide({ composition: comp, candidates: older });
  assert.deepEqual(result.people.map((person) => person.profile_ref), [{ id: 'm2c_npc_fisher_v1', version: 2 }]);
  const exact = decide({ composition: composition(group('g.f', [['occupation', 'nov_occ_fisher', 'm2c_npc_fisher_v1']])),
    candidates: older });
  assert.deepEqual(exact.people.map((person) => person.profile_ref), [{ id: 'm2c_npc_fisher_v1', version: 2 }]);
});

test('presence rules for occupations and roles roll by their own probability; a subject the composition names is not rolled again', () => {
  assert.equal(decide({ rules: [rule('nov_occ_fisher', 1_000_000)] }).people[0].origin, 'presence_rule');
  assert.equal(decide({ rules: [rule('nov_occ_fisher', 0)] }).people.length, 0);
  const owned = decide({ composition: composition(group('g.f', [['occupation', 'nov_occ_fisher']])),
    rules: [rule('nov_occ_fisher', 1_000_000)] });
  assert.equal(owned.people.length, 1);
  assert.equal(owned.people[0].origin, 'composition');
  assert.equal(decide({ rules: [{ ...rule('nov_occ_fisher', 1_000_000), subject_kind: 'category' }] }).people.length, 0,
    'category rules stay with the wildlife owner');
});

test('people beyond the place capacity are not created and are reported', () => {
  const comp = composition(group('g.a', [['occupation', 'nov_occ_household_servant']], 3));
  const result = decide({ composition: comp, capacity: 2 });
  assert.equal(result.people.length, 2);
  assert.deepEqual(result.gaps.map((gap) => gap.code), ['people_position_capacity']);
});

// compile: canonical place, the regional context applies by g4_ref alone (Q3)
const row = (id, profile_kind, payload) => ({ id, version: 1, profile_kind, status: 'approved',
  world_revision_id: 'world', canonical_digest: canonicalDigest(payload), payload });
function compileInput({ regionalApplicability } = {}) {
  const g4 = ref('g4'); const canonical = ref('cg5');
  const shared = [row('body', 'body', binding.body_profile), row('activity', 'activity', bundle.temporal_records[0]),
    row('routine', 'routine', { status: 'approved', profile_id: 'routine' }),
    row('clothing', 'clothing', { status: 'approved', id: 'clothing', version: 1 })];
  const worker = row('worker', 'npc_binding', { profile_level: 'background', actor_profile_rule_ref: 'worker',
    demographic_profile_ref: 'demo', appearance_profile_ref: 'look', body_profile_ref: ref('body'),
    activity_profile_ref: ref('activity'), routine_profile_ref: ref('routine'), clothing_profile_ref: ref('clothing'),
    runtime_profile_refs: shared.map((item) => ref(item.id)), regional_context_refs: [ref('regional')],
    initial_equipment_templates: [], observable_activity: binding.observable_activity });
  worker.role_ref = 'role'; worker.occupation_ref = 'occupation';
  const regional = row('regional', null, { id: 'regional', version: 1, status: 'approved', world_revision_id: 'world',
    applicability: regionalApplicability ?? [{ g4_ref: g4 }], gameplay_weight: 1, language_status: 'unknown',
    language_repertoire: null });
  return { party_id: 'party', run_id: 'run', world_catalog_digest: 'f'.repeat(64), equipment_catalog_digest: 'd'.repeat(64),
    equipment_activation: { status: 'active' }, actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile,
    approved_bundle: bundle, environment,
    closure: { schema: 'rus.place_people_binding_bundle.v1', world_revision_id: 'world', g4_ref: g4, canonical_g5_ref: canonical,
      composition_ref: { id: 'pf_test', version: 1, canonical_digest: 'c'.repeat(64) },
      placement_policy: { status: 'approved', position_slot_order: ['focus', 'departure'], reserved_position_slots: ['arrival'],
        allowed_physical_class_ids: ['spatial.g6.open'], empty_context_rules: [] },
      runtime_profiles: [worker, ...shared], regional_context_profiles: [regional] },
    people: [{ ordinal: 0, group_key: 'pf_test.a', profile_ref: ref('worker') }, { ordinal: 1, group_key: 'pf_test.a', profile_ref: ref('worker') }],
    scene: { party_id: 'party', site_id: 'canonical-site', rows: [
      { target_table: 'party_g6_instances', id: 'g6', record: { party_id: 'party', status: 'active',
        physical_class_id: 'spatial.g6.open', host_kind: 'g5_site' } },
      ...['arrival', 'departure', 'focus'].map((slot) => ({ target_table: 'scene_position_nodes', id: slot,
        record: { party_id: 'party', status: 'active', template_slot_key: slot, g6_instance_id: 'g6', capacity: 1 } }))] } };
}

test('compilePlacePeopleBindings binds decided people to focus/departure of a canonical place, never to arrival', () => {
  const result = compilePlacePeopleBindings(compileInput());
  assert.deepEqual(result.npc_inputs.map((value) => value.position_id), ['focus', 'departure']);
  const [first] = result.npc_inputs;
  assert.deepEqual(first.binding.canonical_g5_ref, ref('cg5'));
  assert.equal(first.binding.generation_template_ref, undefined);
  assert.equal(first.binding.location_profile_ref, 'pf_test');
  assert.deepEqual(first.binding.source_binding.npc_composition_ref, { id: 'pf_test', version: 1 });
  assert.equal(first.binding.actor_slot_ref, 'canonical-site:npc:0');
  assert.deepEqual(compilePlacePeopleBindings(compileInput()).npc_inputs.map((value) => value.binding.parent_seed_digest),
    result.npc_inputs.map((value) => value.binding.parent_seed_digest));
});

test('compilePlacePeopleBindings takes a regional context only when its applicability names this G4 without a canonical or template scope', () => {
  const tied = [{ g4_ref: ref('g4'), generation_template_ref: ref('template') }];
  assert.throws(() => compilePlacePeopleBindings(compileInput({ regionalApplicability: tied })),
    (error) => error.code === 'NPC_COMPOSITION_REGIONAL_CONTEXT_GAP');
  const other = [{ g4_ref: ref('other-g4') }];
  assert.throws(() => compilePlacePeopleBindings(compileInput({ regionalApplicability: other })),
    (error) => error.code === 'NPC_COMPOSITION_REGIONAL_CONTEXT_GAP');
});
