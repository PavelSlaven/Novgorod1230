import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { changeFrame, fixture, readJson, run, setup, writeJson, writeRecording } from './fixtures/helper.mjs';

const moment = (id, from_turn, to_turn = from_turn) => ({ id, title: id, from_turn, to_turn });
const texts = part => Object.values(part.packet ?? {}).flatMap(value => Array.isArray(value) ? value : []).filter(value => typeof value === 'string');
const events = part => part.packet.События ?? [];
const samePosition = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

async function source(name) {
  return readJson(fixture(`${name}.json`));
}

function at(row, sequence, native_turn) {
  return { ...row, sequence, native_turn };
}

async function packets(t, rows, moments) {
  const dir = await setup(t, 'packet-regressions-');
  const recording = join(dir, 'recording.jsonl');
  const momentsPath = join(dir, 'moments.json');
  const output = join(dir, 'out');
  await writeRecording(recording, rows);
  await writeJson(momentsPath, moments);
  const result = run(['packets', '--dir', output, '--recording', recording, '--moments', momentsPath]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { output, values: await readJson(join(output, 'packets.json')) };
}

function inScene(frame, position) {
  const [mapX, mapY, mapZ] = frame.place.overmap_position;
  return Math.floor(position[0] / 24) === mapX && Math.floor(position[1] / 24) === mapY && position[2] === mapZ;
}

function visibleCells(frame) {
  return new Set((frame.visible_terrain ?? []).flatMap(group => group.positions.map(position => JSON.stringify(position))));
}

function vehicleRow(row, positions) {
  const parts = row.frame.objects.filter(object => object.kind === 'vehicle_part');
  assert.ok(parts.length >= positions.length);
  const vehicleParts = positions.map((position, index) => ({ ...parts[index], position, direction: 'восток' }));
  const objects = [...row.frame.objects.filter(object => object.kind !== 'vehicle_part'), ...vehicleParts];
  return changeFrame(row, 'objects', objects);
}

function retypedTerrain(row, position, type, name) {
  let previousName;
  let found = false;
  const visibleTerrain = [];
  for (const group of row.frame.visible_terrain) {
    const hasTile = group.positions.some(candidate => samePosition(candidate, position));
    if (!hasTile) {
      visibleTerrain.push(group);
      continue;
    }
    found = true;
    previousName = group.name;
    const remaining = group.positions.filter(candidate => !samePosition(candidate, position));
    if (remaining.length) visibleTerrain.push({ ...group, positions: remaining });
  }
  assert.ok(found);
  visibleTerrain.push({ type, name, count: 1, positions: [position] });
  return { row: changeFrame(row, 'visible_terrain', visibleTerrain), previousName };
}

test('a recorded window remains a window even when its state resembles a closed door', async t => {
  const base = await source('door-before');
  const recorded = await readJson(fixture('newsmallwindowvehicle.json'));
  const window = recorded.window;
  assert.equal(window.kind, 'window');
  assert.equal(window.state, 'closed');
  const position = [...base.frame.position];
  const object = { ...window, position, direction: 'восток' };
  const objects = [...base.frame.objects.filter(value => value.kind !== 'door'), object];
  const closed = changeFrame(base, 'objects', objects);
  const open = changeFrame(closed, 'objects', objects.map(value => value.kind === 'window' ? { ...value, state: 'open' } : value));
  assert.ok(inScene(closed.frame, object.position));
  const ctx = await packets(t, [at(closed, 56, 5227219), at(open, 57, 5227220)], [moment('M1', 5227219), moment('M2', 5227220)]);
  const packetText = ctx.values.flatMap(value => value.parts.flatMap(texts));
  assert.ok(packetText.some(text => text.includes(window.name)));
  assert.ok(packetText.some(text => text.includes('Окно было закрыто.')));
  assert.ok(packetText.some(text => text.includes('Окно было открыто.')));
  assert.ok(packetText.every(text => !/Дверь была закрыта|Дверь была открыта/u.test(text)));
});

test('vehicle parts with one name form one nearest-cell fact without a count', async t => {
  const base = await source('door-before');
  const recorded = await readJson(fixture('newsmallwindowvehicle.json'));
  const [heroX, heroY, z] = base.frame.position;
  const minX = Math.min(...recorded.vehicle_parts.map(part => part.position[0]));
  const minY = Math.min(...recorded.vehicle_parts.map(part => part.position[1]));
  const dx = heroX + 1 - minX;
  const dy = heroY - minY;
  const vehicle = recorded.vehicle_parts.map((part, index) => ({
    ...part,
    position: [part.position[0] + dx, part.position[1] + dy, z]
  }));
  const objects = [...base.frame.objects.filter(object => object.kind !== 'vehicle_part'), ...vehicle];
  const row = changeFrame(base, 'objects', objects);
  const ctx = await packets(t, [row], [moment('M1', row.native_turn)]);
  const facts = ctx.values[0].parts[0].packet['Вещи вокруг'] ?? [];
  const vehicleFacts = facts.filter(text => text.includes('спортивный седан'));
  assert.equal(vehicleFacts.length, 1);
  assert.ok(vehicleFacts[0].includes('спортивный седан'));
  assert.match(vehicleFacts[0], /К юго-востоку от героя/u);
  assert.doesNotMatch(vehicleFacts[0], /Таких предметов было/u);
  assert.doesNotMatch(vehicleFacts[0], /\d/u);
});

test('shifting the cells of a named vehicle creates no movement event', async t => {
  const base = await source('door-before');
  const name = base.frame.objects.find(object => object.kind === 'vehicle_part').vehicle_name;
  const [heroX, heroY, z] = base.frame.position;
  const first = vehicleRow(base, [[heroX + 1, heroY, z], [heroX + 2, heroY, z], [heroX + 3, heroY, z]]);
  const second = vehicleRow(first, [[heroX + 2, heroY, z], [heroX + 3, heroY, z], [heroX + 4, heroY, z]]);
  const ctx = await packets(t, [at(first, 56, 5227219), at(second, 57, 5227220)], [moment('M1', 5227219), moment('M2', 5227220)]);
  assert.ok(events(ctx.values[1].parts[0]).every(text => !text.includes(name)));
  assert.ok(texts(ctx.values[1].parts[0]).every(text => !text.includes(name)));
});

test('a vehicle appearing in a later frame is added to facts, not events', async t => {
  const base = await source('door-before');
  const [heroX, heroY, z] = base.frame.position;
  const after = vehicleRow(base, [[heroX + 1, heroY, z], [heroX + 2, heroY, z], [heroX + 3, heroY, z]]);
  const ctx = await packets(t, [at(base, 56, 5227219), at(after, 57, 5227220)], [moment('M1', 5227219), moment('M2', 5227220)]);
  const delta = ctx.values[1].parts[0].packet;
  const name = base.frame.objects.find(object => object.kind === 'vehicle_part').vehicle_name;
  assert.ok((delta['Вещи вокруг'] ?? []).some(text => text.includes(name)));
  assert.ok(events(ctx.values[1].parts[0]).every(text => !text.includes(name)));
});

test('a vehicle leaving view by name is reported without requiring its old cell to stay visible', async t => {
  const base = await source('inside-before-step');
  const after = await source('inside-after-step');
  const recorded = await readJson(fixture('newsmallwindowvehicle.json'));
  const log = base.frame.objects.find(object => object.kind === 'ground_item' && object.item.uid === '1865');
  assert.ok(log);
  const part = { ...recorded.vehicle_parts[0], position: [...log.position] };
  const before = changeFrame(base, 'objects', [...base.frame.objects, part]);
  const position = JSON.stringify(log.position);
  assert.ok(visibleCells(before.frame).has(position));
  assert.ok(!visibleCells(after.frame).has(position));
  assert.ok((after.frame.objects ?? []).every(object => object.kind !== 'vehicle_part' || !inScene(after.frame, object.position)));
  const ctx = await packets(t, [at(before, 62, 5227222), at(after, 63, 5227223)], [moment('M1', 5227222), moment('M2', 5227223)]);
  const lines = events(ctx.values[1].parts[0]);
  assert.ok(lines.some(text => text.includes('спортивный седан') && /больше не вид/u.test(text)));
});

test('an anonymous creature keeps its identity within the scene and crosses the scene edge as ordered disappearance and appearance events', async t => {
  const base = await source('inside-before-step');
  const creature = base.frame.creatures.find(value => value.type === 'mon_zombie' && value.id === undefined);
  assert.ok(creature);
  const nearby = { ...creature, position: [300, 2749, 0], direction: 'восток' };
  const first = changeFrame(base, 'creatures', [nearby]);
  const sameSide = changeFrame(first, 'creatures', [{ ...nearby, position: [302, 2749, 0] }]);
  const outside = changeFrame(sameSide, 'creatures', [{ ...nearby, position: [312, 2749, 0] }]);
  const returned = changeFrame(outside, 'creatures', [{ ...nearby, position: [302, 2749, 0] }]);
  const rows = [first, sameSide, outside, returned].map((row, index) => at(row, 62 + index, 5227222 + index));
  const ctx = await packets(t, rows, [
    moment('M1', 5227222),
    moment('M2', 5227223),
    moment('M3', 5227224),
    moment('M4', 5227225)
  ]);
  assert.equal(events(ctx.values[1].parts[0]).length, 0);
  const leaving = events(ctx.values[2].parts[0]);
  assert.equal(leaving.length, 2);
  assert.match(leaving[0], /больше не видно в месте сцены/u);
  assert.match(leaving[1], /Появилось существо/u);
  const returning = events(ctx.values[3].parts[0]);
  assert.equal(returning.length, 2);
  assert.match(returning[0], /больше не видно вдали/u);
  assert.match(returning[1], /Появилось существо/u);
});

test('a creature removed from a later real frame is reported as a disappearance', async t => {
  const before = await source('inside-before-step');
  const after = await source('inside-after-step');
  const ctx = await packets(t, [at(before, 62, 5227222), at(after, 63, 5227223)], [moment('M1', 5227222), moment('M2', 5227223)]);
  const lines = events(ctx.values[1].parts[0]);
  assert.ok(lines.some(text => text.includes('зомби-ползун') && text.includes('больше не видно')));
});

test('a newly observed creature is an event rather than a field fact', async t => {
  const before = await source('inside-before-step');
  const after = await source('inside-after-step');
  const crawler = before.frame.creatures.find(creature => creature.type === 'mon_zombie_crawler');
  assert.ok(crawler);
  const appeared = changeFrame(after, 'creatures', [...after.frame.creatures, crawler]);
  const ctx = await packets(t, [at(after, 63, 5227223), at(appeared, 64, 5227224)], [moment('M1', 5227223), moment('M2', 5227224)]);
  const delta = ctx.values[1].parts[0].packet;
  assert.ok(events(ctx.values[1].parts[0]).some(text => text.includes('Появилось существо «зомби-ползун»')));
  assert.ok((delta['Люди и звери'] ?? []).every(text => !text.includes('зомби-ползун')));
});

test('an identified creature movement names its direction and scene side in both directions', async t => {
  const base = await source('inside-before-step');
  const npc = base.frame.creatures.find(creature => String(creature.id) === '2');
  assert.ok(npc);
  const moveNpc = position => base.frame.creatures.map(creature => String(creature.id) === '2' ? { ...creature, position } : creature);
  const first = base;
  const outside = changeFrame(first, 'creatures', moveNpc([312, npc.position[1], npc.position[2]]));
  const returned = changeFrame(outside, 'creatures', moveNpc(npc.position));
  const ctx = await packets(t, [at(first, 62, 5227222), at(outside, 63, 5227223), at(returned, 64, 5227224)], [
    moment('M1', 5227222),
    moment('M2', 5227223),
    moment('M3', 5227224)
  ]);
  const outward = events(ctx.values[1].parts[0]);
  assert.equal(outward.length, 1);
  assert.match(outward[0], /Положение существа «Жирко» изменилось/u);
  assert.match(outward[0], /к востоку от героя/u);
  assert.match(outward[0], /вдали/u);
  const inward = events(ctx.values[2].parts[0]);
  assert.equal(inward.length, 1);
  assert.match(inward[0], /Положение существа «Жирко» изменилось/u);
  assert.match(inward[0], /в месте сцены/u);
});

test('event coalescing preserves equal lines separated by another event', async t => {
  const base = await source('inside-before-step');
  const recordedZombie = base.frame.creatures.find(creature => creature.type === 'mon_zombie' && creature.id === undefined);
  assert.ok(recordedZombie);
  const zombie = { ...recordedZombie, position: [300, 2749, 0], direction: 'восток' };
  const dog = { ...zombie, type: 'mon_dog', name: 'пёс' };
  const first = changeFrame(base, 'creatures', [zombie]);
  const second = changeFrame(first, 'creatures', []);
  const third = changeFrame(second, 'creatures', [dog]);
  const fourth = changeFrame(third, 'creatures', [dog, zombie]);
  const fifth = changeFrame(fourth, 'creatures', [dog]);
  const rows = [first, second, third, fourth, fifth].map((row, index) => at(row, 62 + index, 5227222 + index));
  const ctx = await packets(t, rows, [moment('M1', 5227222, 5227226)]);
  const lines = events(ctx.values[0].parts[0]);
  const repeated = lines.filter(text => /зомби.*больше не видно в месте сцены/u.test(text));
  assert.equal(repeated.length, 2);
  assert.equal(repeated[0], repeated[1]);
  assert.ok(lines.findIndex(text => text === repeated[0]) < lines.findIndex(text => text.includes('Появилось существо «пёс»')));
  assert.ok(lines.findIndex(text => text.includes('Появилось существо «зомби»')) < lines.lastIndexOf(repeated[1]));
  assert.ok(repeated.every(text => !/Таких существ было/u.test(text)));
});

test('adjacent identical disappearance events merge with a count in words', async t => {
  const base = await source('inside-before-step');
  const recordedZombie = base.frame.creatures.find(creature => creature.type === 'mon_zombie' && creature.id === undefined);
  assert.ok(recordedZombie);
  const zombie = { ...recordedZombie, position: [300, 2749, 0], direction: 'восток' };
  const first = changeFrame(base, 'creatures', [zombie, { ...zombie }]);
  const second = changeFrame(first, 'creatures', []);
  const ctx = await packets(t, [at(first, 62, 5227222), at(second, 63, 5227223)], [moment('M1', 5227222, 5227223)]);
  const lines = events(ctx.values[0].parts[0]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /зомби/u);
  assert.match(lines[0], /Это отмечалось два раза/u);
});

test('identical sounds outside object fields are grouped with a count', async t => {
  const base = await source('door-before');
  assert.ok(base.frame.sounds.length);
  const duplicate = structuredClone(base.frame.sounds[0]);
  const row = changeFrame(base, 'sounds', [...base.frame.sounds, duplicate]);
  const ctx = await packets(t, [row], [moment('M1', row.native_turn)]);
  const soundLines = [...(ctx.values[0].parts[0].packet['Звуки'] ?? []), ...(ctx.values[0].parts[0].packet['Речь'] ?? [])];
  assert.ok(soundLines.some(text => text.includes(`«${duplicate.description}»`) && /Это было слышно два раза/u.test(text)));
});

test('identical carried possessions are grouped with a count', async t => {
  const base = await source('door-before');
  const carried = structuredClone(base.frame.inventory[0]);
  carried.uid = 'synthetic-carried-copy';
  const row = changeFrame(base, 'inventory', [...base.frame.inventory, carried]);
  const ctx = await packets(t, [row], [moment('M1', row.native_turn)]);
  const carriedLines = ctx.values[0].parts[0].packet['При себе'] ?? [];
  assert.ok(carriedLines.some(text => /онучи/u.test(text) && /Таких предметов было два/u.test(text)));
});

test('identical anonymous creatures in the field are grouped with a count', async t => {
  const base = await source('inside-before-step');
  const recordedZombie = base.frame.creatures.find(creature => creature.type === 'mon_zombie' && creature.id === undefined);
  assert.ok(recordedZombie);
  const zombie = { ...recordedZombie, position: [300, 2749, 0], direction: 'восток' };
  const row = changeFrame(base, 'creatures', [zombie, { ...zombie }]);
  const ctx = await packets(t, [row], [moment('M1', row.native_turn)]);
  const creatureFacts = ctx.values[0].parts[0].packet['Люди и звери'] ?? [];
  assert.ok(creatureFacts.some(text => /зомби/u.test(text) && /Таких существ было два/u.test(text)));
});

test('a terrain type change names its direction and both terrain names', async t => {
  const base = await source('inside-before-step');
  const position = [302, base.frame.position[1], base.frame.position[2]];
  assert.ok(base.frame.visible_terrain.some(group => group.positions.some(candidate => samePosition(candidate, position))));
  assert.equal(inScene(base.frame, position), true);
  const changed = retypedTerrain(base, position, 't_dirt', 'земля');
  const first = base;
  const second = changed.row;
  const ctx = await packets(t, [at(first, 62, 5227222), at(second, 63, 5227223)], [moment('M1', 5227222), moment('M2', 5227223)]);
  const lines = events(ctx.values[1].parts[0]);
  assert.ok(lines.some(text => text.includes(changed.previousName) && text.includes('земля') && /к востоку от героя/iu.test(text)));
});

async function stateOnset(t, path, emptyValue, observedValue, section, expectedLine) {
  const base = await source('door-before');
  const currentValue = path.split('.').reduce((value, key) => value[key], base.frame);
  const first = Object.is(currentValue, emptyValue) ? base : changeFrame(base, path, emptyValue);
  const second = changeFrame(first, path, observedValue);
  const ctx = await packets(t, [at(first, 56, 5227219), at(second, 57, 5227220)], [moment('M1', 5227219), moment('M2', 5227220)]);
  const initial = ctx.values[0].parts[0].packet;
  const delta = ctx.values[1].parts[0].packet;
  if (section) assert.ok(!(initial[section] ?? []).some(text => expectedLine.test(text)));
  assert.ok((delta.События ?? []).some(text => expectedLine.test(text)));
  assert.ok(!(delta[section] ?? []).some(text => expectedLine.test(text)));
}

test('a later time-of-day fact is an event with a gender-neutral sentence', async t => {
  await stateOnset(t, 'clock.time_of_day', null, 'Ночь', 'Пора суток', /^Пора суток описывалась словами «ночь»\.$/u);
});

test('a later calm-wind fact is an event with a gender-neutral sentence', async t => {
  await stateOnset(t, 'weather.wind_label', null, 'Штиль', 'Погода', /^Ветер описывался словом «штиль»\.$/u);
});

test('a later light fact is an event rather than a new state field', async t => {
  await stateOnset(t, 'light.label', null, 'темно', 'Свет', /темно/iu);
});

test('a later body-state fact is an event rather than a new state field', async t => {
  await stateOnset(t, 'player_state.pain_label', '', 'Сильно болит', 'Самочувствие', /боль|болит/iu);
});

test('time, weather, light and body-state events retain frame order while initial values stay in fields', async t => {
  const first = await source('door-before');
  const second = changeFrame(first, 'clock.time_of_day', 'Ночь');
  const third = changeFrame(second, 'weather.wind_label', 'Штиль');
  const fourth = changeFrame(third, 'light.label', 'темно');
  const fifth = changeFrame(fourth, 'player_state.pain_label', 'Сильно болит');
  const rows = [first, second, third, fourth, fifth].map((row, index) => at(row, 56 + index, 5227219 + index));
  const ctx = await packets(t, rows, [moment('M1', 5227219, 5227223)]);
  const packet = ctx.values[0].parts[0].packet;
  assert.ok((packet['Пора суток'] ?? []).length);
  assert.ok((packet.Погода ?? []).some(text => text.includes('тихий ветер')));
  assert.ok((packet.Свет ?? []).some(text => text.includes('светло')));
  assert.ok((packet.Самочувствие ?? []).some(text => text.includes('Нагрузка героя')));
  const ordered = events(ctx.values[0].parts[0]);
  const timeIndex = ordered.findIndex(text => text === 'Пора суток описывалась словами «ночь».');
  const windIndex = ordered.findIndex(text => text === 'Ветер описывался словом «штиль».');
  const lightIndex = ordered.findIndex(text => /темно/iu.test(text));
  const bodyIndex = ordered.findIndex(text => /боль|болит/iu.test(text));
  assert.ok(timeIndex >= 0 && windIndex > timeIndex && lightIndex > windIndex && bodyIndex > lightIndex);
  assert.ok((packet['Пора суток'] ?? []).every(text => !/ночь/iu.test(text)));
  assert.ok((packet.Погода ?? []).every(text => !/штиль/iu.test(text)));
  assert.ok((packet.Свет ?? []).every(text => !/темно/iu.test(text)));
  assert.ok((packet.Самочувствие ?? []).every(text => !/боль|болит/iu.test(text)));
});
