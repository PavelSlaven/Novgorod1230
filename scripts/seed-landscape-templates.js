import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, '../infra/world-base/landscape_templates.seed.json');

/** @type {Array<Record<string, unknown>>} */
export const LANDSCAPE_TEMPLATES = JSON.parse(readFileSync(seedPath, 'utf8'));

/** @param {unknown} v */
function emptyToNull(v) {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s;
}

/** @param {unknown} v */
function toMultiplier(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

const UPSERT_SQL = `INSERT INTO world_base.landscape_templates (
  id, slug, title, parent_landscape_template_id, landscape_group, base_environment,
  dominant_vegetation, forest_type, moisture_level, relief_type, soil_ground_type,
  openness, seasonal_stability, summary,
  base_movement_multiplier, default_orientation_difficulty, base_risk_level,
  game_use, limits, status, confidence, sources, audit_notes
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  parent_landscape_template_id = EXCLUDED.parent_landscape_template_id,
  landscape_group = EXCLUDED.landscape_group,
  base_environment = EXCLUDED.base_environment,
  dominant_vegetation = EXCLUDED.dominant_vegetation,
  forest_type = EXCLUDED.forest_type,
  moisture_level = EXCLUDED.moisture_level,
  relief_type = EXCLUDED.relief_type,
  soil_ground_type = EXCLUDED.soil_ground_type,
  openness = EXCLUDED.openness,
  seasonal_stability = EXCLUDED.seasonal_stability,
  summary = EXCLUDED.summary,
  base_movement_multiplier = EXCLUDED.base_movement_multiplier,
  default_orientation_difficulty = EXCLUDED.default_orientation_difficulty,
  base_risk_level = EXCLUDED.base_risk_level,
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
    emptyToNull(row.parent_landscape_template_id),
    row.landscape_group,
    row.base_environment,
    emptyToNull(row.dominant_vegetation),
    emptyToNull(row.forest_type),
    emptyToNull(row.moisture_level),
    emptyToNull(row.relief_type),
    emptyToNull(row.soil_ground_type),
    emptyToNull(row.openness),
    emptyToNull(row.seasonal_stability),
    emptyToNull(row.summary),
    toMultiplier(row.base_movement_multiplier),
    emptyToNull(row.default_orientation_difficulty),
    emptyToNull(row.base_risk_level),
    emptyToNull(row.game_use),
    emptyToNull(row.limits),
    row.status,
    row.confidence,
    JSON.stringify(toSources(row.sources)),
    emptyToNull(row.audit_notes),
  ];
}

const client = new Client({ connectionString: getAdminUrl() });

const isDirectRun = process.argv[1]?.endsWith('seed-landscape-templates.js');

if (isDirectRun) {
  try {
    await client.connect();

    for (const row of LANDSCAPE_TEMPLATES) {
      await client.query(UPSERT_SQL, rowParams(row));
    }

    const seedIds = LANDSCAPE_TEMPLATES.map((r) => r.id);
    try {
      await client.query(
        'DELETE FROM world_base.landscape_templates WHERE NOT (id = ANY($1::text[]))',
        [seedIds],
      );
    } catch (deleteError) {
      if (deleteError.code === '23503') {
        console.warn(
          'landscape_templates: skipping DELETE of stale ids — FK references exist (graph_nodes, region_landscape_templates, …)',
        );
      } else {
        throw deleteError;
      }
    }

    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM world_base.landscape_templates');
    console.log(`landscape_templates: ${rows[0].count} rows (expected ${LANDSCAPE_TEMPLATES.length})`);
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  } finally {
    await client.end();
  }
}
