import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '@rus/turn';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
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

async function capturePrompt(input = request()) {
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    }
  } });
  await model(input);
  return prompt;
}

test('turn step planner prompt maps optional prepared followup without forcing it',
  async () => {
    const candidate = { prepared_followup_ref: 'generic-followup',
      precursor_operation: { op: 'request_generic_prepare', actor_ref: 'actor_mikula' },
      operation: { op: 'request_generic_work', actor_ref: 'actor_mikula' } };
    const prompt = await capturePrompt(request({
      remaining_intent: 'сделать несвязанное действие',
      prepared_followup_candidates: [candidate]
    }));
    assert.match(prompt, /Выбирай вариант, только если текущая операция плана совпадает с его precursor_operation[\s\S]*operation по смыслу покрывает всё continuation\.remaining_intent[\s\S]*каждую последующую часть предложения или фразу[\s\S]*prepared_followup_ref равен null/u);
    assert.equal(prompt.includes(JSON.stringify(candidate)), true);
    const continuationExample = prompt.match(/Выбрав вариант,[\s\S]*?полный объект continuation:\s*(\[[\s\S]*?\])\s*Эта метка/u);
    assert.ok(continuationExample);
    const [continuation] = JSON.parse(continuationExample[1]);
    assert.deepEqual(Object.keys(continuation).sort(),
      ['remaining_intent', 'depends_on_refs', 'prepared_followup_ref'].sort());
    assert.equal(typeof continuation.remaining_intent, 'string');
    assert.ok(Array.isArray(continuation.depends_on_refs));
    assert.equal(continuation.prepared_followup_ref,
      candidate.prepared_followup_ref);
  });

test('turn step planner prompt maps grounded and visible-look contracts',
  async () => {
    const input = request();
    const prompt = await capturePrompt(input);
    const mappings = promptMappings(prompt);
    assert.deepEqual(mappings.reality_limited_physical_attempt, {
      interpretation: { adaptation: 'reality_limited' },
      resolution: 'direct', goal_result: 'not_achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'moderate' },
      operations: [], check: null
    });
    assert.deepEqual(mappings.impossible_absent_fantastical_referent, {
      interpretation: { adaptation: 'make_believe' },
      resolution: 'direct', goal_result: 'not_achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
      operations: [], check: null
    });
    assert.equal(validateTurnStepPlan({ schema: 'turn_step_plan_v1',
      request_id: input.request_id,
      committed_state_version: input.committed_state_version,
      working_revision: input.working_revision, step_index: input.step_index,
      interpretation: { player_goal: input.root_player_action,
        grounded_attempt: 'разыграть невозможное действие на месте',
        ...mappings.impossible_absent_fantastical_referent.interpretation },
      resolution: mappings.impossible_absent_fantastical_referent.resolution,
      goal_result: mappings.impossible_absent_fantastical_referent.goal_result,
      activity: mappings.impossible_absent_fantastical_referent.activity,
      operations: mappings.impossible_absent_fantastical_referent.operations,
      check: mappings.impossible_absent_fantastical_referent.check,
      continuation: null, clarification: null,
      direct_result_kind: null,
      reason_code: 'absent_fantastical_referent',
      reason: 'В мире нет такого объекта.'
    }, { request: input }).ok, true);
    assert.deepEqual(mappings.visible_general_look, {
      interpretation: { adaptation: 'literal' },
      resolution: 'direct', goal_result: 'achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
      operations: [], check: null,
      direct_result_kind: 'player_safe_observation'
    });
    assert.equal(mappings.ordinary_scene_seed, undefined);
    assert.match(prompt,
      /ordinary_resolution\.scene_seed_available равен true[\s\S]*seed сцены без кандидатов/u);
    assert.deepEqual(normalizePromptPlaceholders(mappings.spatial_grounded_look), {
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_discovery',
        actor_ref: '<placeholder>',
        discovery_kind: 'look',
        target_refs: ['<placeholder>'],
        query: '<placeholder>' }], check: null
    });
    assert.match(prompt, /используй только значения enum из request или operation contract[\s\S]*не подменяй и не выдумывай refs/u);
    assert.match(prompt, /Соседние относящиеся к текущей сцене действия — посмотреть, послушать, понюхать/u);
    assert.match(prompt,
      /Цель, надежда, способ или ожидаемый результат относятся к тому действию, которое они уточняют/u);
    assert.match(prompt, /Речь никогда не является восприятием[\s\S]*не покрываются player_safe_observation/u);
  });

test('turn step planner offers scene seed instead of direct look while unseeded',
  async () => {
    const prompt = await capturePrompt(request({ player_safe_state: {
      position: { location_ref: 'location:shore' }, ordinary_resolution: {
        discovery_available: true, container_resolution_available: false,
        scene_seed_available: true } } }));
    const mappings = promptMappings(prompt);
    assert.equal(mappings.visible_general_look, undefined);
    assert.deepEqual(normalizePromptPlaceholders(mappings.ordinary_scene_seed), {
      interpretation: { adaptation: 'literal' },
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_discovery',
        actor_ref: '<placeholder>',
        discovery_kind: 'look',
        target_refs: ['<placeholder>'],
        query: 'общий вид ближайшего окружения' }], check: null
    });
  });

test('turn step planner prompt has stated-goal adaptation triage', async () => {
  const prompt = await capturePrompt();
  assert.match(prompt, /Классифицируй interpretation\.adaptation по заявленной цели, а не по тому, может ли актор изобразить действие/u);
  assert.match(prompt, /Сначала: отсутствие необходимого фантастического объекта означает make_believe/u);
  assert.match(prompt, /Иначе реальные или обычные объекты при физически ограниченном действии означают reality_limited/u);
  assert.match(prompt, /Иначе literal/u);
  assert.match(prompt, /Неизвестный или отсутствующий обычный объект от этого не становится фантастическим; сохраняй существующий поток discovery\/domain/u);
});

test('turn step planner routes accessible items and visible environment through owners',
  async () => {
    const prompt = await capturePrompt(request({ player_safe_state: {
      ordinary_resolution: { discovery_available: true },
      items: [{ item_id: 'item:held-cloth', category_id: 'wool_cloth',
        placement: { holder_character_id: 'actor_mikula',
          physical_position: 'equipped' } }],
      current_visible_context: { sensory_details: [
        'Река течёт у самого берега.'
      ], visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc:fisher' },
        display_label: 'рыбак', visible_status: 'чинит сети' }],
      visible_objects: [{ entity_ref: { entity_kind: 'item',
        entity_id: 'item:held-cloth' }, display_label: 'мокрая шерсть',
      visible_status: 'у вас в руках' }] }
    } }));
    assert.match(prompt, /уже доступен и имеет точный пригодный item ref/u);
    assert.match(prompt, /физическая манипуляция или долговременное изменение используют существующего владельца предмета/u);
    assert.match(prompt, /Целенаправленный осмотр любого текущего видимого предмета[\s\S]*ищет новую подробность/u);
    assert.match(prompt, /Чувственная подробность, физически помещающая обычный окружающий материал[\s\S]*ordinary_material_prerequisite[\s\S]*остаётся чувственным фактом, не является пригодным item ref/u);
    assert.match(prompt, /никогда не разрешает утверждать авторитетный, значимый, скрытый или уже установленный факт/u);
    assert.match(prompt, /Для прямого ответа achieved или partially_achieved без операций нужны[\s\S]*player_safe_item_observation/u);
    assert.match(prompt, /player_safe_body_observation — для осмотра тела актора[\s\S]*не подтверждает новую запрошенную травму или диагноз[\s\S]*одежда, лишь упомянутая как закрывающая тело, не превращает действие в осмотр предмета/u);
    assert.match(prompt, /Сохраняй неопределённость; не выводи локальное состояние, причину, прогноз, длительность, новую физическую подробность/u);
    assert.match(prompt,
      /Текущий отрицательный чувственный факт всё равно является полным переданным наблюдением[\s\S]*статусы visible_npc уже отвечают на все запрошенные игроком видимые варианты[\s\S]*achieved direct player_safe_observation/u);
    assert.match(prompt,
      /visible_status у visible_npc — текущие наблюдения, сформированные кодом/u);
    assert.match(prompt,
      /Если статусы visible_npc уже отвечают[\s\S]*achieved direct player_safe_observation[\s\S]*Двоеточие или вопрос[\s\S]*не является последующим действием/iu);
  });

test('turn step planner keeps an ongoing wet-reed smoulder out of A1', async () => {
  const prompt = await capturePrompt(request({
    remaining_intent: 'Оставляю мокрый тростник тлеть.'
  }));
  assert.match(prompt, /action_production описывает только долговременный физический результат на уровне предмета после завершения действия/u);
  assert.match(prompt, /Никогда не используй physical_description, qualitative_facts или source_fact_delta[\s\S]*активный, продолжающийся, самораспространяющийся или зависящий от времени процесс мира/u);
  assert.match(prompt, /Такой процесс требует точной переданной domain operation под управлением кода; выбери соответствующий choice_id/u);
  assert.match(prompt, /Без неё верни честную попытку reality_limited без операции, не утверждая процесс или физический факт/u);
});


test('stable planner keeps the material prerequisite query nominal and full action in continuation', async () => {
  const prompt = await capturePrompt();
  assert.match(prompt, /query, содержащим только именное описание необходимого обычного объекта/u);
  assert.match(prompt, /без получения, перемещения, обработки, использования, преобразования, цели или формулировки действия/u);
  assert.match(prompt, /query не должен совпадать с request\.remaining_intent или копировать его/u);
  assert.match(prompt, /continuation\.remaining_intent должен точно равняться request\.remaining_intent/u);
});
