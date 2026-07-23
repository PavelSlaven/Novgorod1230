import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

import { normalizeStage13MaterializationPolicy, runStage13G5MaterializationBlock } from '@rus/new-game/stages/stage-13';
import { normalizeStage14AuditPolicy, runStage14G5AuditBlock, STAGE14_OUTPUT_SCHEMA, STAGE14_REQUIRED_CHECKS } from '@rus/new-game/stages/stage-14/compat';
import { normalizeStage16ItemPlacementPolicy, runStage16ItemPlacementBlock, STAGE16_AUDIT_SCHEMA } from '@rus/new-game/stages/stage-16';
import { retrieveApprovedItemProfileCandidates } from '@rus/new-game/stages/stage-8';
import { enterG4WithMaterialization } from '@rus/turn';
import { applyRevisionPromotionPlan, buildAllowedG5TemplateSet, buildApprovedItemCatalogSnapshot, digestValue } from '../tools/world-catalog-workflow/src/index.js';
import { buildPr17Stage3CPromotionPlan } from '../tools/world-catalog-workflow/src/internal/pr17-stage3c.js';

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
    const runtimeE2e = await verifyPromotedRuntime(client, plan);
    await initializeSchema(client);
    await bootstrapExternalReferences(client, input.mappings, input.parent_revision);
    const repeated = await applyRevisionPromotionPlan({ plan, adapter: createPostgresAdapter(client) });
    const repeatedState = await verifyPromotionState(client, plan, input);
    process.stdout.write(`${JSON.stringify({ ...summary({ mode, plan, applied: first.applied }), database, rollback, repeat_clean_apply: repeated.applied, first_state: firstState, runtime_e2e: runtimeE2e, repeated_state: repeatedState }, null, 2)}\n`);
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
  return { pass: true, mode: selectedMode, applied, candidate_digest: plan.candidate_digest, approval_request_digest: plan.approval_request_digest, approval_attestation_digest: plan.approval_attestation_digest, promotion_manifest_digest: plan.manifest.manifest_digest, target_revision_id: plan.manifest.world_revision_id, target_catalog_digest: plan.manifest.catalog_digest, dataset_count: plan.manifest.datasets.length, status_transition_count: plan.status_transitions.length, activation_performed: false, existing_parties_rematerialized: false };
}
function argument(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : fallback; }
function quoteIdentifier(value) { if (!/^[a-z_][a-z0-9_]*$/u.test(value)) throw new Error(`PR17_SQL_IDENTIFIER_INVALID:${value}`); return `"${value}"`; }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
