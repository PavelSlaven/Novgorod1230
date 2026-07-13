import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadLocalEnv } from '../src/env.js';

await loadLocalEnv();

const { Client } = pg;
const repoRoot = resolve(import.meta.dirname, '..');
const mode = readArg('--mode') || 'dry-run';
const root = resolve(process.env.RUS13_NOVGOROD_REGIONAL_ROOT || joinRepo('tools/rus13-novgorod-regional-templates'));
const rulesRoot = resolve(process.env.RUS13_NOVGOROD_PLACE_RULES_ROOT || joinRepo('tools/rus13-novgorod-place-generation-rules'));
const limitsRoot = resolve(process.env.RUS13_NOVGOROD_PLACE_LIMITS_ROOT || joinRepo('tools/rus13-novgorod-place-generation-limits'));
const outSql = resolve(readArg('--output-sql') || joinRepo('data/novgorod-regional-templates.sql'));
const databaseUrl = process.env.WORLD_DB_ADMIN_URL || getAdminUrl();
const regionId = 'region_novgorod_land';

const records = [
  ...loadPlaceGenerationRules(),
  ...loadPlaceGenerationLimits(),
  ...loadRumors(),
  ...loadConflicts(),
  ...loadPrices(),
  ...loadWeatherAndSeasons(),
  ...loadHistoricalTimeline(),
  ...loadItems(),
  ...loadG5ContextPack()
];

const counts = countByTable(records);
console.log(JSON.stringify({ mode, root, rulesRoot, limitsRoot, counts, rows: records.length }, null, 2));

if (mode === 'dry-run') process.exit(0);
if (mode === 'emit-sql') {
  writeFileSync(outSql, buildSql(records), 'utf8');
  console.log(`SQL written: ${outSql}`);
  process.exit(0);
}
if (mode === 'apply') {
  if (!databaseUrl) {
    console.error('WORLD_DB_ADMIN_URL or DATABASE_URL is required for --mode apply.');
    process.exit(1);
  }
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    if (!process.argv.includes('--skip-schema-patch')) {
      await client.query(readFileSync(resolve(rulesRoot, 'novgorod_region_place_generation_rules_v2_expanded_schema_patch.sql'), 'utf8'));
    }
    for (const { table, row } of records) {
      await upsertRow(client, table, row);
    }
    console.log(`applied rows: ${records.length}`);
  } catch (error) {
    console.error(error.message ?? error);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
  process.exit(0);
}

console.error(`Unknown mode: ${mode}`);
process.exit(1);

function loadPlaceGenerationRules() {
  return parseTsvFile(resolve(rulesRoot, 'novgorod_region_place_generation_rules_v2_expanded.tsv'))
    .map((row) => ({ table: 'region_place_generation_rules', row: normalizeKnownRow(row) }));
}

function loadPlaceGenerationLimits() {
  return parseTsvFile(resolve(limitsRoot, 'novgorod_place_generation_limits_v2_economic.tsv'))
    .map((row) => ({ table: 'place_generation_limits', row: normalizeKnownRow(row) }));
}

function loadRumors() {
  const data = readJson(resolve(root, 'novgorod_rumor_templates_v1.json'));
  return (data.rumor_templates ?? []).map((item) => ({
    table: 'rumor_templates',
    row: withCommon({
      id: item.rumor_template_id,
      title: item.title,
      slug: item.rumor_template_id,
      rumor_type: item.rumor_type,
      summary: joinText(item.typical_text_patterns),
      source_role: joinText(item.who_spreads),
      spread_places: item.where_heard ?? [],
      truth_status: normalizeTruthStatus(first(item.truth_variants)),
      what_is_visible: joinText(item.what_player_can_notice ?? item.visible_signs),
      what_is_hidden: joinText(item.hidden_factors_allowed ?? item.hidden_truth_policy),
      who_believes_it: item.who_believes ?? [],
      possible_effects: item.possible_effects ?? item.game_effects ?? [],
      game_use: item.game_use ?? null,
      limits: joinText(item.llm_limits ?? item.limits)
    }, data.metadata)
  }));
}

function loadConflicts() {
  const data = readJson(resolve(root, 'novgorod_local_conflict_templates_v1.json'));
  return (data.conflict_templates ?? []).map((item) => ({
    table: 'conflict_templates',
    row: withCommon({
      id: item.conflict_template_id,
      title: item.title,
      slug: item.conflict_template_id,
      conflict_type: normalizeConflictType(item.conflict_type),
      summary: item.economic_basis ?? item.social_basis ?? item.title,
      applies_to_place_types: item.where_common ?? [],
      applies_to_roles: item.participants_by_role ?? [],
      trigger_conditions: item.typical_trigger ?? [],
      participants: item.participants_by_role ?? [],
      visible_signs: item.visible_signs ?? [],
      hidden_layers: item.hidden_factors_allowed ?? [],
      possible_escalation: item.violent_escalation_conditions ?? [],
      possible_resolution: item.nonviolent_paths ?? [],
      game_use: item.game_use ?? null,
      limits: joinText(item.llm_limits ?? item.limits),
      audit_notes: `source_conflict_type=${item.conflict_type}`
    }, data.metadata)
  }));
}

function loadPrices() {
  return parseTsvFile(resolve(root, 'novgorod_goods_prices_v1.tsv')).map((item) => ({
    table: 'price_bands',
    row: withCommon({
      id: item.price_entry_id,
      title: item.item_or_service,
      slug: item.price_entry_id,
      item_or_service_type: item.category,
      value_band: item.base_value_band,
      normal_price_description: item.price_model,
      seasonal_modifiers: splitList(item.seasonal_variation),
      war_modifiers: splitList(item.crisis_variation),
      who_can_afford: splitList(item.who_buys),
      who_can_sell: splitList(item.who_sells),
      barter_options: splitList(item.common_exchange_forms),
      tax_or_duty: item.legal_or_social_limits,
      risk_of_fraud: item.notes,
      game_use: item.notes,
      limits: item.legal_or_social_limits,
      status: item.status,
      confidence: item.confidence,
      sources: splitList(item.sources),
      audit_notes: item.audit_notes || item.source_note
    })
  }));
}

function loadWeatherAndSeasons() {
  const data = readJson(resolve(root, 'novgorod_weather_season_rules_v1.json'));
  const seasons = (data.season_profiles ?? []).map((item) => ({
    table: 'seasonal_rules',
    row: withCommon({
      id: item.season_id,
      season: normalizeSeason(item.season_id),
      title: item.title,
      slug: item.season_id,
      weather_profile: item.temperature_profile,
      daylight_profile: item.visibility_and_light,
      road_effects: splitList(item.road_state),
      river_effects: splitList(item.water_state),
      work_effects: splitList(item.field_work),
      trade_effects: splitList(item.trade_effects),
      disease_effects: item.body_risks ?? [],
      common_risks: item.body_risks ?? [],
      game_use: joinText(item.common_scene_signs),
      limits: joinText(item.llm_limits),
      audit_notes: `source_season_id=${item.season_id}`,
      status: item.status,
      confidence: item.confidence
    }, data.metadata)
  }));
  const weather = (data.weather_profiles ?? []).map((item) => ({
    table: 'weather_profiles',
    row: withCommon({
      id: item.weather_id,
      title: item.title,
      slug: item.weather_id,
      weather_type: item.weather_id,
      summary: joinText(item.scene_effects),
      road_modifier: joinText(item.route_effects),
      movement_modifier: joinText(item.route_effects),
      visible_description: joinText(item.scene_effects),
      game_use: joinText(item.scene_effects),
      status: item.status,
      confidence: item.confidence
    }, data.metadata)
  }));
  return [...seasons, ...weather];
}

function loadHistoricalTimeline() {
  const sourcePath = resolve(process.env.RUS13_NOVGOROD_TIMELINE_PATH || joinRepo('data/rus13-base-staging/nov_region_audit/novgorod_historical_timeline_1230_1250_v1.json'));
  let data;
  try {
    data = readJson(sourcePath);
  } catch {
    data = readJson(resolve(root, 'novgorod_historical_timeline_1230_1250_v1.json'));
  }
  const seenEvents = new Set();
  const rows = [];
  for (const item of data.timeline ?? []) {
    if (!seenEvents.has(item.event_id)) {
      seenEvents.add(item.event_id);
      rows.push({
        table: 'historical_events',
        row: withCommon({
          id: item.event_id,
          title: item.event_title,
          slug: item.event_id,
          event_type: item.event_type,
          period_start_year: toInt(item.year),
          period_end_year: toInt(item.year),
          approximate_date: item.source_date?.normalized ?? item.assigned_game_datetime,
          date_confidence: item.date_precision,
          historical_status: data.metadata?.status,
          summary: item.historical_context ?? item.summary,
          affected_regions: item.regions_affected ?? [],
          current_phase: item.phase,
          local_signs: item.visible_signs ?? item.local_signs ?? [],
          hidden_truth_policy: data.source_policy?.hidden_knowledge_policy,
          future_knowledge_forbidden: [data.source_policy?.hidden_knowledge_policy].filter(Boolean),
          game_use: item.game_use ?? null,
          limits: item.limits ?? data.source_policy?.date_policy
        }, data.metadata)
      });
    }
    rows.push({
      table: 'historical_event_phases',
      row: withCommon({
        id: item.phase_id,
        event_id: item.event_id,
        phase_name: item.phase,
        phase_order: toInt(item.phase_order),
        date_start: item.assigned_game_datetime,
        date_confidence: item.date_precision,
        summary: item.summary,
        visible_signs: item.visible_signs ?? item.local_signs ?? [],
        affected_places: item.places_affected ?? [],
        affected_graph_edges: item.graph_edges_affected ?? [],
        affected_roles: item.roles_affected ?? [],
        affected_goods: item.goods_affected ?? [],
        rumor_templates: item.rumor_templates ?? [],
        what_character_can_know: item.what_commoners_know ?? item.player_visible_summary,
        what_character_cannot_know: data.source_policy?.hidden_knowledge_policy,
        game_use: item.game_use ?? null,
        limits: item.limits ?? data.source_policy?.date_policy
      }, data.metadata)
    });
  }
  return rows;
}

function loadItems() {
  const data = readJson(resolve(root, 'novgorod_item_profiles_v1.json'));
  return (data.item_categories ?? []).map((item) => ({
    table: 'item_templates',
    row: withCommon({
      id: item.item_category_id,
      title: item.title,
      slug: item.item_category_id,
      item_type: item.item_category_id,
      summary: item.historical_basis,
      function: item.materialization_rule ?? data.materialization_policy?.main_chain,
      typical_material: joinText(item.typical_materials),
      typical_owner_roles: item.typical_owner_status ?? [],
      typical_locations: item.where_common ?? [],
      typical_containers: item.typical_containers ?? [],
      risk_default: joinText(item.risks ?? item.access_risks),
      game_use: item.game_use ?? data.materialization_policy?.main_chain,
      limits: joinText(item.llm_limits ?? item.materialization_limits)
    }, data.metadata)
  }));
}

function loadG5ContextPack() {
  const data = readJson(resolve(root, 'novgorod_g5_scene_templates_v1.json'));
  return [{
    table: 'llm_context_packs',
    row: withCommon({
      id: 'ctx_novgorod_g5_scene_templates_v1',
      title: 'Novgorod G5 scene templates v1',
      slug: 'novgorod_g5_scene_templates_v1',
      context_type: 'scene_context',
      summary: data.metadata?.purpose ?? 'Novgorod G5 scene templates',
      included_tables: ['scene_anchors', 'llm_context_packs'],
      included_record_ids: (data.g4_scene_templates ?? []).map((item) => item.g4_type_id).filter(Boolean),
      prompt_text: JSON.stringify(data.g4_scene_templates ?? [], null, 2),
      hard_constraints: data.materialization_policy ? [data.materialization_policy] : [],
      forbidden_assumptions: data.validation?.must_not ?? [],
      known_gaps: data.validation?.warnings ?? [],
      use_when: 'Start G5 materialization for Novgorod party scenes.'
    }, data.metadata)
  }];
}

function normalizeKnownRow(row) {
  const normalized = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = normalizeScalar(value);
  }
  return withCommon(normalized);
}

function withCommon(row, metadata = {}) {
  return {
    region_id: normalizeRegionId(row.region_id ?? metadata.region_id ?? regionId),
    status: row.status ?? metadata.status ?? 'draft',
    confidence: row.confidence ?? metadata.confidence ?? 'medium',
    sources: row.sources ?? metadata.source_registry ?? [],
    audit_notes: row.audit_notes ?? (metadata.requires_human_audit || metadata.requires_human_historical_audit ? 'requires_human_audit' : null),
    ...row,
    region_id: normalizeRegionId(row.region_id ?? metadata.region_id ?? regionId)
  };
}

function parseTsvFile(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/u).filter(Boolean);
  const headers = splitTsvLine(lines.shift() ?? '');
  return lines.map((line) => Object.fromEntries(splitTsvLine(line).map((value, index) => [headers[index], value])));
}

function splitTsvLine(line) {
  const out = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === '\t' && !quoted) {
      out.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current);
  return out;
}

function normalizeScalar(value) {
  if (value === '') return null;
  if (value === 'True' || value === 'true') return true;
  if (value === 'False' || value === 'false') return false;
  if (/^-?\d+$/u.test(value)) return Number(value);
  const trimmed = String(value).trim();
  if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function countByTable(items) {
  return items.reduce((acc, item) => ({ ...acc, [item.table]: (acc[item.table] ?? 0) + 1 }), {});
}

async function upsertRow(client, table, row) {
  const entries = Object.entries(row).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const placeholders = values.map((_, index) => `$${index + 1}`);
  const updates = columns.filter((column) => column !== 'id').map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
  await client.query(
    `INSERT INTO world_base.${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')}`,
    values.map(toPgValue)
  );
}

function buildSql(items) {
  const schemaPatch = readFileSync(resolve(rulesRoot, 'novgorod_region_place_generation_rules_v2_expanded_schema_patch.sql'), 'utf8');
  const statements = items.map(({ table, row }) => {
    const entries = Object.entries(row).filter(([, value]) => value !== undefined);
    const columns = entries.map(([key]) => key);
    const values = entries.map(([, value]) => sqlLiteral(toPgValue(value)));
    const updates = columns.filter((column) => column !== 'id').map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`);
    return `INSERT INTO world_base.${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT (id) DO UPDATE SET ${updates.join(', ')};`;
  });
  return [schemaPatch.trim(), ...statements].join('\n\n') + '\n';
}

function toPgValue(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  return value;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/gu, '""')}"`;
}

function normalizeRegionId(value) {
  return String(value ?? regionId) === 'novgorod_land' ? regionId : String(value ?? regionId);
}

function normalizeTruthStatus(value) {
  return ['true', 'false', 'distorted', 'unknown', 'mixed'].includes(value) ? value : 'unknown';
}

function normalizeConflictType(value) {
  const type = String(value ?? '').trim();
  if (['debt', 'property', 'trade', 'family', 'labor', 'status', 'religious', 'road', 'theft', 'violence', 'tax', 'duty', 'stranger', 'resource'].includes(type)) {
    return type;
  }
  if (/price|underweight|dues/u.test(type)) return type === 'dues_dispute' ? 'tax' : 'trade';
  if (/fish|hay|livestock|forest|beasts|fire|disease|famine/u.test(type)) return 'resource';
  if (/ferry|road|crossing|guide|boat/u.test(type)) return 'road';
  if (/church|monastery/u.test(type)) return 'religious';
  if (/boyar|princely|status|insult|witness|guarantor|pledge/u.test(type)) return 'status';
  if (/runaway|stranger|local_vs/u.test(type)) return 'stranger';
  if (/theft|missing_item|found_item|trespass/u.test(type)) return 'theft';
  if (/brawl|robbery|death/u.test(type)) return 'violence';
  if (/labor/u.test(type)) return 'labor';
  return 'property';
}

function normalizeSeason(value) {
  const season = String(value ?? '').replace(/^season_/u, '');
  if (['winter', 'spring', 'summer', 'autumn', 'rasputitsa', 'early_winter', 'late_winter'].includes(season)) return season;
  if (season === 'flood' || season === 'thaw') return 'rasputitsa';
  if (season === 'heat' || season === 'navigation') return 'summer';
  if (season === 'late_autumn') return 'autumn';
  if (season === 'ice_forming') return 'early_winter';
  return null;
}

function splitList(value) {
  if (Array.isArray(value)) return value;
  return String(value ?? '').split(/[;,\n]/u).map((item) => item.trim()).filter(Boolean);
}

function joinText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('; ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return value ?? null;
}

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function toInt(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function joinRepo(relativePath) {
  return resolve(repoRoot, relativePath);
}

function getAdminUrl() {
  const user = process.env.POSTGRES_USER || 'world_admin';
  const password = encodeURIComponent(process.env.POSTGRES_PASSWORD ?? '');
  const db = process.env.POSTGRES_DB || 'world_db';
  const port = process.env.POSTGRES_PORT || '5432';
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}
