import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';

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
        assert.deepEqual(payload.operations, [{ path: '$.utterance', utterance }]);
        assert.equal(payload.remaining_intent, intent);
        assert.match(call.messages[0].content, /cannot be rewritten by choosing intent_paraphrase/u);
        return { output: { pass: false, concerns: [{
          kind: 'operation_semantic_grounding' }] } };
      } }
    });
    await assert.rejects(validate({ request: { ...request, remaining_intent: intent },
      plan: { direct_result_kind: 'player_utterance', utterance, operations: [] } }),
    (error) => error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.errors[0].path === '$.utterance');
  }
});

test('generic discovery keeps deterministic intent identity before semantic audit',
  async () => {
    let calls = 0;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { calls += 1; return { output: {
        pass: true, concerns: [] } }; } }
    });
    const remainingIntent = 'обыскать полосу берега в поисках сухой верёвки';
    const genericRequest = { request_id: 'turn-step:generic', remaining_intent:
      remainingIntent, player_safe_state: {
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
    assert.equal(calls, 1);
    assert.equal(await validate({ request: genericRequest,
      plan: genericPlan, resolved_domain_operations: [{
        path: '$.operations.0', owner_kind: 'external'
      }] }), true);
    assert.equal(calls, 2);
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
    assert.equal(calls, 2);
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
        assert.equal(payload.continuation.remaining_intent,
          payload.remaining_intent);
        return { output: payload.operations[0].operation.query === 'следы лодки'
          ? { pass: false,
            concerns: [{ kind: 'operation_semantic_grounding' }] }
          : { pass: true, concerns: [] } };
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
      reason_code: 'find_needed_material', check: null,
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
    await assert.rejects(validate({ request: requestFor(attempts[0].intent),
      plan: dropped, resolved_domain_operations: owner }), (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.deepEqual(error.details.errors.map(({ path, code }) =>
        ({ path, code })), [
        { path: '$.operations.0.query',
          code: 'ordinary_discovery_query_identity' },
        { path: '$.continuation.remaining_intent',
          code: 'ordinary_discovery_query_identity' }
      ]);
      return true;
    });
    assert.equal(calls, 3);
  });

test('body-under-clothing discovery is rejected while clothing inspection remains valid',
  async () => {
    const seen = [];
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        const payload = JSON.parse(call.messages[1].content);
        seen.push(payload);
        return { output: payload.remaining_intent.includes('под плащом')
          ? { pass: false, concerns: [{ kind: 'operation_semantic_grounding' }] }
          : { pass: true, concerns: [] } };
      } }
    });
    const remainingIntent = 'Осмотреть боль в плече под плащом';
    const operation = { op: 'request_discovery', actor_ref: 'actor:1',
      discovery_kind: 'inspect', target_refs: ['item:cloak'],
      query: remainingIntent };
    const genericRequest = { request_id: 'turn-step:body-under-cloak',
      remaining_intent: remainingIntent, player_safe_state: {
        ordinary_resolution: { discovery_available: true,
          container_resolution_available: false, scene_seed_available: false },
        current_visible_context: { visible_objects: [
          { entity_ref: { entity_kind: 'item', entity_id: 'item:cloak' } }
        ] }
      }, actor: { actor_ref: 'actor:1', body: { active_conditions: [{
        id: 'shoulder_bruise', status: 'active'
      }] } } };
    const owner = [{ path: '$.operations.0',
      owner_kind: 'ordinary_discovery' }];
    await assert.rejects(validate({ request: genericRequest,
      plan: { operations: [operation], check: null, continuation: null },
      resolved_domain_operations: owner }), (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.equal(error.details.errors[0].code,
        'operation_semantic_grounding');
      return true;
    });
    const clothingIntent = 'Осмотреть плащ: не порван ли он и насколько мокрый';
    assert.equal(await validate({ request: { ...genericRequest,
      remaining_intent: clothingIntent }, plan: { operations: [{ ...operation,
        query: clothingIntent }], check: null, continuation: null },
      resolved_domain_operations: owner }), true);
    assert.deepEqual(seen[0].actor_body.active_conditions,
      genericRequest.actor.body.active_conditions);
    assert.match(JSON.stringify(seen[0]), /shoulder_bruise/u);
    assert.equal(seen.length, 2);
  });

test('turn-step grounding audit returns repairable source errors', async () => {
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run(call) {
      assert.equal(call.role_id, 'turn_step_grounding_auditor');
      assert.match(call.messages[0].content,
        /operation_semantic_grounding[\s\S]*ordinary material[\s\S]*acquisition or gathering[\s\S]*practical use/u);
      assert.match(call.messages[0].content,
        /ordinary belongings, supplies, tools, materials, reusable remnants[\s\S]*later practical use[\s\S]*not authored investigation[\s\S]*same[\s\S]*place, object, or prior event/u);
      assert.equal(JSON.parse(call.messages[1].content).operations[0]
        .operation.action_production.source_refs[0], 'knife:1');
      assert.deepEqual(JSON.parse(call.messages[1].content).player_safe_state
        .available_domain_operation_grounding, []);
      assert.equal(JSON.parse(call.messages[1].content).player_safe_state
        .observed_evidence_inspection.candidates[0].fact_ref,
      'fact:boot-track');
      return { output: { pass: false,
        concerns: [{ kind: 'source_semantic_grounding' }] } };
    } }
  });
  await assert.rejects(validate({ request, plan }), (error) => {
    assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(error.details.errors[0].code, 'source_semantic_grounding');
    return true;
  });
});

test('grounding audit omits an unrelated authored discovery scope',
  async () => {
    const genericRequest = { ...request,
      remaining_intent: 'оценить прочность льда по трещинам и цвету',
      player_safe_state: { ...request.player_safe_state,
        position: { location_ref: 'location:river' },
        ordinary_resolution: { discovery_available: true,
          container_resolution_available: false, scene_seed_available: false },
        available_domain_operation_grounding: [{
          operation: { op: 'request_discovery', actor_ref: 'actor:1',
            discovery_kind: 'inspect', target_refs: ['location:river'],
            query: 'Осмотреть следы у проруби' },
          semantic_scope: { authority: 'authored_evidence_investigation',
            purpose: 'inspect authored tracks' }
        }]
      } };
    const genericPlan = { continuation: null, operations: [{
      op: 'request_discovery', actor_ref: 'actor:1', discovery_kind: 'inspect',
      target_refs: ['location:river'],
        query: genericRequest.remaining_intent
    }] };
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        const payload = JSON.parse(call.messages[1].content);
        assert.deepEqual(payload.player_safe_state
          .available_domain_operation_grounding, []);
        return { output: { pass: true, concerns: [] } };
      } }
    });
    assert.equal(await validate({ request: genericRequest, plan: genericPlan,
      resolved_domain_operations: [{ path: '$.operations.0',
        owner_kind: 'ordinary_discovery' }] }), true);
  });

test('grounding audit retains the exact authored discovery scope', async () => {
  const operation = request.player_safe_state
    .available_domain_operation_grounding[0].operation;
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run(call) {
      const [grounding] = JSON.parse(call.messages[1].content)
        .player_safe_state.available_domain_operation_grounding;
      assert.equal(grounding.semantic_scope.authority,
        'authored_evidence_investigation');
      return { output: { pass: true, concerns: [] } };
    } }
  });
  assert.equal(await validate({ request, plan: { continuation: null,
    operations: [operation] } }), true);
});

test('turn-step grounding audit includes generic-check outcome production',
  async () => {
    const outcomePlan = { operations: [], continuation: null, check: {
      outcomes: { clean_success: { operations: plan.operations } }
    } };
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        const [{ path, operation }] = JSON.parse(call.messages[1].content)
          .operations;
        assert.equal(path,
          '$.check.outcomes.clean_success.operations.0');
        assert.equal(operation.action_production.source_refs[0], 'knife:1');
        return { output: { pass: false,
          concerns: [{ kind: 'source_semantic_grounding' }] } };
      } }
    });
    await assert.rejects(validate({ request, plan: outcomePlan }), (error) => {
      assert.equal(error.details.errors[0].path,
        '$.check.outcomes.clean_success.operations.0.action_production.source_refs');
      return true;
    });
  });

test('turn-step grounding audit accepts a strict pass', async () => {
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run() {
      return { output: { pass: true, concerns: [] } };
    } }
  });
  assert.equal(await validate({ request, plan }), true);
});

test('operation grounding error identifies its bound exact operation',
  async () => {
    const bound = request.player_safe_state
      .available_domain_operation_grounding[0].operation;
    const discovery = { continuation: null, operations: [{ ...bound,
      query: 'inspect ordinary boards' }] };
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { return { output: { pass: false,
        concerns: [{ kind: 'operation_semantic_grounding' }] } }; } }
    });
    await assert.rejects(validate({ request, plan: discovery,
      resolved_domain_operations: [{ path: '$.operations.0',
        bound_operation: bound }] }), (error) => {
      assert.deepEqual(error.details.errors[0].rejected_operation, bound);
      return true;
    });
  });
