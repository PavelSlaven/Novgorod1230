import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

const EDGE_MODIFIERS = [
  {
    id: 'mod_offroad_forest',
    title: 'Offroad through forest',
    modifier_type: 'terrain',
    applies_to_edge_type: 'offroad_crossing',
    applies_to_terrain_type: 'forest',
    landscape_template_id: 'forest_mixed',
    applies_to_season: null,
    multiplier: 2,
    summary: 'Движение через лес без дороги примерно вдвое медленнее нормального пути.',
    status: 'approved',
    confidence: 'medium',
  },
  {
    id: 'mod_offroad_swamp',
    title: 'Offroad through swamp',
    modifier_type: 'terrain',
    applies_to_edge_type: 'offroad_crossing',
    applies_to_terrain_type: 'swamp',
    landscape_template_id: 'swamp',
    applies_to_season: null,
    multiplier: 3,
    summary: 'Движение через болото без дороги крайне медленное и может быть невозможно без обхода.',
    status: 'approved',
    confidence: 'medium',
  },
  {
    id: 'mod_offroad_snow',
    title: 'Offroad through snow',
    modifier_type: 'season',
    applies_to_edge_type: 'offroad_crossing',
    applies_to_terrain_type: null,
    applies_to_season: 'winter',
    multiplier: 1.5,
    summary: 'Снег замедляет движение без дороги; устойчивый наст или зимник должен оформляться отдельным edge_type.',
    status: 'approved',
    confidence: 'medium',
  },
  {
    id: 'mod_offroad_rasputitsa',
    title: 'Offroad during rasputitsa',
    modifier_type: 'season',
    applies_to_edge_type: 'offroad_crossing',
    applies_to_terrain_type: null,
    applies_to_season: 'rasputitsa',
    multiplier: 2,
    summary: 'Весенняя или осенняя распутица резко ухудшает движение вне дороги.',
    status: 'approved',
    confidence: 'medium',
  },
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

const client = new Client({ connectionString: getAdminUrl() });

try {
  await client.connect();

  for (const row of EDGE_MODIFIERS) {
    await client.query(
      `INSERT INTO world_base.graph_edge_modifiers (
        id, title, modifier_type, applies_to_edge_type, applies_to_terrain_type,
        landscape_template_id, applies_to_season, multiplier, summary, status, confidence
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        modifier_type = EXCLUDED.modifier_type,
        applies_to_edge_type = EXCLUDED.applies_to_edge_type,
        applies_to_terrain_type = EXCLUDED.applies_to_terrain_type,
        landscape_template_id = EXCLUDED.landscape_template_id,
        applies_to_season = EXCLUDED.applies_to_season,
        multiplier = EXCLUDED.multiplier,
        summary = EXCLUDED.summary,
        status = EXCLUDED.status,
        confidence = EXCLUDED.confidence,
        updated_at = now()`,
      [
        row.id, row.title, row.modifier_type, row.applies_to_edge_type,
        row.applies_to_terrain_type, row.landscape_template_id ?? null,
        row.applies_to_season, row.multiplier,
        row.summary, row.status, row.confidence,
      ],
    );
  }

  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM world_base.graph_edge_modifiers');
  console.log(`graph_edge_modifiers: ${rows[0].count} rows (expected >= 4)`);
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
} finally {
  await client.end();
}
