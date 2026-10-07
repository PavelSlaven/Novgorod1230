import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { materializeNpcRelationshipRules } from '@rus/materialization';
import { interlocutorSpeechProjection } from '../src/runtime/lower-dvina-trace-m2-conversation-projections.js';
import { buildLowerDvinaTracePersistedProjection } from '../../../packages/new-game/src/stages/stage-24-party-db-write-plan/code/lower-dvina-trace-persisted-projection.js';

// D102, sol-authored before implementation. No model calls or database ports.
// Real catalog rows are used verbatim; P and suffix parser cases are explicit TEST fixtures.
const root = new URL('../../../', import.meta.url);
const wave = 'data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/';
const json = async (name) => JSON.parse(await readFile(new URL(wave + name, root), 'utf8'));
const forms = await json('speech_address_forms.json');
const rules = await json('npc_relationship_materialization_rules.json');
const source = (await json('place_population_composition_rules.json'))
  .find((row) => row.composition_id === 'pf_peasant_homestead');
const rule = rules.find((row) => row.rule_id === 'rel_composition_spouse_2dc90533f844af8e');
const ruleRef = { id: rule.rule_id, version: rule.rule_version };
const spouse = forms.find((row) => row.form_id === 'form_spouse_smerd');
const bishop = forms.find((row) => row.form_id === 'form_bishop');
const genericSpouse = forms.find((row) => row.form_id === 'form_spouse');
for (const row of [source, rule, spouse, bishop, genericSpouse]) assert.equal(row.status, 'approved');
const registry = async (name) => new Set((await readFile(new URL('data/novgorod-region/' + name, root), 'utf8'))
  .trim().split(/\r?\n/u).slice(1).map((line) => line.split('\t')[0]));
const roles = await registry('novgorod_social_roles_v1_enriched.tsv');
const occupations = await registry('novgorod_occupations_v1_enriched.tsv');
const ref = (id) => ({ entity_kind: 'npc', entity_id: id });

function actor(id, role = 'nov_role_fisher', occupation = 'nov_occ_fisher') {
  assert.ok(roles.has(role), `fixture role must exist: ${role}`);
  if (occupation != null) assert.ok(occupations.has(occupation), `fixture occupation must exist: ${occupation}`);
  return { instance_id: id, ref: ref(id), identity_state: { canonical_name: id === 'wife' ? 'Офимья' : 'Гюрята' },
    role_ref: { id: role }, ...(occupation == null ? {} : { occupation_ref: { id: occupation } }),
    machine_state: { status: 'active' }, relationships: [], semantic_state: { relationships: [] } };
}

function materializationInput() {
  const composition = { place_family_id: source.place_family_id, place_family_version: source.place_family_version,
    composition_ref: { id: source.composition_id, version: source.composition_version, world_revision_id: source.world_revision_id },
    population_groups: structuredClone(source.population_groups),
    slot_relationships: structuredClone(source.authoring_payload.slot_relationships) };
  const npcs = [actor('husband', rule.subject_role_ref, null), actor('wife', rule.object_role_ref, null)];
  for (const [index, npc] of npcs.entries()) npc.semantic_state.source_binding = {
    world_revision_id: source.world_revision_id, canonical_g5_ref: { id: 'fixture:household', version: 1 },
    place_family_id: source.place_family_id,
    group_id: index === 0 ? 'pf_peasant_homestead.householder' : 'pf_peasant_homestead.mistress',
    place_population_composition_ref: structuredClone(composition.composition_ref)
  };
  return { rules: [structuredClone(rule)], compositions: [composition], npcs };
}

function project(speaker, addressee, rows) {
  const context = { targetActor: speaker, targetRef: speaker.ref, actualNpcActors: [speaker, addressee],
    state: {}, npcSpeechAddressForms: rows, npcSpeechRegisters: [] };
  const before = structuredClone(context);
  const result = interlocutorSpeechProjection(context, { speaker_ref: addressee.ref }, { speaker_ref: addressee.ref });
  assert.deepEqual(context, before, 'speech projection must not mutate actors or catalog rows');
  if (result != null) {
    assert.ok(Object.keys(result).every((key) => ['relation', 'address', 'register'].includes(key)));
    assert.doesNotMatch(JSON.stringify(result), /rel_|nov_role_|nov_occ_|source_rule_ref|entity_id|only for/u,
      'source and selection keys stay internal');
  }
  return result;
}

function spousePair(sourceRef) {
  const wife = actor('wife', spouse.speaker_role_ref, null);
  const husband = actor('husband', spouse.addressee_role_ref, null);
  wife.semantic_state.relationships.push({ target_actor_id: husband.instance_id, kind: 'spouse',
    ...(sourceRef === undefined ? {} : { source_rule_ref: structuredClone(sourceRef) }) });
  return [wife, husband];
}

test('D102 source: real materializer copies the chosen ref to both reciprocal outgoing projections', () => {
  const input = materializationInput();
  const before = structuredClone(input);
  const result = materializeNpcRelationshipRules(input);
  assert.deepEqual(input, before, 'materializer must not mutate inputs');
  assert.equal(result.relations.length, 1);
  assert.deepEqual(result.relations[0].state.source_rule_ref, ruleRef);
  for (const npc of result.npcs) for (const edges of [npc.relationships, npc.semantic_state.relationships]) {
    assert.equal(edges.length, 1);
    assert.deepEqual(edges[0], { target_actor_id: result.npcs.find((other) => other.instance_id !== npc.instance_id).instance_id,
      kind: 'spouse', source_rule_ref: ruleRef });
  }
});

test('D102 source: materialized spouse uses the unchanged real restricted form', () => {
  const result = materializeNpcRelationshipRules(materializationInput());
  const wife = result.npcs.find((npc) => npc.instance_id === 'wife');
  const husband = result.npcs.find((npc) => npc.instance_id === 'husband');
  assert.equal(project(wife, husband, [spouse])?.address, 'Господине мой');
});

test('D102 source: repeated materialization preserves enriched edges without duplicates', () => {
  const input = materializationInput();
  const once = materializeNpcRelationshipRules(input);
  const twice = materializeNpcRelationshipRules({ ...input, npcs: once.npcs });
  assert.deepEqual(twice, once);
  for (const npc of twice.npcs) for (const edges of [npc.relationships, npc.semantic_state.relationships]) {
    assert.equal(edges.length, 1);
    assert.deepEqual(edges[0].source_rule_ref, ruleRef);
  }
});

test('D102 source: Stage24 expected snapshot retains the materialized top-level mirror', () => {
  const { npcs } = materializeNpcRelationshipRules(materializationInput());
  // Minimal projection-port fixture, not a full authored-start or Stage24 write-plan acceptance.
  const result = { schema: 'TEST:projection', party_id: 'TEST:party', run_id: 'TEST:run',
    trace: { choices: [{ choice_key: 'player_profile', candidate_set_digest: 'TEST:digest' }] },
    immediate: { npcs, items: [], player: { instance_id: 'TEST:player', dossier: {
      social_status: { social_role_id: 'nov_role_fisher', occupation_id: 'nov_occ_fisher' },
      skills: {}, identity: {}, knowledge: {} } },
    body: { profile_id: 'TEST:body', schema: 'TEST:body', version: 1, record_digest: 'TEST:digest',
      values: { health: 1, energy: 1, satiety: 1 }, condition_bindings: [] },
    spatial: { node: { instance_id: 'TEST:node', state: {} },
      anchor: { instance_id: 'TEST:anchor', state: {} }, position: {} },
    timestamp: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' } } };
  const snapshot = buildLowerDvinaTracePersistedProjection({ result,
    changeSetId: 'TEST:change', runRecord: {}, choiceRecords: [] });
  assert.equal(snapshot.npcs.length, 2);
  for (const npc of snapshot.npcs) {
    assert.deepEqual(npc.semantic_state.relationships[0].source_rule_ref, ruleRef);
  }
});

test('D102 source: existing authored edges are not backfilled; repeated materialization is stable', () => {
  const input = materializationInput();
  for (const npc of input.npcs) {
    const edge = { target_actor_id: input.npcs.find((other) => other.instance_id !== npc.instance_id).instance_id,
      kind: 'spouse', standing: 'authored fixture' };
    npc.relationships.push(structuredClone(edge));
    npc.semantic_state.relationships.push(structuredClone(edge));
  }
  const original = structuredClone(input.npcs);
  const once = materializeNpcRelationshipRules(input);
  assert.deepEqual(once.npcs, original, 'existing edges keep their exact authored state, even without source');
  const twice = materializeNpcRelationshipRules({ ...input, npcs: once.npcs });
  assert.deepEqual(twice, once);
  assert.equal(project(once.npcs[1], once.npcs[0], [spouse])?.address, undefined,
    'old edge without source must not receive an only-for form');
});

const sourceCases = [
  ['matching real D-2 source', ruleRef, 'Господине мой'],
  // Controlled edge fixture: real gap rule is unspecified, not an actual materialized spouse fact.
  ['same spouse kind/roles, gap source fixture', { id: 'rel_start_gap_ce80a3efab995c86', version: 1 }, undefined],
  ['same kind, another real spouse rule', { id: 'rel_spouse_smerd', version: 1 }, undefined],
  ['old edge without source', undefined, undefined]
];
for (const [name, sourceRef, expected] of sourceCases) test(`D102 source filter: ${name}`, () => {
  if (sourceRef) assert.ok(rules.some((row) => row.rule_id === sourceRef.id));
  const [wife, husband] = spousePair(sourceRef);
  const projected = project(wife, husband, [spouse]);
  assert.ok(projected?.relation, 'source failure must not erase a known relationship');
  assert.equal(projected.address, expected);
});

test('D102 catalog: unrestricted real spouse form still applies without a source ref', () => {
  const wife = actor('wife', genericSpouse.speaker_role_ref, null);
  const husband = actor('husband', genericSpouse.addressee_role_ref, null);
  wife.semantic_state.relationships.push({ target_actor_id: husband.instance_id, kind: 'spouse' });
  assert.equal(project(wife, husband, [genericSpouse])?.address, genericSpouse.form_ru);
});

test('D102 catalog: unchanged form_bishop accepts an arbitrary speaker without a relationship', () => {
  assert.equal(bishop.speaker_role_ref, null);
  assert.equal(bishop.relationship_kind, 'unspecified');
  assert.equal(project(actor('speaker'), actor('bishop', 'nov_role_archbishop', null), [bishop])?.address, 'Владыко');
});

// TEST rows test the selection algorithm, never activation or historical correctness of new data.
function testForm(id, speakerKey, addresseeKey, formRu, extra = {}) {
  if (speakerKey != null && speakerKey !== '') assert.ok(roles.has(speakerKey) || occupations.has(speakerKey));
  if (addresseeKey != null && addresseeKey !== '') assert.ok(roles.has(addresseeKey) || occupations.has(addresseeKey));
  return { form_id: `TEST:${id}`, status: 'approved', channel: 'oral', relationship_kind: 'unspecified',
    speaker_role_ref: speakerKey, addressee_role_ref: addresseeKey, speaker_ref: null, addressee_ref: null,
    register_ref: null, form_ru: formRu, situation: 'Изолированная тестовая форма',
    payload: { test_fixture: true, no_source: '' }, ...extra };
}
const sr = 'nov_role_fisher';
const ar = 'nov_role_smerd_householder';
const occ = 'nov_occ_fisher';
const f = (id, speakerKey, addresseeKey, text, extra) => testForm(id, speakerKey, addresseeKey, text, extra);
const precisionCases = [
  ['addressee occupation dominates role', [f('role', null, ar, 'Хозяин'), f('occupation', null, occ, 'Рыбак')], 'Рыбак'],
  ['addressee role fallback', [f('role', null, ar, 'Хозяин')], 'Хозяин'],
  ['equal addressee specificity is ambiguous', [f('one', null, occ, 'Рыбак'), f('two', null, occ, 'Добрый рыбак')], undefined],
  ['speaker occupation dominates role', [f('role', sr, ar, 'Хозяин'), f('occupation', occ, ar, 'Добрый хозяин')], 'Добрый хозяин'],
  ['speaker role fallback', [f('role', sr, ar, 'Хозяин')], 'Хозяин'],
  ['speaker role dominates wildcard', [f('any', null, ar, 'Хозяин'), f('role', sr, ar, 'Добрый хозяин')], 'Добрый хозяин'],
  ['speaker occupation dominates empty-string wildcard', [f('any', '', ar, 'Хозяин'), f('occupation', occ, ar, 'Добрый хозяин')], 'Добрый хозяин'],
  ['equal speaker specificity is ambiguous', [f('one', occ, ar, 'Хозяин'), f('two', occ, ar, 'Добрый хозяин')], undefined],
  ['empty addressee constraint is forbidden', [f('empty', sr, null, 'Хозяин')], undefined],
  ['crossed speaker/addressee specificity is incomparable',
    [f('speaker', occ, ar, 'Хозяин'), f('addressee', sr, occ, 'Рыбак')], undefined],
  ['both occupations dominate crossed candidates',
    [f('speaker', occ, ar, 'Хозяин'), f('addressee', sr, occ, 'Рыбак'), f('both', occ, occ, 'Добрый рыбак')], 'Добрый рыбак'],
  ['speaker ref is filtered before precision',
    [f('wrong', occ, occ, 'Рыбак', { speaker_ref: ref('different') }), f('right', sr, ar, 'Хозяин')], 'Хозяин'],
  ['addressee ref is filtered before precision',
    [f('wrong', occ, occ, 'Рыбак', { addressee_ref: ref('different') }), f('right', sr, ar, 'Хозяин')], 'Хозяин']
];
for (const [name, rows, expected] of precisionCases) test(`D102 P: ${name}`, () => {
  for (const ordered of [rows, [...rows].reverse()]) {
    assert.equal(project(actor('speaker', sr, occ), actor('recipient', ar, occ), ordered)?.address, expected,
      'selection must not depend on catalog row order');
  }
});

const suffixCases = [
  ['only-for in the middle is free text', `Описание; only for ${ruleRef.id}; затем свободное описание`, 'Хозяин'],
  ['unknown final source id fails closed', 'Описание; only for rel_TEST_unknown', undefined],
  ['empty final source id fails closed', 'Описание; only for ', undefined],
  ['exact final suffix admits matching source', `Описание; only for ${ruleRef.id}`, 'Хозяин'],
  ['final source list admits its non-first entry', `Описание; only for rel_spouse_smerd;${ruleRef.id}`, 'Хозяин']
];
for (const [name, situation, expected] of suffixCases) test(`D102 suffix TEST: ${name}`, () => {
  const [wife, husband] = spousePair(ruleRef);
  const row = testForm('suffix', spouse.speaker_role_ref, spouse.addressee_role_ref, 'Хозяин',
    { relationship_kind: 'spouse', situation });
  assert.equal(project(wife, husband, [row])?.address, expected);
});

test('D102 source applicability filters before P specificity', () => {
  const [wife, husband] = spousePair(ruleRef);
  const specific = testForm('restricted-specific', spouse.speaker_role_ref, spouse.addressee_role_ref, 'Хозяин',
    { relationship_kind: 'spouse', situation: 'Описание; only for rel_spouse_smerd' });
  const wildcard = testForm('unrestricted-wildcard', null, spouse.addressee_role_ref, 'Добрый хозяин',
    { relationship_kind: 'spouse' });
  for (const rows of [[specific, wildcard], [wildcard, specific]]) {
    assert.equal(project(wife, husband, rows)?.address, 'Добрый хозяин');
  }
});
