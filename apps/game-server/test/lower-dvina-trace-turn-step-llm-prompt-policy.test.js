import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '@rus/turn';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { output, request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

async function capturePrompt(input = request()) {
  let prompt;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run(call) {
      prompt = call.messages[0].content;
      return { output: output() };
    }
  } });
  await model(input);
  return prompt;
}

test('turn step planner prompt maps optional prepared followup without forcing it',
  async () => {
    const candidate = { prepared_followup_ref: 'generic-followup',
      precursor_operation: { op: 'request_generic_prepare', actor_ref: 'actor_mikula' },
      operation: { op: 'request_generic_work', actor_ref: 'actor_mikula' } };
    const prompt = await capturePrompt(request({
      remaining_intent: 'сделать несвязанное действие',
      prepared_followup_candidates: [candidate]
    }));
    assert.match(prompt, /current operation matches its precursor_operation[\s\S]*operation semantically covers all continuation\.remaining_intent[\s\S]*every later clause or sentence[\s\S]*any intent remains uncovered[\s\S]*prepared_followup_ref is null/u);
    assert.equal(prompt.includes(JSON.stringify(candidate)), true);
    assert.equal(prompt.includes(JSON.stringify([{
      remaining_intent: '<copy next uncovered intent>',
      depends_on_refs: ['<copy only required player-safe refs>'],
      prepared_followup_ref: candidate.prepared_followup_ref
    }])), true);
  });

test('turn step planner prompt maps grounded and visible-look contracts',
  async () => {
    const input = request();
    const prompt = await capturePrompt(input);
    const mappings = JSON.parse(prompt.match(
      /Use these mappings[^\n]*:\n(\{[^\n]+?\}) Do not use obsolete keys/u
    )[1]);
    assert.deepEqual(mappings.reality_limited_physical_attempt, {
      interpretation: { adaptation: 'reality_limited' },
      resolution: 'direct', goal_result: 'not_achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'moderate' },
      operations: [], check: null
    });
    assert.deepEqual(mappings.impossible_absent_fantastical_referent, {
      interpretation: { adaptation: 'make_believe' },
      resolution: 'direct', goal_result: 'not_achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
      operations: [], check: null
    });
    assert.equal(validateTurnStepPlan({ schema: 'turn_step_plan_v1',
      request_id: input.request_id,
      committed_state_version: input.committed_state_version,
      working_revision: input.working_revision, step_index: input.step_index,
      interpretation: { player_goal: input.root_player_action,
        grounded_attempt: 'разыграть невозможное действие на месте',
        ...mappings.impossible_absent_fantastical_referent.interpretation },
      resolution: mappings.impossible_absent_fantastical_referent.resolution,
      goal_result: mappings.impossible_absent_fantastical_referent.goal_result,
      activity: mappings.impossible_absent_fantastical_referent.activity,
      operations: mappings.impossible_absent_fantastical_referent.operations,
      check: mappings.impossible_absent_fantastical_referent.check,
      continuation: null, clarification: null,
      reason_code: 'absent_fantastical_referent',
      reason: 'В мире нет такого объекта.'
    }, { request: input }).ok, true);
    assert.deepEqual(mappings.visible_general_look, {
      interpretation: { adaptation: 'literal' },
      resolution: 'direct', goal_result: 'achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
      operations: [], check: null
    });
    assert.equal(mappings.ordinary_scene_seed, undefined);
    assert.match(prompt,
      /ordinary_resolution\.scene_seed_available is true[\s\S]*candidate-free scene seed/u);
    assert.deepEqual(mappings.spatial_grounded_look, {
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_discovery',
        actor_ref: '<copy current actor ref from request>',
        discovery_kind: 'look',
        target_refs: ['<copy spatial_semantic.position_ref from request>'],
        query: '<brief look query>' }], check: null
    });
    assert.match(prompt, /use only request or operation-contract enum values/u);
    assert.match(prompt, /do not substitute or invent refs/u);
  });

test('turn step planner offers scene seed instead of direct look while unseeded',
  async () => {
    const prompt = await capturePrompt(request({ player_safe_state: {
      position: { location_ref: 'location:shore' }, ordinary_resolution: {
        discovery_available: true, container_resolution_available: false,
        scene_seed_available: true } } }));
    const mappings = JSON.parse(prompt.match(
      /Use these mappings[^\n]*:\n(\{[^\n]+?\}) Do not use obsolete keys/u
    )[1]);
    assert.equal(mappings.visible_general_look, undefined);
    assert.deepEqual(mappings.ordinary_scene_seed, {
      interpretation: { adaptation: 'literal' },
      resolution: 'domain_request', goal_result: 'pending',
      activity: { owner: 'domain', duration_class: null, effort: null },
      operations: [{ op: 'request_discovery',
        actor_ref: '<copy current actor ref from request>',
        discovery_kind: 'look',
        target_refs: ['<copy current position ref from request>'],
        query: 'общий вид ближайшего окружения' }], check: null
    });
  });

test('turn step planner prompt has stated-goal adaptation triage', async () => {
  const prompt = await capturePrompt();
  assert.match(prompt, /adaptation by the stated goal, not whether the actor can pantomime it/u);
  assert.match(prompt, /First: an absent fantastical required referent means make_believe/u);
  assert.match(prompt, /Otherwise: real or ordinary referents with a physically limited action mean reality_limited/u);
  assert.match(prompt, /Otherwise: literal/u);
  assert.match(prompt, /ordinary unknown or absent referent is not thereby fantastical; preserve existing discovery\/domain flow/u);
});
