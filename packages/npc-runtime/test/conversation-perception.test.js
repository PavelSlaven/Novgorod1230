import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConversationListenerPerception } from '../src/index.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

function input(overrides = {}) {
  return {
    listener_ref: ref('npc', 'listener'),
    perception_result_ref: ref('perception_result', 'perception-1'),
    acoustic_path: 'clear',
    distance_band: 'conversation',
    ambient_noise: 'ordinary',
    hearing_capability: 'full',
    attention: 'available',
    language_comprehension: 'full',
    speaker_recognition: 'recognized',
    witness_policy_allows: true,
    ...overrides
  };
}

test('conversation perception excludes unheard listeners', () => {
  assert.deepEqual(resolveConversationListenerPerception(input({
    hearing_capability: 'none'
  })), {
    listener_ref: ref('npc', 'listener'),
    perception_result_ref: ref('perception_result', 'perception-1'),
    perception_result: 'not_perceived',
    comprehension: 'none',
    speaker_recognized: false,
    witness_policy_allows: false
  });
});

test('conversation perception preserves partial comprehension', () => {
  assert.deepEqual(resolveConversationListenerPerception(input({
    distance_band: 'nearby',
    ambient_noise: 'loud'
  })), {
    listener_ref: ref('npc', 'listener'),
    perception_result_ref: ref('perception_result', 'perception-1'),
    perception_result: 'perceived_partial',
    comprehension: 'partial',
    speaker_recognized: true,
    witness_policy_allows: false
  });
});
