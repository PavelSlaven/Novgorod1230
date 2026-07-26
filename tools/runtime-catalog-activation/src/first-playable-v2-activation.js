import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import registry from '../../../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import {
  RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
} from '@rus/runtime-catalog/runtime-contract';
import {
  computeDependencyAssertionAuditDigest
} from '@rus/runtime-catalog/ledger-digests';
import {
  buildActivationRequest,
  buildBaseWorldCompatibilityManifest,
  buildBaselineRegistrationId,
  buildBaselineRegistrationRequest,
  buildImportLedger,
  buildOperatorBaselineSnapshotManifest,
  buildOverlayApprovalRequest,
  buildPartyPreflight,
  buildPromotionManifest,
  buildRuntimeReleaseIdentity,
  digestEnvelope,
  finalizeOverlayCandidate
} from './artifact-contracts.js';
import {
  activateApprovedCatalog,
  importApprovedCatalog,
  registerCatalogBaseline
} from './operator-executors.js';
import { compileOverlaySemanticPayload } from './overlay-compiler.js';
import { readPostgresSchemaFingerprint } from './forward-migration.js';
import {
  PARTY_RUNTIME_CATALOG_MIGRATION,
  WORLD_RUNTIME_CATALOG_MIGRATION
} from './forward-migrations.js';
import { RECORD_ADAPTERS } from './record-adapters.generated.js';

const CATALOG_SCOPE = 'item_container_materialization_v2';
const APPROVED_STAGE3C_REVISION =
  'world_revision_novgorod_1230_item_container_approved_001';
const BASELINE_REVISION =
  'world_revision_novgorod_1230_runtime_catalog_baseline_v2_001';
const DOMAIN_REVISION =
  'runtime_catalog_lower_dvina_first_playable_v2_001';
const WORLD_REVISION =
  'novgorod_spatial_v3_production_v2_candidate_001';
const WORLD_CATALOG_DIGEST =
  'fd75d9cb1ad0e949ff3b0bb5ef044e510f340a967f43867e9c4d41c16ba9f255';

/**
 * Builds the complete sealed release-local catalog activation input from exact
 * promoted rows. No draft row is inserted or activated by this flow.
 */
export async function buildFirstPlayableV2ActivationBundle({
  worldPool,
  partyPool,
  repositoryRoot,
  gitCommitSha,
  authorizationRef =
    'Codex task 019f98cf-12d4-7790-8f0a-a336df47508f user authorization'
}) {
  requirePool(worldPool, 'worldPool');
  requirePool(partyPool, 'partyPool');
  if (!/^[a-f0-9]{40}$/u.test(String(gitCommitSha ?? ''))) {
    throw new TypeError('gitCommitSha must be an exact commit SHA.');
  }
  const root = resolve(repositoryRoot);
  const candidateRoot = resolve(
    root,
    'data/knowledge-source/imports/item-container-120-v5/candidate'
  );
  const candidateManifest = await readJson(
    resolve(candidateRoot, 'manifest.json')
  );
  const finalApproval = await readJson(resolve(
    root,
    'docs/implementation/item-container-120-approval-audit/evidence/'
      + 'FINAL_APPROVAL_ATTESTATION.json'
  ));
  const g4Approval = await readJson(resolve(
    root,
    'docs/implementation/item-container-120-approval-audit/evidence/'
      + 'G4_DEPENDENCY_APPROVAL_REQUEST.json'
  ));
  const worldManifestPath =
    'data/world-catalogs/novgorod/spatial-v3/candidates/'
      + 'spatial-v3-production-v2/manifest.json';
  const worldManifest = await readJson(resolve(root, worldManifestPath));

  assertApprovedSources({ candidateManifest, finalApproval, worldManifest });
  await assertExactMigrationTargets({ worldPool, partyPool });

  const allRowsByTable = await readRegisteredRows(worldPool);
  const candidateRowsByTable = await readPromotedMembership({
    candidateManifest,
    candidateRoot,
    allRowsByTable
  });
  const historicalApprovalDigest = digestEnvelope(finalApproval);
  const g4Transitions = g4Approval.profile_mappings.map((mapping) => ({
    graph_node_id: mapping.graph_node_id,
    asserted_status: 'approved',
    source_transition_semantic_digest: digestEnvelope({
      schema: 'rus.stage3c_g4_transition_semantics.v1',
      graph_node_id: mapping.graph_node_id,
      from_status: mapping.current_status,
      to_status: mapping.requested_status,
      profile_id: mapping.profile_id,
      causal_basis_type: mapping.causal_basis_type,
      causal_basis_id: mapping.causal_basis_id
    }),
    historical_approval_basis_digest: historicalApprovalDigest
  }));

  const runtimeConfiguration = {
    schema: 'rus.first_playable_runtime_world_configuration.v1',
    release_id: 'spatial-v3-production-v2',
    world_revision_id: WORLD_REVISION,
    world_catalog_digest: WORLD_CATALOG_DIGEST,
    world_manifest_sha256: sha256(await readFile(
      resolve(root, worldManifestPath)
    )),
    scenario_binding_id: 'lower_dvina_late_summer_open_water_v1',
    runtime_catalog_contract_digest:
      RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
  };
  const compatibilityManifest = buildBaseWorldCompatibilityManifest({
    compatibleWorldRevisionId: WORLD_REVISION,
    compatibleWorldCatalogDigest: WORLD_CATALOG_DIGEST,
    sourceRuntimeConfigurationDigest: digestEnvelope(runtimeConfiguration),
    sourceArtifactPaths: [
      worldManifestPath,
      'apps/game-server/src/composition/production-spatial-v3.js',
      'apps/game-server/src/runtime/releases/'
        + 'spatial-v3-production-v2-bindings.js'
    ],
    sourceCommitSha: gitCommitSha,
    validationContractVersion: 'base_world_compatibility_v2'
  });
  const compatibleWorldTuple = {
    compatible_world_revision_id:
      compatibilityManifest.compatible_world_revision_id,
    compatible_world_catalog_digest:
      compatibilityManifest.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      compatibilityManifest.compatible_world_pin_manifest_digest
  };

  // world_revisions is intentionally excluded: baseline registration itself
  // appends its parent revision after verification.
  const baselineRows = Object.fromEntries(
    Object.entries(allRowsByTable)
      .filter(([table]) => table !== 'world_revisions')
  );
  const baselineManifest = buildOperatorBaselineSnapshotManifest({
    schemaFingerprint:
      WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
    registry,
    rowsByTable: baselineRows
  });
  const baselineRequest = buildBaselineRegistrationRequest({
    parentRevisionId: BASELINE_REVISION,
    parentCatalogDigest: baselineManifest.records_aggregate_digest,
    baselineManifest,
    compatibleWorldTuple
  });
  const baselineAttestationPayload = {
    schema: 'rus.baseline_registration_attestation.v2',
    registration_request_digest:
      baselineRequest.registration_request_digest,
    parent_tuple: {
      parent_revision_id: baselineRequest.parent_revision_id,
      parent_catalog_digest: baselineRequest.parent_catalog_digest,
      parent_snapshot_manifest_digest:
        baselineRequest.parent_snapshot_manifest_digest
    },
    compatible_world_tuple: compatibleWorldTuple,
    decision: 'approve_register_baseline',
    action: 'register_baseline',
    attested_by: authorizationRef
  };
  const baselineAttestation = sealAttestation(baselineAttestationPayload);
  const baselineRegistrationId =
    buildBaselineRegistrationId(baselineRequest);

  const compiled = compileOverlaySemanticPayload({
    registry,
    parentTuple: {
      parent_revision_id: baselineRequest.parent_revision_id,
      parent_catalog_digest: baselineRequest.parent_catalog_digest,
      parent_snapshot_manifest_digest:
        baselineRequest.parent_snapshot_manifest_digest
    },
    compatibleWorldTuple,
    targetRevisionId: DOMAIN_REVISION,
    parentRowsByTable: allRowsByTable,
    candidateRowsByTable,
    dependencyLinks: [],
    g4Transitions
  });
  const insertCount = compiled.record_operations_by_table.reduce(
    (sum, table) => sum + table.insert_count,
    0
  );
  if (insertCount !== 0) {
    fail(
      'FIRST_PLAYABLE_CATALOG_NOT_PROMOTED',
      'Release-local activation may only assert existing Stage 3C rows.'
    );
  }
  const equivalenceReport = {
    schema: 'rus.first_playable_catalog_semantic_equivalence.v1',
    result: 'PASS',
    comparison: 'exact_promoted_rows_to_release_membership',
    stage3c_candidate_digest: candidateManifest.candidate_digest,
    stage3c_approval_digest: historicalApprovalDigest,
    compiled_semantic_payload_digest: compiled.semantic_payload_digest,
    insert_count: 0,
    assert_existing_count:
      compiled.record_operations_by_table.reduce(
        (sum, table) => sum + table.assert_existing_count,
        0
      ),
    dependency_assertion_count: compiled.dependency_assertions.length
  };
  const candidate = finalizeOverlayCandidate({
    compiledSemanticPayload: compiled,
    semanticEquivalenceReportDigest: digestEnvelope(equivalenceReport)
  });
  const promotionManifest = buildPromotionManifest({
    compiledSemanticPayload: compiled,
    candidate
  });
  const approvalRequest = buildOverlayApprovalRequest({
    candidate,
    promotionManifest,
    historicalPr17AttestationDigest: historicalApprovalDigest
  });
  const overlayAttestation = sealAttestation({
    schema: 'rus.item_container_overlay_approval_attestation.v2',
    approval_request_digest: approvalRequest.approval_request_digest,
    decision: 'approve_overlay_import',
    activation_authorized: false,
    attested_by: authorizationRef,
    source_authorization:
      'mandatory production activation for first launch; no existing parties'
  });
  const importId =
    `catalog_import_${approvalRequest.approval_request_digest.slice(0, 32)}`;
  const assertions = compiled.dependency_assertions.map((assertion) => {
    const enriched = {
      ...assertion,
      import_id: importId,
      overlay_approval_request_digest:
        approvalRequest.approval_request_digest,
      overlay_approval_attestation_digest:
        overlayAttestation.attestation_digest
    };
    return {
      ...enriched,
      assertion_audit_digest:
        computeDependencyAssertionAuditDigest(enriched)
    };
  });
  const records = compiled.record_operations_by_table.flatMap(
    ({ records: tableRecords }) =>
      tableRecords.map((record) => ({ ...record, import_id: importId }))
  );
  const tables = compiled.record_operations_by_table.map((table) => ({
    table_name: table.table_name,
    dependency_order: table.dependency_order,
    insert_count: table.insert_count,
    assert_existing_count: table.assert_existing_count,
    record_count: table.record_count,
    payload_digest: table.records_digest
  }));
  const ledger = buildImportLedger({
    importId,
    rootFields: {
      catalog_scope: CATALOG_SCOPE,
      parent_revision_id: baselineRequest.parent_revision_id,
      parent_catalog_digest: baselineRequest.parent_catalog_digest,
      parent_snapshot_manifest_digest:
        baselineRequest.parent_snapshot_manifest_digest,
      ...compatibleWorldTuple,
      target_revision_id: DOMAIN_REVISION,
      target_catalog_digest: compiled.target_catalog_digest,
      record_registry_digest: compiled.record_registry_digest,
      promotion_manifest_digest:
        promotionManifest.promotion_manifest_digest,
      approval_request_digest: approvalRequest.approval_request_digest,
      approval_attestation_digest: overlayAttestation.attestation_digest,
      schema_migration_digest:
        WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest
    },
    tables,
    records,
    dependencyAssertions: assertions,
    importedBy: authorizationRef
  });

  const buildReleaseManifest = {
    schema: 'rus.first_playable_build_release_manifest.v1',
    release_id: 'spatial-v3-production-v2',
    git_commit_sha: gitCommitSha,
    world_manifest_sha256: runtimeConfiguration.world_manifest_sha256,
    world_catalog_digest: WORLD_CATALOG_DIGEST,
    party_migration_chain_digest:
      'b7a9eb899b5d302dc27bff6797f1bb6abf31b245ace3e7c285f94543e3039d45',
    runtime_catalog_contract_digest:
      RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
  };
  const runtimeRelease = buildRuntimeReleaseIdentity({
    gitCommitSha,
    buildReleaseManifestDigest: digestEnvelope(buildReleaseManifest),
    supportedRuntimeContractDigests: [
      RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
    ]
  });
  const counts = await readPartyPreflightCounts(partyPool);
  const partyPreflight = buildPartyPreflight({
    ...counts,
    runtimeReleaseId: runtimeRelease.runtime_release_id,
    runtimeContractDigest:
      RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
  });
  const activationRequest = buildActivationRequest({
    fields: {
      parent_revision_id: baselineRequest.parent_revision_id,
      parent_catalog_digest: baselineRequest.parent_catalog_digest,
      parent_snapshot_manifest_digest:
        baselineRequest.parent_snapshot_manifest_digest,
      ...compatibleWorldTuple,
      target_revision_id: ledger.root.target_revision_id,
      target_catalog_digest: ledger.root.target_catalog_digest,
      record_registry_digest: ledger.root.record_registry_digest,
      runtime_contract_digest:
        RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST,
      import_id: ledger.root.import_id,
      import_audit_digest: ledger.root.import_audit_digest,
      promotion_manifest_digest: ledger.root.promotion_manifest_digest,
      approval_request_digest: ledger.root.approval_request_digest,
      approval_attestation_digest:
        ledger.root.approval_attestation_digest,
      expected_previous_event_id: null,
      runtime_release_id: runtimeRelease.runtime_release_id
    },
    partyPreflight
  });
  const activationAttestation = sealAttestation({
    schema: 'rus.runtime_catalog_activation_attestation.v2',
    activation_request_digest:
      activationRequest.activation_request_digest,
    catalog_scope: activationRequest.catalog_scope,
    target_revision_id: activationRequest.target_revision_id,
    target_catalog_digest: activationRequest.target_catalog_digest,
    import_id: activationRequest.import_id,
    import_audit_digest: activationRequest.import_audit_digest,
    runtime_contract_digest: activationRequest.runtime_contract_digest,
    runtime_release_id: activationRequest.runtime_release_id,
    decision: 'approve_activation',
    attested_by: authorizationRef,
    source_authorization:
      'mandatory production activation for first launch; no existing parties'
  });

  return deepFreeze({
    schema: 'rus.first_playable_v2_activation_bundle.v1',
    release_status: 'ready_for_operator_apply',
    git_commit_sha: gitCommitSha,
    build_release_manifest: buildReleaseManifest,
    runtime_release: runtimeRelease,
    compatibility_manifest: compatibilityManifest,
    runtime_configuration_tuple: {
      compatible_world_revision_id:
        compatibilityManifest.compatible_world_revision_id,
      compatible_world_catalog_digest:
        compatibilityManifest.compatible_world_catalog_digest,
      source_runtime_configuration_digest:
        compatibilityManifest.source_runtime_configuration_digest
    },
    baseline_manifest: baselineManifest,
    baseline_request: baselineRequest,
    baseline_attestation: baselineAttestation,
    baseline_registration_id: baselineRegistrationId,
    equivalence_report: equivalenceReport,
    candidate,
    promotion_manifest: promotionManifest,
    approval_request: approvalRequest,
    overlay_attestation: overlayAttestation,
    import_ledger: ledger,
    domain_revision: {
      parent_registration_id: baselineRegistrationId,
      runtime_contract_digest:
        RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST,
      title: 'Lower Dvina first-playable approved item/container catalog'
    },
    party_preflight: partyPreflight,
    activation_request: activationRequest,
    activation_attestation: activationAttestation,
    bundle_digest: digestEnvelope({
      schema: 'rus.first_playable_v2_activation_bundle_identity.v1',
      git_commit_sha: gitCommitSha,
      baseline_request_digest:
        baselineRequest.registration_request_digest,
      candidate_digest: candidate.candidate_digest,
      import_audit_digest: ledger.root.import_audit_digest,
      activation_request_digest:
        activationRequest.activation_request_digest
    })
  });
}

export async function applyFirstPlayableV2ActivationBundle({
  worldPool,
  partyPool,
  bundle
}) {
  const baseline = await registerCatalogBaseline({
    pool: worldPool,
    request: bundle.baseline_request,
    attestation: bundle.baseline_attestation,
    baselineManifest: bundle.baseline_manifest,
    compatibilityManifest: bundle.compatibility_manifest,
    runtimeConfigurationTuple: bundle.runtime_configuration_tuple,
    registrationId: bundle.baseline_registration_id,
    title: 'Lower Dvina runtime catalog baseline v2'
  });
  const imported = await importApprovedCatalog({
    pool: worldPool,
    ledger: bundle.import_ledger,
    domainRevision: bundle.domain_revision,
    approvalAttestation: bundle.overlay_attestation
  });
  const activated = await activateApprovedCatalog({
    worldPool,
    partyPool,
    request: bundle.activation_request,
    attestation: bundle.activation_attestation
  });
  return deepFreeze({
    schema: 'rus.first_playable_v2_activation_result.v1',
    baseline,
    imported,
    activated,
    bundle_digest: bundle.bundle_digest
  });
}

async function readRegisteredRows(pool) {
  const result = {};
  for (const entry of registry.entries) {
    result[entry.table_name] =
      (await pool.query(RECORD_ADAPTERS[entry.table_name].select_all_sql)).rows
        .map(normalizePostgresRow);
  }
  return result;
}

function normalizePostgresRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    value instanceof Date ? value.toISOString().slice(0, 10) : value
  ]));
}

async function readPromotedMembership({
  candidateManifest,
  candidateRoot,
  allRowsByTable
}) {
  const datasets = new Map(
    candidateManifest.datasets.map((dataset) => [dataset.table, dataset])
  );
  const result = {};
  for (const entry of registry.entries) {
    if (entry.operation_domain !== 'catalog_membership') continue;
    const dataset = datasets.get(entry.table_name);
    if (!dataset) {
      fail(
        'FIRST_PLAYABLE_STAGE3C_DATASET_MISSING',
        `Stage 3C dataset is absent: ${entry.table_name}`
      );
    }
    let ids;
    if (entry.table_name === 'world_revisions') {
      ids = new Set([APPROVED_STAGE3C_REVISION]);
    } else {
      const sourceRows = await readJson(resolve(candidateRoot, dataset.path));
      ids = new Set(sourceRows.map(({ id }) => id));
    }
    const rows = allRowsByTable[entry.table_name]
      .filter(({ id }) => ids.has(id));
    if (rows.length !== ids.size) {
      fail(
        'FIRST_PLAYABLE_PROMOTED_MEMBERSHIP_INCOMPLETE',
        `Promoted membership is incomplete: ${entry.table_name}`,
        { expected: ids.size, actual: rows.length }
      );
    }
    result[entry.table_name] = rows;
  }
  return result;
}

async function assertExactMigrationTargets({ worldPool, partyPool }) {
  const [world, party] = await Promise.all([
    readPostgresSchemaFingerprint(worldPool, 'world_base'),
    readPostgresSchemaFingerprint(partyPool, 'party_runtime')
  ]);
  if (world !== WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint
      || party !== PARTY_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint) {
    fail(
      'FIRST_PLAYABLE_ACTIVATION_SCHEMA_MISMATCH',
      'Exact runtime-catalog forward migrations must be applied first.',
      { world, party }
    );
  }
}

function assertApprovedSources({
  candidateManifest,
  finalApproval,
  worldManifest
}) {
  if (candidateManifest.candidate_digest !== finalApproval.candidate_digest
      || finalApproval.decision !== 'approve_all_120'
      || worldManifest.world_revision_id !== WORLD_REVISION
      || worldManifest.catalog_digest !== WORLD_CATALOG_DIGEST
      || worldManifest.status !== 'approved') {
    fail(
      'FIRST_PLAYABLE_APPROVAL_CHAIN_INVALID',
      'Stage 3C and Spatial-v3 approval evidence must match exact sources.'
    );
  }
}

async function readPartyPreflightCounts(pool) {
  const row = (await pool.query(
    `SELECT
       (SELECT count(*)::int FROM party_runtime.parties) AS party_count,
       (SELECT count(DISTINCT party_id)::int
          FROM party_runtime.party_catalog_pins
         WHERE catalog_scope=$1) AS pinned_party_count,
       (SELECT count(*)::int
          FROM party_runtime.parties p
          LEFT JOIN party_runtime.party_catalog_pins c
            ON c.party_id=p.party_id AND c.catalog_scope=$1
         WHERE c.party_id IS NULL) AS missing_domain_pin_count,
       (SELECT count(*)::int
          FROM party_runtime.commit_idempotency
         WHERE status IN ('reserved','transaction_committed'))
          AS inflight_stage24_stage25_count`,
    [CATALOG_SCOPE]
  )).rows[0];
  return {
    partyCount: Number(row.party_count),
    pinnedPartyCount: Number(row.pinned_party_count),
    missingDomainPinCount: Number(row.missing_domain_pin_count),
    inflightStage24Stage25Count:
      Number(row.inflight_stage24_stage25_count)
  };
}

function sealAttestation(payload) {
  return { ...payload, attestation_digest: digestEnvelope(payload) };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function requirePool(pool, name) {
  if (!pool?.query) throw new TypeError(`${name} must be a PostgreSQL pool.`);
}

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
