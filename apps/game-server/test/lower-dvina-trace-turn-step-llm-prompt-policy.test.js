import { promptMappings } from './lower-dvina-trace-turn-step-llm-test-helpers.js';
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
    const mappings = promptMappings(prompt);
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
      direct_result_kind: null,
      reason_code: 'absent_fantastical_referent',
      reason: 'В мире нет такого объекта.'
    }, { request: input }).ok, true);
    assert.deepEqual(mappings.visible_general_look, {
      interpretation: { adaptation: 'literal' },
      resolution: 'direct', goal_result: 'achieved',
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
      operations: [], check: null,
      direct_result_kind: 'player_safe_observation'
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
    assert.match(prompt, /Adjacent current-scene looking, listening, smelling/u);
    assert.match(prompt,
      /purpose, hope, manner, or expected-result clause belongs/u);
    assert.match(prompt, /Speech is never perception/u);
    assert.match(prompt, /cannot be covered by player_safe_observation/u);
  });

test('turn step planner offers scene seed instead of direct look while unseeded',
  async () => {
    const prompt = await capturePrompt(request({ player_safe_state: {
      position: { location_ref: 'location:shore' }, ordinary_resolution: {
        discovery_available: true, container_resolution_available: false,
        scene_seed_available: true } } }));
    const mappings = promptMappings(prompt);
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

test('turn step planner routes accessible items and visible environment through owners',
  async () => {
    const prompt = await capturePrompt(request({ player_safe_state: {
      ordinary_resolution: { discovery_available: true },
      items: [{ item_id: 'item:held-cloth', category_id: 'wool_cloth',
        placement: { holder_character_id: 'actor_mikula',
          physical_position: 'equipped' } }],
      current_visible_context: { sensory_details: [
        'Река течёт у самого берега.'
      ], visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc:fisher' },
        display_label: 'рыбак', visible_status: 'чинит сети' }],
      visible_objects: [{ entity_ref: { entity_kind: 'item',
        entity_id: 'item:held-cloth' }, display_label: 'мокрая шерсть',
      visible_status: 'у вас в руках' }] }
    } }));
    assert.match(prompt, /held, worn, or equipped by the current actor is an already accessible actionable exact item ref/u);
    assert.match(prompt, /physical manipulation or durable change uses its existing item owner/u);
    assert.match(prompt, /focused inspection of any current visible item, including one held by the actor, seeks new detail/u);
    assert.match(prompt, /sensory detail that physically places ordinary environmental material in the current scope is sufficient only to ground ordinary_material_prerequisite[\s\S]*remains sensory-only[\s\S]*not an actionable item ref/u);
    assert.match(prompt, /never authorizes an authoritative, significant, hidden, or already-resolved fact/u);
    assert.match(prompt, /Reviewing the identity, placement, or condition of supplied carried\/worn items[\s\S]*player_safe_item_observation[\s\S]*other facts already explicit in player-safe sensory context uses player_safe_observation/u);
    assert.match(prompt, /Inspecting the actor body when request\.actor\.body is supplied[\s\S]*player_safe_body_observation[\s\S]*new injury or diagnosis unconfirmed[\s\S]*Clothing mentioned only as covering the body does not make that action an item or ordinary discovery/u);
    assert.match(prompt, /player_safe_item_observation for reviewing the identity, placement, or condition[\s\S]*player_safe_body_observation for inspecting the actor body[\s\S]*Preserve uncertainty[\s\S]*never infer local state, cause, forecast, timing/u);
    assert.match(prompt,
      /current negative sensory fact is still a complete supplied observation[\s\S]*visible_npc statuses already answer every visible alternative[\s\S]*achieved direct player_safe_observation/u);
    assert.match(prompt,
      /visible_npc visible_status[\s\S]*code-owned current observations[\s\S]*what someone is doing/u);
    assert.match(prompt,
      /visible_npc statuses[\s\S]*achieved direct player_safe_observation[\s\S]*colon or question[\s\S]*not a later action/iu);
  });

test('turn step planner keeps an ongoing wet-reed smoulder out of A1', async () => {
  const prompt = await capturePrompt(request({
    remaining_intent: 'Оставляю мокрый тростник тлеть.'
  }));
  assert.match(prompt, /action_production represents only a durable item-local physical result after the action ends/u);
  assert.match(prompt, /Never use its physical_description, qualitative_facts, or source_fact_delta to claim, create, preserve, or describe an active, ongoing, self-propagating, or time-dependent world process/u);
  assert.match(prompt, /process requires an exact supplied code-owned domain operation; select its matching choice_id/u);
  assert.match(prompt, /Without one, return the honest reality_limited no-operation attempt with no process or physical-fact claim/u);
});


test('stable planner keeps the material prerequisite query nominal and full action in continuation', async () => {
  const prompt = await capturePrompt();
  assert.match(prompt, /query containing only a nominal description/u);
  assert.match(prompt, /with no acquisition, relocation, handling, use, transformation, purpose or action clause/u);
  assert.match(prompt, /For this material prerequisite query must not equal or copy request.remaining_intent/u);
  assert.match(prompt, /continuation.remaining_intent must equal request.remaining_intent exactly/u);
});
