import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDisplayedMovementRoute, assertTargetObservation, assertTargetTurnEvidence, readStage23AuditOutput,
  TARGET_SMOKE_INPUT } from './target-http-browser-smoke.js';

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
    movement: isExit ? { status: 'completed' } : null, screen: emptyScreen() } };
}

function emptyScreen() { return { panels: { route: { data: { movement: { options: [] } } } },
  visible_context: { visible_objects: [] } }; }

function observation(partyId, requestId, visibleNpcs = [], panelNpcs = visibleNpcs.map(({ display_label }) => ({ display_label }))) {
  const screen = emptyScreen();
  screen.screen_status = 'ready';
  screen.visible_context.visible_npc = visibleNpcs;
  screen.panels.people = { data: { visible_npcs: panelNpcs } };
  const before = { party: { state_version: 1 }, clock: { whole_minutes: 10 }, positions: [1],
    body: [], entity_placements: [], materialization_runs: '1', sites: '1' };
  const after = { ...before, party: { state_version: 2 }, clock: { whole_minutes: 11 } };
  return { method: 'submitTurn', args: [partyId, { raw_text: TARGET_SMOKE_INPUT,
    request_id: requestId, idempotency_key: requestId }], before, after,
  result: { movement: null, screen } };
}

test('observation accepts zero, one, or distinctly numbered unrecognized NPC labels', () => {
  const npc = (id) => ({ display_label: 'человек',
    entity_ref: { entity_kind: 'npc', entity_id: id }, recognition: 'unrecognized',
    observable_cues: { identity: { display_name: 'человек', appearance: {} }, equipment: [] } });
  const empty = observation('forest', 'empty');
  delete empty.result.screen.panels.people;
  assert.doesNotThrow(() => assertTargetObservation(empty));
  const one = observation('forest', 'one', [npc('a')]);
  assert.doesNotThrow(() => assertTargetObservation(one));
  one.result.screen.panels.people.data.visible_npcs[0].display_label = 'человек (1)';
  assert.throws(() => assertTargetObservation(one));
  const two = observation('forest', 'two', [npc('a'), npc('b')],
    [{ display_label: 'человек (1)' }, { display_label: 'человек (2)' }]);
  assert.doesNotThrow(() => assertTargetObservation(two));
  two.result.screen.panels.people.data.visible_npcs[1].display_label = 'человек';
  assert.throws(() => assertTargetObservation(two));
  two.result.screen.panels.people.data.visible_npcs[1].display_label = 'человек (2)';
  two.result.screen.panels.people.data.visible_npcs[1].status = 'скрытый статус';
  assert.throws(() => assertTargetObservation(two));
  delete two.result.screen.panels.people.data.visible_npcs[1].status;
  two.result.screen.panels.people.data.visible_npcs[1].display_label = 'тайное имя';
  assert.throws(() => assertTargetObservation(two));
});

test('real-provider observation advances exact clock within one whole minute', () => {
  const turn = observation('forest', 'fractional');
  turn.before.clock = { whole_minutes: 261121, subminute_numerator: 1, subminute_denominator: 3 };
  turn.after.clock = { whole_minutes: 261121, subminute_numerator: 1, subminute_denominator: 2 };
  turn.result.time_update = { exact_elapsed: { exact_minutes: { numerator: '1', denominator: '6' } } };
  assert.doesNotThrow(() => assertTargetObservation(turn, true));
  turn.result.time_update.exact_elapsed.exact_minutes.denominator = '5';
  assert.throws(() => assertTargetObservation(turn, true), /must equal exact_elapsed/);
  turn.result.time_update.exact_elapsed.exact_minutes.denominator = '6';
  turn.after.clock.subminute_numerator = 2;
  turn.after.clock.subminute_denominator = 6;
  assert.throws(() => assertTargetObservation(turn, true), /advances exact clock only for positive elapsed time/);
  turn.after.clock.subminute_numerator = 1;
  assert.throws(() => assertTargetObservation(turn, true), /advances exact clock only for positive elapsed time/);
});

test('real-provider free look commits state without advancing exact clock', () => {
  const turn = observation('forest', 'free-look');
  turn.before.clock = { whole_minutes: 261121, subminute_numerator: 1, subminute_denominator: 3 };
  turn.after.clock = { whole_minutes: 261121, subminute_numerator: 2, subminute_denominator: 6 };
  turn.result.time_update = { exact_elapsed: { exact_minutes: { numerator: '0', denominator: '1' } } };
  assert.doesNotThrow(() => assertTargetObservation(turn, true));
  turn.after.clock.subminute_numerator = 3;
  assert.throws(() => assertTargetObservation(turn, true), /advances exact clock only for positive elapsed time/);
});

test('displayed exit accepts generated destination after observation', () => {
  const observation = { result: { screen: emptyScreen() } };
  const exit = movement(observation, 'directional_exit:current', 'Иду по показанному пути', 'generated');
  assert.deepEqual(assertDisplayedMovementRoute([observation, exit]), { generated: true });
});

test('terminal ordinal zero reaches canonical G5, with or without preceding local movement', () => {
  const directObservation = { result: { screen: emptyScreen() } };
  const directExit = movement(directObservation, 'directional_exit:current', 'Иду дальше', 'canonical');
  assert.deepEqual(assertDisplayedMovementRoute([directObservation, directExit]), { generated: false });
  const observation = { result: { screen: emptyScreen() } };
  const local = movement(observation, 'local_scene_edge:current', 'Иду к опушке');
  const exit = movement(local, 'directional_exit:current', 'Иду дальше', 'canonical');
  assert.deepEqual(assertDisplayedMovementRoute([observation, local, exit]), { generated: false });
  assert.throws(() => assertDisplayedMovementRoute([observation, local]),
    /displayed directional exit must reach a committed G5/);
  exit.args[1].raw_text = 'Непоказанный путь';
  assert.throws(() => assertDisplayedMovementRoute([observation, local, exit]),
    /exact currently displayed approved movement label/);
});

test('two committed local passages may return null movement before a completed directional exit', () => {
  const observation = { result: { screen: emptyScreen() } };
  const first = movement(observation, 'local_scene_edge:one', 'Проход 1');
  const second = movement(first, 'local_scene_edge:two', 'Проход 2');
  second.before = structuredClone(first.after);
  second.after.positions = [3];
  second.after.position_slot = 'departure';
  second.after.party.state_version = 3;
  const exit = movement(second, 'directional_exit:current', 'Продолжить путь — выход 2', 'generated');
  exit.before = structuredClone(second.after);
  exit.after.party.state_version = 4;
  assert.deepEqual(assertDisplayedMovementRoute([observation, first, second, exit]), { generated: true });
  exit.result.movement = null;
  assert.throws(() => assertDisplayedMovementRoute([observation, first, second, exit]),
    /directional exit must return a movement result/);
});

test('exit rejects wrong connection even when destination origin and count look valid', () => {
  const observation = { result: { screen: emptyScreen() } };
  const exit = movement(observation, 'directional_exit:current', 'Иду дальше', 'generated');
  exit.after.connections[0].from_site_id = 'other';
  assert.throws(() => assertDisplayedMovementRoute([observation, exit]),
    /exit must commit one connection from current to destination site/);
});

test('actions after the committed exit do not change route proof', () => {
  const observation = { result: { screen: emptyScreen() } };
  const exit = movement(observation, 'directional_exit:current', 'Иду по показанному пути', 'generated');
  const laterAction = { args: [1, { raw_text: 'Собираю хворост' }], result: { screen: emptyScreen() } };
  assert.doesNotThrow(() => assertDisplayedMovementRoute([observation, exit, laterAction]));
});

test('occluded observation may show no NPC or route while another party reaches generated G5', () => {
  const occluded = observation('forest', 'look-forest');
  const traveller = observation('river', 'look-river', [{ display_label: 'человек',
    entity_ref: { entity_kind: 'npc' }, recognition: 'unrecognized',
    observable_cues: { identity: { display_name: 'человек', appearance: {} }, equipment: [] } }]);
  const exit = movement(traveller, 'directional_exit:current', 'Иду дальше', 'generated');
  const retry = structuredClone(traveller);
  exit.method = 'submitTurn'; exit.args[0] = 'river';
  assert.deepEqual(assertTargetTurnEvidence([occluded, traveller, retry,
    { method: 'getPartyScreen', args: ['river'] }, exit]),
    [{ party_id: 'river', generated: true }]);
});

test('different observation identities do not count as an HTTP retry', () => {
  const first = observation('river', 'look-one');
  const second = observation('river', 'look-two');
  const exit = movement(second, 'directional_exit:current', 'Иду дальше', 'generated');
  exit.method = 'submitTurn'; exit.args[0] = 'river';
  assert.throws(() => assertTargetTurnEvidence([first, second, exit]), /exact identical HTTP retry/);
});
