import pg from 'pg';
import { occupationGenerationGateSql, socialRoleGenerationGateSql } from './social-generation-gate.js';

const { Pool } = pg;

let pool = null;
let poolUrl = null;

export function isWorldDataPostgresEnabled(env = process.env) {
  return String(env.WORLD_DATA_SOURCE ?? '').trim().toLowerCase() === 'postgres'
    && Boolean(String(env.DATABASE_URL ?? '').trim());
}

export function resolveHistoryPackId(world = {}) {
  const selectedYear = world.historicalFrame?.year ?? world.history?.year;
  if (selectedYear >= 1230 && selectedYear <= 1250 && isNovgorodFrame(world)) {
    return 'novgorod-land-1230-1250';
  }
  if (selectedYear === 1241 && isCentralEuropeFrame(world)) {
    return '1241-central-europe';
  }
  return null;
}

export function isNovgorodFrame(world = {}) {
  const text = normalize([
    world.historicalFrame?.regionName,
    world.historicalFrame?.regionHint,
    world.region?.name,
    world.history?.regionHint
  ].filter(Boolean).join(' '));

  if (!text) return false;
  return /новгород|novgorod|volkhov|волхов|ilmen|ильмен/i.test(text);
}

export function isCentralEuropeFrame(world = {}) {
  const text = normalize([
    world.historicalFrame?.regionName,
    world.historicalFrame?.regionHint,
    world.region?.name,
    world.history?.regionHint
  ].filter(Boolean).join(' '));

  if (!text) return false;
  return /central|eastern|europe|silesia|krak|hungar|danube|legnica|mohi|poland|carpath|централь|восточн|европ|силез|краков|венгр|дуна|легниц|мохи|польш|карпат/i.test(text);
}

function normalize(value) {
  return String(value ?? '').toLowerCase();
}

export async function loadRegionsFromDb(env = process.env) {
  const { rows } = await getWorldBasePool(env).query(`
    SELECT id, slug, canonical_name, display_name, summary, geographic_scope,
           period_start_year, period_end_year, status, confidence
    FROM world_base.regions
    WHERE status = 'approved'
    ORDER BY COALESCE(display_name, canonical_name, id)
  `);
  return rows.map(mapRegionRow);
}

export async function loadHistoryPackFromDb(packId, env = process.env) {
  const regionId = packId === 'novgorod-land-1230-1250' ? 'region_novgorod_land' : null;
  const yearMin = packId === 'novgorod-land-1230-1250' ? 1230 : null;
  const yearMax = packId === 'novgorod-land-1230-1250' ? 1250 : null;
  const { rows } = await getWorldBasePool(env).query(`
    SELECT id, region_id, title, event_type, period_start_year, period_end_year,
           approximate_date, summary, current_phase, local_signs, game_use,
           limits, status, confidence, sources
    FROM world_base.historical_events
    WHERE ($1::text IS NULL OR region_id = $1)
      AND ($2::int IS NULL OR COALESCE(period_end_year, period_start_year, $2) >= $2)
      AND ($3::int IS NULL OR COALESCE(period_start_year, period_end_year, $3) <= $3)
      AND status IN ('approved', 'usable_with_caution')
    ORDER BY COALESCE(period_start_year, 0), id
  `, [regionId, yearMin, yearMax]);

  return {
    id: packId,
    regionId,
    yearMin,
    yearMax,
    events: rows.map(mapHistoricalEventRow)
  };
}

export async function loadRegionContext(regionId, env = process.env) {
  const pool = getWorldBasePool(env);
  const [roles, occupations, entryNodes, contextPacks] = await Promise.all([
    pool.query(`
      SELECT rsr.id, rsr.title, rsr.role_group, rsr.status_level, rsr.free_status, rsr.legal_capacity,
             rsr.social_position_archetype_id, rsr.social_class_id, rsr.role_archetype_id,
             rsr.typical_equipment, rsr.typical_knowledge, rsr.npc_generation_rules,
             rsr.game_use, rsr.limits, rsr.status, rsr.confidence
      FROM world_base.region_social_roles rsr
      WHERE rsr.region_id = $1 AND ${socialRoleGenerationGateSql('rsr')}
      ORDER BY rsr.title, rsr.id
    `, [regionId]),
    pool.query(`
      SELECT ro.id, ro.title, ro.occupation_group, ro.summary, ro.occupation_archetype_id,
             ro.required_location_types, ro.required_tools, ro.typical_risks, ro.typical_knowledge,
             ro.game_use, ro.limits, ro.status, ro.confidence
      FROM world_base.region_occupations ro
      WHERE ro.region_id = $1 AND ${occupationGenerationGateSql('ro')}
      ORDER BY ro.title, ro.id
    `, [regionId]),
    pool.query(`
      SELECT id, title, node_type, scale_level, summary, region_cell_code,
             terrain_profile, water_profile, road_profile, dominant_content,
             settlement_density, status, confidence
      FROM world_base.graph_nodes
      WHERE region_id = $1
        AND scale_level IN ('G1', 'G2', 'G3')
        AND status IN ('approved', 'usable_with_caution')
      ORDER BY scale_level, title, id
      LIMIT 80
    `, [regionId]),
    pool.query(`
      SELECT id, title, context_type, summary, prompt_text, hard_constraints,
             forbidden_assumptions, known_gaps, use_when, status, confidence
      FROM world_base.llm_context_packs
      WHERE (region_id = $1 OR region_id IS NULL)
        AND context_type IN ('region_start', 'scene_context', 'repair_context')
        AND status IN ('approved', 'usable_with_caution')
      ORDER BY context_type, title, id
    `, [regionId])
  ]);

  return {
    regionId,
    socialRoles: roles.rows,
    occupations: occupations.rows,
    entryNodes: entryNodes.rows,
    contextPacks: contextPacks.rows
  };
}

export function mapRegionRow(row = {}) {
  return {
    id: row.id,
    slug: row.slug ?? null,
    name: row.display_name ?? row.canonical_name ?? row.id,
    canonicalName: row.canonical_name ?? row.display_name ?? row.id,
    summary: row.summary ?? null,
    geographicScope: row.geographic_scope ?? null,
    periodStartYear: row.period_start_year ?? null,
    periodEndYear: row.period_end_year ?? null,
    status: row.status ?? null,
    confidence: row.confidence ?? null
  };
}

function mapHistoricalEventRow(row = {}) {
  return {
    id: row.id,
    regionId: row.region_id,
    title: row.title,
    eventType: row.event_type,
    periodStartYear: row.period_start_year,
    periodEndYear: row.period_end_year,
    approximateDate: row.approximate_date,
    summary: row.summary,
    currentPhase: row.current_phase,
    localSigns: row.local_signs ?? [],
    gameUse: row.game_use,
    limits: row.limits,
    status: row.status,
    confidence: row.confidence,
    sources: row.sources ?? []
  };
}

function getWorldBasePool(env = process.env) {
  const url = String(env.DATABASE_URL ?? '').trim();
  if (!url) throw new Error('DATABASE_URL is required for world_base postgres loader.');
  if (!pool || poolUrl !== url) {
    pool = new Pool({ connectionString: url });
    poolUrl = url;
  }
  return pool;
}

export async function resetWorldBasePool() {
  if (pool) {
    await pool.end();
    pool = null;
    poolUrl = null;
  }
}

export function getWorldBaseQueryable(env = process.env, queryable = null) {
  return queryable ?? getWorldBasePool(env);
}
