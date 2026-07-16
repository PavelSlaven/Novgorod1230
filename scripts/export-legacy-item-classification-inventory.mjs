import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { buildLegacyClassificationInventory, LEGACY_CLASSIFICATION_FIELD_REGISTRY } from '../tools/world-catalog-workflow/src/index.js';

const args = parseArgs(process.argv.slice(2));
const databaseUrl = process.env.DATABASE_URL ?? process.env.RUS_WORLD_DATABASE_URL;
if (!args.out) throw new Error('LEGACY_INVENTORY_OUTPUT_REQUIRED');
if (!databaseUrl) {
  if (!args.allowUnverified) throw new Error('LEGACY_DATABASE_URL_REQUIRED');
  const result = buildLegacyClassificationInventory({ source: { kind: args.sourceKind, verified: false, verification_reason: 'database_url_not_provided' }, exported_at: args.exportedAt });
  await writeJson(args.out, result);
  process.stdout.write(`${JSON.stringify({ pass: false, issue: 'LEGACY_SOURCE_NOT_VERIFIED', out: args.out })}\n`);
  process.exitCode = 2;
} else {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const client = await pool.connect();
  try {
    const identity = (await client.query("SELECT current_database() AS database, current_user AS database_user, current_setting('server_version') AS server_version")).rows[0];
    const rowsByTable = {}; const tableAvailability = {};
    for (const [table, fields] of Object.entries(LEGACY_CLASSIFICATION_FIELD_REGISTRY)) {
      const columns = await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'world_base' AND table_name = $1 ORDER BY ordinal_position", [table]);
      const available = new Set(columns.rows.map((row) => row.column_name));
      tableAvailability[table] = available.size > 0;
      if (!available.has('id')) { rowsByTable[table] = []; continue; }
      const selected = ['id', ...fields.map((field) => field.name).filter((name) => available.has(name))];
      rowsByTable[table] = (await client.query(`SELECT ${selected.map(quoteIdentifier).join(', ')} FROM world_base.${quoteIdentifier(table)} ORDER BY id`)).rows;
    }
    const inventoryExists = (await client.query("SELECT to_regclass('world_base.item_classification_migration_inventory')::text AS name")).rows[0]?.name;
    const categoryExists = (await client.query("SELECT to_regclass('world_base.universal_categories')::text AS name")).rows[0]?.name;
    const existingResolutions = inventoryExists ? (await client.query('SELECT * FROM world_base.item_classification_migration_inventory ORDER BY legacy_table_name, legacy_record_id, legacy_field_name')).rows : [];
    const approvedCategoryIds = categoryExists ? (await client.query("SELECT id FROM world_base.universal_categories WHERE status = 'approved' ORDER BY id")).rows.map((row) => row.id) : [];
    const result = buildLegacyClassificationInventory({ source: { kind: args.sourceKind, verified: true, identity: { ...identity, schema: 'world_base', table_availability: tableAvailability } }, rows_by_table: rowsByTable, existing_resolutions: existingResolutions, approved_category_ids: approvedCategoryIds, exported_at: args.exportedAt ?? new Date().toISOString() });
    await writeJson(args.out, result);
    process.stdout.write(`${JSON.stringify({ pass: true, source_verified: true, legacy_field_row_count: result.legacy_field_row_count, resolution_counts: result.resolution_counts, out: args.out })}\n`);
  } finally { client.release(); await pool.end(); }
}

function parseArgs(values) { const result = { out: null, sourceKind: 'postgresql', exportedAt: null, allowUnverified: false }; for (let i = 0; i < values.length; i += 1) { const value = values[i]; if (value === '--out') result.out = resolve(values[++i]); else if (value === '--source-kind') result.sourceKind = values[++i]; else if (value === '--exported-at') result.exportedAt = values[++i]; else if (value === '--allow-unverified') result.allowUnverified = true; else throw new Error(`LEGACY_INVENTORY_ARGUMENT_UNKNOWN:${value}`); } if (!['postgresql','nocodb_postgresql_backend','operator_database'].includes(result.sourceKind)) throw new Error('LEGACY_SOURCE_KIND_INVALID'); return result; }
function quoteIdentifier(value) { if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error(`LEGACY_SQL_IDENTIFIER_INVALID:${value}`); return `"${value}"`; }
async function writeJson(path, value) { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
