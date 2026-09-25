import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDisplayedMovementRoute, readStage23AuditOutput } from './target-http-browser-smoke.js';

test('real-provider Stage 23 capture keeps only diagnostic audit fields', async () => {
  const response = (output) => new Response(JSON.stringify({ choices: [{ message: {
    content: JSON.stringify(output) } }] }));
  const attempts = [{ pass: false, failed_checks: ['factual_grounding_check'],
    concerns: [{ code: 'UNSUPPORTED_FACT', severity: 'repairable', message: 'Unsupported detail.',
      private_state: 'hidden' }], evidence: ['Unsupported detail.'],
    request: { api_key: 'secret', hidden_state: 'hidden' } },
  { pass: true, failed_checks: [], concerns: [], evidence: ['Grounded.'] }];
  assert.deepEqual(await Promise.all(attempts.map((output) => readStage23AuditOutput(response(output)))), [
    { pass: false, failed_checks: ['factual_grounding_check'],
      concerns: [{ code: 'UNSUPPORTED_FACT', severity: 'repairable', message: 'Unsupported detail.' }],
      evidence: ['Unsupported detail.'] },
    { pass: true, failed_checks: [], concerns: [], evidence: ['Grounded.'] }]);
});

function movement(previous, optionId, label, destinationOrigin = null) {
  previous.result.screen.panels.route.data.movement.options = [{ label, knowledge_state: 'known' }];
  previous.result.screen.visible_context.visible_objects = [{ display_label: label,
    entity_ref: { entity_kind: optionId.startsWith('directional_exit:')
      ? 'g4_directional_exit' : 'scene_movement_edge', entity_id: optionId } }];
  const isExit = optionId.startsWith('directional_exit:');
  const before = { positions: [1], position_slot: 'arrival', sites: '1',
    site: { id: 'source', origin: 'canonical' }, connections: [], party: { state_version: 1 } };
  const after = { positions: [2], position_slot: 'focus', sites: isExit ? '2' : '1',
    site: isExit ? { id: 'target', origin: destinationOrigin } : before.site,
    connections: isExit ? [{ id: 'connection', from_site_id: 'source', to_site_id: 'target', status: 'active' }] : [],
    party: { state_version: 2 } };
  return { args: [1, { raw_text: label }], before, after, result: {
    movement: {}, screen: emptyScreen() } };
}

function emptyScreen() { return { panels: { route: { data: { movement: { options: [] } } } },
  visible_context: { visible_objects: [] } }; }

test('displayed exit accepts generated destination after observation retry', () => {
  const observation = { result: { screen: emptyScreen() } };
  const exit = movement(observation, 'directional_exit:current', 'Иду по показанному пути', 'generated');
  assert.deepEqual(assertDisplayedMovementRoute([observation, observation, exit]), { generated: true });
});

test('terminal ordinal zero reaches canonical G5, with or without preceding local movement', () => {
  const directObservation = { result: { screen: emptyScreen() } };
  const directExit = movement(directObservation, 'directional_exit:current', 'Иду дальше', 'canonical');
  assert.deepEqual(assertDisplayedMovementRoute([directObservation, directObservation, directExit]), { generated: false });
  const observation = { result: { screen: emptyScreen() } };
  const local = movement(observation, 'local_scene_edge:current', 'Иду к опушке');
  const exit = movement(local, 'directional_exit:current', 'Иду дальше', 'canonical');
  assert.deepEqual(assertDisplayedMovementRoute([observation, observation, local, exit]), { generated: false });
  assert.throws(() => assertDisplayedMovementRoute([observation, observation, local]),
    /displayed directional exit must reach a committed G5/);
  exit.args[1].raw_text = 'Непоказанный путь';
  assert.throws(() => assertDisplayedMovementRoute([observation, observation, local, exit]),
    /exact currently displayed approved movement label/);
});

test('exit rejects wrong connection even when destination origin and count look valid', () => {
  const observation = { result: { screen: emptyScreen() } };
  const exit = movement(observation, 'directional_exit:current', 'Иду дальше', 'generated');
  exit.after.connections[0].from_site_id = 'other';
  assert.throws(() => assertDisplayedMovementRoute([observation, observation, exit]),
    /exit must commit one connection from current to destination site/);
});

test('actions after the committed exit do not change route proof', () => {
  const observation = { result: { screen: emptyScreen() } };
  const exit = movement(observation, 'directional_exit:current', 'Иду по показанному пути', 'generated');
  const laterAction = { args: [1, { raw_text: 'Собираю хворост' }], result: { screen: emptyScreen() } };
  assert.doesNotThrow(() => assertDisplayedMovementRoute([observation, observation, exit, laterAction]));
});
