import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { materializeNpcRelationshipRules } from '@rus/materialization';
import { buildNpcDecisionBoundary,
  validateNpcConversationResponseRequest } from '@rus/npc-runtime';
import { buildNpcDecision } from
  '../src/runtime/lower-dvina-trace-m2-conversation-decision.js';

// D102: sol-authored before implementation; no model calls or database ports.
// Отрицательные occupation-контроли ожидаемо красные, issue #526.
const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const waveDir = 'data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/';
const readWave = async (name) => JSON.parse(await readFile(
  resolve(rootDir, waveDir, name), 'utf8'
));
const [relationshipRules, compositions, speechAddressForms] = await Promise.all([
  readWave('npc_relationship_materialization_rules.json'),
  readWave('place_population_composition_rules.json'),
  readWave('speech_address_forms.json')
]);
const spouseRule = relationshipRules.find(({ rule_id: id }) =>
  id === 'rel_composition_spouse_2dc90533f844af8e');
const household = compositions.find(({ composition_id: id }) =>
  id === 'pf_peasant_homestead');
assert.ok(spouseRule && household);
const bishopForm = speechAddressForms.find(({ form_id: id }) =>
  id === 'form_bishop');
assert.ok(bishopForm);

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const playerRef = ref('player_character', 'player:fixture');
const clock = { whole_minutes: '1', subminute_numerator: '0',
  subminute_denominator: '1' };
const occupation = {
  speaker: 'nov_occ_fisher',
  interlocutor: 'nov_occ_boatman'
};
const playerRole = 'nov_role_smerd_householder';
const registers = [{ subject_kind: 'occupation',
  subject_ref: occupation.speaker, register: 'plain_oral' }];

function syntheticAddress(relationshipKind, addresseeKey = occupation.interlocutor,
  text = 'Добрый перевозчик') {
  // синтетическая форма, не каталог; mirrors the complete D102 roleForm shape.
  return {
    ...structuredClone(bishopForm),
    form_id: `fixture:npc-address-knowledge:${addresseeKey}`,
    relationship_kind: relationshipKind,
    speaker_role_ref: occupation.speaker,
    addressee_role_ref: addresseeKey,
    form_ru: text,
    situation: 'синтетическая форма, не каталог',
    payload: { test_fixture: true, no_source: '' }
  };
}

function addressChoices(relationshipKind, addresseeRole) {
  return [syntheticAddress(relationshipKind),
    syntheticAddress(relationshipKind, addresseeRole, 'Добрый человек')];
}

function npc(id, role, occupationId, groupId = null) {
  const semanticState = { relationships: [] };
  if (groupId !== null) {
    semanticState.source_binding = {
      world_revision_id: household.world_revision_id,
      canonical_g5_ref: { id: 'fixture:peasant-household', version: 1 },
      place_family_id: household.place_family_id,
      group_id: groupId,
      place_population_composition_ref: {
        id: household.composition_id,
        version: household.composition_version,
        world_revision_id: household.world_revision_id
      }
    };
  }
  return {
    instance_id: id,
    ref: ref('npc', id),
    identity_state: { canonical_name: id },
    machine_state: { status: 'active' },
    role_ref: { id: role },
    occupation_ref: { id: occupationId },
    semantic_state: semanticState,
    knowledge_profile_snapshot: {},
    knowledge_records: []
  };
}

function materializedSpouses({ withFact = true } = {}) {
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
    slot_relationships: withFact
      ? structuredClone(household.authoring_payload.slot_relationships)
      : []
  };
  const husband = npc('npc:husband', spouseRule.subject_role_ref,
    occupation.interlocutor, 'pf_peasant_homestead.householder');
  const wife = npc('npc:wife', spouseRule.object_role_ref,
    occupation.speaker, 'pf_peasant_homestead.mistress');
  const result = materializeNpcRelationshipRules({
    rules: [spouseRule], compositions: [composition], npcs: [husband, wife]
  });
  assert.equal(result.relations.length, withFact ? 1 : 0);
  if (withFact) {
    assert.equal(result.relations[0].relation_category_id, 'spouse');
  }
  return result.npcs;
}

function conversationRequest({ responder, speakerRef, otherNpcs = [],
  playerOccupation = null, form, forms = [form], speechRegisters = [],
  utteranceText = 'Расскажите о пути.' }) {
  const statementRef = ref('conversation_statement', 'statement:fixture');
  const signalRef = ref('npc_decision_signal', 'signal:fixture');
  const latest = {
    schema: 'conversation_statement_event_v1',
    statement_id: statementRef.entity_id,
    conversation_id: 'conversation:fixture',
    exchange_id: 'exchange:fixture',
    speaker_ref: speakerRef,
    primary_addressee_ref: responder.ref,
    intended_addressee_refs: [responder.ref],
    utterance_text: utteranceText,
    interaction_tags: []
  };
  const actors = [responder, ...otherNpcs];
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation',
    scheduled_at: clock,
    npc_ref: responder.ref,
    same_time_batch_ref: ref('temporal_batch', 'batch:fixture'),
    significance: 'material',
    categories: ['communication'],
    signal_refs: [signalRef],
    state_version: '1'
  });
  const context = {
    phase: 'phase_3',
    targetActor: responder,
    targetRef: responder.ref,
    actualNpcActors: actors,
    stateVersion: 1,
    batchKey: 'batch:fixture',
    conversationId: latest.conversation_id,
    exchangeId: latest.exchange_id,
    contracts: { neutral_conversation: true, ids: {} },
    evidencePresentation: null,
    npcDecisionScope: {
      action_handoff_available: false,
      combat_handoff_available: false
    },
    npcOperationContract: {},
    npcSocialCheckProfile: null,
    npcSpeechAddressForms: forms,
    npcSpeechRegisters: speechRegisters,
    state: {
      actor_id: playerRef.entity_id,
      clock,
      party_state: { state_version: 1 },
      npcs: actors,
      player_profile: { social_status: {
        social_role_id: playerRole,
        occupation_id: playerOccupation
      } },
      conversation_contributions: [latest],
      npc_decision_signals: [{
        same_time_batch_key: 'batch:fixture',
        signal: {
          signal_id: signalRef.entity_id,
          subject_ref: responder.ref,
          category: 'communication',
          source_event_ref: statementRef,
          source_perception_ref: ref('perception_result', 'perception:fixture')
        }
      }],
      conversation_audiences: [{
        statement_ref: statementRef,
        received_messages: [{
          listener_ref: responder.ref,
          speaker_ref: structuredClone(speakerRef),
          source_statement_ref: statementRef,
          perception_result_ref: ref('perception_result', 'perception:fixture'),
          comprehension: 'full',
          utterance_text: latest.utterance_text,
          delivery_cues: []
        }]
      }]
    }
  };
  const before = structuredClone(context);
  const result = buildNpcDecision(context, {
    new_signal_records: [], statements: [], audiences: []
  }, boundary, latest);
  assert.equal(validateNpcConversationResponseRequest(result.request), true);
  assert.deepEqual(context, before, 'projection must not change actors, relationships or lookup rows');
  return result.request;
}

test('D102 #526 recognized stranger selects player role without occupation knowledge', () => {
  // Ожидаемо красный, issue #526.
  const responder = npc('npc:stranger', 'nov_role_fisher', occupation.speaker);
  const request = conversationRequest({
    responder,
    speakerRef: playerRef,
    playerOccupation: occupation.interlocutor,
    forms: addressChoices('unspecified', playerRole),
    speechRegisters: registers
  });

  assert.equal(request.social_context.first_contact_introduction, undefined);
  assert.equal(request.social_context.interlocutor_speech?.address, 'Добрый человек');
  assert.equal(request.social_context.interlocutor_speech.relation, undefined);
  assert.equal(request.social_context.interlocutor_speech.register,
    'Говори просто, обычной устной речью.');
});

test('D102 #526 materialized spouse source permits occupation over role', () => {
  const [husband, wife] = materializedSpouses();
  const request = conversationRequest({
    responder: wife,
    speakerRef: husband.ref,
    otherNpcs: [husband],
    forms: addressChoices('spouse', husband.role_ref.id)
  });

  assert.equal(request.social_context.interlocutor_speech?.address,
    'Добрый перевозчик');
  assert.match(request.social_context.interlocutor_speech.relation, /супруг|муж/u);
});

test('D102 #526 the same NPC pair without a D-2 slot selects role', () => {
  // Ожидаемо красный, issue #526.
  const [speaker, responder] = materializedSpouses({ withFact: false });
  const request = conversationRequest({
    responder,
    speakerRef: speaker.ref,
    otherNpcs: [speaker],
    forms: addressChoices('unspecified', speaker.role_ref.id)
  });

  assert.equal(request.social_context.interlocutor_speech?.address, 'Добрый человек');
  assert.equal(request.social_context.interlocutor_speech.relation, undefined);
});

test('D102 #526 the same spouse pair without own source selects role and retains relation/register', () => {
  const [husband, wife] = materializedSpouses();
  for (const edges of [wife.relationships, wife.semantic_state.relationships]) {
    for (const edge of edges) delete edge.source_rule_ref;
  }
  const request = conversationRequest({
    responder: wife, speakerRef: husband.ref, otherNpcs: [husband],
    forms: addressChoices('spouse', husband.role_ref.id), speechRegisters: registers
  });
  const value = request.social_context.interlocutor_speech;
  assert.equal(value.address, 'Добрый человек');
  assert.match(value.relation, /супруг|муж/u);
  assert.equal(value.register, 'Говори просто, обычной устной речью.');
});

test('D102 #526 an edge to another addressee does not transfer occupation knowledge', () => {
  const [husband, wife] = materializedSpouses();
  const stranger = npc('npc:other-addressee', husband.role_ref.id,
    occupation.interlocutor);
  const request = conversationRequest({
    responder: wife, speakerRef: stranger.ref, otherNpcs: [husband, stranger],
    forms: addressChoices('unspecified', stranger.role_ref.id)
  });
  assert.equal(request.social_context.interlocutor_speech?.address, 'Добрый человек');
  assert.equal(request.social_context.interlocutor_speech.relation, undefined);
});

test('D102 #526 a fully heard name does not establish occupation knowledge', () => {
  const name = 'Меня зовут Иван.';
  const request = conversationRequest({
    responder: npc('npc:stranger', 'nov_role_fisher', occupation.speaker),
    speakerRef: playerRef, playerOccupation: occupation.interlocutor,
    utteranceText: name, forms: addressChoices('unspecified', playerRole)
  });
  assert.ok(request.public_conversation_history.some(({ utterance_text: text }) => text === name),
    'the name must actually reach the responding NPC through perception');
  assert.equal(request.social_context.interlocutor_speech?.address, 'Добрый человек');
});

test('D102 #526 no source and no role form omit occupation address', () => {
  const request = conversationRequest({
    responder: npc('npc:stranger', 'nov_role_fisher', occupation.speaker),
    speakerRef: playerRef, playerOccupation: occupation.interlocutor,
    form: syntheticAddress('unspecified')
  });
  assert.equal(request.social_context.interlocutor_speech?.address, undefined);
});

const invalidSources = [
  ['empty source id', (edge) => { edge.source_rule_ref.id = ''; }],
  ['missing source version', (edge) => { delete edge.source_rule_ref.version; }],
  ['non-positive source version', (edge) => { edge.source_rule_ref.version = 0; }]
];
for (const [name, invalidate] of invalidSources) test(`D102 #526 ${name} cannot establish occupation`, () => {
  const [husband, wife] = materializedSpouses();
  for (const edges of [wife.relationships, wife.semantic_state.relationships]) {
    for (const edge of edges) invalidate(edge);
  }
  const request = conversationRequest({
    responder: wife, speakerRef: husband.ref, otherNpcs: [husband],
    forms: addressChoices('spouse', husband.role_ref.id)
  });
  assert.equal(request.social_context.interlocutor_speech?.address, 'Добрый человек');
  assert.match(request.social_context.interlocutor_speech.relation, /супруг|муж/u);
});

test('D102 #526 source ref without a relationship kind cannot establish occupation', () => {
  const [husband, wife] = materializedSpouses();
  for (const edges of [wife.relationships, wife.semantic_state.relationships]) {
    for (const edge of edges) edge.kind = '';
  }
  const request = conversationRequest({
    responder: wife, speakerRef: husband.ref, otherNpcs: [husband],
    forms: addressChoices('unspecified', husband.role_ref.id)
  });
  assert.equal(request.social_context.interlocutor_speech?.address, 'Добрый человек');
  assert.equal(request.social_context.interlocutor_speech.relation, undefined);
});

test('D102 #526 known kind never falls back to an unspecified role form', () => {
  const [husband, wife] = materializedSpouses();
  const request = conversationRequest({
    responder: wife, speakerRef: husband.ref, otherNpcs: [husband],
    forms: [syntheticAddress('unspecified', husband.role_ref.id, 'Добрый человек')],
    speechRegisters: registers
  });
  const value = request.social_context.interlocutor_speech;
  assert.equal(value.address, undefined);
  assert.match(value.relation, /супруг|муж/u);
  assert.equal(value.register, 'Говори просто, обычной устной речью.');
});

test('D102 #526 ambiguous role fallback omits address while retaining relation/register', () => {
  const [husband, wife] = materializedSpouses();
  for (const edges of [wife.relationships, wife.semantic_state.relationships]) {
    for (const edge of edges) delete edge.source_rule_ref;
  }
  const forms = addressChoices('spouse', husband.role_ref.id);
  forms.push({ ...forms[1], form_id: 'fixture:second-role-address', form_ru: 'Добрый хозяин' });
  const request = conversationRequest({
    responder: wife, speakerRef: husband.ref, otherNpcs: [husband],
    forms, speechRegisters: registers
  });
  const value = request.social_context.interlocutor_speech;
  assert.equal(value.address, undefined);
  assert.match(value.relation, /супруг|муж/u);
  assert.equal(value.register, 'Говори просто, обычной устной речью.');
});
