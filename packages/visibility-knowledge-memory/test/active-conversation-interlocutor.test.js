import test from 'node:test';
import assert from 'node:assert/strict';

import { projectActiveConversationInterlocutor } from '../src/index.js';

const player = Object.freeze({
  entity_kind: 'player_character', entity_id: 'player-1'
});
const eremey = Object.freeze({ entity_kind: 'npc', entity_id: 'npc-eremey' });
const ratsha = Object.freeze({ entity_kind: 'npc', entity_id: 'npc-ratsha' });

function session(overrides = {}) {
  return {
    schema: 'conversation_session_v1',
    conversation_id: 'conversation-1',
    status: 'active',
    location_ref: { entity_kind: 'location', entity_id: 'camp' },
    active_participant_refs: [eremey, player],
    ...overrides
  };
}

function visibleNpcs() {
  return [{
    instance_id: 'npc-eremey',
    location_ref: 'camp',
    identity_state: { display_name: 'Еремей' }
  }, {
    instance_id: 'npc-ratsha',
    location_ref: 'camp',
    identity_state: { display_name: 'Ратша' }
  }];
}

function project(overrides = {}) {
  return projectActiveConversationInterlocutor({
    conversation_sessions: [session()],
    player_ref: player,
    current_location_ref: 'camp',
    visible_npcs: visibleNpcs(),
    ...overrides
  });
}

test('projects one active, present and safely named NPC interlocutor', () => {
  assert.deepEqual(project(), {
    entity_ref: eremey,
    display_label: 'Еремей'
  });
});

test('active interlocutor projection fails closed for conversation ambiguity', () => {
  assert.equal(project({
    conversation_sessions: [session(), session({
      conversation_id: 'conversation-2',
      active_participant_refs: [ratsha, player]
    })]
  }), null);
  assert.equal(project({
    conversation_sessions: [session({
      active_participant_refs: [eremey, ratsha, player]
    })]
  }), null);
});

test('active interlocutor projection fails closed outside one active current session', () => {
  for (const conversation_sessions of [
    [session({ status: 'suspended' })],
    [session({ status: 'ended' })],
    [session({ location_ref: {
      entity_kind: 'location', entity_id: 'wreck-shore'
    } })],
    []
  ]) {
    assert.equal(project({ conversation_sessions }), null);
  }
});

test('active interlocutor projection requires the already player-safe NPC name', () => {
  assert.equal(project({ visible_npcs: [] }), null);
  assert.equal(project({
    visible_npcs: [{
      instance_id: 'npc-eremey',
      identity_state: { canonical_name: 'internal canonical name' }
    }]
  }), null);
  assert.equal(project({
    visible_npcs: [{
      instance_id: 'npc-eremey',
      identity_state: { display_name: 'Еремей' }
    }, {
      npc_id: 'npc-eremey',
      identity_state: { display_name: 'Другое имя' }
    }]
  }), null);
});

test('nearby NPC without a conversation is not an active interlocutor', () => {
  assert.equal(project({ conversation_sessions: [] }), null);
});
