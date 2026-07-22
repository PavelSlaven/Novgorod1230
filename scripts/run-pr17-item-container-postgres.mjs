import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

import { applyPr17ItemContainerCandidateBundle, digestValue } from '../tools/world-catalog-workflow/src/index.js';

const root = resolve(import.meta.dirname, '..');
const candidateRoot = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/candidate');
const requestPath = resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json');
const mode = argument('--mode', 'dry-run');
const input = loadCandidate();

if (mode === 'dry-run') {
  const result = await applyPr17ItemContainerCandidateBundle({ ...input, mode });
  process.stdout.write(`${JSON.stringify({ pass: true, ...result, table_count: result.plan.length }, null, 2)}\n`);
} else if (mode === 'lifecycle') {
  const databaseUrl = process.env.PR17_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('PR17_TEST_DATABASE_URL_REQUIRED');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const database = await assertIsolatedDatabase(client);
    await initializeSchema(client);
    await bootstrapExternalReferences(client, input.mappings);
    const adapter = createPostgresAdapter(client);
    const rollback = await verifyRollback(input, adapter, client);
    const applied = await applyPr17ItemContainerCandidateBundle({ ...input, mode: 'apply', adapter });
    const repeated = await applyPr17ItemContainerCandidateBundle({ ...input, mode: 'apply', adapter });
    const state = await verifyNonActivation(client, input);
    process.stdout.write(`${JSON.stringify({ pass: true, mode, database, candidate_digest: input.manifest.candidate_digest, rollback, apply: applied.applied, repeat_apply: repeated.applied, activation_performed: false, state }, null, 2)}\n`);
  } finally {
    client.release();
    await pool.end();
  }
} else {
  throw new Error(`PR17_POSTGRES_MODE_INVALID:${mode}`);
}

function loadCandidate() {
  const manifest = readJson(resolve(candidateRoot, 'manifest.json'));
  const records = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(resolve(candidateRoot, dataset.path))]));
  const compilation = readJson(resolve(candidateRoot, 'reports/COMPILATION_REPORT.json'));
  const mappings = readJson(requestPath).profile_mappings;
  return {
    manifest,
    records_by_table: records,
    reports: {
      compilation,
      editorial_readiness: readJson(resolve(candidateRoot, 'reports/EDITORIAL_READINESS_REPORT.json')),
      g4_coverage: readJson(resolve(candidateRoot, 'reports/G4_COVERAGE_REPORT.json'))
    },
    external_ids: {
      regions: ['region_novgorod_land'],
      world_revisions: ['novgorod_1230_research_revision_001'],
      graph_nodes: mappings.map((mapping) => mapping.graph_node_id),
      region_social_roles: ['nov_role_guard']
    },
    mappings
  };
}

async function assertIsolatedDatabase(client) {
  const result = await client.query('SELECT current_database() AS database, inet_server_addr()::text AS address');
  const database = result.rows[0]?.database;
  if (!/^pr17_[a-z0-9_]+$/u.test(String(database ?? ''))) throw new Error(`PR17_ISOLATED_DATABASE_REQUIRED:${database}`);
  return database;
}

async function initializeSchema(client) {
  for (let part = 1; part <= 17; part += 1) {
    const filename = `${String(part).padStart(2, '0')}.sql`;
    await client.query(readFileSync(resolve(root, 'infra/world-base/schema', filename), 'utf8'));
  }
  await client.query('REVOKE CREATE ON SCHEMA world_base FROM PUBLIC');
}

async function bootstrapExternalReferences(client, mappings) {
  await client.query("INSERT INTO world_base.regions (id, canonical_name) VALUES ('region_novgorod_land', 'Novgorod Land')");
  await client.query("INSERT INTO world_base.world_revisions (id, title, catalog_digest, status) VALUES ('novgorod_1230_research_revision_001', 'PR17 isolated parent revision', $1, 'draft')", ['0'.repeat(64)]);
  await client.query("INSERT INTO world_base.region_social_roles (id, region_id, title, status) VALUES ('nov_role_guard', 'region_novgorod_land', 'Guard', 'draft')");
  const placeTemplateIds = [...new Set(mappings.map((mapping) => mapping.place_template_id).filter(Boolean))].sort();
  for (const id of placeTemplateIds) {
    await client.query('INSERT INTO world_base.place_templates (id, slug, title, place_kind, status) VALUES ($1, $2, $3, $4, $5)', [id, id, id, 'location_context', 'approved']);
    await client.query(`INSERT INTO world_base.region_place_templates
      (id, region_id, place_template_id, is_allowed, allowed_scale_levels, allowed_node_types, status, confidence)
      VALUES ($1, 'region_novgorod_land', $2, true, '["G4"]'::jsonb, '["location"]'::jsonb, 'approved', 'medium')`, [`pr17_region_${id}`, id]);
  }
  for (const mapping of mappings) {
    await client.query(`INSERT INTO world_base.graph_nodes (id, slug, title, node_type, scale_level, region_id, place_template_id, status, confidence)
      VALUES ($1, $2, $3, $4, 'G4', 'region_novgorod_land', $5, $6, $7)`, [mapping.graph_node_id, mapping.graph_node_id, mapping.graph_node_title, mapping.node_type, mapping.place_template_id, mapping.current_status, mapping.confidence]);
  }
}

function createPostgresAdapter(client) {
  return {
    async begin() { await client.query('BEGIN'); },
    async commit() { await client.query('COMMIT'); },
    async rollback() { await client.query('ROLLBACK'); },
    async insert(table, records) {
      const quotedTable = quoteIdentifier(table);
      for (const record of records) {
        const columns = Object.keys(record);
        const values = columns.map((column) => record[column]);
        const placeholders = values.map((value, index) => value !== null && typeof value === 'object' ? `$${index + 1}::jsonb` : `$${index + 1}`);
        await client.query(`INSERT INTO world_base.${quotedTable} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (id) DO NOTHING`, values.map((value) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value));
      }
    },
    async readback(table, records) {
      if (records.length === 0) return { record_count: 0, payload_digest: digestValue([]) };
      const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
      const projections = columns.map((column) => {
        if (column === 'mass_grams_per_unit') return `${quoteIdentifier(column)}::float8 AS ${quoteIdentifier(column)}`;
        return records.some((record) => /^\d{4}-\d{2}-\d{2}$/u.test(record[column] ?? '')) ? `${quoteIdentifier(column)}::text AS ${quoteIdentifier(column)}` : quoteIdentifier(column);
      }).join(', ');
      const result = await client.query(`SELECT ${projections} FROM world_base.${quoteIdentifier(table)} WHERE id = ANY($1::text[])`, [records.map((record) => record.id)]);
      const byId = new Map(result.rows.map((record) => [record.id, record]));
      const canonical = records.map((expected) => Object.fromEntries(Object.keys(expected).map((column) => [column, byId.get(expected.id)?.[column]])));
      return { record_count: result.rows.length, payload_digest: digestValue(canonical) };
    }
  };
}

async function verifyRollback(input, adapter, client) {
  let readbacks = 0;
  const failingAdapter = { ...adapter, async readback(table, records) { readbacks += 1; if (readbacks === 1) return { record_count: 0, payload_digest: digestValue([]) }; return adapter.readback(table, records); } };
  try {
    await applyPr17ItemContainerCandidateBundle({ ...input, mode: 'apply', adapter: failingAdapter });
    throw new Error('PR17_ROLLBACK_PROBE_DID_NOT_FAIL');
  } catch (error) {
    if (!String(error.message).startsWith('PR17_READBACK_MISMATCH:')) throw error;
  }
  const first = input.manifest.datasets[0];
  const residual = await client.query(`SELECT count(*)::int AS count FROM world_base.${quoteIdentifier(first.table)} WHERE id = ANY($1::text[])`, [input.records_by_table[first.table].map((record) => record.id)]);
  if (residual.rows[0].count !== 0) throw new Error(`PR17_ROLLBACK_RESIDUAL_WRITE:${first.table}`);
  return 'pass';
}

async function verifyNonActivation(client, input) {
  const revision = await client.query('SELECT status FROM world_base.world_revisions WHERE id = $1', [input.manifest.world_revision_id]);
  const rules = await client.query("SELECT count(*)::int AS count FROM world_base.g4_item_materialization_rules WHERE status <> 'draft' UNION ALL SELECT count(*)::int FROM world_base.g4_container_materialization_rules WHERE status <> 'draft'");
  const graphNodes = await client.query('SELECT count(*)::int AS count FROM world_base.graph_nodes WHERE id = ANY($1::text[]) AND status = $2', [input.mappings.map((mapping) => mapping.graph_node_id), 'approved']);
  if (revision.rows[0]?.status !== 'draft' || rules.rows.some((row) => row.count !== 0) || graphNodes.rows[0]?.count !== 0) throw new Error('PR17_ACTIVATION_FORBIDDEN');
  return { world_revision_status: 'draft', non_draft_materialization_rule_count: 0, approved_selected_g4_count: 0 };
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error(`PR17_SQL_IDENTIFIER_INVALID:${value}`);
  return `"${value}"`;
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
