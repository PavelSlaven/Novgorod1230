import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkDesignDocs } from '../src/design-docs.js';

const PREFIX = '> status: REFERENCE / DOMAIN GUIDE. Проверочная страница. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.';
const SOURCE = 'docs/governance/PRODUCT_CONSTITUTION.md';
const HEADINGS = [
  'Замысел', 'Что может игрок', 'Родное CDDA', 'Наш слой и владелец',
  'Решения владельца', 'Расхождения и открытые вопросы', 'Источники', 'Этап'
];
const HUB_HEADINGS = [
  'О документе', 'Игра коротко', 'Основа: CDDA и наш слой', 'Системы', 'Этапы',
  'Прогресс: игрок может…', 'Старый движок', 'Открытые вопросы владельцу', 'Словарь'
];

function ability(id) {
  return `Выполнить действие главы ${id.slice(0, 2)}.`;
}

function chapter(number) {
  const id = `${number}.01`;
  return [
    PREFIX, '', `# Глава ${number}`, '',
    ...HEADINGS.flatMap((heading) => {
      if (heading === 'Что может игрок') return [`## ${heading}`, '', `- **${id}.** ${ability(id)}`, ''];
      if (heading === 'Решения владельца' && number === '01') return [`## ${heading}`, '', '- **D1, 2026-10-21.** Решение для fixture.', ''];
      return [`## ${heading}`, '', `Содержание ${heading}.`, ''];
    })
  ].join('\n');
}

function hub() {
  const rows = [];
  for (let number = 1; number <= 17; number += 1) {
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
    '## Этапы', '',
    '| Этап | Цель | Зависит от | Статус | Проверено способностей |',
    '|---|---|---|---|---|',
    '| 0. База CDDA | Основа | — | идёт | 1 из 17 |',
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
    '## Прогресс: игрок может…', '',
    '| id | Игрок может… | Глава | Этап/часть | Статус | Доказательство |',
    '|---|---|---|---|---|---|',
    ...rows, ''
  ]);
  return [PREFIX, '', '# Игра', '', ...HUB_HEADINGS.flatMap((name) => section.get(name))].join('\n');
}

function sources() {
  return [
    PREFIX, '', '# Источники', '', '## Источники', '',
    '| Путь | Вид | Статус по CONTRACT_INDEX | Главы | Судьба при CDDA | Основание |',
    '|---|---|---|---|---|---|',
    `| \`${SOURCE}\` | governance-pc | GOVERNING | 01–17 | живёт как норма | §3 живёт как норма на пути CDDA. |`,
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
  await writeFile(join(root, SOURCE), '# PC\n');
  await writeFile(join(design, 'GDD.md'), hub());
  await writeFile(join(design, 'SOURCES.md'), sources());
  for (let number = 1; number <= 17; number += 1) {
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

const red = [
  ['P1: отсутствующий tracked источник', 'P1', async (f) => withSources(f, (s) => s.replace(`| \`${SOURCE}\` | governance-pc | GOVERNING | 01–17 | живёт как норма | §3 живёт как норма на пути CDDA. |\n`, ''))],
  ['P2: лишний отсутствующий путь', 'P2', async (f) => withSources(f, (s) => s.replace('|---|---|---|---|---|---|', '|---|---|---|---|---|---|\n| `docs/governance/missing.md` | guide | нет в индексе | 01 | история | Старый текст. |'))],
  ['P2: путь является каталогом', 'P2', async (f) => withSources(f, (s) => s.replace('|---|---|---|---|---|---|', '|---|---|---|---|---|---|\n| `docs/governance` | guide | нет в индексе | 01 | история | Каталог. |'))],
  ['P3: неверный заголовок', 'P3', async (f) => withSources(f, (s) => s.replace('| Вид |', '| Тип |'))],
  ['P3: шестая судьба', 'P3', async (f) => withSources(f, (s) => s.replace('| живёт как норма |', '| архив |'))],
  ['P3: смешанная судьба', 'P3', async (f) => withSources(f, (s) => s.replace('| живёт как норма | §3 живёт как норма', '| история | §3 живёт как норма'))],
  ['P4: неверный id', 'P4', async (f) => withHub(f, (s) => s.replace('| 04.01 |', '| 18.01 |'))],
  ['P4: повторный id', 'P4', async (f) => withHub(f, (s) => s.replace('| 04.01 |', '| 03.01 |'))],
  ['P5: текст главы иной', 'P5', async (f) => edit(chapterOf(f), (s) => s.replace('Выполнить действие главы 01.', 'Выполнить иное действие главы 01.'))],
  ['P5: id отсутствует в главе', 'P5', async (f) => edit(chapterOf(f), (s) => s.replace('- **01.01.** Выполнить действие главы 01.', ''))],
  ['P5: лишний id в главе', 'P5', async (f) => edit(chapterOf(f), (s) => s.replace('- **01.01.**', '- **01.02.**'))],
  ['P6: пятый статус', 'P6', async (f) => withHub(f, (s) => s.replace('| 04 | 0 | не начато |', '| 04 | 0 | готово |'))],
  ['P7: нет протокола', 'P7', async (f) => withHub(f, (s) => s.replace('[протокол](../governance/PRODUCT_CONSTITUTION.md)', ''))],
  ['P7: доказательство #832', 'P7', async (f) => withHub(f, (s) => s.replace('| 02 | 0 | в работе | #833 |', '| 02 | 0 | в работе | #832 |'))],
  ['P7: нет ссылки у отложенного', 'P7', async (f) => withHub(f, (s) => s.replace('[решение](../governance/PRODUCT_CONSTITUTION.md)', ''))],
  ['P7: лишнее доказательство у не начатого', 'P7', async (f) => withHub(f, (s) => s.replace('| 04 | 0 | не начато |  |', '| 04 | 0 | не начато | #833 |'))],
  ['P7: неверный K из N', 'P7', async (f) => withHub(f, (s) => s.replace('1 из 17', '0 из 17'))],
  ['P7: неизвестный статус этапа', 'P7', async (f) => withHub(f, (s) => s.replace('| 0. База CDDA | Основа | — | идёт |', '| 0. База CDDA | Основа | — | готово |'))],
  ['P7: преждевременное «сделано»', 'P7', async (f) => withHub(f, (s) => s.replace('| 0. База CDDA | Основа | — | идёт |', '| 0. База CDDA | Основа | — | сделано |'))],
  ['P7: N=0 нельзя сделать', 'P7', async (f) => withHub(f, (s) => s.replace('| 2. Этап | Цель | 0 | не начат | — |', '| 2. Этап | Цель | 0 | сделано | — |'))],
  ['P8: лишний md в корне', 'P8', async (f) => writeFile(pathOf(f, 'EXTRA.md'), '# extra')],
  ['P8: лишний не-md в корне', 'P8', async (f) => writeFile(pathOf(f, 'extra.txt'), 'extra')],
  ['P8: лишний md в systems', 'P8', async (f) => writeFile(join(f.systems, '18-extra.md'), '# extra')],
  ['P8: лишний не-md в systems', 'P8', async (f) => writeFile(join(f.systems, 'extra.txt'), 'extra')],
  ['P8: вложенная папка в корне', 'P8', async (f) => mkdir(pathOf(f, 'nested'))],
  ['P8: вложенная папка в systems', 'P8', async (f) => mkdir(join(f.systems, 'nested'))],
  ['P8: symlink файла в корне', 'P8', async (f) => symlink(pathOf(f, 'GDD.md'), pathOf(f, 'ALIAS.md'))],
  ['P8: symlink каталога в корне', 'P8', async (f) => symlink(f.systems, pathOf(f, 'alias'), 'dir')],
  ['P8: symlink файла в systems', 'P8', async (f) => symlink(chapterOf(f), join(f.systems, 'alias.md'))],
  ['P8: symlink каталога в systems', 'P8', async (f) => symlink(f.systems, join(f.systems, 'nested'), 'dir')],
  ['P8: имя в другом регистре', 'P8', async (f) => writeFile(pathOf(f, 'gdd.md'), hub())],
  ['P8: нет главы', 'P8', async (f) => unlink(chapterOf(f))],
  ['P8: неверный H2', 'P8', async (f) => edit(chapterOf(f), (s) => s.replace('## Родное CDDA', '## CDDA'))],
  ['P9: отсутствующий файл', 'P9', async (f) => withHub(f, (s) => s.replace('../governance/PRODUCT_CONSTITUTION.md', '../governance/missing.md'))],
  ['P9: якорь в относительной ссылке', 'P9', async (f) => withHub(f, (s) => s.replace('../governance/PRODUCT_CONSTITUTION.md', '../governance/PRODUCT_CONSTITUTION.md#section'))],
  ['P10: первая строка без статуса', 'P10', async (f) => withSources(f, (s) => s.replace(PREFIX, '# Нет статуса'))],
  ['P11: id критерия отсутствует', 'P11', async (f) => withHub(f, (s) => s.replace('| Выполнить действие | 01.01 |', '| Выполнить действие | 17.99 |'))],
  ['P11: неверный заголовок критериев', 'P11', async (f) => withHub(f, (s) => s.replace('| Критерий | id способностей |', '| Проверка | id способностей |'))],
  ['P11: отсутствует таблица части', 'P11', async (f) => withHub(f, (s) => s.replace('**Часть 1.** Проверка.', '**Секция 1.** Проверка.'))],
  ['P13a: решение главы отсутствует в указателе', 'P13', async (f) => edit(chapterOf(f), (s) => s.replace('- **D1, 2026-10-21.**', '- **D2, 2026-10-21.**'))],
  ['P13b: глава указателя не содержит решение', 'P13', async (f) => withSources(f, (s) => s.replace('| D1 | 2026-10-21 | Пересказ решения для fixture. | 01 |', '| D1 | 2026-10-21 | Пересказ решения для fixture. | 02 |'))],
  ['P12: источник главы не в реестре', 'P12', async (f) => {
    await writeFile(join(f.root, 'docs/README.md'), '# docs\n');
    await edit(chapterOf(f), (s) => s.replace('## Источники\n\nСодержание Источники.', '## Источники\n\n- [README](../../../docs/README.md) — карта.'));
  }]
];

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
    ...['GDD.md', 'SOURCES.md'].map((name) => join(base, name)),
    ...(await readdir(join(base, 'systems'))).map((name) => join(base, 'systems', name))
  ];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const match of content.matchAll(/\b(PC|AI|WR|AR|GS) §(\d+(?:\.\d+)*)/gu)) {
      assert.ok(available.get(match[1]).has(match[2]), `${file}: ${match[0]}`);
    }
  }
});
