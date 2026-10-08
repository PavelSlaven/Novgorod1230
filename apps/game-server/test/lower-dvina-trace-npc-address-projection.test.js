import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as runtimeCatalog from '@rus/runtime-catalog';
import { materializeNpcRelationshipRules } from '@rus/materialization';
import { buildNpcDecisionBoundary, validateNpcConversationResponseRequest,
  validateConversationContributionPlan } from '@rus/npc-runtime';
import { buildNpcDecision } from
  '../src/runtime/lower-dvina-trace-m2-conversation-decision.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';

// D102: sol-authored acceptance before implementation. No model or PG calls.
// Relation facts use the existing materializer and approved D-2 data.
// Role-only positive forms below are isolated TEST fixtures, not live start captures.
// Acceptance ports: context.npcSpeechAddressForms / npcSpeechRegisters (reader rows),
// loadNpcSpeechRegisters({ rootDir, readFile?, onDiagnostic? }),
// NPC_SPEECH_REGISTERS_PIN and social_context.interlocutor_speech.
const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const waveDir = 'data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/';
const registerPath = 'data/world-catalogs/novgorod/game-base-v1/'
  + 'households-psychology-speech/speech_address/speech_registers.csv';
const registerSha256 = 'abbb6a27b4ec3b9ebe0a4f039aef5907dc564fc0118101818240e29bb3b9b71d';
const bytes = await readFile(resolve(rootDir, registerPath));
const json = async (name) => JSON.parse(await readFile(resolve(rootDir, waveDir, name), 'utf8'));
const forms = await json('speech_address_forms.json');
const rules = await json('npc_relationship_materialization_rules.json');
const compositionSource = (await json('place_population_composition_rules.json'))
  .find((row) => row.composition_id === 'pf_peasant_homestead');
const spouseRule = rules.find((row) => row.rule_id === 'rel_composition_spouse_2dc90533f844af8e');
const spouseForm = forms.find((row) => row.form_id === 'form_spouse_smerd');
assert.equal(compositionSource.status, 'approved');
assert.equal(spouseRule.status, 'approved');
assert.equal(spouseForm.status, 'approved');

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const clock = { whole_minutes: '1', subminute_numerator: '0', subminute_denominator: '1' };
// Isolated reader-result fixture; these key/register triples match C007c2 CSV rows.
const registerRows = [
  ['role', 'nov_role_prince', 'formal_literate'],
  ['role', 'nov_role_fisher', 'plain_oral'],
  ['role', 'nov_role_household_mistress', 'everyday_oral'],
  ['occupation', 'nov_occ_fisher', 'plain_oral'],
  ['occupation', 'nov_occ_local_trader', 'everyday_oral']
].map(([subject_kind, subject_ref, register]) => ({ subject_kind, subject_ref, register }));

function actor(id, role = 'nov_role_fisher', occupation = 'nov_occ_fisher') {
  return { instance_id: id, ref: ref('npc', id),
    identity_state: { canonical_name: id === 'npc:wife' ? 'Офимья' : 'Гюрята',
      age_category: 'adult', public_role_label: 'Тестовый участник' },
    machine_state: { status: 'active' },
    ...(role == null ? {} : { role_ref: { id: role } }),
    ...(occupation == null ? {} : { occupation_ref: { id: occupation } }),
    semantic_state: { relationships: [] },
    knowledge_profile_snapshot: {}, knowledge_records: [] };
}

function materializedSpouses({ withFact = true, direction = 'symmetric' } = {}) {
  const composition = {
    place_family_id: compositionSource.place_family_id,
    place_family_version: compositionSource.place_family_version,
    composition_ref: { id: compositionSource.composition_id,
      version: compositionSource.composition_version,
      world_revision_id: compositionSource.world_revision_id },
    population_groups: structuredClone(compositionSource.population_groups),
    slot_relationships: structuredClone(withFact ? compositionSource.authoring_payload.slot_relationships : [])
  };
  const actors = [
    actor('npc:husband', spouseRule.subject_role_ref, null),
    actor('npc:wife', spouseRule.object_role_ref, null)
  ];
  for (const [index, npc] of actors.entries()) {
    npc.semantic_state.source_binding = {
      world_revision_id: compositionSource.world_revision_id,
      canonical_g5_ref: { id: 'fixture:household', version: 1 },
      place_family_id: compositionSource.place_family_id,
      group_id: index === 0 ? 'pf_peasant_homestead.householder' : 'pf_peasant_homestead.mistress',
      place_population_composition_ref: structuredClone(composition.composition_ref)
    };
  }
  // Directed is a materializer-port test variant, not a new approved world rule.
  const result = materializeNpcRelationshipRules({
    rules: [{ ...structuredClone(spouseRule), direction }], compositions: [composition], npcs: actors });
  assert.equal(result.relations.length, withFact ? 1 : 0);
  // Match the real scene readback: semantic_state is authoritative, top-level can be empty.
  return result.npcs.map((npc) => ({ ...npc, relationships: [] }));
}

function roleForm({ speakerRole = 'nov_role_fisher', addresseeRole = 'nov_role_smerd_householder' } = {}) {
  return { ...structuredClone(forms.find((row) => row.form_id === 'form_bishop')),
    form_id: 'fixture:role-only-address', relationship_kind: 'unspecified',
    speaker_role_ref: speakerRole, addressee_role_ref: addresseeRole,
    form_ru: 'Добрый человек', situation: 'Изолированная тестовая ролевая форма',
    payload: { test_fixture: true, no_source: '' } };
}

function conversation({ target = actor('npc:responder'), other = null,
  assignedPlayerRole = 'nov_role_smerd_householder', assignedPlayerOccupation = null,
  addressForms = forms, registers = registerRows, recognized = true } = {}) {
  const targetRef = ref('npc', target.instance_id);
  const speakerRef = other == null ? ref('player_character', 'player:fixture') : ref('npc', other.instance_id);
  const statementRef = ref('conversation_statement', 'statement:fixture');
  const perceptionRef = ref('perception_result', 'perception:fixture');
  const latest = { schema: 'conversation_statement_event_v1', statement_id: statementRef.entity_id,
    conversation_id: 'conversation:fixture', exchange_id: 'exchange:fixture',
    speaker_ref: speakerRef, primary_addressee_ref: targetRef,
    intended_addressee_refs: [targetRef], utterance_text: 'Расскажи о работе.', interaction_tags: [] };
  const received = { listener_ref: targetRef, speaker_ref: recognized ? speakerRef : null,
    source_statement_ref: statementRef, perception_result_ref: perceptionRef,
    comprehension: 'full', utterance_text: latest.utterance_text, delivery_cues: [] };
  const signalRef = ref('npc_decision_signal', 'signal:fixture');
  const boundary = buildNpcDecisionBoundary({ decision_mode: 'conversation', scheduled_at: clock,
    npc_ref: targetRef, same_time_batch_ref: ref('temporal_batch', 'batch:fixture'),
    significance: 'material', categories: ['communication'], signal_refs: [signalRef], state_version: '1' });
  const actors = other == null ? [target] : [target, other];
  const context = { phase: 'phase_3', targetActor: target, targetRef,
    actualNpcActors: actors, stateVersion: 1, batchKey: 'batch:fixture',
    conversationId: latest.conversation_id, exchangeId: latest.exchange_id,
    contracts: { neutral_conversation: true, ids: {} }, evidencePresentation: null,
    npcDecisionScope: { action_handoff_available: false, combat_handoff_available: false },
    npcOperationContract: {}, npcSocialCheckProfile: null,
    npcSpeechAddressForms: structuredClone(addressForms), npcSpeechRegisters: structuredClone(registers),
    state: { actor_id: 'player:fixture', clock, party_state: { state_version: 1 }, npcs: actors,
      player_profile: { social_status: {
        ...(assignedPlayerRole == null ? {} : { social_role_id: assignedPlayerRole }),
        ...(assignedPlayerOccupation == null ? {} : { occupation_id: assignedPlayerOccupation }) } },
      conversation_contributions: [latest],
      npc_decision_signals: [{ same_time_batch_key: 'batch:fixture', signal: {
        signal_id: signalRef.entity_id, subject_ref: targetRef, category: 'communication',
        source_event_ref: statementRef, source_perception_ref: perceptionRef } }],
      conversation_audiences: [{ statement_ref: statementRef, received_messages: [received] }] } };
  const working = { new_signal_records: [], statements: [], audiences: [] };
  const build = () => {
    const request = buildNpcDecision(context, working, boundary, latest).request;
    assert.equal(validateNpcConversationResponseRequest(request), true, 'fixture must reach a valid production request');
    return request;
  };
  return { context, received, latest, build };
}

function speech(request) { return request.social_context.interlocutor_speech; }
function assertNoAddress(request) {
  const value = speech(request);
  assert.equal(value == null || !Object.hasOwn(value, 'address'), true, 'absent evidence must omit address');
  assert.equal(value == null || !Object.hasOwn(value, 'relation'), true, 'roles cannot create a relation');
}
function russianBlock(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'speech projection is required');
  assert.ok(Object.keys(value).length > 0);
  for (const [key, text] of Object.entries(value)) {
    assert.ok(['relation', 'address', 'register'].includes(key), 'only prepared speech facts enter this block');
    assert.equal(typeof text, 'string');
    assert.match(text, /[А-Яа-яЁё]/u);
    assert.doesNotMatch(text, /[A-Za-z]|\b\d{4,}\b/u, 'values contain Russian instructions, no IDs/codes/refs');
  }
}

test('D102-1 materialized exact relation wins over a role-only form', () => {
  const [husband, wife] = materializedSpouses();
  const competing = roleForm({ speakerRole: wife.role_ref.id, addresseeRole: husband.role_ref.id });
  const scenario = conversation({ target: wife, other: husband, addressForms: [competing, spouseForm] });
  const before = structuredClone(scenario.context);
  const value = speech(scenario.build());
  russianBlock(value);
  assert.match(value.relation, /супруг|муж/u);
  assert.equal(value.address, spouseForm.form_ru);
  assert.notEqual(value.address, competing.form_ru);
  assert.deepEqual(scenario.context, before, 'projection must not mutate actors or approved lookup rows');
});

test('D102-2 TEST role-only form uses code-assigned player role without inventing a relation', () => {
  const form = roleForm();
  const scenario = conversation({ addressForms: [form] });
  const value = speech(scenario.build());
  russianBlock(value);
  assert.equal(value.address, form.form_ru);
  assert.equal(Object.hasOwn(value, 'relation'), false);
  scenario.context.state.player_profile.social_status.social_role_id = 'fixture:unknown-role';
  assertNoAddress(scenario.build());
});

test('D102-2 no-source occupation falls back to assigned role; speaker ref stays required', () => {
  // Ожидаемо красный, issue #526; синтетическая форма, не каталог.
  const form = { ...roleForm({ addresseeRole: 'nov_occ_boatman' }),
    form_id: 'fixture:occupation-address', form_ru: 'Добрый перевозчик' };
  const role = roleForm({ addresseeRole: 'nov_role_boatman' });
  const scenario = conversation({ addressForms: [form, role], assignedPlayerRole: 'nov_role_boatman',
    assignedPlayerOccupation: 'nov_occ_boatman' });
  assert.equal(speech(scenario.build())?.address, role.form_ru);
  scenario.context.targetActor.role_ref.id = 'fixture:unknown-speaker-role';
  assertNoAddress(scenario.build());
});

test('D102-2 sourced occupation and required speaker keys match assigned refs, not labels', () => {
  const [husband, wife] = materializedSpouses();
  husband.occupation_ref = { id: 'nov_occ_boatman' };
  husband.identity_state.public_role_label = 'перевозчик';
  // Синтетические формы, не каталог; source остаётся результатом D-2 materializer.
  const role = { ...roleForm({ speakerRole: wife.role_ref.id,
    addresseeRole: husband.role_ref.id }), relationship_kind: 'spouse' };
  const occupation = { ...role, form_id: 'fixture:sourced-occupation-address',
    addressee_role_ref: husband.occupation_ref.id, form_ru: 'Добрый перевозчик' };
  const scenario = conversation({ target: wife, other: husband, addressForms: [role, occupation] });
  assert.equal(speech(scenario.build())?.address, occupation.form_ru);
  husband.occupation_ref.id = 'nov_occ_fisher';
  assert.equal(husband.identity_state.public_role_label, 'перевозчик');
  assert.equal(speech(scenario.build())?.address, role.form_ru, 'labels do not match occupation refs');
  wife.role_ref.id = 'fixture:unknown-speaker-role';
  const value = speech(scenario.build());
  assert.equal(value?.address, undefined, 'the required speaker ref must still match');
  assert.match(value.relation, /супруг|муж/u);
});

test('D102-3 no relationship, applicable form or known register omits the whole block', () => {
  const [husband, wife] = materializedSpouses({ withFact: false });
  const scenario = conversation({ target: wife, other: husband, addressForms: [spouseForm], registers: [] });
  assert.equal(Object.hasOwn(scenario.build().social_context, 'interlocutor_speech'), false);
  const unknown = conversation({ target: actor('npc:unknown', null, null),
    assignedPlayerRole: null, addressForms: [], registers: [] });
  assert.equal(Object.hasOwn(unknown.build().social_context, 'interlocutor_speech'), false);
});

test('D102-4 occupation register beats role; role fallback only without an occupation; unknown stays unknown', () => {
  const valueFor = (role, occupation) => speech(conversation({
    target: actor('npc:register-test', role, occupation), addressForms: [] }).build());
  const plain = valueFor('nov_role_fisher', 'nov_occ_fisher');
  const formal = valueFor('nov_role_prince', null);
  const everyday = valueFor('nov_role_fisher', 'nov_occ_local_trader');
  russianBlock(plain); russianBlock(formal); russianBlock(everyday);
  assert.equal(typeof plain.register, 'string');
  assert.equal(typeof formal.register, 'string');
  assert.equal(typeof everyday.register, 'string');
  assert.notEqual(plain.register, formal.register);
  assert.notEqual(plain.register, everyday.register);
  assert.notEqual(formal.register, everyday.register);
  assert.equal(valueFor('nov_role_prince', 'nov_occ_fisher')?.register, plain.register);
  assert.equal(valueFor('nov_role_fisher', 'nov_occ_local_trader')?.register, everyday.register);
  for (const [role, occupation] of [['nov_role_prince', 'fixture:unknown-occupation'],
    ['fixture:unknown-role', null], [null, null]]) {
    const value = valueFor(role, occupation);
    assert.equal(value == null || !Object.hasOwn(value, 'register'), true, 'unknown key must not substitute a register');
  }
});

test('D102-5 empty/no_source, written, retired, unrelated pair and ambiguity cannot supply an address', () => {
  const form = roleForm();
  for (const addressForms of [
    [{ ...form, form_ru: '' }], [{ ...form, payload: { no_source: 'нет источника' } }],
    [{ ...form, channel: 'written' }], [{ ...form, status: 'retired' }],
    [{ ...form, addressee_role_ref: 'nov_role_prince' }],
    [form, { ...form, form_id: 'fixture:second-form', form_ru: 'Иное обращение' }]
  ]) assertNoAddress(conversation({ addressForms }).build());
});

test('D102-5 collective/family situations without a specific matching addressee are not wildcard defaults', () => {
  const contextual = forms.filter((row) => ['form_father_in_law', 'form_children',
    'form_bratie', 'form_brothers_novgorod'].includes(row.form_id));
  assert.equal(contextual.length, 4);
  assertNoAddress(conversation({ addressForms: contextual }).build());
});

test('D102-5 unknown speaker and a relation to someone else cannot borrow the current player profile', () => {
  const form = roleForm();
  const unrecognized = conversation({ addressForms: [form], registers: [], recognized: false });
  assert.equal(Object.hasOwn(unrecognized.build().social_context, 'interlocutor_speech'), false);
  const [husband, wife] = materializedSpouses();
  const someoneElse = { ...husband, instance_id: 'npc:other', ref: ref('npc', 'npc:other') };
  assertNoAddress(conversation({ target: wife, other: someoneElse,
    addressForms: [spouseForm], registers: [] }).build());
});

test('D102-5 a directed materialized edge is not reversed for speech selection', () => {
  const [husband, wife] = materializedSpouses({ direction: 'directed' });
  assert.equal(husband.semantic_state.relationships.length, 1);
  assert.deepEqual(wife.semantic_state.relationships, []);
  assertNoAddress(conversation({ target: wife, other: husband, addressForms: [spouseForm], registers: [] }).build());
});

test('D102-6 responder, auditor and both model repair paths share the Russian projection and system rule', async () => {
  const input = conversation({ addressForms: [roleForm()] }).build();
  const calls = [];
  const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner: { async run(call) {
    calls.push(structuredClone(call));
    if (call.role_id === 'npc_conversation_grounding_auditor') return { output: { pass: true, concerns: [] } };
    return { output: { contribution_kind: 'speech', speech: {
      utterance_text: 'Расскажу о работе.', dominant_act: 'answer', interaction_tags: [],
      topic_refs: [], claims: [], response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'ответить собеседнику', adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'Ответить на вопрос.' } };
  } }, worldKnowledgeGrounder: { async ground(request) {
    return { ...request, world_knowledge: { facts: [], hard_constraints: [] } };
  } } });
  const initial = await model(input);
  assert.equal(validateConversationContributionPlan(initial, input), true);
  assert.equal(await model.validateFreshPlan(initial, input), true);
  await model(input, { repair: { original_output: initial,
    validation_errors: [{ category: 'format', path: '$.speech' }] } });
  // This error takes the existing model-based semantic service-text repair path,
  // rather than changing or bypassing the existing code fallback policy.
  await model(input, { repair: { original_output: initial,
    validation_errors: [{ category: 'semantic_grounding', code: 'TRACE_NPC_SPEECH_SERVICE_TEXT' }] } });
  assert.deepEqual(calls.map((call) => call.role_id), ['npc_conversation_responder',
    'npc_conversation_grounding_auditor', 'npc_conversation_responder_format_repair',
    'npc_conversation_responder_format_repair']);
  const value = speech(input);
  russianBlock(value);
  const commonRule = 'Учитывай переданные сведения о собеседнике, допустимом обращении и регистре; неизвестное не додумывай, обращение не обязательно, а форма обращения сама по себе не устанавливает связь, полномочия или обязанности';
  for (const call of calls) {
    const payload = JSON.parse(call.messages[1].content);
    const wireRequest = call.role_id === 'npc_conversation_responder' ? payload : payload.request;
    assert.deepEqual(speech(wireRequest), value);
    russianBlock(speech(wireRequest));
    assert.equal(call.messages[0].content.includes(commonRule), true, 'writer/auditor/repair apply the approved rule word for word');
    assert.equal(call.overrides.temperature, 0);
    assert.equal(call.overrides.maxTokens, call.role_id === 'npc_conversation_grounding_auditor' ? 256 : 1000);
  }
});

test('D102-7 CI checks the exact file pin and its row-level approval reference', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), registerSha256);
  const pin = runtimeCatalog.NPC_SPEECH_REGISTERS_PIN;
  assert.ok(pin, 'runtime-catalog must expose the register file pin');
  assert.equal(pin.path, registerPath);
  assert.equal(pin.sha256, registerSha256);
  assert.match(JSON.stringify(pin), /C007c2/u);
  assert.match(JSON.stringify(pin), /8f0c1d91/u);
});

function reader() {
  assert.equal(typeof runtimeCatalog.loadNpcSpeechRegisters, 'function', 'runtime-catalog must export loadNpcSpeechRegisters');
  return runtimeCatalog.loadNpcSpeechRegisters;
}

test('D102-7 approved register reader parses the real pinned CSV and its conflicting role/occupation rows', async () => {
  const rows = await reader()({ rootDir });
  assert.equal(rows.length, 139);
  const get = (kind, id) => rows.find((row) => row.subject_kind === kind && row.subject_ref === id)?.register;
  assert.equal(get('role', 'nov_role_prince'), 'formal_literate');
  assert.equal(get('role', 'nov_role_fisher'), 'plain_oral');
  assert.equal(get('occupation', 'nov_occ_local_trader'), 'everyday_oral');
  assert.equal(get('occupation', 'nov_occ_fisher'), 'plain_oral');
  const request = conversation({ registers: rows, addressForms: [] }).build();
  russianBlock(speech(request));
  assert.equal(typeof speech(request).register, 'string');
});

test('D102-7 concurrent/repeated calls read once and reuse the approved process cache', async () => {
  const load = reader();
  let reads = 0;
  const diagnostics = [];
  const options = { rootDir: resolve(rootDir, 'fixture:acceptance-register-cache-valid'),
    readFile: async (path, encoding) => {
      reads += 1;
      assert.equal(path, resolve(options.rootDir, registerPath));
      return encoding === 'utf8' ? bytes.toString('utf8') : bytes;
    }, onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) };
  const [a, b] = await Promise.all([load(options), load(options)]);
  const c = await load(options);
  assert.equal(a.length, 139);
  assert.deepEqual(b, a); assert.deepEqual(c, a);
  assert.equal(reads, 1, 'repeat and concurrent calls must not reread or rehash the file');
  assert.deepEqual(diagnostics, []);
});

test('D102-7 mismatched pin omits the register, diagnoses once and does not reread or fail the turn', async () => {
  const load = reader();
  let reads = 0;
  const diagnostics = [];
  const corrupt = Buffer.concat([bytes, Buffer.from('\n')]);
  const options = { rootDir: resolve(rootDir, 'fixture:acceptance-register-cache-mismatch'),
    readFile: async (_path, encoding) => {
      reads += 1;
      return encoding === 'utf8' ? corrupt.toString('utf8') : corrupt;
    }, onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) };
  const rows = await load(options);
  assert.deepEqual(rows, [], 'mismatch must supply no register rows');
  assert.deepEqual(await load(options), []);
  assert.deepEqual(await load(options), []);
  assert.equal(reads, 1);
  assert.equal(diagnostics.length, 1, 'one safe diagnostic per failed pinned source, not per turn');
  const request = conversation({ registers: rows, addressForms: [] }).build();
  assert.equal(Object.hasOwn(request.social_context, 'interlocutor_speech'), false, 'turn remains valid without the failed register');
});
