import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTurnStepPlan, validateTurnStepPlan } from '@rus/turn';
import { requestTurnStepPlanWithRepair } from
  '../../../packages/turn/src/turn-step-loop.js';
import { createTurnStepDomainOwnerPreflight } from
  '../../../packages/turn/src/turn-step-domain-owner-preflight.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import {
  groundedPlan,
  output,
  request
} from './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('impossible jump and absent spaceship plans stay grounded model contracts',
  async (t) => {
    const cases = [{
      name: 'jump',
      action: 'Прыгну очень высоко и осмотрю окрестности как птица',
      adaptation: 'reality_limited',
      groundedAttempt:
        'подпрыгнуть на реальную человеческую высоту и попытаться осмотреться',
      effort: 'moderate',
      reasonCode: 'goal_exceeds_human_jump'
    }, {
      name: 'spaceship',
      action: 'Сажусь в космический корабль и улетаю',
      adaptation: 'make_believe',
      groundedAttempt: 'изобразить посадку в корабль и полёт на месте',
      effort: 'light',
      reasonCode: 'absent_spaceship_make_believe'
    }];
    for (const current of cases) {
      await t.test(current.name, async () => {
        const input = request({
          root_player_action: current.action,
          remaining_intent: current.action
        });
        const model = createLowerDvinaTraceTurnStepModel({
          roleRunner: {
            async run(call) {
              assert.equal(call.messages[0].content.includes(
                current.name === 'jump'
                  ? 'реальные или обычные объекты при физически ограниченном действии означают reality_limited'
                  : 'отсутствие необходимого фантастического объекта означает make_believe'), true);
              return { output: groundedPlan(input, current) };
            }
          }
        });
        const plan = await requestTurnStepPlan({
          request: input,
          turnStepModel: model
        });
        assert.equal(plan.interpretation.adaptation, current.adaptation);
        assert.equal(plan.interpretation.grounded_attempt,
          current.groundedAttempt);
        assert.equal(plan.goal_result, 'not_achieved');
        assert.deepEqual(plan.operations, []);
      });
    }
  });

test('repair role receives original output, request, and structural errors', async () => {
  let seen;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: {
      async run(call) {
        seen = call;
        return { output: output() };
      }
    }
  });
  const input = request();
  const structuralErrors = [{
    path: '$.operations',
    code: 'resolution',
    message: 'domain_request requires exactly one domain operation'
  }];
  await model(input, {
    schema: 'turn_step_repair_context_v1',
    attempt: 2,
    structural_errors: structuralErrors,
    original_output: { resolution: 'domain_request', operation_choice: 'missing' }
  });
  assert.equal(seen.role_id, 'turn_step_planner_repair');
  assert.deepEqual(seen.overrides, { temperature: 0, maxTokens: 20_000,
    reasoningEffort: 'low' });
  const payload = JSON.parse(seen.messages[1].content);
  assert.deepEqual(Object.keys(payload).sort(), ['original_output', 'request', 'structural_errors']);
  assert.deepEqual(payload.original_output,
    { resolution: 'domain_request', operation_choice: 'missing' });
  assert.deepEqual(payload.request, input);
  assert.deepEqual(payload.structural_errors, structuralErrors);
  assert.equal(seen.messages[0].content.includes(
    'Перепланируй поля, указанные в structural_errors, и причинно зависящие от них поля'), true);
  assert.equal(seen.messages[0].content.includes(
    'Для исправления речи без адресата используй полную структуру player_utterance'), false);
  assert.match(seen.messages[0].content,
    /Если единственная ошибка — \$\.activity\.owner: для action production нужна semantic activity[\s\S]*сохрани domain_request и исходную операцию action_production[\s\S]*duration_class и effort[\s\S]*Никогда не очищай operations и не переключайся на direct/u);
  assert.equal(seen.messages[0].content.includes(
    'Отсутствие владельца не доказывает физическую невозможность или фантастику'), true);
  assert.equal(seen.messages[0].content.includes(
    'Никогда не объединяй move_entity и action_production в одном плане'), true);
  assert.equal(seen.messages[0].content.includes(
    'приоритет у семантической привязки: не перемещай отброшенный ref'), true);
  assert.equal(seen.messages[0].content.includes(
    '{"op":"move_entity","entity_ref":"<обоснованный ref источника>","placement"'), true);
  assert.equal(seen.messages[0].content.includes(
    'никогда не сохраняй ref, описание которого указывает на другой объект'), true);
  assert.equal(seen.messages[0].content.includes(
    'Для action_production_identity_grounding сохрани обоснованный источник'), true);
  assert.equal(seen.messages[0].content.includes(
    'удали недоступную domain operation и выполни правомерную прямую попытку reality_limited'), true);
  assert.equal(seen.messages[0].content.includes(
    'Для continuation_progress сохрани исходный порядок действий'), true);
  assert.equal(seen.messages[0].content.includes(
    'Одного равенства continuation.remaining_intent и request.remaining_intent недостаточно'), true);
  assert.equal(seen.messages[0].content.includes(
    'чтобы доказать, что выбранная операция ничего из намерения не выполнила'), true);
  assert.equal(seen.messages[0].content.includes(
    'сохрани её и удали из continuation.remaining_intent только покрытое событие'), true);
  assert.equal(seen.messages[0].content.includes(
    'никогда не возвращай отброшенную более позднюю операцию в operations'), true);
  assert.equal(seen.messages[0].content.includes(
    'Никогда не отбрасывай более раннюю ещё не зафиксированную реплику'), true);
  assert.equal(seen.messages[0].content.includes(
    'сохрани независимые непокрытые действия'), true);
  assert.equal(seen.messages[0].content.includes(
    'Перепланируй поля, указанные в structural_errors, и причинно зависящие от них поля; используй переданные семантические сопоставления и существующие refs, никогда не выдумывай refs.'), true);
  assert.equal(seen.messages[0].content.includes(
    'восстанови подходящее переданное семантическое сопоставление'), true);
  assert.equal(seen.messages[0].content.includes(
    'никогда не подменяй авторский вариант операции широкого охвата'), true);
  assert.equal(seen.messages[0].content.includes(
    'Обязательное исправление запроса ordinary discovery'), false);
  assert.equal(JSON.stringify(payload).includes('turn_step_repair_context_v1'), false);
});

test('semantic repair prompt preserves both discovery continuation shapes',
  async () => {
    const remainingIntent = 'Осмотреть плащ и затем уйти с берега.';
    let prompt;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        prompt = call.messages[0].content;
        return { output: output() };
      }
    } });
    await model(request({ remaining_intent: remainingIntent }), {
      original_output: {}, structural_errors: [{
        path: '$.operations.0.query',
        code: 'ordinary_discovery_query_identity'
      }]
    });
    assert.match(prompt,
      /Обязательное исправление запроса ordinary discovery:[\s\S]*Если discovery — необходимое условие[\s\S]*continuation в точности равен[\s\S]*без потерь сохрани самостоятельный focused discovery[\s\S]*точному непокрытому остатку/u);
    assert.match(prompt,
      /Никогда не пересказывай, не пропускай и не переписывай ни одну из частей/u);
    assert.match(prompt,
      /Никогда не возвращай focused discovery query, начинающийся не с начала remaining_intent[\s\S]*Если вводное действие — подойти, обратить внимание или посмотреть — ведёт к осмотру того же текущего места, включи это вступление в query[\s\S]*Иначе сначала спланируй более раннее действие и сохрани discovery как последующее намерение/u);
});

test('continuation repair treats only the current suffix as executable', async () => {
  const current = 'затем развязываю узел';
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    }
  } });
  await model(request({ step_index: 2, working_revision: 1,
    root_player_action: 'прошу спутника помочь, затем развязываю узел',
    remaining_intent: current,
    completed_steps: [{ step_index: 1, summary: 'прошу спутника помочь' }] }), {
    original_output: {}, structural_errors: [{
      path: '$.continuation.remaining_intent', code: 'continuation_progress'
    }]
  });
  assert.match(prompt,
    /планируй только request\.remaining_intent[\s\S]*root_player_action и completed_steps — история, а не исполняемый ввод[\s\S]*Не повторяй завершённый шаг/u);
  assert.match(prompt,
    /Исправление текущего шага:[\s\S]*затем развязываю узел[\s\S]*root_player_action и completed_steps — история[\s\S]*только точный непокрытый остаток/u);
});

test('operation grounding repair preserves physical acts after discovery',
  async () => {
    let prompt;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        prompt = call.messages[0].content;
        return { output: output() };
      }
    } });
    await model(request(), { original_output: {}, structural_errors: [{
      path: '$.operations.0', code: 'operation_semantic_grounding'
    }] });
    assert.match(prompt,
      /Обязательное исправление привязки операции:[\s\S]*discovery только раскрывает или материализует[\s\S]*он не берёт, не перемещает, не преобразует, не обрабатывает и не использует[\s\S]*Слова, скопированные в запрос discovery, не выполняют физическое действие[\s\S]*continuation каждое физическое действие[\s\S]*текстовый префикс/u);
    assert.match(prompt,
      /current_visible_context\.sensory_details или значения visible_status у visible_npc прямо на каждый запрошенный видимый факт[\s\S]*включая явно отрицательный факт[\s\S]*achieved direct player_safe_observation/u);
  });

test('repair drops a field rejected as an additional property', async () => {
  const input = request();
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: output() }; }
  } });
  const plan = await model(input, {
    original_output: { ...output(), interpretation: {
      ...output().interpretation, adaptation_type: 'literal' } },
    structural_errors: [{ path: '$.interpretation.adaptation_type',
      code: 'additional_property', message: 'is forbidden' }]
  });
  assert.equal('adaptation_type' in plan.interpretation, false);
});

test('repair omission clears rejected top-level speech fields', async () => {
  const input = request();
  const original = { ...output(), resolution: 'direct', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], direct_result_kind: 'player_utterance',
    utterance: { speaker_ref: 'actor_mikula', utterance_text: 'Доброе утро.',
      input_mode: 'verbatim', delivery: { loudness: 2,
        duration_class: 'instant' } },
    continuation: { remaining_intent: input.remaining_intent,
      depends_on_refs: [] } };
  const repaired = { ...original,
    interpretation: { ...original.interpretation,
      grounded_attempt: 'Подхожу к собеседнику' },
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    continuation: { remaining_intent: 'и говорю: «Доброе утро.»',
      depends_on_refs: [] } };
  delete repaired.direct_result_kind;
  delete repaired.utterance;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: repaired }; }
  } });

  const plan = await model(input, { original_output: original,
    structural_errors: [
      { path: '$.direct_result_kind', code: 'direct_result_kind' },
      { path: '$.utterance', code: 'operation_semantic_grounding' }
    ] });

  assert.equal(plan.direct_result_kind, null);
  assert.equal(Object.hasOwn(plan, 'utterance'), false);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
});

test('unrelated repair cannot invent a code-owned operation selector',
  async () => {
    const operation = { op: 'request_discovery', actor_ref: 'actor_mikula',
      discovery_kind: 'inspect', target_refs: ['location:wreck'],
      query: 'Подробно осмотреть место крушения' };
    const generic = { ...operation,
      query: 'Осмотреть берег в поисках сухого топлива' };
    const input = request({ remaining_intent: generic.query,
      available_domain_operations: [operation] });
    const original = { ...output(), interpretation: {
      player_goal: generic.query, adaptation: 'literal'
    }, resolution: 'domain_request', operations: [generic] };
    delete original.operation_choice;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: { ...original,
        interpretation: { ...original.interpretation,
          grounded_attempt: generic.query },
        operations: [operation],
        operation_choice: 'domain_operation_1_request_discovery_inspect',
        operation_family: 'request_discovery' } }; }
    } });
    const repaired = await model(input, { original_output: original,
      structural_errors: [{ path: '$.interpretation.grounded_attempt',
        code: 'required', message: 'is required' }] });
    assert.deepEqual(repaired.operations, [generic]);
    assert.equal(Object.hasOwn(repaired, 'operation_choice'), false);
    assert.equal(Object.hasOwn(repaired, 'operation_family'), false);
  });

test('unrelated repair preserves the selected exact operation DTO', async () => {
  const exact = { op: 'request_discovery', actor_ref: 'actor_mikula',
    discovery_kind: 'inspect', target_refs: ['location:wreck'],
    query: 'Подробно осмотреть место крушения' };
  const unrelated = { ...exact, query: 'Искать обычное топливо' };
  const input = request({ available_domain_operations: [exact] });
  const original = { ...output(), interpretation: {
    player_goal: input.root_player_action, adaptation: 'literal'
  }, resolution: 'domain_request', operations: [exact] };
  delete original.operation_choice;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: { ...original,
      interpretation: { ...original.interpretation,
        grounded_attempt: input.remaining_intent },
      operations: [unrelated], operation_choice: null } }; }
  } });
  const repaired = await model(input, { original_output: original,
    structural_errors: [{ path: '$.interpretation.grounded_attempt',
      code: 'required', message: 'is required' }] });
  assert.deepEqual(repaired.operations, [exact]);
  assert.equal(Object.hasOwn(repaired, 'operation_choice'), false);
  assert.equal(Object.hasOwn(repaired, 'copied_operation_choice'), false);
  assert.equal(validateTurnStepPlan(repaired, { request: input }).ok, true);
});

test('grounding repair keeps the model semantic result unchanged',
  async () => {
    const intent = 'Подбираю доску и делаю из неё опору.';
    const input = request({ root_player_action: intent,
      remaining_intent: intent });
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: {
        ...output(), resolution: 'domain_request',
        interpretation: { player_goal: intent,
          grounded_attempt: 'Осмотреть доску.', adaptation: 'literal' },
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
          discovery_kind: 'inspect', target_refs: ['location:shore'],
          query: 'доска' }],
        continuation: { remaining_intent: 'делаю из неё опору',
          depends_on_refs: [] }, operation_choice: null
      } }; }
    } });
    const plan = await model(input, {
      structural_errors: [{ code: 'source_semantic_grounding' }],
      original_output: {}
    });
    assert.equal(plan.continuation.remaining_intent, 'делаю из неё опору');
    assert.equal(plan.interpretation.grounded_attempt,
      'Осмотреть доску.');
  });

test('assembler derives redundant A1 carrier refs from semantic source refs',
  async () => {
    const input = request();
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: {
        ...output(), resolution: 'domain_request',
        activity: { owner: 'semantic', duration_class: 'brief',
          effort: 'light' }, operations: [{ op: 'request_item_use',
          actor_ref: 'actor_mikula', item_ref: 'wrong', use_kind: 'other',
          target_refs: ['also-wrong'], action_production: {
            source_refs: ['source', 'binding'], tool_refs: ['tool'],
            requested_output_count: null, identity_mode: 'preserve_source',
            origin: null, result_class: 'ordinary_physical_result',
            material_extent: 'whole', result_descriptor: {
              display_name: null, physical_description: 'bound support',
              qualitative_facts: ['bound'], removed_physical_fact_refs: [],
              inscription_text: null, physical_form: 'long',
              source_fact_delta: null }, output_class: 'ordinary_mundane'
          } }], operation_choice: null
      } }; }
    } });
    const plan = await model(input);
    assert.equal(plan.operations[0].item_ref, 'source');
    assert.deepEqual(plan.operations[0].target_refs, ['binding', 'tool']);
  });

test('one repair receives structural and semantic grounding errors together',
  async () => {
    const calls = [];
    const input = request();
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        calls.push(call);
        if (calls.length > 1) return { output: output() };
        return { output: { ...output(), resolution: 'domain_request',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [{ op: 'request_item_use', actor_ref: 'actor_mikula',
            item_ref: 'knife', use_kind: 'other', target_refs: [],
            action_production: { source_refs: ['knife'], tool_refs: [],
              requested_output_count: null, identity_mode: 'preserve_source',
              origin: null, result_class: 'ordinary_physical_result',
              material_extent: null, result_descriptor: { display_name: null,
                physical_description: 'настил из досок', qualitative_facts: [],
                removed_physical_fact_refs: [], inscription_text: null,
                physical_form: null, source_fact_delta: null },
              output_class: 'ordinary_mundane' } }], operation_choice: null
        } };
      }
    } });
    const semanticPlanValidator = async ({ plan }) => {
      if (!plan.operations?.[0]?.action_production) return true;
      throw Object.assign(new Error('source mismatch'), {
        code: 'TURN_STEP_PLAN_INVALID', details: { errors: [{
          path: '$.operations.0.action_production.source_refs',
          code: 'source_semantic_grounding', message: 'source mismatch'
        }] }
      });
    };
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model, semanticPlanValidator });
    const repair = JSON.parse(calls[1].messages[1].content);
    assert.equal(result.repaired, true);
    assert.equal(repair.structural_errors.some(({ code }) =>
      code === 'resolution'), true);
    assert.equal(repair.structural_errors.some(({ code }) =>
      code === 'source_semantic_grounding'), true);
  });

test('primary JSON parse failure does not invoke semantic repair', async () => {
  const calls = [];
  const input = request();
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      calls.push(call);
      if (calls.length === 1) throw Object.assign(new Error('bad JSON'), {
        code: 'json_parse_failed'
      });
      return { output: groundedPlan(input, {
        adaptation: 'literal', groundedAttempt: 'открыть сундук',
        effort: 'light', reasonCode: 'repaired'
      }) };
    } }
  });
  await assert.rejects(requestTurnStepPlanWithRepair({
    request: input, turnStepModel: model
  }), (error) => error.code === 'TURN_STEP_PLAN_INVALID'
    && error.details.repair_attempted === false);
  assert.deepEqual(calls.map(({ role_id }) => role_id), ['turn_step_planner']);
});

test('unknown operation choice fails without semantic repair',
  async () => {
    const calls = [];
    const input = request({ available_domain_operations: [{
      op: 'request_movement', actor_ref: 'actor_mikula',
      movement_kind: 'route', target_ref: 'location:admitted-only',
      description: 'Move along the visible route.'
    }] });
    const model = createLowerDvinaTraceTurnStepModel({
      roleRunner: { async run(call) {
        calls.push(call);
        if (calls.length === 1) return { output: {
          ...output(), resolution: 'domain_request',
          operation_choice: 'invented-choice'
        } };
        return { output: output() };
      } }
    });
    await assert.rejects(requestTurnStepPlanWithRepair({
      request: input, turnStepModel: model
    }), (error) => error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.repair_attempted === false);
    assert.equal(calls.length, 1);
  });

test('canonicalizer restores an exact copied code-owned choice without repair',
  async () => {
    const operation = { op: 'request_discovery', actor_ref: 'actor_mikula',
      discovery_kind: 'inspect', target_refs: ['location:wreck'],
      query: 'Осмотреть место крушения' };
    const input = request({ available_domain_operations: [operation] });
    let calls = 0;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() {
        calls += 1;
        return { output: { ...output(), resolution: 'domain_request',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operations: [operation], operation_choice: null } };
      }
    } });

    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model });

    assert.equal(result.repaired, false);
    assert.deepEqual(result.plan.operations, [operation]);
    assert.equal(calls, 1);
});

test('canonicalizer unwraps a supplied choice id without repair', async () => {
  const operation = { op: 'request_movement', actor_ref: 'actor_mikula',
    movement_kind: 'route', target_ref: 'location:road' };
  const input = request({ available_domain_operations: [operation],
    player_safe_state: { visible_entities: [{ entity_ref: 'location:road' }] } });
  let calls = 0;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { calls += 1; return { output: { ...output(),
      resolution: 'domain_request',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operation_choice: {
        choice_id: 'domain_operation_1_request_movement_route'
      }, operations: [] } }; }
  } });
  const result = await requestTurnStepPlanWithRepair({ request: input,
    turnStepModel: model });
  assert.equal(result.repaired, false);
  assert.deepEqual(result.plan.operations, [operation]);
  assert.equal(calls, 1);
});
