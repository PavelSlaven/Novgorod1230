import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { assembleTurnStepPlan } from
  '../src/runtime/lower-dvina-trace-turn-step-plan-assembly.js';
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

test('selected domain interaction discards contradictory direct speech metadata', () => {
  const action = 'Говорю собеседнику: «Что случилось?»';
  const input = request({ root_player_action: action, remaining_intent: action,
    actor: { actor_ref: 'actor:player' },
    player_safe_state: { active_interlocutor: interlocutor },
    available_domain_operations: [speech] });
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: action, grounded_attempt: action,
      adaptation: 'literal' },
    resolution: 'domain_request',
    operation_choice: 'domain_operation_1_emit_interaction_speech',
    check: null, continuation: null, clarification: null,
    direct_result_kind: 'player_utterance',
    utterance: { speaker_ref: 'actor:player',
      utterance_text: 'Что случилось?', input_mode: 'verbatim',
      delivery: { loudness: 2, duration_class: 'instant' } },
    reason_code: 'active_conversation', reason: 'Use the interaction owner.'
  }, input);
  assert.equal(plan.direct_result_kind, null);
  assert.equal(Object.hasOwn(plan, 'utterance'), false);
  assert.deepEqual(plan.operations, [speech]);
});

test('selected interaction consumes its sole quoted utterance instead of repeating it', () => {
  const action = 'Спрашиваю ближайшего рыбака: «Куда вы собираетесь сегодня?»';
  const input = request({ root_player_action: action, remaining_intent: action,
    actor: { actor_ref: 'actor:player' },
    player_safe_state: { active_interlocutor: interlocutor },
    available_domain_operations: [speech] });
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: action, grounded_attempt: action,
      adaptation: 'literal' },
    resolution: 'domain_request',
    operation_choice: 'domain_operation_1_emit_interaction_speech',
    check: null, continuation: { remaining_intent:
      ': «Куда вы собираетесь сегодня?»', depends_on_refs: [] },
    clarification: null, reason_code: 'active_conversation',
    reason: 'Use the interaction owner.'
  }, input);

  assert.equal(plan.continuation, null);
  assert.deepEqual(plan.operations, [speech]);
});

test('selected interaction drops an empty continuation', () => {
  const action = 'Спрашиваю: «Как пройти в деревню?»';
  const input = request({ root_player_action: action, remaining_intent: action,
    actor: { actor_ref: 'actor:player' },
    player_safe_state: { active_interlocutor: interlocutor },
    available_domain_operations: [speech] });
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: action, grounded_attempt: action,
      adaptation: 'literal' }, resolution: 'domain_request',
    operation_choice: 'domain_operation_1_emit_interaction_speech',
    check: null, continuation: { remaining_intent: '', depends_on_refs: [] },
    clarification: null, reason_code: 'active_conversation',
    reason: 'Use the interaction owner.'
  }, input);
  assert.equal(plan.continuation, null);
  assert.deepEqual(plan.operations, [speech]);
});

test('selected interaction consumes its quoted utterance with target dependency', () => {
  const action = 'Спрашиваю Еремея: «Что ты видишь сейчас?»';
  const input = request({ root_player_action: action, remaining_intent: action,
    actor: { actor_ref: 'actor:player' },
    player_safe_state: { active_interlocutor: interlocutor },
    available_domain_operations: [speech] });
  const plan = assembleTurnStepPlan({
    interpretation: { player_goal: action, grounded_attempt: action,
      adaptation: 'literal' },
    resolution: 'domain_request',
    operation_choice: 'domain_operation_1_emit_interaction_speech',
    check: null, continuation: { remaining_intent: '«Что ты видишь сейчас?»',
      depends_on_refs: [interlocutor.entity_ref.entity_id] },
    clarification: null, reason_code: 'speech_before_independent_action',
    reason: 'Use the interaction owner.'
  }, input);

  assert.equal(plan.continuation, null);
  assert.deepEqual(plan.operations, [speech]);
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
    /A question remains conversation[\s\S]*does not make it request_discovery[\s\S]*matching supplied request_discovery/u);
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
  const contrast = prompt.match(/Active conversation contrast: ([\s\S]*?)\s+Mapping:/u)[1];
  assert.match(contrast, /desired answer or reaction is its owner result, never continuation[\s\S]*goal_result achieved and continuation null/u);
  assert.match(contrast, /"operation_choice":"domain_operation_2_emit_interaction_request"/u);
  assert.doesNotMatch(contrast, /domain_operation_1_emit_interaction_offer/u);
});

test('active interlocutor owns permission response for unsupported aid',
  async () => {
    const requestInteraction = { ...speech, interaction_kind: 'request',
      content: 'Ask active interlocutor.' };
    const action = 'Предлагаю ослабить повязку. Никита, помоги мне.';
    const input = request({ root_player_action: action, remaining_intent: action,
      actor: { actor_ref: 'actor:player' },
      player_safe_state: { active_interlocutor: interlocutor },
      available_domain_operations: [speech, requestInteraction] });
    let prompt;
    const model = modelFor(input, 'domain_operation_2_emit_interaction_request', {
      reasonCode: 'active_interaction_boundary',
      onPrompt: (value) => { prompt = value; }
    });
    assert.deepEqual((await model(input)).operations, [requestInteraction]);
    assert.match(prompt,
      /asking that person to permit, oppose, or help with a physical intervention[\s\S]*does not confirm the intervention/u);
    assert.match(prompt,
      /attempted physical intervention has no supplied physical owner[\s\S]*matching request interaction is the owned boundary[\s\S]*never confirms the physical intervention/u);
    assert.match(prompt,
      /proposal to perform that intervention followed by a direct address[\s\S]*one interaction boundary[\s\S]*Never reason that the addressed request is not a separate action/u);
  assert.match(prompt,
    /role description grounded by the current visible projection or committed conversation history overrides a different active_interlocutor/u);
  assert.match(prompt,
    /an ordinary referent merely sought in the current visible physical scope/u);
  assert.match(prompt,
    /only asks the ordinary owner to resolve presence/u);
  });

test('visible NPC speech does not outrank an earlier feasible action',
  async () => {
    const ratsha = { entity_ref: { entity_kind: 'npc', entity_id: 'npc:ratsha' },
      display_label: 'стоящий мужчина', observable_cues: {
        identity: { age_category: 'young' },
        equipment: [{ visual_profile_snapshot: {
          main_visible_color: 'dark_blue' } }]
      } };
    const offer = { ...speech, target_actor_refs: ['npc:ratsha'],
      interaction_kind: 'offer', content: 'Authored capability.' };
    const input = request({
      root_player_action: 'Спрашиваю стоящего, что случилось.',
      remaining_intent: 'Спрашиваю стоящего, что случилось.',
      actor: { actor_ref: 'actor:player' },
      player_safe_state: { current_visible_context: {
        visible_npc: [ratsha] } },
      available_domain_operations: [offer]
    });
    let prompt;
    const model = modelFor(input, 'domain_operation_1_emit_interaction_offer', {
      reasonCode: 'visible_conversation',
      onPrompt: (value) => { prompt = value; }
    });
    assert.deepEqual((await model(input)).operations, [offer]);
    assert.match(prompt,
      /Visible conversation routing for "стоящий мужчина"[\s\S]*capability label, not the utterance[\s\S]*raw player text remains the utterance[\s\S]*MUST select this conversation before visible_general_look[\s\S]*genuine earlier search/u);
    assert.match(prompt,
      /player_safe_grounding[\s\S]*age_category":"young"[\s\S]*main_visible_color":"dark_blue"/u);
    assert.match(prompt,
      /visible_scene introduces one unnamed person by position or relation/u);
    assert.match(prompt,
      /visible_general_look mapping is exact[\s\S]*moment\/none[\s\S]*same root turn[\s\S]*never merely because the player directs attention/u);
  });
