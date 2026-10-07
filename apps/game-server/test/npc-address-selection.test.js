import assert from 'node:assert/strict';
import test from 'node:test';
import { interlocutorSpeechProjection } from
  '../src/runtime/lower-dvina-trace-m2-conversation-projections.js';

const npcRef = { entity_kind: 'npc', entity_id: 'npc-1' };
const playerRef = { entity_kind: 'player_character', entity_id: 'player-1' };
const unspecifiedForm = {
  status: 'approved', channel: 'oral', relationship_kind: 'unspecified',
  speaker_role_ref: 'role_fisher', addressee_role_ref: 'role_common',
  form_ru: 'Добрый человек', payload: {}, speaker_ref: null,
  addressee_ref: null
};

function project(relationships) {
  return interlocutorSpeechProjection({
    targetRef: npcRef,
    targetActor: {
      role_ref: { id: 'role_fisher' },
      semantic_state: { relationships }
    },
    state: { player_profile: {
      social_status: { social_role_id: 'role_common' }
    } },
    npcSpeechAddressForms: [unspecifiedForm],
    npcSpeechRegisters: []
  }, {
    speaker_ref: playerRef
  }, {
    speaker_ref: playerRef
  });
}

test('unspecified address form applies only when no relationship is known', () => {
  assert.deepEqual(project([]), { address: 'Добрый человек' });
  assert.deepEqual(project([{ target_actor_id: playerRef.entity_id, kind: 'spouse' }]), {
    relation: 'они супруги'
  });
});
