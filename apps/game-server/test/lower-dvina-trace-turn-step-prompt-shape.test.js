import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTurnStepPlanWithRepair, validateTurnStepPlan } from '@rus/turn';
import { createLowerDvinaTraceTurnStepModel } from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { turnStepOperationChoices } from '../src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import { TURN_STEP_COMPOUND_EXAMPLE } from '../src/runtime/lower-dvina-trace-phase-2-turn-step-prompts.js';
import { turnStepPlanMappings } from '../src/runtime/lower-dvina-trace-turn-step-plan-mappings.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';
import { parsePlayerSpeechLoudness } from
  '../src/runtime/lower-dvina-trace-m2-conversation-shared.js';

test('planner mapping labels live outside flat JSON examples and retain availability filtering', async () => {
  const input = request();
  let prompt;
  await createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
    prompt = call.messages[0].content;
    return { output: output() };
  } } })(input);
  const expected = Object.entries(JSON.parse(turnStepPlanMappings(input)));
  const examples = [...prompt.matchAll(/^Mapping: ([^\n]+)\n([^\n]+)/gmu)]
    .map(([, name, json]) => [name, JSON.parse(json)]);
  assert.deepEqual(examples, expected);
  for (const [name, semantic] of examples) assert.equal(Object.hasOwn(semantic, name), false);
  assert.match(prompt, /never output keys/u);
  assert.doesNotMatch(prompt, /loudness/iu);
  assert.match(prompt, /goal_result and continuation from the whole request/u);
  assert.doesNotMatch(prompt, /Copy only the operation DTO/u);
  assert.ok(prompt.includes(TURN_STEP_COMPOUND_EXAMPLE));
});

test('planner wire keeps immutable history beside the executable suffix', async () => {
  const input = request({
    root_player_action: 'Складываю ветви и пытаюсь разжечь костёр.',
    remaining_intent: 'и пытаюсь разжечь костёр.',
    step_index: 2,
    working_revision: 1,
    completed_steps: [{ step_index: 1, summary: 'Сложил ветви.' }]
  });
  let payload;
  const plan = await createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      payload = JSON.parse(call.messages[1].content);
      return { output: {
        ...output(),
        interpretation: {
          player_goal: input.root_player_action,
          grounded_attempt: input.remaining_intent,
          adaptation: 'literal'
        }
      } };
    }
  } })(input);

  assert.equal(payload.root_player_action, input.root_player_action);
  assert.deepEqual(payload.completed_steps, input.completed_steps);
  assert.equal(payload.remaining_intent, input.remaining_intent);
  assert.equal(plan.interpretation.player_goal, input.root_player_action);
});

test('flat compound speech example and unseen conceptual equivalent validate without planner repair', async () => {
  const example = JSON.parse(TURN_STEP_COMPOUND_EXAMPLE.split('Output:\n')[1]);
  for (const [intent, words, suffix] of [
    ['Прошу подождать, затем сажусь.', 'Подождите.', 'затем сажусь.'],
    ['Благодарю за помощь, после этого оглядываю потолок.', 'Спасибо за помощь.', 'после этого оглядываю потолок.']
  ]) {
    const input = request({ root_player_action: intent, remaining_intent: intent });
    const semantic = { ...structuredClone(example), interpretation: {
      player_goal: intent, grounded_attempt: words, adaptation: 'literal' },
    utterance: { speaker_ref: input.actor.actor_ref, utterance_text: words,
      input_mode: 'intent_paraphrase', delivery: { duration_class: 'instant' } },
    continuation: { remaining_intent: suffix, depends_on_refs: [] } };
    let calls = 0;
    const plan = await createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
      calls += 1;
      assert.equal(call.role_id, 'turn_step_planner');
      return { output: semantic };
    } } })(input);
    assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
    assert.equal(calls, 1);
    assert.equal(plan.goal_result, 'pending');
    assert.deepEqual(plan.activity, { owner: 'semantic', duration_class: 'moment', effort: 'none' });
    assert.deepEqual(plan.utterance, { ...semantic.utterance,
      delivery: { ...semantic.utterance.delivery,
        loudness: parsePlayerSpeechLoudness(input.remaining_intent) } });
    assert.equal(plan.continuation.remaining_intent, suffix);
    assert.ok(intent.endsWith(suffix));
  }
});


test('domain operation choice is valid only inside the complete semantic response', async () => {
  const candidate = {
    op: 'request_container_access', actor_ref: 'actor_mikula',
    container_ref: 'container:road-bag', access_kind: 'open'
  };
  const input = request({
    root_player_action: 'открыть дорожную сумку',
    remaining_intent: 'открыть дорожную сумку',
    player_safe_state: {
      visible_entities: [{ entity_ref: 'container:road-bag' }]
    },
    available_domain_operations: [candidate]
  });
  const [choice] = turnStepOperationChoices(input);
  assert.ok(choice);
  const completeOutput = {
    ...output(),
    interpretation: {
      player_goal: input.root_player_action,
      grounded_attempt: input.remaining_intent,
      adaptation: 'literal'
    },
    resolution: 'domain_request',
    goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    direct_result_kind: null,
    operation_choice: choice.choice_id
  };
  let completeCalls = 0;
  let prompt;
  const completeResult = await requestTurnStepPlanWithRepair({
    request: input,
    allowRepair: false,
    turnStepModel: createLowerDvinaTraceTurnStepModel({
      roleRunner: { async run(call) {
        completeCalls += 1;
        prompt = call.messages[0].content;
        return { output: completeOutput };
      } }
    })
  });
  const completePlan = completeResult.plan;

  assert.equal(completeCalls, 1);
  assert.equal(completeResult.repaired, false);
  assert.equal(validateTurnStepPlan(completePlan, { request: input }).ok, true);
  assert.deepEqual(completePlan.operations, [candidate]);
  const selectionFragment = `The following two-field JSON is only a selection fragment, not a complete semantic response. If you select this choice, include its resolution and operation_choice fields in the single complete JSON object you return, with every other required semantic field. Never return this fragment by itself. ${JSON.stringify({
    resolution: 'domain_request',
    operation_choice: choice.choice_id
  })}`;
  assert.ok(prompt.includes(selectionFragment));

  const fragment = {
    resolution: 'domain_request',
    operation_choice: choice.choice_id
  };
  let fragmentCalls = 0;
  await assert.rejects(requestTurnStepPlanWithRepair({
    request: input,
    allowRepair: false,
    turnStepModel: createLowerDvinaTraceTurnStepModel({
      roleRunner: { async run() {
        fragmentCalls += 1;
        return { output: fragment };
      } }
    })
  }), error => error?.code === 'TURN_STEP_PLAN_INVALID');
  assert.equal(fragmentCalls, 1);
});
