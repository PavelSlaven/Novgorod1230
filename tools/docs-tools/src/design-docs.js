import { execFile } from 'node:child_process';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { splitRow } from './cdda-native-map-table.js';

const execFileAsync = promisify(execFile);
const PREFIX = '> status: REFERENCE / DOMAIN GUIDE.';
const DESIGN = 'docs/design';
const SOURCE_PATHS = [
  'data/knowledge-source/corpus/DOCUMENTS/*',
  'docs/governance/PRODUCT_CONSTITUTION.md',
  'docs/plans/*',
  'docs/adr/*',
  'docs/context/cdda-native-map/**',
  'docs/implementation/cataclysm-*',
  'tools/cataclysm-prototype/*.md',
  'docs/pipelines/*',
  'docs/domain/*',
  'docs/playtests/*'
].map((pattern) => `:(glob)${pattern}`);
const SOURCE_HEADER = ['Путь', 'Вид', 'Статус по CONTRACT_INDEX', 'Главы', 'Судьба при CDDA', 'Основание'];
const ABILITY_HEADER = ['id', 'Игрок может…', 'Глава', 'Этап/часть', 'Статус', 'Доказательство'];
const STAGE_HEADER = ['Этап', 'Цель', 'Зависит от', 'Статус', 'Проверено способностей'];
const CRITERION_HEADER = ['Критерий', 'id способностей', 'Доказательство', 'Итог'];
const DECISION_HEADER = ['D', 'Дата', 'Цитата или пересказ', 'Главы', 'URL GitHub, если есть'];
const CHAPTER_HEADINGS = [
  'Замысел', 'Что может игрок', 'Родное CDDA', 'Наш слой и владелец',
  'Решения владельца', 'Расхождения и открытые вопросы', 'Источники', 'Этап'
];
const HUB_HEADINGS = [
  'О документе', 'Игра коротко', 'Основа: CDDA и наш слой', 'Системы', 'Этапы',
  'Прогресс: игрок может…', 'Старый движок', 'Открытые вопросы владельцу', 'Словарь'
];
const FATES = new Set([
  'живёт как норма', 'живёт как справка', 'заменяется родным CDDA',
  'переписать на P7', 'история'
]);
const STATUSES = new Set(['проверено в игре', 'в работе', 'отложено', 'не начато']);
const ID = /\b\d{2}\.\d{2}\b/gu;

function error(rule, message) {
  return `[GDD:${rule}] ${message}`;
}

function lines(text) {
  return text.split(/\r\n|\n|\r/u);
}

function headingNames(text) {
  return lines(text).flatMap((line) => {
    const match = /^## (.+?)\s*$/u.exec(line);
    return match ? [match[1]] : [];
  });
}

function section(text, name) {
  const all = lines(text);
  const begin = all.findIndex((line) => line === `## ${name}`);
  if (begin < 0) return [];
  let end = begin + 1;
  while (end < all.length && !all[end].startsWith('## ')) end += 1;
  return all.slice(begin + 1, end);
}

function table(sectionLines, header) {
  const start = sectionLines.findIndex((line) => line.startsWith('|'));
  if (start < 0) return { header: [], rows: [] };
  const actualHeader = splitRow(sectionLines[start]);
  const separator = sectionLines[start + 1] ?? '';
  if (!separator.startsWith('|') || !splitRow(separator).every((cell) => /^:?-{3,}:?$/u.test(cell))) {
    return { header: actualHeader, rows: [] };
  }
  const rows = [];
  for (const line of sectionLines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(splitRow(line));
  }
  return { header: actualHeader, rows };
}

function sameHeader(actual, expected) {
  return actual.length === expected.length && actual.every((cell, index) => cell === expected[index]);
}

function chapterNumbers(value) {
  const numbers = new Set();
  for (const match of value.matchAll(/\b(0[1-9]|1[0-7])(?:[–-](0[1-9]|1[0-7]))?\b/gu)) {
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    for (let number = start; number <= end; number += 1) {
      numbers.add(String(number).padStart(2, '0'));
    }
  }
  return numbers;
}

function decisionNumbers(value) {
  const numbers = new Set();
  for (const match of value.matchAll(/\bD(\d+)(?:[–-]D?(\d+))?\b/gu)) {
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    for (let number = start; number <= end; number += 1) numbers.add(`D${number}`);
  }
  return numbers;
}

function markdownLinks(text) {
  return [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)].map((match) => match[1]);
}

function localPath(root, sourceRel, target) {
  if (/^https?:\/\//iu.test(target) || target.startsWith('mailto:')) return null;
  if (/^[a-z][a-z\d+.-]*:/iu.test(target) || target.startsWith('//')) return { invalid: true, target };
  const decoded = decodeURIComponent(target);
  if (isAbsolute(decoded) || decoded.includes('#')) return { invalid: true, target };
  const absolute = resolve(root, dirname(sourceRel), decoded);
  const within = relative(root, absolute);
  if (within === '..' || within.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    return { invalid: true, target };
  }
  return { absolute, target };
}

async function fileExists(path) {
  return (await lstat(path).catch(() => null))?.isFile() ?? false;
}

async function trackedSources(root) {
  const { stdout } = await execFileAsync('git', ['ls-files', ...SOURCE_PATHS], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  return stdout.trim().split(/\r?\n/u).filter(Boolean);
}

async function designFiles(root, errors) {
  const base = join(root, DESIGN);
  const top = await readdir(base).catch(() => null);
  if (!top) {
    errors.push(error('P8', 'недопустимый элемент или заголовок: docs/design/ отсутствует'));
    return new Map();
  }
  const files = new Map();
  const requiredTop = new Set(['GDD.md', 'SOURCES.md', 'systems']);
  for (const name of top) {
    const path = join(base, name);
    const info = await lstat(path);
    if (!requiredTop.has(name) || info.isSymbolicLink() ||
        (name === 'systems' ? !info.isDirectory() : !info.isFile())) {
      errors.push(error('P8', `недопустимый элемент или заголовок: docs/design/${name}`));
      continue;
    }
    if (name !== 'systems') files.set(`${DESIGN}/${name}`, await readFile(path, 'utf8'));
  }
  for (const name of ['GDD.md', 'SOURCES.md', 'systems']) {
    if (!top.includes(name)) errors.push(error('P8', `отсутствует элемент: docs/design/${name}`));
  }
  if (!top.includes('systems')) return files;
  const systemBase = join(base, 'systems');
  if (!(await lstat(systemBase)).isDirectory()) return files;
  const systems = await readdir(systemBase);
  const found = new Set();
  for (const name of systems) {
    const path = join(systemBase, name);
    const info = await lstat(path);
    const match = /^(0[1-9]|1[0-7])-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u.exec(name);
    if (!match || !info.isFile() || info.isSymbolicLink() || found.has(match[1])) {
      errors.push(error('P8', `недопустимый элемент или заголовок: docs/design/systems/${name}`));
      continue;
    }
    found.add(match[1]);
    files.set(`${DESIGN}/systems/${name}`, await readFile(path, 'utf8'));
  }
  for (let number = 1; number <= 17; number += 1) {
    const id = String(number).padStart(2, '0');
    if (!found.has(id)) errors.push(error('P8', `отсутствует глава: ${id}`));
  }
  return files;
}

export async function checkDesignDocs(rootDir = '.', { trackedPaths } = {}) {
  const root = resolve(rootDir);
  const errors = [];
  const files = await designFiles(root, errors);
  if (!files.size) return { ok: false, errors };
  for (const [path, content] of files) {
    if (!content.startsWith(PREFIX)) errors.push(error('P10', `отсутствует status-префикс: ${path}`));
    const expected = path.endsWith('/GDD.md') ? HUB_HEADINGS : path.includes('/systems/') ? CHAPTER_HEADINGS : null;
    if (expected && JSON.stringify(headingNames(content)) !== JSON.stringify(expected)) {
      errors.push(error('P8', `недопустимый элемент или заголовок: ${path}`));
    }
  }
  const sources = table(section(files.get(`${DESIGN}/SOURCES.md`) ?? '', 'Источники'), SOURCE_HEADER);
  if (!sameHeader(sources.header, SOURCE_HEADER)) errors.push(error('P3', 'неверная схема таблицы источников'));
  const sourceRows = sources.rows.filter((row) => row.length === 6);
  if (sources.rows.length !== sourceRows.length) errors.push(error('P3', 'неверная схема строки источника'));
  const sourceNames = new Set();
  for (const row of sourceRows) {
    const name = row[0].replaceAll('`', '');
    if (sourceNames.has(name)) errors.push(error('P3', `повторный путь источника: ${name}`));
    sourceNames.add(name);
    if (!FATES.has(row[4])) errors.push(error('P3', `неверная судьба источника: ${name}`));
    if (['заменяется родным CDDA', 'история'].includes(row[4]) &&
        /живёт как норма|переписать на P7/u.test(row[5])) {
      errors.push(error('P3', `смешанная судьба источника: ${name}`));
    }
    const target = localPath(root, `${DESIGN}/SOURCES.md`, `../../${name}`);
    if (target?.invalid || !await fileExists(target?.absolute)) {
      errors.push(error('P2', `путь реестра не является файлом: ${name}`));
    }
  }
  const required = trackedPaths ?? await trackedSources(root);
  for (const path of required) {
    if (!sourceNames.has(path)) errors.push(error('P1', `отсутствует строка источника: ${path}`));
  }
  const decisions = table(section(files.get(`${DESIGN}/SOURCES.md`) ?? '', 'Решения владельца'), DECISION_HEADER);
  const indexedDecisions = new Set();
  if (sameHeader(decisions.header, DECISION_HEADER)) {
    for (const row of decisions.rows) {
      if (row.length !== 5 || !/^D\d+$/u.test(row[0])) continue;
      for (const chapter of chapterNumbers(row[3])) indexedDecisions.add(`${row[0]}/${chapter}`);
    }
  }
  const chapterDecisions = new Set();
  for (const [path, content] of files) {
    if (!path.includes('/systems/')) continue;
    const chapter = /\/systems\/(\d{2})-/u.exec(path)?.[1];
    for (const decision of decisionNumbers(section(content, 'Решения владельца').join('\n'))) {
      chapterDecisions.add(`${decision}/${chapter}`);
    }
  }
  for (const key of new Set([...indexedDecisions, ...chapterDecisions])) {
    if (!indexedDecisions.has(key) || !chapterDecisions.has(key)) {
      errors.push(error('P13', `решение и указатель расходятся: ${key}`));
    }
  }
  const hub = files.get(`${DESIGN}/GDD.md`) ?? '';
  const abilities = table(section(hub, 'Прогресс: игрок может…'), ABILITY_HEADER);
  if (!sameHeader(abilities.header, ABILITY_HEADER)) errors.push(error('P4', 'неверная схема таблицы способностей'));
  const abilityById = new Map();
  const totals = new Map();
  for (const row of abilities.rows) {
    if (row.length !== 6) {
      errors.push(error('P4', 'неверная строка таблицы способностей'));
      continue;
    }
    const [id, description, chapter, stage, status, proof] = row;
    if (!/^(0[1-9]|1[0-7])\.\d{2}$/u.test(id) || abilityById.has(id)) {
      errors.push(error('P4', `неверный или повторный id способности: ${id}`));
      continue;
    }
    abilityById.set(id, { description, chapter, stage, status, proof });
    if (chapter !== id.slice(0, 2)) errors.push(error('P5', `глава способности не совпадает с id: ${id}`));
    if (!STATUSES.has(status)) errors.push(error('P6', `неизвестный статус способности: ${id}`));
    if (status === 'не начато' && proof.trim()) errors.push(error('P7', `доказательство не должно быть заполнено: ${id}`));
    if (status === 'в работе' && (!/(?:#|\/(?:issues|pull)\/)(?!832\b)\d+\b/u.test(proof) || /(?:#|\/(?:issues|pull)\/)832\b/u.test(proof))) {
      errors.push(error('P7', `доказательство «в работе» неверно: ${id}`));
    }
    if (status === 'отложено' && !markdownLinks(proof).length) {
      errors.push(error('P7', `доказательство «отложено» отсутствует: ${id}`));
    }
    if (status === 'проверено в игре') {
      const links = markdownLinks(proof);
      let valid = false;
      for (const link of links) {
        if (/^https:\/\/github\.com\//u.test(link)) valid = true;
        const local = localPath(root, `${DESIGN}/GDD.md`, link);
        if (local && !local.invalid && await fileExists(local.absolute)) valid = true;
      }
      if (!valid) errors.push(error('P7', `доказательство «проверено в игре» отсутствует: ${id}`));
    }
    const stageNumber = /^([0-5])(?:\s|$|\/)/u.exec(stage)?.[1];
    if (!stageNumber) {
      errors.push(error('P7', `этап способности неверен: ${id}`));
      continue;
    }
    const tally = totals.get(stageNumber) ?? { total: 0, checked: 0 };
    tally.total += 1;
    if (status === 'проверено в игре') tally.checked += 1;
    totals.set(stageNumber, tally);
  }
  for (const [path, content] of files) {
    if (!path.includes('/systems/')) continue;
    const number = /\/systems\/(\d{2})-/u.exec(path)?.[1];
    if (!number || JSON.stringify(headingNames(content)) !== JSON.stringify(CHAPTER_HEADINGS)) continue;
    const chapterAbilities = section(content, 'Что может игрок');
    const seen = new Set();
    for (const line of chapterAbilities) {
      const match = /^- \*\*(\d{2}\.\d{2})\.\*\* (.+)$/u.exec(line);
      if (!match) continue;
      seen.add(match[1]);
      const fromHub = abilityById.get(match[1]);
      if (!fromHub || match[1].slice(0, 2) !== number || fromHub.description !== match[2]) {
        errors.push(error('P5', `способность не совпадает с главой: ${match[1]}`));
      }
    }
    for (const [id] of abilityById) {
      if (id.startsWith(`${number}.`) && !seen.has(id)) errors.push(error('P5', `способность отсутствует в главе: ${id}`));
    }
    for (const link of markdownLinks(section(content, 'Источники').join('\n'))) {
      const target = localPath(root, path, link);
      if (!target || target.invalid) continue;
      const rel = relative(root, target.absolute).replaceAll('\\', '/');
      if (!sourceNames.has(rel)) errors.push(error('P12', `источник главы отсутствует в реестре: ${rel}`));
    }
  }
  const stages = table(section(hub, 'Этапы'), STAGE_HEADER);
  if (!sameHeader(stages.header, STAGE_HEADER)) errors.push(error('P7', 'неверная схема таблицы этапов'));
  const seenStages = new Set();
  for (const row of stages.rows) {
    if (row.length !== 5) {
      errors.push(error('P7', 'неверная строка таблицы этапов'));
      continue;
    }
    const number = /^([0-5])\./u.exec(row[0])?.[1];
    if (!number || seenStages.has(number)) {
      errors.push(error('P7', `неверный или повторный этап: ${row[0]}`));
      continue;
    }
    seenStages.add(number);
    const tally = totals.get(number) ?? { total: 0, checked: 0 };
    const expected = tally.total ? `${tally.checked} из ${tally.total}` : '—';
    if (row[4] !== expected) errors.push(error('P7', `счёт этапа неверен: ${number}, ожидается ${expected}`));
    if (!['сделано', 'идёт', 'не начат'].includes(row[3])) {
      errors.push(error('P7', `неизвестный статус этапа: ${number}`));
    }
    if (row[3] === 'сделано' && (tally.total === 0 || tally.checked !== tally.total)) {
      errors.push(error('P7', `статус этапа неверен: ${number}`));
    }
  }
  for (let number = 0; number <= 5; number += 1) {
    if (!seenStages.has(String(number))) errors.push(error('P7', `отсутствует этап: ${number}`));
  }
  const stageSection = section(hub, 'Этапы');
  const parts = stageSection.flatMap((line, index) => {
    const match = /^\*\*Часть ([1-7])\.\*\*/u.exec(line);
    return match ? [{ number: match[1], index }] : [];
  });
  for (let number = 1; number <= 7; number += 1) {
    const occurrences = parts.filter((part) => part.number === String(number));
    if (occurrences.length !== 1) {
      errors.push(error('P11', `ожидалась одна таблица критериев части ${number}`));
      continue;
    }
    const begin = occurrences[0].index + 1;
    const nextPart = parts.find((part) => part.index >= begin)?.index ?? stageSection.length;
    const nextStage = stageSection.findIndex((line, index) => index >= begin && /^### [2-5]\./u.test(line));
    const end = Math.min(nextPart, nextStage < 0 ? stageSection.length : nextStage);
    const block = stageSection.slice(begin, end);
    const tableStarts = block.flatMap((line, index) => line.startsWith('|') && (index === 0 || !block[index - 1].startsWith('|')) ? [index] : []);
    if (tableStarts.length !== 1) {
      errors.push(error('P11', `ожидалась одна таблица критериев части ${number}`));
      continue;
    }
    const criteria = table(block.slice(tableStarts[0]), CRITERION_HEADER);
    if (!sameHeader(criteria.header, CRITERION_HEADER) || criteria.rows.length === 0) {
      errors.push(error('P11', `неверная таблица критериев части ${number}`));
      continue;
    }
    for (const row of criteria.rows) {
      if (row.length !== 4) {
        errors.push(error('P11', `неверная строка критерия части ${number}`));
        continue;
      }
      const ids = row[1]?.match(ID) ?? [];
      if (!ids.length) errors.push(error('P11', `критерий без id: ${row[0] ?? ''}`));
      for (const id of ids) {
        if (!abilityById.has(id)) errors.push(error('P11', `критерий ссылается на неизвестный id: ${id}`));
      }
    }
  }
  for (const [path, content] of files) {
    for (const link of markdownLinks(content)) {
      const target = localPath(root, path, link);
      if (!target) continue;
      if (target.invalid || !await fileExists(target.absolute)) {
        errors.push(error('P9', `относительная ссылка недействительна: ${path} → ${link}`));
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
