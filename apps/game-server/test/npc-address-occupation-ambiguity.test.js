import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { materializeNpcRelationshipRules } from '@rus/materialization';

const projectionUrl = process.env.NPC_ADDRESS_PROJECTION_MODULE
  ? pathToFileURL(process.env.NPC_ADDRESS_PROJECTION_MODULE).href
  : new URL('../src/runtime/lower-dvina-trace-m2-conversation-projections.js',
    import.meta.url).href;
const { interlocutorSpeechProjection } = await import(projectionUrl);
const root = new URL('../../../', import.meta.url);
const wave = 'data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/';
const readWave = async (name) => JSON.parse(await readFile(
  new URL(wave + name, root), 'utf8'));
const [rules, compositions] = await Promise.all([
  readWave('npc_relationship_materialization_rules.json'),
  readWave('place_population_composition_rules.json')
]);
const spouseRule = rules.find(({ rule_id }) =>
  rule_id === 'rel_composition_spouse_2dc90533f844af8e');
const household = compositions.find(({ composition_id }) =>
  composition_id === 'pf_peasant_homestead');
const occupation = 'nov_occ_fisher';
assert.ok(spouseRule && household);

function actor(id, role) {
  return {
    instance_id: id,
    ref: { entity_kind: 'npc', entity_id: id },
    identity_state: { canonical_name: id },
    machine_state: { status: 'active' },
    role_ref: { id: role },
    semantic_state: { relationships: [] },
    relationships: []
  };
}

function materializedPair() {
  const compositionRef = {
    id: household.composition_id,
    version: household.composition_version,
    world_revision_id: household.world_revision_id
  };
  const composition = {
    place_family_id: household.place_family_id,
    place_family_version: household.place_family_version,
    composition_ref: compositionRef,
    population_groups: structuredClone(household.population_groups),
    slot_relationships: structuredClone(
      household.authoring_payload.slot_relationships)
  };
  const husband = actor('npc:husband', spouseRule.subject_role_ref);
  const wife = actor('npc:wife', spouseRule.object_role_ref);
  husband.semantic_state.source_binding = {
    world_revision_id: household.world_revision_id,
    canonical_g5_ref: { id: 'fixture:household', version: 1 },
    place_family_id: household.place_family_id,
    group_id: 'pf_peasant_homestead.householder',
    place_population_composition_ref: structuredClone(compositionRef)
  };
  wife.semantic_state.source_binding = {
    world_revision_id: household.world_revision_id,
    canonical_g5_ref: { id: 'fixture:household', version: 1 },
    place_family_id: household.place_family_id,
    group_id: 'pf_peasant_homestead.mistress',
    place_population_composition_ref: structuredClone(compositionRef)
  };
  const result = materializeNpcRelationshipRules({
    rules: [spouseRule], compositions: [composition], npcs: [husband, wife]
  });
  assert.equal(result.relations.length, 1);
  return {
    husband: result.npcs.find(({ instance_id }) => instance_id === husband.instance_id),
    wife: result.npcs.find(({ instance_id }) => instance_id === wife.instance_id)
  };
}

// Synthetic, valid selection rows; they are not catalog entries.
function occupationForm(form_id, form_ru) {
  return {
    form_id: `TEST:${form_id}`, status: 'approved', channel: 'oral',
    relationship_kind: 'spouse', speaker_role_ref: null,
    addressee_role_ref: occupation, speaker_ref: null, addressee_ref: null,
    register_ref: null, form_ru,
    situation: 'Изолированная тестовая форма',
    payload: { test_fixture: true, no_source: '' }
  };
}

const tiedForms = [
  occupationForm('occupation-short', 'Рыбак'),
  occupationForm('occupation-polite', 'Добрый рыбак')
];

function roleForm() {
  return { ...occupationForm('role-fallback', 'Хозяин'),
    addressee_role_ref: spouseRule.subject_role_ref };
}

function project(wife, husband, forms) {
  const context = {
    targetActor: wife,
    targetRef: wife.ref,
    actualNpcActors: [wife, husband],
    state: {},
    npcSpeechAddressForms: forms,
    npcSpeechRegisters: []
  };
  return interlocutorSpeechProjection(context,
    { speaker_ref: husband.ref }, { speaker_ref: husband.ref });
}

test('materialized D-2 source still rejects tied occupation addresses in either row order', () => {
  const { wife, husband } = materializedPair();
  wife.occupation_ref = { id: occupation };
  husband.occupation_ref = { id: occupation };
  const source = wife.semantic_state.relationships.find(({ target_actor_id }) =>
    target_actor_id === husband.instance_id);
  assert.equal(source.kind, 'spouse');
  assert.equal(source.source_rule_ref.id, spouseRule.rule_id);
  assert.ok(source.source_rule_ref.version > 0);

  for (const forms of [tiedForms, [...tiedForms].reverse()]) {
    assert.equal(project(wife, husband, forms)?.address, undefined,
      'equal occupation forms remain ambiguous with valid D-2 knowledge');
  }
});

test('without the materialized source, the role fallback remains available', () => {
  const { wife, husband } = materializedPair();
  wife.occupation_ref = { id: occupation };
  husband.occupation_ref = { id: occupation };
  for (const edges of [wife.relationships, wife.semantic_state.relationships]) {
    for (const edge of edges) delete edge.source_rule_ref;
  }

  const forms = [...tiedForms, roleForm()];
  for (const ordered of [forms, [...forms].reverse()]) {
    const projected = project(wife, husband, ordered);
    assert.equal(projected?.relation, 'они супруги',
      'the known relationship remains available without occupation knowledge');
    assert.equal(projected?.address, 'Хозяин',
      'without source knowledge the role form is used instead of occupation');
  }
});
