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

test('exact generic discovery grounding is enforced without an LLM audit',
  async () => {
    let calls = 0;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { calls += 1; throw new Error('must not run'); } }
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
    assert.equal(calls, 0);
    await assert.rejects(validate({ request: genericRequest,
      plan: genericPlan, resolved_domain_operations: [{
        path: '$.operations.0', owner_kind: 'external'
      }] }), /must not run/u);
    assert.equal(calls, 1);
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
    assert.equal(calls, 1);
  });

test('lossless ordinary item-group discovery bypasses opaque-ref LLM audit',
  async () => {
    let calls = 0;
    const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
      roleRunner: { async run() { calls += 1; throw new Error('must not run'); } }
    });
    const query = 'Осмотреть плащ и рубаху';
    const continuation = { remaining_intent: 'затем осмотреть берег.',
      depends_on_refs: [] };
    const remainingIntent = `${query}, ${continuation.remaining_intent}`;
    const operation = { op: 'request_discovery', actor_ref: 'actor:1',
      discovery_kind: 'inspect', target_refs: ['item:cloak', 'item:shirt'],
      query };
    const genericRequest = { request_id: 'turn-step:item-group',
      remaining_intent: remainingIntent, player_safe_state: {
        ordinary_resolution: { discovery_available: true,
          container_resolution_available: false, scene_seed_available: false },
        current_visible_context: { visible_objects: [
          { entity_ref: { entity_kind: 'item', entity_id: 'item:cloak' } },
          { entity_ref: { entity_kind: 'item', entity_id: 'item:shirt' } }
        ] }
      } };
    const owner = [{ path: '$.operations.0',
      owner_kind: 'ordinary_discovery' }];

    assert.equal(await validate({ request: genericRequest,
      plan: { operations: [operation], check: null, continuation },
      resolved_domain_operations: owner }), true);
    assert.equal(calls, 0);
    await assert.rejects(validate({ request: genericRequest,
      plan: { operations: [operation], check: null, continuation: {
        ...continuation, remaining_intent: 'затем уйти с берега.'
      } }, resolved_domain_operations: owner }), (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.equal(error.details.errors[0].code,
        'ordinary_discovery_query_identity');
      return true;
    });
    assert.equal(calls, 0);

    await assert.rejects(validate({ request: genericRequest,
      plan: { operations: [{ ...operation, query: remainingIntent }],
        check: null, continuation }, resolved_domain_operations: owner }),
    (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.equal(error.details.errors[0].code,
        'ordinary_discovery_query_identity');
      return true;
    });
    assert.equal(calls, 0);

    await assert.rejects(validate({ request: { ...genericRequest,
      remaining_intent: 'Осмотреть плащ. Уйти с берега.' },
      plan: { operations: [{ ...operation, target_refs: ['item:cloak'],
        query: 'Осмотреть плащ уйти с берега' }], check: null,
      continuation: null }, resolved_domain_operations: owner }), (error) => {
      assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
      assert.equal(error.details.errors[0].code,
        'ordinary_discovery_query_identity');
      return true;
    });
    assert.equal(calls, 0);
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
