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

test('canonicalizer converts the literal null choice without repair',
  async () => {
    let calls = 0;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { calls += 1; return { output: { ...output(),
        operation_choice: 'null' } }; }
    } });
    const result = await requestTurnStepPlanWithRepair({ request: request(),
      turnStepModel: model });
    assert.equal(result.repaired, false);
    assert.deepEqual(result.plan.operations, []);
    assert.equal(calls, 1);
  });

test('canonicalizer makes discovery single-target and preserves remaining refs',
  async () => {
    const intent = 'Осмотреть плащ и рубаху';
    const input = request({ root_player_action: intent,
      remaining_intent: intent,
      player_safe_state: { visible_entities: [
        { entity_ref: 'item:cloak' }, { entity_ref: 'item:shirt' }
      ] } });
    let calls = 0;
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { calls += 1; return { output: { ...output(),
        resolution: 'domain_request',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
          discovery_kind: 'inspect',
          target_refs: ['item:cloak', 'item:shirt'], query: intent }]
      } }; }
    } });
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model });
    assert.equal(result.repaired, false);
    assert.deepEqual(result.plan.operations[0].target_refs, ['item:cloak']);
    assert.deepEqual(result.plan.continuation, { remaining_intent: intent,
      depends_on_refs: [], pending_discovery: {
        remaining_target_refs: ['item:shirt'], after: null
      } });
    assert.equal(calls, 1);
  });

test('canonicalizer preserves a later continuation behind discovery targets',
  async () => {
    const intent = 'Сравнить плащ, рубаху и пояс, затем идти к дороге';
    const input = request({ root_player_action: intent,
      remaining_intent: intent,
      player_safe_state: { visible_entities: [
        { entity_ref: 'item:cloak' }, { entity_ref: 'item:shirt' },
        { entity_ref: 'item:belt' }, { entity_ref: 'road' }
      ] } });
    const after = { remaining_intent: 'идти к дороге',
      depends_on_refs: ['road'] };
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: { ...output(),
        resolution: 'domain_request',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
          discovery_kind: 'inspect', target_refs: [
            'item:cloak', 'item:shirt', 'item:belt'
          ], query: 'Сравнить плащ, рубаху и пояс' }],
        continuation: after
      } }; }
    } });
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model });
    assert.deepEqual(result.plan.continuation, {
      remaining_intent: 'Сравнить плащ, рубаху и пояс',
      depends_on_refs: [], pending_discovery: {
        remaining_target_refs: ['item:shirt', 'item:belt'], after
      }
    });
  });

test('canonicalizer removes only exact duplicate discovery continuation',
  async () => {
    const intent = 'Осмотреть плащ';
    const input = request({ root_player_action: intent,
      remaining_intent: intent,
      player_safe_state: { visible_entities: [{ entity_ref: 'item:cloak' }] } });
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run() { return { output: { ...output(),
        resolution: 'domain_request',
        activity: { owner: 'domain', duration_class: null, effort: null },
        operations: [{ op: 'request_discovery', actor_ref: 'actor_mikula',
          discovery_kind: 'inspect', target_refs: ['item:cloak'], query: intent }],
        continuation: { remaining_intent: intent, depends_on_refs: [] }
      } }; }
    } });
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model });
    assert.equal(result.repaired, false);
    assert.equal(result.plan.continuation, null);
  });

test('semantic repair cannot reselect the rejected exact operation', async () => {
  const operation = { op: 'request_discovery', actor_ref: 'actor_mikula',
    discovery_kind: 'inspect', target_refs: ['location:wreck'],
    query: 'Inspect authored wreck evidence.' };
  const ordinary = { ...operation, query: 'Inspect ordinary boards.' };
  const input = request({ available_domain_operations: [operation],
    player_safe_state: { observed_evidence_inspection: {
      semantic_grounding_available: true,
      candidates: [{ fact_ref: 'fact:charred-post-mark',
        text: 'На столбе видна отметина.' }]
    } } });
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    }
  } });
  await model(input, { original_output: { resolution: 'domain_request',
    operations: [ordinary] }, structural_errors: [{
    path: '$.operations', code: 'operation_semantic_grounding',
    rejected_operation: operation
  }] });
  assert.match(prompt, /Code-owned exact operation choices are:\n\[\]/u);
  assert.match(prompt,
    /operation_semantic_grounding[\s\S]*every compared referent[\s\S]*observed_evidence_inspection[\s\S]*exact supplied candidate refs/u);
  assert.match(prompt,
    /comparison counterpart or requested detail is missing[\s\S]*focused_ordinary_discovery[\s\S]*missing referent[\s\S]*complete comparison in continuation/u);
});

test('mismatched echoed operation retries once with semantic repair',
  async () => {
    const selected = { op: 'request_discovery', actor_ref: 'actor_mikula',
      discovery_kind: 'inspect', target_refs: ['location:wreck'],
      query: 'Осмотреть место крушения' };
    const ordinary = { ...selected, target_refs: ['chest_1'],
      query: 'Осмотреть клочок шерсти' };
    const input = request({ available_domain_operations: [selected] });
    const calls = [];
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) {
        calls.push(call);
        return { output: calls.length === 1 ? {
          ...output(), resolution: 'domain_request',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operation_choice: 'domain_operation_1_request_discovery_inspect',
          operations: [ordinary]
        } : {
          ...output(), resolution: 'domain_request',
          activity: { owner: 'domain', duration_class: null, effort: null },
          operation_choice: null, operations: [ordinary]
        } };
      }
    } });

    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model });
    assert.equal(result.repaired, true);
    assert.deepEqual(result.plan.operations, [ordinary]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(({ overrides }) => overrides.reasoningEffort),
      ['off', 'low']);
  });

test('planner errors other than primary JSON parsing do not repair', async () => {
  let calls = 0;
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run() {
      calls += 1;
      throw Object.assign(new Error('provider failed'), { code: 'http_500' });
    } }
  });
  await assert.rejects(requestTurnStepPlanWithRepair({
    request: request(), turnStepModel: model
  }), { code: 'http_500' });
  assert.equal(calls, 1);
});

test('active conversation allows unrelated direct action without repair', async () => {
    const interaction = { op: 'emit_interaction', actor_ref: 'actor_mikula',
      target_actor_refs: ['npc:visible'], interaction_kind: 'speech',
      content: 'Talk to the visible interlocutor.', instrument_refs: [] };
    const validate = createTurnStepDomainOwnerPreflight({ externalRegistry: {
      domain: (operation) => operation.op === 'emit_interaction' ? () => {} : null
    }, semanticBindings: [], availableOptions: new Set(), actor: {},
    committedState: {}, services: {},
    isDomainStepOperation: (operation) => operation === 'emit_interaction',
    turnCommandError: (code, message, details) =>
      Object.assign(new Error(message), { code, details }) });
    const intent = 'Look at the shore.';
    const input = request({ root_player_action: intent, remaining_intent: intent,
      player_safe_state: { active_interlocutor: { entity_ref: {
        entity_kind: 'npc', entity_id: 'npc:visible'
      }, display_label: 'Visible interlocutor' } }, available_domain_operations: [interaction] });
    const calls = [];
    const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
      async run(call) { calls.push(call); return { output: output() }; }
    } });
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model, semanticPlanValidator: validate });
    assert.equal(result.repaired, false);
    assert.deepEqual(result.plan.operations, []);
    assert.deepEqual(calls.map(({ role_id }) => role_id), ['turn_step_planner']);
  });

test('invalid repaired plan does not receive a second repair', async () => {
  const calls = [];
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      calls.push(call);
      if (calls.length === 1) return { output: output() };
      return { output: {} };
    } }
  });
  await assert.rejects(requestTurnStepPlanWithRepair({
    request: request(), turnStepModel: model,
    semanticPlanValidator: async () => { throw Object.assign(
      new Error('semantic mismatch'), { code: 'TURN_STEP_PLAN_INVALID',
        details: { errors: [{ path: '$.operations',
          code: 'operation_semantic_grounding', message: 'wrong intent' }] }
      }); }
  }), (error) => {
    assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(error.details.repair_attempted, true);
    return true;
  });
  assert.deepEqual(calls.map(({ role_id }) => role_id), [
    'turn_step_planner', 'turn_step_planner_repair'
  ]);
});

test('unresolved grounding or closed shape fails after repair', async () => {
  const input = request({ player_safe_state: {
    items: [{ item_id: 'boards', category_id: 'wooden_boards' }]
  } });
  let calls = 0;
  const invalid = (code) => Object.assign(new Error('semantic mismatch'), {
    code: 'TURN_STEP_PLAN_INVALID', details: { errors: [{
      path: '$.operations.0.action_production',
      code,
      message: 'must remain grounded'
    }] }
  });
  const candidate = { ...output(), resolution: 'domain_request',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [{ op: 'request_item_use', actor_ref: 'actor_mikula',
      item_ref: 'boards', use_kind: 'other', target_refs: [],
      action_production: { source_refs: ['boards'], tool_refs: [],
        requested_output_count: null, identity_mode: 'preserve_source',
        origin: null, result_class: 'ordinary_physical_result',
        material_extent: null, result_descriptor: { display_name: null,
          physical_description: 'moved boards', qualitative_facts: [],
          removed_physical_fact_refs: [], inscription_text: null,
          physical_form: null, source_fact_delta: null },
        output_class: 'ordinary_mundane' } }], operation_choice: null };
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { calls += 1; return { output: candidate }; }
  } });
  for (const code of ['material_transformation_grounding',
    'material_extent_shape']) {
    await assert.rejects(() => requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model,
      semanticPlanValidator: async () => { throw invalid(code); }
    }), (error) => error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.repair_attempted === true);
  }
  assert.equal(calls, 4);
});

test('empty domain request fails without semantic repair', async () => {
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run() { return { output: {
      ...output(), resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [], operation_choice: null
    } }; } }
  });
  await assert.rejects(() => requestTurnStepPlanWithRepair({
    request: request({ available_domain_operations: [] }), turnStepModel: model
  }), (error) => error.code === 'TURN_STEP_PLAN_INVALID'
    && error.details.repair_attempted === false);
});

test('turn step model fails closed for missing runner or non-object output', async () => {
  assert.throws(
    () => createLowerDvinaTraceTurnStepModel(),
    { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
  );
  for (const invalid of [null, 'not-json-object', []]) {
    const model = createLowerDvinaTraceTurnStepModel({
      roleRunner: { async run() { return { output: invalid }; } }
    });
    await assert.rejects(
      () => model(request()),
      { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
    );
  }
});
