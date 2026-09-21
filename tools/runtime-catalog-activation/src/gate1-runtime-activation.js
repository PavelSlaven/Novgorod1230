import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import registry from '../../../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import { RUNTIME_CATALOG_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import { computeDependencyAssertionAuditDigest } from
  '@rus/runtime-catalog/ledger-digests';
import {
  buildActivationRequest,
  buildDevelopmentPartyPreflight,
  buildImportLedger,
  digestEnvelope
} from './artifact-contracts.js';
import { compileOverlaySemanticPayload } from './overlay-compiler.js';
import { registerAlreadyImportedCatalogAndActivate } from './operator-executors.js';
import { RECORD_ADAPTERS } from './record-adapters.generated.js';
import { WORLD_RUNTIME_CATALOG_MIGRATION } from './forward-migrations.js';

const SCOPE = 'item_container_materialization_v2';
const GATE1_ROOT = 'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1';
const CANDIDATE_ROOT = 'data/knowledge-source/imports/item-container-120-v5/candidate';

export async function activateGate1RuntimeCatalog({
  worldPool,
  partyPool,
  repositoryRoot,
  worldReleaseId
}) {
  const root = resolve(repositoryRoot);
  const request = await readBoundJson(root,
    `${GATE1_ROOT}/activation-amendment-v1/request.json`);
  const attestation = await readBoundJson(root,
    `${GATE1_ROOT}/activation-amendment-v1/runtime-activation-approval-attestation.json`);
  const result = await readBoundJson(root, `${GATE1_ROOT}/import-readback-result.json`);
  await assertFileBinding(root, request.completed_import_readback, result);
  await assertFileBinding(root, request.reconciled_stage3c.candidate);
  await assertFileBinding(root, request.reconciled_stage3c.request);
  for (const binding of Object.values(request.approval_chain)) {
    const approved = await assertFileBinding(root, binding);
    if (approved.attestation_digest !== binding.attestation_digest) {
      fail('GATE1_APPROVAL_CHAIN_DIGEST_MISMATCH');
    }
  }
  for (const binding of request.compatible_world_pins) {
    await assertFileBinding(root, binding.world_manifest);
  }
  assertGate1Authority({ request, attestation, result, worldReleaseId });

  const world = request.compatible_world_pins.find(({ release_id: id }) =>
    id === worldReleaseId);
  const reconciliation = await readBoundJson(root,
    `${GATE1_ROOT}/source-record-reconciliation-v1/candidate.json`);
  const allRowsByTable = await readRegisteredRows(worldPool);
  const candidateRowsByTable = await readCandidateRows({
    root, reconciliation, result, allRowsByTable
  });
  const target = (await worldPool.query(
    `SELECT id,parent_revision_id,catalog_digest,status
       FROM world_base.world_revisions WHERE id=$1`,
    [result.target_revision_id])).rows[0];
  if (!target || target.status !== 'approved'
      || target.catalog_digest !== result.target_catalog_digest) {
    fail('GATE1_IMPORTED_TARGET_MISMATCH');
  }
  const parent = (await worldPool.query(
    'SELECT id,catalog_digest,status FROM world_base.world_revisions WHERE id=$1',
    [target.parent_revision_id])).rows[0];
  if (!parent || parent.status !== 'approved') fail('GATE1_IMPORTED_PARENT_MISMATCH');

  const compatibleWorldTuple = {
    compatible_world_revision_id: world.world_revision_id,
    compatible_world_catalog_digest: world.world_catalog_digest,
    compatible_world_pin_manifest_digest: world.world_manifest.sha256
  };
  const compiled = compileOverlaySemanticPayload({
    registry,
    parentTuple: {
      parent_revision_id: parent.id,
      parent_catalog_digest: parent.catalog_digest,
      parent_snapshot_manifest_digest: request.completed_import_readback.canonical_digest
    },
    compatibleWorldTuple,
    targetRevisionId: target.id,
    parentRowsByTable: allRowsByTable,
    candidateRowsByTable,
    dependencyLinks: [],
    g4Transitions: reconciliation.amended_compilation_report
      .graph_node_status_transitions.map((transition) => ({
        graph_node_id: transition.graph_node_id,
        asserted_status: 'approved',
        source_transition_semantic_digest: digestEnvelope({
          schema: 'rus.stage3c_g4_transition_semantics.v1',
          ...transition
        }),
        historical_approval_basis_digest: result.approval_attestation_digest
      }))
  });
  if (compiled.record_operations_by_table.some(({ insert_count: count }) => count !== 0)) {
    fail('GATE1_ALREADY_IMPORTED_ROWS_MISSING');
  }
  const importId = `catalog_import_gate1_${digestEnvelope({
    schema: 'rus.gate1_already_imported_identity.v1',
    import_result_digest: request.completed_import_readback.canonical_digest,
    compatible_world: compatibleWorldTuple
  }).slice(0, 32)}`;
  const assertions = compiled.dependency_assertions.map((assertion) => {
    const value = {
      ...assertion,
      import_id: importId,
      overlay_approval_request_digest: result.approval_request_digest,
      overlay_approval_attestation_digest: result.approval_attestation_digest
    };
    return { ...value,
      assertion_audit_digest: computeDependencyAssertionAuditDigest(value) };
  });
  const records = compiled.record_operations_by_table.flatMap(({ records: rows }) =>
    rows.map((row) => ({ ...row, import_id: importId })));
  const tables = compiled.record_operations_by_table.map((table) => ({
    table_name: table.table_name,
    dependency_order: table.dependency_order,
    insert_count: 0,
    assert_existing_count: table.assert_existing_count,
    record_count: table.record_count,
    payload_digest: table.records_digest
  }));
  const ledger = buildImportLedger({
    importId,
    rootFields: {
      catalog_scope: SCOPE,
      parent_revision_id: parent.id,
      parent_catalog_digest: parent.catalog_digest,
      parent_snapshot_manifest_digest:
        request.completed_import_readback.canonical_digest,
      ...compatibleWorldTuple,
      target_revision_id: target.id,
      target_catalog_digest: target.catalog_digest,
      record_registry_digest: compiled.record_registry_digest,
      promotion_manifest_digest: result.promotion_manifest_digest,
      approval_request_digest: result.approval_request_digest,
      approval_attestation_digest: result.approval_attestation_digest,
      schema_migration_digest: WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest
    },
    tables,
    records,
    dependencyAssertions: assertions,
    importedBy: 'gate1-approved-import-readback-registration'
  });
  const registrationId = `catalog_baseline_gate1_${digestEnvelope({
    schema: 'rus.gate1_existing_parent_registration.v1',
    parent_revision_id: parent.id,
    parent_catalog_digest: parent.catalog_digest,
    import_result_digest: request.completed_import_readback.canonical_digest,
    compatible_world: compatibleWorldTuple
  }).slice(0, 32)}`;
  const baselineRegistration = {
    registration_id: registrationId,
    parent_revision_id: parent.id,
    parent_catalog_digest: parent.catalog_digest,
    parent_snapshot_manifest_digest:
      request.completed_import_readback.canonical_digest,
    schema_fingerprint: WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
    record_registry_digest: compiled.record_registry_digest,
    ...compatibleWorldTuple,
    registration_request_digest: request.request_digest,
    registration_attestation_digest: attestation.attestation_digest
  };
  const domainRevision = {
    catalog_revision_id: target.id,
    catalog_scope: SCOPE,
    parent_registration_id: registrationId,
    target_catalog_digest: target.catalog_digest,
    ...compatibleWorldTuple,
    record_registry_digest: compiled.record_registry_digest,
    runtime_contract_digest: RUNTIME_CATALOG_CONTRACT_DIGEST,
    status: 'approved'
  };
  const counts = (await partyPool.query(
    `SELECT
      (SELECT count(*)::int FROM party_runtime.parties) AS "partyCount",
      (SELECT count(DISTINCT party_id)::int FROM party_runtime.party_catalog_pins
        WHERE catalog_scope=$1) AS "pinnedPartyCount",
      (SELECT count(*)::int FROM party_runtime.parties p
        LEFT JOIN party_runtime.party_catalog_pins c ON c.party_id=p.party_id
         AND c.catalog_scope=$1 WHERE c.party_id IS NULL) AS "missingDomainPinCount",
      (SELECT count(*)::int FROM party_runtime.commit_idempotency
        WHERE status IN ('reserved','transaction_committed')) AS "inflightStage24Stage25Count"`,
    [SCOPE])).rows[0];
  const runtimeReleaseId = digestEnvelope({
    schema: 'rus.gate1_development_runtime_release.v1',
    approval_attestation_digest: attestation.attestation_digest,
    world_release_id: worldReleaseId,
    runtime_contract_digest: RUNTIME_CATALOG_CONTRACT_DIGEST
  });
  const partyPreflight = buildDevelopmentPartyPreflight({
    ...Object.fromEntries(Object.entries(counts).map(([key, value]) =>
      [key, Number(value)])),
    runtimeReleaseId,
    runtimeContractDigest: RUNTIME_CATALOG_CONTRACT_DIGEST
  });
  const latest = (await worldPool.query(
    `SELECT event_id FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope=$1 ORDER BY event_sequence DESC LIMIT 1`, [SCOPE])).rows[0];
  const activationRequest = buildActivationRequest({
    fields: {
      parent_revision_id: parent.id,
      parent_catalog_digest: parent.catalog_digest,
      parent_snapshot_manifest_digest:
        request.completed_import_readback.canonical_digest,
      ...compatibleWorldTuple,
      target_revision_id: target.id,
      target_catalog_digest: target.catalog_digest,
      record_registry_digest: compiled.record_registry_digest,
      runtime_contract_digest: RUNTIME_CATALOG_CONTRACT_DIGEST,
      import_id: importId,
      import_audit_digest: ledger.root.import_audit_digest,
      promotion_manifest_digest: result.promotion_manifest_digest,
      approval_request_digest: result.approval_request_digest,
      approval_attestation_digest: result.approval_attestation_digest,
      expected_previous_event_id: latest?.event_id ?? null,
      runtime_release_id: runtimeReleaseId
    },
    partyPreflight
  });
  return registerAlreadyImportedCatalogAndActivate({
    worldPool,
    partyPool,
    ledger,
    domainRevision,
    baselineRegistration,
    activationRequest,
    activationAttestation: attestation,
    activationAmendmentRequest: request,
    registrationProvenance: {
      gate1_already_imported_registration: {
        schema: 'rus.gate1_already_imported_registration.v1',
        import_result_canonical_digest:
          request.completed_import_readback.canonical_digest,
        stage3c_catalog_digest: target.catalog_digest,
        runtime_projection_digest: compiled.target_catalog_digest,
        activation_scope: 'new_development_parties_only',
        production_deploy_authorized: false,
        existing_party_migration_authorized: false,
        old_save_rematerialization_authorized: false,
        authoring_only_functional_allocation_runtime_selection: false,
        zero_gameplay_row_writes: true,
        import_authorized: false,
        runtime_item_creation_authorized: false
      }
    }
  });
}

async function readRegisteredRows(pool) {
  const result = {};
  for (const entry of registry.entries) {
    result[entry.table_name] = (await pool.query(
      RECORD_ADAPTERS[entry.table_name].select_all_sql)).rows.map(normalizeRow);
  }
  return result;
}

async function readCandidateRows({ root, reconciliation, result, allRowsByTable }) {
  const datasets = new Map(reconciliation.amended_stage3c_manifest.datasets
    .map((dataset) => [dataset.table, dataset]));
  const output = {};
  for (const entry of registry.entries) {
    if (entry.operation_domain !== 'catalog_membership'
        || entry.table_name === 'procedural_scene_compiled_records') continue;
    const dataset = datasets.get(entry.table_name);
    if (!dataset) fail(`GATE1_DATASET_MISSING:${entry.table_name}`);
    const ids = entry.table_name === 'world_revisions'
      ? new Set([result.target_revision_id])
      : new Set((await readBoundJson(root,
        `${CANDIDATE_ROOT}/${dataset.path}`)).map(({ id }) => id));
    const rows = allRowsByTable[entry.table_name].filter(({ id }) => ids.has(id));
    if (rows.length !== ids.size) fail(`GATE1_IMPORTED_MEMBERSHIP_INCOMPLETE:${entry.table_name}`);
    output[entry.table_name] = rows;
  }
  return output;
}

function assertGate1Authority({ request, attestation, result, worldReleaseId }) {
  if (request.schema !== 'rus.gate1_v5_v6_activation_request_amendment.v1'
      || request.request_digest !== digestWithout(request, 'request_digest')
      || attestation.attestation_digest !== digestWithout(attestation, 'attestation_digest')
      || attestation.activation_amendment_request_digest !== request.request_digest
      || attestation.approved_permissions?.activate_for_new_development_parties_only !== true
      || attestation.approved_permissions?.import_approved_item_container_catalog !== false
      || attestation.approved_permissions?.runtime_item_creation !== false
      || result.status !== 'imported_exact_readback_verified'
      || result.activation_performed !== false
      || result.runtime_item_creation_authorized !== false
      || digestEnvelope(result) !== request.completed_import_readback.canonical_digest
      || !request.compatible_world_pins.some(({ release_id: id }) => id === worldReleaseId)) {
    fail('GATE1_ACTIVATION_AUTHORITY_INVALID');
  }
}

async function readBoundJson(root, relativePath) {
  return JSON.parse(await readFile(resolve(root, relativePath), 'utf8'));
}

async function assertFileBinding(root, binding, parsed = null) {
  const bytes = await readFile(resolve(root, binding.path));
  if (sha256(bytes) !== binding.sha256) fail('GATE1_BOUND_FILE_SHA_MISMATCH');
  const value = parsed ?? JSON.parse(bytes.toString('utf8'));
  if (binding.canonical_digest != null
      && digestEnvelope(value) !== binding.canonical_digest) {
    fail('GATE1_BOUND_FILE_CANONICAL_DIGEST_MISMATCH');
  }
  return value;
}

function digestWithout(value, field) {
  const copy = structuredClone(value);
  delete copy[field];
  return digestEnvelope(copy);
}

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) =>
    [key, value instanceof Date ? value.toISOString().slice(0, 10) : value]));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
