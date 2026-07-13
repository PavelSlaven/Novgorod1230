import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

const { Client } = pg;

await loadLocalEnv();

const SCALE_RULES = [
  {
    id: 'graph_scale_G0',
    scale_level: 'G0',
    title: 'world_region',
    unit: 'route_chain',
    typical_edge_min: 3,
    typical_edge_max: 30,
    time_unit: 'travel_days',
    uses_gu: false,
    uses_minutes: false,
    summary: 'Связь регионов, дальние пути, политическое и торговое давление.',
    status: 'approved',
    confidence: 'high',
  },
  {
    id: 'graph_scale_G1',
    scale_level: 'G1',
    title: 'region_cell',
    unit: 'travel_day / GU',
    typical_edge_min: 8,
    typical_edge_max: 8,
    time_unit: 'GU',
    uses_gu: true,
    uses_minutes: false,
    summary: 'Базовое покрытие региона дневными квадратами 32×32 км; 1 клетка = 8 GU, пересечение около 1 дня.',
    status: 'approved',
    confidence: 'high',
  },
  {
    id: 'graph_scale_G2',
    scale_level: 'G2',
    title: 'cell_subgraph',
    unit: 'GU',
    typical_edge_min: 1,
    typical_edge_max: 8,
    time_unit: 'GU',
    uses_gu: true,
    uses_minutes: false,
    summary: 'Путь внутри G1-ячейки: дорога, лес, брод, деревня, берег, зимник.',
    status: 'approved',
    confidence: 'high',
  },
  {
    id: 'graph_scale_G3',
    scale_level: 'G3',
    title: 'place',
    unit: 'minutes',
    typical_edge_min: 15,
    typical_edge_max: 60,
    time_unit: 'min',
    uses_gu: false,
    uses_minutes: true,
    summary: 'Движение внутри города, села, монастыря, торга.',
    status: 'approved',
    confidence: 'high',
  },
  {
    id: 'graph_scale_G4',
    scale_level: 'G4',
    title: 'location',
    unit: 'minutes',
    typical_edge_min: 1,
    typical_edge_max: 15,
    time_unit: 'min',
    uses_gu: false,
    uses_minutes: true,
    summary: 'Двор → изба, ворота → пристань, улица → рынок.',
    status: 'approved',
    confidence: 'high',
  },
  {
    id: 'graph_scale_G5',
    scale_level: 'G5',
    title: 'scene',
    unit: 'moments',
    typical_edge_min: 0,
    typical_edge_max: 5,
    time_unit: 'min',
    uses_gu: false,
    uses_minutes: true,
    summary: 'У двери, за телегой, возле сундука, у печи.',
    status: 'approved',
    confidence: 'high',
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

  for (const row of SCALE_RULES) {
    await client.query(
      `INSERT INTO world_base.graph_scale_rules (
        id, scale_level, title, unit, typical_edge_min, typical_edge_max,
        time_unit, uses_gu, uses_minutes, summary, status, confidence
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        scale_level = EXCLUDED.scale_level,
        title = EXCLUDED.title,
        unit = EXCLUDED.unit,
        typical_edge_min = EXCLUDED.typical_edge_min,
        typical_edge_max = EXCLUDED.typical_edge_max,
        time_unit = EXCLUDED.time_unit,
        uses_gu = EXCLUDED.uses_gu,
        uses_minutes = EXCLUDED.uses_minutes,
        summary = EXCLUDED.summary,
        status = EXCLUDED.status,
        confidence = EXCLUDED.confidence,
        updated_at = now()`,
      [
        row.id, row.scale_level, row.title, row.unit,
        row.typical_edge_min, row.typical_edge_max, row.time_unit,
        row.uses_gu, row.uses_minutes, row.summary, row.status, row.confidence,
      ],
    );
  }

  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM world_base.graph_scale_rules');
  console.log(`graph_scale_rules: ${rows[0].count} rows (expected 6)`);
} catch (error) {
  console.error(error.message ?? error);
  process.exit(1);
} finally {
  await client.end();
}
