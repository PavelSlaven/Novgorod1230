import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLowerDvinaTraceNpcAutonomousModel
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const request = Object.freeze({
  schema: 'npc_action_decision_request_v1',
  request_id: 'decision-1',
  npc_ref: 'zhdanko'
});

test('autonomous adapter uses isolated plan and repair roles', async () => {
  const calls = [];
  const output = { schema: 'npc_step_plan_v1' };
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: {
      async run(call) {
        calls.push(call);
        return { output };
      }
    }
  });

  assert.equal(await model(request), output);
  assert.equal(await model(request, {
    repair: {
      original_output: { schema: 'broken' },
      validation_errors: [{ path: '$', code: 'schema' }]
    }
  }), output);
  assert.equal(calls[0].role_id, 'npc_autonomous_decider');
  assert.equal(calls[1].role_id, 'npc_autonomous_decider_format_repair');
  const prompt = calls[0].messages[0].content;
  const repairPrompt = calls[1].messages[0].content;
  for (const phrase of [
    'npc_step_plan_v1',
    'nearest independent intention',
    'subjective knowledge',
    'observable nonverbal action',
    'never put spoken words',
    'hailing, asking, ordering aloud, calling, or replying',
    'use request_conversation',
    'Do not roll RNG',
    'exact time',
    'write plan',
    'another actor'
  ]) assert.equal(prompt.includes(phrase), true, phrase);
  const spokenRoute = prompt.match(/For hailing[^.]+/)?.[0] ?? '';
  for (const intent of ['hailing', 'asking', 'ordering aloud', 'calling', 'replying']) {
    assert.equal(spokenRoute.includes(intent), true, intent);
  }
  assert.equal(spokenRoute.includes('request_conversation'), true);
  assert.equal(spokenRoute.includes('emit_interaction'), false);
  for (const phrase of ['Use this complete valid shape',
    'Use these request-derived operation mappings']) {
    assert.equal(repairPrompt.includes(phrase), true, phrase);
  }
  assert.deepEqual(JSON.parse(calls[0].messages[1].content), request);
  assert.deepEqual(JSON.parse(calls[1].messages[1].content), {
    request,
    original_output: { schema: 'broken' },
    validation_errors: [{ path: '$', code: 'schema' }]
  });
});

test('autonomous prompt maps supplied world-process and generic-check values', async () => {
  let call;
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run(next) { call = next; return { output: {} }; } }
  });
  const requestWithContract = {
    ...request,
    root_turn_id: 'turn-1', boundary_id: 'boundary-1',
    committed_state_version: 1, working_revision: 0, decision_index: 1,
    decision_scope: {
      allowed_attribute_refs: ['attention'], allowed_skill_refs: ['observation'],
      operation_contract: { request_world_process: { allowed: [{
        process_action: 'start', process_ref: null, process_kind: 'fire',
        source_refs: ['fuel'], target_refs: ['flint']
      }] } }
    }
  };

  await model(requestWithContract);

  const prompt = call.messages[0].content;
  for (const value of ['"process_action":"start"', '"process_kind":"fire"',
    '"source_refs":["fuel"]', '"attribute_ref":"<one of allowed_attribute_refs>"',
    '"difficulty_id":"<trivial|ordinary|risky|dangerous|limit|nearly_impossible>"',
    'empty top-level operations']) assert.equal(prompt.includes(value), true, value);
  assert.equal(prompt.includes(JSON.stringify({
    schema: 'npc_step_plan_v1', request_id: 'decision-1', root_turn_id: 'turn-1',
    boundary_id: 'boundary-1', committed_state_version: 1, working_revision: 0,
    decision_index: 1, npc_ref: 'zhdanko',
    interpretation: { npc_goal: '<current goal>',
      grounded_attempt: '<nearest grounded attempt>', adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_world_process', actor_ref: 'zhdanko',
      process_action: 'start', process_ref: null, process_kind: 'fire',
      source_refs: ['fuel'], target_refs: ['flint'],
      description: 'Execute supplied world-process request.' }],
    check: null, reason_code: '<reason_code>', reason: '<brief subjective reason>'
  })), true);
});

test('autonomous prompt forbids generic check without attribute refs', async () => {
  const calls = [];
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run(call) { calls.push(call); return { output: {} }; } }
  });
  const requestWithoutAttributes = {
    ...request,
    decision_scope: { allowed_attribute_refs: [], allowed_skill_refs: [],
      operation_contract: { request_world_process: { allowed: [{
        process_action: 'start', process_ref: null, process_kind: 'fire',
        source_refs: ['fuel'], target_refs: ['flint']
      }] } } }
  };

  await model(requestWithoutAttributes);
  await model(requestWithoutAttributes, { repair: {
    original_output: { resolution: 'generic_check' }, validation_errors: []
  } });

  for (const call of calls) {
    const prompt = call.messages[0].content;
    assert.equal(prompt.includes('<direct|domain_request>'), true);
    assert.equal(prompt.includes('"generic_check"'), false);
    assert.equal(prompt.includes('generic_check is forbidden'), true);
    assert.equal(prompt.includes('This complete request-derived candidate is valid'), true);
  }
  assert.equal(calls[1].messages[0].content.includes('may change resolution'),
    true);
});

test('autonomous adapter preserves empty domain-request operations', async () => {
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: {
      resolution: 'domain_request', goal_result: 'pending', operations: []
    } }; } }
  });
  const scopedRequest = {
    ...request,
    decision_scope: { operation_contract: { request_world_process: { allowed: [{
      process_action: 'start', process_ref: null, process_kind: 'fire',
      source_refs: ['fuel'], target_refs: ['flint']
    }] } } }
  };

  const plan = await model(scopedRequest);
  assert.deepEqual(plan.operations, []);
});

test('autonomous adapter replaces mismatched world-process mapping', async () => {
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: {
      resolution: 'domain_request', goal_result: 'pending', operations: [{
        op: 'request_world_process', process_action: 'affect',
        process_ref: 'other-process', process_kind: 'other',
        source_refs: ['other-fuel'], target_refs: []
      }]
    } }; } }
  });
  const scopedRequest = {
    ...request,
    decision_scope: { operation_contract: { request_world_process: { allowed: [{
      process_action: 'start', process_ref: null, process_kind: 'fire',
      source_refs: ['fuel'], target_refs: ['flint']
    }] } } }
  };

  const [operation] = (await model(scopedRequest)).operations;
  assert.equal(operation.process_action, 'start');
  assert.equal(operation.process_ref, null);
  assert.equal(operation.process_kind, 'fire');
  assert.deepEqual(operation.source_refs, ['fuel']);
  assert.deepEqual(operation.target_refs, ['flint']);
});

test('autonomous prompt maps complete request-derived activity, item, and movement DTOs', async () => {
  let call;
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run(next) { call = next; return { output: {} }; } }
  });
  await model({
    ...request,
    decision_scope: { operation_contract: {
      request_activity: { allowed: [{ activity_kind: 'wait', target_refs: [] }] },
      request_item_use: { allowed: [{ item_ref: 'bag', use_kind: 'operate',
        target_refs: ['storehouse'] }] },
      request_movement: { movement_kinds: ['local'], target_refs: ['river_access'],
        route_refs: ['route:river'] }
    } }
  });
  const prompt = call.messages[0].content;
  for (const operation of [
    { op: 'request_activity', actor_ref: 'zhdanko', activity_kind: 'wait',
      target_refs: [], description: 'Execute supplied activity request.' },
    { op: 'request_item_use', actor_ref: 'zhdanko', item_ref: 'bag',
      use_kind: 'operate', target_refs: ['storehouse'] },
    { op: 'request_movement', actor_ref: 'zhdanko', movement_kind: 'local',
      target_ref: 'river_access' }
  ]) assert.equal(prompt.includes(JSON.stringify(operation)), true,
    JSON.stringify(operation));
  assert.equal(prompt.includes('never a capability summary'), true);
});

test('autonomous adapter canonicalizes a uniquely selected malformed movement DTO', async () => {
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: {
      resolution: 'domain_request', goal_result: 'pending', operations: [{
        operation_kind: 'request_movement', movement_kinds: ['local'],
        target_refs: ['river_access'], route_refs: ['route:river']
      }]
    } }; } }
  });
  const plan = await model({
    ...request,
    decision_scope: { operation_contract: { request_movement: {
      movement_kinds: ['local'], target_refs: ['river_access'],
      route_refs: ['route:river']
    } } }
  });
  assert.deepEqual(plan.operations, [{
    op: 'request_movement', actor_ref: 'zhdanko', movement_kind: 'local',
    target_ref: 'river_access'
  }]);
});

test('autonomous adapter does not guess ambiguous activity or item DTOs', async () => {
  const operation = { operation_kind: 'request_activity' };
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: {
      resolution: 'domain_request', goal_result: 'pending', operations: [operation]
    } }; } }
  });
  const activityPlan = await model({
    ...request,
    decision_scope: { operation_contract: { request_activity: { allowed: [
      { activity_kind: 'wait', target_refs: [] },
      { activity_kind: 'carry', target_refs: ['bag', 'river_access'] }
    ] } } }
  });
  assert.equal(activityPlan.operations[0], operation);

  const itemOperation = { operation_kind: 'request_item_use' };
  const itemPlan = await createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: {
      resolution: 'domain_request', goal_result: 'pending', operations: [itemOperation]
    } }; } }
  })({
    ...request,
    decision_scope: { operation_contract: { request_item_use: { allowed: [
      { item_ref: 'bag', use_kind: 'operate', target_refs: [] },
      { item_ref: 'rope', use_kind: 'other', target_refs: ['bag'] }
    ] } } }
  });
  assert.equal(itemPlan.operations[0], itemOperation);
});

test('autonomous adapter fails closed for missing runner or non-object output', async () => {
  assert.throws(
    () => createLowerDvinaTraceNpcAutonomousModel(),
    { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
  );
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: [] }; } }
  });
  await assert.rejects(
    () => model(request),
    { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
  );
});
