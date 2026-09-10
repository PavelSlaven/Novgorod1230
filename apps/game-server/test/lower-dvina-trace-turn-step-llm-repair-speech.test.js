import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '@rus/turn';
import { requestTurnStepPlanWithRepair } from
  '../../../packages/turn/src/turn-step-plan-repair.js';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { TURN_STEP_PLAN_MAPPINGS } from
  '../src/runtime/lower-dvina-trace-phase-2-turn-step-prompts.js';
import { createLowerDvinaTraceTurnStepSemanticGroundingValidator } from
  '../src/runtime/lower-dvina-trace-turn-step-grounding-audit.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

function speechOutput(input, words, later = null) {
  return { ...output(), ...JSON.parse(TURN_STEP_PLAN_MAPPINGS).player_utterance,
    interpretation: { player_goal: input.remaining_intent,
      grounded_attempt: words, adaptation: 'literal' },
    utterance: { speaker_ref: input.actor.actor_ref,
      utterance_text: words, input_mode: 'verbatim' },
    goal_result: later == null ? 'achieved' : 'pending',
    continuation: later == null ? null
      : { remaining_intent: later, depends_on_refs: [] } };
}

test('focused speech audit rejects lost later actions and accepts exact suffix',
  async (t) => {
    for (const [speech, words, later] of [
      ['I shout, "Is anyone alive?"', 'Is anyone alive?',
        'Then I fall silent and listen toward the trail and river.'],
      ['Кричу: «Берегись обрыва!»', 'Берегись обрыва!',
        'Затем наблюдаю за тропой и отхожу от края.'],
      ['Говорю: «Я пойду к воде и осмотрюсь».',
        'Я пойду к воде и осмотрюсь', null]
    ]) {
      await t.test(speech, async () => {
        const intent = later == null ? speech : `${speech} ${later}`;
        const input = request({ remaining_intent: intent });
        let calls = 0;
        const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
          roleRunner: { async run(call) {
            calls += 1;
            assert.equal(call.role_id, 'turn_step_grounding_auditor');
            const payload = JSON.parse(call.messages[1].content);
            assert.deepEqual(Object.keys(payload),
              ['remaining_intent', 'actor_ref', 'utterance']);
            return { output: { speech_faithful: true,
              unexecuted_intent: later } };
          } }
        });
        const plan = speechOutput(input, words, later);
        assert.equal(await validate({ plan, request: input }), true);
        assert.equal(calls, 1);
        if (later != null) {
          for (const continuation of [null,
            { remaining_intent: 'Наблюдаю.', depends_on_refs: [] }]) {
            await assert.rejects(validate({ request: input,
              plan: { ...plan, continuation } }), (error) =>
              error.code === 'TURN_STEP_PLAN_INVALID'
                && error.details.errors[0].code === 'operation_semantic_grounding'
                && error.details.errors[0].path === '$.utterance'
                && error.details.errors[0].message.includes(JSON.stringify({
                  remaining_intent: later, depends_on_refs: [] })));
          }
        }
      });
    }
  });

test('focused speech audit fails closed on malformed extraction', async () => {
  const input = request({ remaining_intent: 'I call, "Hello!"' });
  const validate = createLowerDvinaTraceTurnStepSemanticGroundingValidator({
    roleRunner: { async run() { return { output: { pass: true, concerns: [] } }; } }
  });
  await assert.rejects(validate({ request: input,
    plan: speechOutput(input, 'Hello!') }), (error) =>
    error.code === 'TRACE_TURN_STEP_GROUNDING_AUDIT_INVALID');
});

test('speech scope joins missing operations errors before the existing one repair',
  async () => {
    const later = 'Then I listen toward the river.';
    const input = request({ remaining_intent: `I call, "Hello!" ${later}` });
    const corrected = speechOutput(input, 'Hello!', later);
    const calls = [];
    const roleRunner = { async run(call) {
      calls.push(call.role_id);
      if (call.role_id === 'turn_step_grounding_auditor') return {
        output: { speech_faithful: true, unexecuted_intent: later } };
      if (call.role_id === 'turn_step_planner') {
        const original = { ...corrected, goal_result: 'achieved', continuation: null };
        delete original.operations;
        return { output: original };
      }
      const packet = JSON.parse(call.messages[1].content);
      assert.equal(packet.structural_errors.some(({ path, code }) =>
        path === '$.operations' && code === 'type'), true);
      assert.equal(packet.structural_errors.some(({ code }) =>
        code === 'direct_result_kind'), true);
      assert.equal(packet.structural_errors.some(({ message }) =>
        message.includes(JSON.stringify(corrected.continuation))), true);
      return { output: corrected };
    } };
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: createLowerDvinaTraceTurnStepModel({ roleRunner }),
      semanticPlanValidator:
        createLowerDvinaTraceTurnStepSemanticGroundingValidator({ roleRunner }) });
    assert.equal(result.repaired, true);
    assert.deepEqual(result.plan.continuation, corrected.continuation);
    assert.deepEqual(calls, ['turn_step_planner', 'turn_step_grounding_auditor',
      'turn_step_planner_repair', 'turn_step_grounding_auditor']);
  });

test('repair removes rejected operation array children without restoring them',
  async (t) => {
    for (const path of ['$.operations[0]', '$.operations[0].facts[0]',
      '$.operations.0.facts.0']) {
      await t.test(path, async () => {
        const input = request({ remaining_intent: 'I call, "Hello!"' });
        const corrected = speechOutput(input, 'Hello!');
        const original = { ...corrected, operations: [{
          op: 'create_entity', temp_ref: 'speech', facts: ['Hello!'] }] };
        const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
          async run() { return { output: corrected }; }
        } });
        const plan = await model(input, { original_output: original,
          structural_errors: [{ path, code: 'additional_property' }] });
        assert.deepEqual(plan.operations, []);
        assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
      });
    }
  });

test('pre-repair speech collection skips malformed utterance payloads', async () => {
  const input = request({ remaining_intent: 'I call, "Hello!"' });
  const corrected = speechOutput(input, 'Hello!');
  const calls = [];
  const model = async (_request, repair) => {
    calls.push(repair == null ? 'planner' : 'repair');
    const plan = { schema: 'turn_step_plan_v1', request_id: input.request_id,
      committed_state_version: input.committed_state_version,
      working_revision: input.working_revision, step_index: input.step_index,
      ...corrected };
    delete plan.operation_choice;
    delete plan.operation_family;
    if (repair == null) {
      delete plan.operations;
      plan.utterance = { ...plan.utterance, utterance_text: {} };
    }
    return plan;
  };
  await requestTurnStepPlanWithRepair({ request: input, turnStepModel: model,
    semanticPlanValidator: async () => { calls.push('audit'); } });
  assert.deepEqual(calls, ['planner', 'repair', 'audit']);
});

test('one speech repair reuses the immutable request for existing WK grounding',
  async () => {
    const input = request({ remaining_intent: 'I call, "Hello!"' });
    const corrected = speechOutput(input, 'Hello!');
    const groundedRequests = new WeakMap();
    let retrievals = 0;
    const modelCalls = [];
    const model = createLowerDvinaTraceTurnStepModel({
      worldKnowledgeGrounder: { async ground(safeRequest) {
        assert.equal(Object.isFrozen(safeRequest), true);
        assert.equal(Object.isFrozen(safeRequest.player_safe_state), true);
        if (!groundedRequests.has(safeRequest)) {
          retrievals += 1;
          groundedRequests.set(safeRequest, { ...safeRequest,
            world_knowledge: { context_text: 'unchanged grounding' } });
        }
        return groundedRequests.get(safeRequest);
      } },
      roleRunner: { async run(call) {
        modelCalls.push(call);
        return { output: modelCalls.length === 1 ? { ...corrected,
          activity: { ...corrected.activity, effort: 'light' } } : corrected };
      } }
    });
    const result = await requestTurnStepPlanWithRepair({ request: input,
      turnStepModel: model });
    assert.equal(result.repaired, true);
    assert.equal(retrievals, 1);
    assert.deepEqual(modelCalls.map(({ role_id }) => role_id),
      ['turn_step_planner', 'turn_step_planner_repair']);
    const initial = JSON.parse(modelCalls[0].messages[1].content);
    const repaired = JSON.parse(modelCalls[1].messages[1].content).request;
    assert.deepEqual(repaired, initial);
    assert.equal(Object.hasOwn(input, 'world_knowledge'), false);
  });

test('speech mapping and repair retain exact speech plus independent later action',
  async (t) => {
    const cases = [{ words: 'Is anyone alive?',
      speech: 'I shout, "Is anyone alive?"',
      later: 'Then I fall silent and listen toward the trail and river.' },
    { words: 'Берегись обрыва!', speech: 'Кричу: «Берегись обрыва!»',
      later: 'Затем наблюдаю за тропой.' }];
    for (const { words, speech, later } of cases) {
      await t.test(words, async () => {
        const intent = `${speech} ${later}`;
        const input = request({ root_player_action: intent,
          remaining_intent: intent });
        const corrected = speechOutput(input, words, later);
        const original = { ...corrected, goal_result: 'achieved',
          activity: { ...corrected.activity, effort: 'light' },
          continuation: null, operations: [{ op: 'create_entity' }] };
        let prompt;
        const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
          async run(call) {
            prompt = call.messages[0].content;
            return { output: corrected };
          }
        } });
        const plan = await model(input, { original_output: original,
          structural_errors: [{ path: '$.operations[0]', code: 'required' },
            { path: '$.activity.effort', code: 'direct_result_kind' }] });
        assert.deepEqual(plan.operations, []);
        assert.deepEqual(plan.activity,
          { owner: 'semantic', duration_class: 'moment', effort: 'none' });
        assert.deepEqual(plan.utterance, corrected.utterance);
        assert.deepEqual(plan.continuation, corrected.continuation);
        assert.equal(plan.goal_result, 'pending');
        assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
        assert.equal(validateTurnStepPlan({ ...plan,
          activity: { ...plan.activity, effort: 'light' } },
        { request: input }).ok, false);
        assert.match(prompt,
          /complete player_utterance envelope:[\s\S]*"effort":"none"[\s\S]*operations \[\][\s\S]*current actor[\s\S]*Speech creates no entity[\s\S]*exact uncovered later action text/u);
      });
    }
  });
