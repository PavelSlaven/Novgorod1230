#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAP_DIRECTORY = 'docs/context/cdda-native-map';
export const BEGIN_MARKER = '<!-- BEGIN NEEDS TABLE -->';
export const END_MARKER = '<!-- END NEEDS TABLE -->';

const COVERAGE_VALUES = ['полное', 'частичное', 'нет'];
const CELL_COUNT = 8;
const LIMIT = 120;

export function splitRow(line) {
  const cells = [];
  let current = '';
  let inCode = false;
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '\\' && text[index + 1] === '|') {
      current += '|';
      index += 1;
      continue;
    }
    if (char === '`') inCode = !inCode;
    if (char === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeCoverage(cell) {
  const key = cell.toLowerCase().replace(/^[* ]+|[* ]+$/gu, '');
  if (key.startsWith('полн') || key === 'п' || key.startsWith('п (')) return 'полное';
  if (key.startsWith('част') || key === 'ч' || key.startsWith('ч (')) return 'частичное';
  if (key.startsWith('нет') || key === 'н' || key.startsWith('н (')) return 'нет';
  return cell;
}

function cut(text, limit) {
  let value = text.replaceAll('**', '');
  const points = Array.from(value);
  if (points.length > limit) {
    let head = points.slice(0, limit);
    const space = head.lastIndexOf(' ');
    if (space > limit * 0.6) head = head.slice(0, space);
    value = `${head.join('').replace(/[ ,;:.(]+$/u, '')}…`;
  }
  if (value.split('`').length % 2 === 0) value = `${value.replaceAll('…', '')}\`…`;
  return value.replaceAll('|', '\\|');
}

async function readAreaRows(mapDirectory) {
  const areaDirectory = join(mapDirectory, 'areas');
  const names = (await readdir(areaDirectory)).filter((name) => name.endsWith('.md')).sort();
  const rows = [];
  for (const name of names) {
    const lines = (await readFile(join(areaDirectory, name), 'utf8')).split(/\r\n|\r|\n/u);
    let inside = false;
    lines.forEach((line, index) => {
      const number = index + 1;
      if (line.startsWith('## 1')) {
        inside = true;
        return;
      }
      if (line.startsWith('## 2')) inside = false;
      if (!inside || !line.startsWith('|')) return;
      const cells = splitRow(line);
      if (/^:?-{2,}/u.test(cells[0]) || cells[0].startsWith('Нужда')) return;
      if (cells.length !== CELL_COUNT) {
        throw new Error(`${name}:${number}: expected ${CELL_COUNT} cells, got ${cells.length}`);
      }
      rows.push({ name, number, cells });
    });
  }
  return rows;
}

export async function buildNeedsTable(mapDirectory) {
  const lines = [
    '| Нужда Новгорода (источник) | Область | Родной механизм | Покрытие | Минимальное расширение |',
    '|---|---|---|---|---|'
  ];
  const stats = new Map();
  for (const { name, number, cells } of await readAreaRows(mapDirectory)) {
    let coverage = normalizeCoverage(cells[7]);
    const known = COVERAGE_VALUES.includes(coverage);
    const bucket = known ? coverage : 'иное';
    stats.set(bucket, (stats.get(bucket) ?? 0) + 1);
    if (!known) coverage = cut(coverage, 60);
    const link = `[${name.slice(0, -3)}:${number}](areas/${name})`;
    lines.push(`| ${cut(cells[0], LIMIT + 20)} | ${link} | ${cut(cells[1], LIMIT)} | ${coverage} | ${cut(cells[5], LIMIT)} |`);
  }
  return { table: lines.join('\n'), stats };
}

export async function renderIndex(mapDirectory) {
  const { table, stats } = await buildNeedsTable(mapDirectory);
  const path = join(mapDirectory, 'INDEX.md');
  const current = await readFile(path, 'utf8');
  const begin = current.indexOf(BEGIN_MARKER);
  const end = current.indexOf(END_MARKER);
  if (begin < 0 || end < begin) throw new Error(`${path}: needs-table markers are missing or out of order`);
  const next = `${current.slice(0, begin + BEGIN_MARKER.length)}\n${table}\n${current.slice(end)}`;
  const total = [...stats.values()].reduce((sum, count) => sum + count, 0);
  return { path, current, next, stats, total };
}

export async function checkNeedsTable(mapDirectory) {
  const { current, next, stats, total } = await renderIndex(mapDirectory);
  return { ok: current === next, stats, total };
}

export async function writeNeedsTable(mapDirectory) {
  const { path, next, stats, total } = await renderIndex(mapDirectory);
  await writeFile(path, next, 'utf8');
  return { stats, total };
}

async function main(argv) {
  const rootIndex = argv.indexOf('--root');
  const root = resolve(rootIndex >= 0 ? argv[rootIndex + 1] : join(dirname(fileURLToPath(import.meta.url)), '../../..'));
  const mapDirectory = join(root, MAP_DIRECTORY);
  const summary = (result) => `${result.total} rows ${JSON.stringify(Object.fromEntries(result.stats))}`;
  if (argv.includes('--check')) {
    const result = await checkNeedsTable(mapDirectory);
    if (!result.ok) {
      console.error(`CDDA native map needs table is stale (${summary(result)}); run: node tools/docs-tools/src/cdda-native-map-table.js`);
      process.exitCode = 1;
      return;
    }
    console.log(`CDDA native map needs table: OK (${summary(result)})`);
    return;
  }
  const result = await writeNeedsTable(mapDirectory);
  console.log(`CDDA native map needs table written (${summary(result)})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
