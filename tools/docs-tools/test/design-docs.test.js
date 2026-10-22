import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkDesignDocs } from '../src/design-docs.js';

const PREFIX = '> status: REFERENCE / DOMAIN GUIDE. Проверочная страница. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.';
const SOURCE = 'docs/governance/PRODUCT_CONSTITUTION.md';
const INDEX = 'data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md';
const HEADINGS = [
  'Замысел', 'Что может игрок', 'Родное CDDA', 'Наш слой и владелец',
  'Решения владельца', 'Расхождения и открытые вопросы', 'Источники', 'Этап'
];
const HUMAN_HEADINGS = [
  'Какому столпу служит', 'Что чувствует игрок', 'Правила для игрока',
  'Как игрок узнаёт о механике', 'Связи с другими механиками', 'Примеры ситуаций'
];
const TECH_HEADINGS = [
  ...HEADINGS, 'Данные и числа', 'Состояния и события',
  'Что сохраняется', 'Чек-лист', 'Как проверить готовность'
];
const HUB_HEADINGS = [
  '1. Обзор', '2. Цикл и прогрессия', '3. Механики', '4. Системы и баланс',
  '5. Мир', '6. Сюжет и персонажи', '7. Ощущения', '8. Интерфейс',
  '9. Техника', '10. Контент', '11. Объём и план', '12. Выпуск и бизнес',
  '13. Как работаем', '14. Открытые вопросы'
];

function ability(id) {
  return `Выполнить действие главы ${id.slice(0, 2)}.`;
}

function chapter(number) {
  const id = `${number}.01`;
  return [
    PREFIX, '', `# ${number}. Глава`, '', '## Для человека', '',
    ...HUMAN_HEADINGS.flatMap((heading) => [`### ${heading}`, '', `Содержание ${heading}.`, '']),
    '## Для разработчика и нейросети', '',
    ...TECH_HEADINGS.flatMap((heading) => {
      if (heading === 'Что может игрок') return [`### ${heading}`, '', `- **${id}.** ${ability(id)}`, ''];
      if (heading === 'Решения владельца' && number === '01') return [`### ${heading}`, '', '- **D1, 2026-10-21.** Решение для fixture.', ''];
      return [`### ${heading}`, '', `Содержание ${heading}.`, ''];
    })
  ].join('\n');
}

function hub() {
  const rows = [];
  for (let number = 1; number <= 20; number += 1) {
    const chapter = String(number).padStart(2, '0');
    const id = `${chapter}.01`;
    let status = 'не начато';
    let proof = '';
    if (number === 1) {
      status = 'проверено в игре';
      proof = '[протокол](../governance/PRODUCT_CONSTITUTION.md)';
    } else if (number === 2) {
      status = 'в работе';
      proof = '#833';
    } else if (number === 3) {
      status = 'отложено';
      proof = '[решение](../governance/PRODUCT_CONSTITUTION.md)';
    }
    rows.push(`| ${id} | ${ability(id)} | ${chapter} | 0 | ${status} | ${proof} |`);
  }
  const section = new Map(HUB_HEADINGS.map((name) => [name, [`## ${name}`, '', 'Содержание.', '']]));
  section.set('Этапы', [
    '## 11. Объём и план', '',
    '| Этап | Цель | Зависит от | Статус | Проверено способностей |',
    '|---|---|---|---|---|',
    '| 0. База CDDA | Основа | — | идёт | 1 из 20 |',
    ...[1, 2, 3, 4, 5].map((number) => `| ${number}. Этап | Цель | 0 | не начат | — |`),
    '', '### 1. Срез', '',
    ...[1, 2, 3, 4, 5, 6, 7].flatMap((number) => [
      `**Часть ${number}.** Проверка.`, '',
      '| Критерий | id способностей | Доказательство | Итог |',
      '|---|---|---|---|',
      '| Выполнить действие | 01.01 | — | не проверен |', ''
    ])
  ]);
  section.set('Прогресс: игрок может…', [
    '### Прогресс: игрок может…', '',
    '| id | Игрок может… | Глава | Этап/часть | Статус | Доказательство |',
    '|---|---|---|---|---|---|',
    ...rows, ''
  ]);
  return [PREFIX, '', '# Игра', '', ...HUB_HEADINGS.flatMap((name) => name === '11. Объём и план'
    ? [...section.get('Этапы'), ...section.get('Прогресс: игрок может…')]
    : section.get(name))].join('\n');
}

function sources() {
  return [
    PREFIX, '', '# Источники', '', '## Источники', '',
    '| Путь | Вид | Статус по CONTRACT_INDEX | Главы | Судьба при CDDA | Основание |',
    '|---|---|---|---|---|---|',
    `| \`${SOURCE}\` | governance-pc | GOVERNING | 01–20 | живёт как норма | §3 живёт как норма на пути CDDA. |`,
    '', '## Решения владельца', '',
    '| D | Дата | Цитата или пересказ | Главы | URL GitHub, если есть |',
    '|---|---|---|---|---|',
    '| D1 | 2026-10-21 | Пересказ решения для fixture. | 01 | |', ''
  ].join('\n');
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gdd-check-'));
  const design = join(root, 'docs/design');
  const systems = join(design, 'systems');
  await mkdir(systems, { recursive: true });
  await mkdir(join(root, 'docs/governance'), { recursive: true });
  await mkdir(join(root, 'data/knowledge-source/corpus/DOCUMENTS'), { recursive: true });
  await writeFile(join(root, SOURCE), '# PC\n');
  await writeFile(join(root, INDEX), [
    '# Контрактный индекс', '',
    '## 3. Governing source', '',
    '| Документ | Статус | Scope |',
    '|---|---|---|',
    '| [`AGENTS.md`](../../../../AGENTS.md) | `GOVERNING` | Правила. |',
    '',
    '- [`docs/governance/PRODUCT_CONSTITUTION.md`](../../../../docs/governance/PRODUCT_CONSTITUTION.md) — продуктовая конституция;',
    '',
    '## 4. Explicit active contracts', '',
    '## 5. Explicit non-production, migration and supporting contracts', '',
    '## 6. Compatibility navigation', '',
    '## 7. Domain guides and legacy/supporting documents', ''
  ].join('\n'));
  await writeFile(join(design, 'GDD.md'), hub());
  await writeFile(join(design, 'SOURCES.md'), sources());
  for (const name of ['vision.md', 'questionnaire.md', 'decision-log.md', 'open-questions.md', 'ideas.md', 'STATE.md']) {
    await writeFile(join(design, name), `${PREFIX}\n\n# ${name}\n`);
  }
  for (let number = 1; number <= 20; number += 1) {
    const id = String(number).padStart(2, '0');
    await writeFile(join(systems, `${id}-example.md`), chapter(id));
  }
  return { root, design, systems };
}

async function edit(path, change) {
  await writeFile(path, change(await readFile(path, 'utf8')));
}

const pathOf = (f, name) => join(f.design, name);
const chapterOf = (f, number = '01') => join(f.systems, `${number}-example.md`);
const withSources = (f, change) => edit(pathOf(f, 'SOURCES.md'), change);
const withHub = (f, change) => edit(pathOf(f, 'GDD.md'), change);

test('честная fixture проходит все правила', async () => {
  const f = await fixture();
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.deepEqual(result.errors, []);
});

test('P7: не начат при работе даёт только ошибку статуса этапа', async () => {
  const f = await fixture();
  await withHub(f, (s) => s.replace('| 0. База CDDA | Основа | — | идёт | 1 из 20 |', '| 0. База CDDA | Основа | — | не начат | 0 из 20 |')
    .replace('| 01 | 0 | проверено в игре | [протокол](../governance/PRODUCT_CONSTITUTION.md) |', '| 01 | 0 | не начато |  |'));
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.deepEqual(result.errors, ['[GDD:P7] статус этапа неверен: 0']);
});

test('хаб допускает О документе перед главами и Словарь после них', async () => {
  const f = await fixture();
  await withHub(f, (s) => `${s.replace('## 1. Обзор', '## О документе\n\nСодержание.\n\n## 1. Обзор')}\n## Словарь\n\nТермины.\n`);
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.deepEqual(result.errors, []);
});

test('P13: D1 и его указатель допускают главы 18–20', async () => {
  const f = await fixture();
  await withSources(f, (s) => s.replace('Пересказ решения для fixture. | 01 |', 'Пересказ решения для fixture. | 01, 18–20 |'));
  for (const number of ['18', '19', '20']) {
    await edit(chapterOf(f, number), (s) => s.replace('Содержание Решения владельца.', 'Также D1.'));
  }
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.deepEqual(result.errors, []);
});

test('P13: D274 сохраняет двустороннюю проверку указателя', async () => {
  const f = await fixture();
  await withSources(f, (s) => s.replace('| D1 |', '| D274 |'));
  await edit(chapterOf(f), (s) => s.replace('D1,', 'D274,'));
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.deepEqual(result.errors, []);
});

test('P13: решения с D275 и будущие проверяются по записям журнала', async () => {
  const f = await fixture();
  await edit(pathOf(f, 'decision-log.md'), (s) => `${s}\n| Решение | Текст |\n|---|---|\n| D275/1 | Решение. |\n\n## D276 — решения\n\n| D300 | Будущее решение. |\n`);
  await edit(chapterOf(f, '18'), (s) => s.replace('Содержание Решения владельца.', 'D275/1, D276 и D300.'));
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.deepEqual(result.errors, []);
});

test('P13: ссылка на отсутствующий подпункт D275 отклоняется', async () => {
  const f = await fixture();
  await edit(pathOf(f, 'decision-log.md'), (s) => `${s}\n| D275/1 | Решение. |\n`);
  await edit(chapterOf(f, '18'), (s) => s.replace('Содержание Решения владельца.', 'D275/2.'));
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.ok(result.errors.includes('[GDD:P13] решение главы отсутствует в журнале: D275/2/18'), result.errors.join('\n'));
});

test('P12: внутренний источник главы не требует строки в реестре', async () => {
  const f = await fixture();
  await edit(chapterOf(f), (s) => s.replace('Содержание Источники.', '[видение](../vision.md)'));
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.deepEqual(result.errors, []);
});

test('описания способности совпадают при разных относительных адресах одного файла', async () => {
  const f = await fixture();
  await withHub(f, (s) => s.replace(ability('01.01'), `${ability('01.01')} [основание](../governance/PRODUCT_CONSTITUTION.md)`));
  await edit(chapterOf(f), (s) => s.replace(ability('01.01'), `${ability('01.01')} [основание](../../governance/PRODUCT_CONSTITUTION.md)`));
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.deepEqual(result.errors, []);
});

test('разные цели ссылки в описании способности остаются ошибкой', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'docs/governance/other.md'), '# Другой файл\n');
  await withHub(f, (s) => s.replace(ability('01.01'), `${ability('01.01')} [основание](../governance/PRODUCT_CONSTITUTION.md)`));
  await edit(chapterOf(f), (s) => s.replace(ability('01.01'), `${ability('01.01')} [основание](../../governance/other.md)`));
  const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
  assert.ok(result.errors.includes('[GDD:P5] способность не совпадает с главой: 01.01'), result.errors.join('\n'));
});

const red = [
  ['P1: отсутствующий tracked источник', 'P1', async (f) => withSources(f, (s) => s.replace(`| \`${SOURCE}\` | governance-pc | GOVERNING | 01–20 | живёт как норма | §3 живёт как норма на пути CDDA. |\n`, ''))],
  ['P2: лишний отсутствующий путь', 'P2', async (f) => withSources(f, (s) => s.replace('|---|---|---|---|---|---|', '|---|---|---|---|---|---|\n| `docs/governance/missing.md` | guide | нет в индексе | 01 | история | Старый текст. |'))],
  ['P2: путь является каталогом', 'P2', async (f) => withSources(f, (s) => s.replace('|---|---|---|---|---|---|', '|---|---|---|---|---|---|\n| `docs/governance` | guide | нет в индексе | 01 | история | Каталог. |'))],
  ['P3: неверный заголовок', 'P3', async (f) => withSources(f, (s) => s.replace('| Вид |', '| Тип |'))],
  ['P3: шестая судьба', 'P3', async (f) => withSources(f, (s) => s.replace('| живёт как норма |', '| архив |'))],
  ['P3: смешанная судьба', 'P3', async (f) => withSources(f, (s) => s.replace('| живёт как норма | §3 живёт как норма', '| история | §3 живёт как норма'))],
  ['P4: неверный id', 'P4', async (f) => withHub(f, (s) => s.replace('| 04.01 |', '| 21.01 |'))],
  ['P4: повторный id', 'P4', async (f) => withHub(f, (s) => s.replace('| 04.01 |', '| 03.01 |'))],
  ['P5: текст главы иной', 'P5', async (f) => edit(chapterOf(f), (s) => s.replace('Выполнить действие главы 01.', 'Выполнить иное действие главы 01.'))],
  ['P5: id отсутствует в главе', 'P5', async (f) => edit(chapterOf(f), (s) => s.replace('- **01.01.** Выполнить действие главы 01.', ''))],
  ['P5: лишний id в главе', 'P5', async (f) => edit(chapterOf(f), (s) => s.replace('- **01.01.**', '- **01.02.**'))],
  ['P6: пятый статус', 'P6', async (f) => withHub(f, (s) => s.replace('| 04 | 0 | не начато |', '| 04 | 0 | готово |'))],
  ['P7: нет протокола', 'P7', async (f) => withHub(f, (s) => s.replace('[протокол](../governance/PRODUCT_CONSTITUTION.md)', ''))],
  ['P7: доказательство #832', 'P7', async (f) => withHub(f, (s) => s.replace('| 02 | 0 | в работе | #833 |', '| 02 | 0 | в работе | #832 |'))],
  ['P7: нет ссылки у отложенного', 'P7', async (f) => withHub(f, (s) => s.replace('[решение](../governance/PRODUCT_CONSTITUTION.md)', ''))],
  ['P7: лишнее доказательство у не начатого', 'P7', async (f) => withHub(f, (s) => s.replace('| 04 | 0 | не начато |  |', '| 04 | 0 | не начато | #833 |'))],
  ['P7: неверный K из N', 'P7', async (f) => withHub(f, (s) => s.replace('1 из 20', '0 из 20'))],
  ['P7: неизвестный статус этапа', 'P7', async (f) => withHub(f, (s) => s.replace('| 0. База CDDA | Основа | — | идёт |', '| 0. База CDDA | Основа | — | готово |'))],
  ['P7: преждевременное «сделано»', 'P7', async (f) => withHub(f, (s) => s.replace('| 0. База CDDA | Основа | — | идёт |', '| 0. База CDDA | Основа | — | сделано |'))],
  ['P7: N=0 нельзя сделать', 'P7', async (f) => withHub(f, (s) => s.replace('| 2. Этап | Цель | 0 | не начат | — |', '| 2. Этап | Цель | 0 | сделано | — |'))],
  ['P7: не начат при K>0', 'P7', async (f) => withHub(f, (s) => s.replace('| 0. База CDDA | Основа | — | идёт |', '| 0. База CDDA | Основа | — | не начат |'))],
  ['P8: лишний md в корне', 'P8', async (f) => writeFile(pathOf(f, 'EXTRA.md'), '# extra')],
  ['P8: лишний не-md в корне', 'P8', async (f) => writeFile(pathOf(f, 'extra.txt'), 'extra')],
  ['P8: лишний md в systems', 'P8', async (f) => writeFile(join(f.systems, '21-extra.md'), '# extra')],
  ['P8: лишний не-md в systems', 'P8', async (f) => writeFile(join(f.systems, 'extra.txt'), 'extra')],
  ['P8: вложенная папка в корне', 'P8', async (f) => mkdir(pathOf(f, 'nested'))],
  ['P8: вложенная папка в systems', 'P8', async (f) => mkdir(join(f.systems, 'nested'))],
  ['P8: symlink файла в корне', 'P8', async (f) => symlink(pathOf(f, 'GDD.md'), pathOf(f, 'ALIAS.md'))],
  ['P8: symlink каталога в корне', 'P8', async (f) => symlink(f.systems, pathOf(f, 'alias'), 'dir')],
  ['P8: symlink файла в systems', 'P8', async (f) => symlink(chapterOf(f), join(f.systems, 'alias.md'))],
  ['P8: symlink каталога в systems', 'P8', async (f) => symlink(f.systems, join(f.systems, 'nested'), 'dir')],
  ['P8: имя в другом регистре', 'P8', async (f) => writeFile(pathOf(f, 'gdd.md'), hub())],
  ['P8: нет главы', 'P8', async (f) => unlink(chapterOf(f))],
  ['P8: неверный H2', 'P8', async (f) => edit(chapterOf(f), (s) => s.replace('## Для человека', '## Игрок'))],
  ['P8: неверный порядок глав', 'P8', async (f) => withHub(f, (s) => s.replace('## 1. Обзор', '## 2. Цикл и прогрессия').replace('## 2. Цикл и прогрессия\n\nСодержание.\n\n## 3.', '## 1. Обзор\n\nСодержание.\n\n## 3.'))],
  ['P8: нет части для человека', 'P8', async (f) => edit(chapterOf(f), (s) => s.replace('## Для человека\n', ''))],
  ['P8: человеческие разделы под технической частью', 'P8', async (f) => edit(chapterOf(f), (s) => s.replace('## Для человека\n', '## Для человека\n\n## Для разработчика и нейросети\n').replace('\n## Для разработчика и нейросети\n\n### Замысел', '\n### Замысел'))],
  ['P8: технические разделы под человеческой частью', 'P8', async (f) => edit(chapterOf(f), (s) => s.replace('## Для разработчика и нейросети\n', '').replace('### Что может игрок', '## Для разработчика и нейросети\n\n### Что может игрок'))],
  ['P8: пустой раздел о столпе', 'P8', async (f) => edit(chapterOf(f), (s) => s.replace('Содержание Какому столпу служит.', '   '))],
  ['P8: номер H1 не совпадает с файлом', 'P8', async (f) => edit(chapterOf(f), (s) => s.replace('# 01. Глава', '# 07. Глава'))],
  ['P8: О документе не первым', 'P8', async (f) => withHub(f, (s) => s.replace('## 2. Цикл и прогрессия', '## О документе\n\nСодержание.\n\n## 2. Цикл и прогрессия'))],
  ['P8: Словарь не последним', 'P8', async (f) => withHub(f, (s) => s.replace('## 14. Открытые вопросы', '## Словарь\n\nСодержание.\n\n## 14. Открытые вопросы'))],
  ['P8: отсутствующий H3', 'P8', async (f) => edit(chapterOf(f), (s) => s.replace('### Что чувствует игрок\n', ''))],
  ['P8: лишний H3', 'P8', async (f) => edit(chapterOf(f), (s) => `${s}\n### Лишний раздел\n`)],
  ['P9: отсутствующий файл', 'P9', async (f) => withHub(f, (s) => s.replace('../governance/PRODUCT_CONSTITUTION.md', '../governance/missing.md'))],
  ['P9: якорь в относительной ссылке', 'P9', async (f) => withHub(f, (s) => s.replace('../governance/PRODUCT_CONSTITUTION.md', '../governance/PRODUCT_CONSTITUTION.md#section'))],
  ['P10: первая строка без статуса', 'P10', async (f) => withSources(f, (s) => s.replace(PREFIX, '# Нет статуса'))],
  ['P10: страница системы без статуса', 'P10', async (f) => edit(chapterOf(f), (s) => s.replace(PREFIX, '# Нет статуса'))],
  ['P11: id критерия отсутствует', 'P11', async (f) => withHub(f, (s) => s.replace('| Выполнить действие | 01.01 |', '| Выполнить действие | 17.99 |'))],
  ['P11: неверный заголовок критериев', 'P11', async (f) => withHub(f, (s) => s.replace('| Критерий | id способностей |', '| Проверка | id способностей |'))],
  ['P11: отсутствует таблица части', 'P11', async (f) => withHub(f, (s) => s.replace('**Часть 1.** Проверка.', '**Секция 1.** Проверка.'))],
  ['P11: недопустимый итог критерия', 'P11', async (f) => withHub(f, (s) => s.replace('| — | не проверен |', '| — | готово |'))],
  ['P11: выполнен без доказательства', 'P11', async (f) => withHub(f, (s) => s.replace('| — | не проверен |', '|  | выполнен |'))],
  ['P11: выполнен с заглушкой вместо доказательства', 'P11', async (f) => withHub(f, (s) => s.replace('| — | не проверен |', '| — | выполнен |'))],
  ['P14a: статус источника изменён', 'P14', async (f) => withSources(f, (s) => s.replace('| governance-pc | GOVERNING |', '| governance-pc | ACTIVE |'))],
  ['P14b: статус изменён в индексе', 'P14', async (f) => edit(join(f.root, INDEX), (s) => s.replace('- [`docs/governance/PRODUCT_CONSTITUTION.md`](../../../../docs/governance/PRODUCT_CONSTITUTION.md) — продуктовая конституция;\n', '').replace('## 4. Explicit active contracts', '## 4. Explicit active contracts\n\n| Документ | Статус | Scope |\n|---|---|---|\n| [`docs/governance/PRODUCT_CONSTITUTION.md`](../../../../docs/governance/PRODUCT_CONSTITUTION.md) | `ACTIVE` | Продуктовая конституция. |'))],
  ['P13a: решение главы отсутствует в указателе', 'P13', async (f) => edit(chapterOf(f), (s) => s.replace('- **D1, 2026-10-21.**', '- **D2, 2026-10-21.**'))],
  ['P13b: глава указателя не содержит решение', 'P13', async (f) => withSources(f, (s) => s.replace('| D1 | 2026-10-21 | Пересказ решения для fixture. | 01 |', '| D1 | 2026-10-21 | Пересказ решения для fixture. | 02 |'))],
  ['P13: диапазон глав 01–20 требует решение в каждой главе', 'P13', async (f) => withSources(f, (s) => s.replace('Пересказ решения для fixture. | 01 |', 'Пересказ решения для fixture. | 01–20 |'))],
  ['P13: D274 требует прежнего указателя', 'P13', async (f) => edit(chapterOf(f), (s) => s.replace('Содержание Решения владельца.', 'Также D274.').replace('- **D1, 2026-10-21.**', '- **D274, 2026-10-21.**'))],
  ['P13: D275 без записи журнала', 'P13', async (f) => edit(chapterOf(f, '18'), (s) => s.replace('Содержание Решения владельца.', 'Также D275.'))],
  ['P13: будущее решение без записи журнала', 'P13', async (f) => edit(chapterOf(f), (s) => s.replace('Решение для fixture.', 'Решение для fixture. Также D300.'))],
  ['P4: прогресс перенесён из главы 11 в главу 3', 'P4', async (f) => withHub(f, (s) => {
    const start = s.indexOf('### Прогресс: игрок может…');
    const end = s.indexOf('## 12. Выпуск и бизнес', start);
    const progress = s.slice(start, end);
    return s.slice(0, start).concat(s.slice(end)).replace('## 3. Механики\n', `## 3. Механики\n\n${progress}`);
  })],
  ['P9: отсутствующий внутренний источник главы', 'P9', async (f) => edit(chapterOf(f), (s) => s.replace('Содержание Источники.', '[источник](../missing.md)'))],
  ['P12: источник главы не в реестре', 'P12', async (f) => {
    await writeFile(join(f.root, 'docs/README.md'), '# docs\n');
    await edit(chapterOf(f), (s) => s.replace('### Источники\n\nСодержание Источники.', '### Источники\n\n- [README](../../../docs/README.md) — карта.'));
  }]
];

for (const name of ['vision.md', 'questionnaire.md', 'decision-log.md', 'open-questions.md', 'ideas.md', 'STATE.md']) {
  red.push([`P8: отсутствует ${name}`, 'P8', async (f) => unlink(pathOf(f, name))]);
  red.push([`P10: нет префикса в ${name}`, 'P10', async (f) => edit(pathOf(f, name), (s) => s.replace(PREFIX, '# Нет статуса'))]);
}

for (const [name, rule, mutate] of red) {
  test(name, async (t) => {
    if (process.platform === 'win32' && /symlink|другом регистре/u.test(name)) {
      t.skip('Windows не даёт надёжно создать этот элемент fixture без специальных прав или учёта регистра.');
      return;
    }
    const f = await fixture();
    await mutate(f);
    const result = await checkDesignDocs(f.root, { trackedPaths: [SOURCE] });
    assert.ok(result.errors.some((item) => item.startsWith(`[GDD:${rule}]`)), result.errors.join('\n'));
  });
}

test('tracked вложенный prototype evidence не требует строки П1', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const nested = 'tools/cataclysm-prototype/evidence/task01-native/README.md';
  assert.equal(execFileSync('git', ['ls-files', '--error-unmatch', nested], { cwd: root, encoding: 'utf8' }).trim(), nested);
  const registry = await readFile(join(root, 'docs/design/SOURCES.md'), 'utf8');
  assert.ok(!registry.includes(`\`${nested}\``));
  const result = await checkDesignDocs(root);
  assert.deepEqual(result.errors, []);
});

test('tracked кириллический путь требует точную строку источника и проходит с ней', async () => {
  const f = await fixture();
  const name = 'docs/plans/проверка.md';
  await mkdir(join(f.root, 'docs/plans'));
  await writeFile(join(f.root, name), '# Проверка\n');
  execFileSync('git', ['init', '--quiet'], { cwd: f.root });
  execFileSync('git', ['add', '--', SOURCE, name], { cwd: f.root });
  const missing = await checkDesignDocs(f.root);
  assert.ok(missing.errors.includes(`[GDD:P1] отсутствует строка источника: ${name}`), missing.errors.join('\n'));
  await withSources(f, (s) => s.replace('|---|---|---|---|---|---|\n', `|---|---|---|---|---|---|\n| \`${name}\` | plan | нет в индексе | 01 | история | Проверка. |\n`));
  const present = await checkDesignDocs(f.root);
  assert.deepEqual(present.errors, []);
});

test('настоящая папка docs/design проходит все правила', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const result = await checkDesignDocs(root);
  assert.deepEqual(result.errors, []);
});

test('ссылки PC, AI, WR, AR и GS ведут к существующим разделам', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const governance = {
    PC: 'PRODUCT_CONSTITUTION.md',
    AI: 'ARCHITECTURE_INVARIANTS.md',
    WR: 'WORKFLOW_RULES.md',
    AR: 'AUDIT_RULES.md',
    GS: 'GIT_SAFETY_RULES.md'
  };
  const available = new Map();
  for (const [short, file] of Object.entries(governance)) {
    const content = await readFile(join(root, 'docs/governance', file), 'utf8');
    available.set(short, new Set([...content.matchAll(/^#{2,4} (\d+(?:\.\d+)*)\./gmu)].map((match) => match[1])));
  }
  const base = join(root, 'docs/design');
  const files = [
    ...(await readdir(base)).filter((name) => name.endsWith('.md')).map((name) => join(base, name)),
    ...(await readdir(join(base, 'systems'))).filter((name) => name.endsWith('.md')).map((name) => join(base, 'systems', name))
  ];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const match of content.matchAll(/\b(PC|AI|WR|AR|GS) §(\d+(?:\.\d+)*)/gu)) {
      assert.ok(available.get(match[1]).has(match[2]), `${file}: ${match[0]}`);
    }
  }
});
