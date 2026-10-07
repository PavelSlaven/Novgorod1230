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

function promptMappings(prompt) {
  return Object.fromEntries([...prompt.matchAll(/^Сопоставление: ([^\n]+)\n([^\n]+)/gmu)]
    .map(([, name, json]) => [name, JSON.parse(json)]));
}

function normalizePromptPlaceholders(value) {
  if (typeof value === 'string') return /^<.*>$/su.test(value) ? '<placeholder>' : value;
  if (Array.isArray(value)) return value.map(normalizePromptPlaceholders);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key,
      normalizePromptPlaceholders(child)]));
  return value;
}

test('later generic ordinary discovery drops only an exact stale root query',
  async () => {
    const rootIntent = 'Найти среди обломков сухой материал, прежде чем идти через кусты.';
    const remainingIntent = 'прежде чем идти через кусты.';
    const input = request({ root_player_action: rootIntent,
      remaining_intent: remainingIntent, step_index: 2, working_revision: 1,
      completed_steps: [{ step_index: 1, summary: 'Поиск выполнен.' }],
      player_safe_state: {
        position: { location_ref: 'shore' }, ordinary_resolution: {
          discovery_available: true, container_resolution_available: false,
          scene_seed_available: true
        }
      } });
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: {
        interpretation: { player_goal: rootIntent,
          grounded_attempt: remainingIntent, adaptation: 'literal' },
        resolution: 'domain_request', operation_choice: null,
        operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
          discovery_kind: 'search', target_refs: ['shore'],
          query: rootIntent }], check: null, continuation: null,
        clarification: null,
        direct_result_kind: null, reason_code: 'ordinary_discovery',
        reason: 'Повторный carrier.'
      } }; }
    } });
    let auditCalls = 0;
    const validateGrounding =
      createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner: {
        async run(call) {
          auditCalls += 1;
          return { output: { mode: 'focused_discovery', consumed_intent:
            JSON.parse(call.messages[1].content).remaining_intent } };
        }
      } });
    for (const repairContext of [null, {
      schema: 'turn_step_repair_context_v1', attempt: 2,
      original_output: {}, structural_errors: [{
        path: '$.operations.0.query', code: 'ordinary_discovery_query_identity',
        message: 'must equal the current remaining_intent'
      }]
    }]) {
      const plan = await model(input, repairContext);
      assert.equal(plan.operations[0].query, remainingIntent);
      assert.equal(plan.continuation, null);
      const validation = validateTurnStepPlan(plan, { request: input });
      assert.equal(validation.ok, true, JSON.stringify(validation.errors));
      assert.equal(await validateGrounding({ plan, request: input,
        resolved_domain_operations: [{ path: '$.operations.0',
          owner_kind: 'ordinary_discovery' }] }), true);
    }
    assert.equal(auditCalls, 2);
    const unsafe = assembleTurnStepPlan({
      interpretation: { player_goal: rootIntent,
        grounded_attempt: 'Найти сухую ветку.', adaptation: 'literal' },
      resolution: 'domain_request', operation_choice: null,
      operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
        discovery_kind: 'search', target_refs: ['shore'],
        query: 'сухая ветка' }], check: null, continuation: {
        remaining_intent: 'Потом идти.', depends_on_refs: []
      }, clarification: null, direct_result_kind: null,
      reason_code: 'ordinary_discovery', reason: 'Ищу ветку.'
    }, { ...input, root_player_action:
      'Найти сухую ветку. Разжечь огонь. Потом идти.', remaining_intent:
      'Найти сухую ветку. Разжечь огонь. Потом идти.', step_index: 1 });
    assert.equal(unsafe.operations[0].query, 'сухая ветка');
    assert.equal(unsafe.continuation.remaining_intent, 'Потом идти.');
    await assert.rejects(validateGrounding({ plan: unsafe,
      request: { ...input, root_player_action:
        'Найти сухую ветку. Разжечь огонь. Потом идти.', remaining_intent:
        'Найти сухую ветку. Разжечь огонь. Потом идти.', step_index: 1 },
      resolved_domain_operations: [{ path: '$.operations.0',
        owner_kind: 'ordinary_discovery' }] }), {
      code: 'TURN_STEP_PLAN_INVALID'
    });
  });

test('turn step planner routes an exposed ambient portion through its capability ref', async () => {
  const capabilityRef = 'capability:alluvial-silt-portion-v9';
  const input = request({
    root_player_action: 'Зачерпнуть пригоршню речного ила и сжать её.',
    remaining_intent: 'Зачерпнуть пригоршню речного ила и сжать её.',
    player_safe_state: { visible_context: { visible_objects: [{
      entity_ref: { entity_kind: 'ambient_ordinary_capability', entity_id: capabilityRef },
      display_label: 'пригоршня речного ила', recognition: 'code_owned_source_capability',
      visible_status: 'available', ambient_portion_bounds: { quantity_unit: 'scoop',
        min_quantity: 2, max_quantity: 4, min_mass_grams: 70, max_mass_grams: 900 }
    }] } }
  });
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
    prompt = call.messages[0].content;
    return { output: {
      interpretation: { player_goal: input.root_player_action,
        grounded_attempt: 'Зачерпнуть пригоршню речного ила.', adaptation: 'literal' },
      resolution: 'direct', goal_result: 'achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
      operation_choice: null,
      operations: [{ op: 'create_entity', temp_ref: 'taken-silt',
        semantic_type: 'material_portion', name: 'пригоршня речного ила',
        origin: { kind: 'ambient_ordinary', source_refs: [capabilityRef] }, facts: [],
        mechanics: { mass_grams: 300, external_hand_cost: 1, carry_form: 'compact',
          packing_slot_cost: 1, quantity: { value: 3, unit: 'scoop' }, container: null },
        placement: { relation: 'held_by', target_ref: input.actor.actor_ref } }],
      check: null, continuation: { remaining_intent: 'Сжать взятую порцию.',
        depends_on_refs: ['taken-silt'] }, clarification: null,
      reason_code: 'ambient_ordinary_portion_take', reason: 'Беру видимую порцию.'
    } };
  } } });
  const plan = await model(input);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
  assert.deepEqual(plan.operations[0].origin,
    { kind: 'ambient_ordinary', source_refs: [capabilityRef] });
  assert.equal(plan.goal_result, 'pending');
  assert.deepEqual(plan.continuation,
    { remaining_intent: 'Сжать взятую порцию.', depends_on_refs: ['taken-silt'] });
  assert.match(prompt, /Видимая ambient_ordinary_capability — это точное разрешение и источник, определённые кодом[\s\S]*а не псевдоним существующего предмета и не цель discovery/u);
  assert.match(prompt, /Для взятия используй ambient_ordinary_portion_take раньше ordinary_material_prerequisite или action_production[\s\S]*entity_id capability — единственный origin\.source_refs/u);
  assert.match(prompt, /Скопируй quantity\.unit из ambient_portion_bounds[\s\S]*выбирай quantity\.value и mass_grams только в точных заданных пределах min\/max/u);
  assert.match(prompt, /При commit владелец повторно проверит фактический тип, имя, механику, источник и значения профиля[\s\S]*Никогда не подменяй ref близкого, надетого, переносимого или перечисленного предмета/u);
  assert.match(prompt, /Если действие только берёт предмет, goal_result achieved[\s\S]*составной план pending/u);
});

test('turn step planner and repair prompts map available container access exactly', async () => {
  const prompts = [];
  const candidate = {
    op: 'request_container_access', actor_ref: 'actor_mikula',
    container_ref: 'container:road-bag', access_kind: 'open'
  };
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompts.push(call.messages[0].content);
      return { output: output() };
    } }
  });
  const input = request({
    root_player_action: 'открыть дорожную сумку',
    remaining_intent: 'открыть дорожную сумку',
    player_safe_state: { visible_entities: [{ entity_ref: 'container:road-bag' }] },
    available_domain_operations: [candidate]
  });
  await model(input);
  await model(input, { schema: 'turn_step_repair_context_v1', attempt: 2,
    structural_errors: [] });
  for (const prompt of prompts) {
    const mappings = promptMappings(prompt);
    assert.deepEqual(normalizePromptPlaceholders(mappings.available_container_access), {
      interpretation: { adaptation: 'literal' },
      resolution: 'domain_request',
      operation_choice: '<placeholder>', check: null
    });
    assert.match(prompt, /Если available_domain_operations содержит request_container_access[\s\S]*открыть, закрыть или иначе взаимодействовать с контейнером[\s\S]*available_container_access раньше action_production или direct[\s\S]*выбрав ровно один подходящий переданный choice_id[\s\S]*не воспроизводи и не меняй его operation DTO/u);
  }
});

test('turn step planner maps local fire only through its visible capability', async () => {
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    } }
  });
  await model(request({ remaining_intent: 'вылить воду на огонь',
    player_safe_state: { local_world_process: {
      semantic_grounding_available: true,
      ignition_basis_refs: ['item:firesteel'],
      active_process_refs: ['fire:active'], allowed: [{
        op: 'request_world_process', actor_ref: 'actor_mikula',
        process_action: 'affect', process_ref: 'fire:active',
        process_kind: 'fire', source_refs: ['item:water'], target_refs: [],
        description: 'Воздействовать на огонь.' }] },
      items: [{ item_id: 'item:water' }] }
  }));
  assert.match(prompt, /local_world_process\.semantic_grounding_available/u);
  assert.match(prompt, /есть подходящий кандидат, ОБЯЗАТЕЛЬНО верни[\s\S]*семантический выбор domain_request с его переданным choice_id[\s\S]*никогда не возвращай для этого случая прямой план/u);
  assert.match(prompt, /local_world_process_affect/u);
  assert.match(prompt, /одним видимым целым ref воды/u);
  assert.match(prompt, /Не возвращай request_world_process в ином случае/u);
});

test('turn step planner prompt preserves only compound intent outside capability coverage', async () => {
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    } }
  });
  await model(request({ remaining_intent: 'сначала отдохнуть, потом поговорить' }));
  const mappings = promptMappings(prompt);
  assert.deepEqual(normalizePromptPlaceholders(mappings.direct_item_relocation.operations), [{
    op: 'move_entity', entity_ref: '<placeholder>',
    placement: {
      relation: '<placeholder>',
      target_ref: '<placeholder>'
    }
  }]);
  assert.match(prompt,
    /Прямая подготовка и action_production не могут находиться в одном плане[\s\S]*явно запрошенное место назначения или пространственное отношение[\s\S]*точный player-safe target ref не подтверждает такое размещение[\s\S]*зафиксированном размещении источника[\s\S]*сохрани его невыполненным в continuation[\s\S]*Описание action_production относится только к предмету[\s\S]*но не размещение, крепление, владельца, носителя, адрес назначения или перемещение[\s\S]*При явно заданных действиях в порядке перемещения, преобразования и размещения сначала сейчас выдай move_entity[\s\S]*для каждого следующего размещения снова нужен move_entity/u);
  assert.match(prompt,
    /Для прямого ответа achieved или partially_achieved без операций нужны[\s\S]*player_safe_item_observation[\s\S]*переданных чувственных фактов[\s\S]*новую физическую подробность/u);
  assert.match(prompt, /Выполняй независимые действия в указанном порядке[\s\S]*Если выбор операции покрывает самое раннее текущее действие из намерения, выбери его choice_id/u);
  assert.match(prompt, /Итоговое правило continuation для direct reality_limited или make_believe[\s\S]*часть того же предложения, действие, цель, способ, результат или уточнение[\s\S]*не переносится в continuation/u);
  assert.match(prompt, /Сохрани только части, исполнимые независимо от этой предпосылки, и все последующие предложения[\s\S]*если их нет, установи continuation в null/u);
});

test('turn step planner prompt requests semantic choice without deterministic envelope', async () => {
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    } }
  });
  await model(request());
  const example = JSON.parse(prompt.match(
    /Пример прямого семантического результата:\n(\{[^\n]+\})/u
  )[1]);
  for (const deterministic of ['schema', 'request_id',
    'committed_state_version', 'working_revision', 'step_index']) {
    assert.equal(Object.hasOwn(example, deterministic), false);
  }
  assert.equal(example.operation_choice, null);
  for (const obsoleteKey of [
    'actor_id', 'action_summary', 'semantic_activity', 'activity_type',
    'activity_moment', 'activity_goal', 'activity_context', 'next_step',
    'domain_request'
  ]) assert.equal(obsoleteKey in example, false, obsoleteKey);
  assert.match(prompt, /Не используй устаревшие ключи[\s\S]*continuation\.next_step[\s\S]*remaining_intent[\s\S]*depends_on_refs равен \[\][\s\S]*player-safe refs[\s\S]*prepared_followup_ref[\s\S]*request prepared_followup_candidate[\s\S]*других полей не добавляй/u);
  assert.match(prompt,
    /Выполняй независимые действия в указанном порядке[\s\S]*Выбор переданной операции для более позднего действия никогда не имеет приоритета над более ранним выполнимым действием/u);
  assert.match(prompt,
    /только если перемещение — самое раннее независимо исполнимое действие[\s\S]*Более позднее перемещение не имеет приоритета над более ранней манипуляцией/u);
  assert.match(prompt,
    /Никогда не выдумывай предварительное перемещение[\s\S]*явно не просит переместить его, спланируй саму манипуляцию/u);
  assert.match(prompt,
    /Никогда не представляй разрезание, разрывание, разделение, изменение формы, обёртывание, связывание[\s\S]*action_production independent_outputs[\s\S]*всё последующее использование[\s\S]*continuation/u);
});

test('turn step planner assembles exact domain operation and preserves independent continuation', async () => {
  const candidate = { op: 'request_activity', actor_ref: 'actor_mikula',
    activity_kind: 'recover', target_refs: [],
    description: 'Выполнить первое действие.' };
  const input = request({
    root_player_action: 'Выполнить первое действие. Попросить спутника пойти со мной.',
    remaining_intent: 'Выполнить первое действие. Попросить спутника пойти со мной.',
    available_domain_operations: [candidate]
  });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      assert.match(call.messages[0].content,
        /"choice_id":"domain_operation_1_request_activity_recover"/u);
      return { output: {
        interpretation: { player_goal: input.root_player_action,
          grounded_attempt: 'Выполнить первое действие.', adaptation: 'literal' },
        resolution: 'domain_request',
        operation_choice: 'domain_operation_1_request_activity_recover',
        continuation: { remaining_intent: 'Попросить спутника пойти со мной.',
          depends_on_refs: [] }, clarification: null, check: null,
        reason_code: 'domain_activity', reason: 'Первое действие доступно.'
      } };
    }
  } });
  const plan = await model(input);
  assert.equal(plan.request_id, input.request_id);
  assert.equal(plan.goal_result, 'pending');
  assert.deepEqual(plan.activity,
    { owner: 'domain', duration_class: null, effort: null });
  assert.deepEqual(plan.operations, [candidate]);
  assert.equal(plan.continuation.remaining_intent,
    'Попросить спутника пойти со мной.');
});
