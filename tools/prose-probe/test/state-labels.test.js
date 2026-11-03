import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { changeFrame, fixture, readJson, run, setup, writeJson, writeRecording } from './fixtures/helper.mjs';

const d10 = { id: 'd10', title: 'd10', from_turn: 13071600, to_turn: 13072231 };
const stateChanges = packets => packets.flatMap(moment => moment.parts.flatMap(part => part.packet.События ?? []))
  .filter(text => text.startsWith('Перемена '));

async function packetRun(t, recording, moment) {
  const dir = await setup(t, 'state-labels-');
  const recordingPath = Array.isArray(recording) ? join(dir, 'recording.jsonl') : recording;
  if (Array.isArray(recording)) await writeRecording(recordingPath, recording);
  const momentsPath = join(dir, 'moments.json');
  await writeJson(momentsPath, [moment]);
  const gameData = join(dir, 'game-data');
  await writeJson(join(gameData, 'items.json'), await readJson(fixture('visit-31c-items.json')));
  const result = run(['packets', '--dir', dir, '--recording', recordingPath, '--moments', momentsPath, '--game-data', gameData]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { dir, packets: await readJson(join(dir, 'packets.json')) };
}

async function sourceRows() {
  return (await readFile(fixture('visit-32-state-changes.jsonl'), 'utf8'))
    .trim().split(/\r?\n/u).map(line => JSON.parse(line));
}

function changedRow(base, path, value) {
  return { ...changeFrame(base, path, value), sequence: base.sequence + 1, native_turn: base.native_turn + 1 };
}

test('recorded state-label changes use concise ordered prose in packets and the writer request', async t => {
  const rows = await sourceRows();
  assert.deepEqual(rows.map(row => row.sequence), [26, 29, 278, 279, 322, 323, 588, 589, 632, 633, 634, 635, 647, 648]);
  const { dir, packets } = await packetRun(t, fixture('visit-32-state-changes.jsonl'), d10);
  const expected = [
    'Перемена в теле героя: нагрузки стало меньше.',
    'Перемена вокруг героя: ветра стало больше.',
    'Перемена вокруг героя: ветра стало меньше.',
    'Перемена в теле героя: нагрузки стало больше.'
  ];
  const changes = stateChanges(packets);
  assert.equal(changes.length, 4);
  assert.deepEqual(changes, expected);
  assert.ok(changes.every(text => !/нет|умеренная|тихий ветер|лёгкий ветер/iu.test(text)));
  assert.ok(changes.every(text => !/\d/u.test(text)));

  const writer = run(['writer', '--dir', dir, '--moment', 'd10']);
  assert.equal(writer.status, 0, writer.stderr || writer.stdout);
  const request = await readFile(join(dir, 'd10.req.txt'), 'utf8');
  const offsets = expected.map(text => request.indexOf(text));
  assert.ok(offsets.every(offset => offset >= 0));
  assert.deepEqual(offsets, [...offsets].sort((left, right) => left - right));
});

test('a weather-name change is stated as a change in the surrounding weather', async t => {
  const base = (await sourceRows()).find(row => row.sequence === 26);
  const { packets } = await packetRun(t, [base, changedRow(base, 'weather.name', 'Облачно')], {
    id: 'weather-name', title: 'weather-name', from_turn: base.native_turn, to_turn: base.native_turn + 1
  });
  assert.deepEqual(stateChanges(packets), ['Перемена вокруг героя: погода — теперь облачно.']);
});

test('a missing ordered body label uses its place and genitive noun', async t => {
  const base = (await sourceRows()).find(row => row.sequence === 26);
  for (const value of [null, '']) {
    const { packets } = await packetRun(t, [base, changedRow(base, 'player_state.activity_label', value)], {
      id: `activity-label-${value === null ? 'null' : 'empty'}`,
      title: 'activity-label',
      from_turn: base.native_turn,
      to_turn: base.native_turn + 1
    });
    assert.deepEqual(stateChanges(packets), ['Перемена в теле героя: нагрузки больше нет.']);
  }
});

test('body labels without native selectors use their ordinal scales', async t => {
  const base = (await sourceRows()).find(row => row.sequence === 26);
  for (const [field, value, expected] of [
    ['weariness_label', 'Лёгкое', 'Перемена в теле героя: усталости стало больше.'],
    ['warmth_label', 'Прохладно', 'Перемена в теле героя: тепла тела стало меньше.']
  ]) {
    const { packets } = await packetRun(t, [base, changedRow(base, `player_state.${field}`, value)], {
      id: field,
      title: field,
      from_turn: base.native_turn,
      to_turn: base.native_turn + 1
    });
    assert.deepEqual(stateChanges(packets), [expected]);
  }
});
