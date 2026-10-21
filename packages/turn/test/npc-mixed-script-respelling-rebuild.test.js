import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcDecisionBoundary, projectNpcConversationSubject } from '@rus/npc-runtime';
import { requestNpcSemanticDecision } from '../src/npc-semantic-decision.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const requestedAt = {
  whole_minutes: '10',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

function boundary(stateVersion) {
  return buildNpcDecisionBoundary({
    decision_mode: 'conversation',
    scheduled_at: requestedAt,
    npc_ref: ref('npc', 'speaker'),
    same_time_batch_ref: ref('temporal_batch', 'batch-1'),
    significance: 'material',
    categories: ['communication'],
    signal_refs: [ref('npc_decision_signal', 'signal-1')],
    state_version: String(stateVersion)
  });
}

function request(stateVersion) {
  const subject = projectNpcConversationSubject({
    npc_ref: ref('npc', 'speaker'),
    npc_snapshot: { instance_id: 'speaker' },
    current_activity_snapshot: { status: 'idle', can_continue_automatically: false }
  });
  return {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'request-1',
    boundary_id: 'npc-decision:conversation:batch-1:speaker',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    state_version: stateVersion,
    requested_at: requestedAt,
    npc_ref: ref('npc', 'speaker'),
    decision_reasons: {
      significance: 'material',
      categories: ['communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-1')],
      perceived_changes: ['Услышана реплика.']
    },
    npc: subject.npc,
    perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    },
    public_conversation_history: [],
    knowledge: subject.knowledge,
    memory: subject.memory,
    social_context: {},
    available_resources: subject.available_resources,
    allowed_references: {
      actor_refs: [ref('npc', 'speaker'), ref('player_character', 'player')],
      entity_refs: [],
      knowledge_refs: subject.knowledge_refs,
      combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true,
      action_handoff_available: true,
      combat_handoff_available: false,
      allowed_attribute_refs: [],
      allowed_skill_refs: [],
      allowed_check_profile_refs: [],
      allowed_duration_classes: ['moment', 'brief', 'short', 'domain_owned'],
      operation_contract: {}
    }
  };
}

function planFor(sourceRequest, utteranceText) {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: sourceRequest.request_id,
    boundary_id: sourceRequest.boundary_id,
    conversation_id: sourceRequest.conversation_id,
    exchange_id: sourceRequest.exchange_id,
    state_version: sourceRequest.state_version,
    speaker_ref: sourceRequest.npc_ref,
    contribution_kind: 'speech',
    primary_addressee_ref: ref('player_character', 'player'),
    intended_addressee_refs: [ref('player_character', 'player')],
    affected_actor_refs: [],
    speech: {
      utterance_text: utteranceText,
      dominant_act: 'answer',
      interaction_tags: [],
      topic_refs: [],
      claims: [],
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: {
      intent: 'ответить',
      grounded_contribution: 'подтвердить, что реплика услышана',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [],
    check: null,
    handoff: null,
    reason: 'Прямой ответ уместен.'
  };
}

async function decideWithRebuilds(utterances, staleAfterCalls) {
  const calls = [];
  const rebuilds = [];
  const result = await requestNpcSemanticDecision({
    boundary: boundary(2),
    request: request(2),
    orderedSignals: [{ signal_id: 'signal-1' }],
    semanticModel: async (source, context) => {
      calls.push(context);
      return planFor(source, utterances[calls.length - 1]);
    },
    revalidateStateVersion: async ({ expected_state_version: expected }) =>
      staleAfterCalls.includes(calls.length) ? expected + 1 : expected,
    rebuildDecisionContext: async ({ current_state_version: version }) => {
      rebuilds.push(version);
      return {
        boundary: boundary(version),
        request: request(version),
        ordered_signals: [{ signal_id: 'signal-1' }]
      };
    }
  });
  return { result, calls, rebuilds };
}

const at = '$.speech.utterance_text';

test('script respellings from an answer discarded by a stale-state rebuild stay in the decision', async () => {
  const { result, calls, rebuilds } = await decideWithRebuilds(
    ['Здpавствуй.', 'Здравствуй.'], [1]);
  assert.deepEqual(rebuilds, [3]);
  assert.equal(calls.length, 2);
  assert.equal(result.status, 'planned');
  assert.equal(result.plan.state_version, 3);
  assert.equal(result.plan.speech.utterance_text, 'Здравствуй.');
  assert.deepEqual(result.script_respellings, [
    { path: at, before: 'Здpавствуй', after: 'Здравствуй' }
  ]);
});

test('script respellings from answers before and after a stale-state rebuild are kept in model-answer order', async () => {
  const { result, calls, rebuilds } = await decideWithRebuilds(
    ['Здpавствуй.', 'Бoжьим велением.'], [1]);
  assert.deepEqual(rebuilds, [3]);
  assert.equal(calls.length, 2);
  assert.equal(result.status, 'planned');
  assert.equal(result.plan.state_version, 3);
  assert.equal(result.plan.speech.utterance_text, 'Божьим велением.');
  assert.deepEqual(result.script_respellings, [
    { path: at, before: 'Здpавствуй', after: 'Здравствуй' },
    { path: at, before: 'Бoжьим', after: 'Божьим' }
  ]);
});

test('script respellings survive two stale-state rebuilds in a row', async () => {
  const { result, calls, rebuilds } = await decideWithRebuilds(
    ['Здpавствуй.', 'Бoжьим велением.', 'Чего нaдо?'], [1, 2]);
  assert.deepEqual(rebuilds, [3, 4]);
  assert.equal(calls.length, 3);
  assert.equal(result.status, 'planned');
  assert.equal(result.plan.state_version, 4);
  assert.deepEqual(result.script_respellings, [
    { path: at, before: 'Здpавствуй', after: 'Здравствуй' },
    { path: at, before: 'Бoжьим', after: 'Божьим' },
    { path: at, before: 'нaдо', after: 'надо' }
  ]);
});

test('script respellings from a discarded answer are kept together with those of a format repair after the rebuild', async () => {
  const { result, calls, rebuilds } = await decideWithRebuilds(
    ['Здpавствуй.', 'Иди к протoku.', 'Иди к протоку.'], [1]);
  assert.deepEqual(rebuilds, [3]);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].repair, null);
  assert.equal(calls[1].repair, null);
  assert.equal(calls[2].repair.kind, 'format');
  assert.equal(result.status, 'planned');
  assert.equal(result.plan.state_version, 3);
  assert.equal(result.plan.speech.utterance_text, 'Иди к протоку.');
  assert.deepEqual(result.script_respellings, [
    { path: at, before: 'Здpавствуй', after: 'Здравствуй' },
    { path: at, before: 'протoku', after: 'протоku' }
  ]);
});
