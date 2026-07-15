import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERCEPTION_LEVELS,
  SENSORY_EVENT_SCHEMA,
  validatePerceptionResult,
  validateSensoryEvent,
  validateSensorySceneSnapshot
} from '../src/index.js';

const event = Object.freeze({
  version: 1,
  schema: 'sensory_event_v1',
  event_id: 'event:door:1',
  party_id: 'party:1',
  turn_id: 'turn:1',
  wave_index: 0,
  modality: 'sound',
  source_kind: 'action',
  source_id: 'action:open-door',
  source_anchor_id: 'anchor:door',
  signal_profile_id: 'signal:door-creak',
  causal_action_id: 'command:open-door',
  emitted_at: '1241-01-01T00:00:00.000Z',
  duration_ms: 600,
  base_strength_units: 30,
  directionality_profile_id: 'direction:omni',
  semantic_class_id: 'sound:door-creak',
  routine_context_tags: ['building:warehouse'],
  state_version: 3,
  profile_digest: 'a'.repeat(64)
});

test('sensory contracts accept complete immutable inputs and expose fixed levels', () => {
  assert.equal(SENSORY_EVENT_SCHEMA, 'sensory_event_v1');
  assert.deepEqual(validateSensoryEvent(event), []);
  assert.deepEqual(PERCEPTION_LEVELS, ['blocked','below_threshold','detected','localized','classified','identified','speech_understood']);
  assert.deepEqual(validateSensorySceneSnapshot({
    version: 1,
    schema: 'sensory_scene_snapshot_v1',
    party_id: 'party:1',
    g4_id: 'g4:1',
    state_version: 3,
    clock: { now: '1241-01-01T00:00:00.000Z' },
    weather: { profile_id: 'weather:clear' },
    light_state: { profile_id: 'light:day' },
    g5_nodes: [{ node_id: 'node:yard', acoustic_loss_units: 0 }],
    g5_edges: [],
    g5_anchors: [{ anchor_id: 'anchor:door', node_id: 'node:yard' }],
    actor_positions: [{ actor_id: 'npc:guard', anchor_id: 'anchor:door' }],
    actor_attention_states: [{ actor_id: 'npc:guard', focus_mode: 'watching' }],
    actor_perception_profile_refs: [{ actor_id: 'npc:guard', perception_profile_id: 'perception:guard' }],
    active_light_sources: [],
    ambient_sound_profiles: [{ node_id: 'node:yard', profile_id: 'ambient:yard' }],
    prospective_edge_states: [],
    snapshot_digest: 'b'.repeat(64)
  }), []);
});

test('sensory contracts fail closed for missing profile bindings and invalid result hierarchy', () => {
  assert.ok(validateSensoryEvent({ ...event, signal_profile_id: '' }).some((issue) => issue.code === 'SENSORY_EVENT_REQUIRED_FIELD'));
  assert.ok(validateSensorySceneSnapshot({ version: 1, schema: 'sensory_scene_snapshot_v1' }).some((issue) => issue.code === 'SENSORY_SNAPSHOT_REQUIRED_FIELD'));
  assert.ok(validatePerceptionResult({
    version: 1,
    schema: 'perception_result_v1',
    result_id: 'result:1',
    event_id: event.event_id,
    observer_kind: 'npc',
    observer_id: 'npc:guard',
    observer_anchor_id: 'anchor:door',
    modality: 'sound',
    physical_reach: true,
    perceived: false,
    perception_level: 'identified',
    direction_resolution: 'none',
    identified_source_id: 'action:open-door',
    identified_semantic_class_id: null,
    speech_content_id: null,
    confidence_band: 'none',
    path_id: 'path:1',
    arrival_strength_units: 20,
    threshold_units: 30,
    margin_units: -10,
    applied_profile_ids: ['signal:door-creak'],
    check_result_id: null,
    trace_digest: 'c'.repeat(64),
    state_version: 3
  }).some((issue) => issue.code === 'PERCEPTION_RESULT_INVARIANT'));
});
