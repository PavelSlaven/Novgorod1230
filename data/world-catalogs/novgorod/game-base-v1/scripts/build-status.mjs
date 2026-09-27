import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verdicts = ['approve_with_limits', 'approve', 'rework'];
const severity = { approve: 0, approve_with_limits: 1, rework: 2 };

function verdict(text) {
  const value = text.replace(/\*/g, '').trim().toLowerCase();
  return value.match(/^(approve_with_limits|approve|rework)(?=$|[\s(.,:;])/)?.[1] ?? null;
}

function clean(text) {
  return text.replace(/`|\*\*/g, '').trim();
}

function slug(text) {
  return clean(text).toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
}

function parse(group) {
  const lines = fs.readFileSync(path.join(base, group, 'VERIFICATION.md'), 'utf8').split(/\r?\n/);
  const files = new Map();
  const anchors = new Map();
  let heading = '';
  let inTable = false;
  let fileColumn = -1;
  let verdictColumn = -1;

  function record(file, status, anchor) {
    if (file && status && !file.toLowerCase().includes('итого')) files.set(file, { status, anchor });
  }

  for (const line of lines) {
    const match = line.match(/^#{1,6}\s+(.*)$/);
    if (match) {
      const baseSlug = slug(match[1]);
      const count = anchors.get(baseSlug) ?? 0;
      anchors.set(baseSlug, count + 1);
      heading = `${baseSlug}${count ? `-${count}` : ''}`;
      inTable = false;
      const dash = match[1].indexOf('—');
      if (dash !== -1 && /^#{2,5}\s/.test(line)) {
        const status = verdict(match[1].slice(dash + 1));
        for (const file of clean(match[1].slice(0, dash)).split(',').map(s => s.trim())) record(file, status, heading);
      }
      continue;
    }

    const bold = /\*\*([^*]+?)\s*—\s*([^*]+?)\*\*/g;
    for (const match of line.matchAll(bold)) {
      const token = clean(match[1]);
      if (!/[.\\/]/.test(token)) continue;
      const status = verdict(match[2]);
      for (const file of token.split(/\s*,\s*|\s+\/\s+/).map(s => s.trim())) record(file, status, heading);
    }

    if (!line.trim().startsWith('|')) { inTable = false; continue; }
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    const lower = cells.map(s => s.toLowerCase());
    const f = lower.findIndex(s => s.includes('файл') || s === 'file');
    const v = lower.findIndex(s => s.includes('вердикт') || s.includes('verdict'));
    if (f !== -1 && v !== -1) {
      inTable = true;
      fileColumn = f;
      verdictColumn = v;
      continue;
    }
    if (cells.every(s => /^:?-+:?$/.test(s))) continue;
    if (inTable && cells.length > Math.max(fileColumn, verdictColumn)) {
      record(clean(cells[fileColumn]), verdict(cells[verdictColumn]), heading);
    }
  }
  return files;
}

const groups = fs.readdirSync(base, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && fs.existsSync(path.join(base, entry.name, 'VERIFICATION.md')))
  .map(entry => entry.name).sort();
const results = groups.map(group => ({ group, files: parse(group) }));
const counts = { approve: 0, approve_with_limits: 0, rework: 0 };
const rows = ['# Статус проверки game-base-v1', '', 'Производная сводка по последнему verdict каждого файла в `VERIFICATION.md` групп. Данные остаются candidate; импорт в world_base требует отдельного решения.', '', '| Группа | Статус | approve | approve_with_limits | rework |', '|---|---|---:|---:|---:|'];
for (const { group, files } of results) {
  const local = { approve: 0, approve_with_limits: 0, rework: 0 };
  for (const { status } of files.values()) { local[status]++; counts[status]++; }
  const status = verdicts.filter(v => local[v]).sort((a, b) => severity[b] - severity[a])[0] ?? '—';
  rows.push(`| [${group}](${group}/VERIFICATION.md) | ${status} | ${local.approve} | ${local.approve_with_limits} | ${local.rework} |`);
}
rows.push(`| **Итого** | | **${counts.approve}** | **${counts.approve_with_limits}** | **${counts.rework}** |`, '', '## Вердикты по файлам', '');
for (const { group, files } of results) {
  rows.push(`### ${group}`, '', '| Файл | Последний verdict |', '|---|---|');
  for (const [file, { status, anchor }] of files) {
    rows.push(`| \`${file.replace(/\|/g, '\\|')}\` | [${status}](${group}/VERIFICATION.md#${anchor}) |`);
  }
  rows.push('');
}
fs.writeFileSync(path.join(base, 'STATUS.md'), rows.join('\n'));
console.log(JSON.stringify({ groups: results.length, files: Object.values(counts).reduce((a, b) => a + b, 0), ...counts }));
