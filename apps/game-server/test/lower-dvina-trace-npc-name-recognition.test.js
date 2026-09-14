import assert from 'node:assert/strict';
import test from 'node:test';
import { phase3ConversationProjection, withPhase3Conversation } from
  '../src/runtime/lower-dvina-trace-phase-3-visible.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { richCommittedState } from
  './lower-dvina-trace-player-safe-state-fixture.js';

const playerRef = { entity_kind: 'player_character', entity_id: 'mikula' };
const speakerRef = { entity_kind: 'npc', entity_id: 'npc-eremey' };
const statementRef = {
  entity_kind: 'conversation_statement', entity_id: 'statement-eremey'
};
const utterance = 'Я Еремей. Об этом я ничего подтвердить не могу.';
const actors = [
  actor('npc-eremey', 'Еремей'),
  actor('npc-fisher-2', 'Фёдор'),
  actor('npc-fisher-3', 'Лука')
];

test('exact self-introduction recognizes only its stable speaking NPC', () => {
  const priorContext = context();
  const semantic = {
    response_kind: 'speech',
    decision_request: { npc_ref: speakerRef },
    statements: [statement()],
    audiences: [{ statement_ref: statementRef,
      received_messages: [message()] }]
  };
  const visible = phase3ConversationProjection({
    consequence: { conversation: { semantic_exchange: semantic } },
    retrieved_state: { current_visible_context: priorContext }
  }, { actors, ids: { eremeyRef: actors[0].ref } });

  assert.match(visible.visible_scene, /^Еремей говорит:/u);
  assert.deepEqual(visible.visible_npc.map(({ entity_ref: ref, display_label,
    recognition }) => [ref.entity_id, display_label, recognition]), [
    ['npc-eremey', 'Еремей', 'recognized'],
    ['npc-fisher-2', 'человек (2)', 'unrecognized'],
    ['npc-fisher-3', 'человек (3)', 'unrecognized']
  ]);
});

test('committed perceived self-introduction survives player-safe reload', () => {
  const state = richCommittedState();
  state.position = { location_ref: 'camp', g5_anchor_id: 'camp-anchor' };
  state.npcs = structuredClone(actors).map((npc) => ({
    ...npc, location_ref: 'camp', anchor_id: 'camp-anchor'
  }));
  state.current_visible_context = context();
  state.conversation_statements = [statement()];
  state.received_messages = [{
    ...message(), source_statement_ref: statementRef, speaker_ref: null
  }];
  state.conversation_sessions = [{
    schema: 'conversation_session_v1', conversation_id: 'conversation-1',
    status: 'active', location_ref: {
      entity_kind: 'location', entity_id: 'camp'
    },
    active_participant_refs: [playerRef, ...actors.map(({ instance_id }) => ({
      entity_kind: 'npc', entity_id: instance_id
    }))],
    last_contribution_ref: statementRef
  }];

  const safe = projectLowerDvinaTracePlayerSafeState({
    committed_state: state, actor_id: 'mikula'
  }).player_safe_state;
  assert.deepEqual(safe.current_visible_context.visible_npc.map(
    ({ display_label, recognition }) => [display_label, recognition]), [
    ['Еремей', 'recognized'],
    ['человек (1)', 'unrecognized'],
    ['человек (2)', 'unrecognized']
  ]);
  assert.equal(safe.active_interlocutor, undefined);
});

test('heard self-introduction alias is preserved instead of hidden canonical name',
  () => {
    const alias = 'Здравствуйте. Я Влас. Об этом я ничего подтвердить не могу.';
    const state = richCommittedState();
    state.position = { location_ref: 'camp', g5_anchor_id: 'camp-anchor' };
    state.npcs = structuredClone(actors).map((npc) => ({
      ...npc, location_ref: 'camp', anchor_id: 'camp-anchor'
    }));
    state.current_visible_context = context();
    state.conversation_statements = [statement(alias)];
    state.received_messages = [{
      ...message(alias), source_statement_ref: statementRef,
      speaker_ref: speakerRef
    }];

    const safe = projectLowerDvinaTracePlayerSafeState({
      committed_state: state, actor_id: 'mikula'
    }).player_safe_state;
    assert.equal(safe.current_visible_context.visible_npc[0].display_label,
      'Влас');
    assert.equal(safe.current_visible_context.visible_npc[0].recognition,
      'recognized');
    assert.doesNotMatch(JSON.stringify(safe.current_visible_context),
      /Еремей/u);
  });

test('mentioning a canonical name does not reveal NPC identity', () => {
  const visible = phase3ConversationProjection({
    consequence: { conversation: { semantic_exchange: {
      response_kind: 'speech', decision_request: { npc_ref: speakerRef },
      statements: [statement("Он сказал: 'Сначала молчал. Я Еремей'.")],
      audiences: [{ statement_ref: statementRef,
        received_messages: [message("Он сказал: 'Сначала молчал. Я Еремей'.")] }]
    } } },
    retrieved_state: { current_visible_context: context() }
  }, { actors, ids: { eremeyRef: actors[0].ref } });
  assert.equal(visible.visible_npc[0].display_label, 'человек (1)');
  assert.equal(visible.visible_npc[0].recognition, 'unrecognized');
});

test('group conversation keeps identical replies attributable', () => {
  const playerStatementRef = {
    entity_kind: 'conversation_statement', entity_id: 'statement-player'
  };
  const statements = actors.map(({ instance_id: actorId }, index) => ({
    statement_id: `statement-${index + 1}`,
    conversation_id: 'conversation-1',
    speaker_ref: { entity_kind: 'npc', entity_id: actorId },
    utterance_text: 'Одинаковый ответ.'
  }));
  const input = {
    consequence: { conversation: { semantic_exchange: {
      response_kind: 'speech',
      decision_request: { npc_ref: statements[0].speaker_ref,
        perceived_message: { source_statement_ref: playerStatementRef } },
      decisions: statements.map((entry, index) => ({ request: {
        request_id: `request-${index + 1}`,
        npc_ref: entry.speaker_ref,
        perceived_message: { source_statement_ref: playerStatementRef }
      } })),
      npc_outcomes: statements.map((entry, index) => ({
        request_id: `request-${index + 1}`, applied: true,
        contribution_ref: { entity_kind: 'conversation_statement',
          entity_id: entry.statement_id }
      })),
      statements: [{ statement_id: playerStatementRef.entity_id,
        speaker_ref: playerRef, intended_addressee_refs: actors.map(
          ({ instance_id: entityId }) => ({ entity_kind: 'npc', entity_id:
            entityId })) }, ...statements],
      audiences: statements.map((entry) => ({
        statement_ref: { entity_kind: 'conversation_statement',
          entity_id: entry.statement_id },
        received_messages: [{ listener_ref: playerRef,
          comprehension: 'full', utterance_text: entry.utterance_text }]
      }))
    } } },
    retrieved_state: { current_visible_context: context(false, []) }
  };
  const visible = withPhase3Conversation({ input,
    contracts: { actors, ids: { eremeyRef: actors[0].ref } }, movement: {
      version: 1, schema: 'visible_context_package', visible_scene: 'стан',
      visible_changes: ['Вы пришли в стан.'], sensory_details: [],
      visible_npc: context(false).visible_npc, visible_objects: [], known_context: [],
      uncertainties: [], allowed_tensions: [], do_not_imply: []
    } });

  assert.equal(visible.visible_scene.match(/человек \(\d\) говорит:/gu)?.length,
    3);
  assert.deepEqual(visible.visible_changes, [
    'Вы пришли в стан.',
    'человек (1) говорит: «Одинаковый ответ.»',
    'человек (2) говорит: «Одинаковый ответ.»',
    'человек (3) говорит: «Одинаковый ответ.»'
  ]);
  assert.ok(visible.visible_npc.every(({ visible_status: status }) =>
    status === 'говорит с вами'));
});

test('group labels are renumbered after a non-first self-introduction', () => {
  const visible = phase3ConversationProjection(groupReplyInput([
    'Первый ответ.',
    'Здравствуйте. Я Влас. Об этом я ничего подтвердить не могу.',
    'Третий ответ.'
  ]), { actors, ids: { eremeyRef: actors[0].ref } });

  assert.deepEqual(visible.visible_changes.map((line) =>
    line.match(/^(.*?) (?:говорит|промолчал|не ответил)/u)?.[1]), [
    'человек (1)', 'Влас', 'человек (2)'
  ]);
  assert.deepEqual(visible.visible_npc.map(({ entity_ref: ref, display_label,
    recognition }) => [ref.entity_id, display_label, recognition]), [
    ['npc-eremey', 'человек (1)', 'unrecognized'],
    ['npc-fisher-2', 'Влас', 'recognized'],
    ['npc-fisher-3', 'человек (2)', 'unrecognized']
  ]);
});

test('group conversation shows silence and unavailable targets', () => {
  const playerStatementRef = {
    entity_kind: 'conversation_statement', entity_id: 'statement-player'
  };
  const reply = statement('Первый ответ.');
  const intended = actors.map(({ instance_id: entityId }) => ({
    entity_kind: 'npc', entity_id: entityId
  }));
  const requests = intended.slice(0, 2).map((npcRef, index) => ({ request: {
    request_id: `request-${index + 1}`, npc_ref: npcRef,
    perceived_message: { source_statement_ref: playerStatementRef }
  } }));
  const visible = phase3ConversationProjection({
    consequence: { conversation: { semantic_exchange: {
      response_kind: 'speech', decision_request: requests[0].request,
      decisions: requests,
      npc_outcomes: [{ request_id: 'request-1', applied: true,
        contribution_ref: { entity_kind: 'conversation_statement',
          entity_id: reply.statement_id } },
      { request_id: 'request-2', applied: true,
        contribution_ref: { entity_kind: 'conversation_contribution',
          entity_id: 'silence-2' }, outcome: { kind: 'silence' } }],
      terminal_npc_outcomes: [{ npc_ref: intended[2],
        outcome: 'npc_unavailable' }],
      statements: [{ statement_id: playerStatementRef.entity_id,
        speaker_ref: playerRef, intended_addressee_refs: intended }, reply],
      audiences: [{ statement_ref: statementRef,
        received_messages: [message('Первый ответ.')] }]
    } } },
    retrieved_state: { current_visible_context: context() }
  }, { actors, ids: { eremeyRef: actors[0].ref } });

  assert.deepEqual(visible.visible_changes, [
    'человек (1) говорит: «Первый ответ.»',
    'человек (2) промолчал.',
    'человек (3) не ответил.'
  ]);
  assert.deepEqual(visible.visible_npc.map(({ visible_status: status }) =>
    status), ['говорит с вами', 'молчит после вашего обращения', 'не ответил']);
});

function actor(instanceId, canonicalName) {
  return { ref: `slot:${instanceId}`, instance_id: instanceId,
    identity_state: { canonical_name: canonicalName } };
}

function statement(text = utterance) {
  return { statement_id: statementRef.entity_id,
    conversation_id: 'conversation-1', speaker_ref: speakerRef,
    utterance_text: text };
}

function message(text = utterance) {
  return { listener_ref: playerRef, comprehension: 'full',
    utterance_text: text };
}

function groupReplyInput(utterances) {
  const playerStatementRef = {
    entity_kind: 'conversation_statement', entity_id: 'statement-player'
  };
  const replies = actors.map(({ instance_id: actorId }, index) => ({
    statement_id: `statement-group-${index + 1}`,
    conversation_id: 'conversation-1',
    speaker_ref: { entity_kind: 'npc', entity_id: actorId },
    utterance_text: utterances[index]
  }));
  return {
    consequence: { conversation: { semantic_exchange: {
      response_kind: 'speech',
      decision_request: { npc_ref: replies[0].speaker_ref,
        perceived_message: { source_statement_ref: playerStatementRef } },
      decisions: replies.map((reply, index) => ({ request: {
        request_id: `request-group-${index + 1}`,
        npc_ref: reply.speaker_ref,
        perceived_message: { source_statement_ref: playerStatementRef }
      } })),
      npc_outcomes: replies.map((reply, index) => ({
        request_id: `request-group-${index + 1}`, applied: true,
        contribution_ref: { entity_kind: 'conversation_statement',
          entity_id: reply.statement_id }
      })),
      statements: [{ statement_id: playerStatementRef.entity_id,
        speaker_ref: playerRef, intended_addressee_refs: actors.map(
          ({ instance_id: entityId }) => ({ entity_kind: 'npc',
            entity_id: entityId })) }, ...replies],
      audiences: replies.map((reply) => ({
        statement_ref: { entity_kind: 'conversation_statement',
          entity_id: reply.statement_id },
        received_messages: [message(reply.utterance_text)]
      }))
    } } },
    retrieved_state: { current_visible_context: context() }
  };
}

function context(numbered = true, contextActors = actors) {
  return { version: 1, schema: 'visible_context_package',
    visible_scene: 'рыбацкий стан', visible_changes: [], sensory_details: [],
    visible_npc: contextActors.map(({ instance_id }, index) => ({
      entity_ref: { entity_kind: 'npc', entity_id: instance_id },
      display_label: numbered ? `человек (${index + 1})` : 'человек',
      recognition: 'unrecognized'
    })),
    visible_objects: [], known_context: [], uncertainties: [] };
}
