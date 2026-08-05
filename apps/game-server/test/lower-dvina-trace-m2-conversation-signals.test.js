import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingNpcConversationBatchKey } from
  '../src/runtime/lower-dvina-trace-m2-conversation-signals.js';

test('persisted unconsumed silence signal restores its response batch', () => {
  const targetRef = ref('npc', 'npc-eremey');
  const contributionRef = ref('conversation_contribution', 'silence-1');
  const perceptionRef = ref('perception_result', 'perception-silence-1');
  const record = {
    signal: {
      signal_id: 'signal-silence-1',
      category: 'others',
      significance: 'material',
      source_event_ref: contributionRef,
      subject_ref: targetRef,
      source_perception_ref: perceptionRef
    },
    same_time_batch_key: 'batch-silence-1'
  };
  const context = {
    targetRef,
    batchKey: 'batch-later',
    conversationId: 'conversation-1',
    state: {
      consumed_npc_decision_signal_ids: [],
      npc_decision_signals: [record],
      conversation_contributions: [{
        schema: 'conversation_non_statement_contribution_v1',
        contribution_id: contributionRef.entity_id,
        conversation_id: 'conversation-1',
        speaker_ref: ref('npc', 'npc-ratsha'),
        contribution_kind: 'silence',
        nonverbal_audience: {
          observations: [{
            observer_ref: targetRef,
            speaker_ref: ref('npc', 'npc-ratsha'),
            source_contribution_ref: contributionRef,
            perception_result_ref: perceptionRef
          }]
        }
      }]
    }
  };
  const working = { consumed_signal_ids: [], new_signal_records: [] };

  assert.equal(pendingNpcConversationBatchKey(context, working),
    'batch-silence-1');
  assert.equal(pendingNpcConversationBatchKey({
    ...context,
    state: {
      ...context.state,
      consumed_npc_decision_signal_ids: ['signal-silence-1']
    }
  }, working), null);
  assert.equal(pendingNpcConversationBatchKey({
    ...context,
    state: {
      ...context.state,
      conversation_contributions: [{
        ...context.state.conversation_contributions[0],
        nonverbal_audience: { observations: [] }
      }]
    }
  }, working), null);
  assert.equal(pendingNpcConversationBatchKey({
    ...context,
    state: {
      ...context.state,
      conversation_contributions: [{
        ...context.state.conversation_contributions[0],
        nonverbal_audience: {
          observations: [{
            ...context.state.conversation_contributions[0]
              .nonverbal_audience.observations[0],
            speaker_ref: null
          }]
        }
      }]
    }
  }, working), null);
});

function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}
