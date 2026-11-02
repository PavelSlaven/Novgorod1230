import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, readJson, red, run, setup, writeJson } from './fixtures/helper.mjs';

function assertCliOk(result) {
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

async function prepare(t, prefix, { multipleMoments = false } = {}) {
  const dir = await setup(t, prefix);
  const packets = [{
    id: 'M1',
    title: 'У ворот',
    from_turn: 1,
    to_turn: 1,
    parts: [{ scene_id: 'S1', scene_first: true, packet: { 'Сведения': ['Каменные ворота стояли перед двором.'] }, events: [] }]
  }];
  await writeJson(join(dir, 'M1.out.json'), { prose: 'Мстислав подошёл к воротам.' });
  if (multipleMoments) {
    packets.push({
      id: 'M2',
      title: 'У стены',
      from_turn: 2,
      to_turn: 2,
      parts: [{ scene_id: 'S2', scene_first: true, packet: { 'Сведения': ['У стены лежал плащ.'] }, events: [] }]
    });
    await writeJson(join(dir, 'M2.out.json'), { prose: 'Ветер тронул край плаща.' });
    packets.push({
      id: 'M3',
      title: 'У колодца',
      from_turn: 3,
      to_turn: 3,
      parts: [{ scene_id: 'S3', scene_first: true, packet: { 'Сведения': ['К колодцу вела узкая тропа.'] }, events: [] }]
    });
    await writeJson(join(dir, 'M3.out.json'), { prose: 'Тропа уходила к колодцу.' });
  }
  await writeJson(join(dir, 'packets.json'), packets);
  return { dir, anchors: fixture('summary-anchor.json') };
}

function generate(scene, seed) {
  const result = run(['judges', '--dir', scene.dir, '--anchors', scene.anchors, '--judges', '3', '--seed', String(seed)]);
  assertCliOk(result);
}

async function snapshot(scene) {
  const files = ['judge-key.json', 'judge-response.schema.json', 'judge1-pack.md', 'judge2-pack.md', 'judge3-pack.md'];
  return Object.fromEntries(await Promise.all(files.map(async name => [name, await readFile(join(scene.dir, name), 'utf8')])));
}

function assertKeyShared(pack, key) {
  const expected = Object.keys(key.texts).sort();
  for (const name of ['judge1-pack.md', 'judge2-pack.md', 'judge3-pack.md']) {
    const actual = [...pack[name].matchAll(/^## (T\d+)$/gmu)].map(match => match[1]).sort();
    assert.deepEqual(actual, expected, `${name} должен использовать все blind_id из общего judge-key.json`);
  }
}

function paragraph(section, prefix) {
  const result = section.split(/\r?\n\s*\r?\n/u).find(value => value.startsWith(prefix));
  assert.ok(result, `Не найден нормативный абзац «${prefix}»`);
  return result;
}

function lineFeeds(value) {
  return value.replace(/\r\n?/gu, '\n');
}

function textOrder(pack) {
  return [...pack.matchAll(/^## (T\d+)$/gmu)].map(match => match[1]);
}

function factsFor(pack, blindId) {
  const header = `## ${blindId}\n\n### Основание\n\n`;
  const start = pack.indexOf(header);
  assert.notEqual(start, -1, `В пакете нет основания ${blindId}`);
  const bodyStart = start + header.length;
  const end = pack.indexOf('\n\n### Текст\n\n', bodyStart);
  assert.notEqual(end, -1, `В пакете нет текста ${blindId}`);
  return pack.slice(bodyStart, end);
}

const classText = `- **свободно** — деталь, которую норма разрешает без данных (§4.7, строки 199–207; §3, строка 71): фон природы и быта по поре, времени суток, погоде и месту; ощущения героя от среды; мысли и чувства героя; непроизвольные движения; оттенок и фактура вещи в пределах её переданных характеристик.
- **нужна характеристика** — деталь мира, которой нет в сведениях, но которая стала бы законной, если бы данные мира её содержали: чем занят человек, где лежит вещь относительно героя, свет внутри, материал и состояние вещи, облик человека — любая характеристика из пунктов #894 ниже. У такой выдумки обязателен пункт #894 (1–10).
- **нарушение** — то, что нельзя и при полных данных: поступок или решение героя, которых нет в сведениях; мысли и намерения других людей и зверей как факт; противоречие сведениям; число или содержимое вещей сверх сведений.`;

const characteristicItems = `1. Чем занят человек сейчас — с позой и видимым откликом на героя.
2. Положение вещей словами и свет на месте героя.
3. Постройки, помещения, места и местность.
4. Материал, облик и состояние вещей и одежды.
5. Облик человека.
6. Знакомство и память героя; события мира в пакете.
7. Звук с источником, направлением и расстоянием.
8. Услышанная речь.
9. Манера человека.
10. Запахи.`;

const d186Text = `Для каждого текста также передай:

- dislike — от одной до трёх вещей, которые мешают; для каждой what и дословная quote;
- improve — от одной до трёх правок в пределах переданных фактов, без новых фактов мира;
- missing_facts — каких сведений не хватило, если текст нельзя улучшить без новых фактов; если таких сведений нет, пустой массив.

На весь набор передай improve_general — от трёх до пяти правил писателю. Пустые списки выдумок допустимы. Отметки и оценки относятся к тексту, а не к качеству основания. Не исправляй исходный текст перед цитированием.`;

test('G3: одинаковый seed воспроизводит все файлы, разные seed меняют раскладку судей', async t => {
  const scene = await prepare(t, 'judges-g3', { multipleMoments: true });
  generate(scene, 7);
  const first = await snapshot(scene);
  const key7 = JSON.parse(first['judge-key.json']);
  assert.deepEqual(Object.keys(key7).sort(), ['anchors', 'judges', 'seed', 'texts']);
  assert.equal(key7.seed, 7);
  assert.equal(key7.judges, 3);
  assert.deepEqual(Object.keys(key7.texts).sort(), ['T01', 'T02', 'T03', 'T04']);
  const initialOrders = ['judge1-pack.md', 'judge2-pack.md', 'judge3-pack.md'].map(name => textOrder(first[name]).join(','));
  assert.ok(new Set(initialOrders).size > 1, 'номер судьи должен менять порядок текстов при общем seed');
  generate(scene, 7);
  await red('G3', async () => {
    const path = join(scene.dir, 'judge2-pack.md');
    await writeFile(path, `${await readFile(path, 'utf8')} `);
  });
  const repeated = await snapshot(scene);
  assert.deepEqual(repeated, first);
  assertKeyShared(repeated, key7);
  generate(scene, 8);
  const changed = await snapshot(scene);
  assert.equal(JSON.parse(changed['judge-key.json']).seed, 8);
  const changedPacks = ['judge1-pack.md', 'judge2-pack.md', 'judge3-pack.md'].filter(name => changed[name] !== repeated[name]);
  assert.ok(changedPacks.length > 0, 'seed 8 должен менять порядок хотя бы в одном пакете');
  assertKeyShared(changed, JSON.parse(changed['judge-key.json']));
});

test('judge packages reuse the writer basis and the anchor facts', async t => {
  const scene = await prepare(t, 'judges-basis');
  const writer = run(['writer', '--dir', scene.dir, '--moment', 'M1']);
  assertCliOk(writer);
  generate(scene, 7);
  const key = JSON.parse((await snapshot(scene))['judge-key.json']);
  const momentBlindId = Object.entries(key.texts).find(([, id]) => id === 'M1')?.[0];
  const anchorBlindId = key.anchors[0];
  assert.ok(momentBlindId);
  assert.ok(anchorBlindId);

  const request = await readFile(join(scene.dir, 'M1.req.txt'), 'utf8');
  const task = await readFile(new URL('../templates/writer-task.md', import.meta.url), 'utf8');
  const userMessage = '=== СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ ===\n';
  const basisStart = request.indexOf(userMessage) + userMessage.length;
  const basisEnd = request.lastIndexOf(`\n\n${task}`);
  assert.ok(basisStart >= userMessage.length);
  assert.notEqual(basisEnd, -1);
  const writerBasis = request.slice(basisStart, basisEnd);
  const anchors = await readJson(scene.anchors);
  const anchorId = key.texts[anchorBlindId];

  for (const name of ['judge1-pack.md', 'judge2-pack.md', 'judge3-pack.md']) {
    const pack = await readFile(join(scene.dir, name), 'utf8');
    assert.equal(factsFor(pack, momentBlindId), writerBasis);
    assert.equal(factsFor(pack, anchorBlindId), anchors[anchorId].facts);
  }
});

test('judge rubric includes exact §16.1 excerpts and excludes the long numeric example', async t => {
  const scene = await prepare(t, 'judges-rubric');
  generate(scene, 7);
  await red('judge-rubric', async () => {
    const path = join(scene.dir, 'judge1-pack.md');
    const value = await readFile(path, 'utf8');
    await writeFile(path, value.replace('15. Повторно описанное', '15. Повторное описанное'));
  });

  const sourceUrl = new URL('../../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const heading = '### 16.1. Слепая оценка прозы';
  const start = source.indexOf(heading);
  assert.notEqual(start, -1, 'в нормативном тексте должен быть заголовок §16.1');
  const end = source.indexOf('\n### 16.2.', start);
  assert.notEqual(end, -1, 'секция §16.1 должна завершаться перед §16.2');
  const section = source.slice(start + heading.length, end);
  const criteria = section.match(/^(?:[1-9]|1[0-5])\. .*$/gmu);
  assert.equal(criteria?.length, 15);
  const carryover = paragraph(section, 'Для отрывков после первого данные отрывка');
  const confirmation = paragraph(section, 'Нарушение по признакам 2–4 засчитывается');
  const liveliness = paragraph(section, 'Каждый слепой судья ставит живость');
  const liveSentences = liveliness.match(/[^.!?]+[.!?]/gu).map(value => value.trim());
  const fullPack = lineFeeds(await readFile(join(scene.dir, 'judge1-pack.md'), 'utf8'));
  const firstText = fullPack.search(/\n\n## T\d+\n/u);
  assert.notEqual(firstText, -1);
  const rubric = fullPack.slice(0, firstText);

  for (const criterion of criteria) assert.ok(rubric.includes(criterion), `В рубрике отсутствует ${criterion}`);
  assert.ok(rubric.includes(lineFeeds(carryover)));
  assert.ok(carryover.includes('Например, тесло'));
  assert.ok(rubric.includes(lineFeeds(confirmation)));
  assert.ok(rubric.includes(liveSentences[0]));
  assert.ok(rubric.includes(liveSentences[1]));
  assert.ok(!rubric.includes('Порог приёмки'));
  assert.ok(!rubric.includes('8,0'));
  assert.ok(!rubric.includes('1200 знаков'));
  assert.ok(!rubric.includes('8,2'));
  assert.ok(!rubric.includes('7,9'));
  assert.ok(rubric.includes('## Классы выдумок\n\n' + classText));
  assert.ok(rubric.includes('## Пункты #894\n\n' + characteristicItems));
  assert.ok(rubric.includes(d186Text));
});
