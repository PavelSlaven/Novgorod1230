import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveConversationListenerPerception,
  resolveConversationVisualPerception
} from '../src/index.js';

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

test('conversation visual perception is independent from hearing', () => {
  const visual = (overrides = {}) => resolveConversationVisualPerception({
    observer_ref: ref('npc', 'listener'),
    perception_result_ref: ref('perception_result', 'visual-perception-1'),
    visual_path: 'clear',
    distance_band: 'conversation',
    ambient_visibility: 'clear',
    visual_capability: 'full',
    attention: 'available',
    ...overrides
  });

  assert.equal(visual().perception_result, 'recognized');
  assert.equal(visual({ visual_capability: 'none' }).perception_result,
    'not_perceived');
  assert.equal(visual({ ambient_visibility: 'degraded' }).perception_result,
    'perceived_partial');
});
