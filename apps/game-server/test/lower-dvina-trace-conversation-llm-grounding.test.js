import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConversationContributionPlan } from '@rus/npc-runtime';
import { assembleNpcConversationPlan, createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { npcConversationCandidates } from
  '../src/runtime/lower-dvina-trace-phase-2-llm-prompts.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
function request(required = {}) {
  return {
    schema: 'npc_conversation_response_request_v1', request_id: 'npc-request',
    boundary_id: 'boundary-1', conversation_id: 'conversation-1', exchange_id: 'exchange-1',
    state_version: 1, requested_at: { whole_minutes: '1', subminute_numerator: '0', subminute_denominator: '1' },
    npc_ref: ref('npc', 'npc-1'), decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')], perceived_changes: ['Игрок обратился к NPC.'] },
    npc: {}, perceived_message: { source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1') },
    public_conversation_history: [], knowledge: {}, memory: {}, social_context: {}, available_resources: [],
    allowed_references: { actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
      entity_refs: [ref('item', 'item-1')], knowledge_refs: [], combat_target_refs: [] },
    decision_scope: { conversation_mode: true, action_handoff_available: false, combat_handoff_available: false,
      allowed_attribute_refs: ['influence'], allowed_skill_refs: ['conversation'], allowed_check_profile_refs: ['hard'],
      allowed_duration_classes: ['domain_owned'], operation_contract: { emit_interaction: {} }, ...required }
  };
}
function plan(input) {
  return { schema: 'conversation_contribution_plan_v1', request_id: input.request_id, boundary_id: input.boundary_id,
    conversation_id: input.conversation_id, exchange_id: input.exchange_id, state_version: input.state_version,
    speaker_ref: input.npc_ref, contribution_kind: 'speech', primary_addressee_ref: ref('player_character', 'player-1'),
    intended_addressee_refs: [ref('player_character', 'player-1')], affected_actor_refs: [],
    speech: { utterance_text: 'Я отвечу.', dominant_act: 'answer', interaction_tags: [], topic_refs: [], claims: [],
      response_expectation: { kind: 'none', target_refs: [] } },
    interpretation: { intent: 'ответить', grounded_contribution: 'дать ответ', adaptation: 'literal' },
    resolution: 'automatic', activity: { duration_class: 'domain_owned', effort: 'none' },
    supporting_operations: [], check: null, handoff: null, reason: 'NPC chooses to answer.' };
}
function runner(reply) {
  const calls = [];
  return { calls, roleRunner: { async run(call) { calls.push(structuredClone(call)); return { output: await reply(call) }; } } };
}

test('speech audit rejects invented past work from a current schedule',
  async () => {
    const input = request();
    input.npc = { machine_state: { current_activity: {
      status: 'active',
      summary: 'Сейчас осматривает и чинит принадлежащие ему сети.'
    } } };
    input.memory = { records: [], received_messages: [] };
    const unsupported = plan(input);
    unsupported.speech.utterance_text =
      'На рассвете я был у реки и проверял сети.';
    unsupported.speech.dominant_act = 'inform';
    const fixture = runner(() => ({ pass: false, concerns: [{
      kind: 'unsupported_past_activity'
    }] }));
    const result = await createLowerDvinaTraceNpcSemanticModel(
      fixture).validateFreshPlan(unsupported, input);

    assert.equal(result.pass, false);
    assert.equal(result.errors[0].category, 'semantic_grounding');
    assert.equal(result.errors[0].retryable, true);
    assert.deepEqual(result.errors[0].concern_kinds,
      ['unsupported_past_activity']);
    assert.match(fixture.calls[0].messages[0].content,
      /current_activity describes only requested_at/u);
    assert.match(fixture.calls[0].messages[0].content,
      /Past first-person activity or observation needs an exact memory record/u);
    assert.equal(fixture.calls[0].overrides.maxTokens, 20_000);
  });

test('speech audit applies to another NPC, place, and earlier time', async () => {
  const input = request();
  input.npc = { machine_state: { current_activity: {
    status: 'active', summary: 'Сейчас перебирает верёвки.'
  } } };
  input.memory = { records: [], received_messages: [] };
  const unsupported = plan(input);
  unsupported.speech.utterance_text =
    'Вчера до твоего прихода я видел людей у переправы.';
  const fixture = runner(() => ({ pass: false, concerns: [{
    kind: 'unsupported_past_observation'
  }] }));

  const result = await createLowerDvinaTraceNpcSemanticModel(
    fixture).validateFreshPlan(unsupported, input);
  assert.equal(result.pass, false);
  assert.deepEqual(result.errors[0].concern_kinds,
    ['unsupported_past_observation']);
});

test('semantic grounding failure requests one complete response rewrite',
  async () => {
    const input = request();
    const fixture = runner(() => plan(input));
    await createLowerDvinaTraceNpcSemanticModel(fixture)(input, { repair: {
      original_output: plan(input),
      validation_errors: [{
        code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED',
        category: 'semantic_grounding', retryable: true
      }]
    } });

    assert.equal(fixture.calls[0].role_id,
      'npc_conversation_responder_format_repair');
    assert.match(fixture.calls[0].messages[0].content,
      /Rewrite the complete response once/u);
    assert.equal(Object.hasOwn(
      JSON.parse(fixture.calls[0].messages[1].content), 'original_output'),
    false);
  });

test('route contract candidate reaches initial and repair prompts', async () => {
  const input = request();
  input.allowed_references.entity_refs.push(ref('route', 'route-1'));
  input.allowed_references.knowledge_refs.push(ref('knowledge_scope', 'knowledge-1'));
  input.decision_scope.operation_contract = { disclose_known_route: { owner: '@rus/visibility-knowledge-memory',
    route_ref: 'route-1', source_knowledge_scope_ref: 'knowledge-1' } };
  const [, candidate] = npcConversationCandidates(input);
  assert.equal(validateConversationContributionPlan(candidate, input), true);
  assert.deepEqual(candidate.speech.topic_refs, ['route-1']);
  const { schema, request_id, boundary_id, conversation_id, exchange_id, state_version, speaker_ref, ...semantic } = candidate;
  const fixture = runner(() => semantic);
  const model = createLowerDvinaTraceNpcSemanticModel(fixture);
  for (const context of [{}, { repair: { original_output: { invalid: true }, validation_errors: ['invalid route operation'] } }]) {
    const result = await model(input, context);
    assert.equal(validateConversationContributionPlan(result, input), true);
    assert.deepEqual(result.supporting_operations, candidate.supporting_operations);
  }
  for (const call of fixture.calls) assert.match(call.messages[0].content, /"op":"disclose_known_route","route_ref":"route-1"/u);
  assert.doesNotMatch(fixture.calls[1].messages[0].content, /no valid disclose_known_route operation/u);
  const wrong = structuredClone(semantic);
  wrong.speech.topic_refs = ['route-other'];
  wrong.speech.claims[0].mentioned_entity_refs = [ref('route', 'route-other')];
  assert.equal(validateConversationContributionPlan(assembleNpcConversationPlan(wrong, input), input), false);
});
