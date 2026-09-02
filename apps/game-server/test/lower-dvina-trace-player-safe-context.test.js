import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLowerDvinaTracePlayerSafeState } from
  '../src/runtime/lower-dvina-trace-player-safe-state.js';
import { richCommittedState } from
  './lower-dvina-trace-player-safe-state-fixture.js';

test('projects the committed player context needed by the step planner', () => {
  const result = projectLowerDvinaTracePlayerSafeState({
    committed_state: richCommittedState(), actor_id: 'mikula'
  });
  assert.deepEqual(result.actor, {
    actor_id: 'mikula',
    attributes: { strength: { value: 9 } },
    skills: { observation: { bonus: 2 } },
    body: { health: 79, energy: 37 }
  });
  assert.deepEqual(result.player_safe_state.position, {
    location_ref: 'shed', g5_anchor_id: 'shed-anchor'
  });
  assert.equal(result.player_safe_state.clock.whole_minutes, '333060');
  assert.deepEqual(result.player_safe_state.clock_weather_light.weather,
    { precipitation: 'rain' });
  assert.deepEqual(result.player_safe_state.inventory.items, ['knife']);
  assert.deepEqual(result.player_safe_state.items.map(({ item_id: id }) => id),
    ['knife', 'open-box', 'closed-box']);
  assert.deepEqual(result.player_safe_state.items[1].contents,
    [{ item_id: 'bandage' }]);
  assert.equal('contents' in result.player_safe_state.items[2], false);
  assert.deepEqual(result.player_safe_state.npcs.map(
    ({ instance_id: id }) => id), ['onisim']);
  assert.deepEqual(result.player_safe_state.interactions,
    [{ interaction_id: 'talk-1', statement_ref: 'known-statement' }]);
  assert.deepEqual(result.player_safe_state.routes.map(({ route_id: id }) => id),
    ['shed-camp']);
  assert.deepEqual(result.player_safe_state.route_history,
    [{ route_ref: 'shore-camp' }]);
  assert.deepEqual(result.player_safe_state.route_knowledge, ['shore-camp']);
  assert.deepEqual(result.player_safe_state.knowledge,
    [{ fact_id: 'onisim_stabilized', knowledge_state: 'known' }]);
  assert.deepEqual(result.player_safe_state.visible_context, {
    visible_scene: 'Старая сушильня', visible_objects: ['stretcher']
  });
});
