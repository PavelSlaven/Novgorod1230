import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, readJson, run, setup, writeJson, writeRecording } from './fixtures/helper.mjs';

async function rowsFrom(name, hero = true) {
  const rows = (await readFile(fixture(name), 'utf8')).trim().split(/\r?\n/u).map(line => JSON.parse(line));
  if (hero) for (const row of rows) {
    const payload = row.kind === 'full' ? row.frame : row.changes;
    if (payload.player_state) payload.player_state = { ...payload.player_state, name: 'Гость', male: true };
  }
  return rows;
}

async function capture(t, rows, options = {}) {
  const dir = await setup(t, 'live-');
  const recording = join(dir, 'perception.jsonl');
  const moments = join(dir, 'moments.json');
  const out = join(dir, 'out');
  await writeRecording(recording, rows);
  await writeJson(moments, options.moments ?? [{ id: 'M1', title: 'Наблюдение', from_turn: Math.min(...rows.map(row => row.native_turn)), to_turn: Math.max(...rows.map(row => row.native_turn)) }]);
  const data = join(dir, 'data');
  await writeJson(join(data, 'items.json'), [...(await readJson(fixture('visit-31c-items.json'))), ...(options.gameData ?? [])]);
  const args = ['packets', '--dir', out, '--recording', recording, '--moments', moments, '--game-data', data];
  if (options.actions) {
    const actions = join(dir, 'turns.jsonl');
    await writeRecording(actions, options.actions);
    args.push('--actions', actions);
  }
  if (options.descriptions) {
    const descriptions = join(dir, 'descriptions.jsonl');
    await writeRecording(descriptions, options.descriptions);
    args.push('--descriptions', descriptions);
  }
  const result = run(args);
  return { result, out, values: result.status === 0 ? await readJson(join(out, 'packets.json')) : undefined };
}

const texts = values => values.flatMap(moment => moment.parts.flatMap(part => Object.values(part.packet).flat()));
const passed = ctx => assert.equal(ctx.result.status, 0, ctx.result.stderr || ctx.result.stdout);

test('live full and delta records are restored in sequence order', async t => {
  const rows = await rowsFrom('visit-31c.jsonl');
  const selected = [31, 7, 30, 6].map(sequence => rows.find(row => row.sequence === sequence));
  assert.ok(selected.every(Boolean));
  const ctx = await capture(t, selected);
  passed(ctx);
  assert.ok(texts(ctx.values).some(text => text.includes('Имя героя — Гость.')));
  const first = selected.find(row => row.sequence === 6).frame;
  assert.ok(texts(ctx.values).some(text => text.includes(first.place.name)));
  assert.ok(texts(ctx.values).some(text => text.includes('Прокша')));
});

test('delta replaces arrays and null fields without retaining the old state', async t => {
  const rows = await rowsFrom('visit-31c.jsonl');
  const base = structuredClone(rows.find(row => row.kind === 'full'));
  const delta = { ...rows.find(row => row.kind === 'delta'), sequence: base.sequence + 1, native_turn: base.native_turn,
    changes: { inventory: [], creatures: [], weather: null, player_state: { ...base.frame.player_state, wielded: null } } };
  const ctx = await capture(t, [base, delta]);
  passed(ctx);
  const packet = ctx.values[0].parts[0].packet;
  assert.equal(packet['Люди и звери'], undefined);
  assert.equal(packet.Погода, undefined);
  assert.equal(packet['При себе'], undefined);
  const events = packet.События ?? [];
  assert.ok(events.some(text => text.includes('Появилось существо «Прокша»')));
  assert.ok(events.some(text => text.includes('Прокша') && text.includes('больше не видно')));
});

test('invalid live records fail before writing packets', async t => {
  const rows = await rowsFrom('visit-31c.jsonl');
  const base = rows.find(row => row.kind === 'full');
  const delta = rows.find(row => row.kind === 'delta');
  const missingMale = { ...delta, changes: { player_state: { name: 'Гость' } } };
  for (const [name, recording, message] of [
    ['orphan delta', [delta], /delta.*full/u],
    ['unknown kind', [base, { ...delta, kind: 'changes' }], /kind/u],
    ['replaced player state without male', [base, missingMale], /player_state\.male/u]
  ]) await t.test(name, async child => {
    const ctx = await capture(child, recording);
    assert.notEqual(ctx.result.status, 0);
    assert.match(ctx.result.stderr, message);
    assert.ok(!existsSync(ctx.out));
  });
});

test('sounds from an intermediate frame survive a cleared final buffer', async t => {
  const rows = await rowsFrom('visit-31c.jsonl');
  const base = structuredClone(rows.find(row => row.kind === 'full'));
  const sound = rows.flatMap(row => (row.frame ?? row.changes).sounds ?? [])[0];
  assert.ok(sound);
  base.frame.sounds = [sound];
  const delta = { sequence: base.sequence + 1, native_turn: base.native_turn, kind: 'delta', reason: 'turn', changes: { sounds: [] } };
  const ctx = await capture(t, [base, delta]);
  passed(ctx);
  assert.equal(texts(ctx.values).filter(text => text.includes(`«${sound.description}»`)).length, 1);
});

test('recorded descriptions use kind and type and never fall back to game data', async t => {
  const rows = await rowsFrom('visit-31c.jsonl');
  const base = rows.find(row => row.sequence === 30);
  const descriptions = await rowsFrom('visit-31c-descriptions.jsonl', false);
  const soil = descriptions.find(row => row.kind === 'terrain' && row.type === 't_dirt');
  const panels = descriptions.filter(row => row.kind === 'npc');
  assert.ok(soil);
  assert.ok(panels.length && panels.some(row => row.text.includes('Надето:')));
  const gameData = [{ id: soil.type, description: 'English text must stay outside the packet.' },
    ...panels.map(row => ({ type: 'npc', id: row.type, description: 'English NPC description must stay outside the packet.' }))];
  const ctx = await capture(t, [base], { descriptions: [soil, { ...soil, kind: 'item', text: 'Чужое описание другого вида.' }, ...panels], gameData });
  passed(ctx);
  assert.ok(texts(ctx.values).some(text => text.includes('Это земля.')));
  assert.ok(texts(ctx.values).every(text => !text.includes('English text') && !text.includes('English NPC') && !text.includes('Чужое описание')));
  assert.doesNotMatch(texts(ctx.values).join('\n'), /Надето:|В лагере|\|\|\|/u);
  for (const creature of base.frame.creatures) assert.ok(texts(ctx.values).some(text => text.includes(creature.name)));
  assert.doesNotMatch(ctx.result.stderr, /нет описания npc\//u);
  const missing = await capture(t, [base], { descriptions: [], gameData });
  passed(missing);
  assert.match(missing.result.stderr, /terrain\/t_dirt/u);
  assert.doesNotMatch(missing.result.stderr, /нет описания npc\//u);
  assert.ok(texts(missing.values).every(text => !text.includes('English text') && !text.includes('Это земля.')));
});

test('all eight step directions use recorded movement and hero gender', async t => {
  const rows = await rowsFrom('visit-31c.jsonl');
  const base = rows.find(row => row.sequence === 30);
  const actions = await rowsFrom('visit-31c-actions.jsonl', false);
  const source = actions.find(row => row.inputs.some(input => input.action === 'RIGHTUP'));
  for (const [action, x, y, direction] of [
    ['UP', 0, -1, 'на север'], ['DOWN', 0, 1, 'на юг'], ['LEFT', -1, 0, 'на запад'], ['RIGHT', 1, 0, 'на восток'],
    ['RIGHTUP', 1, -1, 'на северо-восток'], ['RIGHTDOWN', 1, 1, 'на юго-восток'], ['LEFTUP', -1, -1, 'на северо-запад'], ['LEFTDOWN', -1, 1, 'на юго-запад']
  ]) await t.test(action, async child => {
    const before = structuredClone(base);
    before.frame.player_state = { ...before.frame.player_state, name: 'Гостья', male: false };
    const after = structuredClone(before);
    after.sequence++;
    after.native_turn++;
    after.reason = 'turn';
    after.frame.position = [before.frame.position[0] + x, before.frame.position[1] + y, before.frame.position[2]];
    const input = { ...source, native_turn: after.native_turn, inputs: [{ ...source.inputs[0], action }] };
    const ctx = await capture(child, [before, after], { actions: [input] });
    passed(ctx);
    assert.ok(texts(ctx.values).includes(`Гостья прошла один шаг ${direction}.`));
    assert.doesNotMatch(ctx.result.stderr, /поступок исключён/u);
  });
});

test('the recorded visit retains all ten waits as six hundred calendar seconds', async t => {
  const rows = (await rowsFrom('visit-31c.jsonl')).filter(row => row.kind === 'full');
  const actions = await rowsFrom('visit-31c-actions.jsonl', false);
  const ctx = await capture(t, rows, { actions });
  passed(ctx);
  assert.equal(texts(ctx.values).filter(text => text.includes('ждал на месте')).length, 1);
  assert.ok(texts(ctx.values).includes('Гость ждал на месте десять минут.'));
  assert.doesNotMatch(ctx.result.stderr, /поступок исключён/u);
  const waits = actions.filter(row => row.inputs.some(input => input.action === 'wait'));
  const bounded = await capture(t, rows, { actions, moments: [{ id: 'M1', title: 'Первые пять минут', from_turn: waits[0].native_turn, to_turn: waits[5].native_turn }] });
  passed(bounded);
  assert.ok(texts(bounded.values).includes('Гость ждал на месте пять минут.'));
});

test('hero steps keep an intervening NPC disappearance in order', async t => {
  const rows = (await rowsFrom('visit-31c.jsonl')).filter(row => [650, 652, 655].includes(row.sequence));
  const actions = (await rowsFrom('visit-31c-actions.jsonl', false)).filter(row => [13072217, 13072219].includes(row.native_turn));
  const ctx = await capture(t, rows, { actions });
  passed(ctx);
  const events = ctx.values.flatMap(moment => moment.parts.flatMap(part => part.packet.События ?? []));
  const steps = events.flatMap((text, index) => text === 'Гость прошёл один шаг на северо-запад.' ? [index] : []);
  assert.equal(steps.length, 2);
  const disappearance = events.findIndex(text => text.includes('Жирко') && text.includes('больше не видно'));
  assert.ok(steps[0] < disappearance && disappearance < steps[1]);
});

test('two adjacent hero steps combine without an intervening event', async t => {
  const before = structuredClone((await rowsFrom('visit-31c.jsonl')).find(row => row.sequence === 30));
  const first = structuredClone(before);
  first.sequence++;
  first.native_turn++;
  first.reason = 'turn';
  first.frame.position[1]--;
  const second = structuredClone(first);
  second.sequence++;
  second.native_turn++;
  second.frame.position[1]--;
  const actions = [first, second].map(row => ({ native_turn: row.native_turn, inputs: [{ action: 'UP' }] }));
  const ctx = await capture(t, [before, first, second], { actions });
  passed(ctx);
  assert.deepEqual(texts(ctx.values).filter(text => text.startsWith('Гость прошёл ')), ['Гость прошёл два шага на север.']);
});

test('a day of waiting uses calendar seconds rather than the number of frames', async t => {
  const rows = await rowsFrom('visit-31c.jsonl');
  const actions = await rowsFrom('visit-31c-actions.jsonl', false);
  const before = structuredClone(rows.find(row => row.sequence === 30));
  const after = structuredClone(before);
  after.sequence++;
  after.native_turn += 86400;
  after.reason = 'turn';
  after.frame.clock.date_time = after.frame.clock.date_time.replace('20 Авг', '21 Авг');
  after.frame.position = [before.frame.position[0] - 1, before.frame.position[1] + 1, before.frame.position[2]];
  const wait = { ...actions.find(row => row.inputs.some(input => input.action === 'wait')), native_turn: before.native_turn };
  const leave = { ...actions.find(row => row.inputs.some(input => input.action === 'LEFTDOWN')), native_turn: after.native_turn };
  const ctx = await capture(t, [before, after], { actions: [wait, leave] });
  passed(ctx);
  assert.ok(texts(ctx.values).includes('Гость ждал на месте один день.'));
});

test('an open action requires an observed open door', async t => {
  const rows = await rowsFrom('visit-31c.jsonl');
  const before = structuredClone(rows.find(row => row.kind === 'full' && row.frame.objects.some(object => object.kind === 'door' && object.state === 'closed')));
  assert.ok(before);
  const after = structuredClone(before);
  after.sequence++;
  after.native_turn++;
  after.reason = 'turn';
  const door = after.frame.objects.find(object => object.kind === 'door' && object.state === 'closed');
  door.state = 'open';
  const action = { native_turn: after.native_turn, inputs: [{ action: 'open' }] };
  const ctx = await capture(t, [before, after], { actions: [action] });
  passed(ctx);
  assert.ok(texts(ctx.values).includes('Гость открыл дверь.'));
  assert.doesNotMatch(ctx.result.stderr, /поступок исключён/u);
  const unchanged = { ...structuredClone(before), sequence: after.sequence, native_turn: after.native_turn, reason: 'turn' };
  const blocked = await capture(t, [before, unchanged], { actions: [action] });
  passed(blocked);
  assert.ok(!texts(blocked.values).some(text => text.includes('открыл дверь')));
});

test('activity events compare only the final states of adjacent native turns', async t => {
  const source = (await rowsFrom('visit-31c.jsonl')).find(row => row.kind === 'full');
  const base = structuredClone(source);
  base.frame.player_state.activity_label = 'Нет';
  const state = (sequence, native_turn, label, reason = 'turn') => ({ ...base, sequence, native_turn, reason, frame: { ...base.frame, player_state: { ...base.frame.player_state, activity_label: label } } });
  const ctx = await capture(t, [base,
    state(base.sequence + 1, base.native_turn, 'Умеренная'),
    state(base.sequence + 2, base.native_turn, 'Нет', 'input'),
    state(base.sequence + 3, base.native_turn + 1, 'Умеренная'),
    state(base.sequence + 4, base.native_turn + 2, 'Умеренная')]);
  passed(ctx);
  assert.deepEqual(texts(ctx.values).filter(text => /[Нн]агрузка|нагрузка/u.test(text)), ['Нагрузка героя описывалась словом «умеренная».']);
});

test('recorded clothing keeps one item and names its associated contents once', async t => {
  const rows = (await rowsFrom('visit-31c.jsonl')).filter(row => row.kind === 'full');
  const ctx = await capture(t, rows);
  passed(ctx);
  const text = texts(ctx.values).join('\n');
  assert.match(text, /порты/u);
  assert.match(text, /При вещи «кожаный пояс» было долото\./u);
  assert.doesNotMatch(text, /При предмете|четыре предмета|4 предмета|>/u);
});
