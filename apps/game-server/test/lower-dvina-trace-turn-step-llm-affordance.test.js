import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { assembleTurnStepPlan } from
  '../src/runtime/lower-dvina-trace-turn-step-plan-assembly.js';
import { request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

function promptMappings(prompt) {
  return Object.fromEntries([...prompt.matchAll(/^Сопоставление: ([^\n]+)\n([^\n]+)/gmu)]
    .map(([, name, json]) => [name, JSON.parse(json)]));
}

function modelFor(input, operationChoice, extra = {}) {
  return createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
    extra.onPrompt?.(call.messages[0].content);
    return { output: {
      interpretation: { player_goal: input.root_player_action,
        grounded_attempt: extra.groundedAttempt ?? input.remaining_intent,
        adaptation: 'literal' },
      resolution: 'domain_request', operation_choice: operationChoice,
      ...(extra.operationFamily === undefined ? {} : { operation_family: extra.operationFamily }),
      check: null, continuation: extra.continuation ?? null, clarification: null,
      reason_code: extra.reasonCode ?? 'focused_discovery',
      reason: extra.reason ?? 'Use supplied operation.'
    } };
  } } });
}

const interlocutor = { entity_ref: { entity_kind: 'npc',
  entity_id: 'npc:interlocutor' }, display_label: 'Visible interlocutor' };
const speech = { op: 'emit_interaction', actor_ref: 'actor:player',
  target_actor_refs: ['npc:interlocutor'], interaction_kind: 'speech',
  content: 'Talk to the active interlocutor.', instrument_refs: [] };

test('ordinary sustained action uses semantic activity instead of speech', async () => {
  const action = 'Жду под навесом два часа.';
  const input = request({ root_player_action: action, remaining_intent: action,
    actor: { actor_ref: 'actor:player' } });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      assert.match(call.messages[0].content,
        /ordinary_semantic_activity[\s\S]*Предложение о действии от первого лица не является произнесёнными словами/u);
      return { output: {
        interpretation: { player_goal: action, grounded_attempt: action,
          adaptation: 'literal' },
        resolution: 'direct', goal_result: 'achieved',
        activity: { owner: 'semantic', duration_class: 'extended',
          effort: 'none', requested_duration_minutes: 120 },
        direct_result_kind: null, operation_choice: null,
        operations: [], check: null, continuation: null,
        clarification: null, reason_code: 'ordinary_semantic_activity',
        reason: 'Waiting is the complete activity.'
      } };
    }
  } });

  const plan = await model(input);
  assert.deepEqual(plan.activity, { owner: 'semantic',
    duration_class: 'extended', effort: 'none',
    requested_duration_minutes: 120 });
  assert.equal(plan.direct_result_kind, null);
});

test('focused discovery outranks general look and preserves continuation', async () => {
  const discovery = { op: 'request_discovery', actor_ref: 'actor:player',
    discovery_kind: 'search', target_refs: ['location:current'],
    query: 'Search current location for new details.' };
  const input = request({ root_player_action: 'Look around and search current location, then wait.',
    remaining_intent: 'Look around and search current location, then wait.',
    actor: { actor_ref: 'actor:player' }, player_safe_state: { position: { location_ref: 'location:current' } },
    available_domain_operations: [discovery] });
  const prompts = [];
  const model = modelFor(input, 'domain_operation_1_request_discovery_search', {
    continuation: { remaining_intent: 'then wait.', depends_on_refs: [] },
    onPrompt: (prompt) => prompts.push(prompt)
  });
  for (const repair of [null, { schema: 'turn_step_repair_context_v1', attempt: 2, structural_errors: [] }]) {
    const plan = await model(input, repair);
    assert.deepEqual(plan.operations, [discovery]);
    assert.equal(plan.continuation.remaining_intent, 'then wait.');
  }
  for (const prompt of prompts) assert.match(prompt,
    /Осмотр или поиск новой физической подробности — целенаправленное восприятие[\s\S]*сначала используй подходящие available_domain_operations[\s\S]*Пассивный взгляд не поглощает целенаправленную часть намерения[\s\S]*visible_general_look/u);
});

test('ordinary material prerequisite has an explicit continuation mapping', async () => {
  const action = 'Подбираю обломок доски и делаю из него опору для плеча.';
  const input = request({ root_player_action: action, remaining_intent: action,
    actor: { actor_ref: 'actor:player' }, player_safe_state: {
      ordinary_resolution: { discovery_available: true },
      visible_entities: [{ entity_ref: 'location:current' }]
    } });
  let prompt;
  await modelFor(input, null, {
    continuation: { remaining_intent: 'Делаю из обломка опору для плеча.',
      depends_on_refs: [] },
    reasonCode: 'ordinary_material_prerequisite',
    onPrompt: (value) => { prompt = value; }
  })(input);
  const mapping = promptMappings(prompt).ordinary_material_prerequisite;
  assert.equal(mapping.resolution, 'domain_request');
  assert.equal(mapping.goal_result, 'pending');
  assert.deepEqual(mapping.operations.map(({ op, discovery_kind }) => ({ op, discovery_kind })),
    [{ op: 'request_discovery', discovery_kind: 'inspect' }]);
  assert.equal(typeof mapping.operations[0].query, 'string');
  assert.deepEqual(mapping.continuation.depends_on_refs, []);
  assert.equal(typeof mapping.continuation.remaining_intent, 'string');
  assert.match(prompt,
    /Если нет подходящей ambient_ordinary_capability или семантически соответствующего пригодного entity_ref предмета[\s\S]*ordinary_material_prerequisite[\s\S]*остаётся лишь чувственным фактом: это не пригодный item ref[\s\S]*continuation\.remaining_intent должен точно равняться request\.remaining_intent[\s\S]*Discovery только раскрывает или материализует[\s\S]*скопированные в его query слова действия не исполняют эти действия/u);
  assert.match(prompt,
    /Эта предпосылка ОБЯЗАТЕЛЬНО имеет приоритет над action_production[\s\S]*Никогда не подменяй названный игроком материал несвязанным inventory, надетым, переносимым или лишь перечисленным item_ref/u);
  assert.match(prompt,
    /Все refs — непрозрачные идентификаторы[\s\S]*только если у этого же ref есть собственная переданная player-safe метка, категория, описание или факты[\s\S]*Чувственный факт без entity_ref не маркирует ни один перечисленный item ref/u);
  assert.match(prompt,
    /Переданный вариант request_discovery покрывает только собственный фиксированный query[\s\S]*никогда не выбирай и не копируй широкий авторский осмотр/u);
});

test('action production prompt matches the active qualitative DTO', async () => {
  const input = request({ root_player_action: 'Приспосабливаю доску как опору.',
    remaining_intent: 'Приспосабливаю доску как опору.',
    actor: { actor_ref: 'actor:player' }, player_safe_state: {
      action_production: { semantic_grounding_available: true,
        max_new_entities: 4,
        allowed_identity_modes: ['preserve_source', 'independent_outputs',
          'no_useful_result'],
        allowed_origins: ['direct_partition', 'crafted'],
        allowed_result_classes: ['ordinary_physical_result'],
        allowed_output_classes: ['ordinary_mundane'],
        allowed_physical_forms: ['compact', 'regular', 'long', 'bulky'] }
    } });
  let prompt;
  await modelFor(input, null, { onPrompt: (value) => { prompt = value; } })(input);
  const mapping = promptMappings(prompt).action_production_preserve_source;
  const [operation] = mapping.operations;
  assert.equal(operation.op, 'request_item_use');
  assert.equal(operation.use_kind, 'other');
  assert.deepEqual(Object.keys(operation.action_production).sort(), [
    'identity_mode', 'material_extent', 'origin', 'output_class',
    'requested_output_count', 'result_class', 'result_descriptor',
    'source_refs', 'tool_refs'
  ].sort());
  assert.deepEqual(Object.keys(operation.action_production.result_descriptor).sort(), [
    'display_name', 'inscription_text', 'physical_description',
    'physical_form', 'qualitative_facts', 'removed_physical_fact_refs',
    'source_fact_delta'
  ].sort());
  assert.equal(operation.action_production.identity_mode, 'preserve_source');
  assert.equal(operation.action_production.result_class, 'ordinary_physical_result');
  assert.equal(operation.action_production.result_descriptor.display_name, null);
  assert.deepEqual(operation.action_production.result_descriptor.removed_physical_fact_refs, []);
  assert.equal(operation.action_production.result_descriptor.source_fact_delta, null);
  assert.match(prompt,
    /В action_production должны быть ровно source_refs, tool_refs, requested_output_count, identity_mode, origin, result_class, material_extent, result_descriptor и output_class/u);
  assert.doesNotMatch(prompt, /request_item_use kind other|output_facts|output_physical_form|fact_removals|independent_outputs":\[\]|preserve_source":true/u);
});

test('partial direct partition accepts the model-owned closed result class',
  async () => {
    const action = 'Отщепляю от найденной щепки тонкую лучину.';
    const input = request({ root_player_action: action,
      remaining_intent: action, actor: { actor_ref: 'actor:player' } });
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: {
        interpretation: { player_goal: action, grounded_attempt: action,
          adaptation: 'literal' }, resolution: 'domain_request',
        goal_result: 'pending', activity: { owner: 'semantic',
          duration_class: 'brief', effort: 'light' },
        operation_family: null, operation_choice: null,
        operations: [{ op: 'request_item_use', actor_ref: 'actor:player',
          item_ref: 'item:chip', use_kind: 'other', target_refs: [],
          action_production: { source_refs: ['item:chip'], tool_refs: [],
            requested_output_count: null,
            identity_mode: 'independent_outputs', origin: 'direct_partition',
            result_class: 'partial_transformation', material_extent: 'minor',
            result_descriptor: { display_name: 'тонкая лучина',
              physical_description: 'тонкая лучина', qualitative_facts: [],
              removed_physical_fact_refs: [], inscription_text: null,
              physical_form: 'long', source_fact_delta: {
                physical_description: 'щепка с отколотым краем',
                qualitative_facts: [], removed_physical_fact_refs: [],
                physical_form: 'compact' } }, output_class: 'ordinary_mundane' }
        }], check: null, continuation: null, clarification: null,
        direct_result_kind: null, reason_code: 'partial_partition',
        reason: 'A thin independent part is split from the source.'
      } }; }
    } });

    const plan = await model(input);
    assert.equal(plan.operations[0].action_production.result_class,
      'partial_transformation');
    assert.equal(plan.operations[0].action_production.material_extent, 'minor');
  });

test('movement keeps supplied semantic label', async () => {
  const movement = { op: 'request_movement', actor_ref: 'actor:player', movement_kind: 'route',
    target_ref: 'location:destination', description: 'Follow marked path to settlement.' };
  const input = request({ root_player_action: 'Head along marked path.', remaining_intent: 'Head along marked path.',
    actor: { actor_ref: 'actor:player' }, player_safe_state: { visible_entities: [{ entity_ref: 'location:destination' }] },
    available_domain_operations: [movement] });
  const model = modelFor(input, 'domain_operation_1_request_movement_route', {
    reasonCode: 'movement', onPrompt: (prompt) => assert.match(prompt, /Follow marked path to settlement/u)
  });
  assert.deepEqual((await model(input)).operations, [movement]);
});

test('movement-shaped placement restores the exact supplied route', () => {
  const movement = { op: 'request_movement', actor_ref: 'actor:player',
    movement_kind: 'route', route_ref: 'route:camp-to-shed',
    target_ref: 'location:shed' };
  const action = 'Иду по дороге к сушильне.';
  const input = request({ root_player_action: action, remaining_intent: action,
    actor: { actor_ref: 'actor:player' },
    available_domain_operations: [movement] });
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: action, grounded_attempt: action,
      adaptation: 'literal' }, resolution: 'direct', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operation_choice: movement.route_ref,
    operations: [{ op: 'request_movement', entity_ref: 'actor:player',
      placement: { relation: 'located_at', target_ref: movement.target_ref } }],
    check: null, continuation: null, clarification: null,
    reason_code: 'movement_requested', reason: 'Use the supplied route.'
  }, input);

  assert.deepEqual(plan.operations, [movement]);
  assert.equal(plan.resolution, 'domain_request');
});

test('authored operation choice exposes its complete semantic scope', async () => {
  const discovery = { op: 'request_discovery', actor_ref: 'actor:player',
    discovery_kind: 'inspect', target_refs: ['location:wreck'],
    query: 'Inspect the wreck evidence.' };
  const semanticScope = { authority: 'authored_evidence_investigation',
    purpose: 'investigate wreck circumstances',
    result_scope: 'bounded authored observations and evidence' };
  const input = request({ available_domain_operations: [discovery],
    player_safe_state: { available_domain_operation_grounding: [{
      operation: discovery, semantic_scope: semanticScope
    }] } });
  let prompt;
  await modelFor(input, 'domain_operation_1_request_discovery_inspect', {
    onPrompt: (value) => { prompt = value; }
  })(input);
  assert.match(prompt,
    /player_safe_grounding.*semantic_scope.*authored_evidence_investigation.*investigate wreck circumstances/u);
  assert.match(prompt,
    /выбирай его только когда текущий шаг соответствует всей этой цели и области результата/u);
});

test('ownerless speech prompt preserves its step before the later domain action',
  async () => {
    const movement = { op: 'request_movement', actor_ref: 'actor:player',
      movement_kind: 'route', target_ref: 'location:camp',
      description: 'Follow path to fishing camp.' };
    const action = 'Зову людей и иду по следам к стану.';
    const input = request({ root_player_action: action, remaining_intent: action,
      actor: { actor_ref: 'actor:player' },
      available_domain_operations: [movement] });
    let prompt;
    await modelFor(input, 'domain_operation_1_request_movement_route', {
      continuation: null,
      onPrompt: (value) => { prompt = value; }
    })(input);
    assert.match(prompt,
      /Короткий оклик, крик или другая реплика без подходящего переданного владельца взаимодействия[\s\S]*отдельный шаг direct player_utterance[\s\S]*сохрани их точный непокрытый остаток в continuation[\s\S]*intent_paraphrase/u);
  });

test('travel prompt prioritizes supplied movement over unrelated inspection', async () => {
  const movement = { op: 'request_movement', actor_ref: 'actor:player', movement_kind: 'route',
    target_ref: 'location:camp', description: 'Follow path to fishing camp.' };
  const inspect = { op: 'request_discovery', actor_ref: 'actor:player', discovery_kind: 'inspect',
    target_ref: 'location:shore', query: 'Inspect wreck.' };
  const input = request({ root_player_action: 'Go to fishing camp along path.',
    remaining_intent: 'Go to fishing camp along path.', actor: { actor_ref: 'actor:player' },
    available_domain_operations: [movement, inspect] });
  const model = modelFor(input, 'domain_operation_1_request_movement_route', {
    onPrompt: (prompt) => assert.match(prompt,
      /Если перемещение — самое раннее независимо исполнимое действие[\s\S]*переданный пункт маршрута[\s\S]*не подменяй текущее перемещение общим действием/u)
  });
  assert.deepEqual((await model(input)).operations, [movement]);
});

test('mismatched semantic operation family cannot restore unrelated choice', async () => {
  const movement = { op: 'request_movement', actor_ref: 'actor:player', movement_kind: 'route', target_ref: 'location:camp' };
  const inspect = { op: 'request_discovery', actor_ref: 'actor:player', discovery_kind: 'inspect', target_refs: ['location:shore'], query: 'Inspect shore.' };
  const input = request({ root_player_action: 'Go to camp.', remaining_intent: 'Go to camp.', actor: { actor_ref: 'actor:player' }, available_domain_operations: [inspect, movement] });
  const plan = await modelFor(input, 'domain_operation_1_request_discovery_inspect', {
    operationFamily: 'request_movement'
  })(input);
  assert.equal(plan.operations, undefined);
});

test('choice id repeated as operation family keeps the exact supplied choice', async () => {
  const operation = { op: 'emit_interaction', actor_ref: 'actor:player',
    interaction_kind: 'request', target_actor_refs: ['npc:interlocutor'],
    instrument_refs: [], content: 'Ask the visible interlocutor.' };
  const input = request({ actor: { actor_ref: 'actor:player' },
    available_domain_operations: [operation] });
  const choiceId = 'domain_operation_1_emit_interaction_request';

  const plan = await modelFor(input, choiceId, {
    operationFamily: choiceId
  })(input);

  assert.deepEqual(plan.operations, [operation]);
});

test('active conversation selects exact supplied interaction', async (t) => {
  for (const remaining_intent of ['Answer active speaker.',
    'Ask what water is safe to drink.', 'Thank active speaker.']) await t.test(remaining_intent, async () => {
    const input = request({ root_player_action: remaining_intent, remaining_intent,
      actor: { actor_ref: 'actor:player' }, player_safe_state: { active_interlocutor: interlocutor },
      available_domain_operations: [speech] });
    const model = modelFor(input, 'domain_operation_1_emit_interaction_speech', {
      reasonCode: 'active_conversation', onPrompt: (prompt) => {
        assert.match(prompt,
          /речь, ответ или вопрос, продолжающий разговор, являются самым ранним независимо исполнимым действием[\s\S]*ОБЯЗАТЕЛЬНО выбери его точный переданный choice_id/u);
        assert.match(prompt,
          /адресованного точно этому персонажу[\s\S]*ОБЯЗАТЕЛЬНО выбери его точный переданный choice_id/u);
        assert.match(prompt,
          /Имя или описание роли, прямо подтверждённое текущей видимой проекцией[\s\S]*имеет приоритет над другим active_interlocutor/u);
        assert.match(prompt,
          /Если одна речевая просьба адресована нескольким видимым персонажам[\s\S]*выбери первого адресата[\s\S]*сохрани просьбу ко всем остальным адресатам в continuation/u);
      }
    });
    assert.deepEqual((await model(input)).operations, [speech]);
  });
});
