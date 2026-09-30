import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomSource, materializeApprovedProceduralNpc } from '../src/index.js';
import { binding, bundle, environment } from './fixtures/approved-procedural-npc.js';

const CONTEXT = 'ctx-novgorod';
const name = (id, form, sex, people = 'pp_novgorod_rus') => ({ id, name_pool_id: 'pool', name_form: form,
  weight: 1, sex_category: sex, people_ref: people });
const scale = (kind, ids) => ids.map((id) => ({ scale_kind: kind, entry_id: id, label_ru: `ярлык ${id}`, weight: 1 }));
const item = (kind, n) => ({ occupation_id: 'occupation', item_kind: kind, item_id: `${kind}_${n}`,
  text_ru: `${kind} ${n}` });
const identityCatalog = (patch = {}) => ({ schema: 'rus.npc_identity_catalog.v1',
  name_bindings: [{ regional_context_id: CONTEXT, name_pool_id: 'pool', people_ref: 'pp_novgorod_rus' }],
  name_entries: [name('m1', 'Ярослав', 'male'), name('m2', 'Гюрята', 'male'), name('m3', 'Твердислав', 'male'),
    name('f1', 'Анастасия', 'female'), name('f2', 'Акулина', 'female'),
    name('g1', 'Хартвиг', 'male', 'pp_fg002')],
  scale_entries: [...scale('trait', ['calm', 'wary', 'trusting', 'sociable', 'diligent', 'impulsive']),
    ...scale('value', ['kin_loyalty', 'honour', 'hospitality', 'elder_respect', 'responsibility', 'safety', 'piety'])],
  character_items: [item('goal', 1), item('goal', 2), item('goal', 3), item('fear', 1), item('fear', 2)],
  ...patch });
const withSex = (sex) => {
  const copy = structuredClone(bundle);
  copy.actor_profiles.universal_categories.find((row) => row.facet === 'sex_category').stable_code = sex;
  return copy;
};
const g4 = { world_revision_id: 'world', id: 'g4', version: 1 };
const template = { id: 'template', version: 1 };
const regional = (id) => ({ schema: 'rus.npc_regional_context_profile.v1', id, version: 1, status: 'approved',
  world_revision_id: 'world', allowed_role_refs: ['role'], allowed_occupation_refs: ['occupation'],
  applicability: [{ g4_ref: g4, generation_template_ref: template }],
  origin: { label: id, directness: 'analogical', confidence: 'low', source_refs: ['src'] },
  language_status: 'unknown', language_repertoire: null });
const run = (patch = {}, { catalog = identityCatalog(), sourceBundle = bundle, context = CONTEXT } = {}) =>
  materializeApprovedProceduralNpc({ party_id: 'party', run_id: 'run', environment,
    binding: { ...binding, regional_context_ref: { id: context, version: 1 }, g4_ref: g4,
      generation_template_ref: template, ...patch },
    approved_bundle: { ...sourceBundle, regional_context_profiles: [regional(context)],
      ...(catalog ? { npc_identity: catalog } : {}) },
    random: createRandomSource({ seed: 42 }) });

test('without an identity catalog the NPC stays unnamed and has no character (legacy bundle)', () => {
  const npc = materializeApprovedProceduralNpc({ party_id: 'party', run_id: 'run', binding,
    approved_bundle: bundle, environment, random: createRandomSource({ seed: 42 }) }).npc;
  assert.equal(npc.identity_state.canonical_name, undefined);
  assert.equal(npc.semantic_state.character, undefined);
});

test('name is deterministic, matches sex and people, and comes from the pool', () => {
  const left = run().npc;
  const right = run().npc;
  assert.deepEqual(left.identity_state, right.identity_state);
  assert.ok(['Ярослав', 'Гюрята', 'Твердислав'].includes(left.identity_state.canonical_name), 'male Novgorod form');
  assert.deepEqual(Object.keys(left.identity_state.name_provenance).sort(), ['entry_id', 'people_ref', 'pool_id']);
  const female = run({}, { sourceBundle: withSex('female') }).npc;
  assert.equal(female.identity_state.sex_category, 'female');
  assert.ok(['Анастасия', 'Акулина'].includes(female.identity_state.canonical_name), 'female form');
});

test('different actor seeds spread over the pool and never leave the filtered candidates', () => {
  const seen = new Set();
  for (let index = 0; index < 40; index += 1) {
    const npc = run({ parent_seed_digest: index.toString(16).padStart(64, '0') }).npc;
    seen.add(npc.identity_state.canonical_name);
  }
  assert.deepEqual([...seen].sort(), ['Гюрята', 'Твердислав', 'Ярослав']);
});

test('a context without a name binding, or without candidates, is unnamed with a typed reason', () => {
  const unbound = run({}, { context: 'ctx-gotland' }).npc;
  assert.equal(unbound.identity_state.canonical_name, null);
  assert.deepEqual(unbound.identity_state.name_provenance, { reason: 'no_pool_binding' });
  const empty = run({}, { catalog: identityCatalog({ name_entries: [name('f1', 'Анастасия', 'female')] }) }).npc;
  assert.equal(empty.identity_state.canonical_name, null);
  assert.deepEqual(empty.identity_state.name_provenance, { reason: 'no_candidates' });
  const noContext = materializeApprovedProceduralNpc({ party_id: 'party', run_id: 'run', environment, binding,
    approved_bundle: { ...bundle, npc_identity: identityCatalog() }, random: createRandomSource({ seed: 42 }) }).npc;
  assert.equal(noContext.identity_state.canonical_name, null);
});

test('name and character do not consume the appearance random stream', () => {
  const plain = materializeApprovedProceduralNpc({ party_id: 'party', run_id: 'run', binding, environment,
    approved_bundle: bundle, random: createRandomSource({ seed: 42 }) });
  const named = run();
  assert.deepEqual(named.choices, plain.choices);
  for (const key of ['sex_category', 'age_category', 'appearance']) {
    assert.deepEqual(named.npc.identity_state[key], plain.npc.identity_state[key]);
  }
});

test('character has the agreed shape, labels from the scales and goals/fear of the occupation', () => {
  const { character } = run().npc.semantic_state;
  assert.deepEqual(Object.keys(character).sort(), ['fear_ru', 'goals_ru', 'temperament_label_ru',
    'temperament_ref', 'value_labels_ru', 'value_refs']);
  assert.equal(character.temperament_label_ru, `ярлык ${character.temperament_ref}`);
  assert.equal(character.value_refs.length, 2);
  assert.notEqual(character.value_refs[0], character.value_refs[1]);
  assert.deepEqual(character.value_labels_ru, character.value_refs.map((id) => `ярлык ${id}`));
  assert.ok(character.goals_ru.length >= 1 && character.goals_ru.length <= 2);
  assert.equal(new Set(character.goals_ru).size, character.goals_ru.length);
  for (const goal of character.goals_ru) assert.match(goal, /^goal \d$/u);
  assert.match(character.fear_ru, /^fear \d$/u);
  assert.deepEqual(run().npc.semantic_state.character, character);
});

test('goal count spans 1 and 2 across seeds and is capped by the available goals', () => {
  const counts = new Set();
  for (let index = 0; index < 40; index += 1) {
    counts.add(run({ parent_seed_digest: index.toString(16).padStart(64, '0') })
      .npc.semantic_state.character.goals_ru.length);
  }
  assert.deepEqual([...counts].sort(), [1, 2]);
  const single = run({}, { catalog: identityCatalog({ character_items: [item('goal', 1), item('fear', 1)] }) });
  assert.deepEqual(single.npc.semantic_state.character.goals_ru, ['goal 1']);
});

test('character is not written when the occupation lacks goals or fears, or the scales are incomplete', () => {
  for (const patch of [{ character_items: [item('goal', 1)] }, { character_items: [item('fear', 1)] },
    { character_items: [] }, { scale_entries: scale('trait', ['calm']) },
    { scale_entries: [...scale('trait', ['calm']), ...scale('value', ['honour'])] }]) {
    const npc = run({}, { catalog: identityCatalog(patch) }).npc;
    assert.equal(npc.semantic_state.character, undefined, JSON.stringify(patch).slice(0, 60));
    assert.equal(typeof npc.identity_state.canonical_name, 'string');
  }
});
