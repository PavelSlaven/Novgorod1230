import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '@rus/turn';
import { createLowerDvinaTraceTurnStepModel } from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { TURN_STEP_COMPOUND_EXAMPLE } from '../src/runtime/lower-dvina-trace-phase-2-turn-step-prompts.js';
import { turnStepPlanMappings } from '../src/runtime/lower-dvina-trace-turn-step-plan-mappings.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

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
      input_mode: 'intent_paraphrase', delivery: { loudness: 2, duration_class: 'instant' } },
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
    assert.deepEqual(plan.utterance, semantic.utterance);
    assert.equal(plan.continuation.remaining_intent, suffix);
    assert.ok(intent.endsWith(suffix));
  }
});
