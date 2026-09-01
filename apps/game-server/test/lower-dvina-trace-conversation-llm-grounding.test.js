import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConversationContributionPlan } from '@rus/npc-runtime';
import { assembleNpcConversationPlan, createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { npcConversationCandidates, requiredNpcConversationCandidate } from
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

test('speech grounding admits supported route and ordinary reply, rejects unsupported assertion', async (t) => {
  const routeRequest = request({ required_supporting_operation: { op: 'disclose_known_route', route_ref: 'route-1', source_knowledge_scope_ref: 'knowledge-1' } });
  routeRequest.allowed_references.entity_refs.push(ref('route', 'route-1'));
  routeRequest.allowed_references.knowledge_refs.push(ref('knowledge_scope', 'knowledge-1'));
  routeRequest.decision_scope.operation_contract = { disclose_known_route: {} };
  const ordinaryRequest = request();
  const ordinaryPlan = plan(ordinaryRequest);
  const fixture = runner((call) => call.role_id === 'npc_conversation_grounding_auditor'
    ? { pass: true, concerns: [] } : plan(routeRequest));
  const model = createLowerDvinaTraceNpcSemanticModel(fixture);
  assert.equal(await model.validateFreshPlan(requiredNpcConversationCandidate(routeRequest), routeRequest), true);
  assert.equal(await model.validateFreshPlan(ordinaryPlan, ordinaryRequest), true);
  for (const call of fixture.calls) {
    assert.equal(call.role_id, 'npc_conversation_grounding_auditor');
    assert.match(call.messages[0].content, /utterance, claims, topic_refs, and supporting_operations/u);
    assert.match(call.messages[1].content, /"allowed_references"/u);
  }
  await t.test('unsupported direction is retryable', async () => {
    const unsupported = structuredClone(ordinaryPlan);
    unsupported.speech.utterance_text = 'A ford lies beyond ridge.';
    unsupported.speech.dominant_act = 'inform';
    const rejected = createLowerDvinaTraceNpcSemanticModel(runner(() => ({ pass: false, concerns: [{ kind: 'unsupported_direction' }] })));
    assert.deepEqual(await rejected.validateFreshPlan(unsupported, ordinaryRequest), { pass: false, errors: [{
      code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED', category: 'semantic_grounding', retryable: true
    }] });
    const repairFixture = runner(() => ordinaryPlan);
    await createLowerDvinaTraceNpcSemanticModel(repairFixture)(ordinaryRequest, { repair: { original_output: unsupported,
      validation_errors: [{ code: 'TRACE_NPC_SPEECH_GROUNDING_UNSUPPORTED' }] } });
    assert.match(repairFixture.calls[0].messages[0].content, /remove or recast that unsupported assertion or direction[\s\S]*do not preserve unsupported meaning/u);
  });
  await t.test('invalid auditor result fails closed', async () => {
    const invalid = createLowerDvinaTraceNpcSemanticModel(runner(() => ({ pass: true, concerns: [{ kind: 'unexpected' }] })));
    await assert.rejects(() => invalid.validateFreshPlan(ordinaryPlan, ordinaryRequest), { code: 'TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID' });
  });
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
  const wrong = structuredClone(semantic);
  wrong.speech.topic_refs = ['route-other'];
  wrong.speech.claims[0].mentioned_entity_refs = [ref('route', 'route-other')];
  assert.equal(validateConversationContributionPlan(assembleNpcConversationPlan(wrong, input), input), false);
});
