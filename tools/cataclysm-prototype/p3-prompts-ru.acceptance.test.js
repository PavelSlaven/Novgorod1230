import { assertSuppliedSpeechOptions } from './npc-talk-test-helpers.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { replyFrame } from './p3-test-frames.js';
import { runP3TurnStep } from './p3-boundary.js';

test('P3 sends intent-derived speech loudness to the native speak adapter', async (t) => {
  const cases = [
    { name: '«КРИЧУ», модель 1', intent: 'КРИЧУ: «Берегись!»',
      modelLoudness: 1, expectedLoudness: 4 },
    { name: '«КРИЧУ», модель 2', intent: 'КРИЧУ: «Берегись!»',
      modelLoudness: 2, expectedLoudness: 4 },
    { name: '«КРИЧУ», модель 3', intent: 'КРИЧУ: «Берегись!»',
      modelLoudness: 3, expectedLoudness: 4 },
    { name: '«ШЕПЧУ», модель 4', intent: 'ШЕПЧУ: «Берегись!»',
      modelLoudness: 4, expectedLoudness: 1 },
    { name: 'без указания', intent: 'Говорю: «Берегись!»',
      modelLoudness: 4, expectedLoudness: 2 },
    { name: 'слово внутри цитаты', intent: 'Говорю: «Кричу, берегись!»',
      modelLoudness: 4, expectedLoudness: 2,
      utteranceText: 'Кричу, берегись!' },
    { name: 'непосредственное «не»', intent: 'Не кричу: «Берегись!»',
      modelLoudness: 4, expectedLoudness: 2 }
  ];
  for (const [index, { name, intent, modelLoudness, expectedLoudness,
    utteranceText }] of cases.entries()) await t.test(name, async () => {
    let capturedEnvelope;
    let modelCalls = 0;
    const result = await runP3TurnStep({ intent,
      observation: replyFrame({ turn: 3 }), operationId: `p3-loudness-${index + 1}`,
      nativeSpeechOnly: true, targetActorRef: 'npc:9',
      nativeAdapter: { writeOperationRequest: async () => {},
        readOperationReadback: async () => ({}),
        async execute(envelope) {
          capturedEnvelope = envelope;
          return { schema: 'p3_native_operation_readback_v1',
            operation_id: envelope.operation_id, status: 'applied',
            goal_result: 'achieved', before: { turn: 3 }, after: { turn: 3 },
            native_effect: { effect_status: 'confirmed', speakerId: '7',
              utterance: envelope.args.utterance,
              actualHeardListenerIds: ['9'] } };
        } },
      turnStepModel: async (request) => {
        modelCalls += 1;
        return speechPlan(request, modelLoudness, utteranceText);
      } });

    assert.equal(modelCalls, 1);
    assert.equal(capturedEnvelope.primitive, 'speak');
    assert.deepEqual(capturedEnvelope.args.delivery,
      { loudness: expectedLoudness, duration_class: 'brief' });
    assert.equal(result.working_projection.native_readback.status, 'applied');
  });
});

test('P3 does not offer an activity request as ready speech to the active interlocutor', async () => {
  const intent = 'Я присаживаюсь и жду';
  const request = await captureTurnRequest(intent);
  assert.deepEqual(request.player_safe_state.active_interlocutor, {
    entity_ref: { entity_kind: 'npc', entity_id: 'npc:9' },
    display_label: 'Жирко'
  });
  const speechOptions = speechOptionsIn(request);
  assert.equal(speechOptions.some(({ content }) => content.includes(intent)), false);
});

test('P3 quotes only the supplied spoken words in an offered speech option', async () => {
  const request = await captureTurnRequest('Говорю Жирко: «Здравствуй»');
  const speechOptions = speechOptionsIn(request);
  assertSuppliedSpeechOptions(speechOptions, 'Здравствуй');
});

async function captureTurnRequest(intent) {
  let capturedRequest;
  await assert.rejects(runP3TurnStep({ intent, observation: replyFrame({ turn: 3 }),
    operationId: 'p3-request-capture', nativeSpeechOnly: true,
    targetActorRef: 'npc:9',
    nativeAdapter: { writeOperationRequest: async () => {},
      readOperationReadback: async () => ({}) },
    turnStepModel: async (request) => {
      capturedRequest = request;
      throw new Error('capture P3 turn request');
    } }), /capture P3 turn request/u);
  return capturedRequest;
}

function speechOptionsIn(value, seen = new WeakSet()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  const options = value.op === 'emit_interaction'
      && value.interaction_kind === 'speech' ? [value] : [];
  const children = Array.isArray(value) ? value : Object.values(value);
  return [...options, ...children.flatMap((child) => speechOptionsIn(child, seen))];
}

function speechPlan(request, loudness, utteranceText = 'Берегись!') {
  return { schema: 'turn_step_plan_v1', request_id: request.request_id,
    committed_state_version: request.committed_state_version,
    working_revision: request.working_revision, step_index: request.step_index,
    interpretation: { player_goal: request.root_player_action,
      grounded_attempt: 'Берегись!', adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null, continuation: null, clarification: null,
    direct_result_kind: 'player_utterance',
    utterance: { speaker_ref: request.actor.actor_ref,
      utterance_text: utteranceText, input_mode: 'verbatim',
      delivery: { loudness, duration_class: 'brief' } },
    reason_code: 'semantic_plan',
    reason: 'Модель выбрала произносимые слова и способ их произнесения.' };
}
