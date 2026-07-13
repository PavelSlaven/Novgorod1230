import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

const checkOnly = process.argv.includes('--check');

const V2_TABLES = [
  'graph_scale_rules',
  'graph_edge_modifiers',
  'landscape_templates',
  'water_body_templates',
  'route_templates',
  'land_use_templates',
  'place_templates',
  'source_records',
  'regions',
  'region_landscape_templates',
  'region_water_body_templates',
  'region_land_use_templates',
  'region_place_templates',
  'region_neighbors',
  'region_laws',
  'region_economy',
  'region_social_roles',
  'region_occupations',
  'region_place_generation_rules',
  'region_material_culture',
  'region_risks',
  'conflict_templates',
  'rumor_templates',
  'price_bands',
  'seasonal_rules',
  'religious_context',
  'region_npc_knowledge',
  'region_npc_generation_rules',
  'place_generation_limits',
  'llm_context_packs',
  'llm_validation_rules',
  'region_gaps',
  'places',
  'graph_nodes',
  'graph_edges',
  'historical_anchors',
  'historical_events',
  'historical_figures',
  'place_locations',
  'place_minilocations',
  'scene_anchors',
  'place_buildings',
  'historical_event_phases',
  'item_templates',
  'building_templates',
  'location_object_rules',
  'weather_profiles',
  'graph_edge_knowledge_rules',
  'record_sources',
  'audit_log'
];

function getAdminUrl() {
  const direct = String(process.env.WORLD_DB_ADMIN_URL ?? '').trim();
  if (direct) return direct;

  const user = process.env.POSTGRES_USER || 'world_admin';
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? '');
  const db = process.env.POSTGRES_DB || 'world_db';
  const port = process.env.POSTGRES_PORT || '5432';
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

async function runSchema(client) {
  const schemaPath = resolve(import.meta.dirname, '../infra/world-base/schema.sql');
  await client.query(readFileSync(schemaPath, 'utf8'));
}

async function printCounts(client) {
  let totalRows = 0;

  for (const table of V2_TABLES) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM world_base.${table}`);
    const count = rows[0].count;
    totalRows += count;
    console.log(`${table}: ${count}`);
  }

  console.log(`tables: ${V2_TABLES.length}, total rows: ${totalRows}`);
  return { tables: V2_TABLES.length, totalRows };
}

const client = new Client({ connectionString: getAdminUrl() });

try {
  await client.connect();

  if (!checkOnly) {
    await runSchema(client);
    console.log(`schema applied: ${V2_TABLES.length} tables (empty, manual fill via NocoDB)`);
  }

  const { tables, totalRows } = await printCounts(client);

  if (tables !== 50) {
    throw new Error(`expected 50 tables, found ${tables}`);
  }
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
} finally {
  await client.end();
}
