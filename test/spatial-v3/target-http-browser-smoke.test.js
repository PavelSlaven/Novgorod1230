import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDisplayedMovementRoute } from './target-http-browser-smoke.js';

function movement(previous, optionId, label, siteDelta = 0) {
  previous.result.screen.panels.route.data.movement.options = [{ label, knowledge_state: 'known' }];
  previous.result.screen.visible_context.visible_objects = [{ display_label: label,
    entity_ref: { entity_kind: optionId.startsWith('directional_exit:')
      ? 'g4_directional_exit' : 'scene_movement_edge', entity_id: optionId } }];
  const before = { positions: [1], position_slot: 'arrival', sites: '0', party: { state_version: 1 } };
  const after = { positions: [2], position_slot: 'focus', sites: String(siteDelta), party: { state_version: 2 } };
  return { args: [1, { raw_text: label }], before, after, result: {
    movement: {}, screen: emptyScreen() } };
}

function emptyScreen() { return { panels: { route: { data: { movement: { options: [] } } } },
  visible_context: { visible_objects: [] } }; }

test('displayed directional exit can create G5 directly after observation retry', () => {
  const observation = { result: { screen: emptyScreen() } };
  const exit = movement(observation, 'directional_exit:current', 'Иду по показанному пути', 1);
  assert.doesNotThrow(() => assertDisplayedMovementRoute([observation, observation, exit]));
});

test('displayed local movement may precede exit, but exit remains required', () => {
  const observation = { result: { screen: emptyScreen() } };
  const local = movement(observation, 'local_scene_edge:current', 'Иду к опушке');
  const exit = movement(local, 'directional_exit:current', 'Иду дальше', 1);
  assert.doesNotThrow(() => assertDisplayedMovementRoute([observation, observation, local, exit]));
  assert.throws(() => assertDisplayedMovementRoute([observation, observation, local]),
    /displayed directional exit must create G5/);
  exit.args[1].raw_text = 'Непоказанный путь';
  assert.throws(() => assertDisplayedMovementRoute([observation, observation, local, exit]),
    /exact currently displayed approved movement label/);
});

test('actions after the committed exit do not change route proof', () => {
  const observation = { result: { screen: emptyScreen() } };
  const exit = movement(observation, 'directional_exit:current', 'Иду по показанному пути', 1);
  const laterAction = { args: [1, { raw_text: 'Собираю хворост' }], result: { screen: emptyScreen() } };
  assert.doesNotThrow(() => assertDisplayedMovementRoute([observation, observation, exit, laterAction]));
});
