import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, '../infra/world-base/place_templates.seed.json');

/** @type {Array<Record<string, unknown>>} */
export const PLACE_TEMPLATES = JSON.parse(readFileSync(seedPath, 'utf8'));

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

const UPSERT_SQL = `INSERT INTO world_base.place_templates (
  id, slug, title, summary, place_kind,
  default_node_type, can_exist_inside_landscape, requires_water_nearby, requires_route_nearby, requires_land_use,
  compatible_landscape_template_ids, compatible_water_body_template_ids,
  compatible_route_template_ids, compatible_land_use_template_ids,
  typical_scale_level, settlement_density_effect,
  access_logic, social_logic, economic_logic, defense_logic,
  game_use, limits, status, confidence, sources, audit_notes
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  place_kind = EXCLUDED.place_kind,
  default_node_type = EXCLUDED.default_node_type,
  can_exist_inside_landscape = EXCLUDED.can_exist_inside_landscape,
  requires_water_nearby = EXCLUDED.requires_water_nearby,
  requires_route_nearby = EXCLUDED.requires_route_nearby,
  requires_land_use = EXCLUDED.requires_land_use,
  compatible_landscape_template_ids = EXCLUDED.compatible_landscape_template_ids,
  compatible_water_body_template_ids = EXCLUDED.compatible_water_body_template_ids,
  compatible_route_template_ids = EXCLUDED.compatible_route_template_ids,
  compatible_land_use_template_ids = EXCLUDED.compatible_land_use_template_ids,
  typical_scale_level = EXCLUDED.typical_scale_level,
  settlement_density_effect = EXCLUDED.settlement_density_effect,
  access_logic = EXCLUDED.access_logic,
  social_logic = EXCLUDED.social_logic,
  economic_logic = EXCLUDED.economic_logic,
  defense_logic = EXCLUDED.defense_logic,
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
    row.place_kind,
    emptyToNull(row.default_node_type),
    toBool(row.can_exist_inside_landscape),
    toBool(row.requires_water_nearby),
    toBool(row.requires_route_nearby),
    toBool(row.requires_land_use),
    JSON.stringify(toJsonArray(row.compatible_landscape_template_ids)),
    JSON.stringify(toJsonArray(row.compatible_water_body_template_ids)),
    JSON.stringify(toJsonArray(row.compatible_route_template_ids)),
    JSON.stringify(toJsonArray(row.compatible_land_use_template_ids)),
    emptyToNull(row.typical_scale_level),
    emptyToNull(row.settlement_density_effect),
    emptyToNull(row.access_logic),
    emptyToNull(row.social_logic),
    emptyToNull(row.economic_logic),
    emptyToNull(row.defense_logic),
    emptyToNull(row.game_use),
    emptyToNull(row.limits),
    row.status,
    row.confidence,
    JSON.stringify(toJsonArray(row.sources)),
    emptyToNull(row.audit_notes),
  ];
}

const client = new Client({ connectionString: getAdminUrl() });

const isDirectRun = process.argv[1]?.endsWith('seed-place-templates.js');

if (isDirectRun) {
  try {
    await client.connect();

    for (const row of PLACE_TEMPLATES) {
      await client.query(UPSERT_SQL, rowParams(row));
    }

    const seedIds = PLACE_TEMPLATES.map((r) => r.id);
    try {
      await client.query(
        'DELETE FROM world_base.place_templates WHERE NOT (id = ANY($1::text[]))',
        [seedIds],
      );
    } catch (deleteError) {
      if (deleteError.code === '23503') {
        console.warn(
          'place_templates: skipping DELETE of stale ids — FK references exist (region_place_templates, places, region_place_generation_rules, …)',
        );
      } else {
        throw deleteError;
      }
    }

    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM world_base.place_templates');
    console.log(`place_templates: ${rows[0].count} rows (expected ${PLACE_TEMPLATES.length})`);
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  } finally {
    await client.end();
  }
}
