import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDisplayedMovementRoute } from './target-http-browser-smoke.js';

function movement(previous, optionId, label, siteDelta = 0) {
  previous.result.screen.action_panel.suggested_actions = [{ option_id: optionId, label }];
  const before = { positions: [1], position_slot: 'arrival', sites: '0', party: { state_version: 1 } };
  const after = { positions: [2], position_slot: 'focus', sites: String(siteDelta), party: { state_version: 2 } };
  return { args: [1, { raw_text: label }], before, after, result: {
    movement: {}, screen: { action_panel: { suggested_actions: [] } } } };
}

test('displayed directional exit can create G5 directly after observation retry', () => {
  const observation = { result: { screen: { action_panel: { suggested_actions: [] } } } };
  const exit = movement(observation, 'directional_exit:current', 'Иду по показанному пути', 1);
  assert.doesNotThrow(() => assertDisplayedMovementRoute([observation, observation, exit]));
});

test('displayed local movement may precede exit, but exit remains required', () => {
  const observation = { result: { screen: { action_panel: { suggested_actions: [] } } } };
  const local = movement(observation, 'local_scene_edge:current', 'Иду к опушке');
  const exit = movement(local, 'directional_exit:current', 'Иду дальше', 1);
  assert.doesNotThrow(() => assertDisplayedMovementRoute([observation, observation, local, exit]));
  assert.throws(() => assertDisplayedMovementRoute([observation, observation, local]),
    /displayed directional exit must create G5/);
  exit.args[1].raw_text = 'Непоказанный путь';
  assert.throws(() => assertDisplayedMovementRoute([observation, observation, local, exit]),
    /exact currently displayed approved movement label/);
});
