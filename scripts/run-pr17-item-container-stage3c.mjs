import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import pg from 'pg';

import { normalizeStage13MaterializationPolicy, runStage13G5MaterializationBlock } from '@rus/new-game/stages/stage-13';
import { normalizeStage14AuditPolicy, runStage14G5AuditBlock, STAGE14_OUTPUT_SCHEMA, STAGE14_REQUIRED_CHECKS } from '@rus/new-game/stages/stage-14/compat';
import { normalizeStage16ItemPlacementPolicy, runStage16ItemPlacementBlock, STAGE16_AUDIT_SCHEMA } from '@rus/new-game/stages/stage-16';
import { retrieveApprovedItemProfileCandidates } from '@rus/new-game/stages/stage-8';
import { enterG4WithMaterialization } from '@rus/turn';
import { applyRevisionPromotionPlan, buildAllowedG5TemplateSet, buildApprovedItemCatalogSnapshot, digestValue } from '../tools/world-catalog-workflow/src/index.js';
import { buildPr17Stage3CPromotionPlan } from '../tools/world-catalog-workflow/src/internal/pr17-stage3c.js';
import { buildGate1OwnerDataArtifacts,
  validateGate1OwnerDataAuthoringAttestation } from
  './generate-gate1-owner-data-requests.mjs';
import { buildGate1SourceReconciliationArtifacts,
  validateGate1SourceReconciliationAuthoringAttestation } from
  './generate-gate1-source-reconciliation-request.mjs';
import { buildGate1SeedClosureArtifacts,
  validateGate1SeedClosureAttestation } from
  './generate-gate1-seed-closure-request.mjs';

const root = resolve(import.meta.dirname, '..');
const candidateRoot = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/candidate');
const evidenceRoot = resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence');
const gate1Root = resolve(root,
  'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1');
const gate1Cache = { seedSql: null };
const mode = argument('--mode', 'dry-run');
const attestationPath = resolve(argument('--attestation', resolve(evidenceRoot, 'FINAL_APPROVAL_ATTESTATION.json')));
const gate1Artifacts = await buildGate1OwnerDataArtifacts();
const gate1Attestation = readJson(resolve(gate1Root,
  'authoring-approval-attestation.json'));
validateGate1OwnerDataAuthoringAttestation({ ...gate1Artifacts,
  attestation: gate1Attestation });
const reconciliationArtifacts = await buildGate1SourceReconciliationArtifacts();
const reconciliationAttestation = readJson(resolve(gate1Root,
  'source-record-reconciliation-v1/authoring-approval-attestation.json'));
validateGate1SourceReconciliationAuthoringAttestation({
  ...reconciliationArtifacts, attestation: reconciliationAttestation
});
const seedClosureArtifacts = await buildGate1SeedClosureArtifacts();
const seedClosureAttestationPath = resolve(gate1Root,
  'seed-closure-v1/authoring-approval-attestation.json');
if (!existsSync(seedClosureAttestationPath)) {
  throw new Error('GATE1_SEED_CLOSURE_ATTESTATION_REQUIRED');
}
const seedClosureAttestation = readJson(seedClosureAttestationPath);
validateGate1SeedClosureAttestation({ ...seedClosureArtifacts,
  attestation: seedClosureAttestation });
const gate1 = buildGate1ImportPlan({ ...gate1Artifacts,
  attestation: gate1Attestation, reconciliation: reconciliationArtifacts,
  reconciliationAttestation, seedClosure: seedClosureArtifacts,
  seedClosureAttestation });
const input = loadPromotionInput(attestationPath, gate1);
const plan = buildPr17Stage3CPromotionPlan(input);
if (plan.status !== 'ready') throw new Error(`PR17_STAGE3C_PLAN_BLOCKED:${plan.errors.map((error) => error.code).join(',')}`);

if (mode === 'dry-run') {
  process.stdout.write(`${JSON.stringify(summary({ mode, plan, applied: false }), null, 2)}\n`);
} else if (mode === 'lifecycle' || mode === 'local-play') {
  const databaseUrl = process.env.PR17_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('PR17_TEST_DATABASE_URL_REQUIRED');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    const database = await assertDatabaseForMode(client, mode);
    await initializeSchema(client);
    const rollback = await verifyRollback(plan, client, gate1);
    const first = await applyRevisionPromotionPlan({ plan,
      adapter: createPostgresAdapter(client, gate1) });
    const firstState = await verifyPromotionState(client, plan, input, gate1);
    const runtimeE2e = await verifyPromotedRuntime(client, plan);
    await initializeSchema(client);
    const repeated = await applyRevisionPromotionPlan({ plan,
      adapter: createPostgresAdapter(client, gate1) });
    const repeatedState = await verifyPromotionState(client, plan, input, gate1);
    const result = { ...summary({ mode, plan, applied: first.applied }),
      database, rollback, repeat_clean_apply: repeated.applied,
      first_state: firstState, runtime_e2e: runtimeE2e,
      repeated_state: repeatedState };
    const resultPath = argument('--write-result', null);
    if (resultPath) writeFileSync(resolve(resultPath),
      `${JSON.stringify(importReadbackEvidence(result), null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    client.release();
    await pool.end();
  }
} else {
  throw new Error(`PR17_STAGE3C_MODE_INVALID:${mode}`);
}

function loadPromotionInput(path, gate1Plan) {
  const manifest = gate1Plan.reconciliation.candidate
    .amended_stage3c_manifest;
  const records = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, readJson(resolve(candidateRoot, dataset.path))]));
  const readiness = readJson(resolve(candidateRoot, 'reports/EDITORIAL_READINESS_REPORT.json'));
  const compilation = gate1Plan.reconciliation.candidate
    .amended_compilation_report;
  const mappingRequest = readJson(resolve(evidenceRoot, 'G4_DEPENDENCY_APPROVAL_REQUEST.json'));
  const mappings = mappingRequest.profile_mappings;
  return {
    approval_request: gate1Plan.reconciliation.candidate
      .amended_stage3c_approval_request,
    approval_attestation: readJson(path),
    original_approval_request: readJson(resolve(evidenceRoot,
      'FINAL_APPROVAL_REQUEST.json')),
    approval_amendment_attestation:
      gate1Plan.reconciliation_attestation,
    candidate_manifest: manifest,
    editorial_readiness_report: readiness,
    g4_coverage_report: readJson(resolve(candidateRoot, 'reports/G4_COVERAGE_REPORT.json')),
    compilation_report: compilation,
    template_ids: [...records.item_templates, ...records.container_templates].map((record) => record.id),
    legacy_inventory_snapshot: readJson(resolve(evidenceRoot, 'OPERATOR_LEGACY_INVENTORY_SNAPSHOT.json')),
    parent_revision: gate1Plan.parent_revision,
    target_revision: { id: 'world_revision_novgorod_1230_item_container_approved_001', title: 'Novgorod 1230 approved item/container catalogue', effective_from: '1230-01-01', effective_to: '1250-12-31' },
    source_records_by_table: records,
    approved_record_ids_by_table: Object.fromEntries(manifest.datasets.filter((dataset) => dataset.table !== 'world_revisions').map((dataset) => [dataset.table, records[dataset.table].map((record) => record.id)])),
    external_records_by_table: { graph_nodes: mappings.map((mapping) => ({ id: mapping.graph_node_id, node_type: mapping.node_type, scale_level: 'G4', region_id: 'region_novgorod_land', place_template_id: mapping.place_template_id, building_template_id: mapping.building_template_id ?? null, status: mapping.current_status })) },
    external_approved_ids: {
      regions: new Set(['region_novgorod_land']),
      region_social_roles: new Set(['nov_role_guard']),
      source_records: new Set(gate1Plan.source_record_transitions
        .map(({ id }) => id))
    },
    mappings
  };
}

async function assertDatabaseForMode(client, selectedMode) {
  const result = await client.query('SELECT current_database() AS database');
  const database = result.rows[0]?.database;
  const allowed = selectedMode === 'local-play'
    ? database === 'novgorod_world'
    : /^pr17_[a-z0-9_]+$/u.test(String(database ?? ''));
  if (!allowed) throw new Error(`PR17_${selectedMode === 'local-play' ? 'LOCAL_PLAY' : 'ISOLATED'}_DATABASE_REQUIRED:${database}`);
  return database;
}

async function initializeSchema(client) {
  for (let part = 1; part <= 17; part += 1) await client.query(readFileSync(resolve(root, 'infra/world-base/schema', `${String(part).padStart(2, '0')}.sql`), 'utf8'));
  await client.query('REVOKE CREATE ON SCHEMA world_base FROM PUBLIC');
}

function buildGate1ImportPlan({ parent, activation, attestation,
  reconciliation, reconciliationAttestation, seedClosure,
  seedClosureAttestation }) {
  const revisionRows = parent.proposed_world_base_rows.map(({ source, ...row }) =>
    ({ ...row }));
  const research = revisionRows.find(({ id }) =>
    id === parent.research_revision_source.map_revision_id);
  const compatibleRows = [2, 3, 4, 5, 6].flatMap((version) => readJson(resolve(root,
    'data/world-catalogs/novgorod/spatial-v3/candidates',
    `spatial-v3-production-v${version}/datasets/world_revisions.json`)));
  const byId = new Map([...revisionRows, ...compatibleRows]
    .map((row) => [row.id, row]));
  return Object.freeze({
    parent_revision: Object.freeze({ ...research, status: 'approved' }),
    world_revisions: Object.freeze([...byId.values()]),
    compatible_worlds: activation.compatible_worlds,
    request_digest: parent.request_digest,
    attestation_digest: attestation.attestation_digest,
    reconciliation_attestation_digest:
      reconciliationAttestation.attestation_digest,
    source_archive_digest: parent.source_snapshot.sha256,
    source_seed_digest: createHash('sha256').update(readFileSync(resolve(root,
      'tools/rus13-world-base-importer/world_base_importer_v1/'
        + 'world_base_seed_v1.sql.gz'))).digest('hex'),
    seed_closure: seedClosure.candidate.derived_outputs,
    seed_closure_attestation_digest: seedClosureAttestation.attestation_digest,
    promotions: parent.requested_authoring_promotions,
    exact_dependencies: parent.exact_dependencies,
    graph_node_transitions: parent.graph_node_transitions,
    source_record_transitions: reconciliation.candidate.collisions.map(
      ({ canonical_parent_row: source_row, requested_transition }) => ({
        source_row, ...requested_transition
      })),
    reconciliation,
    reconciliation_attestation: reconciliationAttestation
  });
}

function loadGate1SeedSql() {
  if (gate1Cache.seedSql) return gate1Cache.seedSql;
  const sql = gunzipSync(readFileSync(resolve(root,
    'tools/rus13-world-base-importer/world_base_importer_v1/'
      + 'world_base_seed_v1.sql.gz'))).toString('utf8');
  const startMarker = 'SET CONSTRAINTS ALL DEFERRED;';
  const start = sql.indexOf(startMarker);
  const end = sql.lastIndexOf('COMMIT;');
  if (start < 0 || end <= start) throw new Error('GATE1_CANONICAL_SEED_INVALID');
  gate1Cache.seedSql = sql.slice(start + startMarker.length, end);
  return gate1Cache.seedSql;
}

async function importGate1OwnerData(client, gate1Plan) {
  await client.query('SET CONSTRAINTS ALL DEFERRED');
  await client.query(loadGate1SeedSql());
  await assertGate1SeedClosure(client, gate1Plan.seed_closure);
  for (const row of gate1Plan.world_revisions) {
    const columns = Object.keys(row);
    await client.query(`INSERT INTO world_base.world_revisions
      (${columns.map(quoteIdentifier).join(',')})
      VALUES (${columns.map((_, index) => `$${index + 1}`).join(',')})`,
    columns.map((column) => row[column]));
  }
  await assertGate1SourceState(client, gate1Plan);
  for (const [table, transitions] of Object.entries(gate1Plan.promotions)) {
    if (!Array.isArray(transitions) || table === 'graph_nodes') continue;
    for (const transition of transitions) {
      const updated = await client.query(`UPDATE world_base.${quoteIdentifier(table)}
        SET status=$1 WHERE id=$2 AND status=$3`,
      [transition.to_status, transition.id, transition.from_status]);
      if (updated.rowCount !== 1) {
        throw new Error(`GATE1_AUTHORING_PROMOTION_PRECONDITION_FAILED:${table}:${transition.id}`);
      }
    }
  }
  for (const transition of gate1Plan.source_record_transitions) {
    const updated = await client.query(`UPDATE world_base.source_records
      SET status=$1 WHERE id=$2 AND status=$3`,
    [transition.to_status, transition.id, transition.from_status]);
    if (updated.rowCount !== 1) {
      throw new Error(`GATE1_SOURCE_RECONCILIATION_PRECONDITION_FAILED:${transition.id}`);
    }
  }
}

async function assertGate1SeedClosure(client, closure) {
  let total = 0;
  for (const expected of closure.table_closure) {
    const count = (await client.query(`SELECT count(*)::int AS count
      FROM world_base.${quoteIdentifier(expected.table)}`)).rows[0].count;
    if (count !== expected.row_count) {
      throw new Error(`GATE1_SEED_TABLE_READBACK_MISMATCH:${expected.table}`);
    }
    total += count;
  }
  if (closure.table_count !== closure.table_closure.length
      || total !== closure.total_row_count) {
    throw new Error('GATE1_SEED_FULL_CLOSURE_READBACK_MISMATCH');
  }
}

async function assertGate1SourceState(client, gate1Plan) {
  const expectedStatuses = {
    regions: gate1Plan.promotions.regions,
    place_templates: gate1Plan.promotions.place_templates,
    region_place_templates: gate1Plan.promotions.region_place_templates,
    graph_nodes: gate1Plan.promotions.graph_nodes
  };
  for (const [table, transitions] of Object.entries(expectedStatuses)) {
    const rows = (await client.query(`SELECT id,status FROM world_base.${quoteIdentifier(table)}
      WHERE id=ANY($1::text[]) ORDER BY id`, [transitions.map(({ id }) => id)]))
      .rows;
    if (rows.length !== transitions.length || rows.some((row) =>
      row.status !== transitions.find(({ id }) => id === row.id)?.from_status)) {
      throw new Error(`GATE1_CANONICAL_SOURCE_STATE_MISMATCH:${table}`);
    }
  }
  const role = gate1Plan.exact_dependencies.region_social_roles[0].source_row;
  const roleReadback = (await client.query(`SELECT id,region_id,title,slug,
      social_position_archetype_id,social_class_id,role_archetype_id,
      legal_status_archetype_id,dependency_archetype_id,mobility_archetype_id,
      mapping_review_status,mapping_confidence,mapping_notes,status,confidence
    FROM world_base.region_social_roles WHERE id=$1`, [role.role_id])).rows[0];
  assertExactRecord(roleReadback, {
    id: role.role_id, region_id: role.region_id, title: role.role_title,
    slug: role.role_id,
    social_position_archetype_id: role.social_position_archetype_id,
    social_class_id: role.social_class_id,
    role_archetype_id: role.role_archetype_id,
    legal_status_archetype_id: role.legal_status_archetype_id,
    dependency_archetype_id: role.dependency_archetype_id,
    mobility_archetype_id: role.mobility_archetype_id,
    mapping_review_status: role.mapping_review_status,
    mapping_confidence: role.mapping_confidence,
    mapping_notes: role.mapping_notes,
    status: role.status, confidence: role.confidence
  }, 'GATE1_CANONICAL_ROLE_READBACK_MISMATCH');
  for (const transition of gate1Plan.source_record_transitions) {
    const source = transition.source_row;
    const columns = Object.keys(source);
    const row = (await client.query(`SELECT ${columns.map((column) =>
      quoteIdentifier(column)).join(',')} FROM world_base.source_records
      WHERE id=$1`, [source.id])).rows[0];
    assertExactRecord(row, source,
      'GATE1_CANONICAL_SOURCE_RECORD_READBACK_MISMATCH');
  }
  for (const transition of gate1Plan.graph_node_transitions) {
    const source = transition.source_row;
    const row = (await client.query(`SELECT id,slug,title,node_type,scale_level,
        parent_node_id,region_id,region_cell_code,place_template_id,status,
        confidence,sources,audit_notes
      FROM world_base.graph_nodes WHERE id=$1`, [source.id])).rows[0];
    const { audit_notes: sourceAuditNotes, ...sourceColumns } = source;
    assertExactRecord(row, sourceColumns,
      'GATE1_CANONICAL_GRAPH_READBACK_MISMATCH');
    if (row.audit_notes !== sourceAuditNotes
        && !row.audit_notes?.startsWith(`${sourceAuditNotes}\r\nImporter preserved unmapped source fields: `)) {
      throw new Error(`GATE1_CANONICAL_GRAPH_AUDIT_NOTES_MISMATCH:${source.id}`);
    }
  }
}

function assertExactRecord(actual, expected, code) {
  if (!actual || Object.entries(expected).some(([key, value]) =>
    comparable(actual[key]) !== comparable(value))) {
    const mismatches = Object.fromEntries(Object.entries(expected)
      .filter(([key, value]) => comparable(actual?.[key])
        !== comparable(value))
      .map(([key, value]) => [key, { expected: value,
        actual: actual?.[key] ?? null }]));
    throw new Error(`${code}:${JSON.stringify(mismatches)}`);
  }
}

function comparable(value) {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString().replace('.000Z', 'Z'));
  }
  return JSON.stringify(value ?? null);
}

function createPostgresAdapter(client, gate1Plan) {
  return {
    async begin() {
      await client.query('BEGIN');
      await importGate1OwnerData(client, gate1Plan);
    },
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

async function verifyRollback(plan, client, gate1Plan) {
  const adapter = createPostgresAdapter(client, gate1Plan);
  let readbacks = 0;
  try {
    await applyRevisionPromotionPlan({ plan, adapter: { ...adapter, async readback(table, records) { readbacks += 1; if (readbacks === 1) return { record_count: 0, payload_digest: digestValue([]) }; return adapter.readback(table, records); } } });
    throw new Error('PR17_STAGE3C_ROLLBACK_PROBE_DID_NOT_FAIL');
  } catch (error) {
    if (!String(error.message).startsWith('PROMOTION_READBACK_MISMATCH:')) throw error;
  }
  const graph = await client.query('SELECT count(*)::int AS count FROM world_base.graph_nodes WHERE id = ANY($1::text[]) AND status = $2', [plan.status_transitions.map((transition) => transition.id), 'approved']);
  const target = await client.query('SELECT count(*)::int AS count FROM world_base.world_revisions WHERE id = $1', [plan.manifest.world_revision_id]);
  const parent = await client.query('SELECT count(*)::int AS count FROM world_base.world_revisions WHERE id = $1', [gate1Plan.parent_revision.id]);
  const reconciledSources = await client.query(`SELECT count(*)::int AS count
    FROM world_base.source_records WHERE id=ANY($1::text[])`,
  [gate1Plan.source_record_transitions.map(({ id }) => id)]);
  const first = plan.manifest.datasets[0];
  const rows = await client.query(`SELECT count(*)::int AS count FROM world_base.${quoteIdentifier(first.table)} WHERE id = ANY($1::text[])`, [plan.records_by_table[first.table].map((record) => record.id)]);
  if (graph.rows[0].count !== 0 || target.rows[0].count !== 0
      || parent.rows[0].count !== 0 || reconciledSources.rows[0].count !== 0
      || rows.rows[0].count !== 0) {
    throw new Error('PR17_STAGE3C_ROLLBACK_RESIDUAL_WRITE');
  }
  return 'pass';
}

async function verifyPromotionState(client, plan, input, gate1Plan) {
  const target = (await client.query('SELECT id, parent_revision_id, catalog_digest, status FROM world_base.world_revisions WHERE id = $1', [plan.manifest.world_revision_id])).rows[0];
  const parent = (await client.query('SELECT id, catalog_digest, status FROM world_base.world_revisions WHERE id = $1', [plan.manifest.parent_revision_id])).rows[0];
  const graph = await client.query('SELECT count(*)::int AS count FROM world_base.graph_nodes WHERE id = ANY($1::text[]) AND status = $2', [plan.status_transitions.map((transition) => transition.id), 'approved']);
  const items = await client.query('SELECT count(*)::int AS count FROM world_base.item_templates WHERE world_revision_id = $1 AND status = $2', [plan.manifest.world_revision_id, 'approved']);
  const containers = await client.query('SELECT count(*)::int AS count FROM world_base.container_templates WHERE world_revision_id = $1 AND status = $2', [plan.manifest.world_revision_id, 'approved']);
  if (target?.status !== 'approved' || target.catalog_digest !== plan.manifest.catalog_digest || target.parent_revision_id !== input.parent_revision.id) throw new Error('PR17_STAGE3C_TARGET_REVISION_INVALID');
  if (parent?.status !== input.parent_revision.status || parent.catalog_digest !== input.parent_revision.catalog_digest) throw new Error('PR17_STAGE3C_PARENT_CHANGED');
  if (graph.rows[0].count !== 9 || items.rows[0].count !== 102 || containers.rows[0].count !== 18) throw new Error('PR17_STAGE3C_APPROVED_COUNTS_INVALID');
  const gate1Readback = await verifyGate1OwnerReadback(client, gate1Plan);
  return { target_revision_status: target.status, target_catalog_digest: target.catalog_digest, parent_revision_unchanged: true, approved_g4_count: graph.rows[0].count, approved_item_template_count: items.rows[0].count, approved_container_template_count: containers.rows[0].count, gate1_owner_readback: gate1Readback, activation_performed: false, existing_parties_rematerialized: false };
}

async function verifyGate1OwnerReadback(client, gate1Plan) {
  const expectedCounts = {
    place_templates: 64,
    region_place_templates: 39,
    region_social_roles: 71,
    graph_nodes: 11359,
    graph_edges: 30248
  };
  const counts = {};
  for (const [table, expected] of Object.entries(expectedCounts)) {
    counts[table] = (await client.query(
      `SELECT count(*)::int AS count FROM world_base.${quoteIdentifier(table)}`
    )).rows[0].count;
    if (counts[table] !== expected) {
      throw new Error(`GATE1_CANONICAL_IMPORT_COUNT_MISMATCH:${table}`);
    }
  }
  const worlds = (await client.query(`SELECT id,parent_revision_id,title,
      effective_from::text,effective_to::text,catalog_digest,status
    FROM world_base.world_revisions WHERE id=ANY($1::text[]) ORDER BY id`,
  [gate1Plan.world_revisions.map(({ id }) => id)])).rows;
  const expectedWorlds = [...gate1Plan.world_revisions]
    .map((row) => row.id === gate1Plan.parent_revision.id
      ? { ...row, status: 'approved' } : row)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (digestValue(worlds) !== digestValue(expectedWorlds)) {
    throw new Error('GATE1_WORLD_REVISION_READBACK_MISMATCH');
  }
  const selected = (await client.query(`SELECT id,parent_node_id,status
    FROM world_base.graph_nodes WHERE id=ANY($1::text[]) ORDER BY id`,
  [gate1Plan.graph_node_transitions.map(({ graph_node_id }) =>
    graph_node_id)])).rows;
  const expectedSelected = gate1Plan.graph_node_transitions.map(
    ({ source_row }) => ({ id: source_row.id,
      parent_node_id: source_row.parent_node_id, status: 'approved' }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (digestValue(selected) !== digestValue(expectedSelected)) {
    throw new Error('GATE1_GRAPH_TOPOLOGY_READBACK_MISMATCH');
  }
  const sourceRows = [];
  for (const transition of gate1Plan.source_record_transitions) {
    const { updated_at: sourceUpdatedAt, ...sourceStable } =
      transition.source_row;
    const expected = { ...sourceStable, status: 'approved' };
    const columns = [...Object.keys(expected), 'updated_at'];
    const actual = (await client.query(`SELECT ${columns.map((column) =>
      quoteIdentifier(column)).join(',')} FROM world_base.source_records
      WHERE id=$1`, [transition.id])).rows[0];
    assertExactRecord(actual, expected,
      'GATE1_RECONCILED_SOURCE_READBACK_MISMATCH');
    if (!(actual.updated_at instanceof Date)
        || actual.updated_at <= new Date(sourceUpdatedAt)) {
      throw new Error(`GATE1_RECONCILED_SOURCE_UPDATED_AT_INVALID:${transition.id}`);
    }
    sourceRows.push(Object.fromEntries(Object.keys(expected).map((column) => [column,
      actual[column] instanceof Date
        ? actual[column].toISOString().replace('.000Z', 'Z')
        : actual[column]])));
  }
  const activationTable = (await client.query(`SELECT
    to_regclass('world_base.runtime_catalog_activation_events') AS name`))
    .rows[0].name;
  const activationEventCount = activationTable
    ? (await client.query(`SELECT count(*)::int AS count
        FROM world_base.runtime_catalog_activation_events`)).rows[0].count
    : 0;
  if (activationEventCount !== 0) {
    throw new Error('GATE1_RUNTIME_ACTIVATION_FORBIDDEN');
  }
  return Object.freeze({
    request_digest: gate1Plan.request_digest,
    authoring_attestation_digest: gate1Plan.attestation_digest,
    source_archive_digest: gate1Plan.source_archive_digest,
    source_seed_digest: gate1Plan.source_seed_digest,
    seed_table_count: gate1Plan.seed_closure.table_count,
    seed_row_count: gate1Plan.seed_closure.total_row_count,
    seed_table_closure_digest:
      gate1Plan.seed_closure.table_closure_digest,
    seed_closure_attestation_digest:
      gate1Plan.seed_closure_attestation_digest,
    table_counts: Object.freeze(counts),
    world_revision_count: worlds.length,
    world_revisions_digest: digestValue(worlds),
    approved_g4_topology_digest: digestValue(selected),
    approved_parent_source_digest: digestValue(sourceRows),
    approved_parent_source_count: sourceRows.length,
    reconciliation_attestation_digest:
      gate1Plan.reconciliation_attestation_digest,
    compatible_worlds: Object.freeze(gate1Plan.compatible_worlds.map((world) => ({
      release_id: world.release_id,
      world_revision_id: world.world_revision_id,
      world_catalog_digest: world.world_catalog_digest
    }))),
    activation_event_count: 0,
    runtime_item_creation_authorized: false
  });
}

async function verifyPromotedRuntime(client, plan) {
  const records = await readPromotedRecords(client, plan);
  const targetRevisionId = plan.manifest.world_revision_id;
  const targetRevision = records.world_revisions.find((record) => record.id === targetRevisionId);
  if (targetRevision?.status !== 'approved' || targetRevision.catalog_digest !== plan.manifest.catalog_digest) throw new Error('PR17_RUNTIME_TARGET_REVISION_INVALID');
  const sourceCatalogDigest = targetRevision.catalog_digest;
  const snapshot = buildApprovedItemCatalogSnapshot({
    records_by_table: records,
    world_revision_id: targetRevisionId,
    catalog_digest: sourceCatalogDigest
  });
  const stage8 = await retrieveApprovedItemProfileCandidates({
    version: 1,
    schema: 'item_profile_retriever_input',
    request_id: 'pr17-postgres-runtime-stage8',
    normalized_request: {},
    historical_frame: { region_id: 'region_novgorod_land', year: 1230, season: 'spring' },
    regional_context_package: {},
    candidate_place_template_set: {},
    npc_candidate_set: {},
    world_revision_id: targetRevisionId,
    approved_catalog_snapshot: snapshot
  });
  if (stage8.selection_status !== 'ready' || stage8.item_profile_candidates.length !== 102 || stage8.container_profile_candidates.length !== 18) throw new Error('PR17_RUNTIME_STAGE8_INVALID');

  const graphNodeIds = plan.status_transitions.map((transition) => transition.id).sort();
  const contexts = [];
  for (const graphNodeId of graphNodeIds) {
    const graphNode = records.graph_nodes.find((record) => record.id === graphNodeId);
    const requestId = `pr17-postgres-runtime-${graphNodeId}`;
    const selectedStartNode = {
      selected: {
        selected_g4_type_id: graphNode.node_type,
        selected_scale_level: 'G4',
        selected_place_template_id: graphNode.place_template_id
      },
      selected_node_chain: {
        g1_node_id: 'gn_nov_g1_03_04',
        g2_node_id: 'gn_nov_g1_03_04_g2_runtime',
        g3_node_id: 'gn_nov_g1_03_04_g3_runtime',
        g4_node_id: graphNodeId
      }
    };
    const allowed = buildAllowedG5TemplateSet({
      records_by_table: records,
      graph_node_id: graphNodeId,
      world_revision_id: targetRevisionId,
      selected_g4_type_id: graphNode.node_type,
      source_catalog_digest: sourceCatalogDigest
    });
    let baseline = null;
    let materializeCalls = 0;
    let stageResult = null;
    const enter = () => enterG4WithMaterialization({
      partyId: `party_${graphNodeId}`,
      g4Id: graphNodeId,
      transact: async (work) => work({ id: `tx_${graphNodeId}` }),
      loadCommittedBaseline: async () => baseline,
      buildMaterializationRequest: async () => ({ stage8, allowed }),
      materialize: async () => {
        materializeCalls += 1;
        stageResult = await materializeRuntimeContext({
          requestId,
          graphNode,
          selectedStartNode,
          targetRevisionId,
          stage8,
          allowed
        });
        return { run_id: stageResult.scene.materialization_run.run_id, scene: stageResult.scene, placement: stageResult.placement };
      },
      commitMaterializationAndMovement: async ({ materialization }) => {
        baseline = materialization;
        return { operation: 'materialize_and_move', ...materialization };
      },
      commitMovement: async ({ baselineRunId }) => ({ operation: 'move_to_existing_g4', baseline_run_id: baselineRunId })
    });
    const firstEntry = await enter();
    const repeatEntry = await enter();
    if (firstEntry.operation !== 'materialize_and_move'
      || repeatEntry.operation !== 'move_to_existing_g4'
      || repeatEntry.baseline_run_id !== firstEntry.run_id
      || materializeCalls !== 1
      || stageResult?.stage13_pass !== true
      || stageResult?.stage14_pass !== true
      || stageResult?.stage16_pass !== true) throw new Error(`PR17_RUNTIME_CONTEXT_INVALID:${graphNodeId}`);
    contexts.push({
      graph_node_id: graphNodeId,
      profile_id: allowed.allowed_g5_templates[0].materialization_profile.profile_id,
      stage13_pass: true,
      stage14_pass: true,
      stage16_pass: true,
      item_instance_count: stageResult.placement.item_instances.length,
      container_instance_count: stageResult.placement.container_instances.length,
      repeat_entry_reused_baseline: true
    });
  }
  return {
    pass: contexts.length === 9,
    source: 'postgres_readback',
    target_revision_id: targetRevisionId,
    target_catalog_digest: sourceCatalogDigest,
    dataset_count: plan.manifest.datasets.length,
    stage8_item_candidate_count: stage8.item_profile_candidates.length,
    stage8_container_candidate_count: stage8.container_profile_candidates.length,
    approved_g4_context_count: contexts.length,
    contexts
  };
}

async function readPromotedRecords(client, plan) {
  const records = {};
  for (const dataset of plan.manifest.datasets) {
    const ids = plan.records_by_table[dataset.table].map((record) => record.id);
    const result = await client.query(`SELECT * FROM world_base.${quoteIdentifier(dataset.table)} WHERE id = ANY($1::text[]) ORDER BY id`, [ids]);
    if (result.rows.length !== dataset.record_count) throw new Error(`PR17_RUNTIME_DB_READBACK_COUNT_MISMATCH:${dataset.table}`);
    records[dataset.table] = result.rows;
  }
  const graphNodeIds = plan.status_transitions.map((transition) => transition.id);
  const graphNodes = await client.query('SELECT * FROM world_base.graph_nodes WHERE id = ANY($1::text[]) ORDER BY id', [graphNodeIds]);
  if (graphNodes.rows.length !== graphNodeIds.length || graphNodes.rows.some((record) => record.status !== 'approved')) throw new Error('PR17_RUNTIME_G4_READBACK_INVALID');
  records.graph_nodes = graphNodes.rows;
  return records;
}

async function materializeRuntimeContext({ requestId, graphNode, selectedStartNode, targetRevisionId, stage8, allowed }) {
  const historicalFrame = { region_id: 'region_novgorod_land', calendar: { year: 1230, season: 'spring' } };
  const weatherState = { version: 1, schema: 'weather_state', request_id: requestId, condition: 'clear' };
  const startPlaceAudit = { pass: true };
  const playerCharacter = { schema: 'player_character_game_profile' };
  const playerCharacterAudit = { pass: true };
  const stage13Input = {
    version: 1,
    schema: 'g5_materialization_input',
    request_id: requestId,
    selected_start_node: selectedStartNode,
    normalized_request: {},
    historical_frame: historicalFrame,
    weather_state: weatherState,
    regional_context_package: { region_id: 'region_novgorod_land' },
    start_place_audit: startPlaceAudit,
    player_character: playerCharacter,
    player_character_audit: playerCharacterAudit,
    npc_candidate_set: {},
    item_profile_candidate_set: stage8,
    materialization_context: {
      party_id: `party_${graphNode.id}`,
      g1_id: 'gn_nov_g1_03_04',
      world_revision_id: targetRevisionId,
      region_id: 'region_novgorod_land',
      year: 1230,
      season: 'spring',
      trigger: 'first_entry',
      occurrence: 0,
      materializer_version: 'code_materializer_v2',
      rng_version: 'mulberry32_v1'
    },
    materialization_policy: normalizeStage13MaterializationPolicy(),
    allowed_g5_template_set: allowed
  };
  const stage13 = await runStage13G5MaterializationBlock({ input: stage13Input });
  if (!stage13.pass) throw new Error(`PR17_RUNTIME_STAGE13_FAILED:${graphNode.id}`);
  const stage14 = await runStage14G5AuditBlock({
    input: {
      version: 1,
      schema: 'g5_scene_audit_input',
      request_id: requestId,
      historical_frame: historicalFrame,
      weather_state: weatherState,
      selected_start_node: selectedStartNode,
      start_place_audit: startPlaceAudit,
      player_character: playerCharacter,
      player_character_audit: playerCharacterAudit,
      allowed_g5_template_set: allowed,
      g5_scene_graph_draft: stage13.output,
      npc_candidate_set: {},
      item_profile_candidate_set: stage8,
      audit_policy: normalizeStage14AuditPolicy()
    },
    audit: async () => ({
      version: 1,
      schema: STAGE14_OUTPUT_SCHEMA,
      request_id: requestId,
      pass: true,
      checks: Object.fromEntries(STAGE14_REQUIRED_CHECKS.map((check) => [check, { pass: true, evidence: [{ kind: 'postgres_runtime_e2e' }] }])),
      concerns: [],
      evidence: [{ kind: 'postgres_runtime_e2e' }],
      repair_route: null,
      commit_permission: { can_commit_g5_scene_graph: true, can_continue_to_npc_placement: true, can_continue_to_item_placement: true, can_continue_to_visible_context: false }
    })
  });
  if (!stage14.pass) throw new Error(`PR17_RUNTIME_STAGE14_FAILED:${graphNode.id}`);
  const stage16 = await runStage16ItemPlacementBlock({
    input: {
      version: 1,
      schema: 'item_placement_input',
      request_id: requestId,
      historical_frame: historicalFrame,
      selected_start_node: selectedStartNode,
      start_place_audit: startPlaceAudit,
      player_character: playerCharacter,
      player_character_audit: playerCharacterAudit,
      g5_scene_graph: stage13.output,
      g5_scene_audit: stage14.output,
      initial_npc_placement: { version: 1, schema: 'initial_npc_placement_draft', request_id: requestId, placement_status: 'empty_allowed', npc_instances: [] },
      npc_placement_audit: { version: 1, schema: 'initial_npc_placement_audit', request_id: requestId, pass: true, commit_permission: { can_continue_to_item_placement: true } },
      item_profile_candidate_set: stage8,
      item_placement_policy: normalizeStage16ItemPlacementPolicy()
    },
    audit: async () => ({
      version: 1,
      schema: STAGE16_AUDIT_SCHEMA,
      request_id: requestId,
      pass: true,
      checks: Object.fromEntries([
        'all_item_candidates_exist',
        'all_container_candidates_exist',
        'all_property_rules_exist',
        'all_anchors_valid',
        'all_holders_valid',
        'causal_basis_valid',
        'visibility_access_property_risk_valid',
        'closed_containers_protected',
        'no_player_inventory_duplicates',
        'no_forbidden_entities_created',
        'source_trace_sufficient'
      ].map((check) => [check, true])),
      concerns: [],
      evidence: [{ kind: 'postgres_runtime_e2e' }],
      repair_route: null,
      commit_permission: { can_commit_item_instances: true, can_commit_container_instances: true, can_continue_to_time_light_gate: true, can_continue_to_visible_context: false }
    })
  });
  return { stage13_pass: stage13.pass, stage14_pass: stage14.pass, stage16_pass: stage16.pass, scene: stage13.output, placement: stage16.draft };
}

function summary({ mode: selectedMode, plan, applied }) {
  return { pass: true, mode: selectedMode, applied, candidate_digest: plan.candidate_digest, approval_request_digest: plan.approval_request_digest, approval_attestation_digest: plan.approval_attestation_digest, approval_amendment_attestation_digest: plan.approval_amendment_attestation_digest, promotion_manifest_digest: plan.manifest.manifest_digest, target_revision_id: plan.manifest.world_revision_id, target_catalog_digest: plan.manifest.catalog_digest, dataset_count: plan.manifest.datasets.length, status_transition_count: plan.status_transitions.length, activation_performed: false, existing_parties_rematerialized: false };
}
function importReadbackEvidence(result) {
  return Object.freeze({
    schema_version: 'rus.pr17.item_container_stage3c_result.v2',
    status: 'imported_exact_readback_verified',
    candidate_digest: result.candidate_digest,
    approval_request_digest: result.approval_request_digest,
    approval_attestation_digest: result.approval_attestation_digest,
    approval_amendment_attestation_digest:
      result.approval_amendment_attestation_digest,
    promotion_manifest_digest: result.promotion_manifest_digest,
    target_revision_id: result.target_revision_id,
    target_catalog_digest: result.target_catalog_digest,
    rollback: result.rollback,
    repeat_clean_apply: result.repeat_clean_apply,
    first_state: result.first_state,
    repeated_state: result.repeated_state,
    activation_performed: false,
    production_activation: false,
    existing_parties_rematerialized: false,
    runtime_item_creation_authorized: false
  });
}
function argument(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function quoteIdentifier(value) { if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error(`PR17_SQL_IDENTIFIER_INVALID:${value}`); return `"${value}"`; }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
