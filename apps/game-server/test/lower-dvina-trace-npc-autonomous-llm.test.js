import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateNpcActionDecisionRequest,
  validateNpcStepPlan
} from '@rus/npc-runtime';
import {
  createLowerDvinaTraceNpcAutonomousModel
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const request = Object.freeze({
  schema: 'npc_action_decision_request_v1',
  request_id: 'decision-1',
  npc_ref: 'zhdanko'
});

function formalRequest(overrides = {}) {
  return {
    schema: 'npc_action_decision_request_v1', request_id: 'decision-1',
    root_turn_id: 'turn-1', boundary_id: 'boundary-1',
    committed_state_version: 7, working_revision: 2, decision_index: 3,
    occurred_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' }, npc_ref: 'zhdanko',
    decision_reasons: { significance: 'material', categories: ['environment'],
      signal_refs: [{ entity_kind: 'npc_decision_signal', entity_id: 'signal-1' }],
      perceived_changes: ['Доступны топливо и кресало.'] },
    historical_context: { year: 1230, season: 'summer', region: 'Нижняя Двина',
      applicable_norms: [], known_local_customs: [] },
    npc: { profile_level: 'scene', identity: { name_or_label: 'Жданко',
      age_range: 'adult', origin: null }, social_role: { role_ref: null,
      status: null, authority: [], dependencies: [] }, attributes: [], skills: [],
      body_state: { summary: null, conditions: [] }, mood: null, temperament: [],
      values: [], goals: [], fears: [], obligations: [], relationships: [],
      current_activity: { activity_ref: null, summary: null, status: 'idle',
        can_continue_automatically: false },
      available_resources: [{ item_ref: 'fuel' }, { item_ref: 'flint' }] },
    perception: { visible_scene: [], perceived_changes: [], heard: [], felt: [],
      present_actors: [], visible_objects: [], known_routes_and_exits: [],
      uncertainties: [] },
    knowledge: { known_facts: [], beliefs: [], hypotheses: [] },
    memory: { recent_events: [], relevant_long_term_events: [],
      previous_decisions: [] },
    decision_scope: { mode: 'autonomous_action', allowed_attribute_refs: [],
      allowed_skill_refs: [], operation_contract: {} },
    ...overrides
  };
}

test('autonomous adapter uses isolated plan and repair roles', async () => {
  const calls = [];
  const output = { resolution: 'direct' };
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: {
      async run(call) {
        calls.push(call);
        return { output };
      }
    }
  });

  assert.equal((await model(request)).resolution, 'direct');
  assert.equal((await model(request, {
    repair: {
      original_output: { schema: 'broken' },
      validation_errors: [{ path: '$', code: 'schema' }]
    }
  })).resolution, 'direct');
  assert.equal(calls[0].role_id, 'npc_autonomous_decider');
  assert.equal(calls[1].role_id, 'npc_autonomous_decider_format_repair');
  assert.deepEqual(calls.map(({ request_identity }) => request_identity),
    ['decision-1', 'decision-1']);
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
  for (const phrase of ['Use this semantic shape',
    'Use these request-derived operation choices']) {
    assert.equal(repairPrompt.includes(phrase), true, phrase);
  }
  assert.deepEqual(JSON.parse(calls[0].messages[1].content), request);
  assert.deepEqual(JSON.parse(calls[1].messages[1].content), {
    request,
    original_output: { schema: 'broken' },
    validation_errors: [{ path: '$', code: 'schema' }]
  });
});

test('autonomous adapter builds the deterministic plan around one semantic choice', async () => {
  const scopedRequest = formalRequest({ decision_scope: {
      mode: 'autonomous_action',
      allowed_attribute_refs: [], allowed_skill_refs: [],
      operation_contract: { request_world_process: { allowed: [{
        process_action: 'start', process_ref: null, process_kind: 'fire',
        source_refs: ['fuel'], target_refs: ['flint']
      }] } }
    } });
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: {
      interpretation: { npc_goal: 'разжечь огонь',
        grounded_attempt: 'использовать топливо и кресало', adaptation: 'literal' },
      resolution: 'domain_request', operation_choice: 'request_world_process:0',
      reason_code: 'local_fire_needed', reason: 'Нужен огонь.'
    } }; } }
  });

  const plan = await model(scopedRequest);

  assert.equal(validateNpcActionDecisionRequest(scopedRequest), true);
  assert.equal(validateNpcStepPlan(plan, scopedRequest), true);
  assert.deepEqual(plan, {
    schema: 'npc_step_plan_v1', request_id: 'decision-1',
    root_turn_id: 'turn-1', boundary_id: 'boundary-1',
    committed_state_version: 7, working_revision: 2, decision_index: 3,
    npc_ref: 'zhdanko',
    interpretation: { npc_goal: 'разжечь огонь',
      grounded_attempt: 'использовать топливо и кресало', adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_world_process', actor_ref: 'zhdanko',
      process_action: 'start', process_ref: null, process_kind: 'fire',
      source_refs: ['fuel'], target_refs: ['flint'],
      description: 'Execute supplied world-process request.' }],
    check: null, reason_code: 'local_fire_needed', reason: 'Нужен огонь.'
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
    'empty top-level operations',
    'routine feasible task with no stated external obstacle is ordinary',
    'character attributes, skills, body, equipment, or personal stakes']) {
    assert.equal(prompt.includes(value), true, value);
  }
  assert.equal(prompt.includes('"choice_id":"request_world_process:0"'), true);
  assert.equal(prompt.includes('"request_id":"decision-1"'), false);
});

test('autonomous adapter applies general difficulty guidance to an unseen routine attempt', async () => {
  let call;
  const output = { schema: 'npc_step_plan_v1', resolution: 'generic_check',
    check: { purpose: 'разобрать обычный близкий звук',
      attribute_ref: 'attention', skill_ref: null, difficulty_id: 'ordinary' } };
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run(next) { call = next; return { output }; } }
  });
  const plan = await model({ ...request, root_turn_id: 'turn-unseen',
    boundary_id: 'boundary-unseen', committed_state_version: 2,
    working_revision: 0, decision_index: 1,
    decision_reasons: { perceived_changes: ['слышен обычный близкий звук'] },
    decision_scope: { allowed_attribute_refs: ['attention'],
      allowed_skill_refs: [], operation_contract: {} } });
  const prompt = call.messages[0].content;
  assert.equal(prompt.includes('routine feasible task with no stated external obstacle is ordinary'), true);
  assert.equal(prompt.includes('разобрать обычный близкий звук'), false);
  assert.equal(JSON.parse(call.messages[1].content).decision_reasons
    .perceived_changes[0], 'слышен обычный близкий звук');
  assert.equal(plan.check.difficulty_id, 'ordinary');
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
    assert.equal(prompt.includes('request-derived operation choices'), true);
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

test('autonomous adapter rejects a raw mapped world-process DTO', async () => {
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

  assert.deepEqual((await model(scopedRequest)).operations,
    [{ operation_choice: null }]);
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
  assert.equal(prompt.includes('"operation":{"op":"request_activity"'), true);
  assert.equal(prompt.includes('Code restores the exact registered operation'), true);
});

test('autonomous adapter rejects a raw mapped movement DTO', async () => {
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
  assert.deepEqual(plan.operations, [{ operation_choice: null }]);
});

test('autonomous adapter rejects a raw mapped operation wrapper', async () => {
  const operation = { resolution: 'domain_request', operation: {
    op: 'request_activity', actor_ref: 'other-npc', activity_kind: 'carry',
    target_refs: ['other-bag', 'other-river'], description: 'Wrong request.'
  } };
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: {
      resolution: 'domain_request', goal_result: 'pending', operations: [operation]
    } }; } }
  });
  const plan = await model({
    ...request,
    decision_scope: { operation_contract: { request_activity: { allowed: [{
      activity_kind: 'carry', target_refs: ['trace_ld_v1_container_road_bag',
        'river_access']
    }] } } }
  });
  assert.deepEqual(plan.operations, [{ operation_choice: null }]);
});

test('autonomous adapter does not guess ambiguous activity or item DTOs', async () => {
  const operation = { resolution: 'domain_request', operation: {
    op: 'request_activity'
  } };
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
  assert.deepEqual(activityPlan.operations, [{ operation_choice: null }]);

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
  assert.deepEqual(itemPlan.operations, [{ operation_choice: null }]);
});

test('ambiguous raw mapped operation is invalid until the model selects a choice id', async () => {
  const scopedRequest = formalRequest({ decision_scope: {
    mode: 'autonomous_action', allowed_attribute_refs: [],
    allowed_skill_refs: [], operation_contract: { request_activity: { allowed: [
      { activity_kind: 'wait', target_refs: [] },
      { activity_kind: 'carry', target_refs: ['fuel'] }
    ] } }
  } });
  const model = createLowerDvinaTraceNpcAutonomousModel({
    roleRunner: { async run() { return { output: {
      interpretation: { npc_goal: 'ждать', grounded_attempt: 'остаться на месте',
        adaptation: 'literal' }, resolution: 'domain_request',
      operations: [{ op: 'request_activity', actor_ref: 'zhdanko',
        activity_kind: 'wait', target_refs: [], description: 'Ждать.' }],
      operation_choice: null, reason_code: 'wait', reason: 'Нужно ждать.'
    } }; } }
  });

  assert.equal(validateNpcStepPlan(await model(scopedRequest), scopedRequest), false);
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
