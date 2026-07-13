import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, '../infra/world-base/land_use_templates.seed.json');

/** @type {Array<Record<string, unknown>>} */
export const LAND_USE_TEMPLATES = JSON.parse(readFileSync(seedPath, 'utf8'));

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
function toJsonArray(v) {
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

const UPSERT_SQL = `INSERT INTO world_base.land_use_templates (
  id, slug, title, summary, land_use_kind,
  requires_settlement_nearby, requires_water_nearby, requires_specific_landscape,
  compatible_landscape_template_ids, compatible_water_body_template_ids,
  seasonal_pattern, labor_intensity, economic_use,
  visibility_effect, movement_effect, risk_effect,
  game_use, limits, status, confidence, sources, audit_notes
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  land_use_kind = EXCLUDED.land_use_kind,
  requires_settlement_nearby = EXCLUDED.requires_settlement_nearby,
  requires_water_nearby = EXCLUDED.requires_water_nearby,
  requires_specific_landscape = EXCLUDED.requires_specific_landscape,
  compatible_landscape_template_ids = EXCLUDED.compatible_landscape_template_ids,
  compatible_water_body_template_ids = EXCLUDED.compatible_water_body_template_ids,
  seasonal_pattern = EXCLUDED.seasonal_pattern,
  labor_intensity = EXCLUDED.labor_intensity,
  economic_use = EXCLUDED.economic_use,
  visibility_effect = EXCLUDED.visibility_effect,
  movement_effect = EXCLUDED.movement_effect,
  risk_effect = EXCLUDED.risk_effect,
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
    row.land_use_kind,
    toBool(row.requires_settlement_nearby),
    toBool(row.requires_water_nearby),
    toBool(row.requires_specific_landscape),
    JSON.stringify(toJsonArray(row.compatible_landscape_template_ids)),
    JSON.stringify(toJsonArray(row.compatible_water_body_template_ids)),
    emptyToNull(row.seasonal_pattern),
    emptyToNull(row.labor_intensity),
    emptyToNull(row.economic_use),
    emptyToNull(row.visibility_effect),
    emptyToNull(row.movement_effect),
    emptyToNull(row.risk_effect),
    emptyToNull(row.game_use),
    emptyToNull(row.limits),
    row.status,
    row.confidence,
    JSON.stringify(toJsonArray(row.sources)),
    emptyToNull(row.audit_notes),
  ];
}

const client = new Client({ connectionString: getAdminUrl() });

const isDirectRun = process.argv[1]?.endsWith('seed-land-use-templates.js');

if (isDirectRun) {
  try {
    await client.connect();

    for (const row of LAND_USE_TEMPLATES) {
      await client.query(UPSERT_SQL, rowParams(row));
    }

    const seedIds = LAND_USE_TEMPLATES.map((r) => r.id);
    try {
      await client.query(
        'DELETE FROM world_base.land_use_templates WHERE NOT (id = ANY($1::text[]))',
        [seedIds],
      );
    } catch (deleteError) {
      if (deleteError.code === '23503') {
        console.warn(
          'land_use_templates: skipping DELETE of stale ids — FK references exist (region_land_use_templates, place_templates.compatible_land_use_template_ids, …)',
        );
      } else {
        throw deleteError;
      }
    }

    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM world_base.land_use_templates');
    console.log(`land_use_templates: ${rows[0].count} rows (expected ${LAND_USE_TEMPLATES.length})`);
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  } finally {
    await client.end();
  }
}
