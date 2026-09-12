import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { assembleTurnStepPlan } from
  '../src/runtime/lower-dvina-trace-turn-step-plan-assembly.js';
import { validateTurnStepPlan } from '@rus/turn';

const request = {
  request_id: 'turn-step:1', remaining_intent: 'сложить доски в настил',
  player_safe_state: { actor_id: 'actor:1', position: { position_id: 'shore' },
    items: [{ item_id: 'knife:1', category_id: 'personal_utility_knife' }],
    current_visible_context: { sensory_details: ['На берегу лежат доски.'] },
    observed_evidence_inspection: { semantic_grounding_available: true,
      candidates: [{ fact_ref: 'fact:boot-track',
        text: 'В песке виден след сапога.' }] },
    available_domain_operation_grounding: [{
      operation: { op: 'request_discovery', query: 'authored evidence' },
      semantic_scope: { authority: 'authored_evidence_investigation',
        purpose: 'investigate wreck circumstances' }
    }] }
};
const plan = { continuation: null, operations: [{ op: 'request_item_use',
  item_ref: 'knife:1', action_production: {
    source_refs: ['knife:1'], tool_refs: [], identity_mode: 'preserve_source',
    result_descriptor: { physical_description: 'настил из досок' }
  } }] };

test('turn-step grounding audit is skipped outside discovery and production',
  async () => {
    let calls = 0;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { calls += 1; } }
    });
    assert.equal(await validate({ request, plan: { operations: [] } }), true);
    assert.equal(calls, 0);
  });

test('a whole-item move is audited against the requested quantity', async () => {
  const operation = { op: 'move_entity', entity_ref: 'item:branches',
    placement: { relation: 'held_by', target_ref: 'actor:1' } };
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run(call) {
      const payload = JSON.parse(call.messages[1].content);
      assert.equal(payload.remaining_intent, 'собираю пять сухих веток');
      assert.equal(payload.player_safe_state.items[0].quantity, 1);
      assert.deepEqual(payload.operations[0].operation, operation);
      assert.match(call.messages[0].content,
        /move_entity relocates the complete existing identity[\s\S]*plural[\s\S]*exactly the requested[\s\S]*discovery\/materialization/u);
      return { output: { pass: false,
        concerns: [{ kind: 'operation_semantic_grounding' }],
        prerequisite_query: 'сухие ветки', prerequisite_quantity: 5 } };
    } }
  });
  const result = await validate({ request: { ...request,
    remaining_intent: 'собираю пять сухих веток',
    player_safe_state: { ...request.player_safe_state, items: [{
      item_id: 'item:branches', name: 'ветви', quantity: 1,
      placement: { anchor_id: 'shore' }
    }], position: { location_ref: 'shore' }, ordinary_resolution: {
      discovery_available: true
    } }, actor: { actor_ref: 'actor:1' } },
  plan: { continuation: null, operations: [operation] } });
  assert.deepEqual(result.corrected_plan.operations, [{
    op: 'request_discovery', actor_ref: 'actor:1', discovery_kind: 'inspect',
    target_refs: ['shore'], query: 'сухие ветки',
    quantity: { value: 5, unit: 'item' }
  }]);
  assert.deepEqual(result.corrected_plan.continuation, {
    remaining_intent: 'собираю пять сухих веток', depends_on_refs: []
  });
});

test('direct creation cannot duplicate an existing item as an ambient portion',
  async () => {
    let calls = 0;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { calls += 1; } }
    });
    const existing = { op: 'create_entity', temp_ref: 'branches',
      semantic_type: 'material_portion', name: 'ветви', origin: {
        kind: 'ambient_ordinary', source_refs: ['item:branches']
      }, facts: [], mechanics: {}, placement: {
        relation: 'held_by', target_ref: 'actor:1'
      } };
    await assert.rejects(validate({ request: { ...request,
      player_safe_state: { ...request.player_safe_state,
        visible_context: { visible_objects: [{ entity_ref: {
          entity_kind: 'item', entity_id: 'item:branches'
        } }] } } }, plan: { operations: [existing] } }), (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.equal(error.details.errors[0].path, '$.operations.0');
      assert.deepEqual(error.details.errors[0].rejected_operation, existing);
      return true;
    });
    const capabilityRef = 'ambient:wet-sand';
    assert.equal(await validate({ request: { ...request,
      player_safe_state: { ...request.player_safe_state,
        visible_context: { visible_objects: [{ entity_ref: {
          entity_kind: 'ambient_ordinary_capability', entity_id: capabilityRef
        } }] } } }, plan: { operations: [{ ...existing, origin: {
        kind: 'ambient_ordinary', source_refs: [capabilityRef]
      } }] } }), true);
    assert.equal(calls, 0);
  });

test('materialization history cannot silently complete later item acquisition',
  async () => {
    const intent = 'Собираю ветви, затем складываю их.';
    const input = { ...request, schema: 'turn_step_request_v1', root_turn_id: 'turn:1',
      committed_state_version: 1, working_revision: 1, step_index: 2,
      max_internal_steps: 8, root_player_action: intent,
      remaining_intent: intent, completed_steps: [{ step_index: 1,
        summary: 'Ветви материализованы.' }], actor: { actor_ref: 'actor:1' },
      player_safe_state: { ...request.player_safe_state,
        items: [{ item_id: 'item:branches', semantic_type: 'branch',
          name: 'обычный предмет', placement: {
            scene_position_id: 'shore'
          } }] } };
    const candidate = assembleTurnStepPlan({ interpretation: {
      player_goal: intent, grounded_attempt: 'Собираю ветви',
      adaptation: 'literal' }, resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    operations: [], check: null, continuation: {
      remaining_intent: 'затем складываю их.', depends_on_refs: []
    }, clarification: null, direct_result_kind: null,
    reason_code: 'action_already_completed', reason: 'already done' }, input);
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        assert.match(call.messages[0].content,
          /Discovery or materialization in completed history reveals an item but never means the actor already acquired or relocated it/u);
        return { output: { pass: false,
          concerns: [{ kind: 'operation_semantic_grounding' }] } };
      } }
    });
    const structural = validateTurnStepPlan(candidate, { request: input });
    assert.equal(structural.ok, true, JSON.stringify(structural.errors));
    await assert.rejects(validate({ request: input, plan: candidate }),
      (error) => error.code === 'TURN_STEP_PLAN_INVALID'
        && error.details.errors[0].path === '$.activity');
  });

test('ownerless speech crosses the existing grounding auditor before its factual commit', async () => {
  for (const [intent, mode, words] of [
    ['Говорю: «Кто здесь?»', 'intent_paraphrase', 'Я всё отдам за ответ.'],
    ['Он сказал «Иди», а я зову на помощь.', 'verbatim', 'Иди']
  ]) {
    const utterance = { speaker_ref: 'actor:1', input_mode: mode,
      utterance_text: words };
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        const payload = JSON.parse(call.messages[1].content);
        assert.deepEqual(payload.utterance, utterance);
        assert.equal(payload.remaining_intent, intent);
        assert.match(call.messages[0].content, /Нельзя менять явную цитату через intent_paraphrase/u);
        return { output: { speech_faithful: false,
          required_input_mode: intent.startsWith('Говорю') ? 'verbatim' : 'intent_paraphrase',
          unexecuted_intent: null } };
      } }
    });
    await assert.rejects(validate({ request: { ...request, remaining_intent: intent },
      plan: { direct_result_kind: 'player_utterance', utterance, operations: [] } }),
    (error) => error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.errors[0].path === '$.utterance');
  }
});

test('generic discovery keeps deterministic intent identity after focused classification',
  async () => {
    let calls = 0;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        calls += 1;
        const payload = JSON.parse(call.messages[1].content);
        if (payload.operation != null) assert.match(call.messages[0].content,
          /осматривает, ищет или выбирает по указанным признакам[\s\S]*не приобретая, не перемещая, не изменяя и не используя/u);
        return { output: payload.operation == null
          ? { pass: true, concerns: [] }
          : payload.operation.query === 'искать на берегу следы лодки'
            ? { mode: 'different_action', consumed_intent: null }
          : { mode: 'focused_discovery',
            consumed_intent: payload.remaining_intent } };
      } }
    });
    const remainingIntent = 'обыскать полосу берега в поисках сухой верёвки';
    const genericRequest = { request_id: 'turn-step:generic', remaining_intent:
      remainingIntent, actor: { actor_ref: 'actor:1', body: {
        active_conditions: []
      } }, player_safe_state: {
        position: { location_ref: 'location:riverbank' },
        ordinary_resolution: { discovery_available: true,
          container_resolution_available: false, scene_seed_available: false }
      } };
    const genericPlan = { continuation: null, operations: [{
      op: 'request_discovery', actor_ref: 'actor:1', discovery_kind: 'search',
      target_refs: ['location:riverbank'], query: remainingIntent
    }] };
    const ordinaryOwner = [{ path: '$.operations.0',
      owner_kind: 'ordinary_discovery' }];
    assert.equal(await validate({ request: genericRequest,
      plan: genericPlan, resolved_domain_operations: ordinaryOwner }), true);
    const abbreviated = await validate({ request: genericRequest, plan: {
      ...genericPlan, operations: [{ ...genericPlan.operations[0],
        query: 'полосу берега' }]
    }, resolved_domain_operations: ordinaryOwner });
    assert.equal(abbreviated.corrected_plan.operations[0].query,
      remainingIntent);
    const paraphrased = await validate({ request: genericRequest, plan: {
      ...genericPlan, operations: [{ ...genericPlan.operations[0],
        query: 'осмотреть прибрежный участок ради сухой верёвки' }]
    }, resolved_domain_operations: ordinaryOwner });
    assert.equal(paraphrased.corrected_plan.operations[0].query,
      remainingIntent);
    assert.equal(calls, 3);
    assert.equal(await validate({ request: genericRequest,
      plan: genericPlan, resolved_domain_operations: [{
        path: '$.operations.0', owner_kind: 'external'
      }] }), true);
    assert.equal(calls, 4);
    await assert.rejects(validate({ request: genericRequest, plan: {
      ...genericPlan, operations: [{ ...genericPlan.operations[0],
        query: 'искать на берегу следы лодки' }]
    }, resolved_domain_operations: ordinaryOwner }), (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.equal(error.details.errors[0].code,
        'ordinary_discovery_query_identity');
      assert.equal(error.details.errors[0].path, '$.operations.0.query');
      return true;
    });
    assert.equal(calls, 5);
  });

test('focused discovery removes a duplicated suffix after consuming the complete intent',
  async () => {
    const remainingIntent = 'Осматриваю людей и стан.';
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() {
        return { output: { mode: 'focused_discovery',
          consumed_intent: remainingIntent } };
      } }
    });
    const result = await validate({ request: { request_id: 'turn-step:whole-look',
      remaining_intent: remainingIntent, actor: { actor_ref: 'actor:1' },
      player_safe_state: { actor_id: 'actor:1',
        position: { location_ref: 'location:fishing-camp' },
        ordinary_resolution: { discovery_available: true,
          container_resolution_available: false, scene_seed_available: true }
      } }, plan: { check: null, operations: [{ op: 'request_discovery',
        actor_ref: 'actor:1', discovery_kind: 'look',
        target_refs: ['location:fishing-camp'],
        query: 'общий вид ближайшего окружения' }],
      continuation: { remaining_intent: 'и стан.', depends_on_refs: [] } },
    resolved_domain_operations: [{ path: '$.operations.0',
      owner_kind: 'ordinary_discovery' }] });
    assert.equal(result.corrected_plan.operations[0].query, remainingIntent);
    assert.equal(result.corrected_plan.continuation, null);
  });

test('exact full grounded discovery overrides a narrowed consumed phrase',
  async () => {
    const remainingIntent = 'Подхожу к очаговой площадке и внимательно смотрю: действительно ли там горит огонь и где можно сесть?';
    let focusedPrompt;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        focusedPrompt = call.messages[0].content;
        return { output: {
        mode: 'focused_discovery', consumed_intent: 'очаговая площадка'
      } };
      } }
    });
    const result = await validate({ request: {
      request_id: 'turn-step:whole-grounded-look', remaining_intent: remainingIntent,
      actor: { actor_ref: 'actor:1' }, player_safe_state: {
        position: { location_ref: 'location:fishing-camp' },
        ordinary_resolution: { discovery_available: true,
          container_resolution_available: false, scene_seed_available: true }
      }
    }, plan: { interpretation: { grounded_attempt: remainingIntent,
      adaptation: 'literal' }, check: null, clarification: null,
      direct_result_kind: null, operations: [{ op: 'request_discovery',
        actor_ref: 'actor:1', discovery_kind: 'inspect',
        target_refs: ['location:fishing-camp'], query: 'очаговая площадка' }],
      continuation: { remaining_intent: 'и где можно сесть?',
        depends_on_refs: [] } },
    resolved_domain_operations: [{ path: '$.operations.0',
      owner_kind: 'ordinary_discovery' }] });

    assert.equal(result.corrected_plan.operations[0].query, remainingIntent);
    assert.equal(result.corrected_plan.continuation, null);
    assert.match(focusedPrompt,
      /sensory_details .*явное отсутствие.*different_action/u);
  });

test('focused discovery restores its exact grounded prefix before continuation',
  async () => {
    const prefix = 'Подхожу к очаговой площадке и внимательно смотрю';
    const tail = ': действительно ли там горит огонь?';
    const remainingIntent = `${prefix}${tail}`;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { return { output: {
        mode: 'focused_discovery', consumed_intent: 'очаговая площадка'
      } }; } }
    });
    const result = await validate({ request: {
      request_id: 'turn-step:grounded-prefix', remaining_intent: remainingIntent,
      actor: { actor_ref: 'actor:1' }, player_safe_state: {
        position: { location_ref: 'location:fishing-camp' },
        ordinary_resolution: { discovery_available: true,
          container_resolution_available: false, scene_seed_available: true }
      }
    }, plan: { interpretation: { grounded_attempt: prefix,
      adaptation: 'literal' }, check: null, clarification: null,
      direct_result_kind: null, operations: [{ op: 'request_discovery',
        actor_ref: 'actor:1', discovery_kind: 'inspect',
        target_refs: ['location:fishing-camp'], query: 'очаговая площадка' }],
      continuation: { remaining_intent: tail, depends_on_refs: [] } },
    resolved_domain_operations: [{ path: '$.operations.0',
      owner_kind: 'ordinary_discovery' }] });

    assert.equal(result.corrected_plan.operations[0].query, prefix);
    assert.deepEqual(result.corrected_plan.continuation,
      { remaining_intent: tail, depends_on_refs: [] });
  });

test('material prerequisite preserves the full intent and audits its query',
  async () => {
    const attempts = [
      { intent: 'Сплести корзину из ивовых прутьев', query: 'ивовые прутья' },
      { intent: 'Сделать поплавок из куска бересты', query: 'кусок бересты' }
    ];
    let calls = 0;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        calls += 1;
        const payload = JSON.parse(call.messages[1].content);
        assert.deepEqual(payload.continuation.depends_on_refs, []);
        return { output: payload.operation.query === 'следы лодки'
          ? { mode: 'different_action', consumed_intent: null }
          : { mode: 'material_prerequisite', consumed_intent: null,
            ...(payload.continuation.remaining_intent === payload.remaining_intent
              ? {} : { prerequisite_query: payload.operation.query }) } };
      } }
    });
    const owner = [{ path: '$.operations.0',
      owner_kind: 'ordinary_discovery' }];
    const requestFor = (remaining_intent) => ({
      request_id: `turn-step:${remaining_intent}`, remaining_intent,
      player_safe_state: {
        position: { location_ref: 'location:riverbank' },
        ordinary_resolution: { discovery_available: true,
          container_resolution_available: false, scene_seed_available: false }
      }
    });
    const planFor = (remaining_intent, query) => ({
      reason_code: 'find_needed_material', check: null, clarification: null,
      direct_result_kind: null,
      interpretation: { adaptation: 'literal' },
      operations: [{ op: 'request_discovery', actor_ref: 'actor:1',
        discovery_kind: 'inspect', target_refs: ['location:riverbank'], query }],
      continuation: { remaining_intent, depends_on_refs: [] }
    });
    for (const { intent, query } of attempts) {
      assert.equal(await validate({ request: requestFor(intent),
        plan: planFor(intent, query), resolved_domain_operations: owner }), true);
    }
    const unrelated = attempts[0].intent;
    await assert.rejects(validate({ request: requestFor(unrelated),
      plan: planFor(unrelated, 'следы лодки'),
      resolved_domain_operations: owner }), (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.equal(error.details.errors[0].code,
        'operation_semantic_grounding');
      return true;
    });
    const dropped = planFor(attempts[0].intent, attempts[0].query);
    dropped.continuation.remaining_intent = 'Сплести корзину';
    const corrected = await validate({ request: requestFor(attempts[0].intent),
      plan: dropped, resolved_domain_operations: owner });
    assert.equal(corrected.corrected_plan.operations[0].discovery_kind,
      'inspect');
    assert.equal(corrected.corrected_plan.operations[0].query,
      attempts[0].query);
    assert.deepEqual(corrected.corrected_plan.continuation,
      { remaining_intent: attempts[0].intent, depends_on_refs: [] });
    assert.equal(calls, 4);
  });
