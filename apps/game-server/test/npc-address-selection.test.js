import assert from 'node:assert/strict';
import test from 'node:test';
import { interlocutorSpeechProjection } from
  '../src/runtime/lower-dvina-trace-m2-conversation-projections.js';

const npcRef = { entity_kind: 'npc', entity_id: 'npc-1' };
const playerRef = { entity_kind: 'player_character', entity_id: 'player-1' };
// Synthetic matching fixture, not a world-catalog approval record.
const unspecifiedForm = {
  status: 'approved', channel: 'oral', relationship_kind: 'unspecified',
  speaker_role_ref: 'role_fisher', addressee_role_ref: 'role_common',
  form_ru: 'Добрый человек', payload: {}, speaker_ref: null,
  addressee_ref: null
};

function project(relationships, forms = [unspecifiedForm]) {
  return interlocutorSpeechProjection({
    targetRef: npcRef,
    targetActor: {
      role_ref: { id: 'role_fisher' },
      semantic_state: { relationships }
    },
    state: { player_profile: {
      social_status: { social_role_id: 'role_common' }
    } },
    npcSpeechAddressForms: forms,
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

for (const speakerRole of [null, '']) {
  test(`D102 unspecified address accepts ${JSON.stringify(speakerRole)} speaker role when addressee matches`, () => {
    const form = { ...unspecifiedForm, speaker_role_ref: speakerRole };
    assert.deepEqual(project([], [form]), { address: 'Добрый человек' });
  });
}

test('D102 blank speaker role does not bypass the addressee role constraint', () => {
  const form = { ...unspecifiedForm, speaker_role_ref: null,
    addressee_role_ref: 'role_other' };
  assert.equal(project([], [form]), null);
});

test('D102 two matching forms with blank speaker roles remain ambiguous', () => {
  const first = { ...unspecifiedForm, speaker_role_ref: null };
  const second = { ...first, form_ru: 'Уважаемый человек' };
  assert.equal(project([], [first, second]), null);
});

test('D102 an explicit speaker role still requires a matching speaker', () => {
  assert.deepEqual(project([], [unspecifiedForm]), { address: 'Добрый человек' });
  const otherSpeaker = { ...unspecifiedForm, speaker_role_ref: 'role_other' };
  assert.equal(project([], [otherSpeaker]), null);
});
