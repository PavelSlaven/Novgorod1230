import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectCurrentSceneForNoOperationDirect,
  withLowerDvinaTraceCurrentScene
} from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';

const locationProfiles = [{ location_profile_id: 'shed',
  display_name: 'Старая сушильня', landscape_basis: 'Доски и мокрая трава.',
  economic_basis: 'Пустая сушильня.' }];

test('fresh current scene keeps canonical co-located NPC observations only', () => {
  const state = committedState();
  const current = withLowerDvinaTraceCurrentScene({ committedState: state,
    locationProfiles });
  assert.deepEqual(current.current_visible_context.visible_npc, [{
    entity_ref: { entity_kind: 'npc', entity_id: 'onisim' },
    display_label: 'Онисим'
  }]);
  assert.equal(current.current_visible_context.known_context.includes(
    'Онисим: injured_unable_to_walk'), true);
  const projected = projectLowerDvinaTracePlayerSafeState({
    committed_state: current, actor_id: state.actor_id
  }).player_safe_state;
  assert.equal(projected.npcs.find(({ instance_id: id }) => id === 'onisim')
    .body_condition, 'injured_unable_to_walk');
  assert.equal(projected.npcs.some(({ instance_id: id }) => id === 'moved'), false);
  assert.equal(projected.npcs.some(({ instance_id: id }) => id === 'hidden'), false);
  assert.equal(current.party_state.state_version, 9);
  assert.deepEqual(current.route_history, state.route_history);
  const direct = projectCurrentSceneForNoOperationDirect({ input: {
    consequence: {}, retrieved_state: current, mode_resolution: {
      decision_trace: { step_traces: [{ approved_plan: { resolution: 'direct',
        operations: [], check: null } }] }
    } }, directSeedKeys: ['turn_step_1'], body: {} });
  assert.deepEqual(direct.visible_npc, current.current_visible_context.visible_npc);
  assert.equal(direct.known_context.includes('Онисим: injured_unable_to_walk'),
    true);
});

function committedState() {
  return { actor_id: 'player', party_state: { state_version: 9 },
    position: { location_ref: 'shed', g5_anchor_id: 'shed-anchor', zone_ref: 'yard' },
    route_history: [{ route_ref: 'camp-shed' }], npcs: [{ instance_id: 'onisim',
      location_ref: 'shed', anchor_id: 'shed-anchor', zone_ref: 'yard',
      identity_state: { canonical_name: 'Онисим' }, machine_state: {
        body_condition: { state: 'injured_unable_to_walk' }
      } }, { instance_id: 'moved', location_ref: 'camp', anchor_id: 'shed-anchor',
      zone_ref: 'yard', identity_state: { canonical_name: 'Еремей' } },
    { instance_id: 'hidden', location_ref: 'shed', anchor_id: 'shed-anchor',
      zone_ref: 'yard', visibility_state: 'hidden',
      identity_state: { canonical_name: 'Ратша' } }] };
}
