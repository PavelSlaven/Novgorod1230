import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { changeFrame, fixture, readJson, red, run, setup, writeJson, writeRecording } from './fixtures/helper.mjs';

const moment = (id, from_turn, to_turn = from_turn) => ({ id, title: id, from_turn, to_turn });
const textsInPart = part => Object.values(part.packet ?? {}).flatMap(value => Array.isArray(value) ? value : []).filter(value => typeof value === 'string');
const textsInMoments = moments => moments.flatMap(value => value.parts.flatMap(textsInPart));

test('a moved known item reports its new position without repeating its description', async t => {
  const before = await source('door-before');
  const objectIndex = before.frame.objects.findIndex(entry => entry.kind === 'ground_item' && entry.item.name.includes('бревно'));
  const originalObject = before.frame.objects[objectIndex];
  assert.ok(originalObject);
  const movedPosition = [...originalObject.position];
  movedPosition[0]++;
  const objects = before.frame.objects.map((entry, index) => index === objectIndex ? { ...entry, position: movedPosition } : entry);
  const after = changeFrame(before, 'objects', objects);
  after.native_turn++;
  after.sequence++;
  const object = after.frame.objects.find(entry => entry.kind === 'ground_item' && entry.item.name.includes('бревно'));
  assert.ok(object);
  const data = await setup(t, 'moved-description-');
  const description = 'Древесина была сырой и потемневшей.';
  await writeJson(join(data, 'log.json'), { id: object.item.type, description });
  const ctx = await packets(t, [before, after], [moment('M1', before.native_turn), moment('M2', after.native_turn)], undefined, [data]);
  assert.ok(textsInPart(ctx.values[0].parts[0]).some(text => text.includes(description)));
  const changed = textsInPart(ctx.values[1].parts[0]);
  assert.ok(changed.some(text => text.includes('Положение') && text.includes('бревно')));
  assert.ok(changed.every(text => !text.includes(description)));
});

async function source(name) {
  return readJson(fixture(`${name}.json`));
}

async function packets(t, rows, moments, actions, gameData = []) {
  const dir = await setup(t, 'packets-');
  const recording = join(dir, 'recording.jsonl');
  const momentsPath = join(dir, 'moments.json');
  const output = join(dir, 'out');
  await writeRecording(recording, rows);
  await writeJson(momentsPath, moments);
  const args = ['packets', '--dir', output, '--recording', recording, '--moments', momentsPath];
  if (actions) args.push('--actions', actions);
  for (const path of gameData) args.push('--game-data', path);
  const result = run(args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { dir, output, result, values: await readJson(join(output, 'packets.json')) };
}

test('R1: packet text writes numbers as words', async t => {
  const frame = await source('courtyard');
  const identifiers = new Set();
  const collectIds = value => {
    if (typeof value === 'string' && /^[a-z][a-z0-9]*_[a-z0-9_]+$/iu.test(value)) identifiers.add(value);
    else if (Array.isArray(value)) value.forEach(collectIds);
    else if (value && typeof value === 'object') Object.values(value).forEach(collectIds);
  };
  collectIds(frame);
  const ctx = await packets(t, [frame], [moment('M1', 5212800)]);
  const values = textsInMoments(ctx.values);
  assert.ok(values.length);
  assert.ok(identifiers.size);
  await red('R1', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    const part = artifact[0].parts[0];
    const section = Object.keys(part.packet).find(key => part.packet[key].length);
    part.packet[section][0] += ' 1';
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const packetText = textsInMoments(await readJson(join(ctx.output, 'packets.json')));
  assert.ok(packetText.every(value => !/\d/u.test(value)));
  assert.ok(packetText.every(value => !/[a-z]+_[a-z_]+/iu.test(value)));
  assert.ok([...identifiers].every(id => packetText.every(value => !value.includes(id))));
  assert.ok(packetText.every(value => !/<color_/u.test(value)));
});

test('delta frame with sequence fails before writing output', async t => {
  const dir = await setup(t, 'delta-');
  const row = await source('door-before');
  row.kind = 'delta';
  const recording = join(dir, 'recording.jsonl');
  const momentsPath = join(dir, 'moments.json');
  const output = join(dir, 'out');
  await writeRecording(recording, [row]);
  await writeJson(momentsPath, [moment('M1', row.native_turn)]);
  const result = run(['packets', '--dir', output, '--recording', recording, '--moments', momentsPath]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, new RegExp(`sequence ${row.sequence}`, 'u'));
  assert.ok(!(await readdir(dir)).includes('out'));
});

test('R2: an unchanged item is not repeated in a later packet', async t => {
  const before = await source('door-before');
  const after = await source('door-after');
  const later = { ...after, native_turn: 5227220 };
  const ctx = await packets(t, [before, after, later], [moment('M1', 5227219), moment('M2', 5227220)]);
  const first = textsInMoments([ctx.values[0]]).find(value => value.includes('бревно'));
  assert.ok(first);
  await red('R2', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    const packet = artifact[1].parts[0].packet;
    const section = Object.keys(artifact[0].parts[0].packet).find(key => artifact[0].parts[0].packet[key].includes(first));
    (packet[section] ??= []).push(first);
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const artifact = await readJson(join(ctx.output, 'packets.json'));
  assert.ok(!textsInMoments([artifact[1]]).includes(first));
});

test('R3: a new scene starts with the complete packet for that frame', async t => {
  const first = await source('courtyard');
  const second = await source('inside-before-step');
  second.native_turn = 5212801;
  const ctx = await packets(t, [first, second], [moment('M1', 5212800, 5212801)]);
  const reference = await packets(t, [await source('inside-before-step')], [moment('R', 5227222)]);
  await red('R3', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    artifact[0].parts.splice(1, 1);
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const parts = (await readJson(join(ctx.output, 'packets.json')))[0].parts;
  assert.ok(parts.length >= 2);
  assert.equal(parts[1].scene_first, true);
  assert.deepEqual(parts[1].packet, reference.values[0].parts[0].packet);
});

test('consecutive movement steps are combined', async t => {
  const ctx = await packets(t, [await source('door-before'), await source('door-after'), await source('roof-entry'), await source('inside')], [moment('M1', 5227219, 5227221)], fixture('actions.jsonl'));
  const movements = textsInMoments(ctx.values).filter(value => value.startsWith('Герой прошёл '));
  assert.equal(movements.length, 1);
  assert.match(movements[0], /к северу/u);
});

test('R4: an observed open door stays an observation', async t => {
  const ctx = await packets(t, [await source('door-before'), await source('door-after')], [moment('M1', 5227219)]);
  await red('R4', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    const packet = artifact[0].parts[0].packet;
    for (const values of Object.values(packet)) {
      const index = values.findIndex(value => value.includes('открытая деревянная дверь'));
      if (index >= 0) values[index] = 'Герой открыл деревянную дверь.';
    }
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const all = textsInMoments(await readJson(join(ctx.output, 'packets.json')));
  assert.ok(all.some(value => value.includes('открытая деревянная дверь')));
  assert.ok(!all.some(value => value.includes('Герой открыл')));
});

test('R5: hero gender follows the source and creatures have no inferred gender', async t => {
  const male = await source('courtyard');
  const maleResult = await packets(t, [male], [moment('M1', male.native_turn)]);
  assert.ok(textsInMoments(maleResult.values).some(value => value.includes('Герой — мужчина.')));

  const female = changeFrame(male, 'player_state.male', false);
  const femaleResult = await packets(t, [female], [moment('M1', female.native_turn)]);
  assert.ok(textsInMoments(femaleResult.values).some(value => value.includes('Герой — женщина.')));

  const creatureResult = await packets(t, [await source('inside')], [moment('M1', 5227221)]);
  await red('R5', async () => {
    const artifact = await readJson(join(creatureResult.output, 'packets.json'));
    const packet = artifact[0].parts[0].packet;
    const creatureSection = Object.keys(packet).find(key => key === 'Люди и звери');
    packet[creatureSection][0] += ' (мужчина)';
    await writeJson(join(creatureResult.output, 'packets.json'), artifact);
  });
  const creatureFacts = textsInMoments(await readJson(join(creatureResult.output, 'packets.json')))
    .filter(value => /Жирко|зомби|хитрец/iu.test(value));
  assert.ok(creatureFacts.length);
  assert.ok(creatureFacts.every(value => !/мужчина|женщина/iu.test(value)));
});

test('R6: two same-name objects remain separate or carry a word count', async t => {
  const base = await source('door-before');
  const log = base.frame.objects.find(object => object.kind === 'ground_item' && object.item.name === 'бревно');
  const duplicate = { ...structuredClone(log), item: { ...log.item, uid: 'synthetic-log-two' } };
  const frame = changeFrame(base, 'objects', [...base.frame.objects, duplicate]);
  const ctx = await packets(t, [frame], [moment('M1', 5227219)]);
  await red('R6', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    const packet = artifact[0].parts[0].packet;
    for (const values of Object.values(packet)) {
      const count = values.findIndex(value => value.includes('бревно') && value.includes('было два'));
      if (count >= 0) { values[count] = values[count].replace('было два', 'было один'); break; }
      const lines = values.map((value, index) => ({ value, index })).filter(row => row.value.includes('бревно'));
      if (lines.length >= 2) { values.splice(lines[1].index, 1); break; }
    }
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const logs = textsInMoments(await readJson(join(ctx.output, 'packets.json'))).filter(value => value.includes('бревно'));
  assert.ok((logs.length === 2 && new Set(logs).size === 2) || (logs.length === 1 && /было два/u.test(logs[0])));
});

test('R7: removal of a pain label is reported', async t => {
  const pain = changeFrame(await source('door-before'), 'player_state.pain_label', 'Больно.');
  const after = await source('door-after');
  after.native_turn = 5227220;
  const ctx = await packets(t, [pain, after], [moment('M1', 5227219), moment('M2', 5227220)]);
  await red('R7', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    for (const values of Object.values(artifact[1].parts[0].packet)) {
      const index = values.indexOf('Боль прошла.');
      if (index >= 0) { values.splice(index, 1); break; }
    }
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const artifact = await readJson(join(ctx.output, 'packets.json'));
  assert.ok(textsInMoments([artifact[0]]).some(value => /боль/iu.test(value)));
  assert.ok(textsInMoments([artifact[1]]).includes('Боль прошла.'));
});

async function writerHistory(t) {
  const gameData = await setup(t, 'game-data-');
  const itemCharacteristic = 'Рубаха прошита синей нитью.';
  await writeJson(join(gameData, 'tunic.json'), { id: 'tunic', description: itemCharacteristic });
  const first = await source('door-before');
  const secondBase = await source('door-after');
  const secondSound = { ...secondBase.frame.sounds[0], category: 5, description: '«Не бойся, путник», — произнесли рядом.' };
  const second = changeFrame(secondBase, 'sounds', [...secondBase.frame.sounds, secondSound]);
  const thirdBase = await source('door-after');
  const thirdSound = { ...thirdBase.frame.sounds[0], category: 6, description: '«Сюда, скорее!» — донеслось из дома.' };
  const third = changeFrame(thirdBase, 'sounds', [...thirdBase.frame.sounds, thirdSound]);
  second.native_turn = 5227220;
  third.native_turn = 5227221;
  const ctx = await packets(t, [first, second, third], [
    moment('M1', 5227219),
    moment('M2', 5227220),
    moment('M3', 5227221)
  ], undefined, [gameData]);
  assert.ok(textsInMoments([ctx.values[0]]).some(value => value.includes(itemCharacteristic)));
  assert.ok(textsInMoments([ctx.values[1], ctx.values[2]]).every(value => !value.includes(itemCharacteristic)));
  await writeJson(join(ctx.output, 'M1.out.json'), { prose: 'Первый отрывок уже написан.' });
  await writeJson(join(ctx.output, 'M2.out.json'), { prose: 'Второй отрывок уже написан.' });
  return { ...ctx, itemCharacteristic };
}

test('R8: the third request retains a characteristic from the earliest scene part', async t => {
  const ctx = await writerHistory(t);
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M3']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = join(ctx.output, 'M3.req.txt');
  const characteristic = ctx.itemCharacteristic;
  await red('R8', async () => {
    const text = await readFile(request, 'utf8');
    await writeFile(request, text.replace(characteristic, ''));
  });
  const text = await readFile(request, 'utf8');
  assert.ok(text.includes(characteristic));
  assert.ok(text.includes('Второй отрывок уже написан.'));
});

test('R16: writer refuses without the previous response and writes no request', async t => {
  const first = await source('door-before');
  const later = { ...first, native_turn: 5227220 };
  const ctx = await packets(t, [first, later], [moment('M1', 5227219), moment('M2', 5227220)]);
  assert.equal(textsInPart(ctx.values[1].parts[0]).length, 0);
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M2']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /M1\.out\.json/u);
  const request = join(ctx.output, 'M2.req.txt');
  await red('R16', async () => writeFile(request, 'Ошибочный запрос без видимого результата.'));
  assert.equal(existsSync(request), false);
});

test('an action with no position change creates no movement event', async t => {
  const dir = await setup(t, 'no-movement-');
  const first = await source('door-after');
  const later = { ...first, native_turn: 5227220 };
  const actions = join(dir, 'actions.jsonl');
  await writeFile(actions, `${JSON.stringify({ native_turn: 5227220, inputs: [{ action: 'RIGHT' }] })}\n`);
  const recording = join(dir, 'recording.jsonl');
  const momentsPath = join(dir, 'moments.json');
  const output = join(dir, 'out');
  await writeRecording(recording, [first, later]);
  await writeJson(momentsPath, [moment('M1', 5227219), moment('M2', 5227220)]);
  const result = run(['packets', '--dir', output, '--recording', recording, '--moments', momentsPath, '--actions', actions]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const values = await readJson(join(output, 'packets.json'));
  assert.equal(textsInPart(values[1].parts[0]).length, 0);
});

test('writer creates a request for an empty delta when the previous response exists', async t => {
  const first = await source('door-after');
  const later = { ...first, native_turn: 5227220 };
  const ctx = await packets(t, [first, later], [moment('M1', 5227219), moment('M2', 5227220)]);
  await writeJson(join(ctx.output, 'M1.out.json'), { prose: 'Первый отрывок уже написан.' });
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M2']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(existsSync(join(ctx.output, 'M2.req.txt')), true);
});

test('G4: the second request preserves the known door description after only an opening action', async t => {
  const gameData = await setup(t, 'g4-game-data-');
  const characteristic = 'Дверь укреплена железными полосами.';
  await writeJson(join(gameData, 'door.json'), { id: 't_door_c', description: characteristic });
  const before = await source('door-before');
  const doorIndex = before.frame.objects.findIndex(object => object.kind === 'door');
  const after = changeFrame(before, `objects.${doorIndex}.state`, 'open');
  after.native_turn = 5227220;
  after.reason = 'turn';
  const dir = await setup(t, 'g4-action-');
  const actions = join(dir, 'actions.jsonl');
  await writeRecording(actions, [{ native_turn: 5227220, inputs: [{ action: 'open' }] }]);
  const ctx = await packets(t, [before, after], [moment('M1', 5227219), moment('M2', 5227220)], actions, [gameData]);
  const first = textsInMoments([ctx.values[0]]);
  const second = textsInMoments([ctx.values[1]]);
  assert.ok(first.some(value => value.includes(characteristic)));
  assert.deepEqual(second, ['Герой открыл дверь.']);
  await writeJson(join(ctx.output, 'M1.out.json'), { prose: 'Первый отрывок уже написан.' });
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M2']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = join(ctx.output, 'M2.req.txt');
  await red('G4', async () => {
    const text = await readFile(request, 'utf8');
    await writeFile(request, text.replace(characteristic, ''));
  });
  const text = await readFile(request, 'utf8');
  assert.ok(text.includes(characteristic));
  assert.ok(text.includes('Первый отрывок уже написан.'));
});

test('packet output contains no journal data', async t => {
  const ctx = await packets(t, [await source('courtyard')], [moment('M1', 5212800)]);
  const output = await readFile(join(ctx.output, 'packets.json'), 'utf8');
  assert.doesNotMatch(output, /journal|sky_diagnostic/iu);
});

test('speech categories 5 and 6 preserve exact text while category 11 stays a sound', async t => {
  const rows = [];
  for (const [category, description] of [[5, '«Не бойся, путник», — произнесли рядом.'], [6, '«Сюда, скорее!» — донеслось из дома.'], [11, 'Три удара раздались за стеной.']]) {
    const base = await source('door-after');
    const sound = { ...base.frame.sounds[0], category, description };
    rows.push(changeFrame(base, 'sounds', [...base.frame.sounds, sound]));
  }
  const ctx = await packets(t, rows, [moment('M1', 5227219)]);
  const part = ctx.values[0].parts[0];
  const section = text => Object.entries(part.packet).find(([, values]) => values.some(value => value.includes(text)))?.[0];
  const packetText = textsInPart(part);
  const speech5 = '«Не бойся, путник», — произнесли рядом.';
  const speech6 = '«Сюда, скорее!» — донеслось из дома.';
  const sound11 = 'Три удара раздались за стеной.';
  assert.equal(section(speech5), 'Речь');
  assert.equal(section(speech6), 'Речь');
  assert.equal(section(sound11), 'Звуки');
  for (const description of new Set(rows.flatMap(row => row.frame.sounds.map(sound => sound.description)))) assert.ok(packetText.some(value => value.includes(description)));
});

test('unknown actions produce a warning', async t => {
  const dir = await setup(t, 'unknown-action-');
  const original = await readFile(fixture('actions.jsonl'), 'utf8');
  const actions = join(dir, 'actions.jsonl');
  await writeFile(actions, `${original.trimEnd()}\n${JSON.stringify({ native_turn: 6000000, inputs: [{ action: 'perform_unknown' }] })}\n`);
  const recording = join(dir, 'recording.jsonl');
  const momentsPath = join(dir, 'moments.json');
  const output = join(dir, 'out');
  await writeRecording(recording, [await source('door-before')]);
  await writeJson(momentsPath, [moment('M1', 5227219)]);
  const result = run(['packets', '--dir', output, '--recording', recording, '--moments', momentsPath, '--actions', actions]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /Предупреждение: неизвестное action perform_unknown; поступок исключён/u);
});

test('items, furniture and terrain outside the hero’s overmap tile are omitted', async t => {
  const frame = await source('inside-before-step');
  const place = frame.frame.place.overmap_position;
  const [x, y, z] = frame.frame.position;
  assert.deepEqual(place, [Math.floor(x / 24), Math.floor(y / 24), z]);
  const outsideItem = frame.frame.objects.find(object => object.item?.name === '«Стрелок»');
  const outsideFurniture = frame.frame.visible_furniture.find(group => group.name === 'ромашка');
  const outsideTerrain = frame.frame.visible_terrain.find(group => group.name === 'трава' && group.positions.some(position => Math.floor(position[0] / 24) !== place[0] || Math.floor(position[1] / 24) !== place[1]));
  assert.ok(outsideItem && Math.floor(outsideItem.position[1] / 24) !== place[1]);
  assert.ok(outsideFurniture && Math.floor(outsideFurniture.positions[0][1] / 24) !== place[1]);
  assert.ok(outsideTerrain);
  const ctx = await packets(t, [frame], [moment('M1', 5227222)]);
  await red('outside-omt-object-is-filtered', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    (artifact[0].parts[0].packet['Вещи вокруг'] ??= []).push('К югу от героя — «Стрелок».');
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const text = textsInMoments(await readJson(join(ctx.output, 'packets.json')));
  assert.ok(text.some(value => value.includes('бревно')));
  assert.ok(text.some(value => value.includes('печь')));
  assert.ok(text.some(value => value.includes('пол')));
  assert.ok(text.every(value => !value.includes('«Стрелок»')));
  assert.ok(text.every(value => !value.includes('ромашка')));
  assert.ok(text.every(value => !value.includes('трава')));
});

test('creatures outside the hero’s overmap tile remain at a distance', async t => {
  const outside = await source('door-before');
  const inside = await source('inside-before-step');
  const ctx = await packets(t, [outside, inside], [moment('M1', 5227219, 5227222)]);
  await red('distant-creature-is-retained', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    for (const values of Object.values(artifact[0].parts[0].packet)) {
      const index = values.findIndex(value => value.includes('гниль-вейлер'));
      if (index >= 0) { values.splice(index, 1); break; }
    }
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const text = textsInMoments(await readJson(join(ctx.output, 'packets.json')));
  const distant = text.find(value => value.includes('гниль-вейлер'));
  const nearby = text.find(value => value.includes('Жирко'));
  assert.ok(distant);
  assert.match(distant, /вдали/iu);
  assert.match(distant, /запад/iu);
  assert.ok(nearby);
  assert.ok(!/вдали/iu.test(nearby));
});

test('identical facts in a field are grouped with a count written in words', async t => {
  const base = await source('door-before');
  const log = base.frame.objects.find(object => object.kind === 'ground_item' && object.item.name === 'бревно');
  const duplicate = { ...structuredClone(log), item: { ...log.item, uid: 'synthetic-counted-log' } };
  const frame = changeFrame(base, 'objects', [...base.frame.objects, duplicate]);
  const ctx = await packets(t, [frame], [moment('M1', 5227219)]);
  await red('identical-facts-are-counted-in-words', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    const section = artifact[0].parts[0].packet['Вещи вокруг'];
    const index = section.findIndex(value => value.includes('бревно'));
    const line = section[index].replace(' Таких предметов было два.', '');
    section.splice(index, 1, line, line);
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const logs = textsInMoments(await readJson(join(ctx.output, 'packets.json'))).filter(value => value.includes('бревно'));
  assert.equal(logs.length, 1);
  assert.match(logs[0], /К востоку от героя — бревно\./u);
  assert.match(logs[0], /Таких предметов было два\./u);
});

test('a hero step does not report an item moved when its absolute position is stable', async t => {
  const before = await source('inside-before-step');
  const after = await source('inside-after-step');
  after.native_turn = 5227223;
  const itemBefore = before.frame.objects.find(object => object.item?.uid === '1835');
  const itemAfter = after.frame.objects.find(object => object.item?.uid === '1835');
  assert.deepEqual(itemBefore.position, itemAfter.position);
  assert.notEqual(itemBefore.direction, itemAfter.direction);
  const ctx = await packets(t, [before, after], [moment('M1', 5227222), moment('M2', 5227223)]);
  await red('hero-step-is-not-item-movement', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    (artifact[1].parts[0].packet.События ??= []).push('Положение предмета «кресало» изменилось.');
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const events = (await readJson(join(ctx.output, 'packets.json')))[1].parts[0].packet.События ?? [];
  assert.ok(events.every(value => !(value.includes('кресало') && /Положение|состояние/iu.test(value))));
});

test('an item leaving view is not reported as a disappearance', async t => {
  const before = await source('inside-before-step');
  const after = await source('inside-after-step');
  after.native_turn = 5227223;
  const log = before.frame.objects.find(object => object.item?.uid === '1865');
  const visibleCells = new Set(after.frame.visible_terrain.flatMap(group => group.positions.map(position => JSON.stringify(position))));
  assert.ok(log);
  assert.ok(!visibleCells.has(JSON.stringify(log.position)));
  const ctx = await packets(t, [before, after], [moment('M1', 5227222), moment('M2', 5227223)]);
  await red('loss-of-sight-is-not-disappearance', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    (artifact[1].parts[0].packet.События ??= []).push('Бревно больше не видно.');
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  assert.ok(textsInMoments([ctx.values[0]]).some(value => value.includes('бревно')));
  assert.ok(textsInPart((await readJson(join(ctx.output, 'packets.json')))[1].parts[0]).every(value => !/бревно/iu.test(value)));
});

test('an item removed from a visible cell is reported as a disappearance', async t => {
  const before = await source('inside-after-step');
  const index = before.frame.objects.findIndex(object => object.item?.uid === '1835');
  const removed = before.frame.objects[index];
  const visibleCells = new Set(before.frame.visible_terrain.flatMap(group => group.positions.map(position => JSON.stringify(position))));
  assert.ok(visibleCells.has(JSON.stringify(removed.position)));
  const after = changeFrame(before, 'objects', before.frame.objects.filter((_, objectIndex) => objectIndex !== index));
  after.native_turn = 5227223;
  const ctx = await packets(t, [before, after], [moment('M1', 5227222), moment('M2', 5227223)]);
  await red('visible-cell-item-removal-is-reported', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    const events = artifact[1].parts[0].packet.События;
    const index = events.findIndex(value => value.includes('кресало') && value.includes('больше не видно'));
    if (index >= 0) events.splice(index, 1);
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  assert.ok(textsInPart(ctx.values[0].parts[0]).some(value => value.includes('кресало')));
  assert.ok(textsInPart((await readJson(join(ctx.output, 'packets.json')))[1].parts[0]).some(value => value.includes('кресало') && value.includes('больше не видно')));
});

test('packet facts use Russian sentences instead of key-value pairs', async t => {
  const ctx = await packets(t, [await source('door-before')], [moment('M1', 5227219)]);
  await red('packet-sentences-have-no-key-value-pairs', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    (artifact[0].parts[0].packet.Место ??= []).push('Место: двор; Погода: ливень.');
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const pair = /[\p{L}_]+:\s*[^;]+;\s*[\p{L}_]+:/u;
  assert.ok(textsInMoments(await readJson(join(ctx.output, 'packets.json'))).every(value => !pair.test(value)));
});

test('nested item contents are written without the CDDA separator', async t => {
  const base = await source('inside-before-step');
  const nestedItem = {
    kind: 'ground_item', position: [301, 2749, 0], distance: 1, direction: 'юго-восток',
    item: { uid: 'nested-belt-test', type: 'belt', name: 'кожаный пояс > долото' }
  };
  const frame = changeFrame(base, 'objects', [...base.frame.objects, nestedItem]);
  const ctx = await packets(t, [frame], [moment('M1', 5227222)]);
  await red('nested-items-use-words', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    (artifact[0].parts[0].packet['Вещи вокруг'] ??= []).push('На кожаном поясе > долото.');
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const text = textsInMoments(await readJson(join(ctx.output, 'packets.json')));
  assert.ok(text.some(value => value.includes('кожаный пояс') && value.includes('долото')));
  assert.ok(text.every(value => !value.includes('>')));
});

test('visible terrain describes its nearest filtered cell without a cell count', async t => {
  const frame = await source('inside-before-step');
  const ctx = await packets(t, [frame], [moment('M1', 5227222)]);
  await red('terrain-uses-nearest-filtered-cell', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    const terrain = artifact[0].parts[0].packet['Видимая местность'];
    terrain.push('Видимых участков было шестьдесят.');
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const terrain = (await readJson(join(ctx.output, 'packets.json')))[0].parts[0].packet['Видимая местность'];
  assert.ok(terrain.includes('К югу от героя — открытая деревянная дверь.'));
  assert.ok(terrain.includes('Под ногами героя — пол.'));
  assert.ok(terrain.every(value => !/\d|видимых участков|стало/iu.test(value)));
});

test('a newly seen item is a field fact rather than an event', async t => {
  const before = await source('inside-before-step');
  const base = await source('inside-after-step');
  const after = changeFrame(base, 'objects', [...base.frame.objects, {
    kind: 'ground_item', position: [301, 2749, 0], distance: 1, direction: 'юго-восток',
    item: { uid: 'new-bag-test', type: 'sack', name: 'синий мешочек' }
  }]);
  after.native_turn = 5227223;
  const ctx = await packets(t, [before, after], [moment('M1', 5227222), moment('M2', 5227223)]);
  await red('new-item-appears-in-fields', async () => {
    const artifact = await readJson(join(ctx.output, 'packets.json'));
    (artifact[1].parts[0].packet.События ??= []).push('Появился синий мешочек.');
    await writeJson(join(ctx.output, 'packets.json'), artifact);
  });
  const part = (await readJson(join(ctx.output, 'packets.json')))[1].parts[0];
  assert.ok((part.packet['Вещи вокруг'] ?? []).some(value => value.includes('синий мешочек')));
  assert.ok((part.packet.События ?? []).every(value => !value.includes('синий мешочек')));
});

async function writerAcrossScenes(t) {
  const first = await source('courtyard');
  const sceneSound = 'Скрипнула калитка.';
  const changedFirst = changeFrame(first, 'sounds', [...first.frame.sounds, {
    position: first.frame.position, description: sceneSound, category: 4, heard_volume: 1, ambient: false
  }]);
  changedFirst.native_turn = 5212801;
  const sceneStart = await source('inside-before-step');
  sceneStart.native_turn = 5227222;
  const sceneUpdateBase = await source('inside-after-step');
  const currentSound = 'Скрипнул порог.';
  const sceneUpdate = changeFrame(sceneUpdateBase, 'sounds', [...sceneUpdateBase.frame.sounds, {
    position: sceneUpdateBase.frame.position, description: currentSound, category: 4, heard_volume: 1, ambient: false
  }]);
  sceneUpdate.native_turn = 5227223;
  const ctx = await packets(t, [first, changedFirst, sceneStart, sceneUpdate], [
    moment('M1', 5212800),
    moment('M2', 5212801, 5227222),
    moment('M3', 5227223)
  ]);
  await writeJson(join(ctx.output, 'M1.out.json'), { prose: 'Первый отрывок уже написан.' });
  await writeJson(join(ctx.output, 'M2.out.json'), { prose: 'Второй отрывок уже написан.' });
  return { ...ctx, sceneSound, currentSound };
}

test('writer request for the third moment contains only earlier parts from its scene', async t => {
  const ctx = await writerAcrossScenes(t);
  const second = ctx.values[1].parts;
  const third = ctx.values[2].parts;
  assert.equal(second.length, 2);
  assert.notEqual(second[0].scene_id, second[1].scene_id);
  assert.equal(third[0].scene_id, second[1].scene_id);
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M3']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = join(ctx.output, 'M3.req.txt');
  await red('writer-prior-parts-stay-in-scene', async () => {
    const text = await readFile(request, 'utf8');
    await writeFile(request, `${text}\nдикий коп`);
  });
  const text = await readFile(request, 'utf8');
  assert.ok(text.includes('Жирко'));
  assert.ok(text.includes(ctx.currentSound));
  assert.ok(!text.includes('дикий коп'));
});

test('writer request labels earlier scene facts', async t => {
  const ctx = await writerAcrossScenes(t);
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M3']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = join(ctx.output, 'M3.req.txt');
  await red('writer-labels-earlier-scene-facts', async () => {
    const text = await readFile(request, 'utf8');
    await writeFile(request, text.replace('Прежние сведения этой сцены:', ''));
  });
  assert.ok((await readFile(request, 'utf8')).includes('Прежние сведения этой сцены:'));
});

test('writer request labels the previous prose as non-factual', async t => {
  const ctx = await writerAcrossScenes(t);
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M3']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = join(ctx.output, 'M3.req.txt');
  const label = 'Предыдущий отрывок — не источник фактов:';
  await red('writer-labels-previous-prose', async () => {
    const text = await readFile(request, 'utf8');
    await writeFile(request, text.replace(label, ''));
  });
  assert.ok((await readFile(request, 'utf8')).includes(label));
});

test('writer rejects whitespace-only previous prose', async t => {
  const ctx = await writerAcrossScenes(t);
  const previous = join(ctx.output, 'M2.out.json');
  await writeJson(previous, { prose: '   ' });
  await red('writer-rejects-empty-prose', async () => writeJson(previous, { prose: 'Второй отрывок уже написан.' }));
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M3']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /M2\.out\.json: поле prose пустое/u);
  assert.equal(existsSync(join(ctx.output, 'M3.req.txt')), false);
});

test('writer rejects an unknown moment without writing a request', async t => {
  const ctx = await writerAcrossScenes(t);
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M9']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /В packets\.json нет момента M9/u);
  const request = join(ctx.output, 'M9.req.txt');
  await red('writer-rejects-unknown-moment', async () => writeFile(request, 'Ошибочный запрос для неизвестного момента.'));
  assert.equal(existsSync(request), false);
});

test('writer-system template is inserted literally', async t => {
  const ctx = await writerAcrossScenes(t);
  const template = await readFile(fixture('../../templates/writer-system.md'), 'utf8');
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M3']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = join(ctx.output, 'M3.req.txt');
  await red('writer-system-template-is-literal', async () => {
    const text = await readFile(request, 'utf8');
    await writeFile(request, text.replace(template, template.slice(1)));
  });
  assert.ok((await readFile(request, 'utf8')).includes(template));
});

test('writer-task template is inserted literally', async t => {
  const ctx = await writerAcrossScenes(t);
  const template = await readFile(fixture('../../templates/writer-task.md'), 'utf8');
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M3']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = join(ctx.output, 'M3.req.txt');
  await red('writer-task-template-is-literal', async () => {
    const text = await readFile(request, 'utf8');
    await writeFile(request, text.replace(template, template.slice(1)));
  });
  assert.ok((await readFile(request, 'utf8')).includes(template));
});

test('writer request includes every part of the current moment', async t => {
  const ctx = await writerAcrossScenes(t);
  const parts = ctx.values[1].parts;
  assert.equal(parts.length, 2);
  const result = run(['writer', '--dir', ctx.output, '--moment', 'M2']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const request = join(ctx.output, 'M2.req.txt');
  await red('writer-includes-all-current-parts', async () => {
    const text = await readFile(request, 'utf8');
    await writeFile(request, text.replace(ctx.sceneSound, ''));
  });
  const text = await readFile(request, 'utf8');
  assert.ok(text.includes('Части текущего момента:'));
  assert.ok(text.includes(ctx.sceneSound));
  assert.ok(text.includes('печь'));
});
