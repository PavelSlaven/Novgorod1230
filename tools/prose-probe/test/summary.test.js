import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fixture, readJson, red, run, setup, writeJson } from './fixtures/helper.mjs';

const prose = 'Мстислав подошёл к воротам. На досках темнели следы дождя.';
const classes = ['свободно', 'нужна характеристика', 'нарушение'];
const items = ['нет', ...Array.from({ length: 10 }, (_, index) => String(index + 1))];

function assertCliOk(result) {
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function blindId(key, id) {
  const match = Object.entries(key.texts).find(([, value]) => value === id);
  assert.ok(match, `В judge-key.json нет текста ${id}`);
  return match[0];
}

async function prepare(t, prefix, { count = 3, seed = 7, secondMoment = false } = {}) {
  const dir = await setup(t, prefix);
  const packets = [{
    id: 'M1',
    title: 'У ворот',
    from_turn: 1,
    to_turn: 1,
    parts: [{
      scene_id: 'S1',
      scene_first: true,
      packet: { 'Журнал действий': ['Мстислав подошёл к воротам.'], 'Место': ['Каменные ворота стояли перед двором.'] },
      events: []
    }]
  }];
  await writeJson(join(dir, 'M1.out.json'), { prose });
  if (secondMoment) {
    packets.push({
      id: 'M2',
      title: 'У стены',
      from_turn: 2,
      to_turn: 2,
      parts: [{ scene_id: 'S2', scene_first: true, packet: { 'Журнал действий': ['Мстислав коснулся стены.'] }, events: [] }]
    });
    await writeJson(join(dir, 'M2.out.json'), { prose: 'Мстислав коснулся стены.' });
  }
  await writeJson(join(dir, 'packets.json'), packets);
  const anchors = fixture('summary-anchor.json');
  const generated = run(['judges', '--dir', dir, '--anchors', anchors, '--judges', String(count), '--seed', String(seed)]);
  assertCliOk(generated);
  return { dir, key: await readJson(join(dir, 'judge-key.json')), anchors, count };
}

function remapFixture(response, key) {
  for (const answer of response.texts) {
    answer.blind_id = blindId(key, answer.blind_id === 'MOMENT' ? 'M1' : 'ANCHOR');
  }
  return response;
}

async function writeReplies(scene, change = () => {}) {
  const source = await readJson(fixture('summary-judge-full.json'));
  for (let index = 1; index <= scene.count; index++) {
    const response = remapFixture(structuredClone(source), scene.key);
    change(response, index);
    await writeJson(join(scene.dir, `judge${index}.json`), response);
  }
}

async function addSecondMomentReplies(scene, change = () => {}) {
  for (let index = 1; index <= scene.count; index++) {
    const path = join(scene.dir, `judge${index}.json`);
    const response = await readJson(path);
    const first = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    const second = structuredClone(first);
    second.blind_id = blindId(scene.key, 'M2');
    second.dislike[0].quote = 'Мстислав коснулся стены.';
    change(second, index, response);
    response.texts.push(second);
    await writeJson(path, response);
  }
}

async function writeConfirmations(dir, value) {
  const path = join(dir, 'confirmations.json');
  await writeJson(path, value);
  return path;
}

async function summarize(scene, { confirmations, baseline } = {}) {
  const args = ['summary', '--dir', scene.dir];
  if (confirmations) args.push('--confirmations', confirmations);
  if (baseline) args.push('--baseline', baseline);
  const result = run(args);
  assertCliOk(result);
  return readJson(join(scene.dir, 'summary.json'));
}

function moment(summary, id = 'M1') {
  const result = summary.texts.find(entry => entry.id === id);
  assert.ok(result, `В summary.json нет текста ${id}`);
  return result;
}

function judgeFor(text, index = 0) {
  const result = text.judges[index];
  assert.ok(result, `Нет ответа judge${index + 1}`);
  return result;
}

function criterion(judge, number) {
  const result = judge.criteria.find(entry => entry.n === number);
  assert.ok(result, `Нет критерия ${number}`);
  return result;
}

function assertFullTable(table) {
  for (const className of classes) {
    assert.deepEqual(Object.keys(table[className]).sort(), [...items].sort(), `Неполная таблица класса ${className}`);
  }
}

function beforeRaw(markdown) {
  const marker = '## Исходные ответы судей';
  const end = markdown.indexOf(marker);
  assert.notEqual(end, -1, 'В Markdown нет секции исходных ответов судей');
  return markdown.slice(0, end);
}

function markdownSection(markdown, heading, nextHeading) {
  return sliceSection(beforeRaw(markdown), heading, nextHeading);
}

function sliceSection(value, heading, nextHeading) {
  const start = value.indexOf(heading);
  assert.notEqual(start, -1, `В Markdown нет секции ${heading}`);
  const end = nextHeading ? value.indexOf(nextHeading, start + heading.length) : value.length;
  assert.notEqual(end, -1, `В Markdown нет следующей секции ${nextHeading}`);
  return value.slice(start, end);
}

function assertNoNumericComparison(markdown) {
  const section = markdownSection(markdown, '## Сравнение с baseline');
  assert.match(section, /прогоны несравнимы/u);
  assert.doesNotMatch(section, /\d/u);
}

test('R9: среднее 7,67 без нарушений не проходит', async t => {
  const scene = await prepare(t, 'summary-r9');
  await writeReplies(scene, (response, index) => {
    const score = [8, 8, 7][index - 1];
    for (const answer of response.texts) answer.liveliness = score;
  });
  await summarize(scene);
  await red('R9', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    moment(corrupted).verdict = 'проходит';
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary).average_liveliness, 23 / 3);
  assert.equal(moment(summary).verdict, 'не проходит');
  assert.deepEqual(moment(summary).blocking, []);
});

test('R10: три отметки «нет» по признаку 3 без подтверждения оставляют решение нерешённым', async t => {
  const scene = await prepare(t, 'summary-r10');
  await writeReplies(scene, response => {
    const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    const entry = answer.criteria.find(item => item.n === 3);
    entry.mark = 'нет';
    entry.place = 'Мстислав подошёл к воротам.';
  });
  await summarize(scene);
  await red('R10', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    moment(corrupted).verdict = 'проходит';
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary).verdict, 'не решено');
  assert.equal(criterion(judgeFor(moment(summary)), 3).decision, 'ожидает решения');
});

test('R11: confirmed для признака 2 без отметки «нет» предупреждает и не засчитывается', async t => {
  const scene = await prepare(t, 'summary-r11');
  await writeReplies(scene);
  const confirmations = await writeConfirmations(scene.dir, { M1: { criteria: { 2: 'confirmed' } } });
  await summarize(scene, { confirmations });
  await red('R11', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    moment(corrupted).verdict = 'не проходит';
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary).verdict, 'проходит');
  assert.ok(summary.warnings.some(value => /confirmed|признак 2/i.test(value)));
  assert.deepEqual(moment(summary).blocking, []);
});

test('R12: blocking finding prevents pass', async t => {
  const scene = await prepare(t, 'summary-r12');
  await writeReplies(scene);
  const confirmations = await writeConfirmations(scene.dir, { M1: { blocking: ['Подменённая реплика.'] } });
  await summarize(scene, { confirmations });
  await red('R12', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    moment(corrupted).verdict = 'проходит';
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary).verdict, 'не проходит');
  assert.equal(moment(summary).blocking.length, 1);
});

test('R13: неполный ответ сохраняется целиком и оставляет решение нерешённым', async t => {
  const scene = await prepare(t, 'summary-r13');
  await writeReplies(scene, (response, index) => {
    if (index !== 1) return;
    const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    answer.liveliness = 2;
    delete answer.criteria;
  });
  const rawInput = await readFile(join(scene.dir, 'judge1.json'), 'utf8');
  await summarize(scene);
  await red('R13', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    moment(corrupted).verdict = 'проходит';
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  const text = moment(summary);
  assert.equal(text.verdict, 'не решено');
  assert.equal(text.average_liveliness, 9);
  assert.equal(text.full_answers, 2);
  assert.equal(judgeFor(text).complete, false);
  assert.equal(summary.raw_responses.find(value => value.judge === 'judge1').raw, rawInput);
  assert.ok(text.judges.every(value => !Object.hasOwn(value, 'raw')));
  assert.ok(summary.warnings.some(value => value === 'ответ судьи неполон: judge1, M1, criteria: нужен массив'));
});

test('R14: выдумка в ответе на якорь не попадает в таблицу моментов', async t => {
  const scene = await prepare(t, 'summary-r14');
  await writeReplies(scene, response => {
    response.texts.find(entry => entry.blind_id === blindId(scene.key, 'ANCHOR')).inventions = [
      { quote: 'Под серой крышей', class: 'нужна характеристика', item: '3' }
    ];
  });
  await summarize(scene);
  await red('R14', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    corrupted.invention_tables.all['нужна характеристика']['3'] = 1;
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.deepEqual(summary.inventions, []);
  assert.equal(summary.invention_tables.all['нужна характеристика']['3'], 0);
  assert.ok(summary.anchors.every(entry => !Object.hasOwn(entry, 'verdict')));
});

test('R15: несовместимые версии нормы показывают причину и не выводят числовую разницу', async t => {
  const scene = await prepare(t, 'summary-r15');
  await writeReplies(scene);
  const first = await summarize(scene);
  const baseline = await setup(t, 'summary-r15-baseline');
  const incompatible = structuredClone(first);
  incompatible.rubric_version = 'unrelated-rubric-version';
  await writeJson(join(baseline, 'summary.json'), incompatible);
  await summarize(scene, { baseline });
  await red('R15', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    corrupted.baseline.delta = { all: { 'свободно': { нет: 1 } } };
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(summary.baseline.comparable, false);
  assert.ok(summary.baseline.reason);
  assert.equal(Object.hasOwn(summary.baseline, 'delta'), false);
  assertNoNumericComparison(await readFile(join(scene.dir, 'summary.md'), 'utf8'));
});

test('summary rejects a baseline directory without summary.json before writing outputs', async t => {
  const scene = await prepare(t, 'summary-baseline-missing');
  await writeReplies(scene);
  const baseline = await setup(t, 'summary-baseline-without-file');
  const result = run(['summary', '--dir', scene.dir, '--baseline', baseline]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /summary\.json/);
  await assert.rejects(access(join(scene.dir, 'summary.json')));
  await assert.rejects(access(join(scene.dir, 'summary.md')));
  await assert.rejects(access(join(baseline, 'summary.json')));
});

test('baseline comparisons require the same moment id list', async t => {
  const baselineScene = await prepare(t, 'summary-baseline-moments-old');
  await writeReplies(baselineScene);
  await summarize(baselineScene);
  const scene = await prepare(t, 'summary-baseline-moments-new', { secondMoment: true });
  await writeReplies(scene);
  await addSecondMomentReplies(scene);
  await summarize(scene, { baseline: baselineScene.dir });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(summary.baseline.comparable, false);
  assert.match(summary.baseline.reason, /список moment_ids изменился/u);
  assertNoNumericComparison(await readFile(join(scene.dir, 'summary.md'), 'utf8'));
});

test('rubric_version hashes the exact concatenation of all three templates', async t => {
  const scene = await prepare(t, 'summary-rubric-hash');
  await writeReplies(scene);
  await summarize(scene);
  const hash = createHash('sha256');
  for (const name of ['judge-rubric.md', 'writer-system.md', 'writer-task.md']) {
    hash.update(await readFile(new URL(`../templates/${name}`, import.meta.url), 'utf8'));
  }
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(summary.rubric_version, hash.digest('hex'));
});

test('root-field and list-count errors are one warning per judge and do not alter completeness', async t => {
  const scene = await prepare(t, 'summary-d186-counts');
  await writeReplies(scene, (response, index) => {
    if (index === 1) delete response.improve_general;
    else response.improve_general = index === 2
      ? ['Правило одно.', 'Правило два.', 'Правило три.', 'Правило четыре.', 'Правило пять.', 'Правило шесть.']
      : ['Правило одно.', 'Правило два.'];
    const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    answer.dislike = [];
    answer.improve = [];
  });
  await summarize(scene);
  const summary = await readJson(join(scene.dir, 'summary.json'));
  const text = moment(summary);
  assert.equal(text.verdict, 'проходит');
  assert.equal(text.full_answers, 3);
  assert.equal(text.average_liveliness, 9);
  assert.ok(text.judges.every(value => value.complete));
  for (let index = 1; index <= 3; index++) {
    const warnings = summary.warnings.filter(value => value.startsWith(`judge${index}:`));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /improve_general/u);
    assert.ok(warnings[0].includes(`${blindId(scene.key, 'M1')}: dislike`));
    assert.ok(warnings[0].includes(`${blindId(scene.key, 'M1')}: improve`));
  }
});

test('per-text required fields reject out-of-range liveliness, fourteen criteria, and absent missing_facts', async t => {
  const scene = await prepare(t, 'summary-required-fields');
  await writeReplies(scene, (response, index) => {
    const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    if (index === 1) {
      answer.liveliness = 11;
      answer.dislike = null;
      answer.inventions = null;
    }
    if (index === 2) {
      answer.criteria.pop();
      answer.improve = null;
    }
    if (index === 3) delete answer.missing_facts;
  });
  await summarize(scene);
  const summary = await readJson(join(scene.dir, 'summary.json'));
  const text = moment(summary);
  assert.equal(text.verdict, 'не решено');
  assert.equal(text.full_answers, 0);
  assert.equal(text.average_liveliness, null);
  assert.ok(text.judges.every(value => !value.complete));
  assert.ok(judgeFor(text, 0).defects.some(value => /liveliness: нужно целое от 0 до 10/u.test(value)));
  assert.ok(judgeFor(text, 0).defects.some(value => /dislike: нужен массив/u.test(value)));
  assert.ok(judgeFor(text, 0).defects.some(value => /inventions: нужен массив/u.test(value)));
  assert.ok(judgeFor(text, 1).defects.some(value => /criteria: должно быть ровно 15 записей/u.test(value)));
  assert.ok(judgeFor(text, 1).defects.some(value => /improve: нужен массив/u.test(value)));
  assert.ok(judgeFor(text, 2).defects.some(value => /missing_facts: нужен массив/u.test(value)));
});

test('confirmed n2 with a judge no mark fails the text', async t => {
  const scene = await prepare(t, 'summary-confirmed-no');
  await writeReplies(scene, (response, index) => {
    if (index !== 1) return;
    const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    answer.criteria.find(entry => entry.n === 2).mark = 'нет';
    answer.criteria.find(entry => entry.n === 2).place = 'Мстислав подошёл к воротам.';
  });
  const confirmations = await writeConfirmations(scene.dir, { M1: { criteria: { 2: 'confirmed' } } });
  await summarize(scene, { confirmations });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary).verdict, 'не проходит');
  assert.ok(moment(summary).reasons.some(value => /Подтверждено нарушение по признаку 2/u.test(value)));
});

test('a nonblocking no mark outside criteria 2 through 4 remains a prose note', async t => {
  const scene = await prepare(t, 'summary-nonblocking-mark');
  await writeReplies(scene, (response, index) => {
    if (index !== 1) return;
    const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    answer.criteria.find(entry => entry.n === 7).mark = 'нет';
    answer.criteria.find(entry => entry.n === 7).place = 'Мстислав подошёл к воротам.';
  });
  await summarize(scene);
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary).verdict, 'проходит');
  assert.equal(criterion(judgeFor(moment(summary)), 7).decision, 'замечание');
});

test('without complete answers the mean is null and does not fail the text', async t => {
  const scene = await prepare(t, 'summary-no-complete-answers');
  await writeReplies(scene, response => {
    delete response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1')).criteria;
  });
  await summarize(scene);
  const summary = await readJson(join(scene.dir, 'summary.json'));
  const text = moment(summary);
  assert.equal(text.full_answers, 0);
  assert.equal(text.average_liveliness, null);
  assert.equal(text.verdict, 'не решено');
  assert.ok(!text.reasons.some(value => /ниже 8/u.test(value)));
});

test('a blocking failure outranks an incomplete judge response', async t => {
  const scene = await prepare(t, 'summary-blocking-before-incomplete');
  await writeReplies(scene, (response, index) => {
    if (index === 1) {
      const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
      answer.criteria.find(entry => entry.n === 2).mark = 'нет';
      answer.criteria.find(entry => entry.n === 2).place = 'Мстислав подошёл к воротам.';
    }
    if (index === 3) delete response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1')).criteria;
  });
  const confirmations = await writeConfirmations(scene.dir, { M1: { criteria: { 2: 'confirmed' } } });
  await summarize(scene, { confirmations });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary).full_answers, 2);
  assert.equal(moment(summary).verdict, 'не проходит');
});

test('a critical no mark without place waits for review and names the missing quote', async t => {
  const scene = await prepare(t, 'summary-no-place');
  await writeReplies(scene, (response, index) => {
    if (index !== 1) return;
    const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    const entry = answer.criteria.find(value => value.n === 2);
    entry.mark = 'нет';
    entry.place = '';
  });
  await summarize(scene);
  const summary = await readJson(join(scene.dir, 'summary.json'));
  const text = moment(summary);
  const entry = criterion(judgeFor(text), 2);
  assert.equal(text.verdict, 'не решено');
  assert.equal(entry.notice, 'место не указано судьёй');
  assert.equal(entry.decision, 'ожидает решения');
});

test('inapplicable anchor, unknown-id, and out-of-range confirmations warn without changing the verdict', async t => {
  const scene = await prepare(t, 'summary-inapplicable-confirmations');
  await writeReplies(scene);
  const anchorId = scene.key.texts[scene.key.anchors[0]];
  const confirmations = await writeConfirmations(scene.dir, {
    [anchorId]: { criteria: { 2: 'rejected' } },
    M404: { criteria: { 2: 'rejected' } },
    M1: { criteria: { 5: 'confirmed' } }
  });
  await summarize(scene, { confirmations });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary).verdict, 'проходит');
  assert.ok(summary.warnings.some(value => value.includes(`${anchorId}: якорь, подтверждения не применяются`)));
  assert.ok(summary.warnings.some(value => value.includes('M404: неизвестный id подтверждения')));
  assert.ok(summary.warnings.some(value => value.includes('M1: номер признака 5 вне диапазона 2–4')));
});

test('unique invention quotes are counted separately for distinct moment ids', async t => {
  const scene = await prepare(t, 'summary-unique-moment-ids', { secondMoment: true });
  await writeReplies(scene, (response, index) => {
    if (index !== 1) return;
    response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1')).inventions = [
      { quote: 'Мстислав', class: 'свободно', item: 'нет' }
    ];
  });
  await addSecondMomentReplies(scene, (answer, index) => {
    if (index === 1) answer.inventions = [{ quote: 'Мстислав', class: 'свободно', item: 'нет' }];
  });
  await summarize(scene);
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(summary.invention_tables.all['свободно']['нет'], 2);
  assert.equal(summary.invention_tables.unique['свободно']['нет'], 2);
});

test('summary Markdown shows per-judge advice, missing facts, anchor rows, and general advice before raw data', async t => {
  const scene = await prepare(t, 'summary-markdown-sections');
  await writeReplies(scene, (response, index) => {
    if (index !== 1) return;
    response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1')).improve = [
      'Уточнить ритм первой фразы.',
      'Сохранить действие у ворот.'
    ];
    response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1')).missing_facts = [
      'Не хватает сведений о креплении створки.'
    ];
    response.improve_general = [
      'Общее правило judge1.',
      'Проверять точность цитат.',
      'Сохранять причинный порядок.'
    ];
  });
  await summarize(scene);
  const markdown = await readFile(join(scene.dir, 'summary.md'), 'utf8');
  const visible = beforeRaw(markdown);
  const momentSection = markdownSection(markdown, '## M1 (', '## Якоря');
  const judge1 = sliceSection(momentSection, '### judge1', '### judge2');
  assert.ok(judge1.includes('#### Предложения по улучшению'));
  assert.ok(judge1.includes('Уточнить ритм первой фразы.'));
  assert.ok(judge1.includes('Не хватает сведений о креплении створки.'));
  const anchors = markdownSection(markdown, '## Якоря', '## Общие рекомендации судей');
  assert.ok(anchors.includes('| judge1 | 1 | да | — | — | — | не требуется | 9 |'));
  const general = markdownSection(markdown, '## Общие рекомендации судей', '## Предупреждения');
  assert.ok(general.includes('Общее правило judge1.'));
  assert.ok(visible.startsWith('# Сводка оценки прозы'));
});

test('G1: оценки 8/8/8 и все критические отметки «да» проходят', async t => {
  const scene = await prepare(t, 'summary-g1');
  await writeReplies(scene, response => { for (const answer of response.texts) answer.liveliness = 8; });
  await summarize(scene);
  await red('G1', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    moment(corrupted).verdict = 'не проходит';
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary).average_liveliness, 8);
  assert.equal(moment(summary).verdict, 'проходит');
});

test('G2: отклонённая отметка по признаку 4 видна и не блокирует приёмку', async t => {
  const scene = await prepare(t, 'summary-g2');
  await writeReplies(scene, (response, index) => {
    for (const answer of response.texts) answer.liveliness = index === 1 ? 9 : 8;
    if (index === 1) {
      const entry = response.texts.find(item => item.blind_id === blindId(scene.key, 'M1')).criteria.find(item => item.n === 4);
      entry.mark = 'нет';
      entry.place = 'Мстислав подошёл к воротам.';
    }
  });
  const confirmations = await writeConfirmations(scene.dir, { M1: { criteria: { 4: 'rejected' } } });
  await summarize(scene, { confirmations });
  await red('G2', async () => {
    const md = await readFile(join(scene.dir, 'summary.md'), 'utf8');
    await writeFile(join(scene.dir, 'summary.md'), md.replaceAll('rejected', 'pending'));
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  const n4 = criterion(judgeFor(moment(summary)), 4);
  assert.equal(moment(summary).verdict, 'проходит');
  assert.equal(n4.decision, 'rejected');
  const judge1 = markdownSection(await readFile(join(scene.dir, 'summary.md'), 'utf8'), '### judge1', '### judge2');
  assert.match(judge1, /^\| 4 \| нет \| Мстислав подошёл к воротам\. \| да \|.*\| rejected \|$/mu);
});

test('G5: 33 ячейки таблиц считают все отметки и схлопывают повторную цитату', async t => {
  const scene = await prepare(t, 'summary-g5');
  const shared = 'край ворот';
  await writeReplies(scene, (response, index) => {
    const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    if (index === 1) answer.inventions = [{ quote: shared, class: 'свободно', item: 'нет' }];
    if (index === 2 || index === 3) answer.inventions = [{ quote: shared, class: 'нужна характеристика', item: '1' }];
  });
  const proseWithQuotes = `${prose} Камень показал край ворот.`;
  await writeJson(join(scene.dir, 'M1.out.json'), { prose: proseWithQuotes });
  await summarize(scene);
  await red('G5', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    corrupted.invention_tables.unique['нужна характеристика']['1'] = 2;
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assertFullTable(summary.invention_tables.all);
  assertFullTable(summary.invention_tables.unique);
  assert.equal(summary.invention_tables.all['свободно']['нет'], 1);
  assert.equal(summary.invention_tables.unique['свободно']['нет'], 1);
  assert.equal(summary.invention_tables.all['нужна характеристика']['1'], 2);
  assert.equal(summary.invention_tables.unique['нужна характеристика']['1'], 1);
});

test('G6: совпадающая база показывает полные таблицы и нулевые разницы', async t => {
  const scene = await prepare(t, 'summary-g6');
  await writeReplies(scene);
  const first = await summarize(scene);
  const baseline = await setup(t, 'summary-g6-baseline');
  await writeJson(join(baseline, 'summary.json'), first);
  await summarize(scene, { baseline });
  await red('G6', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    delete corrupted.baseline.delta.all['свободно']['нет'];
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(summary.baseline.comparable, true);
  for (const tables of [summary.baseline.previous_tables, summary.baseline.delta]) {
    assertFullTable(tables.all);
    assertFullTable(tables.unique);
  }
  for (const className of classes) for (const item of items) {
    assert.equal(summary.baseline.delta.all[className][item], 0);
    assert.equal(summary.baseline.delta.unique[className][item], 0);
  }
  const comparison = markdownSection(await readFile(join(scene.dir, 'summary.md'), 'utf8'), '## Сравнение с baseline');
  assert.ok(comparison.includes('#### Все отметки'));
  assert.ok(comparison.includes('#### Уникальные цитаты'));
  assert.match(comparison, /^\| свободно \| нет \| 0 \| 0 \| 0 \|$/mu);
  assert.equal([...comparison.matchAll(/^\| (?:свободно|нужна характеристика|нарушение) \| (?:нет|[1-9]|10) \| \d+ \| \d+ \| \d+ \|$/gmu)].length, 66);
});

test('summary names a missing judge file and writes no output', async t => {
  const scene = await prepare(t, 'summary-missing-judge');
  await writeReplies(scene);
  const missing = join(scene.dir, 'judge2.json');
  await unlink(missing);
  const result = run(['summary', '--dir', scene.dir]);
  await red('missing-judge', async () => {
    await writeJson(join(scene.dir, 'summary.json'), { corrupt: true });
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /judge2\.json/);
  await assert.rejects(access(join(scene.dir, 'summary.json')));
  await assert.rejects(access(join(scene.dir, 'summary.md')));
});

test('summary normalizes quote whitespace and preserves valid criteria beside an invalid mark', async t => {
  const scene = await prepare(t, 'summary-quote-normalization');
  await writeReplies(scene, (response, index) => {
    if (index !== 1) return;
    const answer = response.texts.find(entry => entry.blind_id === blindId(scene.key, 'M1'));
    answer.criteria.find(item => item.n === 1).place = 'Мстислав подошёл\r\nк воротам.';
    answer.criteria.find(item => item.n === 2).place = 'мстислав подошёл к воротам.';
    answer.criteria.find(item => item.n === 3).mark = 'возможно';
    answer.criteria.find(item => item.n === 3).place = 'Мстислав подошёл к воротам.';
    answer.criteria.find(item => item.n === 4).place = 'следы дождя. ';
    answer.criteria.find(item => item.n === 5).place = 'Мстислав\tподошёл к воротам.';
    answer.dislike[0].quote = 'Мстислав  подошёл к воротам.';
    answer.inventions = [{ quote: 'Мстислав подошёл\r\nк воротам.', class: 'свободно', item: 'нет' }];
  });
  await summarize(scene);
  await red('quote-normalization', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    criterion(judgeFor(moment(corrupted)), 1).quote_found = false;
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  const text = moment(summary);
  const judge = judgeFor(text);
  assert.equal(judge.complete, false);
  assert.equal(judge.criteria.length, 15);
  assert.equal(criterion(judge, 1).quote_found, true);
  assert.equal(criterion(judge, 2).quote_found, false);
  assert.equal(criterion(judge, 2).notice, 'цитата не найдена');
  assert.equal(criterion(judge, 2).mark, 'да');
  assert.equal(criterion(judge, 3).mark, 'возможно');
  assert.equal(criterion(judge, 3).decision, null);
  assert.equal(criterion(judge, 4).quote_found, false);
  assert.equal(criterion(judge, 5).quote_found, false);
  assert.equal(criterion(judge, 4).notice, 'цитата не найдена');
  assert.equal(criterion(judge, 5).notice, 'цитата не найдена');
  assert.equal(judge.dislike[0].quote_found, true);
  assert.equal(judge.inventions[0].quote_found, true);
  assert.ok(!text.reasons.some(value => /признак 3 ожидает решения/u.test(value)));
  assert.deepEqual(text.blocking, []);
  const judge1 = markdownSection(await readFile(join(scene.dir, 'summary.md'), 'utf8'), '### judge1', '### judge2');
  assert.match(judge1, /^\| 6 \| да \| — \| — \| — \| не требуется \|$/mu);
});

test('confirmation for one moment cannot borrow a negative mark from another moment', async t => {
  const scene = await prepare(t, 'summary-cross-confirmation', { secondMoment: true });
  await writeReplies(scene);
  await addSecondMomentReplies(scene, second => {
    second.criteria.find(entry => entry.n === 2).mark = 'нет';
    second.criteria.find(entry => entry.n === 2).place = 'Мстислав коснулся стены.';
  });
  const confirmations = await writeConfirmations(scene.dir, { M1: { criteria: { 2: 'confirmed' } } });
  await summarize(scene, { confirmations });
  await red('cross-text-confirmation', async () => {
    const corrupted = await readJson(join(scene.dir, 'summary.json'));
    moment(corrupted, 'M1').verdict = 'не проходит';
    await writeJson(join(scene.dir, 'summary.json'), corrupted);
  });
  const summary = await readJson(join(scene.dir, 'summary.json'));
  assert.equal(moment(summary, 'M1').verdict, 'проходит');
  assert.equal(moment(summary, 'M2').verdict, 'не решено');
  assert.ok(moment(summary, 'M1').judges.every(judge => criterion(judge, 2).mark === 'да'));
  assert.ok(summary.warnings.some(value => /M1, признак 2: confirmed без отметки «нет» не применяется/u.test(value)));
});
