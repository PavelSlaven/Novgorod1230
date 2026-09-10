import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '@rus/turn';
import { assembleTurnStepPlan, createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { output, request } from
  './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('turn step repair preserves valid nested fields omitted by the model', async () => {
  const input = request();
  const original = assembleTurnStepPlan(output(), input);
  delete original.interpretation.player_goal;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: {
      interpretation: { player_goal: input.root_player_action }
    } }; }
  } });
  const plan = await model(input, { original_output: original,
    structural_errors: [{ path: '$.interpretation.player_goal',
      code: 'required', message: 'is required' }] });
  assert.equal(plan.interpretation.adaptation, 'literal');
  assert.equal(plan.interpretation.grounded_attempt, 'открыть сундук');
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
});

test('assembler derives domain resolution from an unseen domain operation', () => {
  const input = request();
  const plan = assembleTurnStepPlan({ ...output(), resolution: 'direct',
    operation_choice: null, operations: [{ op: 'request_discovery',
      actor_ref: input.actor.actor_ref, discovery_kind: 'inspect',
      target_refs: ['location:unseen-workyard'], query: 'осмотреть навес' }] }, input);
  assert.equal(plan.resolution, 'domain_request');
  assert.deepEqual(plan.activity,
    { owner: 'domain', duration_class: null, effort: null });
});

test('assembler restores an omitted player goal from the code-owned request', () => {
  const input = request({ root_player_action: 'Проверить незнакомый след.' });
  const semantic = output();
  delete semantic.interpretation.player_goal;
  delete semantic.interpretation.grounded_attempt;
  const plan = assembleTurnStepPlan(semantic, input);
  assert.equal(plan.interpretation.player_goal, input.root_player_action);
  assert.equal(plan.interpretation.grounded_attempt, input.remaining_intent);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
});

test('assembler does not invent a missing nonliteral grounded attempt', () => {
  const input = request({ remaining_intent: 'Перепрыгнуть реку.' });
  const semantic = output();
  semantic.interpretation.adaptation = 'reality_limited';
  delete semantic.interpretation.grounded_attempt;
  const plan = assembleTurnStepPlan(semantic, input);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, false);
});

test('assembler removes an exact nested continuation duplicate and supplies diagnostics',
  () => {
    const input = request({ root_player_action: 'Осмотреть вещи, затем небо.',
      remaining_intent: 'Осмотреть вещи, затем небо.' });
    const continuation = { remaining_intent: 'затем осмотреть небо',
      depends_on_refs: [] };
    const semantic = { ...output(), interpretation: {
      ...output().interpretation,
      continuation: continuation.remaining_intent
    }, continuation, reason_code: '', reason: '' };
    const plan = assembleTurnStepPlan(semantic, input);
    assert.equal(Object.hasOwn(plan.interpretation, 'continuation'), false);
    assert.deepEqual(plan.continuation, continuation);
    assert.equal(plan.reason_code, 'semantic_plan');
    assert.equal(plan.reason,
      'Semantic plan assembled at the validated boundary.');
    assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
  });

test('assembler leaves a conflicting nested continuation for strict rejection', () => {
  const input = request();
  const semantic = { ...output(), interpretation: {
    ...output().interpretation, continuation: 'другое действие'
  }, continuation: { remaining_intent: 'продолжить осмотр',
    depends_on_refs: [] } };
  const plan = assembleTurnStepPlan(semantic, input);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, false);
});

test('assembler normalizes a quoted null operation choice', () => {
  const input = request();
  const operations = [{ op: 'request_discovery' }];
  const plan = assembleTurnStepPlan({ ...output(), resolution: 'domain_request',
    operation_choice: 'null', operations }, input);
  assert.deepEqual(plan.operations, operations);
});

test('assembler preserves typed direct result kind', () => {
  const input = request();
  const plan = assembleTurnStepPlan({ ...output(), resolution: 'direct',
    goal_result: 'achieved', activity: { owner: 'semantic',
      duration_class: 'moment', effort: 'none' }, operations: [],
    continuation: null, direct_result_kind: 'player_safe_observation' }, input);
  assert.equal(plan.direct_result_kind, 'player_safe_observation');
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
});

test('assembler preserves unseen provider fields for strict rejection instead of silent action loss', () => {
  const input = request();
  for (const field of ['unexpected_action', 'unseen_observation_mapping']) {
    const extra = { resolution: 'direct', grounded_attempt: 'открыть люк' };
    const plan = assembleTurnStepPlan({ ...output(), [field]: extra }, input);
    assert.deepEqual(plan[field], extra);
    assert.ok(validateTurnStepPlan(plan, { request: input }).errors.some(({ path, code }) =>
      path === `$.${field}` && code === 'additional_property'));
  }
});

test('assembler unwraps only a single object under a mapping available in this request', () => {
  const input = request();
  const semantic = { ...output(), goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_safe_observation' };
  const wrapped = { visible_general_look: semantic };
  assert.deepEqual(assembleTurnStepPlan(wrapped, input), assembleTurnStepPlan(semantic, input));
  assert.equal(validateTurnStepPlan(assembleTurnStepPlan(wrapped, input), { request: input }).ok, true);
  for (const choice of [{ visible_general_look: null }, { visible_general_look: [] },
    { visible_general_look: semantic, reason: 'ambiguous' }, { unknown_mapping: semantic },
    { ordinary_scene_seed: semantic }]) {
    assert.equal(validateTurnStepPlan(assembleTurnStepPlan(choice, input), { request: input }).ok, false);
  }
});

test('source grounding repair gets a focused semantic instruction', async () => {
  let prompt;
  const input = request({ remaining_intent: 'Связать верёвкой доски.',
    player_safe_state: { position: { location_ref: 'shore' } } });
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) { prompt = call.messages[0].content;
      return { output: output() }; }
  } });
  await model(input, { original_output: output(), structural_errors: [{
    path: '$.operations.0.action_production.source_refs',
    code: 'source_semantic_grounding', message: 'missing material ref'
  }] });
  assert.match(prompt,
    /Required source repair: discard action_production[\s\S]*one domain_request request_discovery[\s\S]*query naming only the missing ordinary material[\s\S]*Preserve the complete original action verbatim[\s\S]*Связать верёвкой доски/u);
});
