import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verdicts = ['approve', 'approve_with_limits', 'rework'];
const extensions = /\.(?:cjs|csv|js|json|md|mjs|py|tsv)$/i;
const targetPattern = /(?:[\w.-]+\/)*[\w.-]+\.(?:cjs|csv|js|json|md|mjs|py|tsv)\b|(?:[\w.-]+\/)+/gi;

function verdict(text) {
  return text.replace(/\*/g, '').trim().toLowerCase().match(/^(approve_with_limits|approve|rework)(?=$|[\s(.,:;])/)?.[1] ?? null;
}

function clean(text) {
  return text.replace(/`|\*\*/g, '').trim();
}

function slug(text) {
  return clean(text).toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
}

function inventory(root) {
  const files = [];
  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${relative}/`);
      else if (entry.isFile() && extensions.test(entry.name)) files.push(relative);
    }
  }
  walk(root);
  return files.sort();
}

export function targets(raw, available) {
  const original = clean(raw);
  const readmeCount = original.match(/^README\.md\s*\(×(\d+)\)$/i);
  if (readmeCount) {
    const matches = available.filter(file => path.posix.basename(file) === 'README.md');
    return matches.length === Number(readmeCount[1])
      ? matches.map(file => ({ token: original, file }))
      : [{ token: original, reason: `ожидалось ${readmeCount[1]} README.md, найдено ${matches.length}`, candidates: matches }];
  }
  const groupReadme = /(?:the )?group README\.md|README\.md\s*\(группа\)/i.test(original);
  const normalized = original.replace(/\\/g, '/');
  const tokens = [...normalized.matchAll(targetPattern)].map(match => match[0]);
  if (groupReadme && !tokens.includes('README.md')) tokens.push('README.md');
  const known = new Set(available);
  const resolved = tokens.flatMap(token => {
    if (token.endsWith('/')) {
      const matches = available.filter(file => file.startsWith(token));
      return matches.length ? matches.map(file => ({ token, file })) : [{ token, reason: 'каталог пуст или не найден' }];
    }
    if (token === 'README.md' && groupReadme && known.has(token)) return [{ token, file: token }];
    if (known.has(token)) return [{ token, file: token }];
    const matches = available.filter(file => path.posix.basename(file) === path.posix.basename(token));
    if (matches.length === 1) return [{ token, file: matches[0] }];
    return [{ token, reason: matches.length ? 'неоднозначное имя' : 'файл не найден', candidates: matches }];
  });
  if (resolved.some(target => target.file)) return resolved;
  const basename = normalized.match(/^(.+?)\s+\([^()]+\)$/)?.[1];
  if (basename) {
    const directories = new Set(available.flatMap(file => {
      const parts = file.split('/');
      return parts.slice(0, -1).flatMap((part, index) =>
        part === basename ? [`${parts.slice(0, index + 1).join('/')}/`] : []);
    }));
    if (directories.size === 1) return targets([...directories][0], available);
  }
  return resolved.length ? resolved : [{ token: original, reason: 'нет пути к файлу или каталогу' }];
}

export function parse(groupRoot) {
  const lines = fs.readFileSync(path.join(groupRoot, 'VERIFICATION.md'), 'utf8').split(/\r?\n/);
  const available = inventory(groupRoot);
  const files = new Map();
  const unresolved = [];
  const anchors = new Map();
  let heading = '';
  let inTable = false;
  let fileColumn = -1;
  let verdictColumn = -1;

  function record(raw, status, line) {
    if (!status || !raw || raw.toLowerCase().includes('итого')) return;
    for (const target of targets(raw, available)) {
      const source = { status, anchor: heading, line };
      if (target.file) files.set(target.file, source);
      else unresolved.push({ ...target, original: clean(raw), ...source });
    }
  }

  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    const match = line.match(/^#{1,6}\s+(.*)$/);
    if (match) {
      const baseSlug = slug(match[1]);
      const count = anchors.get(baseSlug) ?? 0;
      anchors.set(baseSlug, count + 1);
      heading = `${baseSlug}${count ? `-${count}` : ''}`;
      inTable = false;
      const dash = match[1].indexOf('—');
      if (dash !== -1 && /^#{2,5}\s/.test(line)) record(match[1].slice(0, dash), verdict(match[1].slice(dash + 1)), number);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+?)\s+—\s+(.+)$/);
    if (bullet) {
      const status = verdict(bullet[2]);
      if (status && /[.\/]|README/i.test(bullet[1])) record(bullet[1], status, number);
    }

    const bold = /\*\*([^*]+?)\s*—\s*([^*]+?)\*\*/g;
    for (const match of line.matchAll(bold)) {
      if (/[.\/]|README/i.test(match[1])) record(match[1], verdict(match[2]), number);
    }

    if (!line.trim().startsWith('|')) { inTable = false; continue; }
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    const lower = cells.map(cell => cell.toLowerCase());
    const f = lower.findIndex(cell => cell.includes('файл') || cell === 'file');
    const v = lower.findIndex(cell => cell.includes('вердикт') || cell.includes('verdict'));
    if (f !== -1 && v !== -1) {
      inTable = true;
      fileColumn = f;
      verdictColumn = v;
      continue;
    }
    if (cells.every(cell => /^:?-+:?$/.test(cell))) continue;
    if (inTable && cells.length > Math.max(fileColumn, verdictColumn)) record(cells[fileColumn], verdict(cells[verdictColumn]), number);
  }
  return { files, unresolved };
}

function link(group, anchor) {
  return `${group}/VERIFICATION.md#${anchor}`;
}

function display(text) {
  return text.replace(/\|/g, '\\|').replace(/`/g, '\\`');
}

export function buildStatus(root = base) {
  const groups = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'VERIFICATION.md')))
    .map(entry => entry.name).sort();
  const results = groups.map(group => ({ group, ...parse(path.join(root, group)) }));
  const counts = { approve: 0, approve_with_limits: 0, rework: 0 };
  const rows = ['# Статус проверки game-base-v1', '', 'Производная сводка по последнему verdict каждого файла в `VERIFICATION.md` групп. Данные остаются candidate; импорт в world_base требует отдельного решения.', '', '| Группа | Статус | approve | approve_with_limits | rework |', '|---|---|---:|---:|---:|'];
  for (const { group, files } of results) {
    const local = { approve: 0, approve_with_limits: 0, rework: 0 };
    for (const { status } of files.values()) { local[status]++; counts[status]++; }
    const status = verdicts.toReversed().find(value => local[value]) ?? '—';
    rows.push(`| [${group}](${group}/VERIFICATION.md) | ${status} | ${local.approve} | ${local.approve_with_limits} | ${local.rework} |`);
  }
  rows.push(`| **Итого** | | **${counts.approve}** | **${counts.approve_with_limits}** | **${counts.rework}** |`, '', '## Вердикты по файлам', '');
  for (const { group, files } of results) {
    rows.push(`### ${group}`, '', '| Файл | Последний verdict |', '|---|---|');
    for (const [file, { status, anchor }] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
      rows.push(`| [\`${display(file)}\`](${group}/${file}) | [${status}](${link(group, anchor)}) |`);
    }
    rows.push('');
  }
  const unresolved = results.flatMap(({ group, unresolved }) => unresolved.map(row => ({ group, ...row })));
  rows.push('## Неразрешённые цели вердиктов', '', '| Группа | Исходная цель | Вердикт | Причина / кандидаты |', '|---|---|---|---|');
  for (const { group, original, token, status, anchor, reason, candidates = [] } of unresolved) {
    rows.push(`| ${group} | [\`${display(original)}\`](${link(group, anchor)}) | ${status} | \`${display(token)}\`: ${reason}${candidates.length ? ` (${candidates.map(display).join(', ')})` : ''} |`);
  }
  rows.push('');
  return { markdown: rows.join('\n'), counts: { groups: results.length, files: Object.values(counts).reduce((a, b) => a + b, 0), ...counts, unresolved: unresolved.length }, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { markdown, counts } = buildStatus();
  fs.writeFileSync(path.join(base, 'STATUS.md'), markdown);
  console.log(JSON.stringify(counts));
}
