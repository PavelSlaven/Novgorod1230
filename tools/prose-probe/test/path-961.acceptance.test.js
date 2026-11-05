import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, readJson, run, setup, writeJson, writeRecording } from './fixtures/helper.mjs';

const inputs961 = new Map();
const paths961 = ctx => ctx.events.filter(text => text.startsWith('Гость прошёл'));
const waits961 = ctx => ctx.events.filter(text => text.startsWith('Гость ждал на месте'));

async function capture961(t, input) {
  const dir = await setup(t, 'path-961-');
  const recording = join(dir, 'recording.jsonl');
  const moments = join(dir, 'moments.json');
  const actions = join(dir, 'actions.jsonl');
  const descriptions = join(dir, 'descriptions.jsonl');
  const gameData = join(dir, 'game-data');
  const out = join(dir, 'out');
  await writeRecording(recording, input.rows);
  await writeRecording(actions, input.actions ?? []);
  await writeRecording(descriptions, input.descriptions ?? []);
  await writeJson(join(gameData, 'items.json'), input.gameData ?? []);
  await writeJson(moments, input.moments ?? [{ id: 'M1', title: 'Наблюдение', from_turn: Math.min(...input.rows.map(row => row.native_turn)), to_turn: Math.max(...input.rows.map(row => row.native_turn)) }]);
  const result = run(['packets', '--dir', out, '--recording', recording, '--moments', moments, '--actions', actions, '--descriptions', descriptions, '--game-data', gameData]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const values = await readJson(join(out, 'packets.json'));
  const parts = values.flatMap(moment => moment.parts);
  return { values, parts, events: parts.flatMap(part => part.packet.События ?? []), result };
}

const expectedV32961 = [
  'Гость прошёл на юго-восток, к месту у ориентира «бревно».',
  'По ходу пути: Появилось существо «Жирко». К востоку от героя — Жирко. Видимая одежда существа «Жирко» — онучи. Полосы ткани, которые мотают вокруг стопы и голени. Видимая одежда существа «Жирко» — рубаха. Простая длинная рубаха до колен. Видимая одежда существа «Жирко» — порты. Простые порты, собранные по ноге. Видимая одежда существа «Жирко» — поршни. Мягкая кожаная обувь из цельного куска. Видимая одежда существа «Жирко» — кожаный пояс. При вещи «кожаный пояс» было долото. Кожаный ремень с пряжкой. В руках у существа «Жирко» — плотницкий топор. Плотницкий топор на деревянном топорище. Текущее занятие существа «Жирко» — «нарезание досок». Орудие — «плотницкий топор». Материалом служит «бревно». Жирко стоит. Жирко смотрит в сторону героя.',
  'Гость ждал на месте десять минут.',
  'За время ожидания: Перемена в теле героя: нагрузки стало меньше.',
  'За время ожидания: Перемена вокруг героя: ветра стало больше.',
  'За время ожидания: Перемена вокруг героя: ветра стало меньше.',
  'Гость прошёл на северо-запад, от места у ориентира «бревно», возле ориентира «деревянная стена». Позади остались существа: «Жирко», «Прокша».',
  'По ходу пути: Перемена в теле героя: нагрузки стало больше.'
];

async function v32Input961() {
  const [recording, actions, descriptions, gameData] = await Promise.all([
    readFile(fixture('visit-32-path-961.jsonl'), 'utf8'),
    readFile(fixture('visit-32-path-961-actions.jsonl'), 'utf8'),
    readFile(fixture('visit-32-path-961-descriptions.jsonl'), 'utf8'),
    readJson(fixture('visit-32-path-961-items.json'))
  ]);
  const rows = text => text.trimEnd().split(/\r?\n/u).map(line => JSON.parse(line));
  return {
    rows: rows(recording),
    actions: rows(actions),
    descriptions: rows(descriptions),
    gameData,
    moments: [{ id: 'd10', title: 'Гость подошёл ко двору, понаблюдал за Жирко и ушёл', from_turn: 13071600, to_turn: 13072231 }]
  };
}

function registerV32961() {
  inputs961.set('P1', v32Input961);
  test('P1 — V32 d10 передаёт пути и ожидание по утверждённой таблице', async t => {
    const ctx = await capture961(t, await v32Input961());
    const paths = paths961(ctx);
    const waits = waits961(ctx);
    assert.equal(paths.length, 2, 'P1, §6: в d10 должны быть два отрезка пути.');
    assert.equal(waits.length, 1, 'В d10 должен быть один отрезок ожидания.');
    assert.equal(ctx.events.length, 8, 'В «Событиях» должны быть все восемь строк утверждённой таблицы.');
    assert.deepEqual(ctx.events.map(text => {
      if (text.startsWith('Гость прошёл')) return 'путь';
      if (text.startsWith('Гость ждал на месте')) return 'ожидание';
      if (text.startsWith('По ходу пути:')) return 'событие пути';
      if (text.startsWith('За время ожидания:')) return 'событие ожидания';
      return 'другое событие';
    }), ['путь', 'событие пути', 'ожидание', 'событие ожидания', 'событие ожидания', 'событие ожидания', 'путь', 'событие пути'], 'Пути, ожидание и события должны идти в утверждённом порядке.');
    assert.deepEqual([ctx.events[1], ctx.events[3], ctx.events[4], ctx.events[5], ctx.events[7]], [expectedV32961[1], expectedV32961[3], expectedV32961[4], expectedV32961[5], expectedV32961[7]], 'Пометки должны сопровождать точный исходный текст событий.');
    assert.deepEqual(paths.map(text => text.split(' Позади')[0]), [expectedV32961[0], expectedV32961[6].split(' Позади')[0]], 'P1, §3.4 и §3.7: оба пути передают отношение к опорам по утверждённой таблице.');
    assert.equal(paths[1].slice(paths[1].indexOf('Позади')), expectedV32961[6].slice(expectedV32961[6].indexOf('Позади')), 'В конце пути должны стоять существа позади в порядке исчезновения.');
    assert.equal(ctx.events.some(text => text.includes('Существо «Жирко» больше не видно')), false, 'Для Жирко не должно оставаться отдельного события исчезновения.');
    assert.equal(ctx.events.some(text => text.includes('Существо «Прокша» больше не видно')), false, 'Для Прокши не должно оставаться отдельного события исчезновения.');
    assert.deepEqual(ctx.events, expectedV32961, 'Полный поток событий должен совпадать с буквальным утверждённым списком.');
  });
}

function frame961(position, changes = {}) {
  const base = {
    position: [...position],
    player_state: { name: 'Гость', male: true, activity_label: 'Лёгкая' },
    place: { name: 'У пристани', roofed: false, outside: true, overmap_position: [0, 0, 0] },
    visible_terrain: [],
    visible_furniture: [],
    objects: [],
    creatures: [],
    weather: {},
    sounds: [],
    inventory: []
  };
  const copied = structuredClone(changes);
  return {
    ...base,
    ...copied,
    position: [...position],
    player_state: { ...base.player_state, ...copied.player_state },
    place: { ...base.place, ...copied.place }
  };
}

function input961(turns, actions = [], extra = {}) {
  return {
    rows: turns.map(([native_turn, position, changes], index) => ({
      kind: 'full',
      native_turn,
      sequence: index + 1,
      reason: index === 0 ? 'initial' : 'turn',
      frame: frame961(position, changes)
    })),
    actions: actions.map(({ turn, action }) => ({ native_turn: turn, inputs: [{ action }] })),
    ...structuredClone(extra)
  };
}

const door961 = state => [{ kind: 'door', type: 'door', name: 'дверь', state, position: [11, 10, 0], direction: 'восток', open_to: 't_null' }];
const activityChange961 = { player_state: { activity_label: 'Умеренная' } };
const activityEvent961 = 'Перемена в теле героя: нагрузки стало больше.';
const bodyEvent961 = ctx => ctx.events.find(text => text.includes('Перемена в теле героя'));
const disappearance961 = (ctx, name) => ctx.events.find(text => text.includes(`Существо «${name}» больше не видно`));

function p2Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [12, 10, 0]], [3, [13, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }, { turn: 3, action: 'RIGHT' }
  ]);
}

function p3Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [11, 10, 0]], [4, [12, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'wait' }, { turn: 4, action: 'RIGHT' }
  ]);
}

function p4Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [12, 10, 0], activityChange961]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function p5Input961() {
  const person = { kind: 'npc', type: 'human', id: 'npc-p-five', name: 'Незнакомец', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [13, 10, 0]], [1, [14, 10, 0]], [2, [15, 10, 0], { creatures: [person] }], [3, [15, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function p6Input961() {
  return input961([[0, [10, 10, 0], { objects: door961('closed') }], [1, [10, 10, 0], { objects: door961('closed') }], [2, [10, 10, 0], { objects: door961('closed') }], [3, [10, 10, 0], { objects: door961('open') }], [4, [10, 10, 0], { objects: door961('open') }], [7, [10, 10, 0], { objects: door961('open') }]], [
    { turn: 1, action: 'wait' }, { turn: 3, action: 'open' }, { turn: 4, action: 'wait' }
  ]);
}

function p7Input961() {
  return input961([[0, [13, 10, 0]], [1, [14, 10, 0]], [2, [14, 10, 0]], [3, [15, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'UP' }, { turn: 3, action: 'RIGHT' }
  ]);
}

function p8Input961() {
  return input961([[0, [13, 10, 0]], [1, [14, 10, 0]], [2, [14, 10, 0], activityChange961], [3, [15, 10, 0], activityChange961]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'UP' }, { turn: 3, action: 'RIGHT' }
  ]);
}

function p9Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [11, 10, 0]], [3, [12, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'позвать' }, { turn: 3, action: 'RIGHT' }
  ]);
}

function p10Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [11, 10, 0]], [3, [11, 10, 0]], [4, [11, 10, 0]], [5, [12, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'debug' }, { turn: 3, action: 'safemode' }, { turn: 4, action: 'player_data' }, { turn: 5, action: 'RIGHT' }
  ]);
}

function p11Input961() {
  const furniture = [{ name: 'бревно', type: 'f_log', positions: [[10, 11, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: furniture }], [1, [11, 10, 0], { visible_furniture: furniture }]], [
    { turn: 1, action: 'RIGHT' }
  ]);
}

function p12Input961() {
  const furniture = [{ name: 'бревно', type: 'f_log', positions: [[9, 10, 0], [12, 10, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: furniture }], [1, [11, 10, 0], { visible_furniture: furniture }]], [
    { turn: 1, action: 'RIGHT' }
  ]);
}

function p13aInput961() {
  return input961([[0, [10, 10, 0], { visible_furniture: [{ name: 'скамья', type: 'f_bench', positions: [[11, 10, 0]] }] }], [1, [11, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }
  ]);
}

function p13bInput961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0], { visible_furniture: [{ name: 'лавка', type: 'f_bench', positions: [[12, 10, 0]] }] }]], [
    { turn: 1, action: 'RIGHT' }
  ]);
}

function p13cInput961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]]], [{ turn: 1, action: 'RIGHT' }]);
}

function p14Input961() {
  const furniture = [{ name: 'бревно', type: 'f_log', positions: [[10, 11, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: furniture }], [1, [11, 10, 0], { visible_furniture: furniture }], [2, [10, 10, 0], { visible_furniture: furniture }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'LEFT' }
  ]);
}

function p15Input961() {
  const person = { kind: 'npc', type: 'human', name: 'Илья', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [13, 10, 0], { creatures: [person] }], [1, [14, 10, 0]], [2, [15, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function p16aInput961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0], activityChange961], [2, [11, 10, 0], activityChange961], [4, [11, 10, 0], activityChange961]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'wait' }
  ]);
}

function p16bInput961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [11, 10, 0], activityChange961], [4, [11, 10, 0], activityChange961]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'wait' }
  ]);
}

function p17Input961() {
  return input961([[0, [10, 10, 0], { objects: door961('closed') }], [1, [10, 10, 0], { objects: door961('open') }], [2, [10, 10, 0], { objects: door961('open'), ...activityChange961 }], [3, [10, 10, 0], { objects: door961('open'), ...activityChange961 }]], [
    { turn: 1, action: 'open' }
  ]);
}

function p18Input961() {
  return input961([[0, [10, 10, 0]], [1, [10, 10, 0], activityChange961], [2, [11, 10, 0], activityChange961]], [
    { turn: 2, action: 'RIGHT' }
  ]);
}

function p19Input961() {
  const person = { kind: 'npc', type: 'human', id: 'npc-p-nineteen', name: 'Мирон', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [10, 10, 0], { creatures: [person] }], [1, [10, 10, 0], { creatures: [person] }], [2, [10, 10, 0]], [4, [10, 10, 0]]], [
    { turn: 1, action: 'wait' }
  ]);
}

function s1Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [11, 10, 0]], [3, [12, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'open' }, { turn: 3, action: 'RIGHT' }
  ]);
}

function s2Input961() {
  return input961([[0, [10, 10, 0]], [1, [10, 10, 0]], [2, [11, 10, 0]], [4, [11, 10, 0]], [8, [11, 10, 0]]], [
    { turn: 1, action: 'wait' }, { turn: 4, action: 'wait' }
  ]);
}

function s3Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [12, 10, 0], { place: { name: 'У воротах' } }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function s4Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [11, 10, 0], { sounds: [{ description: 'Хруст ветки', category: 1 }, { description: 'Не подходи', category: 5 }] }], [3, [12, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 3, action: 'RIGHT' }
  ]);
}

function s5Input961() {
  return input961([[0, [10, 10, 0], { objects: door961('closed') }], [1, [11, 10, 0], { objects: door961('closed') }], [2, [11, 10, 0], { objects: door961('open') }], [3, [12, 10, 0], { objects: door961('open') }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 3, action: 'RIGHT' }
  ]);
}

function h1Input961() {
  return input961([[0, [10, 10, 0]], [1, [10, 10, 0]], [3, [10, 10, 0]], [4, [10, 10, 0]], [7, [10, 10, 0]]], [
    { turn: 1, action: 'wait' }, { turn: 3, action: 'open' }, { turn: 4, action: 'wait' }
  ]);
}

function h3Input961() {
  const initial = { weather: { wind_label: 'Тихий ветер', wind_speed_mph: 1 } };
  const changed = { weather: { wind_label: 'Лёгкий ветер', wind_speed_mph: 2 } };
  return input961([[0, [10, 10, 0], initial], [1, [10, 10, 0], initial], [62, [10, 10, 0], changed], [124, [10, 10, 0], changed]], [
    { turn: 1, action: 'wait' }, { turn: 62, action: 'wait' }
  ]);
}

function h4Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [11, 10, 0], activityChange961], [3, [11, 10, 0], activityChange961]], [
    { turn: 1, action: 'RIGHT' }
  ]);
}

function h5Input961() {
  return input961([[0, [10, 10, 0], { visible_furniture: [{ name: 'скамья', type: 'f_bench', positions: [[11, 10, 0]] }] }], [1, [11, 10, 0], { visible_furniture: [{ name: 'сундук', type: 'f_chest', positions: [[11, 10, 0]] }] }]], [
    { turn: 1, action: 'RIGHT' }
  ]);
}

function h6Input961() {
  const person = { kind: 'npc', type: 'human', id: 'npc-h-six', name: 'Мирон', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [13, 10, 0], { creatures: [person] }], [1, [14, 10, 0]]], [{ turn: 1, action: 'RIGHT' }]);
}

function h7Input961() {
  const person = { kind: 'npc', type: 'human', id: 'npc-h-seven', name: 'Мирон', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [12, 10, 0], { creatures: [person] }], [1, [13, 10, 0], { creatures: [person] }], [2, [14, 10, 0]], [3, [13, 10, 0]], [4, [12, 10, 0]], [5, [11, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }, { turn: 3, action: 'LEFT' }, { turn: 4, action: 'LEFT' }, { turn: 5, action: 'LEFT' }
  ]);
}

function h8Input961() {
  const person = { kind: 'npc', type: 'human', id: 'npc-h-eight', name: 'Мирон', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [14, 10, 0], { creatures: [person] }], [1, [13, 10, 0], { creatures: [person] }], [2, [12, 10, 0]], [3, [13, 10, 0]], [4, [14, 10, 0]], [5, [15, 10, 0]]], [
    { turn: 1, action: 'LEFT' }, { turn: 2, action: 'LEFT' }, { turn: 3, action: 'RIGHT' }, { turn: 4, action: 'RIGHT' }, { turn: 5, action: 'RIGHT' }
  ]);
}

function h9Input961() {
  const person = { kind: 'npc', type: 'human', id: 'npc-h-nine', name: 'Мирон', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [13, 9, 0], { creatures: [person] }], [1, [13, 10, 0], { creatures: [person] }], [2, [13, 11, 0]], [3, [13, 12, 0]], [4, [13, 13, 0]]], [
    { turn: 1, action: 'DOWN' }, { turn: 2, action: 'DOWN' }, { turn: 3, action: 'DOWN' }, { turn: 4, action: 'DOWN' }
  ]);
}

function h10Input961() {
  return input961([[0, [10, 10, 0]], [1, [10, 10, 0]], [62, [10, 10, 0]], [124, [10, 10, 0]]], [
    { turn: 1, action: 'wait' }, { turn: 62, action: 'wait' }
  ]);
}

function shiftV32961(input) {
  const shifted = structuredClone(input);
  const names = ['Савва', 'Ратмир', 'Осип', 'Фома', 'Ерема'];
  const nameMap = new Map([['Жирко', 'Савва'], ['Прокша', 'Ратмир']]);
  const idMap = new Map();
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (Array.isArray(value.creatures)) for (const creature of value.creatures) {
      if (typeof creature.name === 'string') {
        if (!nameMap.has(creature.name)) nameMap.set(creature.name, names[nameMap.size % names.length]);
        creature.name = nameMap.get(creature.name);
      }
      if (creature.id !== undefined) {
        const key = String(creature.id);
        if (!idMap.has(key)) idMap.set(key, `перенесённое-существо-${names[idMap.size % names.length]}`);
        creature.id = idMap.get(key);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'position' && Array.isArray(child) && child.length === 3) value[key] = [child[0] + 24, child[1] + 24, child[2]];
      else if (key === 'positions' && Array.isArray(child)) value[key] = child.map(position => [position[0] + 24, position[1] + 24, position[2]]);
      else if (key === 'overmap_position' && Array.isArray(child) && child.length === 3) value[key] = [child[0] + 1, child[1] + 1, child[2]];
      else walk(child);
    }
  }
  walk(shifted);
  return shifted;
}

function h11Input961() {
  return v32Input961().then(shiftV32961);
}

function h12Input961() {
  const earlier = { kind: 'npc', type: 'human', id: 'npc-first', name: 'Проводник', position: [11, 10, 0], direction: 'восток' };
  const later = { kind: 'npc', type: 'human', id: 'npc-second', name: 'Проводник', position: [11, 10, 0], direction: 'восток' };
  return input961([[0, [10, 10, 0], { creatures: [earlier] }], [1, [11, 10, 0], { creatures: [later] }]], [{ turn: 1, action: 'RIGHT' }]);
}

function h13Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [11, 10, 0]], [3, [11, 10, 0], activityChange961], [4, [12, 10, 0], activityChange961]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'позвать' }, { turn: 4, action: 'RIGHT' }
  ]);
}

function h14Input961() {
  const earlier = { kind: 'npc', type: 'human', id: 'npc-moving', name: 'Добрыня', position: [12, 10, 0], direction: 'восток' };
  const later = { kind: 'npc', type: 'human', id: 'npc-moving', name: 'Добрыня', position: [13, 10, 0], direction: 'восток' };
  return input961([[0, [10, 10, 0], { creatures: [earlier] }], [1, [11, 10, 0], { creatures: [later] }]], [{ turn: 1, action: 'RIGHT' }]);
}

function h15Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [12, 10, 0], { ...activityChange961, sounds: [{ description: 'Хруст ветки', category: 1 }, { description: 'Не подходи', category: 5 }] }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function h16Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [10, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'LEFT' }
  ]);
}

function h17Input961() {
  return input961([[0, [10, 10, 0]], [1, [10, 10, 0]]], [{ turn: 1, action: 'RIGHT' }]);
}

const r3ServiceValues961 = /[0-9]|miron|luka|human|f_bench|f_chest|\b(?:id|uid|type)\b|отрезок/iu;

function r3f01Input961() {
  const start = [{ name: 'скамья', type: 'f_bench', positions: [[9, 10, 0]] }];
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[13, 11, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: start }], [1, [11, 10, 0], { visible_furniture: start }], [2, [12, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f02Input961() {
  const start = [{ name: 'скамья', type: 'f_bench', positions: [[9, 10, 0]] }];
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[9, 10, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: start }], [1, [11, 10, 0], { visible_furniture: start }], [2, [12, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f03Input961() {
  const start = [{ name: 'скамья', type: 'f_bench', positions: [[9, 10, 0]] }];
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[11, 13, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: start }], [1, [11, 10, 0], { visible_furniture: start }], [2, [12, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f04Input961() {
  const start = [{ name: 'скамья', type: 'f_bench', positions: [[13, 10, 0]] }];
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[13, 11, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: start }], [1, [11, 10, 0], { visible_furniture: start }], [2, [12, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f05Input961() {
  const start = [{ name: 'скамья', type: 'f_bench', positions: [[13, 10, 0]] }];
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[9, 11, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: start }], [1, [11, 10, 0], { visible_furniture: start }], [2, [12, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f06Input961() {
  const start = [{ name: 'скамья', type: 'f_bench', positions: [[11, 12, 0]] }];
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[11, 13, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: start }], [1, [11, 10, 0], { visible_furniture: start }], [2, [12, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f07Input961() {
  const furniture = [{ name: 'скамья', type: 'f_bench', positions: [[13, 11, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: furniture }], [1, [11, 10, 0], { visible_furniture: furniture }], [2, [12, 10, 0], { visible_furniture: furniture }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f08Input961() {
  const furniture = [{ name: 'скамья', type: 'f_bench', positions: [[9, 11, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: furniture }], [1, [11, 10, 0], { visible_furniture: furniture }], [2, [12, 10, 0], { visible_furniture: furniture }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f09Input961() {
  const furniture = [{ name: 'скамья', type: 'f_bench', positions: [[11, 13, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: furniture }], [1, [11, 10, 0], { visible_furniture: furniture }], [2, [12, 10, 0], { visible_furniture: furniture }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f10Input961() {
  const start = [{ name: 'скамья', type: 'f_bench', positions: [[9, 10, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: start }], [1, [11, 10, 0], { visible_furniture: start }], [2, [12, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f11Input961() {
  const start = [{ name: 'скамья', type: 'f_bench', positions: [[13, 10, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: start }], [1, [11, 10, 0], { visible_furniture: start }], [2, [12, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f12Input961() {
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[13, 11, 0]] }];
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [12, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f13Input961() {
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[9, 11, 0]] }];
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [12, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f14Input961() {
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[11, 13, 0]] }];
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [12, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3f15Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [12, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3b01Input961() {
  const miron = { kind: 'npc', type: 'human', id: 'miron', name: 'Мирон', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [13, 10, 0], { creatures: [miron] }], [1, [14, 10, 0]], [2, [15, 10, 0], { creatures: [miron] }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3b02Input961() {
  const miron = { kind: 'npc', type: 'human', id: 'miron', name: 'Мирон', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [13, 10, 0], { creatures: [miron] }], [1, [14, 10, 0]], [2, [15, 10, 0], { creatures: [miron] }], [3, [16, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }, { turn: 3, action: 'RIGHT' }
  ]);
}

function r3b03Input961() {
  const miron = { kind: 'npc', type: 'human', id: 'miron', name: 'Мирон', position: [10, 10, 0], direction: 'запад' };
  const luka = { kind: 'npc', type: 'human', id: 'luka', name: 'Лука', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [13, 10, 0], { creatures: [miron, luka] }], [1, [14, 10, 0], { creatures: [luka] }], [2, [15, 10, 0], { creatures: [miron, luka] }], [3, [16, 10, 0], { creatures: [miron] }], [4, [17, 10, 0], { creatures: [miron] }], [5, [18, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }, { turn: 3, action: 'RIGHT' }, { turn: 4, action: 'RIGHT' }, { turn: 5, action: 'RIGHT' }
  ]);
}

function r3b04Input961() {
  const miron = { kind: 'npc', type: 'human', id: 'miron', name: 'Мирон', position: [10, 10, 0], direction: 'запад' };
  return input961([[0, [13, 10, 0], { creatures: [miron] }], [1, [14, 10, 0]], [2, [15, 10, 0], { creatures: [miron] }], [3, [14, 10, 0]]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }, { turn: 3, action: 'LEFT' }
  ]);
}

function r3a01Input961() {
  return input961([[0, [10, 10, 0]], [1, [10, 10, 0], activityChange961], [2, [11, 10, 0], activityChange961]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'RIGHT' }
  ]);
}

function r3a02Input961() {
  return input961([[0, [10, 10, 0]], [1, [11, 10, 0]], [2, [11, 10, 0], activityChange961], [3, [12, 10, 0], activityChange961]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'open' }, { turn: 3, action: 'RIGHT' }
  ]);
}

function r3z01Input961() {
  const start = [{ name: 'скамья', type: 'f_bench', positions: [[9, 10, 0]] }];
  const end = [{ name: 'сундук', type: 'f_chest', positions: [[11, 10, 0]] }];
  return input961([[0, [10, 10, 0], { visible_furniture: start }], [1, [11, 10, 0]], [2, [10, 10, 0], { visible_furniture: end }]], [
    { turn: 1, action: 'RIGHT' }, { turn: 2, action: 'LEFT' }
  ]);
}

function registerSynthetic961() {
  const cases = [
    ['P2', p2Input961], ['P3', p3Input961], ['P4', p4Input961], ['P5', p5Input961], ['P6', p6Input961], ['P7', p7Input961], ['P8', p8Input961], ['P9', p9Input961], ['P10', p10Input961], ['P11', p11Input961], ['P12', p12Input961], ['P13a', p13aInput961], ['P13b', p13bInput961], ['P13c', p13cInput961], ['P14', p14Input961], ['P15', p15Input961], ['P16a', p16aInput961], ['P16b', p16bInput961], ['P17', p17Input961], ['P18', p18Input961], ['P19', p19Input961],
    ['S1', s1Input961], ['S2', s2Input961], ['S3', s3Input961], ['S4', s4Input961], ['S5', s5Input961],
    ['H1', h1Input961], ['H3', h3Input961], ['H4', h4Input961], ['H5', h5Input961], ['H6', h6Input961], ['H7', h7Input961], ['H8', h8Input961], ['H9', h9Input961], ['H10', h10Input961], ['H11', h11Input961], ['H12', h12Input961], ['H13', h13Input961], ['H14', h14Input961], ['H15', h15Input961], ['H16', h16Input961], ['H17', h17Input961]
  ];
  for (const [id, build] of cases) inputs961.set(id, build);

  test('P2 guard — три шага образуют один путь', async t => {
    const ctx = await capture961(t, p2Input961());
    assert.equal(paths961(ctx).length, 1, 'P2, §1.4: три подряд подтверждённых шага образуют один путь.');
    assert.equal(waits961(ctx).length, 0, 'P2, §1.4: отрезок шагов не создаёт ожидание.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'P2, §1.4: без событий мира пометок пути нет.');
  });

  test('P3 guard — ожидание разделяет пути', async t => {
    const ctx = await capture961(t, p3Input961());
    assert.equal(paths961(ctx).length, 2, 'P3, §1.6: ожидание разделяет два отрезка шагов.');
    assert.equal(waits961(ctx).length, 1, 'P3, §1.6: между двумя путями передано одно ожидание.');
    assert.deepEqual(ctx.events.map(text => text.startsWith('Гость прошёл') ? 'путь' : text.startsWith('Гость ждал') ? 'ожидание' : 'иное'), ['путь', 'ожидание', 'путь'], 'P3, §1.6: путь, ожидание и путь сохранены в исходном порядке.');
  });

  test('P4 — перемена тела второго шага сохраняется внутри пути', async t => {
    const ctx = await capture961(t, p4Input961());
    assert.equal(paths961(ctx).length, 1, 'P4, §1.7: событие мира не разрывает отрезок из двух шагов.');
    assert.equal(ctx.events[1], `По ходу пути: ${activityEvent961}`, 'P4, §2.3: после пути стоит пометка и неизменённый текст перемены тела.');
    assert.equal(ctx.events[0], paths961(ctx)[0], 'P4, §2.2: путь стоит перед событием своего хода.');
  });

  test('P5 — исчезновение без удаления остаётся событием пути', async t => {
    const ctx = await capture961(t, p5Input961());
    const disappearance = disappearance961(ctx, 'Незнакомец');
    assert.equal(disappearance, 'По ходу пути: Существо «Незнакомец» больше не видно в месте сцены.', 'P5, §4.3: исчезновение после последнего действия пути сохраняется с его пометкой.');
    assert.equal(paths961(ctx).length, 1, 'P5, §4.3: два шага образуют один путь.');
    assert.equal(paths961(ctx)[0].includes('Позади'), false, 'P5, §4.1: равное расстояние не называет существо оставшимся позади.');
    assert.ok(ctx.events.indexOf(disappearance) > ctx.events.indexOf(paths961(ctx)[0]), 'P5, §2.2: исчезновение идёт после пути.');
  });

  test('P6 guard — подтверждённое открытие разделяет ожидания', async t => {
    const ctx = await capture961(t, p6Input961());
    assert.equal(waits961(ctx).length, 2, 'P6, §1.6: подтверждённое открытие разделяет два ожидания.');
    assert.equal(waits961(ctx)[0], 'Гость ждал на месте две секунды.', 'P6, §5: первое ожидание длится до следующего ввода.');
    assert.equal(waits961(ctx)[1], 'Гость ждал на месте три секунды.', 'P6, §5: последнее ожидание длится до конца записи.');
    assert.equal(ctx.events.filter(text => text === 'Гость открыл дверь.').length, 1, 'P6, §1.1: подтверждённое открытие создаёт ровно одно действие.');
    assert.deepEqual(ctx.events.map(text => text.startsWith('Гость ждал') ? 'ожидание' : text === 'Гость открыл дверь.' ? 'открытие' : 'иное'), ['ожидание', 'открытие', 'ожидание'], 'P6, §1.6: ожидания остаются по разные стороны открытия.');
  });

  test('P7 guard — неподтверждённое направление остаётся шагом', async t => {
    const ctx = await capture961(t, p7Input961());
    assert.equal(paths961(ctx).length, 1, 'P7, §1.3 и §1.6: неподтверждённая попытка другого направления не разрывает отрезок шагов.');
    assert.equal(ctx.events.some(text => text.includes('UP')), false, 'P7, §1.9: неподтверждённая попытка не становится событием пакета.');
  });

  test('P8 — перемена неподтверждённого шага относится к пути', async t => {
    const ctx = await capture961(t, p8Input961());
    assert.equal(paths961(ctx).length, 1, 'P8, §1.6: попытка шага и событие мира не разрывают отрезок подтверждённых шагов.');
    assert.equal(ctx.events[1], `По ходу пути: ${activityEvent961}`, 'P8, §2.3: перемена хода неподтверждённого шага помечена путём.');
    assert.equal(ctx.events.filter(text => text.includes('UP')).length, 0, 'P8, §1.9: неподтверждённая попытка отсутствует среди событий.');
  });

  test('P9 — неизвестное действие разделяет пути', async t => {
    const ctx = await capture961(t, p9Input961());
    assert.equal(paths961(ctx).length, 2, 'P9, §1.6: неизвестное действие разрывает отрезок шагов.');
    assert.equal(ctx.events.some(text => text.includes('позвать')), false, 'P9, §1.9: неизвестное действие не становится событием пакета.');
  });

  test('P10 guard — служебные вводы сохраняют путь', async t => {
    const ctx = await capture961(t, p10Input961());
    assert.equal(paths961(ctx).length, 1, 'P10, §1.2: служебные вводы не разрывают путь.');
    assert.equal(ctx.events.length, 1, 'P10, §1.2: служебные вводы не добавляют событий.');
  });

  test('P11 guard — равные расстояния до одной опоры дают форму возле ориентира', async t => {
    const ctx = await capture961(t, p11Input961());
    assert.equal(paths961(ctx)[0], 'Гость прошёл на восток возле ориентира «бревно».', 'P11, §3.4 и §3.7: равные расстояния до одной опоры дают форму возле.');
    assert.equal(paths961(ctx).length, 1, 'P11, §3.4: подтверждённый шаг передан одним путём.');
  });

  test('P12 — одинаковый label объединяет опоры разных позиций', async t => {
    const ctx = await capture961(t, p12Input961());
    assert.equal(paths961(ctx)[0], 'Гость прошёл на восток, к месту у ориентира «бревно».', 'P12, §3.3 и §3.4 строка 7, §3.7: одинаковый label даёт один ориентир с отношением к позиции конечной опоры.');
    assert.equal(paths961(ctx).length, 1, 'P12, §3.4: подтверждённый шаг передан одним путём.');
  });

  test('P13a — начальная опора без удаления опускается', async t => {
    const ctx = await capture961(t, p13aInput961());
    assert.equal(paths961(ctx)[0], 'Гость прошёл на восток.', 'P13a, §3.4 и §3.7: начальная опора без удаления при отсутствии конечной опускается.');
    assert.equal(paths961(ctx).length, 1, 'P13a, §3.4: подтверждённый шаг передан одним путём.');
  });

  test('P13b — путь называет только конечную опору', async t => {
    const ctx = await capture961(t, p13bInput961());
    assert.equal(paths961(ctx)[0], 'Гость прошёл на восток, к месту у ориентира «лавка».', 'P13b, §3.4: при отсутствии начальной опоры названа только конечная.');
    assert.equal(paths961(ctx).length, 1, 'P13b, §3.4: подтверждённый шаг передан одним путём.');
  });

  test('P13c guard — путь без опор сохраняет простую форму', async t => {
    const ctx = await capture961(t, p13cInput961());
    assert.equal(paths961(ctx)[0], 'Гость прошёл на восток.', 'P13c, §3.4: путь без опор сохраняет явно утверждённый простой текст.');
    assert.equal(paths961(ctx).length, 1, 'P13c, §3.4: один подтверждённый шаг создаёт один путь.');
  });

  test('P14 — путь туда и обратно передаётся без стороны света', async t => {
    const ctx = await capture961(t, p14Input961());
    assert.equal(paths961(ctx)[0], 'Гость прошёл возле ориентира «бревно».', 'P14, §3.1 и §3.4: при нулевом смещении сторона света опущена, а общая опора названа возле ориентира.');
    assert.equal(paths961(ctx).length, 1, 'P14, §3.4: два подряд шага образуют один путь.');
  });

  test('P15 — исчезнувшее существо без id не называется позади', async t => {
    const ctx = await capture961(t, p15Input961());
    const disappearance = disappearance961(ctx, 'Илья');
    assert.equal(disappearance?.slice(0, 'По ходу пути: '.length), 'По ходу пути: ', 'P15, §4.3: исчезновение в ходе первого шага получает пометку пути.');
    assert.equal(disappearance?.slice('По ходу пути: '.length), 'Существо «Илья» больше не видно в месте сцены.', 'P15, §2.3: после пометки сохранён точный исходный текст исчезновения.');
    assert.equal(paths961(ctx).length, 1, 'P15, §4.1: два шага образуют один путь.');
    assert.equal(paths961(ctx)[0].includes('Позади'), false, 'P15, §4.1: у существа без id нет предложения о том, что оно осталось позади.');
    assert.equal(ctx.events.indexOf(disappearance), ctx.events.indexOf(paths961(ctx)[0]) + 1, 'P15, §2.2: помеченное исчезновение стоит сразу после пути.');
  });

  test('P16a — событие хода одиночного шага следует за путём', async t => {
    const ctx = await capture961(t, p16aInput961());
    assert.equal(ctx.events.indexOf(paths961(ctx)[0]), 0, 'P16a, §2.1: путь своего хода стоит до перемены тела.');
    assert.equal(ctx.events[1], `По ходу пути: ${activityEvent961}`, 'P16a, §2.3: событие хода одиночного шага помечено путём.');
    assert.equal(waits961(ctx).length, 1, 'P16a, §1.6: ожидание начинает отдельный отрезок после шага.');
    assert.equal(ctx.events.indexOf(waits961(ctx)[0]), 2, 'P16a, §2.1: ожидание стоит третьим событием после пути и перемены тела.');
  });

  test('P16b — событие хода ожидания следует за ожиданием', async t => {
    const ctx = await capture961(t, p16bInput961());
    const body = bodyEvent961(ctx);
    assert.equal(body?.slice(0, 'За время ожидания: '.length), 'За время ожидания: ', 'P16b, §2.1 и §2.3: перемена хода ожидания получает его пометку.');
    assert.equal(ctx.events.indexOf(paths961(ctx)[0]), 0, 'P16b, §2.1: путь предшествует ожиданию и его событию.');
    assert.equal(ctx.events.indexOf(waits961(ctx)[0]), 1, 'P16b, §2.1: ожидание стоит сразу после пути.');
    assert.equal(ctx.events.indexOf(body), 2, 'P16b, §2.1: событие хода ожидания стоит после него.');
    assert.equal(paths961(ctx).length, 1, 'P16b, §1.6: предшествующий путь сохранён отдельно от ожидания.');
  });

  test('P17 guard — событие после открытия остаётся без пометки', async t => {
    const ctx = await capture961(t, p17Input961());
    assert.deepEqual(ctx.events, ['Гость открыл дверь.', activityEvent961], 'P17, §2.5: событие после открытия остаётся без пометки и следует за действием.');
  });

  test('P18 guard — событие до первого действия остаётся на месте', async t => {
    const ctx = await capture961(t, p18Input961());
    assert.equal(ctx.events[0], activityEvent961, 'P18, §2.4: событие до первого действия остаётся без пометки на своём месте.');
    assert.equal(ctx.events[1], paths961(ctx)[0], 'P18, §2.4: первый путь следует после раннего события.');
  });

  test('P19 — исчезновение после ожидания получает его пометку', async t => {
    const ctx = await capture961(t, p19Input961());
    const disappearance = disappearance961(ctx, 'Мирон');
    assert.equal(disappearance, 'За время ожидания: Существо «Мирон» больше не видно в месте сцены.', 'P19, §4.3: исчезновение после последнего ожидания сохраняется с его пометкой.');
    assert.equal(waits961(ctx).length, 1, 'P19, §1.5: ожидание перед исчезновением передано одним событием.');
    assert.ok(ctx.events.indexOf(disappearance) > ctx.events.indexOf(waits961(ctx)[0]), 'P19, §2.2–§2.3: исчезновение следует после ожидания.');
  });

  test('P20 guard — тексты всех обязательных входов не содержат служебных значений', async t => {
    const caseIds = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11', 'P12', 'P13a', 'P13b', 'P13c', 'P14', 'P15', 'P16a', 'P16b', 'P17', 'P18', 'P19'];
    const results = [];
    for (const id of caseIds) {
      const build = inputs961.get(id);
      assert.equal(typeof build, 'function', `P20, §3.6: зарегистрирован свежий вход ${id}.`);
      const input = await build();
      const ctx = await capture961(t, input);
      const fields = [];
      function collect(value) {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { for (const item of value) collect(item); return; }
        for (const [key, child] of Object.entries(value)) {
          if (['id', 'uid', 'type'].includes(key) && (typeof child === 'string' || typeof child === 'number') && String(child)) fields.push({ key, value: String(child) });
          collect(child);
        }
      }
      collect(input);
      results.push({ id, texts: paths961(ctx), fields });
    }
    const allTexts = results.flatMap(result => result.texts);
    assert.ok(allTexts.length > 0, 'P20, §3.6: проверка не пуста — обязательные входы породили тексты путей.');
    for (const result of results) for (const text of result.texts) assert.doesNotMatch(text, /[0-9]/u, `P20, §3.6: в пути ${result.id} нет цифр.`);
    for (const result of results) for (const text of result.texts) for (const field of result.fields) assert.equal(text.includes(field.value), false, `P20, §3.6: путь ${result.id} не содержит значение поля ${field.key}=${field.value}.`);
    for (const result of results) for (const text of result.texts) assert.equal(text.toLocaleLowerCase('ru').includes('отрезок'), false, `P20, §3.6: путь ${result.id} не содержит слово «отрезок».`);
  });

  test('S1 — неподтверждённое открытие разделяет пути', async t => {
    const ctx = await capture961(t, s1Input961());
    assert.equal(paths961(ctx).length, 2, 'S1, §1.6: неподтверждённое открытие разделяет два пути.');
    assert.equal(ctx.events.some(text => text.includes('открыл дверь')), false, 'S1, §1.9: неподтверждённое открытие не становится событием.');
  });

  test('S2 guard — смена клетки разделяет ожидания', async t => {
    const ctx = await capture961(t, s2Input961());
    assert.equal(waits961(ctx).length, 2, 'S2, §1.5: ожидания на разных клетках переданы отдельно.');
    assert.equal(waits961(ctx)[0], 'Гость ждал на месте три секунды.', 'S2, §5: первое ожидание длится до следующего ввода.');
    assert.equal(waits961(ctx)[1], 'Гость ждал на месте четыре секунды.', 'S2, §5: последнее ожидание длится до конца записи.');
  });

  test('S3 H2 guard — граница частей одного момента разделяет пути', async t => {
    const ctx = await capture961(t, s3Input961());
    assert.equal(ctx.parts.length, 2, 'S3 H2, §1.8: смена сцены создаёт две части одного момента.');
    assert.equal(paths961({ events: ctx.parts[0].packet.События ?? [] }).length, 1, 'S3 H2, §1.8: первая часть содержит свой путь.');
    assert.equal(paths961({ events: ctx.parts[1].packet.События ?? [] }).length, 1, 'S3 H2, §1.8: вторая часть содержит отдельный путь.');
  });

  test('S4 guard — звук и речь между шагами сохраняют разделы', async t => {
    const ctx = await capture961(t, s4Input961());
    assert.equal(paths961(ctx).length, 1, 'S4, §1.7: звук и речь не разрывают отрезок шагов.');
    assert.deepEqual(ctx.parts[0].packet.Звуки, ['Герой слышал «Хруст ветки».'], 'S4, §2.7: звук остаётся в разделе «Звуки» без изменения текста.');
    assert.deepEqual(ctx.parts[0].packet.Речь, ['Герой слышал «Не подходи».'], 'S4, §2.7: речь остаётся в разделе «Речь» без изменения текста.');
    assert.equal(ctx.events.some(text => text.includes('Хруст ветки') || text.includes('Не подходи')), false, 'S4, §2.7: звук и речь не копируются в раздел событий.');
  });

  test('S5 — наблюдаемое открытие двери не разделяет путь', async t => {
    const ctx = await capture961(t, s5Input961());
    assert.equal(paths961(ctx).length, 1, 'S5, §1.7: наблюдаемое изменение двери не разрывает путь.');
    const change = ctx.events.find(text => text.includes('Изменилось состояние предмета «дверь»'));
    assert.equal(change, 'По ходу пути: Изменилось состояние предмета «дверь». Рядом с героем — дверь. Дверь была открыта.', 'S5, §2.3: исходная перемена двери помечена и следует за общим путём.');
    assert.equal(ctx.events.some(text => text === 'Гость открыл дверь.'), false, 'S5, §1.7: действие открытия не приписано герою.');
  });

  test('H1 — неподтверждённое открытие разделяет ожидания', async t => {
    const ctx = await capture961(t, h1Input961());
    assert.equal(waits961(ctx).length, 2, 'H1, §1.6: неподтверждённое открытие разделяет ожидания.');
    assert.equal(waits961(ctx)[0], 'Гость ждал на месте две секунды.', 'H1, §5: первое ожидание заканчивается следующим вводом.');
    assert.equal(waits961(ctx)[1], 'Гость ждал на месте три секунды.', 'H1, §5: второе ожидание длится до конца записи.');
    assert.equal(ctx.events.some(text => text === 'Гость открыл дверь.'), false, 'H1, §1.9: неподтверждённое открытие не создаёт события действия.');
  });

  test('H3 — ветер второго ожидания сохраняется после общего ожидания', async t => {
    const ctx = await capture961(t, h3Input961());
    assert.equal(waits961(ctx).length, 1, 'H3, §1.5: ожидания на одной клетке объединены, несмотря на перемену ветра.');
    assert.equal(waits961(ctx)[0], 'Гость ждал на месте две минуты три секунды.', 'H3, §5: длительность ожиданий складывается в две минуты три секунды.');
    assert.equal(ctx.events[1], 'За время ожидания: Перемена вокруг героя: ветра стало больше.', 'H3, §2.3: перемена ветра второго ожидания следует после общего ожидания с его пометкой.');
  });

  test('H4 — событие после последнего шага относится к пути', async t => {
    const ctx = await capture961(t, h4Input961());
    assert.equal(bodyEvent961(ctx), `По ходу пути: ${activityEvent961}`, 'H4, §2.1: событие без действия в более позднем ходу относится к последнему шагу пути.');
    assert.equal(ctx.events.indexOf(paths961(ctx)[0]), 0, 'H4, §2.2: путь предшествует событию своего отрезка.');
  });

  test('H5 — разные названия опор одной позиции учитываются по расстоянию', async t => {
    const ctx = await capture961(t, h5Input961());
    assert.equal(paths961(ctx)[0], 'Гость прошёл на восток, к месту у ориентира «сундук».', 'H5, §3.3 и §3.4 строка 4, §3.7: разные label не объединяются, но без удаления от начала текст называет только конечную опору.');
    assert.equal(ctx.events[1]?.startsWith('По ходу пути: '), true, 'H5, §2.3: перемена мебели следует после пути с его пометкой.');
  });

  test('H6 — одно исчезнувшее существо называется позади в единственном числе', async t => {
    const ctx = await capture961(t, h6Input961());
    assert.equal(paths961(ctx)[0]?.endsWith('Позади осталось существо «Мирон».') ?? false, true, 'H6, §3.5: одно существо названо позади в единственном числе.');
    assert.equal(disappearance961(ctx, 'Мирон'), undefined, 'H6, §4.2: поглощённое исчезновение не выведено отдельным событием.');
    assert.equal(paths961(ctx).length, 1, 'H6, §4.1: исчезновение внутри шага относится к одному пути.');
  });

  test('H7 — возврат после исчезновения исключает существо из позади', async t => {
    const ctx = await capture961(t, h7Input961());
    const disappearance = disappearance961(ctx, 'Мирон');
    assert.equal(disappearance?.slice(0, 'По ходу пути: '.length), 'По ходу пути: ', 'H7, §4.1 и §4.3: при меньшем расстоянии в конце пути исчезновение остаётся отдельным помеченным событием.');
    assert.equal(paths961(ctx).length, 1, 'H7, §4.1: возврат завершает один отрезок шагов.');
    assert.equal(paths961(ctx)[0].includes('Позади'), false, 'H7, §4.1: существо не осталось позади, поскольку расстояние к концу пути уменьшилось.');
  });

  test('H8 — удаление к концу пути определяет позади', async t => {
    const ctx = await capture961(t, h8Input961());
    assert.equal(paths961(ctx)[0]?.includes('Позади осталось существо «Мирон».') ?? false, true, 'H8, §4.1: конечное расстояние пять больше расстояния последнего наблюдения три.');
    assert.equal(disappearance961(ctx, 'Мирон'), undefined, 'H8, §4.2: исчезновение существа, оставшегося позади, не выведено отдельно.');
  });

  test('H9 — равенство расстояний Чебышёва исключает позади', async t => {
    const ctx = await capture961(t, h9Input961());
    const disappearance = disappearance961(ctx, 'Мирон');
    assert.equal(disappearance?.slice(0, 'По ходу пути: '.length), 'По ходу пути: ', 'H9, §4.1 и §4.3: равенство расстояний сохраняет помеченное исчезновение.');
    assert.equal(paths961(ctx).length, 1, 'H9, §4.1: четыре подтверждённых шага образуют один путь.');
    assert.equal(paths961(ctx)[0].includes('Позади'), false, 'H9, §4.1: равные расстояния Чебышёва не называют существо позади.');
  });

  test('H10 guard — сумма ожиданий сохраняет остаток секунд', async t => {
    const ctx = await capture961(t, h10Input961());
    assert.equal(waits961(ctx).length, 1, 'H10, §5: два ожидания на одной клетке переданы одним событием.');
    assert.equal(waits961(ctx)[0], 'Гость ждал на месте две минуты три секунды.', 'H10, §5: остаток секунд сохраняется в сумме ожиданий.');
  });

  test('H11 — сдвинутая и переименованная V32 сохраняет структуру событий', async t => {
    const ctx = await capture961(t, await h11Input961());
    assert.equal(paths961(ctx).length, 2, 'H11, §6: сдвинутая V32 сохраняет два пути.');
    assert.equal(waits961(ctx).length, 1, 'H11, §6: сдвинутая V32 сохраняет одно ожидание.');
    const expected = expectedV32961.map(text => text.replaceAll('Жирко', 'Савва').replaceAll('Прокша', 'Ратмир'));
    assert.deepEqual(paths961(ctx).map(text => text.split(' Позади')[0]), [expected[0], expected[6].split(' Позади')[0]], 'H11, §3.4 и §3.7: пути сохраняют утверждённые отношения к опорам после сдвига.');
    assert.deepEqual(ctx.events, expected, 'H11, §6: буквальная структура утверждённых событий сохраняется после изменения координат и имён.');
    assert.equal(paths961(ctx)[1]?.endsWith('Позади остались существа: «Савва», «Ратмир».') ?? false, true, 'H11, §4.1 и §4.2: новые имена сохранены в предложении о существах позади.');
    assert.equal(ctx.events.some(text => text.includes('Жирко') || text.includes('Прокша')), false, 'H11, §6: в преобразованном результате нет прежних имён.');
  });

  test('H12 — разные id при одинаковых названии и позиции сохраняют одну опору', async t => {
    const ctx = await capture961(t, h12Input961());
    assert.equal(paths961(ctx)[0], 'Гость прошёл на восток, к месту у ориентира «Проводник».', 'H12, §3.3 и §3.4 строка 7, §3.7: при одинаковом label отношение к конечной опоре определяется расстояниями, независимо от id.');
    assert.equal(ctx.events[1], 'По ходу пути: Существо «Проводник» больше не видно в месте сцены.', 'H12, §2.3: исходный текст исчезновения прежнего id сохранён после пути с пометкой.');
    assert.equal(ctx.events[2], 'По ходу пути: Появилось существо «Проводник». Рядом с героем — Проводник.', 'H12, §2.3: исходный текст появления нового id сохранён после пути с пометкой.');
    assert.ok(ctx.events.indexOf(ctx.events[1]) < ctx.events.indexOf(ctx.events[2]), 'H12, §2.2: исчезновение и появление сохраняют исходный порядок событий.');
  });

  test('H13 guard — событие после неизвестного действия остаётся между путями', async t => {
    const ctx = await capture961(t, h13Input961());
    assert.equal(paths961(ctx).length, 2, 'H13, §1.6: неизвестное действие разделяет два пути.');
    assert.equal(ctx.events[1], activityEvent961, 'H13, §2.5: событие после неизвестного действия остаётся без пометки между путями.');
    assert.equal(ctx.events.some(text => text.includes('позвать')), false, 'H13, §1.9: неизвестное действие не выводится событием.');
  });

  test('H14 — перемещение NPC первого шага следует за путём', async t => {
    const ctx = await capture961(t, h14Input961());
    assert.equal(ctx.events.indexOf(paths961(ctx)[0]), 0, 'H14, §2.1: путь первого шага стоит перед перемещением NPC своего хода.');
    const movement = ctx.events.find(text => text.includes('Положение существа «Добрыня» изменилось.'));
    assert.equal(movement?.startsWith('По ходу пути: '), true, 'H14, §2.3: исходный текст перемещения NPC помечен путём.');
    assert.equal(movement?.slice('По ходу пути: '.length), 'Положение существа «Добрыня» изменилось. Теперь существо находилось к востоку от героя, в месте сцены.', 'H14, §2.3: после пометки сохранён точный исходный текст перемещения.');
  });

  test('H15 — перемена тела второго шага отделена от звука и речи', async t => {
    const ctx = await capture961(t, h15Input961());
    assert.equal(bodyEvent961(ctx), `По ходу пути: ${activityEvent961}`, 'H15, §2.3: перемена тела второго шага помечена путём.');
    assert.equal(paths961(ctx).length, 1, 'H15, §1.7: перемена тела не разрывает путь.');
    assert.deepEqual(ctx.parts[0].packet.Звуки, ['Герой слышал «Хруст ветки».'], 'H15, §2.7: звук сохранён без пометки в разделе звуков.');
    assert.deepEqual(ctx.parts[0].packet.Речь, ['Герой слышал «Не подходи».'], 'H15, §2.7: речь сохранена без пометки в разделе речи.');
    assert.equal(ctx.events.some(text => text.includes('Хруст ветки') || text.includes('Не подходи')), false, 'H15, §2.7: звук и речь не дублируются среди событий.');
  });

  test('H16 guard — путь туда и обратно без опор не называет направление', async t => {
    const ctx = await capture961(t, h16Input961());
    assert.equal(paths961(ctx)[0], 'Гость прошёл.', 'H16, §3.1 и §3.4: замкнутый путь без опор не называет сторону света.');
    assert.equal(paths961(ctx).length, 1, 'H16, §3.1: два обратных шага переданы одним путём.');
  });

  test('H17 guard — одиночная неподтверждённая попытка не создаёт пути', async t => {
    const ctx = await capture961(t, h17Input961());
    assert.equal(paths961(ctx).length, 0, 'H17, §1.9: неподтверждённая попытка не создаёт успешный путь.');
    assert.equal(ctx.events.length, 0, 'H17, §1.9: неподтверждённая попытка не создаёт события.');
  });

  test('R3-F01 guard — две разные опоры, удаление от начала и приближение к концу', async t => {
    const ctx = await capture961(t, r3f01Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, от места у ориентира «скамья» к месту у ориентира «сундук».', 'R3-F01, §3.4 строка 1 и §3.7: текст пути точно передаёт отношение к обеим опорам.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F01, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F01, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F01, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F01, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F01, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F02 — две разные опоры с удалением от обеих', async t => {
    const ctx = await capture961(t, r3f02Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, от места у ориентира «скамья», прочь от ориентира «сундук».', 'R3-F02, §3.3, §3.4 строка 2 и §3.7: текст пути точно передаёт удаление от обеих опор.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F02, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F02, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F02, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.length, 2, 'R3-F02, §3.3: поток содержит один путь и одно событие смены мебели.');
    assert.equal(ctx.events[1].startsWith('По ходу пути: '), true, 'R3-F02, §2.3: событие мебели следует после пути с пометкой.');
    assert.equal(ctx.events[1].slice('По ходу пути: '.length), 'Изменилось состояние предмета «сундук». К западу от героя — сундук.', 'R3-F02, §2.3: исходный текст события мебели сохранён после пометки.');
    assert.deepEqual(ctx.events, [paths[0], 'По ходу пути: Изменилось состояние предмета «сундук». К западу от героя — сундук.'], 'R3-F02, §2.2: путь и единственное событие идут в исходном порядке.');
  });

  test('R3-F03 — две разные опоры, удаление от начала и без перемены у конца', async t => {
    const ctx = await capture961(t, r3f03Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, от места у ориентира «скамья», возле ориентира «сундук».', 'R3-F03, §3.4 строка 3 и §3.7: текст пути точно передаёт отношение к обеим опорам.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F03, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F03, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F03, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F03, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F03, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F04 — две разные опоры с приближением к обеим', async t => {
    const ctx = await capture961(t, r3f04Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, к месту у ориентира «сундук».', 'R3-F04, §3.4 строка 4 и §3.7: при приближении к обеим опорам текст называет конечную.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F04, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F04, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F04, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F04, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F04, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F05 — две разные опоры, приближение к началу и удаление от конца', async t => {
    const ctx = await capture961(t, r3f05Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, прочь от ориентира «сундук».', 'R3-F05, §3.4 строка 5 и §3.7: удаление от конечной опоры определяет текст пути.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F05, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F05, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F05, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F05, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F05, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F06 — две разные опоры без перемены расстояния', async t => {
    const ctx = await capture961(t, r3f06Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток возле ориентира «сундук».', 'R3-F06, §3.4 строка 6 и §3.7: без перемены расстояния текст называет конечную опору возле героя.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F06, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F06, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F06, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F06, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F06, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F07 — один ориентир с приближением', async t => {
    const ctx = await capture961(t, r3f07Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, к месту у ориентира «скамья».', 'R3-F07, §3.4 строка 7 и §3.7: приближение к одной опоре задаёт текст пути.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F07, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F07, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F07, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F07, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F07, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F08 — один ориентир с удалением', async t => {
    const ctx = await capture961(t, r3f08Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, прочь от ориентира «скамья».', 'R3-F08, §3.4 строка 8 и §3.7: удаление от одной опоры задаёт текст пути.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F08, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F08, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F08, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F08, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F08, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F09 guard — один ориентир без перемены расстояния', async t => {
    const ctx = await capture961(t, r3f09Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток возле ориентира «скамья».', 'R3-F09, §3.4 строка 9 и §3.7: равные расстояния до одной опоры дают форму возле.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F09, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F09, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F09, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F09, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F09, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F10 guard — только начальная опора с удалением', async t => {
    const ctx = await capture961(t, r3f10Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, от места у ориентира «скамья».', 'R3-F10, §3.4 строка 10 и §3.7: единственная начальная опора названа при удалении.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F10, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F10, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F10, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F10, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F10, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F11 — только начальная опора без удаления', async t => {
    const ctx = await capture961(t, r3f11Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток.', 'R3-F11, §3.4 строка 11 и §3.7: начальная опора без удаления опускается при отсутствии конечной.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F11, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F11, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F11, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F11, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F11, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F12 guard — только конечная опора с приближением', async t => {
    const ctx = await capture961(t, r3f12Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, к месту у ориентира «сундук».', 'R3-F12, §3.4 строка 12 и §3.7: конечная опора названа при приближении.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F12, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F12, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F12, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F12, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F12, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F13 — только конечная опора с удалением', async t => {
    const ctx = await capture961(t, r3f13Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток, прочь от ориентира «сундук».', 'R3-F13, §3.4 строка 13 и §3.7: конечная опора названа при удалении.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F13, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F13, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F13, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F13, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F13, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F14 — только конечная опора без перемены расстояния', async t => {
    const ctx = await capture961(t, r3f14Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток возле ориентира «сундук».', 'R3-F14, §3.4 строка 14 и §3.7: конечная опора без перемены расстояния названа возле героя.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F14, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F14, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F14, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F14, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F14, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-F15 guard — путь без опор', async t => {
    const ctx = await capture961(t, r3f15Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл на восток.', 'R3-F15, §3.4 строка 15 и §3.7: путь без опор сохраняет простую форму.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-F15, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-F15, §3.4: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-F15, §3.4: вход не создаёт ожидания.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 0, 'R3-F15, §3.7: без событий мира нет пометок пути.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-F15, §3.7: единственный путь сохраняет порядок событий без посторонних событий.');
  });

  test('R3-B01 — вернувшийся Мирон не остаётся позади', async t => {
    const ctx = await capture961(t, r3b01Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0].includes('Позади'), false, 'R3-B01, §4.1.4 и §4.3: снова видимый в конце пути Мирон не называется позади.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-B01, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-B01, §4.1: два подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-B01, §4.1: вход не создаёт ожидания.');
    assert.equal(ctx.events.length, 3, 'R3-B01, §4.3: путь сопровождают отдельные исчезновение и появление.');
    assert.deepEqual(ctx.events.slice(1), ['По ходу пути: Существо «Мирон» больше не видно в месте сцены.', 'По ходу пути: Появилось существо «Мирон». К западу от героя — Мирон.'], 'R3-B01, §2.2–§2.3 и §4.3: исходные исчезновение и появление сохранены с пометками и в порядке событий.');
    assert.equal(ctx.events.filter(text => text.startsWith('По ходу пути: ')).length, 2, 'R3-B01, §2.3: оба события пути имеют пометку.');
    assert.equal(ctx.events[0], paths[0], 'R3-B01, §2.2: путь следует перед событиями своего отрезка.');
  });

  test('R3-B02 — два исчезновения оставляют одно имя позади', async t => {
    const ctx = await capture961(t, r3b02Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0].slice(paths[0].indexOf('Позади')), 'Позади осталось существо «Мирон».', 'R3-B02, §3.5 и §4.1.3: два исчезновения дают одно точное предложение позади.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-B02, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths[0].slice(paths[0].indexOf('Позади')).match(/Мирон/gu)?.length, 1, 'R3-B02, §3.5: имя существа указано в предложении позади один раз.');
    assert.equal(paths.length, 1, 'R3-B02, §4.1: три подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-B02, §4.1: вход не создаёт ожидания.');
    assert.equal(ctx.events.length, 2, 'R3-B02, §4.2: исчезновения поглощены, а появление и путь сохранены.');
    assert.equal(ctx.events.filter(text => text.includes('Существо «Мирон» больше не видно')).length, 0, 'R3-B02, §4.2: оба исчезновения названного позади существа поглощены.');
    assert.equal(ctx.events[1], 'По ходу пути: Появилось существо «Мирон». К западу от героя — Мирон.', 'R3-B02, §4.2: появление существа остаётся отдельным событием с исходным текстом и пометкой.');
    assert.equal(ctx.events[1].startsWith('По ходу пути: '), true, 'R3-B02, §2.3 и §4.2: появление помечено путём.');
    assert.ok(ctx.events.indexOf(ctx.events[1]) > ctx.events.indexOf(paths[0]), 'R3-B02, §2.2: появление следует после пути.');
  });

  test('R3-B03 — имена позади идут по последним исчезновениям', async t => {
    const ctx = await capture961(t, r3b03Input961());
    const paths = paths961(ctx);
    const names = paths[0].slice(paths[0].indexOf('Позади')).match(/«([^»]+)»/gu)?.map(name => name.slice(1, -1)) ?? [];
    assert.deepEqual(names, ['Лука', 'Мирон'], 'R3-B03, §3.5 и §4.2: имена позади идут по последним исчезновениям.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-B03, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths[0].slice(paths[0].indexOf('Позади')), 'Позади остались существа: «Лука», «Мирон».', 'R3-B03, §3.5: предложение позади сохраняет утверждённый порядок имён.');
    assert.equal(paths.length, 1, 'R3-B03, §4.1: пять подтверждённых шагов переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-B03, §4.1: вход не создаёт ожидания.');
    assert.equal(ctx.events.length, 2, 'R3-B03, §4.2: три исчезновения поглощены, появление и путь сохранены.');
    assert.equal(ctx.events.filter(text => text.includes('больше не видно')).length, 0, 'R3-B03, §4.2: все исчезновения названных позади существ поглощены.');
    assert.equal(ctx.events[1], 'По ходу пути: Появилось существо «Мирон». К западу от героя — Мирон.', 'R3-B03, §4.2: появление Мирона сохраняет исходный текст и пометку.');
    assert.equal(ctx.events[1].startsWith('По ходу пути: '), true, 'R3-B03, §2.3 и §4.2: появление помечено путём.');
    assert.equal(ctx.events[0], paths[0], 'R3-B03, §2.2: путь предшествует сохранённому появлению.');
  });

  test('R3-B04 — последнее расстояние исключает Мирона из позади', async t => {
    const ctx = await capture961(t, r3b04Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0].includes('Позади'), false, 'R3-B04, §4.1.3: меньшее расстояние при последнем исчезновении исключает Мирона из позади.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-B04, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths.length, 1, 'R3-B04, §4.1: три подтверждённых шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-B04, §4.1: вход не создаёт ожидания.');
    assert.equal(ctx.events.length, 4, 'R3-B04, §4.3: путь сопровождают два исчезновения и появление.');
    assert.equal(ctx.events.slice(1).filter(text => text.includes('Существо «Мирон» больше не видно')).length, 2, 'R3-B04, §4.3: оба исчезновения остаются отдельными событиями.');
    assert.deepEqual(ctx.events.slice(1).map(text => text.slice('По ходу пути: '.length)), ['Существо «Мирон» больше не видно в месте сцены.', 'Появилось существо «Мирон». К западу от героя — Мирон.', 'Существо «Мирон» больше не видно в месте сцены.'], 'R3-B04, §4.3: исходные тексты двух исчезновений и появления сохранены в исходном порядке.');
    assert.equal(ctx.events.slice(1).filter(text => text.startsWith('По ходу пути: ')).length, 3, 'R3-B04, §2.3 и §4.3: все три события пути имеют пометку.');
    assert.equal(ctx.events[0], paths[0], 'R3-B04, §2.2: путь следует перед событиями своего отрезка.');
  });

  test('R3-A01 guard — событие попытки до первого пути остаётся без пометки', async t => {
    const ctx = await capture961(t, r3a01Input961());
    const paths = paths961(ctx);
    assert.equal(ctx.events[0], 'Перемена в теле героя: нагрузки стало больше.', 'R3-A01, §2.1 и §2.4: исходное событие попытки остаётся первым и без пометки.');
    assert.equal(paths.length, 1, 'R3-A01, §2.1: подтверждённый шаг создаёт один путь.');
    assert.equal(waits961(ctx).length, 0, 'R3-A01, §2.1: вход не создаёт ожидания.');
    assert.equal(ctx.events[1], paths[0], 'R3-A01, §2.4: путь следует за событием неподтверждённой попытки.');
    assert.deepEqual(ctx.events, ['Перемена в теле героя: нагрузки стало больше.', paths[0]], 'R3-A01, §2.4: событие попытки и подтверждённый путь идут в ожидаемом порядке без лишних событий.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-A01, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
  });

  test('R3-A02 guard — событие неподтверждённого открытия остаётся между путями', async t => {
    const ctx = await capture961(t, r3a02Input961());
    const paths = paths961(ctx);
    assert.equal(ctx.events[1], 'Перемена в теле героя: нагрузки стало больше.', 'R3-A02, §1.6 и §2.5: исходное событие неподтверждённой попытки остаётся между путями без пометки.');
    assert.equal(paths.length, 2, 'R3-A02, §1.6: неподтверждённое открытие разделяет два пути.');
    assert.equal(waits961(ctx).length, 0, 'R3-A02, §1.6: вход не создаёт ожидания.');
    assert.deepEqual(ctx.events.map(text => text.startsWith('Гость прошёл') ? 'путь' : text), ['путь', 'Перемена в теле героя: нагрузки стало больше.', 'путь'], 'R3-A02, §2.5: событие без пометки сохраняет место между двумя путями.');
    assert.equal(ctx.events.some(text => text === 'Гость открыл дверь.'), false, 'R3-A02, §2.5: неподтверждённая попытка не создаёт событие открытия.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-A02, §3.6: первый путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.doesNotMatch(paths[1], r3ServiceValues961, 'R3-A02, §3.6: второй путь не содержит цифр, служебных значений или слова «отрезок».');
  });

  test('R3-Z01 — нулевое смещение с разными опорами не называет сторону света', async t => {
    const ctx = await capture961(t, r3z01Input961());
    const paths = paths961(ctx);
    assert.equal(paths[0], 'Гость прошёл возле ориентира «сундук».', 'R3-Z01, §3.1, §3.4 строка 6 и §3.7: замкнутый путь сохраняет точную форму конечной опоры без направления.');
    assert.doesNotMatch(paths[0], r3ServiceValues961, 'R3-Z01, §3.6: путь не содержит цифр, служебных значений или слова «отрезок».');
    assert.equal(paths[0].includes('на восток'), false, 'R3-Z01, §3.1: при нулевом смещении сторона света опущена.');
    assert.equal(paths.length, 1, 'R3-Z01, §3.1: два шага переданы одним путём.');
    assert.equal(waits961(ctx).length, 0, 'R3-Z01, §3.1: вход не создаёт ожидания.');
    assert.equal(ctx.events.length, 1, 'R3-Z01, §3.7: в потоке нет пометок или событий мира.');
    assert.deepEqual(ctx.events, [paths[0]], 'R3-Z01, §2.2: единственный путь сохраняет порядок событий.');
  });
}

registerV32961();
registerSynthetic961();
