import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalDigest, createRandomSource, deriveSeed, materializeApprovedProceduralNpc
} from '../src/index.js';
import { binding, bundle, environment } from './fixtures/approved-procedural-npc.js';

const contextId = 'ctx-name-trace';
const poolId = 'name-trace-pool';
const peopleRef = 'pp_novgorod_rus';
const g4 = { world_revision_id: 'world', id: 'g4', version: 1 };
const template = { id: 'template', version: 1 };
const regionalContext = {
  schema: 'rus.npc_regional_context_profile.v1', id: contextId, version: 1,
  status: 'approved', world_revision_id: 'world', allowed_role_refs: ['role'],
  allowed_occupation_refs: ['occupation'],
  applicability: [{ g4_ref: g4, generation_template_ref: template }],
  origin: { label: 'Новгородская земля', directness: 'analogical', confidence: 'low', source_refs: ['src'] },
  language_status: 'unknown', language_repertoire: null
};
const nameEntry = (id, nameForm, weight, patch = {}) => ({
  id, name_form: nameForm, name_pool_id: poolId, people_ref: peopleRef,
  sex_category: 'male', weight, ...patch
});
const irrelevantEntries = [
  nameEntry('other-pool', 'Добрыня', 17, { name_pool_id: 'other-pool' }),
  nameEntry('other-people', 'Хартвиг', 19, { people_ref: 'pp_fg002' }),
  nameEntry('other-sex', 'Анастасия', 23, { sex_category: 'female' })
];
const catalog = (entries) => ({
  schema: 'rus.npc_identity_catalog.v1',
  name_bindings: [{ regional_context_id: contextId, name_pool_id: poolId, people_ref: peopleRef }],
  name_entries: entries, scale_entries: [], character_items: []
});
const run = (identityCatalog) => materializeApprovedProceduralNpc({
  party_id: 'party', run_id: 'run', environment,
  binding: { ...binding, regional_context_ref: { id: contextId, version: 1 },
    g4_ref: g4, generation_template_ref: template },
  approved_bundle: { ...bundle, regional_context_profiles: [regionalContext],
    ...(identityCatalog ? { npc_identity: identityCatalog } : {}) },
  random: createRandomSource({ seed: 42 })
});

function nameChoice(result) {
  const choices = result.choices.filter((choice) =>
    choice.selected_id === result.npc.identity_state.name_provenance.entry_id);
  assert.equal(choices.length, 1,
    'issue #601: selected NPC name must have exactly one trace in materializer choices');
  return choices[0];
}

test('ожидаемо красный, issue #601: name choice traces the applicable pool and the original single draw', () => {
  const applicable = [nameEntry('m3', 'Твердислав', 9), nameEntry('m1', 'Ярослав', 2),
    nameEntry('m2', 'Гюрята', 5)].sort((left, right) => left.id.localeCompare(right.id));
  const result = run(catalog([applicable[2], ...irrelevantEntries, applicable[0], applicable[1]]));
  const choice = nameChoice(result);

  for (const key of ['choice_key', 'candidate_digest', 'selected_id', 'rng_counter',
    'selected_weight', 'rejection_summary']) {
    assert.ok(Object.hasOwn(choice, key), `D-007 requires ${key} in the name choice`);
  }
  assert.equal(typeof choice.choice_key, 'string');
  assert.ok(choice.choice_key.trim().length > 0);
  assert.equal(choice.candidate_digest, canonicalDigest(applicable.map((entry) => entry.id)));
  assert.ok(choice.rejection_summary && typeof choice.rejection_summary === 'object'
    && !Array.isArray(choice.rejection_summary), 'name choice must retain an exclusion summary');
  assert.ok(Object.keys(choice.rejection_summary).length > 0, 'exclusion summary must contain data');

  const nameRandom = createRandomSource({ seed: deriveSeed({
    parent_seed_digest: binding.parent_seed_digest, actor_slot_ref: binding.actor_slot_ref, domain: 'name'
  }).uint32 });
  let point = nameRandom.nextUint32() % applicable.reduce((sum, entry) => sum + entry.weight, 0);
  const selected = applicable.find((entry) => {
    point -= entry.weight;
    return point < 0;
  });
  assert.equal(choice.selected_id, selected.id, 'trace must describe the original weighted name draw');
  assert.equal(result.npc.identity_state.name_provenance.entry_id, selected.id);
  assert.equal(result.npc.identity_state.canonical_name, selected.name_form);
  assert.equal(choice.selected_weight, selected.weight);
  assert.equal(choice.rng_counter, 1, 'name stream consumes exactly one draw');
  assert.equal(choice.rng_counter, nameRandom.drawCount);

  const baseline = run();
  assert.deepEqual(result.choices.filter((entry) => entry !== choice), baseline.choices,
    'adding name trace must preserve the appearance choices and their RNG counters');
  for (const key of ['sex_category', 'age_category', 'appearance']) {
    assert.deepEqual(result.npc.identity_state[key], baseline.npc.identity_state[key]);
  }
});

test('ожидаемо красный, issue #601: only changes to the applicable name pool change its digest', () => {
  const firstEntry = nameEntry('eligible-a', 'Ярослав', 3);
  const replacementEntry = nameEntry('eligible-b', 'Ярослав', 3);
  const first = run(catalog([firstEntry]));
  const firstChoice = nameChoice(first);
  const replacement = run(catalog([replacementEntry]));
  const replacementChoice = nameChoice(replacement);

  assert.equal(firstChoice.selected_id, firstEntry.id);
  assert.equal(replacementChoice.selected_id, replacementEntry.id);
  assert.equal(first.npc.identity_state.canonical_name, replacement.npc.identity_state.canonical_name);
  assert.equal(firstChoice.candidate_digest, canonicalDigest([firstEntry.id]));
  assert.equal(replacementChoice.candidate_digest, canonicalDigest([replacementEntry.id]));
  assert.notEqual(firstChoice.candidate_digest, replacementChoice.candidate_digest,
    'a different applicable entry must change the digest even when its displayed name is unchanged');
  assert.deepEqual(nameChoice(run(catalog([firstEntry]))), firstChoice, 'identical input must repeat its trace');

  const withIrrelevant = run(catalog([irrelevantEntries[2], firstEntry, ...irrelevantEntries.slice(0, 2)]));
  const irrelevantChoice = nameChoice(withIrrelevant);
  assert.equal(irrelevantChoice.candidate_digest, firstChoice.candidate_digest,
    'entries outside the selected pool, people or sex must not affect the applicable-pool digest');
  assert.equal(irrelevantChoice.selected_id, firstChoice.selected_id);
  assert.deepEqual(withIrrelevant.npc.identity_state, first.npc.identity_state);
});
