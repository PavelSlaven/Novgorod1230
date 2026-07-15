import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PerceptionError,
  evaluateAwareness,
  evaluatePerceptionCycle,
  resolveSoundPaths,
  resolveSoundPerception,
  resolveVisibility,
  routeNpcReaction
} from '../src/index.js';

const digest = 'a'.repeat(64);
const snapshot = Object.freeze({
  version: 1,
  schema: 'sensory_scene_snapshot_v1',
  party_id: 'party:1',
  g4_id: 'g4:1',
  state_version: 3,
  clock: {},
  g5_nodes: [
    { node_id: 'node:source', acoustic_loss_units: 0 },
    { node_id: 'node:courtyard', acoustic_loss_units: 1 },
    { node_id: 'node:guard', acoustic_loss_units: 0 }
  ],
  g5_anchors: [
    { anchor_id: 'anchor:source', node_id: 'node:source' },
    { anchor_id: 'anchor:courtyard', node_id: 'node:courtyard' },
    { anchor_id: 'anchor:guard', node_id: 'node:guard' }
  ],
  g5_edges: [
    { edge_id: 'edge:direct-blocked', from_anchor_id: 'anchor:source', to_anchor_id: 'anchor:guard', sound_blocked: true, sound_loss_units: 0, distance_loss_units: 0, vision_transmission: 'blocked', vision_loss_units: 0 },
    { edge_id: 'edge:one', from_anchor_id: 'anchor:source', to_anchor_id: 'anchor:courtyard', sound_blocked: false, sound_loss_units: 4, distance_loss_units: 1, vision_transmission: 'open', vision_loss_units: 1 },
    { edge_id: 'edge:two', from_anchor_id: 'anchor:courtyard', to_anchor_id: 'anchor:guard', sound_blocked: false, sound_loss_units: 3, distance_loss_units: 1, vision_transmission: 'open', vision_loss_units: 1 }
  ],
  weather: { sound_loss_units: 1, vision_loss_units: 0 },
  light_state: { visibility_loss_units: 2 },
  actor_positions: [], actor_attention_states: [], actor_perception_profile_refs: [],
  active_light_sources: [], ambient_sound_profiles: [], prospective_edge_states: [],
  snapshot_digest: digest
});

const event = Object.freeze({
  version: 1,
  schema: 'sensory_event_v1',
  event_id: 'event:door', party_id: 'party:1', turn_id: 'turn:1', wave_index: 0,
  modality: 'sound', source_kind: 'action', source_id: 'action:door', source_anchor_id: 'anchor:source',
  signal_profile_id: 'signal:door', causal_action_id: 'command:door', emitted_at: '1241-01-01T00:00:00.000Z',
  duration_ms: 200, base_strength_units: 20, directionality_profile_id: 'omni', semantic_class_id: 'sound:door', routine_context_tags: [], state_version: 3, profile_digest: digest
});

test('sound propagation chooses minimum-loss open G5 path and never crosses a sound block', () => {
  const paths = resolveSoundPaths({ event, snapshot });
  assert.equal(paths.by_anchor['anchor:guard'].arrival_strength_units, 9);
  assert.deepEqual(paths.by_anchor['anchor:guard'].edge_ids, ['edge:one','edge:two']);
  assert.equal(paths.by_anchor['anchor:source'].arrival_strength_units, 20);
});

test('hearing is deterministic and monotonic for attenuation', () => {
  const arrival = resolveSoundPaths({ event, snapshot }).by_anchor['anchor:guard'];
  const profile = { profile_id: 'perception:guard', hearing_threshold_units: 8, localization_margin_units: 1, classification_margin_units: 3, identification_margin_units: 6, speech_margin_units: 10 };
  const heard = resolveSoundPerception({ event, observer: { kind: 'npc', actor_id: 'npc:guard', anchor_id: 'anchor:guard' }, arrival, perceptionProfile: profile, attentionState: { focus_mode: 'watching', vigilance_bonus_units: 1, active_listening: false }, ambientProfile: { ambient_noise_floor_units: 4, class_masking_modifier_units: 0 } });
  const muted = resolveSoundPerception({ event: { ...event, base_strength_units: 8 }, observer: { kind: 'npc', actor_id: 'npc:guard', anchor_id: 'anchor:guard' }, arrival: { ...arrival, arrival_strength_units: 0 }, perceptionProfile: profile, attentionState: { focus_mode: 'watching', vigilance_bonus_units: 1, active_listening: false }, ambientProfile: { ambient_noise_floor_units: 4, class_masking_modifier_units: 0 } });
  assert.equal(heard.perceived, true);
  assert.equal(muted.perception_level, 'below_threshold');
  assert.ok(heard.arrival_strength_units > muted.arrival_strength_units);
});

test('blocked vision edge cannot create line of sight', () => {
  const result = resolveVisibility({ event: { ...event, modality: 'visual', base_strength_units: 20 }, snapshot: { ...snapshot, g5_edges: [snapshot.g5_edges[0]] }, observer: { kind: 'npc', actor_id: 'npc:guard', anchor_id: 'anchor:guard' }, perceptionProfile: { profile_id: 'perception:guard', visual_threshold_units: 1, visual_classification_margin_units: 1, visual_identification_margin_units: 2 }, attentionState: { focus_mode: 'watching' } });
  assert.equal(result.physical_reach, false);
  assert.equal(result.perception_level, 'blocked');
});

test('routine sound is ignored and only ambiguous approved options request bounded choice', () => {
  const awareness = evaluateAwareness({ current_state: 'calm', perception_result: { perceived: true, perception_level: 'classified', event_id: event.event_id }, routine_match: true, significance: 'low', policy: { transitions: { calm: { routine: 'calm', significant: 'attentive' } } } });
  assert.equal(awareness.next_state, 'calm');
  assert.equal(routeNpcReaction({ party_id: 'party:1', event_id: event.event_id, observer_id: 'npc:guard', reaction_policy_id: 'policy:guard', state_version: 3, awareness, options: [] }).status, 'no_reaction');
  const routed = routeNpcReaction({ party_id: 'party:1', event_id: event.event_id, observer_id: 'npc:guard', reaction_policy_id: 'policy:guard', state_version: 3, awareness: { next_state: 'suspicious', reaction_required: true }, options: [{ option_id: 'wait', command_id: 'command:wait', command_token: 't1' }, { option_id: 'call', command_id: 'command:call', command_token: 't2' }] });
  assert.equal(routed.status, 'bounded_decision_required');
  assert.equal(routed.options.length, 2);
  assert.throws(() => routeNpcReaction({ party_id: 'party:1', event_id: event.event_id, observer_id: 'npc:guard', reaction_policy_id: 'policy:guard', state_version: 3, awareness: { reaction_required: true }, options: [] }), PerceptionError);
});

test('perception cycle preserves approved options and hard-blocks an NPC data gap', () => {
  const observer = {
    kind: 'npc', actor_id: 'npc:guard', anchor_id: 'anchor:guard',
    perception_profile: { profile_id: 'perception:guard', hearing_threshold_units: 8, localization_margin_units: 1, classification_margin_units: 3, identification_margin_units: 6, speech_margin_units: 10 },
    attention_state: { vigilance_bonus_units: 1 }, ambient_profile: { ambient_noise_floor_units: 4 },
    reaction_context: { current_awareness_state: 'calm', routine_match: false, significance: 'high', reaction_policy_id: 'policy:guard', policy: { transitions: { calm: { routine: 'calm', significant: 'suspicious', nonroutine: 'attentive' } } }, options: [{ option_id: 'call', command_id: 'command:call', command_token: 'call-token' }] }
  };
  const cycle = evaluatePerceptionCycle({ cycle_id: 'cycle:1', snapshot, events: [event], observers: [observer] });
  assert.equal(cycle.reaction_routings[0].status, 'code_reaction');
  assert.throws(() => evaluatePerceptionCycle({ cycle_id: 'cycle:2', snapshot, events: [event], observers: [{ ...observer, reaction_context: null }] }), (error) => error.code === 'NPC_REACTION_CONTEXT_MISSING');
});

test('understood speech does not disclose a source that was not identified', () => {
  const speech = resolveSoundPerception({ event: { ...event, semantic_class_id: 'speech' }, observer: { kind: 'player', actor_id: 'player:1', anchor_id: 'anchor:guard' }, arrival: { path_id: 'speech-path', arrival_strength_units: 8, physical_reach: true }, perceptionProfile: { profile_id: 'player', hearing_threshold_units: 1, localization_margin_units: 1, classification_margin_units: 2, identification_margin_units: 9, speech_margin_units: 7 }, ambientProfile: { ambient_noise_floor_units: 0 } });
  assert.equal(speech.perception_level, 'speech_understood');
  assert.equal(speech.identified_source_id, null);
});
