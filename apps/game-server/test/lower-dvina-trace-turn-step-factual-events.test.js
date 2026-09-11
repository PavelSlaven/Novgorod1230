import assert from 'node:assert/strict';
import test from 'node:test';
import { applySemanticActivity } from '../src/runtime/lower-dvina-trace-turn-step-delegated-ports.js';
import { initializeRuntimeState } from '../src/runtime/lower-dvina-trace-turn-step-item-operations.js';
import { createLowerDvinaTracePostAppliedActorStepOwner } from '../src/runtime/lower-dvina-trace-post-applied-actor-step.js';

test('direct utterance adapter emits one text-free formal acoustic fact', async () => {
  const clock = { whole_minutes: '10', subminute_numerator: '0',
    subminute_denominator: '1' };
  const state = initializeRuntimeState({ party_id: 'party', actor_id: 'actor',
    party_state: { turn_number: 0 }, clock,
    position: { location_ref: 'shore' }, items: [] });
  const result = await applySemanticActivity({
    request: { root_turn_id: 'turn', step_index: 1,
      actor: { actor_id: 'actor', body: {} } },
    plan: { resolution: 'direct', direct_result_kind: 'player_utterance',
      utterance: { speaker_ref: 'actor', utterance_text: 'Эй, отзовитесь!',
        input_mode: 'verbatim',
        delivery: { loudness: 4, duration_class: 'instant' } } },
    operation: { activity: { owner: 'semantic', duration_class: 'moment',
      effort: 'none' } },
    working_projection: { actor_id: 'actor', spatial_semantic: {
      position_ref: 'shore' } },
    check_result: null,
    prepared_chain_context: null
  }, state, { resolve: async () => ({
    profile_ref: 'semantic:moment:none',
    profile_pin: { artifact_id: 'semantic', revision: 1,
      digest: 'a'.repeat(64) },
    duration_class: 'moment', effort: 'none', duration_minutes: 0,
    body_effect_ref: null, body_effect_profile_ref: 'body:none',
    exact_deltas: {}, body_state_after: {}
  }) });

  assert.equal(result.factual_events.length, 1);
  assert.deepEqual(result.factual_events[0].perceptible_signal, {
    channel: 'acoustic', emission_strength: 4, duration_class: 'instant'
  });
  assert.equal(result.factual_events[0].source_scope_ref.entity_id, 'shore');
  assert.equal(JSON.stringify(result.factual_events).includes('Эй'), false);
});

test('completed no-perceiver window is explicit and does not invoke an NPC',
  async () => {
    const owner = createLowerDvinaTracePostAppliedActorStepOwner({
      committedState: { position: { location_ref: 'shore',
        g5_anchor_id: 'shore-anchor' }, npcs: [] }
    });
    const event = {
      version: 1, schema: 'turn_step_factual_event_v1',
      event_ref: { entity_kind: 'sound_event', entity_id: 'sound:1' },
      occurred_at: { whole_minutes: '10', subminute_numerator: '0',
        subminute_denominator: '1' },
      source_ref: { entity_kind: 'player_character', entity_id: 'actor' },
      source_scope_ref: { entity_kind: 'canonical_spatial_node',
        entity_id: 'shore' },
      perceptible_signal: { channel: 'acoustic', emission_strength: 4,
        duration_class: 'instant' }
    };
    const result = await owner({ working_projection: { actor_id: 'actor' },
      factual_events: [event] });
    assert.deepEqual(result.consequence_fragment.state_changes[0], {
      kind: 'post_applied_perception_window', event_ref: event.event_ref,
      opened_at: event.occurred_at, closed_at: event.occurred_at,
      status: 'completed', perceived_actor_refs: [],
      observable_response_event_refs: []
    });
    assert.deepEqual(result.write_fragments, []);
  });

test('nearby NPC fails on missing pinned perception profile instead of reacting',
  async () => {
    const owner = createLowerDvinaTracePostAppliedActorStepOwner({
      committedState: { position: { location_ref: 'shore',
        g5_anchor_id: 'shore-anchor' },
      npcs: [{ instance_id: 'npc-1', anchor_id: 'shore-anchor' }] }
    });
    await assert.rejects(() => owner({ working_projection: {}, factual_events: [{
      event_ref: { entity_kind: 'sound_event', entity_id: 'sound:1' },
      occurred_at: { whole_minutes: '10', subminute_numerator: '0',
        subminute_denominator: '1' },
      source_scope_ref: { entity_id: 'shore' }
    }] }), ({ code }) => code === 'TRACE_POST_ACTION_PERCEPTION_PROFILE_GAP');
  });
