import assert from 'node:assert/strict';
import test from 'node:test';
import { projectConversationAudience } from '../src/conversation-audience.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

function statement() {
  return {
    schema: 'conversation_statement_event_v1',
    statement_id: 'statement-1',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    speaker_ref: ref('npc', 'speaker'),
    intended_addressee_refs: [ref('npc', 'intended-listener')],
    utterance_text: 'Лодка будет у пристани.',
    dominant_act: 'inform',
    interaction_tags: [],
    topic_refs: [],
    claims: [{
      claim_id: 'claim-1',
      content_summary: 'Лодка будет у пристани.',
      form: 'assertion',
      speaker_posture: 'knowingly_false',
      source_knowledge_refs: [ref('knowledge_scope', 'speaker-private-scope')],
      mentioned_entity_refs: [ref('location', 'pier')]
    }],
    message_completeness: 'complete',
    spoken_at: {
      whole_minutes: '10',
      subminute_numerator: '0',
      subminute_denominator: '1'
    },
    duration: { duration_class: 'brief' },
    social_delivery_result: {
      schema: 'social_delivery_result_v1',
      check_resolution_id: 'resolution-1',
      outcome_band: 'success_with_cost',
      delivery_quality: 'credible_with_visible_cost',
      observable_effects: ['hesitation']
    },
    source_plan_ref: ref('semantic_plan', 'plan-1')
  };
}

test('actual listeners come from perception, not intended audience, and an ordinary witness gets no response boundary', () => {
  const ordinaryWitness = ref('npc', 'ordinary-witness');
  const result = projectConversationAudience({
    statement: statement(),
    listener_results: [{
      listener_ref: ordinaryWitness,
      perception_result_ref: ref('perception_result', 'perception-witness'),
      perceived_at: {
        whole_minutes: '10',
        subminute_numerator: '0',
        subminute_denominator: '1'
      },
      same_time_batch_ref: ref('temporal_batch', 'batch-1'),
      perception_result: 'recognized',
      comprehension: 'full',
      speaker_recognized: true
    }]
  });

  assert.deepEqual(result.actual_listener_refs, [ordinaryWitness]);
  assert.notDeepEqual(result.actual_listener_refs, statement().intended_addressee_refs);
  assert.equal(result.received_messages.length, 1);
  assert.equal(result.received_messages[0].utterance_text, statement().utterance_text);
  assert.deepEqual(result.received_messages[0].delivery_cues, ['hesitation']);
  assert.deepEqual(result.received_messages[0].claims, [{
    claim_id: 'claim-1',
    content_summary: 'Лодка будет у пристани.',
    form: 'assertion',
    mentioned_entity_refs: [ref('location', 'pier')]
  }]);
  assert.equal(
    JSON.stringify(result.received_messages).includes('speaker-private-scope'),
    false
  );
  assert.equal(
    Object.hasOwn(result.received_messages[0].claims[0], 'speaker_posture'),
    false
  );
  assert.deepEqual(result.witness_candidate_refs, [ordinaryWitness]);
  assert.equal(Object.hasOwn(result, 'decision_boundary_refs'), false);
  assert.equal(Object.hasOwn(result, 'selected_response_ref'), false);
});
