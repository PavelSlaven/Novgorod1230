import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalDigest, createRandomSource, deriveSeed, materializeApprovedProceduralNpc
} from '../src/index.js';
import { binding, bundle, environment } from './fixtures/approved-procedural-npc.js';

const contextId = 'ctx-name-trace-details';
const poolId = 'name-trace-details';
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
const name = (id, nameForm, weight = 1, patch = {}) => ({
  id, name_form: nameForm, name_pool_id: poolId, people_ref: peopleRef,
  sex_category: 'male', weight, ...patch
});
const irrelevant = [
  name('other-pool', 'Добрыня', 17, { name_pool_id: 'other-pool' }),
  name('other-people', 'Хартвиг', 19, { people_ref: 'pp_fg002' }),
  name('other-sex', 'Акулина', 23, { sex_category: 'female' })
];
const catalog = (entries, nameBindings = [{ regional_context_id: contextId,
  name_pool_id: poolId, people_ref: peopleRef }]) => ({
  schema: 'rus.npc_identity_catalog.v1', name_bindings: nameBindings,
  name_entries: entries, scale_entries: [], character_items: []
});
function run(identityCatalog, occupiedNames = [], actorSlot = binding.actor_slot_ref) {
  return materializeApprovedProceduralNpc({
    party_id: 'party', run_id: 'run', environment, occupied_names: occupiedNames,
    binding: { ...binding, actor_slot_ref: actorSlot,
      regional_context_ref: { id: contextId, version: 1 }, g4_ref: g4, generation_template_ref: template },
    approved_bundle: { ...bundle, regional_context_profiles: [regionalContext],
      ...(identityCatalog ? { npc_identity: identityCatalog } : {}) },
    random: createRandomSource({ seed: 42 })
  });
}
function nameChoice(result, actorSlot = binding.actor_slot_ref) {
  const found = result.choices.filter((choice) => choice.choice_key === `npc:${actorSlot}:name`);
  assert.equal(found.length, 1, 'each actual name draw has exactly one name choice');
  return found[0];
}
function assertTrace(result, candidates, summary, actorSlot = binding.actor_slot_ref) {
  const sorted = [...candidates].sort((left, right) => left.id.localeCompare(right.id));
  const ids = sorted.map((entry) => entry.id);
  const random = createRandomSource({ seed: deriveSeed({
    parent_seed_digest: binding.parent_seed_digest, actor_slot_ref: actorSlot, domain: 'name'
  }).uint32 });
  const draw = random.nextUint32();
  let point = draw % sorted.reduce((sum, entry) => sum + entry.weight, 0);
  const selected = sorted.find((entry) => {
    point -= entry.weight;
    return point < 0;
  });
  const choice = nameChoice(result, actorSlot);
  assert.equal(choice.slot_key, 'name');
  assert.deepEqual(choice.candidate_ids, ids);
  assert.equal(choice.candidate_digest, canonicalDigest(ids));
  assert.equal(choice.candidate_set_digest, choice.candidate_digest);
  assert.equal(choice.selected_id, selected.id);
  assert.equal(choice.selected_weight, selected.weight);
  assert.equal(choice.rng_draw, draw, 'trace records the original name-stream draw');
  assert.equal(choice.rng_counter, random.drawCount);
  assert.equal(choice.rng_counter, 1);
  assert.deepEqual(choice.rejection_summary, summary);
  const baseline = run(null, [], actorSlot);
  assert.deepEqual(result.choices.filter((entry) => entry !== choice), baseline.choices,
    'appearance choices and counters remain unchanged');
  assert.equal(choice.choice_ordinal, baseline.choices.length);
  assert.deepEqual(result.npc.identity_state, {
    ...baseline.npc.identity_state, canonical_name: selected.name_form,
    name_provenance: { pool_id: selected.name_pool_id, entry_id: selected.id,
      people_ref: selected.people_ref, ...(summary.reason ? { reason: summary.reason } : {}) }
  }, 'identity and provenance contain only the original name fields, without trace');
  return choice;
}

test('issue #601: occupied duplicate forms count by entry and trace uses sorted effective candidates', () => {
  const free = [name('free-z', 'Велимир', 7), name('free-a', 'Гюрята', 3)];
  const entries = [free[0], name('taken-z', 'Сокол', 11), ...irrelevant,
    free[1], name('taken-a', 'Сокол', 5)];
  const identityCatalog = catalog(entries);
  const occupiedNames = ['Сокол', 'Сокол', 'Неизвестное имя'];
  const originalCatalog = structuredClone(identityCatalog);
  const originalOccupied = [...occupiedNames];
  const result = run(identityCatalog, occupiedNames);
  assertTrace(result, free, { rejected_count: 5, inapplicable_count: 3, occupied_name_count: 2 });
  assert.deepEqual(run(identityCatalog, occupiedNames), result, 'same input repeats identity and trace');
  assert.deepEqual(identityCatalog, originalCatalog, 'caller catalog is not mutated');
  assert.deepEqual(occupiedNames, originalOccupied, 'caller occupied-name list is not mutated');
});

test('issue #601: digest changes with effective membership, not irrelevant occupied forms or input order', () => {
  const eligible = [name('a', 'Гюрята', 2), name('b', 'Ярослав', 5), name('c', 'Твердислав', 9)];
  const entries = [...eligible, ...irrelevant];
  const plain = run(catalog(entries));
  const plainChoice = assertTrace(plain, eligible,
    { rejected_count: 3, inapplicable_count: 3, occupied_name_count: 0 });
  const excluded = run(catalog(entries), ['Ярослав']);
  const excludedChoice = assertTrace(excluded, [eligible[0], eligible[2]],
    { rejected_count: 4, inapplicable_count: 3, occupied_name_count: 1 });
  assert.notEqual(excludedChoice.candidate_digest, plainChoice.candidate_digest);
  const irrelevantOccupied = run(catalog([...entries].reverse()), ['Акулина', 'Хартвиг', 'Добрыня']);
  assert.deepEqual(nameChoice(irrelevantOccupied), plainChoice);
  assert.deepEqual(irrelevantOccupied.npc.identity_state, plain.npc.identity_state);
});

test('issue #601: exhaustion traces the restored applicable pool using the same single weighted draw', () => {
  const eligible = [name('c', 'Твердислав', 7), name('a', 'Гюрята', 1), name('b', 'Ярослав', 3)];
  const identityCatalog = catalog([...irrelevant, ...eligible]);
  const plain = run(identityCatalog);
  const plainChoice = assertTrace(plain, eligible,
    { rejected_count: 3, inapplicable_count: 3, occupied_name_count: 0 });
  const occupiedNames = eligible.map((entry) => entry.name_form);
  const exhausted = run(identityCatalog, occupiedNames);
  const exhaustedChoice = assertTrace(exhausted, eligible, {
    rejected_count: 3, inapplicable_count: 3, occupied_name_count: 3, reason: 'scene_pool_exhausted'
  });
  assert.equal(exhaustedChoice.candidate_digest, plainChoice.candidate_digest);
  assert.equal(exhaustedChoice.rng_draw, plainChoice.rng_draw);
  assert.equal(exhaustedChoice.selected_id, plainChoice.selected_id);
  assert.equal(exhausted.npc.identity_state.canonical_name, plain.npc.identity_state.canonical_name);
  assert.deepEqual(run(identityCatalog, occupiedNames), exhausted);
});

test('issue #601: different actor streams retain the original weighted selection and one draw', () => {
  const eligible = [name('c', 'Твердислав', 13), name('a', 'Гюрята', 1), name('b', 'Ярослав', 5)];
  const identityCatalog = catalog(eligible);
  for (const actorSlot of ['worker:1', 'worker:2', 'worker:3', 'worker:4']) {
    const result = run(identityCatalog, [], actorSlot);
    assertTrace(result, eligible,
      { rejected_count: 0, inapplicable_count: 0, occupied_name_count: 0 }, actorSlot);
    assert.deepEqual(run(identityCatalog, [], actorSlot), result);
  }
});

test('issue #601: missing catalog, binding and applicable candidates produce no fake name choice', () => {
  const baseline = run(null);
  const cases = [
    { identityCatalog: null },
    { identityCatalog: catalog([name('a', 'Ярослав')], []), reason: 'no_pool_binding' },
    { identityCatalog: catalog([]), reason: 'no_candidates' },
    { identityCatalog: catalog(irrelevant), reason: 'no_candidates' }
  ];
  for (const { identityCatalog, reason } of cases) {
    const result = run(identityCatalog, ['Ярослав']);
    assert.deepEqual(result.choices, baseline.choices, 'nameless branch adds no choice or appearance draw');
    assert.deepEqual(result.npc.identity_state, {
      ...baseline.npc.identity_state,
      ...(reason ? { canonical_name: null, name_provenance: { reason } } : {})
    });
    assert.deepEqual(run(identityCatalog, ['Ярослав']), result);
  }
});
