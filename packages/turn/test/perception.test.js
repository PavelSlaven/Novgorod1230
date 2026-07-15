import assert from 'node:assert/strict';
import test from 'node:test';
import { createNpcReactionHandlerRegistry, evaluatePerceptionCycle } from '@rus/perception';
import { evaluatePerceptionStage } from '../src/stages/perception.js';

const base = { playerInput: { party_id: 'p' }, modeResolution: { turn_id: 't' }, retrievedState: {}, timeUpdate: {} };

test('perception stage is inert without sensory events and blocks a missing engine otherwise', async () => {
  const inactive = await evaluatePerceptionStage({ ...base, consequence: { sensory_events: [] } });
  assert.equal(inactive.status, 'not_applicable');
  await assert.rejects(() => evaluatePerceptionStage({ ...base, consequence: { sensory_events: [{ event_id: 'e' }] } }), (error) => error.code === 'TURN_PERCEPTION_ENGINE_REQUIRED');
});

test('single approved NPC reaction executes code handler without a bounded-decision call', async () => {
  const digest = 'a'.repeat(64);
  const snapshot = { version: 1, schema: 'sensory_scene_snapshot_v1', party_id: 'p', g4_id: 'g4', state_version: 0, clock: {}, weather: { sound_loss_units: 0 }, light_state: { visibility_loss_units: 0 }, g5_nodes: [{ node_id: 'n' }], g5_edges: [], g5_anchors: [{ anchor_id: 'a', node_id: 'n' }], actor_positions: [], actor_attention_states: [], actor_perception_profile_refs: [], active_light_sources: [], ambient_sound_profiles: [], prospective_edge_states: [], snapshot_digest: digest };
  const event = { version: 1, schema: 'sensory_event_v1', event_id: 'e', party_id: 'p', turn_id: 't', wave_index: 0, modality: 'sound', source_kind: 'action', source_id: 'action', source_anchor_id: 'a', signal_profile_id: 'signal', causal_action_id: 'command', emitted_at: '1241-01-01T00:00:00.000Z', duration_ms: 1, base_strength_units: 10, directionality_profile_id: 'omni', semantic_class_id: 'noise', routine_context_tags: [], state_version: 0, profile_digest: digest };
  const observer = { kind: 'npc', actor_id: 'npc', anchor_id: 'a', perception_profile: { profile_id: 'profile', hearing_threshold_units: 1, localization_margin_units: 1, classification_margin_units: 2, identification_margin_units: 3, speech_margin_units: 4 }, attention_state: {}, ambient_profile: { ambient_noise_floor_units: 0 }, reaction_context: { current_awareness_state: 'calm', routine_match: false, significance: 'high', reaction_policy_id: 'policy', policy: { transitions: { calm: { routine: 'calm', nonroutine: 'attentive', significant: 'suspicious' } } }, options: [{ option_id: 'call', command_id: 'command:call' }] } };
  const cycle = evaluatePerceptionCycle({ cycle_id: 'cycle', snapshot, events: [event], observers: [observer] });
  let handlerCalls = 0;
  const secondary = { ...event, event_id: 'e:reaction', source_id: 'npc', causal_action_id: 'command:call', wave_index: 1, parent_event_id: 'e', causal_reaction_id: 'npc-reaction:reaction:e:npc' };
  const handlers = createNpcReactionHandlerRegistry([{ command_id: 'command:call', handler() { handlerCalls += 1; return { version: 1, schema: 'npc_reaction_effect_v1', secondary_events: [secondary] }; } }]);
  const output = await evaluatePerceptionStage({ ...base, consequence: { sensory_events: [event] }, perceptionEngine: { async evaluate() { return { cycle, pins: { perception_algorithm_id: 'v1', sensory_catalog_digest: digest, reaction_policy_digest: digest } }; }, async evaluateWave({ events, wave_index }) { assert.equal(wave_index, 1); assert.deepEqual(events, [secondary]); return { cycle: evaluatePerceptionCycle({ cycle_id: 'cycle:wave:1', snapshot, events, observers: [] }), pins: { perception_algorithm_id: 'v1', sensory_catalog_digest: digest, reaction_policy_digest: digest } }; } }, npcReactionHandlers: handlers, decisionExecutor() { throw new Error('bounded executor must not be called'); } });
  assert.equal(handlerCalls, 1);
  assert.equal(output.reaction_decisions[0].resolution_kind, 'code_singleton');
  assert.deepEqual(output.cycle.events.map((entry) => entry.event_id), ['e', 'e:reaction']);
});

test('ambiguous NPC reaction uses a signed bounded decision and executes only its selected handler', async () => {
  const digest = 'a'.repeat(64);
  const snapshot = { version: 1, schema: 'sensory_scene_snapshot_v1', party_id: 'p', g4_id: 'g4', state_version: 0, clock: {}, weather: { sound_loss_units: 0 }, light_state: { visibility_loss_units: 0 }, g5_nodes: [{ node_id: 'n' }], g5_edges: [], g5_anchors: [{ anchor_id: 'a', node_id: 'n' }], actor_positions: [], actor_attention_states: [], actor_perception_profile_refs: [], active_light_sources: [], ambient_sound_profiles: [], prospective_edge_states: [], snapshot_digest: digest };
  const event = { version: 1, schema: 'sensory_event_v1', event_id: 'e', party_id: 'p', turn_id: 't', wave_index: 0, modality: 'sound', source_kind: 'action', source_id: 'action', source_anchor_id: 'a', signal_profile_id: 'signal', causal_action_id: 'command', emitted_at: '1241-01-01T00:00:00.000Z', duration_ms: 1, base_strength_units: 10, directionality_profile_id: 'omni', semantic_class_id: 'noise', routine_context_tags: [], state_version: 0, profile_digest: digest };
  const option = (option_id, command_id) => ({ option_id, command_id, preconditions: [], expected_cost: { kind: 'time', value: 0 }, known_risks: [], reason_visible_to_actor: 'Утверждённая реакция.' });
  const observer = { kind: 'npc', actor_id: 'npc', anchor_id: 'a', perception_profile: { profile_id: 'profile', hearing_threshold_units: 1, localization_margin_units: 1, classification_margin_units: 2, identification_margin_units: 3, speech_margin_units: 4 }, attention_state: {}, ambient_profile: { ambient_noise_floor_units: 0 }, reaction_context: { current_awareness_state: 'calm', routine_match: false, significance: 'high', reaction_policy_id: 'policy', policy: { transitions: { calm: { routine: 'calm', nonroutine: 'attentive', significant: 'suspicious' } } }, options: [option('wait', 'command:wait'), option('call', 'command:call')] } };
  const cycle = evaluatePerceptionCycle({ cycle_id: 'cycle', snapshot, events: [event], observers: [observer] });
  const calls = [];
  const handlers = createNpcReactionHandlerRegistry(['command:wait', 'command:call'].map((command_id) => ({ command_id, handler() { calls.push(command_id); return { version: 1, schema: 'npc_reaction_effect_v1', secondary_events: [] }; } })));
  const output = await evaluatePerceptionStage({ ...base, consequence: { sensory_events: [event] }, perceptionEngine: { async evaluate() { return { cycle, pins: { perception_algorithm_id: 'v1', sensory_catalog_digest: digest, reaction_policy_digest: digest } }; } }, npcReactionHandlers: handlers, decisionSecret: 'secret', decisionExpiresAt: '2030-01-01T00:00:00.000Z', now: '2029-01-01T00:00:00.000Z', decisionExecutor({ input }) { return { version: 2, schema: 'bounded_decision_result_v2', request_id: input.request_id, state_version: input.state_version, option_id: 'call', command_token: input.options[1].command_token }; } });
  assert.deepEqual(calls, ['command:call']);
  assert.equal(output.reaction_decisions[0].decision_request.options.length, 2);
  assert.equal(output.reaction_decisions[0].decision_result.command_id, 'command:call');
});

test('perception stage accepts only cycle plus pins from the engine', async () => {
  const digest = 'a'.repeat(64);
  const snapshot = { version: 1, schema: 'sensory_scene_snapshot_v1', party_id: 'p', g4_id: 'g4', state_version: 0, clock: {}, weather: { sound_loss_units: 0 }, light_state: { visibility_loss_units: 0 }, g5_nodes: [{ node_id: 'n' }], g5_edges: [], g5_anchors: [{ anchor_id: 'a', node_id: 'n' }], actor_positions: [], actor_attention_states: [], actor_perception_profile_refs: [], active_light_sources: [], ambient_sound_profiles: [], prospective_edge_states: [], snapshot_digest: digest };
  const event = { version: 1, schema: 'sensory_event_v1', event_id: 'e', party_id: 'p', turn_id: 't', wave_index: 0, modality: 'sound', source_kind: 'action', source_id: 'action', source_anchor_id: 'a', signal_profile_id: 'signal', causal_action_id: 'command', emitted_at: '1241-01-01T00:00:00.000Z', duration_ms: 1, base_strength_units: 1, directionality_profile_id: 'omni', semantic_class_id: 'noise', routine_context_tags: [], state_version: 0, profile_digest: digest };
  const cycle = evaluatePerceptionCycle({ cycle_id: 'cycle', snapshot, events: [event], observers: [] });
  const output = await evaluatePerceptionStage({ ...base, consequence: { sensory_events: [event] }, perceptionEngine: { async evaluate() { return { cycle, pins: { perception_algorithm_id: 'v1', sensory_catalog_digest: digest, reaction_policy_digest: digest } }; } } });
  assert.equal(output.status, 'evaluated');
  assert.equal(output.cycle, cycle);
});
