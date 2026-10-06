import assert from 'node:assert/strict';
import { withLowerDvinaTraceCurrentScene } from
  '../src/runtime/lower-dvina-trace-turn-step-current-scene.js';

export function assertCurrentSceneSelfIdentity({ committedState, locationProfiles,
  scenePresentation }) {
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
    const current = withLowerDvinaTraceCurrentScene({ committedState: state,
      locationProfiles, scenePresentation });
    const visible = current.current_visible_context;
    assert.ok(visible.known_context.includes('Вас зовут Ульяна.'));
    assert.ok(visible.known_context.includes('Ваш род занятий: ткачиха.'));
    assert.equal(visible.visible_npc[0].entity_ref.entity_id, 'onisim');
    assert.equal(visible.visible_npc[0].display_label, 'Ульяна');
    assert.doesNotMatch(JSON.stringify(visible), /тайная биография|тайный замысел/u);
    assert.deepEqual(state, before);
    const reloadedState = JSON.parse(JSON.stringify(current));
    assert.equal('current_spatial_context' in reloadedState, false);
    assert.equal('current_spatial_context_is_fresh' in reloadedState, false);
    assert.equal('current_spatial_context_filters_entities' in reloadedState, false);
    const reloaded = withLowerDvinaTraceCurrentScene({
      committedState: reloadedState, locationProfiles, scenePresentation });
    assert.equal(reloaded.current_visible_context.visible_npc[0].display_label,
      'Ульяна');
    assert.ok(reloaded.current_visible_context.known_context.includes(
      'Вас зовут Ульяна.'));
  }
}
