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

test('discovery cannot consume physical acts copied into its query', async () => {
  const remainingIntent =
    'Обматываю найденной лозой треснувшую рукоять, затем возвращаюсь к тропе.';
  const discoveryQuery = 'Обматываю найденной лозой треснувшую рукоять';
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run(call) {
      assert.match(call.messages[0].content,
        /Верни только JSON с двумя ключами[\s\S]*request_discovery выполняет относительно remaining_intent[\s\S]*mode="material_prerequisite"[\s\S]*физическое действие остаётся неисполненным/u);
      const payload = JSON.parse(call.messages[1].content);
      assert.equal(payload.operation.query, discoveryQuery);
      assert.deepEqual(payload.effect_contract, {
        may_consume_discovery_intent: true,
        may_reveal_or_materialize: true,
        may_acquire_referent: false,
        may_relocate_referent: false,
        may_transform_referent: false,
        may_handle_referent: false,
        may_use_referent: false,
        unexecuted_physical_intent_must_remain_in_continuation: true
      });
      assert.deepEqual(Object.keys(payload).sort(), [
        'continuation', 'effect_contract', 'operation', 'player_safe_state', 'remaining_intent'
      ]);
      return { output: { mode: 'material_prerequisite',
        consumed_intent: null } };
    } }
  });
  await assert.rejects(validate({ request: {
    request_id: 'turn-step:physical-prefix', remaining_intent: remainingIntent,
    player_safe_state: {
      position: { location_ref: 'location:yard' },
      ordinary_resolution: { discovery_available: true,
        container_resolution_available: false, scene_seed_available: false }
    }
  }, plan: { check: null, operations: [{ op: 'request_discovery',
    actor_ref: 'actor:1', discovery_kind: 'inspect',
    target_refs: ['location:yard'], query: discoveryQuery }],
  continuation: { remaining_intent: 'затем возвращаюсь к тропе.',
    depends_on_refs: [] } }, resolved_domain_operations: [{
    path: '$.operations.0', owner_kind: 'ordinary_discovery'
  }] }), (error) => error.code === 'TURN_STEP_PLAN_INVALID'
    && error.details.errors[0].code === 'operation_semantic_grounding');
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
      assert.match(call.messages[0].content,
        /visible_npc visible_status[\s\S]*already supplied current observations[\s\S]*current NPC activity/u);
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

test('focused ordinary classifier omits unrelated authored discovery scope',
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
        assert.deepEqual(Object.keys(payload).sort(), [
          'continuation', 'effect_contract', 'operation', 'player_safe_state', 'remaining_intent'
        ]);
        return { output: { mode: 'focused_discovery',
          consumed_intent: payload.remaining_intent } };
      } }
    });
    assert.equal(await validate({ request: genericRequest, plan: genericPlan,
      resolved_domain_operations: [{ path: '$.operations.0',
        owner_kind: 'ordinary_discovery' }] }), true);
  });

test('focused ordinary classifier fails closed on invalid mode or shape',
  async () => {
    const remainingIntent = 'Осмотреть скол на чаше';
    const operation = { op: 'request_discovery', actor_ref: 'actor:1',
      discovery_kind: 'inspect', target_refs: ['location:workshop'],
      query: remainingIntent };
    for (const output of [
      { mode: 'unknown', consumed_intent: null },
      { mode: 'focused_discovery', consumed_intent: 7 }
    ]) {
      const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
        roleRunner: { async run(call) {
          const payload = JSON.parse(call.messages[1].content);
          assert.deepEqual(payload.operation, operation);
          assert.equal(payload.remaining_intent, remainingIntent);
          assert.equal(payload.effect_contract.may_use_referent, false);
          return { output };
        } }
      });
      await assert.rejects(validate({ request: {
        request_id: 'turn-step:invalid-focused-classifier', remaining_intent:
          remainingIntent, player_safe_state: {
            ordinary_resolution: { discovery_available: true,
              container_resolution_available: false,
              scene_seed_available: false },
            position: { location_ref: 'location:workshop' }
          }
      }, plan: { operations: [operation], check: null, continuation: null },
      resolved_domain_operations: [{ path: '$.operations.0',
        owner_kind: 'ordinary_discovery' }] }), (error) =>
        error.code === 'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID'
          && error.status === 503);
    }
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


test('grounding audit receives the exact typed discovery queue and independent after intent', async () => {
  for (const [query, targets, after] of [
    ['Осмотреть рубаху и верхнюю одежду: насколько они промокли?',
      ['garment:base', 'garment:outer'], null],
    ['Осмотреть рубаху и верхнюю одежду: насколько они промокли?',
      ['garment:base', 'garment:outer'],
      { remaining_intent: 'Затем снять верхнюю одежду.', depends_on_refs: [] }],
    ['Проверить чашу и кувшин на трещины.', ['vessel:cup', 'vessel:jug'], null]
  ]) {
    const continuation = { remaining_intent: query, depends_on_refs: [],
      pending_discovery: { remaining_target_refs: targets.slice(1), after } };
    const queuedPlan = { check: null, continuation, operations: [{
      op: 'request_discovery', actor_ref: 'actor:1', discovery_kind: 'inspect',
      target_refs: targets.slice(0, 1), query }] };
    const queuedRequest = { ...request, remaining_intent: after == null
      ? query : `${query} ${after.remaining_intent}`, player_safe_state: {
      ordinary_resolution: { discovery_available: true,
        container_resolution_available: false, scene_seed_available: false },
      visible_objects: targets.map(entity_id => ({
        entity_ref: { entity_kind: 'item', entity_id } })) } };
    const before = structuredClone({ queuedPlan, queuedRequest });
    let calls = 0;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run(call) {
        calls += 1;
        const prompt = call.messages[0].content;
        assert.match(prompt, /remaining_intent carries the exact current operation query/u);
        assert.match(prompt, /after:null means no later action/u);
        assert.match(prompt, /Without pending_discovery, when discovery leaves/u);
        assert.doesNotMatch(prompt, /When discovery leaves the complete remaining_intent unchanged/u);
        const payload = JSON.parse(call.messages[1].content);
        assert.deepEqual(payload.continuation, continuation);
        assert.deepEqual(payload.operations[0].operation, queuedPlan.operations[0]);
        assert.equal(payload.remaining_intent, queuedRequest.remaining_intent);
        return { output: { pass: true, concerns: [] } };
      } }
    });
    assert.equal(await validate({ request: queuedRequest, plan: queuedPlan,
      resolved_domain_operations: [{ path: '$.operations.0', owner_kind: 'ordinary_discovery' }] }), true);
    assert.equal(calls, 1);
    assert.deepEqual({ queuedPlan, queuedRequest }, before);
  }
});
