import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BEGIN_MARKER,
  END_MARKER,
  MAP_DIRECTORY,
  buildNeedsTable,
  checkNeedsTable,
  splitRow,
  writeNeedsTable
} from '../src/cdda-native-map-table.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const HEADER = '| Нужда | Механизм | Файл | Символ | Заметка | Расширение | Источник | Покрытие |';
const SEPARATOR = '|---|---|---|---|---|---|---|---|';

function area(rows) {
  return ['# Область', '', '## 1. Нужды', '', HEADER, SEPARATOR, ...rows, '', '## 2. Прочее', '', '| a | b |', ''].join('\n');
}

async function createFixture() {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'novgorod-cdda-map-'));
  const mapDirectory = join(fixtureRoot, MAP_DIRECTORY);
  await mkdir(join(mapDirectory, 'areas'), { recursive: true });
  await writeFile(
    join(mapDirectory, 'areas', '01-first.md'),
    area([
      '| **Часы** | `calendar::turn` | `src/calendar.cpp:10` | sym | note | Тик по часам | src | **Полное** |',
      '| Ночь \\| день | `a \\| b` | f | s | n | Расширить | src | ч (кроме ночи) |'
    ])
  );
  await writeFile(
    join(mapDirectory, 'areas', '02-second.md'),
    area(['| Сохранение | `savegame` | f | s | n | Копия каталога | src | Нет |', '| Погода | w | f | s | n | e | src | см. ниже |'])
  );
  await writeFile(
    join(mapDirectory, 'INDEX.md'),
    ['# Индекс', '', BEGIN_MARKER, 'stale', END_MARKER, '', 'tail', ''].join('\n')
  );
  return { fixtureRoot, mapDirectory };
}

test('splitRow keeps escaped pipes and code spans inside one cell', () => {
  assert.deepEqual(splitRow('| a \\| b | `c | d` | e |'), ['a | b', '`c | d`', 'e']);
});

test('needs table is assembled from area tables and counts coverage buckets', async () => {
  const { fixtureRoot, mapDirectory } = await createFixture();
  try {
    const { table, stats } = await buildNeedsTable(mapDirectory);
    const lines = table.split('\n');
    assert.equal(lines.length, 6);
    assert.ok(lines[2].startsWith('| Часы | [01-first:7](areas/01-first.md) | `calendar::turn` | полное | Тик по часам |'));
    assert.ok(lines[3].includes('Ночь \\| день'));
    assert.ok(lines[3].includes('| частичное |'));
    assert.ok(lines[4].includes('| нет |'));
    assert.ok(lines[5].includes('| см. ниже |'));
    assert.deepEqual(Object.fromEntries(stats), { полное: 1, частичное: 1, нет: 1, иное: 1 });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('check detects a stale table and passes after the table is written', async () => {
  const { fixtureRoot, mapDirectory } = await createFixture();
  try {
    assert.equal((await checkNeedsTable(mapDirectory)).ok, false);
    const written = await writeNeedsTable(mapDirectory);
    assert.equal(written.total, 4);
    assert.equal((await checkNeedsTable(mapDirectory)).ok, true);

    const index = await readFile(join(mapDirectory, 'INDEX.md'), 'utf8');
    assert.ok(index.endsWith('\ntail\n'));
    await writeFile(join(mapDirectory, 'areas', '01-first.md'), area(['| Часы | m | f | s | n | Другое | src | Нет |']));
    assert.equal((await checkNeedsTable(mapDirectory)).ok, false);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('a row with the wrong number of cells is rejected', async () => {
  const { fixtureRoot, mapDirectory } = await createFixture();
  try {
    await writeFile(join(mapDirectory, 'areas', '01-first.md'), area(['| только | три | ячейки |']));
    await assert.rejects(() => buildNeedsTable(mapDirectory), /01-first\.md:7: expected 8 cells, got 3/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('the committed CDDA native map needs table is up to date', async () => {
  const result = await checkNeedsTable(join(root, MAP_DIRECTORY));
  assert.equal(result.ok, true);
  assert.ok(result.total > 0);
});
