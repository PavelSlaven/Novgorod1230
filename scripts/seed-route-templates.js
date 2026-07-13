import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, '../infra/world-base/route_templates.seed.json');

/** @type {Array<Record<string, unknown>>} */
export const ROUTE_TEMPLATES = JSON.parse(readFileSync(seedPath, 'utf8'));

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

/** @param {unknown} v */
function toMultiplier(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

const UPSERT_SQL = `INSERT INTO world_base.route_templates (
  id, slug, title, summary, route_kind, default_edge_type, surface_type,
  requires_landscape_template, requires_water_body_template,
  supports_pedestrian, supports_horse, supports_cart, supports_sled, supports_boat,
  seasonal_availability, default_access_rule, default_orientation_difficulty,
  default_risk_level, default_movement_multiplier, game_use, limits,
  status, confidence, sources, audit_notes
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  route_kind = EXCLUDED.route_kind,
  default_edge_type = EXCLUDED.default_edge_type,
  surface_type = EXCLUDED.surface_type,
  requires_landscape_template = EXCLUDED.requires_landscape_template,
  requires_water_body_template = EXCLUDED.requires_water_body_template,
  supports_pedestrian = EXCLUDED.supports_pedestrian,
  supports_horse = EXCLUDED.supports_horse,
  supports_cart = EXCLUDED.supports_cart,
  supports_sled = EXCLUDED.supports_sled,
  supports_boat = EXCLUDED.supports_boat,
  seasonal_availability = EXCLUDED.seasonal_availability,
  default_access_rule = EXCLUDED.default_access_rule,
  default_orientation_difficulty = EXCLUDED.default_orientation_difficulty,
  default_risk_level = EXCLUDED.default_risk_level,
  default_movement_multiplier = EXCLUDED.default_movement_multiplier,
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
    row.route_kind,
    emptyToNull(row.default_edge_type),
    emptyToNull(row.surface_type),
    toBool(row.requires_landscape_template),
    toBool(row.requires_water_body_template),
    toBool(row.supports_pedestrian),
    toBool(row.supports_horse),
    toBool(row.supports_cart),
    toBool(row.supports_sled),
    toBool(row.supports_boat),
    emptyToNull(row.seasonal_availability),
    emptyToNull(row.default_access_rule),
    emptyToNull(row.default_orientation_difficulty),
    emptyToNull(row.default_risk_level),
    toMultiplier(row.default_movement_multiplier),
    emptyToNull(row.game_use),
    emptyToNull(row.limits),
    row.status,
    row.confidence,
    JSON.stringify(toSources(row.sources)),
    emptyToNull(row.audit_notes),
  ];
}

const client = new Client({ connectionString: getAdminUrl() });

const isDirectRun = process.argv[1]?.endsWith('seed-route-templates.js');

if (isDirectRun) {
  try {
    await client.connect();

    for (const row of ROUTE_TEMPLATES) {
      await client.query(UPSERT_SQL, rowParams(row));
    }

    const seedIds = ROUTE_TEMPLATES.map((r) => r.id);
    try {
      await client.query(
        'DELETE FROM world_base.route_templates WHERE NOT (id = ANY($1::text[]))',
        [seedIds],
      );
    } catch (deleteError) {
      if (deleteError.code === '23503') {
        console.warn(
          'route_templates: skipping DELETE of stale ids — FK references exist (graph_edges.route_template_id, …)',
        );
      } else {
        throw deleteError;
      }
    }

    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM world_base.route_templates');
    console.log(`route_templates: ${rows[0].count} rows (expected ${ROUTE_TEMPLATES.length})`);
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  } finally {
    await client.end();
  }
}
