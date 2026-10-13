import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '@rus/turn';
import { normalizeNpcConversationSpeech } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';

const confusables = [
  ['a', 'а'], ['e', 'е'], ['o', 'о'], ['p', 'р'], ['c', 'с'],
  ['x', 'х'], ['y', 'у'], ['A', 'А'], ['B', 'В'], ['E', 'Е'],
  ['K', 'К'], ['M', 'М'], ['H', 'Н'], ['O', 'О'], ['P', 'Р'],
  ['C', 'С'], ['T', 'Т'], ['X', 'Х'], ['Y', 'У']
];

test('normalizes every approved Latin/Cyrillic homoglyph with case preserved', () => {
  for (const [latin, cyrillic] of confusables) {
    const prefix = latin === latin.toUpperCase() ? 'Д' : 'д';
    const { output, diagnostics } = normalizeNpcConversationSpeech({
      speech: { utterance_text: `${prefix}${latin}рево`, claims: [] },
      reason: 'unchanged'
    });

    assert.equal(output.speech.utterance_text,
      `${prefix}${cyrillic}рево`, `mapping for ${latin}`);
    assert.deepEqual(diagnostics, { replaced_character_count: 1 });
  }
});

test('leaves a token unchanged when any Latin letter has no approved pair', () => {
  const original = { speech: { utterance_text: 'По протoku.', claims: [] } };
  const result = normalizeNpcConversationSpeech(original);

  assert.equal(result.output, original);
  assert.deepEqual(result.diagnostics, { replaced_character_count: 0 });
});

test('leaves wholly Latin words unchanged', () => {
  const original = { speech: { utterance_text: 'okay', claims: [] } };
  const result = normalizeNpcConversationSpeech(original);

  assert.equal(result.output, original);
  assert.deepEqual(result.diagnostics, { replaced_character_count: 0 });
});

test('changes only the NPC utterance and keeps diagnostics text-free', () => {
  const claims = [{ content_summary: 'сказано' }];
  const topicRefs = ['topic:river'];
  const interpretation = { intent: 'ответить', adaptation: 'literal' };
  const original = {
    speech: { utterance_text: 'За дeревом.', claims, topic_refs: topicRefs },
    reason: 'answer', interpretation
  };
  const result = normalizeNpcConversationSpeech(original);

  assert.equal(result.output.speech.utterance_text, 'За деревом.');
  assert.equal(result.output.speech.claims, claims);
  assert.equal(result.output.speech.topic_refs, topicRefs);
  assert.equal(result.output.reason, 'answer');
  assert.equal(result.output.interpretation, interpretation);
  assert.deepEqual(result.diagnostics, { replaced_character_count: 1 });
  assert.equal(JSON.stringify(result.diagnostics).includes('деревом'), false);
});

test('normalizes NPC speech at the adapter before plan validation', async () => {
  const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
  const request = {
    schema: 'npc_conversation_response_request_v1', request_id: 'normalization',
    boundary_id: 'boundary-normalization', conversation_id: 'conversation-1',
    exchange_id: 'exchange-normalization', state_version: 1,
    requested_at: { whole_minutes: '1', subminute_numerator: '0',
      subminute_denominator: '1' }, npc_ref: ref('npc', 'npc-1'),
    decision_reasons: { significance: 'material', categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-normalization')],
      perceived_changes: ['Игрок обратился к NPC.'] },
    npc: {}, perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    }, public_conversation_history: [{
      speaker_ref: ref('player_character', 'player-1'), utterance_text: 'Ответь.'
    }], knowledge: {}, memory: {}, social_context: {}, available_resources: [],
    allowed_references: {
      actor_refs: [ref('npc', 'npc-1'), ref('player_character', 'player-1')],
      entity_refs: [], knowledge_refs: [], combat_target_refs: []
    },
    decision_scope: { conversation_mode: true,
      action_handoff_available: false, combat_handoff_available: false,
      allowed_attribute_refs: ['influence'], allowed_skill_refs: ['conversation'],
      allowed_check_profile_refs: ['hard'],
      allowed_duration_classes: ['domain_owned'], operation_contract: {} }
  };
  const boundary = buildNpcDecisionBoundary({
    decision_mode: 'conversation', scheduled_at: request.requested_at,
    npc_ref: request.npc_ref,
    same_time_batch_ref: ref('temporal_batch', 'batch-normalization'),
    significance: request.decision_reasons.significance,
    categories: request.decision_reasons.categories,
    signal_refs: request.decision_reasons.signal_refs,
    state_version: String(request.state_version)
  });
  request.boundary_id = boundary.boundary_id;
  const calls = [];
  const semanticModel = createLowerDvinaTraceNpcSemanticModel({
    roleRunner: { async run(call) {
      calls.push(call);
      if (call.role_id === 'npc_conversation_grounding_auditor') {
        return { output: { pass: true, concerns: [] } };
      }
      const payload = JSON.parse(call.messages[1].content);
      const planRequest = payload.request ?? payload;
      return { output: {
        schema: 'conversation_contribution_plan_v1',
        request_id: planRequest.request_id,
        boundary_id: planRequest.boundary_id,
        conversation_id: planRequest.conversation_id,
        exchange_id: planRequest.exchange_id,
        state_version: planRequest.state_version,
        speaker_ref: planRequest.npc_ref,
        contribution_kind: 'speech',
        primary_addressee_ref: ref('player_character', 'player-1'),
        intended_addressee_refs: [ref('player_character', 'player-1')],
        affected_actor_refs: [],
        speech: { utterance_text: 'За дeревом.', dominant_act: 'answer',
          interaction_tags: [], topic_refs: [], claims: [],
          response_expectation: { kind: 'none', target_refs: [] } },
        interpretation: { intent: 'ответить', grounded_contribution: 'дать ответ',
          adaptation: 'literal' }, resolution: 'automatic',
        activity: { duration_class: 'domain_owned', effort: 'none' },
        supporting_operations: [], check: null, handoff: null,
        reason: 'NPC answers the player.'
      } };
    } }
  });
  const proposal = await requestNpcSemanticDecision({
    boundary, request, semanticModel,
    validateFreshPlan: semanticModel.validateFreshPlan,
    revalidateStateVersion: async () => request.state_version
  });

  assert.deepEqual(calls.map(({ role_id }) => role_id), [
    'npc_conversation_responder', 'npc_conversation_grounding_auditor'
  ]);
  assert.equal(proposal.plan.speech.utterance_text, 'За деревом.');
});
