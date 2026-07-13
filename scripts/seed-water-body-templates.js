import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, '../infra/world-base/water_body_templates.seed.json');

/** @type {Array<Record<string, unknown>>} */
export const WATER_BODY_TEMPLATES = JSON.parse(readFileSync(seedPath, 'utf8'));

/** @param {unknown} v */
function emptyToNull(v) {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
}

/** @param {unknown} v */
function toBool(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

/** @param {unknown} v */
function toSources(v) {
  if (Array.isArray(v)) return v;
  const s = String(v ?? '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

const UPSERT_SQL = `INSERT INTO world_base.water_body_templates (
  id, slug, title, summary, water_body_type, salinity, flow_type,
  typical_depth, typical_width, drinkable_default,
  supports_boat, supports_fishing, supports_ford, supports_ferry,
  supports_bridge, supports_winter_crossing, freeze_pattern,
  flood_risk, base_crossing_risk, navigation_use, water_hazard_notes,
  game_use, limits, status, confidence, sources, audit_notes
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  water_body_type = EXCLUDED.water_body_type,
  salinity = EXCLUDED.salinity,
  flow_type = EXCLUDED.flow_type,
  typical_depth = EXCLUDED.typical_depth,
  typical_width = EXCLUDED.typical_width,
  drinkable_default = EXCLUDED.drinkable_default,
  supports_boat = EXCLUDED.supports_boat,
  supports_fishing = EXCLUDED.supports_fishing,
  supports_ford = EXCLUDED.supports_ford,
  supports_ferry = EXCLUDED.supports_ferry,
  supports_bridge = EXCLUDED.supports_bridge,
  supports_winter_crossing = EXCLUDED.supports_winter_crossing,
  freeze_pattern = EXCLUDED.freeze_pattern,
  flood_risk = EXCLUDED.flood_risk,
  base_crossing_risk = EXCLUDED.base_crossing_risk,
  navigation_use = EXCLUDED.navigation_use,
  water_hazard_notes = EXCLUDED.water_hazard_notes,
  game_use = EXCLUDED.game_use,
  limits = EXCLUDED.limits,
  status = EXCLUDED.status,
  confidence = EXCLUDED.confidence,
  sources = EXCLUDED.sources,
  audit_notes = EXCLUDED.audit_notes,
  updated_at = now()`;

/** @param {Record<string, unknown>} row */
function rowParams(row) {
  return [
    row.id,
    row.slug,
    row.title,
    emptyToNull(row.summary),
    row.water_body_type,
    row.salinity,
    emptyToNull(row.flow_type),
    emptyToNull(row.typical_depth),
    emptyToNull(row.typical_width),
    emptyToNull(row.drinkable_default),
    toBool(row.supports_boat),
    toBool(row.supports_fishing),
    toBool(row.supports_ford),
    toBool(row.supports_ferry),
    toBool(row.supports_bridge),
    toBool(row.supports_winter_crossing),
    emptyToNull(row.freeze_pattern),
    emptyToNull(row.flood_risk),
    emptyToNull(row.base_crossing_risk),
    emptyToNull(row.navigation_use),
    emptyToNull(row.water_hazard_notes),
    emptyToNull(row.game_use),
    emptyToNull(row.limits),
    row.status,
    row.confidence,
    JSON.stringify(toSources(row.sources)),
    emptyToNull(row.audit_notes),
  ];
}

const client = new Client({ connectionString: getAdminUrl() });

const isDirectRun = process.argv[1]?.endsWith('seed-water-body-templates.js');

if (isDirectRun) {
  try {
    await client.connect();

    for (const row of WATER_BODY_TEMPLATES) {
      await client.query(UPSERT_SQL, rowParams(row));
    }

    const seedIds = WATER_BODY_TEMPLATES.map((r) => r.id);
    try {
      await client.query(
        'DELETE FROM world_base.water_body_templates WHERE NOT (id = ANY($1::text[]))',
        [seedIds],
      );
    } catch (deleteError) {
      if (deleteError.code === '23503') {
        console.warn(
          'water_body_templates: skipping DELETE of stale ids — FK references exist (graph_nodes, region_water_body_templates, …)',
        );
      } else {
        throw deleteError;
      }
    }

    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM world_base.water_body_templates');
    console.log(`water_body_templates: ${rows[0].count} rows (expected ${WATER_BODY_TEMPLATES.length})`);
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  } finally {
    await client.end();
  }
}
