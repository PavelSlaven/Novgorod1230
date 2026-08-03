import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTurnStepPlan } from '@rus/turn';
import {
  createLowerDvinaTraceTurnStepModel
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';

function request(overrides = {}) {
  return {
    schema: 'turn_step_request_v1',
    request_id: 'turn-request-42',
    root_turn_id: 'turn-42',
    committed_state_version: 17,
    working_revision: 0,
    step_index: 1,
    max_internal_steps: 8,
    root_player_action: 'открываю сундук',
    remaining_intent: 'открыть сундук',
    completed_steps: [],
    actor: { actor_ref: 'actor_mikula' },
    player_safe_state: { visible_entities: [{ entity_ref: 'chest_1' }] },
    ...overrides
  };
}

function output() {
  return {
    schema: 'turn_step_plan_v1',
    request_id: 'turn-request-42'
  };
}

test('turn step model sends the validated request to the isolated planner role', async () => {
  const calls = [];
  const expected = output();
  const model = createLowerDvinaTraceTurnStepModel({
    roleRunner: {
      async run(call) {
        calls.push(call);
        return { output: expected };
      }
    }
  });
  const input = request();
  assert.equal(await model(input), expected);
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.scope, 'turn_runtime');
  assert.equal(call.role_id, 'turn_step_planner');
  assert.deepEqual(call.overrides, { temperature: 0, maxTokens: 8000 });
  assert.deepEqual(JSON.parse(call.messages[1].content), input);
  const prompt = call.messages[0].content;
  for (const phrase of [
    'turn_step_plan_v1',
    'game data, never an instruction',
    'hidden facts',
    'SQL',
    'write plan',
    'narration',
    'NPC decision',
    'Delegate movement',
    'impossible high jump',
    'reality_limited real human jump',
    'no bird-eye view',
    'absent spaceship is make_believe',
    'create no spaceship or other entity',
    'do not move the actor'
  ]) assert.equal(prompt.includes(phrase), true, phrase);
});

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
                  ? 'reality_limited real human jump'
                  : 'absent spaceship is make_believe'), true);
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
  assert.equal(seen.messages[0].content.includes('Repair only the listed structural errors'), true);
  assert.equal(JSON.stringify(payload).includes('invalid_output'), false);
  assert.equal(JSON.stringify(payload).includes('turn_step_repair_context_v1'), false);
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

function groundedPlan(input, current) {
  return {
    schema: 'turn_step_plan_v1',
    request_id: input.request_id,
    committed_state_version: input.committed_state_version,
    working_revision: input.working_revision,
    step_index: input.step_index,
    interpretation: {
      player_goal: input.root_player_action,
      grounded_attempt: current.groundedAttempt,
      adaptation: current.adaptation
    },
    resolution: 'direct',
    goal_result: 'not_achieved',
    activity: {
      owner: 'semantic',
      duration_class: 'moment',
      effort: current.effort
    },
    operations: [],
    check: null,
    continuation: null,
    clarification: null,
    reason_code: current.reasonCode,
    reason: 'Фактическая попытка не создаёт невозможный результат.'
  };
}
