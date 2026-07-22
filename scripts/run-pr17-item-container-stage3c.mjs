import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

import { applyRevisionPromotionPlan, buildPr17Stage3CPromotionPlan, digestValue } from '../tools/world-catalog-workflow/src/index.js';

const root = resolve(import.meta.dirname, '..');
const candidateRoot = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/candidate');
const evidenceRoot = resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence');
const mode = argument('--mode', 'dry-run');
const attestationPath = resolve(argument('--attestation', resolve(evidenceRoot, 'FINAL_APPROVAL_ATTESTATION.json')));
const input = loadPromotionInput(attestationPath);
const plan = buildPr17Stage3CPromotionPlan(input);
if (plan.status !== 'ready') throw new Error(`PR17_STAGE3C_PLAN_BLOCKED:${plan.errors.map((error) => error.code).join(',')}`);

if (mode === 'dry-run') {
  process.stdout.write(`${JSON.stringify(summary({ mode, plan, applied: false }), null, 2)}\n`);
} else if (mode === 'lifecycle') {
  const databaseUrl = process.env.PR17_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('PR17_TEST_DATABASE_URL_REQUIRED');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const database = await assertIsolatedDatabase(client);
    await initializeSchema(client);
    await bootstrapExternalReferences(client, input.mappings, input.parent_revision);
    const rollback = await verifyRollback(plan, client);
    const first = await applyRevisionPromotionPlan({ plan, adapter: createPostgresAdapter(client) });
    const firstState = await verifyPromotionState(client, plan, input);
    await initializeSchema(client);
    await bootstrapExternalReferences(client, input.mappings, input.parent_revision);
    const repeated = await applyRevisionPromotionPlan({ plan, adapter: createPostgresAdapter(client) });
    const repeatedState = await verifyPromotionState(client, plan, input);
    process.stdout.write(`${JSON.stringify({ ...summary({ mode, plan, applied: first.applied }), database, rollback, repeat_clean_apply: repeated.applied, first_state: firstState, repeated_state: repeatedState }, null, 2)}\n`);
  } finally {
    client.release();
    await pool.end();
  }
} else {
  throw new Error(`PR17_STAGE3C_MODE_INVALID:${mode}`);
}

function loadPromotionInput(path) {
  const manifest = readJson(resolve(candidateRoot, 'manifest.json'));
  const records = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(resolve(candidateRoot, dataset.path))]));
  const readiness = readJson(resolve(candidateRoot, 'reports/EDITORIAL_READINESS_REPORT.json'));
  const compilation = readJson(resolve(candidateRoot, 'reports/COMPILATION_REPORT.json'));
  const mappingRequest = readJson(resolve(evidenceRoot, 'G4_DEPENDENCY_APPROVAL_REQUEST.json'));
  const mappings = mappingRequest.profile_mappings;
  return {
    approval_request: readJson(resolve(evidenceRoot, 'FINAL_APPROVAL_REQUEST.json')),
    approval_attestation: readJson(path),
    candidate_manifest: manifest,
    editorial_readiness_report: readiness,
    g4_coverage_report: readJson(resolve(candidateRoot, 'reports/G4_COVERAGE_REPORT.json')),
    compilation_report: compilation,
    template_ids: [...records.item_templates, ...records.container_templates].map((record) => record.id),
    legacy_inventory_snapshot: readJson(resolve(evidenceRoot, 'OPERATOR_LEGACY_INVENTORY_SNAPSHOT.json')),
    parent_revision: { id: 'novgorod_1230_research_revision_001', title: 'PR17 isolated approved parent revision', status: 'approved', catalog_digest: '0'.repeat(64) },
    target_revision: { id: 'world_revision_novgorod_1230_item_container_approved_001', title: 'Novgorod 1230 approved item/container catalogue', effective_from: '1230-01-01', effective_to: '1250-12-31' },
    source_records_by_table: records,
    approved_record_ids_by_table: Object.fromEntries(manifest.datasets.filter((dataset) => dataset.table !== 'world_revisions').map((dataset) => [dataset.table, records[dataset.table].map((record) => record.id)])),
    external_records_by_table: { graph_nodes: mappings.map((mapping) => ({ id: mapping.graph_node_id, node_type: mapping.node_type, scale_level: 'G4', region_id: 'region_novgorod_land', place_template_id: mapping.place_template_id, building_template_id: mapping.building_template_id ?? null, status: mapping.current_status })) },
    external_approved_ids: { regions: new Set(['region_novgorod_land']), region_social_roles: new Set(['nov_role_guard']) },
    mappings
  };
}

async function assertIsolatedDatabase(client) {
  const result = await client.query('SELECT current_database() AS database');
  const database = result.rows[0]?.database;
  if (!/^pr17_[a-z0-9_]+$/u.test(String(database ?? ''))) throw new Error(`PR17_ISOLATED_DATABASE_REQUIRED:${database}`);
  return database;
}

async function initializeSchema(client) {
  for (let part = 1; part <= 17; part += 1) await client.query(readFileSync(resolve(root, 'infra/world-base/schema', `${String(part).padStart(2, '0')}.sql`), 'utf8'));
  await client.query('REVOKE CREATE ON SCHEMA world_base FROM PUBLIC');
}

async function bootstrapExternalReferences(client, mappings, parentRevision) {
  await client.query("INSERT INTO world_base.regions (id, canonical_name) VALUES ('region_novgorod_land', 'Novgorod Land')");
  await client.query('INSERT INTO world_base.world_revisions (id, title, catalog_digest, status) VALUES ($1, $2, $3, $4)', [parentRevision.id, parentRevision.title, parentRevision.catalog_digest, parentRevision.status]);
  await client.query("INSERT INTO world_base.region_social_roles (id, region_id, title, status) VALUES ('nov_role_guard', 'region_novgorod_land', 'Guard', 'approved')");
  for (const id of [...new Set(mappings.map((mapping) => mapping.place_template_id).filter(Boolean))].sort()) {
    await client.query('INSERT INTO world_base.place_templates (id, slug, title, place_kind, status) VALUES ($1, $2, $3, $4, $5)', [id, id, id, 'location_context', 'approved']);
    await client.query(`INSERT INTO world_base.region_place_templates (id, region_id, place_template_id, is_allowed, allowed_scale_levels, allowed_node_types, status, confidence)
      VALUES ($1, 'region_novgorod_land', $2, true, '["G4"]'::jsonb, '["location"]'::jsonb, 'approved', 'medium')`, [`pr17_region_${id}`, id]);
  }
  for (const mapping of mappings) await client.query(`INSERT INTO world_base.graph_nodes (id, slug, title, node_type, scale_level, region_id, place_template_id, status, confidence)
    VALUES ($1, $2, $3, $4, 'G4', 'region_novgorod_land', $5, $6, $7)`, [mapping.graph_node_id, mapping.graph_node_id, mapping.graph_node_title, mapping.node_type, mapping.place_template_id, mapping.current_status, mapping.confidence]);
}

function createPostgresAdapter(client) {
  return {
    async begin() { await client.query('BEGIN'); },
    async commit() { await client.query('COMMIT'); },
    async rollback() { await client.query('ROLLBACK'); },
    async transition(table, transition) {
      if (table !== 'graph_nodes') throw new Error(`PR17_STAGE3C_TRANSITION_TABLE_FORBIDDEN:${table}`);
      const result = await client.query('UPDATE world_base.graph_nodes SET status = $1 WHERE id = $2 AND status = $3', [transition.to_status, transition.id, transition.from_status]);
      if (result.rowCount !== 1) throw new Error(`PR17_STAGE3C_TRANSITION_PRECONDITION_FAILED:${transition.id}`);
    },
    async readTransition(table, id) {
      if (table !== 'graph_nodes') throw new Error(`PR17_STAGE3C_TRANSITION_TABLE_FORBIDDEN:${table}`);
      return (await client.query('SELECT id, status FROM world_base.graph_nodes WHERE id = $1', [id])).rows[0] ?? null;
    },
    async insert(table, records) {
      for (const record of records) {
        const columns = Object.keys(record);
        const values = columns.map((column) => record[column]);
        const placeholders = values.map((value, index) => value !== null && typeof value === 'object' ? `$${index + 1}::jsonb` : `$${index + 1}`);
        await client.query(`INSERT INTO world_base.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(', ')}) VALUES (${placeholders.join(', ')})`, values.map((value) => value !== null && typeof value === 'object' ? JSON.stringify(value) : value));
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
    },
    async readRevision(id) {
      return (await client.query('SELECT id, parent_revision_id, title, effective_from::text, effective_to::text, catalog_digest, status FROM world_base.world_revisions WHERE id = $1', [id])).rows[0] ?? null;
    }
  };
}

async function verifyRollback(plan, client) {
  const adapter = createPostgresAdapter(client);
  let readbacks = 0;
  try {
    await applyRevisionPromotionPlan({ plan, adapter: { ...adapter, async readback(table, records) { readbacks += 1; if (readbacks === 1) return { record_count: 0, payload_digest: digestValue([]) }; return adapter.readback(table, records); } } });
    throw new Error('PR17_STAGE3C_ROLLBACK_PROBE_DID_NOT_FAIL');
  } catch (error) {
    if (!String(error.message).startsWith('PROMOTION_READBACK_MISMATCH:')) throw error;
  }
  const graph = await client.query('SELECT count(*)::int AS count FROM world_base.graph_nodes WHERE id = ANY($1::text[]) AND status = $2', [plan.status_transitions.map((transition) => transition.id), 'approved']);
  const target = await client.query('SELECT count(*)::int AS count FROM world_base.world_revisions WHERE id = $1', [plan.manifest.world_revision_id]);
  const first = plan.manifest.datasets[0];
  const rows = await client.query(`SELECT count(*)::int AS count FROM world_base.${quoteIdentifier(first.table)} WHERE id = ANY($1::text[])`, [plan.records_by_table[first.table].map((record) => record.id)]);
  if (graph.rows[0].count !== 0 || target.rows[0].count !== 0 || rows.rows[0].count !== 0) throw new Error('PR17_STAGE3C_ROLLBACK_RESIDUAL_WRITE');
  return 'pass';
}

async function verifyPromotionState(client, plan, input) {
  const target = (await client.query('SELECT id, parent_revision_id, catalog_digest, status FROM world_base.world_revisions WHERE id = $1', [plan.manifest.world_revision_id])).rows[0];
  const parent = (await client.query('SELECT id, catalog_digest, status FROM world_base.world_revisions WHERE id = $1', [plan.manifest.parent_revision_id])).rows[0];
  const graph = await client.query('SELECT count(*)::int AS count FROM world_base.graph_nodes WHERE id = ANY($1::text[]) AND status = $2', [plan.status_transitions.map((transition) => transition.id), 'approved']);
  const items = await client.query('SELECT count(*)::int AS count FROM world_base.item_templates WHERE world_revision_id = $1 AND status = $2', [plan.manifest.world_revision_id, 'approved']);
  const containers = await client.query('SELECT count(*)::int AS count FROM world_base.container_templates WHERE world_revision_id = $1 AND status = $2', [plan.manifest.world_revision_id, 'approved']);
  if (target?.status !== 'approved' || target.catalog_digest !== plan.manifest.catalog_digest || target.parent_revision_id !== input.parent_revision.id) throw new Error('PR17_STAGE3C_TARGET_REVISION_INVALID');
  if (parent?.status !== input.parent_revision.status || parent.catalog_digest !== input.parent_revision.catalog_digest) throw new Error('PR17_STAGE3C_PARENT_CHANGED');
  if (graph.rows[0].count !== 9 || items.rows[0].count !== 102 || containers.rows[0].count !== 18) throw new Error('PR17_STAGE3C_APPROVED_COUNTS_INVALID');
  return { target_revision_status: target.status, target_catalog_digest: target.catalog_digest, parent_revision_unchanged: true, approved_g4_count: graph.rows[0].count, approved_item_template_count: items.rows[0].count, approved_container_template_count: containers.rows[0].count, activation_performed: false, existing_parties_rematerialized: false };
}

function summary({ mode: selectedMode, plan, applied }) {
  return { pass: true, mode: selectedMode, applied, candidate_digest: plan.candidate_digest, approval_request_digest: plan.approval_request_digest, approval_attestation_digest: plan.approval_attestation_digest, promotion_manifest_digest: plan.manifest.manifest_digest, target_revision_id: plan.manifest.world_revision_id, target_catalog_digest: plan.manifest.catalog_digest, dataset_count: plan.manifest.datasets.length, status_transition_count: plan.status_transitions.length, activation_performed: false, existing_parties_rematerialized: false };
}
function argument(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function quoteIdentifier(value) { if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error(`PR17_SQL_IDENTIFIER_INVALID:${value}`); return `"${value}"`; }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
