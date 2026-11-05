import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, readJson, run, setup, writeJson, writeRecording } from './fixtures/helper.mjs';

const side = 'к северо-востоку от героя';
const headings = { n: 'север', w: 'запад', s: 'юг', e: 'восток' };
const cardinalHeadings = Object.values(headings);
const positionKey = position => JSON.stringify(position);
const words = text => String(text).toLocaleLowerCase('ru').match(/[\p{L}\p{N}]+/gu) ?? [];

function hasWords(text, expected) {
  const actual = words(text);
  const wanted = words(expected);
  return actual.some((_, index) => wanted.every((word, offset) => actual[index + offset] === word));
}

function packetTexts(moment) {
  return moment.parts.flatMap(part => Object.values(part.packet ?? {})
    .flatMap(value => Array.isArray(value) ? value : [])
    .filter(value => typeof value === 'string'));
}

function eventTexts(moment) {
  return moment.parts.flatMap(part => part.packet?.События ?? []);
}

function visiblePositions(frame) {
  return new Set((frame.visible_terrain ?? []).flatMap(group => group.positions.map(positionKey)));
}

function removeVisiblePosition(groups, target) {
  return groups.flatMap(group => {
    const positions = group.positions.filter(position => positionKey(position) !== positionKey(target));
    return positions.length ? [{ ...group, count: positions.length, positions }] : [];
  });
}

async function sourceWithTrack(type, name) {
  const row = await readJson(fixture('inside-before-step.json'));
  assert.equal(row.kind, 'full');
  assert.equal(typeof row.frame.player_state.male, 'boolean');
  const source = row.frame.objects.find(object => object.kind === 'field' && object.type === 'fd_dust');
  assert.ok(source);
  assert.equal(source.direction, 'северо-восток');
  assert.ok(visiblePositions(row.frame).has(positionKey(source.position)));
  assert.deepEqual(row.frame.place.overmap_position, [12, 114, 0]);
  assert.deepEqual(row.frame.position, [299, 2749, 0]);

  const track = { ...source, type, name, intensity: 1 };
  row.frame.objects = [
    ...row.frame.objects.filter(object => !(object.kind === 'field' && positionKey(object.position) === positionKey(source.position))),
    track
  ];
  return { row, track };
}

function nextFull(row, mutate) {
  const next = structuredClone(row);
  next.sequence += 1;
  next.native_turn += 1;
  next.input_number = (next.input_number ?? 0) + 1;
  mutate(next.frame);
  return next;
}

function moment(id, row) {
  return { id, title: id, from_turn: row.native_turn, to_turn: row.native_turn };
}

async function packetRun(t, rows) {
  const dir = await setup(t, 'tracks-988-packets-');
  const recording = join(dir, 'perception.jsonl');
  const moments = join(dir, 'moments.json');
  const output = join(dir, 'out');
  await writeRecording(recording, rows);
  await writeJson(moments, rows.map((row, index) => moment(`M${index + 1}`, row)));
  const result = run(['packets', '--dir', output, '--recording', recording, '--moments', moments]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return await readJson(join(output, 'packets.json'));
}

function trackLine(momentValue, name) {
  const lines = momentValue.parts.flatMap(part => part.packet?.['Вещи вокруг'] ?? []);
  assert.ok(lines.some(line => hasWords(line, name)), `в пакете нет имени поля «${name}»`);
  return lines.find(line => hasWords(line, name));
}

function assertTrackNameAndSide(line, name) {
  assert.ok(hasWords(line, name), `в предложении нет имени поля «${name}»`);
  assert.ok(hasWords(line, side), 'в предложении нет стороны клетки относительно героя');
}

function assertNoTrackLeakage(line) {
  assert.doesNotMatch(line, /\d/u, 'в предложении о следе не должно быть цифр');
  assert.doesNotMatch(line, /fd_/iu, 'в предложении о следе не должно быть служебного ID');
  const text = words(line).join(' ');
  for (const coordinate of ['триста три', 'две тысячи семьсот сорок пять', 'ноль']) {
    assert.ok(!hasWords(text, coordinate), `в предложении о следе появились координаты: ${coordinate}`);
  }
  assert.ok(!words(line).some(word => ['возраст', 'лет', 'час', 'часа', 'часов', 'минута', 'минуты', 'минут', 'день', 'дня', 'дней', 'ход', 'хода', 'ходов', 'назад'].includes(word)), 'в предложении о следе не должно быть возраста');
}

function assertNoPacketFieldIds(momentValue) {
  assert.doesNotMatch(packetTexts(momentValue).join('\n'), /fd_/iu, 'в полном тексте пакета не должно быть fd_ ID');
}

async function assertDirectedField(t, type, name, heading) {
  const { row } = await sourceWithTrack(type, name);
  const result = await packetRun(t, [row]);
  const line = trackLine(result[0], name);
  assertTrackNameAndSide(line, name);
  assertNoTrackLeakage(line);
  assertNoPacketFieldIds(result[0]);
  assert.ok(hasWords(line, `на ${heading}`), `у ${type} нет направления следа «на ${heading}»`);
}

for (const [family, name] of [
  ['human', 'след человека'],
  ['bird', 'след птицы'],
  ['animal', 'след животного']
]) {
  for (const [suffix, heading] of Object.entries(headings)) {
    const type = `fd_${family}_footprint_${suffix}`;
    test(`${type} передаёт имя, сторону клетки и направление отдельно`, async t => {
      await assertDirectedField(t, type, name, heading);
    });
  }
}

for (const [suffix, heading] of Object.entries(headings)) {
  const type = `fd_blood_footprint_${suffix}`;
  test(`${type} сохраняет направление кровавого следа`, async t => {
    await assertDirectedField(t, type, 'bloody footprint', heading);
  });
}

test('fd_test_mark_n получает направление по общему правилу суффикса', async t => {
  await assertDirectedField(t, 'fd_test_mark_n', 'отметина', 'север');
});

test('fd_blood без суффикса передаёт имя и сторону клетки без выдуманного направления', async t => {
  const { row } = await sourceWithTrack('fd_blood', 'лужа крови');
  const result = await packetRun(t, [row]);
  const line = trackLine(result[0], 'лужа крови');
  assertTrackNameAndSide(line, 'лужа крови');
  assertNoTrackLeakage(line);
  assertNoPacketFieldIds(result[0]);
  assert.ok(cardinalHeadings.every(heading => !hasWords(line, `на ${heading}`)), 'для fd_blood не должно появляться направление следа');
});

test('автор соседнего существа не приписывается видимому следу', async t => {
  const { row } = await sourceWithTrack('fd_human_footprint_n', 'след человека');
  const nearbyIndex = row.frame.creatures.findIndex(creature => creature.name === 'Жирко');
  assert.notEqual(nearbyIndex, -1, 'в full capture должен быть отдельный видимый сосед для проверки авторства');
  const target = row.frame.objects.find(object => object.kind === 'field' && object.type === 'fd_human_footprint_n');
  assert.ok(target, 'след должен присутствовать в тестовом кадре');
  const nearbyPosition = [303, 2746, 0];
  const nearby = {
    ...row.frame.creatures[nearbyIndex],
    position: nearbyPosition,
    direction: 'северо-восток',
    distance: 4
  };
  const adjacentDistance = Math.max(
    Math.abs(nearby.position[0] - target.position[0]),
    Math.abs(nearby.position[1] - target.position[1]),
    Math.abs(nearby.position[2] - target.position[2])
  );
  assert.equal(adjacentDistance, 1, 'видимый сосед должен стоять на клетке рядом со следом');
  assert.deepEqual(nearby.position, [303, 2746, 0]);
  assert.equal(nearby.direction, 'северо-восток');
  assert.equal(nearby.distance, 4);
  row.frame.creatures[nearbyIndex] = nearby;
  const result = await packetRun(t, [row]);
  const line = trackLine(result[0], 'след человека');
  const people = result[0].parts.flatMap(part => part.packet?.['Люди и звери'] ?? []);
  assert.ok(people.some(text => hasWords(text, nearby.name)), 'сосед должен оставаться отдельным фактом о существе');
  assert.doesNotMatch(line, new RegExp(nearby.name, 'u'), 'имя соседа не должно попадать в предложение о следе');
  assertNoTrackLeakage(line);
  assertNoPacketFieldIds(result[0]);
});

test('две невидимые клетки дают одинаковый пакет, если скрытый след остался или был удалён', async t => {
  const { row, track } = await sourceWithTrack('fd_human_footprint_n', 'след человека');
  const target = [...track.position];
  const hiddenWorld = present => nextFull(row, frame => {
    frame.objects = frame.objects.filter(object => !(object.kind === 'field' && positionKey(object.position) === positionKey(target)));
    frame.visible_terrain = removeVisiblePosition(frame.visible_terrain, target);
    // Capture records only CLEAR cells, so this fixture-only marker distinguishes map states omitted from the capture.
    frame.fixture_hidden_track_state = { position: target, present };
  });
  const remains = hiddenWorld(true);
  const removed = hiddenWorld(false);
  assert.equal(remains.frame.fixture_hidden_track_state.present, true);
  assert.equal(removed.frame.fixture_hidden_track_state.present, false);
  const observable = frame => {
    const { fixture_hidden_track_state: _hidden, ...capture } = frame;
    return capture;
  };
  assert.deepEqual(observable(remains.frame), observable(removed.frame), 'доступные capture-наблюдения должны совпадать');
  assert.ok(!visiblePositions(remains.frame).has(positionKey(target)));
  assert.ok(!remains.frame.objects.some(object => object.kind === 'field' && positionKey(object.position) === positionKey(target)));

  const outputs = [];
  for (const after of [remains, removed]) {
    const result = await packetRun(t, [row, after]);
    const initial = result.find(value => value.id === 'M1');
    const unseen = result.find(value => value.id === 'M2');
    assert.ok(packetTexts(initial).some(text => hasWords(text, 'след человека')));
    assert.ok(packetTexts(unseen).every(text => !hasWords(text, 'след человека')), 'невидимый след не должен повторно появляться в пакете');
    assert.ok(eventTexts(unseen).every(text => !/больше не видно|не видно|исчез|пропал|отсутств|стёр|стер|смыл|дожд/iu.test(text)), 'невидимость не доказывает отсутствие или стирание следа');
    assertNoPacketFieldIds(initial);
    assertNoPacketFieldIds(unseen);
    outputs.push(result);
  }
  assert.deepEqual(outputs[0], outputs[1], 'пакет не должен различать скрытые состояния, отсутствующие в capture');
});

test('видимая пустая клетка сообщает об отсутствии следа без причины исчезновения', async t => {
  const { row, track } = await sourceWithTrack('fd_human_footprint_n', 'след человека');
  const target = [...track.position];
  const after = nextFull(row, frame => {
    frame.objects = frame.objects.filter(object => !(object.kind === 'field' && positionKey(object.position) === positionKey(target)));
  });
  assert.ok(visiblePositions(after.frame).has(positionKey(target)), 'клетка должна оставаться видимой');
  assert.ok(!after.frame.objects.some(object => object.kind === 'field' && positionKey(object.position) === positionKey(target)), 'видимая клетка должна быть пустой');

  const result = await packetRun(t, [row, after]);
  const initial = result.find(value => value.id === 'M1');
  const empty = result.find(value => value.id === 'M2');
  assert.ok(packetTexts(initial).some(text => hasWords(text, 'след человека')));
  const absence = packetTexts(empty).filter(text => hasWords(text, 'след человека'));
  assert.ok(absence.some(text => hasWords(text, 'больше не видно') || hasWords(text, 'не видно') || hasWords(text, 'отсутствует') || hasWords(text, 'нет')),
    'при видимой пустой клетке пакет должен сообщить об отсутствии следа');
  assert.ok(absence.every(text => !/смыл|стёр|стер|дожд/iu.test(text)), 'пакет не должен придумывать причину исчезновения');
  assertNoPacketFieldIds(initial);
  assertNoPacketFieldIds(empty);
});
