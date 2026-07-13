/**
 * Генерирует SCHEMA_REFERENCE.md из schema.sql + architecture md + field-descriptions.js
 * ponytail: без зависимостей, regex/line scan
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TABLE_GROUPS,
  TABLE_PURPOSE_FALLBACK,
  common,
  fields,
  STATUS_VALUES,
  CONFIDENCE_VALUES
} from '../infra/world-base/field-descriptions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCHEMA_PATH = resolve(ROOT, 'infra/world-base/schema.sql');
const ARCH_PATH = resolve(
  ROOT,
  'DOCUMENTS/documents-kg/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md'
);
const OUT_INFRA = resolve(ROOT, 'infra/world-base/SCHEMA_REFERENCE.md');
const OUT_CORPUS = resolve(
  ROOT,
  'DOCUMENTS/documents-kg/corpus/DOCUMENTS/world_base_schema_reference.md'
);

const HEADER =
  '<!-- Сгенерировано scripts/generate-schema-reference.js — не редактировать вручную -->\n\n';

const TABLE_CHECK_SUMMARIES = {
  graph_nodes:
    'G1 + region_cell: обязательны grid_x, grid_y, grid_z, cell_size_km, crossing_base_gu, crossing_base_time_hours, region_cell_status, primary_landscape_template_id.',
  graph_edges:
    'offroad_crossing → landscape_template_id; river/lake_route/sea_route/ford/ferry/bridge → water_body_template_id; road/path/forest_track/winter_road/portage/corridor_segment → route_template_id.'
};

function parseSchema(sql) {
  const tables = new Map();
  const re = /CREATE TABLE world_base\.(\w+)\s*\(/g;
  let match;
  while ((match = re.exec(sql)) !== null) {
    const name = match[1];
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < sql.length && depth > 0) {
      if (sql[i] === '(') depth += 1;
      if (sql[i] === ')') depth -= 1;
      i += 1;
    }
    const body = sql.slice(start, i - 1);
    tables.set(name, parseTableBody(body));
  }
  return { tables, indexes: parsePartialIndexes(sql) };
}

function parsePartialIndexes(sql) {
  const byTable = new Map();
  const re =
    /CREATE UNIQUE INDEX IF NOT EXISTS (\w+)\s+ON world_base\.(\w+)\s*\(([^)]+)\)\s+WHERE\s+([^;]+);/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const [, , table, cols, where] = m;
    const list = byTable.get(table) ?? [];
    list.push(`UNIQUE (${cols.trim()}) WHERE ${where.trim()}`);
    byTable.set(table, list);
  }
  return byTable;
}

function parseTableBody(body) {
  const columns = [];
  const tableChecks = [];
  const chunks = splitTopLevelCommas(body);
  for (const chunk of chunks) {
    const line = chunk.trim();
    if (!line || line.startsWith('PRIMARY KEY') || line.startsWith('FOREIGN KEY') || line.startsWith('UNIQUE')) {
      continue;
    }
    if (/^CHECK\s*\(/i.test(line)) {
      tableChecks.push(line);
      continue;
    }
    const colMatch = line.match(/^(\w+)\s+(\w+)/);
    if (!colMatch) continue;
    const colName = colMatch[1];
    let pgType = colMatch[2];
    if (pgType === 'CHARACTER' || pgType === 'TIMESTAMP') {
      pgType = line.includes('TIMESTAMPTZ') ? 'TIMESTAMPTZ' : pgType;
    }
    const rest = line.slice(colMatch[0].length);
    const constraints = [];
    if (/PRIMARY KEY/i.test(line)) constraints.push('PK');
    if (/NOT NULL/i.test(line)) constraints.push('NOT NULL');
    const defMatch = rest.match(/DEFAULT\s+([^,\s]+(?:\s*::\w+)?)/i);
    if (defMatch) constraints.push(`DEFAULT ${defMatch[1].replace(/\s*::\w+/g, '')}`);
    const fkMatch = rest.match(/REFERENCES world_base\.(\w+)\((\w+)\)/i);
    if (fkMatch) constraints.push(`FK → ${fkMatch[1]}(${fkMatch[2]})`);
    if (/\bCHECK\s*\(/i.test(chunk)) {
      const vals = extractCheckValues(chunk);
      if (vals.length) constraints.push(`CHECK: ${vals.join(', ')}`);
    }
    columns.push({ name: colName, type: pgType, constraints: constraints.join('; ') || '—' });
  }
  return { columns, tableChecks };
}

function splitTopLevelCommas(text) {
  const parts = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function extractCheckValues(chunk) {
  const inIdx = chunk.search(/\bIN\s*\(/i);
  if (inIdx < 0) return [];
  return [...chunk.slice(inIdx).matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function parseArchitectureMd(text) {
  const tablePurposes = new Map();
  const graphPurposes = new Map();

  const numbered = /# \d+\.\s*`(\w+)`/g;
  let m;
  while ((m = numbered.exec(text)) !== null) {
    const table = m[1];
    if (table === 'routes') continue;
    const slice = text.slice(m.index, text.indexOf('\n# ', m.index + 1));
    tablePurposes.set(table, extractPurpose(slice));
  }

  const graphSection = /### 13\.\d+\.\s*`(\w+)`/g;
  while ((m = graphSection.exec(text)) !== null) {
    const table = m[1];
    const slice = text.slice(m.index, text.indexOf('\n### ', m.index + 1));
    graphPurposes.set(table, extractPurpose(slice));
  }

  for (const [k, v] of graphPurposes) {
    if (v && !tablePurposes.has(k)) tablePurposes.set(k, v);
  }
  return tablePurposes;
}

function extractPurpose(section) {
  if (/удалена из ручной базы/i.test(section)) return null;

  const narrated = section.match(/`(\w+)`\s+([^\n`]+)/);
  if (narrated) {
    const text = narrated[2].trim();
    if (text.length > 12 && /[а-яА-ЯёЁa-zA-Z]{3,}/.test(text) && !/^[a-z_]+$/.test(text)) {
      return capitalizeFirst(text.replace(/\.\s*$/, '')) + '.';
    }
  }

  const parts = section.split('```');
  if (parts.length >= 3) {
    const afterList = parts.slice(2).join('```');
    for (const line of afterList.split('\n')) {
      const t = line.trim();
      if (t.length > 40 && /[а-яА-ЯёЁ]/.test(t) && !t.startsWith('|') && !t.startsWith('#')) {
        return t;
      }
    }
  }

  return null;
}

function capitalizeFirst(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function heuristicDescription(table, col) {
  const snake = col.replace(/_id$/, '').replace(/_/g, ' ');
  const known = {
    slug: 'машиночитаемый ключ',
    canonical_name: 'каноническое имя',
    display_name: 'отображаемое имя',
    alt_names: 'альтернативные имена (JSON)',
    period_start_year: 'начальный год периода действия',
    period_end_year: 'конечный год периода действия',
    visible_signs: 'видимые признаки (JSON)',
    hidden_notes: 'скрытые заметки (не для игрока)',
    known_to_commoners: 'что знают простые люди',
    known_to_traders: 'что знают торговцы',
    known_to_elites: 'что знают элиты',
    known_to_clergy: 'что знают духовенство',
    llm_generation_rules: 'правила генерации для LLM (JSON)',
    npc_generation_rules: 'правила генерации NPC (JSON)'
  };
  if (known[col]) return known[col].charAt(0).toUpperCase() + known[col].slice(1) + '.';
  if (col.endsWith('_summary')) return `Сводка: ${snake}.`;
  if (col.endsWith('_rules')) return `Правила: ${snake}.`;
  if (col.endsWith('_level')) return `Уровень: ${snake}.`;
  if (col.endsWith('_band')) return `Диапазон/полоса: ${snake}.`;
  if (col.endsWith('_ids') || col.startsWith('linked_')) return `JSON-список ссылок: ${col}.`;
  if (col.startsWith('is_')) return `Флаг: ${snake}.`;
  if (col.startsWith('requires_')) return `Требуется ли ${snake.replace('requires ', '')}.`;
  if (col.startsWith('typical_')) return `Типичные ${snake.replace('typical ', '')} (JSON или текст).`;
  if (col.startsWith('applies_to_')) return `Применяется к: ${snake.replace('applies to ', '')} (JSON).`;
  return `Поле «${col}» таблицы ${table}; см. architecture doc.`;
}

function fieldDescription(table, col) {
  if (fields[table]?.[col]) return fields[table][col];
  if (common[col]) {
    if ((col === 'status' || col === 'confidence') && common[col].includes('см.')) {
      return common[col];
    }
    return common[col];
  }
  return heuristicDescription(table, col);
}

function renderCommonFieldsSection() {
  const rows = [
    'id',
    'slug',
    'title',
    'summary',
    'region_id',
    'game_use',
    'limits',
    'status',
    'confidence',
    'sources',
    'audit_notes',
    'created_at',
    'updated_at'
  ];
  let md = '## Общие поля\n\n';
  md += 'Многие справочные таблицы повторяют этот набор. `status` — рабочий процесс; `confidence` — эпистемическая уверенность.\n\n';
  md += '| Поле | Назначение |\n|------|------------|\n';
  for (const col of rows) {
    md += `| \`${col}\` | ${common[col] || '—'} |\n`;
  }
  md += `\n**status:** ${STATUS_VALUES}\n\n`;
  md += `**confidence:** ${CONFIDENCE_VALUES}\n\n`;
  return md;
}

function renderTable(tableName, tableMeta, purpose, tableIndexes) {
  const columns = tableMeta.columns ?? tableMeta;
  const tableChecks = tableMeta.tableChecks ?? [];
  let md = `### \`${tableName}\`\n\n`;
  const p =
    purpose && !/^[a-z][a-z0-9_]*$/i.test(purpose.trim())
      ? purpose
      : TABLE_PURPOSE_FALLBACK[tableName] || null;
  md += p ? `${p}\n\n` : '_Назначение: см. read_only_database_and_graph_architecture.md_\n\n';
  md += '| Поле | Тип | Ограничения | Назначение |\n';
  md += '|------|-----|-------------|------------|\n';
  for (const col of columns) {
    const desc = fieldDescription(tableName, col.name).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    md += `| \`${col.name}\` | \`${col.type}\` | ${col.constraints} | ${desc} |\n`;
  }
  md += '\n';
  if (tableChecks.length) {
    md += '**Ограничения таблицы:**\n\n';
    for (const check of tableChecks) {
      const summary = TABLE_CHECK_SUMMARIES[tableName];
      md += summary ? `- ${summary}\n` : `- \`${check.replace(/\s+/g, ' ').slice(0, 120)}…\`\n`;
    }
    md += '\n';
  }
  if (tableIndexes?.length) {
    md += '**Индексы:**\n\n';
    for (const idx of tableIndexes) {
      md += `- \`${idx}\`\n`;
    }
    md += '\n';
  }
  return md;
}

function buildDocument(tables, purposes, indexes) {
  const orderedNames = TABLE_GROUPS.flatMap((g) => g.tables);
  const missing = [...tables.keys()].filter((t) => !orderedNames.includes(t));
  if (missing.length) {
    console.warn('Tables not in TABLE_GROUPS:', missing.join(', '));
  }

  let md = HEADER;
  md += '# Справочник схемы world_base\n\n';
  md += `Схема PostgreSQL \`world_base\`: **${tables.size}** read-only таблиц для ручного заполнения в NocoDB.\n\n`;
  md += 'Каноническая архитектура: [read_only_database_and_graph_architecture.md](../../DOCUMENTS/documents-kg/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md).\n\n';
  md += 'DDL: [schema.sql](./schema.sql). Регенерация: `npm run world-db:schema-doc`.\n\n';
  md += '---\n\n';
  md += renderCommonFieldsSection();

  for (const group of TABLE_GROUPS) {
    md += `## ${group.title}\n\n`;
    for (const tableName of group.tables) {
      const tableMeta = tables.get(tableName);
      if (!tableMeta) {
        md += `### \`${tableName}\`\n\n_Таблица не найдена в schema.sql_\n\n`;
        continue;
      }
      const purpose =
        purposes.get(tableName) ||
        TABLE_PURPOSE_FALLBACK[tableName] ||
        null;
      md += renderTable(tableName, tableMeta, purpose, indexes.get(tableName));
    }
  }

  md += '---\n\n';
  md += `*Сгенерировано: ${new Date().toISOString().slice(0, 10)} · таблиц: ${tables.size}*\n`;
  return md;
}

function main() {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  const arch = readFileSync(ARCH_PATH, 'utf8');
  const { tables, indexes } = parseSchema(sql);
  const fromGroups = TABLE_GROUPS.flatMap((g) => g.tables).sort();
  const fromDdl = [...tables.keys()].sort();
  if (fromGroups.join() !== fromDdl.join()) {
    throw new Error(
      `TABLE_GROUPS != schema.sql: groups=${fromGroups.length} ddl=${fromDdl.length}`
    );
  }
  const purposes = parseArchitectureMd(arch);
  const doc = buildDocument(tables, purposes, indexes);

  writeFileSync(OUT_INFRA, doc, 'utf8');
  writeFileSync(OUT_CORPUS, doc, 'utf8');

  console.log(`schema tables: ${tables.size}`);
  console.log(`written: ${OUT_INFRA}`);
  console.log(`written: ${OUT_CORPUS}`);

  const gn = tables.get('graph_nodes')?.columns;
  if (!gn?.some((c) => c.name === 'grid_x')) throw new Error('graph_nodes missing grid_x');
  if (!sql.includes('region_cell')) throw new Error('schema missing region_cell');
  if (tables.has('routes')) throw new Error('legacy routes table still in schema');
}

main();
