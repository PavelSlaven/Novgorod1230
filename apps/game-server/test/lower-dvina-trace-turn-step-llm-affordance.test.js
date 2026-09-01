import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { request } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

function modelFor(input, operationChoice, extra = {}) {
  return createLowerDvinaTraceTurnStepModel({ roleRunner: { async run(call) {
    extra.onPrompt?.(call.messages[0].content);
    return { output: {
      interpretation: { player_goal: input.root_player_action,
        grounded_attempt: extra.groundedAttempt ?? input.remaining_intent,
        adaptation: 'literal' },
      resolution: 'domain_request', operation_choice: operationChoice,
      ...(extra.operationFamily === undefined ? {} : { operation_family: extra.operationFamily }),
      check: null, continuation: extra.continuation ?? null, clarification: null,
      reason_code: extra.reasonCode ?? 'focused_discovery',
      reason: extra.reason ?? 'Use supplied operation.'
    } };
  } } });
}

const interlocutor = { entity_ref: { entity_kind: 'npc',
  entity_id: 'npc:interlocutor' }, display_label: 'Visible interlocutor' };
const speech = { op: 'emit_interaction', actor_ref: 'actor:player',
  target_actor_refs: ['npc:interlocutor'], interaction_kind: 'speech',
  content: 'Talk to the active interlocutor.', instrument_refs: [] };

test('focused discovery outranks general look and preserves continuation', async () => {
  const discovery = { op: 'request_discovery', actor_ref: 'actor:player',
    discovery_kind: 'search', target_refs: ['location:current'],
    query: 'Search current location for new details.' };
  const input = request({ root_player_action: 'Look around and search current location, then wait.',
    remaining_intent: 'Look around and search current location, then wait.',
    actor: { actor_ref: 'actor:player' }, player_safe_state: { position: { location_ref: 'location:current' } },
    available_domain_operations: [discovery] });
  const prompts = [];
  const model = modelFor(input, 'domain_operation_1_request_discovery_search', {
    continuation: { remaining_intent: 'then wait.', depends_on_refs: [] },
    onPrompt: (prompt) => prompts.push(prompt)
  });
  for (const repair of [null, { schema: 'turn_step_repair_context_v1', attempt: 2, structural_errors: [] }]) {
    const plan = await model(input, repair);
    assert.deepEqual(plan.operations, [discovery]);
    assert.equal(plan.continuation.remaining_intent, 'then wait.');
  }
  for (const prompt of prompts) assert.match(prompt,
    /focused perception clause[\s\S]*new physical detail or object[\s\S]*before visible_general_look[\s\S]*preserve it in continuation/u);
});

test('ordinary material prerequisite has an explicit continuation mapping', async () => {
  const action = 'Подбираю обломок доски и делаю из него опору для плеча.';
  const input = request({ root_player_action: action, remaining_intent: action,
    actor: { actor_ref: 'actor:player' }, player_safe_state: {
      ordinary_resolution: { discovery_available: true },
      visible_entities: [{ entity_ref: 'location:current' }]
    } });
  let prompt;
  await modelFor(input, null, {
    continuation: { remaining_intent: 'Делаю из обломка опору для плеча.',
      depends_on_refs: [] },
    reasonCode: 'ordinary_material_prerequisite',
    onPrompt: (value) => { prompt = value; }
  })(input);
  assert.match(prompt,
    /"ordinary_material_prerequisite"[\s\S]*"query":"<name only the needed visible material or physically connected group>"[\s\S]*"continuation":\{"remaining_intent":"<complete intended handling or transformation>"/u);
  assert.match(prompt,
    /take, use, or transform[\s\S]*use ordinary_material_prerequisite[\s\S]*never focused_ordinary_discovery/iu);
  assert.match(prompt,
    /MUST win over action_production[\s\S]*Never substitute an unrelated inventory, worn, held, or merely listed item_ref/u);
  assert.match(prompt,
    /All refs are opaque identifiers[\s\S]*only when that same ref has its own supplied player-safe label, category, description, or facts supporting the match[\s\S]*sensory fact without an entity_ref does not label any listed item ref/u);
  assert.match(prompt,
    /request_discovery choice covers only its own fixed query[\s\S]*never select or copy a broad authored inspection/u);
});

test('action production prompt matches the active qualitative DTO', async () => {
  const input = request({ root_player_action: 'Приспосабливаю доску как опору.',
    remaining_intent: 'Приспосабливаю доску как опору.',
    actor: { actor_ref: 'actor:player' }, player_safe_state: {
      action_production: { semantic_grounding_available: true,
        max_new_entities: 4,
        allowed_identity_modes: ['preserve_source', 'independent_outputs',
          'no_useful_result'],
        allowed_origins: ['direct_partition', 'crafted'],
        allowed_result_classes: ['ordinary_physical_result'],
        allowed_output_classes: ['ordinary_mundane'],
        allowed_physical_forms: ['compact', 'regular', 'long', 'bulky'] }
    } });
  let prompt;
  await modelFor(input, null, { onPrompt: (value) => { prompt = value; } })(input);
  assert.match(prompt,
    /"action_production_preserve_source"[\s\S]*"use_kind":"other"[\s\S]*"result_descriptor":\{"display_name":null,"physical_description":"<visible physical result on preserved item>","qualitative_facts":\["<visible qualitative physical fact>"\],"removed_physical_fact_refs":\[\],"inscription_text":null,"physical_form":"<one allowed physical form or null>","source_fact_delta":null\}/u);
  assert.match(prompt,
    /action_production contains exactly source_refs, tool_refs, requested_output_count, identity_mode, origin, result_class, material_extent, result_descriptor, and output_class/u);
  assert.doesNotMatch(prompt, /request_item_use kind other|output_facts|output_physical_form|fact_removals|independent_outputs":\[\]|preserve_source":true/u);
});

test('movement keeps supplied semantic label', async () => {
  const movement = { op: 'request_movement', actor_ref: 'actor:player', movement_kind: 'route',
    target_ref: 'location:destination', description: 'Follow marked path to settlement.' };
  const input = request({ root_player_action: 'Head along marked path.', remaining_intent: 'Head along marked path.',
    actor: { actor_ref: 'actor:player' }, player_safe_state: { visible_entities: [{ entity_ref: 'location:destination' }] },
    available_domain_operations: [movement] });
  const model = modelFor(input, 'domain_operation_1_request_movement_route', {
    reasonCode: 'movement', onPrompt: (prompt) => assert.match(prompt, /Follow marked path to settlement/u)
  });
  assert.deepEqual((await model(input)).operations, [movement]);
});

test('travel prompt prioritizes supplied movement over unrelated inspection', async () => {
  const movement = { op: 'request_movement', actor_ref: 'actor:player', movement_kind: 'route',
    target_ref: 'location:camp', description: 'Follow path to fishing camp.' };
  const inspect = { op: 'request_discovery', actor_ref: 'actor:player', discovery_kind: 'inspect',
    target_ref: 'location:shore', query: 'Inspect wreck.' };
  const input = request({ root_player_action: 'Go to fishing camp along path.',
    remaining_intent: 'Go to fishing camp along path.', actor: { actor_ref: 'actor:player' },
    available_domain_operations: [movement, inspect] });
  const model = modelFor(input, 'domain_operation_1_request_movement_route', {
    onPrompt: (prompt) => assert.match(prompt,
      /asks to travel to a location[\s\S]*request_movement reaches that location[\s\S]*Do not substitute inspecting/u)
  });
  assert.deepEqual((await model(input)).operations, [movement]);
});

test('mismatched semantic operation family cannot restore unrelated choice', async () => {
  const movement = { op: 'request_movement', actor_ref: 'actor:player', movement_kind: 'route', target_ref: 'location:camp' };
  const inspect = { op: 'request_discovery', actor_ref: 'actor:player', discovery_kind: 'inspect', target_refs: ['location:shore'], query: 'Inspect shore.' };
  const input = request({ root_player_action: 'Go to camp.', remaining_intent: 'Go to camp.', actor: { actor_ref: 'actor:player' }, available_domain_operations: [inspect, movement] });
  const plan = await modelFor(input, 'domain_operation_1_request_discovery_inspect', {
    operationFamily: 'request_movement'
  })(input);
  assert.equal(plan.operations, undefined);
});

test('active conversation selects exact supplied interaction', async (t) => {
  for (const remaining_intent of ['Answer active speaker.', 'Ask what water is safe to drink.']) await t.test(remaining_intent, async () => {
    const input = request({ root_player_action: remaining_intent, remaining_intent,
      actor: { actor_ref: 'actor:player' }, player_safe_state: { active_interlocutor: interlocutor },
      available_domain_operations: [speech] });
    const model = modelFor(input, 'domain_operation_1_emit_interaction_speech', {
      reasonCode: 'active_conversation', onPrompt: (prompt) => assert.match(prompt,
        /active_interlocutor[\s\S]*emit_interaction[\s\S]*speech, reply, or question[\s\S]*exact supplied choice_id/u)
    });
    assert.deepEqual((await model(input)).operations, [speech]);
  });
});

test('active conversation precedes later discovery', async () => {
  const discovery = { op: 'request_discovery', actor_ref: 'actor:player', discovery_kind: 'inspect',
    target_ref: 'location:visible', query: 'Find a new physical detail.' };
  const remaining_intent = 'Ask active interlocutor. Then inspect visible place.';
  const continuation = { remaining_intent: 'Inspect visible place.', depends_on_refs: [] };
  const input = request({ root_player_action: remaining_intent, remaining_intent, actor: { actor_ref: 'actor:player' },
    player_safe_state: { active_interlocutor: interlocutor }, available_domain_operations: [speech, discovery] });
  const model = modelFor(input, 'domain_operation_1_emit_interaction_speech', {
    groundedAttempt: 'Ask active interlocutor.', continuation, reasonCode: 'active_conversation',
    onPrompt: (prompt) => assert.match(prompt, /before focused discovery[\s\S]*independent later clause[\s\S]*continuation/u)
  });
  const plan = await model(input);
  assert.deepEqual(plan.operations, [speech]);
  assert.deepEqual(plan.continuation, continuation);
});

test('interlocutor question remains interaction, not discovery', async () => {
  const discovery = { op: 'request_discovery', actor_ref: 'actor:player', discovery_kind: 'search',
    target_ref: 'location:visible', query: 'Find a physical detail.' };
  const remaining_intent = 'Ask active interlocutor where to find a place.';
  const input = request({ root_player_action: remaining_intent, remaining_intent, actor: { actor_ref: 'actor:player' },
    player_safe_state: { active_interlocutor: interlocutor }, available_domain_operations: [speech, discovery] });
  const prompts = [];
  const model = modelFor(input, 'domain_operation_1_emit_interaction_speech', {
    reasonCode: 'active_conversation', onPrompt: (prompt) => prompts.push(prompt)
  });
  for (const repair of [null, { schema: 'turn_step_repair_context_v1', original_output: {}, structural_errors: [] }]) {
    assert.deepEqual((await model(input, repair)).operations, [speech]);
  }
  for (const prompt of prompts) assert.match(prompt,
    /conversational question addressed to the active interlocutor[\s\S]*does not make it request_discovery[\s\S]*matching supplied request_discovery/u);
});

test('generic request skips instrumented offer', async () => {
  const offer = { ...speech, interaction_kind: 'offer', content: 'Make offer.', instrument_refs: ['item:token'] };
  const requestInteraction = { ...speech, interaction_kind: 'request', content: 'Ask active interlocutor.' };
  const input = request({ root_player_action: 'Ask active interlocutor a question.', remaining_intent: 'Ask active interlocutor a question.',
    actor: { actor_ref: 'actor:player' }, player_safe_state: { active_interlocutor: interlocutor },
    available_domain_operations: [offer, requestInteraction] });
  let prompt;
  const model = modelFor(input, 'domain_operation_2_emit_interaction_request', {
    reasonCode: 'active_conversation', onPrompt: (value) => { prompt = value; }
  });
  assert.deepEqual((await model(input)).operations, [requestInteraction]);
  const contrast = prompt.match(/Active conversation contrast: ([\s\S]*?) Use these mappings/u)[1];
  assert.match(contrast, /"operation_choice":"domain_operation_2_emit_interaction_request"/u);
  assert.doesNotMatch(contrast, /domain_operation_1_emit_interaction_offer/u);
});
