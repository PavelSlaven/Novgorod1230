import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTurnStepPlan } from '@rus/turn';
import { requestTurnStepPlanWithRepair } from
  '../../../packages/turn/src/turn-step-loop.js';
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
                  ? 'real or ordinary referents with a physically limited action mean reality_limited'
                  : 'absent fantastical required referent means make_believe'), true);
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

test('repair role receives only the original request and structural errors', async () => {
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
    invalid_output: { forbidden: true }
  });
  assert.equal(seen.role_id, 'turn_step_planner_repair');
  assert.deepEqual(seen.overrides, { temperature: 0, maxTokens: 4000 });
  const payload = JSON.parse(seen.messages[1].content);
  assert.deepEqual(Object.keys(payload).sort(), ['request', 'structural_errors']);
  assert.deepEqual(payload.request, input);
  assert.deepEqual(payload.structural_errors, structuralErrors);
  assert.equal(seen.messages[0].content.includes('Repair only listed validation errors'), true);
  assert.equal(seen.messages[0].content.includes(
    'owner absence is not evidence of impossibility or fantasy'), true);
  assert.equal(JSON.stringify(payload).includes('invalid_output'), false);
  assert.equal(JSON.stringify(payload).includes('turn_step_repair_context_v1'), false);
});

test('primary JSON parse failure uses one structural repair only', async () => {
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
  const result = await requestTurnStepPlanWithRepair({
    request: input, turnStepModel: model
  });
  assert.equal(result.repaired, true);
  assert.deepEqual(calls.map(({ role_id }) => role_id), [
    'turn_step_planner', 'turn_step_planner_repair'
  ]);
  const repairPayload = JSON.parse(calls[1].messages[1].content);
  assert.equal(JSON.stringify(repairPayload).includes('bad JSON'), false);
  assert.equal(repairPayload.structural_errors.length > 0, true);
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

test('invalid repaired plan does not receive a second repair', async () => {
  const calls = [];
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: { async run(call) {
      calls.push(call);
      if (calls.length === 1) throw Object.assign(new Error('bad JSON'), {
        code: 'json_parse_failed'
      });
      return { output: {} };
    } }
  });
  await assert.rejects(requestTurnStepPlanWithRepair({
    request: request(), turnStepModel: model
  }), (error) => {
    assert.equal(error.code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(error.details.repair_attempted, true);
    return true;
  });
  assert.deepEqual(calls.map(({ role_id }) => role_id), [
    'turn_step_planner', 'turn_step_planner_repair'
  ]);
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
