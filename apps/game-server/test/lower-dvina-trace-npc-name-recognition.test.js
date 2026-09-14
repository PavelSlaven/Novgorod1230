import assert from 'node:assert/strict';
import test from 'node:test';
import { phase3ConversationProjection } from
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
    ['человек (2)', 'unrecognized'],
    ['человек (3)', 'unrecognized']
  ]);
  assert.deepEqual(safe.active_interlocutor, {
    entity_ref: speakerRef, display_label: 'Еремей'
  });
});

test('mentioning a canonical name does not reveal NPC identity', () => {
  const visible = phase3ConversationProjection({
    consequence: { conversation: { semantic_exchange: {
      response_kind: 'speech', decision_request: { npc_ref: speakerRef },
      statements: [statement('Еремей ушёл к реке.')],
      audiences: [{ statement_ref: statementRef,
        received_messages: [message('Еремей ушёл к реке.')] }]
    } } },
    retrieved_state: { current_visible_context: context() }
  }, { actors, ids: { eremeyRef: actors[0].ref } });
  assert.equal(visible.visible_npc[0].display_label, 'человек (1)');
  assert.equal(visible.visible_npc[0].recognition, 'unrecognized');
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

function context() {
  return { version: 1, schema: 'visible_context_package',
    visible_scene: 'рыбацкий стан', visible_changes: [], sensory_details: [],
    visible_npc: actors.map(({ instance_id }, index) => ({
      entity_ref: { entity_kind: 'npc', entity_id: instance_id },
      display_label: `человек (${index + 1})`, recognition: 'unrecognized'
    })),
    visible_objects: [], known_context: [], uncertainties: [] };
}
