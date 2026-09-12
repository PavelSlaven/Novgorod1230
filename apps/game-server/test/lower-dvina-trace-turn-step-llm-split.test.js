import assert from 'node:assert/strict';
import test from 'node:test';
import {
  requestTurnStepPlan,
  validateTurnStepPlan
} from '@rus/turn';
import { assembleTurnStepPlan, createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('turn step adapter rejects a hand-written admitted operation', async () => {
  const candidate = { op: 'request_item_use', actor_ref: 'actor_mikula',
    item_ref: 'container:road-bag', use_kind: 'operate', target_refs: [] };
  const input = request({ available_domain_operations: [candidate],
    player_safe_state: { visible_entities: [
      { entity_ref: 'container:road-bag' }, { entity_ref: 'npc:zhdanko' }
    ] } });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: {
      interpretation: { player_goal: 'Открыть сумку.',
        grounded_attempt: 'Открыть сумку.', adaptation: 'literal' },
      resolution: 'domain_request', operation_choice: null,
      operations: [{ ...candidate, target_refs: ['npc:zhdanko'],
        description: 'Забрать сумку.' }],
      check: null, continuation: null, clarification: null,
      reason_code: 'container_access', reason: 'Сумка доступна.'
    } }; }
  } });
  const plan = await model(input);
  assert.deepEqual(plan.operations, [{ ...candidate,
    target_refs: ['npc:zhdanko'], description: 'Забрать сумку.' }]);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, false);
});

test('production planner does not invent speech delivery when omitted',
  async () => {
    const input = request({ remaining_intent: 'Говорю: «Да.»',
      root_player_action: 'Говорю: «Да.»' });
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: {
        interpretation: { player_goal: input.remaining_intent,
          grounded_attempt: 'говорю «Да»', adaptation: 'literal' },
        resolution: 'direct', goal_result: 'achieved',
        activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
        direct_result_kind: 'player_utterance', utterance: {
          speaker_ref: input.actor.actor_id, utterance_text: 'Да.',
          input_mode: 'verbatim' }, operations: [], check: null,
        continuation: null, clarification: null, reason_code: 'speech_action',
        reason: 'Произнесены точные слова.'
      } }; }
    } });
    const plan = await model(input);
    assert.equal(plan.utterance.delivery, undefined);
    assert.equal(validateTurnStepPlan(plan, { request: input }).ok, false);
  });

test('turn step adapter restores an exact copied operation choice', () => {
  const candidate = { op: 'request_discovery', actor_ref: 'actor_mikula',
    discovery_kind: 'inspect', target_refs: ['shore'], query: 'Осмотреть.' };
  const input = request({ available_domain_operations: [candidate] });
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: 'Найти доску.',
      grounded_attempt: 'Найти доску.', adaptation: 'literal' },
    resolution: 'domain_request', operation_choice: null,
    operations: [candidate], check: null, continuation: null,
    clarification: null, reason_code: 'ordinary_material_prerequisite',
    reason: 'Нужен ordinary material.'
  }, input);
  assert.deepEqual(plan.operations, [candidate]);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
});

test('turn step adapter restores the unique admitted route from legacy movement fields', () => {
  const movement = { op: 'request_movement', actor_ref: 'actor_mikula',
    movement_kind: 'route', target_ref: 'location:wreck',
    route_ref: 'route:camp-to-wreck', description: 'Вернуться по тропе.' };
  const speech = { op: 'emit_interaction', actor_ref: 'actor_mikula',
    target_actor_refs: ['npc:fisher'], interaction_kind: 'speech',
    content: 'Поговорить с рыбаком.', instrument_refs: [] };
  const input = request({ available_domain_operations: [speech, movement] });
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: 'Вернуться к месту крушения.',
      grounded_attempt: 'Идти по тропе.', adaptation: 'literal' },
    resolution: 'domain_request',
    operation_choice: 'domain_operation_1_emit_interaction_speech',
    operations: [{ op: 'request_movement', actor_ref: 'actor_mikula',
      destination_ref: 'location:wreck', route_ref: 'route:camp-to-wreck' }],
    check: null, continuation: null, clarification: null,
    reason_code: 'movement', reason: 'Идти по известному маршруту.'
  }, input);
  assert.deepEqual(plan.operations, [movement]);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
});

test('turn step adapter does not guess between duplicate admitted raw operations', () => {
  const operation = { op: 'request_item_use', actor_ref: 'actor_mikula',
    item_ref: 'container:road-bag', use_kind: 'operate', target_refs: [] };
  const input = request();
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: 'Открыть сумку.',
      grounded_attempt: 'Открыть сумку.', adaptation: 'literal' },
    resolution: 'domain_request', operation_choice: null,
    operations: [{ ...operation, target_refs: ['npc:zhdanko'],
      description: 'Забрать сумку.' }],
    check: null, continuation: null, clarification: null,
    reason_code: 'container_access', reason: 'Сумка доступна.'
  }, input, [
    { choice_id: 'choice_1', operation },
    { choice_id: 'choice_2', operation: { ...operation,
      target_refs: ['npc:zhdanko'] } }
  ]);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, false);
});

test('turn step choice ids distinguish competing admitted operation kinds',
  async () => {
    const discovery = { op: 'request_discovery', actor_ref: 'actor_mikula',
      discovery_kind: 'inspect', target_refs: ['shore'], query: 'Осмотреть берег.' };
    const fire = { op: 'request_world_process', actor_ref: 'actor_mikula',
      process_action: 'start', process_ref: null, process_kind: 'fire',
      source_refs: ['kindling'], target_refs: ['firesteel'],
      description: 'Разжечь огонь.' };
    const input = request({ available_domain_operations: [discovery],
      player_safe_state: { local_world_process: { allowed: [fire] } } });
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        assert.match(call.messages[0].content,
          /domain_operation_1_request_discovery_inspect/u);
        assert.match(call.messages[0].content,
          /domain_operation_2_request_world_process_start/u);
        return { output: {
          interpretation: { player_goal: 'Разжечь огонь.',
            grounded_attempt: 'Разжечь огонь.', adaptation: 'literal' },
          resolution: 'domain_request',
          operation_choice: 'domain_operation_2_request_world_process_start',
          continuation: null, clarification: null, check: null,
          reason_code: 'local_world_process_start', reason: 'Огонь доступен.'
        } };
      }
    } });
    const plan = await model(input);
    assert.deepEqual(plan.operations, [fire]);
  });

test('turn step choice preserves the selected semantic input variant', async () => {
  const fuel = { op: 'request_world_process', actor_ref: 'actor_mikula',
    process_action: 'affect', process_ref: 'process:active',
    process_kind: 'fire', source_refs: ['item:fuel'], target_refs: [],
    description: 'Добавить топливо в огонь.' };
  const cooling = { ...fuel, source_refs: ['item:cooling'],
    description: 'Воздействовать водой на огонь.' };
  const input = request({ player_safe_state: { local_world_process: {
    allowed: [fuel, cooling] } } });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      assert.match(call.messages[0].content, /Добавить топливо в огонь/u);
      assert.match(call.messages[0].content, /Воздействовать водой на огонь/u);
      assert.match(call.messages[0].content,
        /request_world_process_affect_добавить_топливо_в_огонь/u);
      assert.match(call.messages[0].content,
        /request_world_process_affect_воздействовать_водой_на_огонь/u);
      return { output: {
        interpretation: { player_goal: 'Охладить процесс.',
          grounded_attempt: 'Применить охлаждающий состав.',
          adaptation: 'literal' },
        resolution: 'domain_request',
        operation_choice:
          'domain_operation_2_request_world_process_affect_воздействовать_водой_на_огонь',
        continuation: null, clarification: null, check: null,
        reason_code: 'world_process_affect', reason: 'Выбран подходящий вход.'
      } };
    }
  } });
  const plan = await model(input);
  assert.deepEqual(plan.operations, [cooling]);
});

test('turn step assembly normalizes omitted nullable fields only', () => {
  const input = request();
  const semantic = output();
  delete semantic.check;
  delete semantic.continuation;
  delete semantic.clarification;
  const plan = assembleTurnStepPlan(semantic, input);
  assert.deepEqual(plan.operations, []);
  assert.equal(plan.check, null);
  assert.equal(plan.continuation, null);
  assert.equal(plan.clarification, null);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
  semantic.operations = [];
  semantic.operation_choice = 'unknown_choice';
  assert.equal(assembleTurnStepPlan(semantic, input).operations, undefined);
});
