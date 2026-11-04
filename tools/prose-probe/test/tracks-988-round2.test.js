import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, readJson, run, setup, writeJson, writeRecording } from './fixtures/helper.mjs';

const gameData = fixture('');
const moment = (id, from_turn, to_turn = from_turn) => ({ id, title: id, from_turn, to_turn });
const directions = {
  north: 'К северу от героя',
  northeast: 'К северо-востоку от героя',
  east: 'К востоку от героя',
  southeast: 'К юго-востоку от героя',
  south: 'К югу от героя',
  southwest: 'К юго-западу от героя',
  west: 'К западу от героя',
  northwest: 'К северо-западу от героя',
  center: 'Рядом с героем'
};
const orientations = { n: 'север', w: 'запад', s: 'юг', e: 'восток' };

function inPlace(frame, position) {
  const [mapX, mapY, mapZ] = frame.place.overmap_position;
  return Math.floor(position[0] / 24) === mapX && Math.floor(position[1] / 24) === mapY && position[2] === mapZ;
}

function visibleName(object) {
  if (object.kind === 'ground_item') return object.item.name.split(/\s*>\s*/u, 1)[0];
  return object.name;
}

async function source(name) {
  return readJson(fixture(`${name}.json`));
}

async function packets(t, rows, moments, withNativeGameData = false) {
  const dir = await setup(t, 'tracks-988-round2-');
  const recording = join(dir, 'perception.jsonl');
  const momentsPath = join(dir, 'moments.json');
  const output = join(dir, 'out');
  await writeRecording(recording, rows);
  await writeJson(momentsPath, moments);
  const args = ['packets', '--dir', output, '--recording', recording, '--moments', momentsPath];
  if (withNativeGameData) args.push('--game-data', gameData);
  const result = run(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return readJson(join(output, 'packets.json'));
}

async function packetsFromRaw(t, rawLines, moments, withNativeGameData = false) {
  const dir = await setup(t, 'tracks-988-english-');
  const recording = join(dir, 'perception.jsonl');
  const momentsPath = join(dir, 'moments.json');
  const output = join(dir, 'out');
  await writeFile(recording, `${rawLines.join('\n')}\n`);
  await writeJson(momentsPath, moments);
  const args = ['packets', '--dir', output, '--recording', recording, '--moments', momentsPath];
  if (withNativeGameData) args.push('--game-data', gameData);
  const result = run(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return readJson(join(output, 'packets.json'));
}

async function englishRows() {
  const content = await readFile(fixture('tracks-988-english.jsonl'), 'utf8');
  const lines = content.trimEnd().split(/\r?\n/u);
  return lines.map(line => ({ line, row: JSON.parse(line) }));
}

test('шестнадцать направленных полей описывают ход следа отдельно от клетки', async t => {
  const row = await source('inside-before-step');
  assert.deepEqual(row.frame.position, [299, 2749, 0]);
  const position = [300, 2748, 0];
  const side = 'К северо-востоку от героя';
  const fields = [];
  for (const [family, name] of [
    ['human', 'след человека'],
    ['bird', 'след птицы'],
    ['animal', 'след животного'],
    ['blood', 'кровавый след']
  ]) {
    for (const suffix of Object.keys(orientations)) {
      fields.push({ kind: 'field', position, direction: 'северо-восток', type: `fd_${family}_footprint_${suffix}`, name, intensity: 1 });
    }
  }
  const unoriented = { kind: 'field', position, direction: 'северо-восток', type: 'fd_blood', name: 'лужа крови', intensity: 1 };
  row.frame.objects = [...row.frame.objects.filter(object => object.kind !== 'field'), ...fields, unoriented];
  const result = await packets(t, [row], [moment('M1', row.native_turn)]);
  const lines = result[0].parts.flatMap(part => part.packet['Вещи вокруг'] ?? []);
  for (const field of fields) {
    const heading = orientations[field.type.at(-1)];
    assert.ok(lines.some(line => line.includes(`${side} — ${field.name}, ведёт на ${heading}.`)), `${field.type} должен отдельно передавать сторону клетки и направление следа`);
  }
  const plainField = lines.find(line => line.startsWith(`${side} — ${unoriented.name}.`));
  assert.ok(plainField);
  assert.doesNotMatch(plainField, /ведёт на/u);
});

test('английские направления вещей и полей переводятся по сторонам координат в настоящем capture03', async t => {
  const selected = await englishRows();
  assert.deepEqual(selected.map(({ row }) => [row.sequence, row.kind]), [
    [32, 'full'],
    [53, 'full'],
    [75, 'full'],
    [77, 'full'],
    [78, 'delta']
  ]);
  const sideCoverage = new Set();
  for (const { line, row } of selected.slice(0, 3)) {
    const candidates = row.frame.objects.filter(object => object.kind !== 'vehicle_part' && inPlace(row.frame, object.position));
    assert.ok(candidates.length > 0, `sequence ${row.sequence} должен содержать вещи или поля в месте героя`);
    const result = await packetsFromRaw(t, [line], [moment(`M${row.sequence}`, row.native_turn)], true);
    const lines = result[0].parts.flatMap(part => part.packet['Вещи вокруг'] ?? []);
    for (const object of candidates) {
      const side = directions[object.direction];
      assert.ok(side, `неизвестная нативная сторона ${object.direction} в sequence ${row.sequence}`);
      sideCoverage.add(object.direction);
      const name = visibleName(object);
      assert.ok(lines.some(text => text.startsWith(`${side} — `) && text.includes(name)), `sequence ${row.sequence}: ${object.kind} «${name}» должен находиться ${side.toLocaleLowerCase('ru')}`);
    }
  }
  for (const direction of ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']) {
    assert.ok(sideCoverage.has(direction), `fixture должен проверять нативное направление ${direction}`);
  }
  const [full, delta] = selected.slice(3);
  assert.equal(full.row.kind, 'full');
  assert.equal(delta.row.kind, 'delta');
  assert.deepEqual(Object.keys(delta.row.changes).sort(), ['clock', 'player_state', 'sky_diagnostic', 'sounds']);
  const result = await packetsFromRaw(t, [full.line, delta.line], [moment('M-delta', full.row.native_turn, delta.row.native_turn)], true);
  const lines = result[0].parts.flatMap(part => part.packet['Вещи вокруг'] ?? []);
  const candidates = full.row.frame.objects.filter(object => object.kind !== 'vehicle_part' && inPlace(full.row.frame, object.position));
  assert.ok(candidates.length > 0);
  for (const object of candidates) {
    const side = directions[object.direction];
    assert.ok(lines.some(text => text.startsWith(`${side} — `) && text.includes(visibleName(object))), `full+delta: ${object.kind} должен сохранить свою записанную сторону`);
  }
});

test('существо в английской записи получает сторону по координатам, а движение сохраняет тот же путь', async t => {
  const [{ line, row }] = (await englishRows()).filter(({ row }) => row.sequence === 32);
  const before = row;
  const creature = before.frame.creatures.find(value => value.id === '2');
  assert.ok(creature);
  assert.equal(creature.direction, 'east');
  const first = await packetsFromRaw(t, [line], [moment('M1', before.native_turn)], true);
  const people = first[0].parts.flatMap(part => part.packet['Люди и звери'] ?? []);
  assert.ok(people.some(text => text.startsWith(`${directions[creature.direction]} — ${creature.name}.`)));

  const after = structuredClone(before);
  after.sequence += 1;
  after.native_turn += 1;
  const movedPosition = [after.frame.position[0], after.frame.position[1] + 3, after.frame.position[2]];
  after.frame.creatures = after.frame.creatures.map(value => value.id === creature.id ? { ...value, position: movedPosition } : value);
  const result = await packetsFromRaw(t, [line, JSON.stringify(after)], [moment('M1', before.native_turn), moment('M2', after.native_turn)], true);
  const events = result[1].parts.flatMap(part => part.packet.События ?? []);
  const movement = events.find(text => text.startsWith(`Положение существа «${creature.name}» изменилось.`));
  assert.ok(movement);
  assert.match(movement, /Теперь существо находилось к югу от героя/u);
});

test('перемещение вещи использует новое положение, даже если capture сохранил английское направление', async t => {
  const [{ line, row }] = (await englishRows()).filter(({ row }) => row.sequence === 32);
  const before = row;
  const item = before.frame.objects.find(object => object.kind === 'ground_item' && object.direction === 'east' && inPlace(before.frame, object.position));
  assert.ok(item);
  const after = structuredClone(before);
  after.sequence += 1;
  after.native_turn += 1;
  const position = [after.frame.position[0] + 2, after.frame.position[1] + 3, after.frame.position[2]];
  after.frame.objects = after.frame.objects.map(object => object.item?.uid === item.item.uid ? { ...object, position } : object);
  const result = await packetsFromRaw(t, [line, JSON.stringify(after)], [moment('M1', before.native_turn), moment('M2', after.native_turn)], true);
  const events = result[1].parts.flatMap(part => part.packet.События ?? []);
  const movement = events.find(text => text.startsWith(`Положение предмета «${item.item.name}» изменилось.`));
  assert.ok(movement);
  assert.match(movement, /Теперь предмет находился к юго-востоку от героя/u);
  assert.doesNotMatch(movement, /рядом с героем/u);
});

test('одинаковые поля и предметы получают разные формулировки общего счёта', async t => {
  const row = await source('inside-before-step');
  assert.deepEqual(row.frame.position, [299, 2749, 0]);
  const positions = [[303, 2745, 0], [303, 2746, 0]];
  row.frame.objects = [
    ...positions.map(position => ({ kind: 'field', position, direction: 'северо-восток', type: 'fd_human_footprint_n', name: 'след человека', intensity: 1 })),
    ...positions.map((position, index) => ({ kind: 'ground_item', position, direction: 'северо-восток', item: { uid: `round2-log-${index}`, type: 'log', name: 'бревно' } }))
  ];
  assert.equal(row.frame.objects.length, 4);
  assert.equal(row.frame.objects.filter(object => object.kind === 'field').length, 2);
  assert.equal(row.frame.objects.filter(object => object.kind === 'ground_item').length, 2);
  const result = await packets(t, [row], [moment('M1', row.native_turn)]);
  const packet = result[0].parts[0].packet;
  const lines = packet['Вещи вокруг'];
  const fieldLine = lines.find(text => text.includes('след человека'));
  const itemLine = lines.find(text => text.includes('бревно'));
  assert.ok(fieldLine);
  assert.ok(itemLine);
  assert.ok(fieldLine.endsWith('Таких было два.'));
  assert.ok(itemLine.endsWith('Таких предметов было два.'));
  assert.ok(Object.values(packet).every(section => Array.isArray(section) && section.every(text => typeof text === 'string')));
  assert.doesNotMatch(JSON.stringify(packet), /fd_human_footprint_n|round2-log/u);
});
