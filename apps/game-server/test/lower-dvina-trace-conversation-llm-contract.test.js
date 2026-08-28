import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateConversationContributionPlan,
  validateNpcConversationResponseRequest,
  validatePlayerConversationContributionPlan,
  validatePlayerConversationInput
} from '@rus/npc-runtime';
import { requestPlayerConversationContribution } from '@rus/turn';
import {
  createLowerDvinaTraceNpcSemanticModel,
  createLowerDvinaTracePlayerConversationModel
} from '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { requiredNpcConversationCandidate, requiredPlayerConversationCandidate } from
  '../src/runtime/lower-dvina-trace-phase-2-llm-prompts.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const outcomes = () => ({
  clean_success: { delivery_quality: 'compelling', observable_effects: [] },
  success: { delivery_quality: 'credible', observable_effects: [] },
  success_with_cost: {
    delivery_quality: 'credible_with_visible_cost', observable_effects: []
  },
  failure_with_consequence: {
    delivery_quality: 'unconvincing', observable_effects: []
  },
  severe_failure: {
    delivery_quality: 'transparently_manipulative', observable_effects: []
  }
});

function playerRequest(required = {}) {
  return {
    schema: 'player_conversation_input_v1', request_id: 'player-request',
    conversation_id: 'conversation-1', state_version: 1,
    speaker_ref: ref('player_character', 'player-1'),
    raw_text: 'попросить рассказать правду', received_at: 'turn-1',
    player_safe_context: {
      allowed_duration_classes: ['domain_owned'],
      allowed_references: {
        actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
        entity_refs: [ref('item', 'item-1')], knowledge_refs: [],
        combat_target_refs: []
      },
      ...required
    },
    operation_contract: { emit_interaction: {} }
  };
}

function playerPlan(request, overrides = {}) {
  const required = request.player_safe_context;
  return {
    schema: 'player_conversation_contribution_plan_v1',
    request_id: request.request_id, conversation_id: request.conversation_id,
    state_version: request.state_version, speaker_ref: request.speaker_ref,
    input_mode: 'intent_paraphrase', contribution_kind: 'speech',
    primary_addressee_ref: ref('npc', 'npc-1'),
    intended_addressee_refs: [ref('npc', 'npc-1')], affected_actor_refs: [],
    speech: { utterance_text: 'Скажи, что ты видел.', dominant_act: 'request',
      interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'попросить правду',
      grounded_contribution: 'обратиться с просьбой', adaptation: 'literal' },
    resolution: required.required_resolution ?? 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: required.required_supporting_operation === undefined
      ? [] : [structuredClone(required.required_supporting_operation)],
    check: required.required_check === undefined ? null : {
      purpose: 'code-owned social delivery', ...required.required_check,
      outcomes: outcomes()
    },
    handoff: null,
    ...overrides
  };
}

function npcRequest(required = {}) {
  return {
    schema: 'npc_conversation_response_request_v1', request_id: 'npc-request',
    boundary_id: 'boundary-1', conversation_id: 'conversation-1',
    exchange_id: 'exchange-1', state_version: 1,
    requested_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' }, npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Игрок обратился к NPC.'] },
    npc: {}, perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    }, public_conversation_history: [], knowledge: {}, memory: {},
    social_context: {}, available_resources: [],
    allowed_references: {
      actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
      entity_refs: [ref('item', 'item-1')], knowledge_refs: [],
      combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true, action_handoff_available: false,
      combat_handoff_available: false, allowed_attribute_refs: ['influence'],
      allowed_skill_refs: ['conversation'], allowed_check_profile_refs: ['hard'],
      allowed_duration_classes: ['domain_owned'],
      operation_contract: { emit_interaction: {} }, ...required
    }
  };
}

function npcPlan(request) {
  const required = request.decision_scope;
  return {
    schema: 'conversation_contribution_plan_v1', request_id: request.request_id,
    boundary_id: request.boundary_id, conversation_id: request.conversation_id,
    exchange_id: request.exchange_id, state_version: request.state_version,
    speaker_ref: request.npc_ref, contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')],
    affected_actor_refs: [], speech: { utterance_text: 'Я отвечу.',
      dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'дать ответ',
      adaptation: 'literal' },
    resolution: required.required_resolution ?? 'automatic',
    activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: required.required_supporting_operation === undefined
      ? [] : [structuredClone(required.required_supporting_operation)],
    check: required.required_check === undefined ? null : {
      purpose: 'code-owned social delivery', ...required.required_check,
      outcomes: outcomes()
    }, handoff: null, reason: 'NPC chooses to answer.'
  };
}

function runner(output) {
  const calls = [];
  return {
    calls,
    roleRunner: { async run(call) {
      calls.push(structuredClone(call));
      return { output: await output(call) };
    } }
  };
}

test('intent paraphrase keeps literal adaptation', async () => {
  const request = playerRequest();
  const fixture = runner(() => playerPlan(request));
  const plan = await createLowerDvinaTracePlayerConversationModel(
    fixture)(request);
  assert.equal(validatePlayerConversationInput(request), true);
  assert.equal(validatePlayerConversationContributionPlan(plan, request), true);
  assert.equal(plan.input_mode, 'intent_paraphrase');
  assert.equal(plan.interpretation.adaptation, 'literal');
});

test('verbatim player request emits required check and operation once', async () => {
  const required = {
    verbatim_utterance_text: 'Скажи правду.',
    required_resolution: 'check_required',
    required_check: { attribute_ref: 'influence', skill_ref: 'conversation',
      difficulty_band: 'hard' },
    required_supporting_operation: { op: 'emit_interaction',
      actor_ref: ref('player_character', 'player-1'),
      target_ref: ref('npc', 'npc-1'), entity_ref: ref('item', 'item-1') }
  };
  const request = playerRequest(required);
  const fixture = runner(() => playerPlan(request, {
    input_mode: 'verbatim', speech: { ...playerPlan(request).speech,
      utterance_text: required.verbatim_utterance_text }
  }));
  const plan = await createLowerDvinaTracePlayerConversationModel(
    fixture)(request);
  assert.equal(validatePlayerConversationContributionPlan(plan, request), true);
  assert.equal(plan.supporting_operations.length, 1);
  assert.deepEqual(plan.check.attribute_ref, required.required_check.attribute_ref);
  const omitted = structuredClone(plan);
  omitted.supporting_operations = [];
  assert.equal(validatePlayerConversationContributionPlan(omitted, request), false);
  assert.match(fixture.calls[0].messages[0].content, /required_resolution/u);
});

test('NPC request emits required check and operation once', async () => {
  const required = {
    required_resolution: 'check_required',
    required_check: { attribute_ref: 'influence', skill_ref: 'conversation',
      difficulty_band: 'hard' },
    required_supporting_operation: { op: 'emit_interaction',
      actor_ref: ref('npc', 'npc-1'), target_ref: ref('player_character', 'player-1'),
      entity_ref: ref('item', 'item-1') }
  };
  const request = npcRequest(required);
  const fixture = runner(() => npcPlan(request));
  const plan = await createLowerDvinaTraceNpcSemanticModel(fixture)(request);
  assert.equal(validateNpcConversationResponseRequest(request), true);
  assert.equal(validateConversationContributionPlan(plan, request), true);
  assert.equal(plan.supporting_operations.length, 1);
  const wrongCheck = structuredClone(plan);
  wrongCheck.check.skill_ref = 'other';
  assert.equal(validateConversationContributionPlan(wrongCheck, request), false);
  assert.match(fixture.calls[0].messages[0].content, /required_supporting_operation/u);
});

test('NPC required candidate is validator-valid and preserves operation', async () => {
  const required = {
    required_resolution: 'check_required',
    required_check: { attribute_ref: 'influence', skill_ref: 'conversation',
      difficulty_band: 'hard' },
    required_supporting_operation: { op: 'emit_interaction',
      actor_ref: ref('npc', 'npc-1'), target_ref: ref('player_character', 'player-1'),
      entity_ref: ref('item', 'item-1'), interaction_kind: 'offer',
      instrument_ref: ref('item', 'tool-1') }
  };
  const request = npcRequest(required);
  request.allowed_references.entity_refs.push(ref('item', 'tool-1'));
  const candidate = requiredNpcConversationCandidate(request);
  assert.notEqual(candidate, null);
  candidate.speech.utterance_text = 'Я предлагаю предмет.';
  candidate.speech.dominant_act = 'offer';
  candidate.interpretation.intent = 'предложить предмет';
  candidate.interpretation.grounded_contribution = 'предложить предмет игроку';
  candidate.check.purpose = 'оценить убедительность предложения';
  candidate.reason = 'NPC хочет предложить предмет.';
  assert.equal(validateConversationContributionPlan(candidate, request), true);
  assert.deepEqual(candidate.primary_addressee_ref,
    required.required_supporting_operation.target_ref);
  assert.deepEqual(candidate.intended_addressee_refs,
    [required.required_supporting_operation.target_ref]);
  assert.deepEqual(candidate.supporting_operations,
    [required.required_supporting_operation]);

  const fixture = runner(() => npcPlan(request));
  const plan = await createLowerDvinaTraceNpcSemanticModel(fixture)(request, {
    repair: { original_output: { schema: 'invalid' }, validation_errors: [] }
  });
  assert.equal(validateConversationContributionPlan(plan, request), true);
  assert.equal(fixture.calls.length, 1);
  assert.match(fixture.calls[0].messages[0].content,
    /"resolution":"check_required"/u);
  assert.match(fixture.calls[0].messages[0].content,
    /"attribute_ref":"influence"/u);
  assert.match(fixture.calls[0].messages[0].content,
    /"op":"emit_interaction"/u);
});

test('player required candidate is validator-valid and preserves operation', () => {
  const required = {
    verbatim_utterance_text: 'Скажи правду.', required_resolution: 'check_required',
    required_check: { attribute_ref: 'influence', skill_ref: 'conversation',
      difficulty_band: 'hard' },
    required_supporting_operation: { op: 'emit_interaction',
      actor_ref: ref('player_character', 'player-1'), target_ref: ref('npc', 'npc-1'),
      entity_ref: ref('item', 'item-1') }
  };
  const request = playerRequest(required);
  const candidate = requiredPlayerConversationCandidate(request);
  assert.notEqual(candidate, null);
  candidate.speech.dominant_act = 'request';
  candidate.interpretation.intent = 'попросить правду';
  candidate.interpretation.grounded_contribution = 'обратиться с просьбой';
  candidate.check.purpose = 'code-owned social delivery';
  assert.equal(validatePlayerConversationContributionPlan(candidate, request), true);
  assert.equal(candidate.input_mode, 'verbatim');
  assert.equal(candidate.speech.utterance_text, required.verbatim_utterance_text);
  assert.deepEqual(candidate.primary_addressee_ref,
    required.required_supporting_operation.target_ref);
  assert.deepEqual(candidate.supporting_operations,
    [required.required_supporting_operation]);
});

test('player required candidate is omitted for target outside allowed actors', () => {
  const request = playerRequest({
    required_resolution: 'check_required',
    required_check: { attribute_ref: 'influence', skill_ref: 'conversation',
      difficulty_band: 'hard' },
    required_supporting_operation: { op: 'emit_interaction',
      actor_ref: ref('player_character', 'player-1'), target_ref: ref('npc', 'other-npc'),
      entity_ref: ref('item', 'item-1') }
  });
  assert.equal(requiredPlayerConversationCandidate(request), null);
});

test('NPC required candidate is omitted for target outside allowed actors', () => {
  const request = npcRequest({
    required_resolution: 'check_required',
    required_check: { attribute_ref: 'influence', skill_ref: 'conversation',
      difficulty_band: 'hard' },
    required_supporting_operation: { op: 'emit_interaction',
      actor_ref: ref('npc', 'npc-1'), target_ref: ref('npc', 'other-npc'),
      entity_ref: ref('item', 'item-1') }
  });
  assert.equal(requiredNpcConversationCandidate(request), null);
});

test('player repair receives and preserves required contract', async () => {
  const required = {
    required_resolution: 'check_required',
    required_check: { attribute_ref: 'influence', skill_ref: 'conversation',
      difficulty_band: 'hard' },
    required_supporting_operation: { op: 'emit_interaction',
      actor_ref: ref('player_character', 'player-1'), target_ref: ref('npc', 'npc-1'),
      entity_ref: ref('item', 'item-1') }
  };
  const request = playerRequest(required);
  const fixture = runner((call) => call.role_id.endsWith('_format_repair')
    ? playerPlan(request) : { schema: 'invalid' });
  const plan = (await requestPlayerConversationContribution({ request,
    conversationModel: createLowerDvinaTracePlayerConversationModel(fixture),
    revalidateStateVersion: async () => 1 })).plan;
  assert.equal(validatePlayerConversationContributionPlan(plan, request), true);
  assert.equal(fixture.calls.length, 2);
  const repairPayload = JSON.parse(fixture.calls[1].messages[1].content);
  assert.deepEqual(repairPayload.request.player_safe_context
    .required_supporting_operation, required.required_supporting_operation);
  assert.match(fixture.calls[1].messages[0].content,
    /Required conversation candidate/u);
});
