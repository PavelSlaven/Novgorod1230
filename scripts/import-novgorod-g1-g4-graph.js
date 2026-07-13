import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;
const repoRoot = resolve(import.meta.dirname, '..');

export const NOVGOROD_G1_G4_TSV_ROOT = 'data/rus13-base-staging/nov_region_audit/novgorod_full_graph_g1_g4_v6_game_ready_EXTRACTED/novgorod_full_graph_g1_g4_v6_game_ready/tsv_import';
export const GRAPH_NODES_FILE = 'novgorod_graph_nodes_g1_g4_full_v6.tsv';
export const GRAPH_EDGES_FILE = 'novgorod_graph_edges_g1_g4_full_v6.tsv';
export const REFERENCE_NODE_FILES = [
  'novgorod_g2_g4_70_cells_v6_g1_cells.tsv',
  'novgorod_g2_g4_70_cells_v6_g2_zones.tsv',
  'novgorod_g2_g4_70_cells_v6_g3_places.tsv',
  'novgorod_g2_g4_70_cells_v6_g4_locations.tsv'
];

const REGION_ID = 'region_novgorod_land';
const GRAPH_NODE_COLUMNS = [
  'id',
  'slug',
  'title',
  'node_type',
  'scale_level',
  'parent_node_id',
  'region_id',
  'place_id',
  'grid_x',
  'grid_y',
  'grid_z',
  'region_cell_code',
  'cell_shape',
  'region_cell_status',
  'cell_size_km',
  'crossing_base_gu',
  'crossing_base_time_hours',
  'primary_landscape_template_id',
  'secondary_landscape_template_ids',
  'landscape_mix_notes',
  'primary_water_body_template_id',
  'secondary_water_body_template_ids',
  'hydrology_notes',
  'land_use_template_ids',
  'place_template_id',
  'terrain_profile',
  'water_profile',
  'road_profile',
  'settlement_density',
  'dominant_content',
  'known_landmarks',
  'canonical_corridors',
  'neighbor_node_ids',
  'historical_status',
  'is_known_to_player_default',
  'is_known_to_character_default',
  'summary',
  'status',
  'confidence',
  'sources',
  'audit_notes'
];
const GRAPH_EDGE_COLUMNS = [
  'id',
  'from_node_id',
  'to_node_id',
  'reverse_edge_id',
  'scale_level',
  'edge_type',
  'base_gu',
  'base_distance_km',
  'base_time_minutes',
  'base_time_hours',
  'base_time_days',
  'route_template_id',
  'landscape_template_id',
  'water_body_template_id',
  'terrain_type',
  'route_surface',
  'seasonal_rule',
  'access_rule',
  'risk_level',
  'known_to_commoners',
  'known_to_traders',
  'known_to_elites',
  'known_to_clergy',
  'known_to_character_default',
  'requires_guide',
  'requires_boat',
  'requires_horse',
  'requires_sled',
  'requires_permission',
  'requires_orientation_check',
  'orientation_difficulty',
  'movement_risk_profile',
  'failure_consequences',
  'historical_status',
  'status',
  'confidence',
  'sources',
  'audit_notes'
];
const JSON_COLUMNS = new Set([
  'secondary_landscape_template_ids',
  'secondary_water_body_template_ids',
  'land_use_template_ids',
  'known_landmarks',
  'canonical_corridors',
  'neighbor_node_ids',
  'movement_risk_profile',
  'failure_consequences',
  'sources'
]);
const BOOLEAN_COLUMNS = new Set([
  'is_known_to_player_default',
  'is_known_to_character_default',
  'requires_guide',
  'requires_boat',
  'requires_horse',
  'requires_sled',
  'requires_permission',
  'requires_orientation_check'
]);
const NUMBER_COLUMNS = new Set([
  'grid_x',
  'grid_y',
  'grid_z',
  'cell_size_km',
  'crossing_base_gu',
  'crossing_base_time_hours',
  'base_gu',
  'base_distance_km',
  'base_time_minutes',
  'base_time_hours',
  'base_time_days'
]);

export function defaultRoot(env = process.env) {
  return resolve(env.RUS13_NOVGOROD_G1_G4_TSV_ROOT || joinRepo(NOVGOROD_G1_G4_TSV_ROOT));
}

export function loadNovgorodG1G4GraphRecords(root = defaultRoot()) {
  const referenceRows = loadReferenceRows(root);
  const nodes = parseTsvFile(resolve(root, GRAPH_NODES_FILE)).map((row) => ({
    table: 'graph_nodes',
    row: normalizeRow(mapNodeRow({ ...row, ...(referenceRows.get(row.id) ?? {}) }), GRAPH_NODE_COLUMNS)
  }));
  const edges = parseTsvFile(resolve(root, GRAPH_EDGES_FILE)).map((row) => ({
    table: 'graph_edges',
    row: normalizeRow(mapEdgeRow(row), GRAPH_EDGE_COLUMNS)
  }));
  return [...nodes, ...edges];
}

export function summarizeRecords(records) {
  const counts = {};
  const byScale = { graph_nodes: {}, graph_edges: {} };
  for (const { table, row } of records) {
    counts[table] = (counts[table] ?? 0) + 1;
    byScale[table][row.scale_level] = (byScale[table][row.scale_level] ?? 0) + 1;
  }
  return { rows: records.length, counts, byScale };
}

export function buildSql(records) {
  return records.map(({ table, row }) => {
    if (table !== 'graph_nodes' && table !== 'graph_edges') {
      throw new Error(`Unsupported target table: ${table}`);
    }
    const entries = Object.entries(row).filter(([, value]) => value !== undefined);
    const columns = entries.map(([key]) => key);
    const values = entries.map(([, value]) => sqlLiteral(toPgValue(value)));
    const updates = columns.filter((column) => column !== 'id').map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
    return `INSERT INTO world_base.${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')};`;
  }).join('\n') + '\n';
}

export function parseTsvText(text) {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== '');
  const headers = splitTsvLine(lines.shift() ?? '');
  return lines.map((line) => Object.fromEntries(splitTsvLine(line).map((value, index) => [headers[index], value])));
}

function loadReferenceRows(root) {
  const rows = new Map();
  for (const fileName of REFERENCE_NODE_FILES) {
    const filePath = resolve(root, fileName);
    if (!existsSync(filePath)) continue;
    for (const row of parseTsvFile(filePath)) {
      if (row.id) rows.set(row.id, { ...(rows.get(row.id) ?? {}), ...row });
    }
  }
  return rows;
}

function mapNodeRow(row) {
  return {
    ...row,
    region_id: row.region_id || REGION_ID,
    historical_status: row.historical_status || row.evidence_status,
    region_cell_status: row.region_cell_status || (row.scale_level === 'G1' && row.node_type === 'region_cell' ? 'active' : undefined),
    is_known_to_player_default: row.is_known_to_player_default ?? row.known_to_player_default,
    is_known_to_character_default: row.is_known_to_character_default ?? row.known_to_character_default
  };
}

function mapEdgeRow(row) {
  return {
    ...row,
    historical_status: row.historical_status || row.evidence_status
  };
}

function normalizeRow(row, allowedColumns) {
  const normalized = {};
  for (const column of allowedColumns) {
    const value = row[column];
    const normalizedValue = normalizeValue(column, value);
    if (normalizedValue !== undefined) normalized[column] = normalizedValue;
  }
  return normalized;
}

function normalizeValue(column, value) {
  if (value === undefined) return undefined;
  if (BOOLEAN_COLUMNS.has(column) && (value === null || value === '')) return undefined;
  if (value === null || value === '') {
    if (JSON_COLUMNS.has(column)) return [];
    return null;
  }
  if (JSON_COLUMNS.has(column)) return parseJsonArray(value);
  if (BOOLEAN_COLUMNS.has(column)) return parseBoolean(value);
  if (NUMBER_COLUMNS.has(column)) return Number(value);
  return value;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  const text = String(value).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return text.split(/[;,\n]/u).map((item) => item.trim()).filter(Boolean);
  }
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return Boolean(text);
}

function parseTsvFile(path) {
  return parseTsvText(readFileSync(path, 'utf8'));
}

function splitTsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === '\t' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

async function applyRecords(records, databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const { table, row } of records) {
      await upsertRow(client, table, row);
    }
  } finally {
    await client.end().catch(() => {});
  }
}

async function upsertRow(client, table, row) {
  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const updates = columns.filter((column) => column !== 'id').map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
  await client.query(
    `INSERT INTO world_base.${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
    values.map(toPgValue)
  );
}

function toPgValue(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  return value;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/gu, '""')}"`;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function joinRepo(relativePath) {
  return resolve(repoRoot, relativePath);
}

function getAdminUrl() {
  const user = process.env.POSTGRES_USER || 'world_admin';
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? '');
  const db = process.env.POSTGRES_DB || 'world_db';
  const port = process.env.POSTGRES_PORT || '5432';
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

async function main() {
  await loadLocalEnv();
  const mode = readArg('--mode') || 'dry-run';
  const root = defaultRoot();
  const outSql = resolve(readArg('--output-sql') || joinRepo('data/novgorod-g1-g4-graph.sql'));
  const databaseUrl = process.env.WORLD_DB_ADMIN_URL || getAdminUrl();
  const records = loadNovgorodG1G4GraphRecords(root);
  const summary = { mode, root, ...summarizeRecords(records) };
  console.log(JSON.stringify(summary, null, 2));

  if (mode === 'dry-run') return;
  if (mode === 'emit-sql') {
    writeFileSync(outSql, buildSql(records), 'utf8');
    console.log(`SQL written: ${outSql}`);
    return;
  }
  if (mode === 'apply') {
    if (!databaseUrl) throw new Error('WORLD_DB_ADMIN_URL or POSTGRES_* is required for --mode apply.');
    await applyRecords(records, databaseUrl);
    console.log(`applied rows: ${records.length}`);
    return;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}
