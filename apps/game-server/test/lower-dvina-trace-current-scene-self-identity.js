import assert from 'node:assert/strict';
import { withLowerDvinaTraceCurrentScene } from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';

export function assertCurrentSceneSelfIdentity({ committedState, locationProfiles }) {
  for (const version of [0, 9]) {
    const state = committedState();
    state.party_state.state_version = version;
    state.player_profile = { identity: { name: 'Ульяна' },
      social_status: { display_name: 'ткачиха' },
      origin: { biography_basis: 'тайная биография' },
      knowledge: { hidden_motive: 'тайный замысел' } };
    state.current_visible_context.visible_npc[0].display_label = 'Ульяна';
    state.current_visible_context.visible_npc[0].recognition = 'recognized';
    const before = structuredClone(state);
    const current = withLowerDvinaTraceCurrentScene({ committedState: state, locationProfiles });
    const visible = current.current_visible_context;
    assert.ok(visible.known_context.includes('Вас зовут Ульяна.'));
    assert.ok(visible.known_context.includes('Ваш род занятий: ткачиха.'));
    assert.equal(visible.visible_npc[0].entity_ref.entity_id, 'onisim');
    assert.equal(visible.visible_npc[0].display_label, 'Ульяна');
    assert.doesNotMatch(JSON.stringify(visible), /тайная биография|тайный замысел/u);
    assert.deepEqual(state, before);
    const reloaded = withLowerDvinaTraceCurrentScene({
      committedState: JSON.parse(JSON.stringify(current)), locationProfiles });
    assert.deepEqual(reloaded.current_visible_context, visible);
  }
}
