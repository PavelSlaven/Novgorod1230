import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { socialRoleGenerationGateSql } from './social-generation-gate.js';

const { Client } = pg;

export const NOVGOROD_REGION_ID = 'region_novgorod_land';
export const REQUIRED_GRAPH_SCALES = ['G1', 'G2', 'G3', 'G4'];
export const PARTY_RUNTIME_SCHEMA = 'party_runtime';

export const REQUIRED_NOVGOROD_G1_G4_TSV = [
  'novgorod_g1_70_active_cells_v6_historical_anchors_g1.tsv',
  'novgorod_g1_70_active_cells_v6_macro_zones.tsv',
  'novgorod_g1_70_active_cells_v6_sources.tsv',
  'novgorod_g2_g4_70_cells_v6_g1_cells.tsv',
  'novgorod_g2_g4_70_cells_v6_g2_zones.tsv',
  'novgorod_g2_g4_70_cells_v6_g3_places.tsv',
  'novgorod_g2_g4_70_cells_v6_g4_locations.tsv',
  'novgorod_g2_g4_70_cells_v6_naming_register.tsv',
  'novgorod_g2_g4_70_cells_v6_sources.tsv',
  'novgorod_g3_scale_register_v6.tsv',
  'novgorod_graph_edges_g1_g4_full_v6.tsv',
  'novgorod_graph_nodes_g1_g4_full_v6.tsv'
];

export const REQUIRED_WORLD_BASE_TABLES = [
  'regions',
  'graph_scale_rules',
  'graph_edge_modifiers',
  'landscape_templates',
  'water_body_templates',
  'route_templates',
  'land_use_templates',
  'place_templates',
  'region_landscape_templates',
  'region_water_body_templates',
  'region_land_use_templates',
  'region_place_templates',
  'social_classes',
  'social_role_archetypes',
  'social_position_archetypes',
  'occupation_archetypes',
  'skill_catalog',
  'region_social_roles',
  'region_occupations',
  'region_place_generation_rules',
  'place_generation_limits',
  'historical_events',
  'item_templates',
  'llm_context_packs',
  'graph_nodes',
  'graph_edges',
  'sensory_signal_profiles',
  'sensory_signal_action_bindings',
  'sensory_signal_item_template_bindings',
  'sensory_signal_surface_category_bindings',
  'sensory_transition_profiles',
  'ambient_sound_profiles',
  'light_visibility_profiles',
  'actor_perception_profiles',
  'routine_sound_profiles',
  'npc_reaction_policies',
  'npc_reaction_policy_options',
  'g5_edge_sensory_transition_bindings',
  'region_npc_perception_profile_bindings'
];

export const REQUIRED_PARTY_TABLES = [
  'delivery_attempts',
  'delivery_acknowledgements',
  'commit_idempotency',
  'parties',
  'party_server_sessions',
  'party_state_snapshots',
  'party_positions',
  'party_player_characters',
  'party_character_knowledge',
  'party_materialization_runs',
  'party_materialization_choices',
  'party_g5_nodes',
  'party_g5_anchors',
  'party_g5_edges',
  'party_npcs',
  'party_npc_traits',
  'party_npc_relations',
  'party_npc_knowledge',
  'party_npc_schedules',
  'party_containers',
  'party_items',
  'party_item_placements',
  'party_ownership',
  'party_decision_requests',
  'party_decision_options',
  'party_decision_results',
  'party_change_sets',
  'party_autonomous_updates',
  'party_visible_read_models',
  'party_journeys',
  'party_journey_legs',
  'party_perception_pins',
  'party_perception_cycles',
  'party_sensory_events',
  'party_actor_attention_states',
  'party_perception_results',
  'party_npc_awareness_states',
  'party_stimulus_memory',
  'party_npc_reaction_decisions',
  'party_sensory_event_reaction_causes'
];

export const REQUIRED_PARTY_PRIMARY_KEYS = {
  delivery_attempts: ['delivery_attempt_id'],
  delivery_acknowledgements: ['message_id'],
  commit_idempotency: ['idempotency_key'],
  parties: ['party_id'],
  party_server_sessions: ['party_id'],
  party_state_snapshots: ['party_id', 'state_version'],
  party_positions: ['party_id'],
  party_player_characters: ['party_id', 'character_id'],
  party_character_knowledge: ['party_id', 'character_id', 'fact_id'],
  party_materialization_runs: ['party_id', 'run_id'],
  party_materialization_choices: ['party_id', 'run_id', 'choice_ordinal'],
  party_g5_nodes: ['party_id', 'g5_node_id'],
  party_g5_anchors: ['party_id', 'anchor_id'],
  party_g5_edges: ['party_id', 'g5_edge_id'],
  party_npcs: ['party_id', 'npc_id'],
  party_npc_traits: ['party_id', 'npc_id', 'trait_domain', 'category_id'],
  party_npc_relations: ['party_id', 'from_npc_id', 'to_npc_id', 'relation_category_id'],
  party_npc_knowledge: ['party_id', 'npc_id', 'fact_id'],
  party_npc_schedules: ['party_id', 'npc_id', 'time_band'],
  party_containers: ['party_id', 'container_id'],
  party_items: ['party_id', 'item_id'],
  party_item_placements: ['party_id', 'item_id'],
  party_ownership: ['party_id', 'ownership_id'],
  party_decision_requests: ['party_id', 'request_id'],
  party_decision_options: ['party_id', 'request_id', 'option_id'],
  party_decision_results: ['party_id', 'request_id'],
  party_change_sets: ['party_id', 'change_set_id'],
  party_autonomous_updates: ['party_id', 'update_id'],
  party_visible_read_models: ['party_id', 'state_version', 'viewer_character_id'],
  party_journeys: ['party_id', 'journey_id'],
  party_journey_legs: ['party_id', 'journey_id', 'leg_id'],
  party_perception_pins: ['party_id'],
  party_perception_cycles: ['party_id', 'cycle_id'],
  party_sensory_events: ['party_id', 'event_id'],
  party_actor_attention_states: ['party_id', 'actor_kind', 'actor_id'],
  party_perception_results: ['party_id', 'result_id'],
  party_npc_awareness_states: ['party_id', 'npc_id'],
  party_stimulus_memory: ['party_id', 'npc_id', 'event_id'],
  party_npc_reaction_decisions: ['party_id', 'reaction_decision_id'],
  party_sensory_event_reaction_causes: ['party_id', 'event_id']
};

export function validateNewGameEnvironment(env = process.env) {
  const checks = [
    {
      id: 'world-data-source',
      ok: text(env.WORLD_DATA_SOURCE).toLowerCase() === 'postgres',
      message: 'WORLD_DATA_SOURCE must be postgres before the 26-step new-game pipeline runs.'
    },
    {
      id: 'database-url',
      ok: Boolean(text(env.DATABASE_URL)),
      message: 'DATABASE_URL is required for the runtime read-only world_base loader.'
    },
    {
      id: 'deepseek-api-key',
      ok: Boolean(text(env.DEEPSEEK_API_KEY)),
      message: 'DEEPSEEK_API_KEY is required for LLM-backed new-game stages.'
    }
  ];

  const party = resolvePartyDatabaseConfig(env);
  checks.push({
    id: 'party-database-url',
    ok: Boolean(party.url),
    message: 'PARTY_DATABASE_URL or the documented seed fallback is required for party DB preflight.'
  });

  return summarizeChecks(checks, {
    partyDatabase: {
      source: party.source,
      usesFallback: party.usesFallback,
      redactedUrl: redactDatabaseUrl(party.url)
    }
  });
}

export function resolvePartyDatabaseConfig(env = process.env) {
  const partyUrl = text(env.PARTY_DATABASE_URL);
  if (partyUrl) return { url: partyUrl, source: 'PARTY_DATABASE_URL', usesFallback: false };

  const worldAdminUrl = text(env.WORLD_DB_ADMIN_URL);
  if (worldAdminUrl) return { url: worldAdminUrl, source: 'WORLD_DB_ADMIN_URL', usesFallback: true };

  const databaseUrl = text(env.DATABASE_URL);
  if (databaseUrl) return { url: databaseUrl, source: 'DATABASE_URL', usesFallback: true };

  return {
    url: buildPostgresUrl(env),
    source: 'POSTGRES_*',
    usesFallback: true
  };
}

export async function checkNovgorodG1G4ImportSourceFiles(repoRoot, env = process.env) {
  const root = resolve(
    text(env.RUS13_NOVGOROD_G1_G4_TSV_ROOT)
    || resolve(repoRoot, 'data/rus13-base-staging/nov_region_audit/novgorod_full_graph_g1_g4_v6_game_ready_EXTRACTED/novgorod_full_graph_g1_g4_v6_game_ready/tsv_import')
  );

  const missing = [];
  for (const fileName of REQUIRED_NOVGOROD_G1_G4_TSV) {
    try {
      await access(resolve(root, fileName));
    } catch {
      missing.push(fileName);
    }
  }

  return summarizeChecks([{
    id: 'novgorod-g1-g4-source-files',
    ok: missing.length === 0,
    message: `Missing Novgorod G1-G4 TSV source files: ${missing.join(', ')}`
  }], { root, requiredFiles: REQUIRED_NOVGOROD_G1_G4_TSV.length, missing });
}

export async function checkWorldBaseImportedData(databaseUrl, { clientFactory = (url) => new Client({ connectionString: url }) } = {}) {
  const client = clientFactory(databaseUrl);
  await client.connect();
  try {
    const existingTables = await existingWorldBaseTables(client);
    const missingTables = REQUIRED_WORLD_BASE_TABLES.filter((table) => !existingTables.has(table));
    const tableCounts = missingTables.length ? {} : await countWorldBasePrerequisites(client);
    const nodeCounts = missingTables.length ? {} : await countGraphNodesByScale(client);
    const edgeCounts = missingTables.length ? {} : await countGraphEdgesByScale(client);

    const checks = [
      {
        id: 'world-base-tables',
        ok: missingTables.length === 0,
        message: `Missing world_base tables: ${missingTables.join(', ')}`
      },
      ...Object.entries(tableCounts).map(([name, count]) => ({
        id: `world-base-${name}`,
        ok: count > 0,
        message: `world_base.${name} has no imported Novgorod rows.`
      })),
      ...REQUIRED_GRAPH_SCALES.map((scale) => ({
        id: `world-base-graph-nodes-${scale}`,
        ok: Number(nodeCounts[scale] ?? 0) > 0,
        message: `world_base.graph_nodes has no imported Novgorod ${scale} rows.`
      })),
      ...REQUIRED_GRAPH_SCALES.map((scale) => ({
        id: `world-base-graph-edges-${scale}`,
        ok: Number(edgeCounts[scale] ?? 0) > 0,
        message: `world_base.graph_edges has no imported Novgorod ${scale} rows.`
      }))
    ];

    return summarizeChecks(checks, { tableCounts, graphNodesByScale: nodeCounts, graphEdgesByScale: edgeCounts });
  } finally {
    await client.end().catch(() => {});
  }
}

export async function checkPartyDbSeed(databaseUrl, { clientFactory = (url) => new Client({ connectionString: url }) } = {}) {
  const client = clientFactory(databaseUrl);
  await client.connect();
  try {
    const { rows } = await client.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = ANY($2::text[])
      `,
      [PARTY_RUNTIME_SCHEMA, REQUIRED_PARTY_TABLES]
    );
    const existing = new Set(rows.map((row) => row.table_name));
    const missing = REQUIRED_PARTY_TABLES.filter((table) => !existing.has(table));
    const primaryKeyMismatches = missing.length ? [] : await findPartyPrimaryKeyMismatches(client);
    const versionConstraintOk = missing.length ? false : await hasPartyRuntimeV2Constraint(client);
    return summarizeChecks([{
      id: 'party-db-seed-tables',
      ok: missing.length === 0,
      message: `Missing party_runtime_v2 seed tables in schema ${PARTY_RUNTIME_SCHEMA}: ${missing.join(', ')}`
    }, {
      id: 'party-db-primary-key-shape',
      ok: missing.length === 0 && primaryKeyMismatches.length === 0,
      message: `Invalid party_runtime_v2 primary keys: ${primaryKeyMismatches.join(', ')}`
    }, {
      id: 'party-db-schema-version-constraint',
      ok: missing.length === 0 && versionConstraintOk,
      message: 'party_runtime.parties must enforce schema_version = 2.'
    }], {
      schemaName: PARTY_RUNTIME_SCHEMA,
      schemaVersion: 'party_runtime_v2',
      requiredTables: REQUIRED_PARTY_TABLES.length,
      missing,
      primaryKeyMismatches,
      versionConstraintOk
    });
  } finally {
    await client.end().catch(() => {});
  }
}

async function findPartyPrimaryKeyMismatches(client) {
  const { rows } = await client.query(
    `
      SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = tc.constraint_schema
       AND kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
      WHERE tc.table_schema = $1
        AND tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = ANY($2::text[])
      ORDER BY tc.table_name, kcu.ordinal_position
    `,
    [PARTY_RUNTIME_SCHEMA, REQUIRED_PARTY_TABLES]
  );
  const actual = new Map();
  for (const row of rows) {
    const columns = actual.get(row.table_name) ?? [];
    columns.push(row.column_name);
    actual.set(row.table_name, columns);
  }
  return Object.entries(REQUIRED_PARTY_PRIMARY_KEYS)
    .filter(([table, expected]) => !sameArray(actual.get(table) ?? [], expected))
    .map(([table]) => table);
}

async function hasPartyRuntimeV2Constraint(client) {
  const { rows } = await client.query(
    `
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1
        AND t.relname = 'parties'
        AND c.contype = 'c'
    `,
    [PARTY_RUNTIME_SCHEMA]
  );
  return rows.some(({ definition }) => normalizeCheckDefinition(definition) === 'check schema_version = 2');
}

function normalizeCheckDefinition(value) {
  return String(value ?? '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sameArray(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function existingWorldBaseTables(client) {
  const { rows } = await client.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'world_base'
        AND table_name = ANY($1::text[])
    `,
    [REQUIRED_WORLD_BASE_TABLES]
  );
  return new Set(rows.map((row) => row.table_name));
}

async function countWorldBasePrerequisites(client) {
  const queries = {
    regions: `SELECT COUNT(*)::int AS count FROM world_base.regions WHERE id = $1 AND status IN ('approved', 'usable_with_caution')`,
    graph_scale_rules: `SELECT COUNT(*)::int AS count FROM world_base.graph_scale_rules WHERE status IN ('approved', 'usable_with_caution')`,
    graph_edge_modifiers: `SELECT COUNT(*)::int AS count FROM world_base.graph_edge_modifiers WHERE status IN ('approved', 'usable_with_caution')`,
    landscape_templates: `SELECT COUNT(*)::int AS count FROM world_base.landscape_templates WHERE status IN ('approved', 'usable_with_caution')`,
    water_body_templates: `SELECT COUNT(*)::int AS count FROM world_base.water_body_templates WHERE status IN ('approved', 'usable_with_caution')`,
    route_templates: `SELECT COUNT(*)::int AS count FROM world_base.route_templates WHERE status IN ('approved', 'usable_with_caution')`,
    land_use_templates: `SELECT COUNT(*)::int AS count FROM world_base.land_use_templates WHERE status IN ('approved', 'usable_with_caution')`,
    place_templates: `SELECT COUNT(*)::int AS count FROM world_base.place_templates WHERE status IN ('approved', 'usable_with_caution')`,
    region_landscape_templates: `SELECT COUNT(*)::int AS count FROM world_base.region_landscape_templates WHERE region_id = $1 AND status IN ('approved', 'usable_with_caution')`,
    region_water_body_templates: `SELECT COUNT(*)::int AS count FROM world_base.region_water_body_templates WHERE region_id = $1 AND status IN ('approved', 'usable_with_caution')`,
    region_land_use_templates: `SELECT COUNT(*)::int AS count FROM world_base.region_land_use_templates WHERE region_id = $1 AND status IN ('approved', 'usable_with_caution')`,
    region_place_templates: `SELECT COUNT(*)::int AS count FROM world_base.region_place_templates WHERE region_id = $1 AND status IN ('approved', 'usable_with_caution')`,
    social_classes: `SELECT COUNT(*)::int AS count FROM world_base.social_classes WHERE status IN ('approved', 'usable_with_caution')`,
    social_role_archetypes: `SELECT COUNT(*)::int AS count FROM world_base.social_role_archetypes WHERE status IN ('approved', 'usable_with_caution')`,
    social_position_archetypes: `SELECT COUNT(*)::int AS count FROM world_base.social_position_archetypes WHERE status IN ('approved', 'usable_with_caution')`,
    occupation_archetypes: `SELECT COUNT(*)::int AS count FROM world_base.occupation_archetypes WHERE status IN ('approved', 'usable_with_caution')`,
    skill_catalog: `SELECT COUNT(*)::int AS count FROM world_base.skill_catalog WHERE status IN ('approved', 'usable_with_caution')`,
    region_social_roles: `SELECT COUNT(*)::int AS count FROM world_base.region_social_roles WHERE region_id = $1 AND ${socialRoleGenerationGateSql('region_social_roles')}`,
    region_social_roles_total: `SELECT COUNT(*)::int AS count FROM world_base.region_social_roles WHERE region_id = $1 AND status IN ('approved', 'usable_with_caution')`,
    region_occupations: `SELECT COUNT(*)::int AS count FROM world_base.region_occupations WHERE region_id = $1 AND status IN ('approved', 'usable_with_caution')`,
    region_place_generation_rules: `SELECT COUNT(*)::int AS count FROM world_base.region_place_generation_rules WHERE region_id = $1 AND status IN ('approved', 'usable_with_caution')`,
    place_generation_limits: `SELECT COUNT(*)::int AS count FROM world_base.place_generation_limits WHERE region_id = $1 AND status IN ('approved', 'usable_with_caution')`,
    historical_events: `SELECT COUNT(*)::int AS count FROM world_base.historical_events WHERE region_id = $1 AND status IN ('approved', 'usable_with_caution')`,
    item_templates: `SELECT COUNT(*)::int AS count FROM world_base.item_templates WHERE status IN ('approved', 'usable_with_caution')`,
    llm_context_packs: `SELECT COUNT(*)::int AS count FROM world_base.llm_context_packs WHERE (region_id = $1 OR region_id IS NULL) AND context_type IN ('region_start', 'scene_context', 'repair_context') AND status IN ('approved', 'usable_with_caution')`,
    sensory_signal_profiles: `SELECT COUNT(*)::int AS count FROM world_base.sensory_signal_profiles WHERE (region_id = $1 OR region_id IS NULL) AND status = 'approved'`,
    sensory_signal_action_bindings: `SELECT COUNT(*)::int AS count FROM world_base.sensory_signal_action_bindings WHERE status = 'approved'`,
    sensory_signal_item_template_bindings: `SELECT COUNT(*)::int AS count FROM world_base.sensory_signal_item_template_bindings WHERE status = 'approved'`,
    sensory_signal_surface_category_bindings: `SELECT COUNT(*)::int AS count FROM world_base.sensory_signal_surface_category_bindings WHERE status = 'approved'`,
    sensory_transition_profiles: `SELECT COUNT(*)::int AS count FROM world_base.sensory_transition_profiles WHERE status = 'approved'`,
    ambient_sound_profiles: `SELECT COUNT(*)::int AS count FROM world_base.ambient_sound_profiles WHERE (region_id = $1 OR region_id IS NULL) AND status = 'approved'`,
    light_visibility_profiles: `SELECT COUNT(*)::int AS count FROM world_base.light_visibility_profiles WHERE status = 'approved'`,
    actor_perception_profiles: `SELECT COUNT(*)::int AS count FROM world_base.actor_perception_profiles WHERE status = 'approved'`,
    routine_sound_profiles: `SELECT COUNT(*)::int AS count FROM world_base.routine_sound_profiles WHERE status = 'approved'`,
    npc_reaction_policies: `SELECT COUNT(*)::int AS count FROM world_base.npc_reaction_policies WHERE (region_id = $1 OR region_id IS NULL) AND status = 'approved'`,
    npc_reaction_policy_options: `SELECT COUNT(*)::int AS count FROM world_base.npc_reaction_policy_options WHERE status = 'approved'`,
    g5_edge_sensory_transition_bindings: `SELECT COUNT(*)::int AS count FROM world_base.g5_edge_sensory_transition_bindings WHERE status = 'approved'`,
    region_npc_perception_profile_bindings: `SELECT COUNT(*)::int AS count FROM world_base.region_npc_perception_profile_bindings WHERE status = 'approved'`
  };
  const counts = {};
  for (const [name, sql] of Object.entries(queries)) {
    const params = sql.includes('$1') ? [NOVGOROD_REGION_ID] : [];
    const { rows } = await client.query(sql, params);
    counts[name] = rows[0]?.count ?? 0;
  }
  return counts;
}

async function countGraphNodesByScale(client) {
  const { rows } = await client.query(
    `
      SELECT scale_level, COUNT(*)::int AS count
      FROM world_base.graph_nodes
      WHERE region_id = $1
        AND scale_level = ANY($2::text[])
        AND status IN ('approved', 'usable_with_caution')
      GROUP BY scale_level
    `,
    [NOVGOROD_REGION_ID, REQUIRED_GRAPH_SCALES]
  );
  return Object.fromEntries(rows.map((row) => [row.scale_level, row.count]));
}

async function countGraphEdgesByScale(client) {
  const { rows } = await client.query(
    `
      SELECT ge.scale_level, COUNT(*)::int AS count
      FROM world_base.graph_edges ge
      JOIN world_base.graph_nodes gn ON gn.id = ge.from_node_id
      WHERE gn.region_id = $1
        AND ge.scale_level = ANY($2::text[])
        AND ge.status IN ('approved', 'usable_with_caution')
      GROUP BY ge.scale_level
    `,
    [NOVGOROD_REGION_ID, REQUIRED_GRAPH_SCALES]
  );
  return Object.fromEntries(rows.map((row) => [row.scale_level, row.count]));
}

function summarizeChecks(checks, details = {}) {
  const errors = checks.filter((check) => !check.ok).map((check) => check.message);
  return {
    ok: errors.length === 0,
    errors,
    checks,
    ...details
  };
}

function buildPostgresUrl(env = process.env) {
  const user = env.POSTGRES_USER || 'world_admin';
  const password = encodeURIComponent(env.POSTGRES_PASSWORD ?? '');
  const db = env.POSTGRES_DB || 'world_db';
  const port = env.POSTGRES_PORT || '5432';
  const host = env.POSTGRES_HOST || '127.0.0.1';
  return `postgresql://${user}:${password}@${host}:${port}/${db}`;
}

function redactDatabaseUrl(value) {
  const raw = text(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return raw.replace(/(:\/\/[^:\s]+:)[^@\s]+@/u, '$1***@');
  }
}

function text(value) {
  return String(value ?? '').trim();
}
