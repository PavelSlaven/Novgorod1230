import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
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
  buildActivationEvent,
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
  finalizeOverlayCandidate,
  verifyDecisionAttestation
} from './artifact-contracts.js';
import { buildSpatialV3TargetCatalogRequests } from
  './spatial-v3-target-catalog-requests.js';
import {
  activateApprovedCatalog,
  importApprovedCatalog,
  registerCatalogBaseline
} from './operator-executors.js';
import { compileOverlaySemanticPayload } from './overlay-compiler.js';
import { readPostgresSchemaFingerprint } from './forward-migration.js';
import {
  PARTY_RUNTIME_CATALOG_MIGRATION,
  WORLD_RUNTIME_CATALOG_MIGRATION,
  WORLD_RUNTIME_CATALOG_MIGRATION_V3
} from './forward-migrations.js';
import { RECORD_ADAPTERS } from './record-adapters.generated.js';
import { buildG4NaturalCompiledRecords, deriveApprovedNaturalSceneRepins } from './g4-natural-compiled-records.js';
import { buildG4NaturalPresentationCompiledRecords } from './g4-natural-presentation-compiled-records.js';
import { buildG4NaturalPlacementCompiledRecords } from './g4-natural-placement-compiled-records.js';
import { buildTargetStartCompiledRecords } from './target-start-compiled-records.js';
import { buildTargetFiniteCompiledRecords } from './target-finite-profile.js';

const CATALOG_SCOPE = 'item_container_materialization_v2';
const APPROVED_STAGE3C_REVISION =
  'world_revision_novgorod_1230_item_container_approved_001';
const FIRST_PLAYABLE_V2_RELEASE = Object.freeze({
  releaseId: 'spatial-v3-production-v2',
  baselineRevision:
    'world_revision_novgorod_1230_runtime_catalog_baseline_v2_001',
  domainRevision: 'runtime_catalog_lower_dvina_first_playable_v2_001',
  worldRevision: 'novgorod_spatial_v3_production_v2_candidate_001',
  worldCatalogDigest:
    'fd75d9cb1ad0e949ff3b0bb5ef044e510f340a967f43867e9c4d41c16ba9f255',
  worldSchemaFingerprint:
    WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
  worldSchemaMigration: WORLD_RUNTIME_CATALOG_MIGRATION,
  candidateDirectory: 'spatial-v3-production-v2',
  bindingsFile: 'spatial-v3-production-v2-bindings.js',
  bundleSchema: 'rus.first_playable_v2_activation_bundle.v1',
  bundleIdentitySchema:
    'rus.first_playable_v2_activation_bundle_identity.v1',
  resultSchema: 'rus.first_playable_v2_activation_result.v1',
  baselineTitle: 'Lower Dvina runtime catalog baseline v2',
  activationBasis:
    'mandatory production activation for first launch; no existing parties'
});

/** Read-only preparation; approvals are supplied later by the independent reviewer. */
export async function prepareSpatialV3TargetItemCatalog({ worldPool,
  repositoryRoot, gitCommitSha, contentIdentity = false }) {
  const pending = (await buildSpatialV3TargetCatalogRequests({
    repositoryRoot, subjectCommit: gitCommitSha, contentIdentity
  }))['item-compatibility-request.json'];
  const root = resolve(repositoryRoot);
  const candidateRoot = resolve(root,
    'data/knowledge-source/imports/item-container-120-v5/candidate');
  const candidateManifest = await readJson(resolve(candidateRoot, 'manifest.json'));
  const finalApproval = await readJson(resolve(root,
    'docs/implementation/item-container-120-approval-audit/evidence/FINAL_APPROVAL_ATTESTATION.json'));
  if (candidateManifest.candidate_digest !== finalApproval.candidate_digest
      || finalApproval.decision !== 'approve_all_120') {
    fail('FIRST_PLAYABLE_APPROVAL_CHAIN_INVALID', 'Exact approved item source is required.');
  }
  const compatible = pending.compatible_world;
  const compatibleWorldTuple = Object.fromEntries([
    'compatible_world_revision_id', 'compatible_world_catalog_digest',
    'compatible_world_pin_manifest_digest'
  ].map((key) => [key, compatible[key]]));
  const world = (await worldPool.query(
    'SELECT id,catalog_digest,status FROM world_base.world_revisions WHERE id=$1',
    [compatible.compatible_world_revision_id])).rows;
  if (world.length !== 1 || world[0].status !== 'approved'
      || world[0].catalog_digest !== compatible.compatible_world_catalog_digest) {
    fail('BASE_WORLD_COMPATIBILITY_MISMATCH', 'Exact approved target world is required.');
  }
  const rows = await readRegisteredRows(worldPool);
  const membership = await readPromotedMembership({ candidateManifest,
    candidateRoot, allRowsByTable: rows });
  const approvedTargetRows = await targetPresentationRows(root);
  membership.procedural_scene_compiled_records = [
    ...(membership.procedural_scene_compiled_records ?? []), ...approvedTargetRows];
  const baselineManifest = buildOperatorBaselineSnapshotManifest({
    schemaFingerprint: await readPostgresSchemaFingerprint(worldPool, 'world_base'),
    registry, rowsByTable: Object.fromEntries(Object.entries(rows)
      .filter(([table]) => table !== 'world_revisions'))
  });
  const baselineRequest = buildBaselineRegistrationRequest({
    parentRevisionId: 'world_revision_novgorod_1230_runtime_catalog_target_v17_001',
    parentCatalogDigest: baselineManifest.records_aggregate_digest,
    baselineManifest, compatibleWorldTuple
  });
  const g4Approval = await readJson(resolve(root,
    'docs/implementation/item-container-120-approval-audit/evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json'));
  const compiled = compileOverlaySemanticPayload({ registry,
    parentTuple: { parent_revision_id: baselineRequest.parent_revision_id,
      parent_catalog_digest: baselineRequest.parent_catalog_digest,
      parent_snapshot_manifest_digest: baselineRequest.parent_snapshot_manifest_digest },
    compatibleWorldTuple, targetRevisionId: pending.target_revision_id,
    parentRowsByTable: rows, candidateRowsByTable: membership,
    dependencyLinks: [], g4Transitions: approvedG4Transitions(g4Approval,
      digestEnvelope(finalApproval))
  });
  if (compiled.record_operations_by_table.some((table) => table.insert_count !== 0
    && table.table_name !== 'procedural_scene_compiled_records')) {
    fail('FIRST_PLAYABLE_CATALOG_NOT_PROMOTED', 'Target membership must already be approved.');
  }
  const equivalence = { schema: 'rus.target_item_catalog_equivalence.v1',
    result: 'PASS', comparison: 'exact_promoted_rows_to_release_membership',
    stage3c_candidate_digest: candidateManifest.candidate_digest,
    compiled_semantic_payload_digest: compiled.semantic_payload_digest,
    target_presentation_record_count: approvedTargetRows.length,
    insert_count: compiled.record_operations_by_table.reduce((sum, table) => sum + table.insert_count, 0) };
  const candidate = finalizeOverlayCandidate({ compiledSemanticPayload: compiled,
    semanticEquivalenceReportDigest: digestEnvelope(equivalence) });
  const promotion = buildPromotionManifest({ compiledSemanticPayload: compiled, candidate });
  return deepFreeze({ schema: 'rus.spatial_v3_target_item_import_preparation.v1',
    status: 'pending_independent_compatibility_and_import_approval',
    source_request: pending, baseline_manifest: baselineManifest,
    baseline_request: baselineRequest,
    baseline_registration_id: buildBaselineRegistrationId(baselineRequest),
    compatibility_manifest: compatible,
    runtime_configuration_tuple: {
      compatible_world_revision_id: compatible.compatible_world_revision_id,
      compatible_world_catalog_digest: compatible.compatible_world_catalog_digest,
      source_runtime_configuration_digest: compatible.source_runtime_configuration_digest
    },
    compiled, equivalence_report: equivalence, candidate,
    promotion_manifest: promotion,
    approval_request: buildOverlayApprovalRequest({ candidate,
      promotionManifest: promotion,
      historicalPr17AttestationDigest: digestEnvelope(finalApproval) }),
    baseline_attestation: null, overlay_attestation: null,
    activation_request: null, activation_attestation: null
  });
}

async function targetPresentationRows(root) {
  const base = resolve(root, 'data/world-catalogs/novgorod');
  const approval = await readJson(resolve(base, 'm2c-sol-data-approval.json'));
  const capacityStartApproval = await readJson(resolve(base,
    'live-world-runtime-v17/capacity-v2-start-successors/data-approval.json'));
  const naturalBytes = await readFile(resolve(base, 'm2c-natural/candidate.json'));
  if (approval.decision !== 'APPROVE_DATA_ONLY'
    || createHash('sha256').update(naturalBytes).digest('hex') !== approval.approved_exact_candidates?.natural_baseline_sha256) {
    fail('SPATIAL_V3_TARGET_PRESENTATION_APPROVAL_REQUIRED', 'Exact independently approved natural baseline is required.');
  }
  const successorApproval = await readJson(resolve(base, 'm2c-natural/nature-successor-data-approval.json'));
  const approvedBytes = (path) => execFileSync('git', ['show', `ae212e78:${path}`],
    { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const naturalSuccessorBytes = await readFile(resolve(base, 'm2c-natural/nature-successor-candidate-v2.json'), 'utf8');
  const presentationSuccessorBytes = await readFile(resolve(base, 'm2c-natural-presentation/nature-successor-candidate-v2.json'), 'utf8');
  const sceneTemplateBytes = await readFile(resolve(base,
    'm2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_templates.json'), 'utf8');
  const startBytesByPath = new Map(await Promise.all(capacityStartApproval.approved_successors
    .map(async ({ start }) => [start.path, await readFile(resolve(root, start.path), 'utf8')])));
  const placementSourceBytes = await readFile(resolve(base, 'm2c-natural-placement/candidate.json'), 'utf8');
  const approvedSceneRepins = deriveApprovedNaturalSceneRepins({ capacityApproval: capacityStartApproval,
    sceneTemplateBytes, startBytesByPath, placementCandidateBytes: placementSourceBytes,
    placementApproval: approval });
  const naturalSuccessors = buildG4NaturalCompiledRecords({ candidateBytes: naturalSuccessorBytes,
    approvedCandidateBytes: approvedBytes(successorApproval.candidates.natural.path), approval: successorApproval,
    approvedSceneRepins });
  const presentationSuccessors = buildG4NaturalPresentationCompiledRecords({ candidateBytes: presentationSuccessorBytes,
    approvedCandidateBytes: approvedBytes(successorApproval.candidates.presentation.path),
    naturalCandidateBytes: naturalSuccessorBytes,
    approvedNaturalCandidateBytes: approvedBytes(successorApproval.candidates.natural.path),
    approval: successorApproval, naturalRecords: naturalSuccessors });
  const placementPath = 'm2c-natural-placement/scene-template-v2-successor-candidate.json';
  const placementSuccessor = buildG4NaturalPlacementCompiledRecords({
    candidateBytes: await readFile(resolve(base, placementPath), 'utf8'),
    sourceCandidateBytes: placementSourceBytes,
    approvedStartBytesByPath: startBytesByPath,
    sceneTemplateBytes,
    capacityApproval: capacityStartApproval, approval,
    naturalRecords: naturalSuccessors, presentationRecords: presentationSuccessors });
  return [...buildG4NaturalCompiledRecords({ candidate: JSON.parse(naturalBytes) }),
    ...buildG4NaturalPresentationCompiledRecords({ candidateBytes: await readFile(resolve(base, 'm2c-natural-presentation/candidate.json'), 'utf8'), approval }),
    ...naturalSuccessors, ...presentationSuccessors,
    ...placementSuccessor,
    ...buildTargetStartCompiledRecords({ candidateBytes: await readFile(resolve(base,
      'live-world-runtime-v17/capacity-v2-start-successors/novgorod_pine_ridge_approach_v1.start.json'), 'utf8'),
    approval: capacityStartApproval, placementSuccessor: {
      path: `data/world-catalogs/novgorod/${placementPath}`, record: placementSuccessor[0],
      sourceApproval: approval } }),
    ...buildTargetFiniteCompiledRecords({ mappedBytes: await readFile(resolve(base, 'live-world-runtime-v17/m2c-finite-only-ordinary-base-approved.json'), 'utf8'),
      manifestBytes: await readFile(resolve(base, 'live-world-runtime-v17/m2c-finite-only-ordinary-base-manifest.json'), 'utf8'), approval })];
}

export function buildSpatialV3TargetItemImport({ preparation,
  baselineAttestation, overlayAttestation }) {
  const baseline = preparation.baseline_request;
  const compatible = preparation.compatibility_manifest;
  const compiled = preparation.compiled;
  const expectedCandidate = finalizeOverlayCandidate({
    compiledSemanticPayload: compiled,
    semanticEquivalenceReportDigest: digestEnvelope(preparation.equivalence_report) });
  const expectedPromotion = buildPromotionManifest({
    compiledSemanticPayload: compiled, candidate: expectedCandidate });
  const expectedApproval = buildOverlayApprovalRequest({ candidate: expectedCandidate,
    promotionManifest: expectedPromotion,
    historicalPr17AttestationDigest: preparation.approval_request.historical_pr17_attestation_digest });
  const expectedBaseline = buildBaselineRegistrationRequest({
    parentRevisionId: baseline.parent_revision_id,
    parentCatalogDigest: baseline.parent_catalog_digest,
    baselineManifest: preparation.baseline_manifest, compatibleWorldTuple: compatible });
  if (digestEnvelope(expectedApproval) !== digestEnvelope(preparation.approval_request)
      || digestEnvelope(expectedPromotion) !== digestEnvelope(preparation.promotion_manifest)
      || digestEnvelope(expectedBaseline) !== digestEnvelope(baseline)
      || compiled.target_revision_id !== preparation.source_request.target_revision_id
      || compiled.record_operations_by_table.some((table) => table.insert_count !== 0
        && table.table_name !== 'procedural_scene_compiled_records')) {
    fail('TARGET_ITEM_PREPARATION_MISMATCH', 'Prepared membership changed after review.');
  }
  verifyDecisionAttestation({ attestation: baselineAttestation,
    expectedSchema: 'rus.baseline_registration_attestation.v2',
    requestDigestField: 'registration_request_digest',
    expectedRequestDigest: baseline.registration_request_digest,
    expectedDecision: 'approve_register_baseline' });
  verifyDecisionAttestation({ attestation: overlayAttestation,
    expectedSchema: 'rus.item_container_overlay_approval_attestation.v2',
    requestDigestField: 'approval_request_digest',
    expectedRequestDigest: preparation.approval_request.approval_request_digest,
    expectedDecision: 'approve_overlay_import',
    expectedBindings: { activation_authorized: false } });
  const importId = `catalog_import_${preparation.approval_request.approval_request_digest.slice(0, 32)}`;
  const assertions = compiled.dependency_assertions.map((assertion) => {
    const row = { ...assertion, import_id: importId,
      overlay_approval_request_digest: preparation.approval_request.approval_request_digest,
      overlay_approval_attestation_digest: overlayAttestation.attestation_digest };
    return { ...row, assertion_audit_digest: computeDependencyAssertionAuditDigest(row) };
  });
  const ledger = buildImportLedger({ importId,
    rootFields: { catalog_scope: CATALOG_SCOPE,
      parent_revision_id: baseline.parent_revision_id,
      parent_catalog_digest: baseline.parent_catalog_digest,
      parent_snapshot_manifest_digest: baseline.parent_snapshot_manifest_digest,
      compatible_world_revision_id: compatible.compatible_world_revision_id,
      compatible_world_catalog_digest: compatible.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest: compatible.compatible_world_pin_manifest_digest,
      target_revision_id: preparation.source_request.target_revision_id,
      target_catalog_digest: compiled.target_catalog_digest,
      record_registry_digest: compiled.record_registry_digest,
      promotion_manifest_digest: preparation.promotion_manifest.promotion_manifest_digest,
      approval_request_digest: preparation.approval_request.approval_request_digest,
      approval_attestation_digest: overlayAttestation.attestation_digest,
      schema_migration_digest: WORLD_RUNTIME_CATALOG_MIGRATION_V3.migration_digest },
    records: compiled.record_operations_by_table.flatMap(({ records }) =>
      records.map((record) => ({ ...record, import_id: importId }))),
    tables: compiled.record_operations_by_table.map((table) => ({
      table_name: table.table_name, dependency_order: table.dependency_order,
      insert_count: table.insert_count, assert_existing_count: table.assert_existing_count,
      record_count: table.record_count, payload_digest: table.records_digest })),
    dependencyAssertions: assertions, importedBy: overlayAttestation.attested_by
  });
  return deepFreeze({ ledger, domain_revision: {
    parent_registration_id: preparation.baseline_registration_id,
    runtime_contract_digest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST,
    title: 'Target-compatible approved item/container catalog' },
  approval_attestation: overlayAttestation });
}

export const FIRST_PLAYABLE_V3_RELEASE = Object.freeze({
  ...FIRST_PLAYABLE_V2_RELEASE,
  releaseId: 'spatial-v3-first-playable-v3',
  worldSchemaFingerprint:
    WORLD_RUNTIME_CATALOG_MIGRATION_V3.target_schema_fingerprint,
  worldSchemaMigration: WORLD_RUNTIME_CATALOG_MIGRATION_V3
});

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
    'Codex task 019f98cf-12d4-7790-8f0a-a336df47508f user authorization',
  release = FIRST_PLAYABLE_V2_RELEASE
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
      + `${release.candidateDirectory}/manifest.json`;
  const worldManifest = await readJson(resolve(root, worldManifestPath));

  assertApprovedSources({
    candidateManifest,
    finalApproval,
    worldManifest,
    release
  });
  await assertExactMigrationTargets({ worldPool, partyPool, release });

  const allRowsByTable = await readRegisteredRows(worldPool);
  const candidateRowsByTable = await readPromotedMembership({
    candidateManifest,
    candidateRoot,
    allRowsByTable
  });
  const historicalApprovalDigest = digestEnvelope(finalApproval);
  const g4Transitions = approvedG4Transitions(g4Approval, historicalApprovalDigest);

  const runtimeConfiguration = {
    schema: 'rus.first_playable_runtime_world_configuration.v1',
    release_id: release.releaseId,
    world_revision_id: release.worldRevision,
    world_catalog_digest: release.worldCatalogDigest,
    world_manifest_sha256: sha256(await readFile(
      resolve(root, worldManifestPath)
    )),
    scenario_binding_id: 'lower_dvina_late_summer_open_water_v1',
    runtime_catalog_contract_digest:
      RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
  };
  const compatibilityManifest = buildBaseWorldCompatibilityManifest({
    compatibleWorldRevisionId: release.worldRevision,
    compatibleWorldCatalogDigest: release.worldCatalogDigest,
    sourceRuntimeConfigurationDigest: digestEnvelope(runtimeConfiguration),
    sourceArtifactPaths: [
      worldManifestPath,
      'apps/game-server/src/composition/production-spatial-v3.js',
      'apps/game-server/src/runtime/releases/'
        + release.bindingsFile
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
      release.worldSchemaFingerprint,
    registry,
    rowsByTable: baselineRows
  });
  const baselineRequest = buildBaselineRegistrationRequest({
    parentRevisionId: release.baselineRevision,
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
    targetRevisionId: release.domainRevision,
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
      target_revision_id: release.domainRevision,
      target_catalog_digest: compiled.target_catalog_digest,
      record_registry_digest: compiled.record_registry_digest,
      promotion_manifest_digest:
        promotionManifest.promotion_manifest_digest,
      approval_request_digest: approvalRequest.approval_request_digest,
      approval_attestation_digest: overlayAttestation.attestation_digest,
      schema_migration_digest: (release.worldSchemaMigration
        ?? WORLD_RUNTIME_CATALOG_MIGRATION).migration_digest
    },
    tables,
    records,
    dependencyAssertions: assertions,
    importedBy: authorizationRef
  });

  const buildReleaseManifest = {
    schema: 'rus.first_playable_build_release_manifest.v1',
    release_id: release.releaseId,
    git_commit_sha: gitCommitSha,
    world_manifest_sha256: runtimeConfiguration.world_manifest_sha256,
    world_catalog_digest: release.worldCatalogDigest,
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
  const activationFields = {
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
      runtime_release_id: runtimeRelease.runtime_release_id
  };
  const latestEvent = await readCurrentActivationEvent(worldPool);
  let expectedPreviousEventId = latestEvent?.event_id ?? null;
  if (latestEvent?.catalog_revision_id === release.domainRevision) {
    const replay = buildActivationArtifacts({ activationFields,
      expectedPreviousEventId: latestEvent.expected_previous_event_id ?? null,
      partyPreflight, authorizationRef, release });
    const predecessor = await readActivationEvent(
      worldPool, latestEvent.expected_previous_event_id);
    const principal = (await worldPool.query(
      'SELECT current_user AS principal')).rows[0].principal;
    const replayEvent = buildActivationEvent({ request: replay.request,
      attestation: replay.attestation, previousEvent: predecessor,
      operatorPrincipal: principal });
    expectedPreviousEventId = selectExactActivationPredecessor({ latestEvent,
      targetRevisionId: release.domainRevision, replayEvent });
  }
  const activation = buildActivationArtifacts({ activationFields,
    expectedPreviousEventId, partyPreflight, authorizationRef, release });
  const activationRequest = activation.request;
  const activationAttestation = activation.attestation;

  return deepFreeze({
    schema: release.bundleSchema,
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
      schema: release.bundleIdentitySchema,
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
  bundle,
  release = FIRST_PLAYABLE_V2_RELEASE,
  activationScope = 'initial_empty_party_database',
  transactional = false
}) {
  if (transactional) {
    const client = await worldPool.connect();
    try {
      await client.query('BEGIN');
      const result = await applyBundle({ worldPool, partyPool, bundle, release,
        activationScope, client });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return applyBundle({ worldPool, partyPool, bundle, release,
    activationScope, client: null });
}

async function applyBundle({ worldPool, partyPool, bundle, release,
  activationScope, client }) {
  const baseline = await registerCatalogBaseline({
    pool: worldPool,
    client,
    request: bundle.baseline_request,
    attestation: bundle.baseline_attestation,
    baselineManifest: bundle.baseline_manifest,
    compatibilityManifest: bundle.compatibility_manifest,
    runtimeConfigurationTuple: bundle.runtime_configuration_tuple,
    registrationId: bundle.baseline_registration_id,
    title: release.baselineTitle
  });
  const imported = await importApprovedCatalog({
    pool: worldPool,
    client,
    ledger: bundle.import_ledger,
    domainRevision: bundle.domain_revision,
    approvalAttestation: bundle.overlay_attestation
  });
  const activated = await activateApprovedCatalog({
    worldPool,
    client,
    partyPool,
    request: bundle.activation_request,
    attestation: bundle.activation_attestation,
    activationScope
  });
  return deepFreeze({
    schema: release.resultSchema,
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

function approvedG4Transitions(approval, historicalApprovalDigest) {
  return approval.profile_mappings.map((mapping) => ({
    graph_node_id: mapping.graph_node_id, asserted_status: 'approved',
    source_transition_semantic_digest: digestEnvelope({
      schema: 'rus.stage3c_g4_transition_semantics.v1',
      graph_node_id: mapping.graph_node_id,
      from_status: mapping.current_status, to_status: mapping.requested_status,
      profile_id: mapping.profile_id,
      causal_basis_type: mapping.causal_basis_type,
      causal_basis_id: mapping.causal_basis_id
    }), historical_approval_basis_digest: historicalApprovalDigest
  }));
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
    if (entry.table_name === 'procedural_scene_compiled_records') {
      result[entry.table_name] = [];
      continue;
    }
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

async function assertExactMigrationTargets({ worldPool, partyPool, release }) {
  const worldMigration = release.worldSchemaMigration
    ?? WORLD_RUNTIME_CATALOG_MIGRATION;
  const [world, party, ledger] = await Promise.all([
    readPostgresSchemaFingerprint(worldPool, 'world_base'),
    readPostgresSchemaFingerprint(partyPool, 'party_runtime'),
    worldPool.query(
      `SELECT migration_id,migration_digest,source_schema_fingerprint,
              target_schema_fingerprint
         FROM world_base.schema_migrations WHERE migration_id=$1`,
      [worldMigration.migration_id]
    )
  ]);
  if (world !== worldMigration.target_schema_fingerprint
      || party !== PARTY_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint
      || ledger.rows.length !== 1
      || !['migration_id', 'migration_digest', 'source_schema_fingerprint',
        'target_schema_fingerprint'].every((field) =>
        ledger.rows[0][field] === worldMigration[field])) {
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
  worldManifest,
  release = FIRST_PLAYABLE_V2_RELEASE
}) {
  if (candidateManifest.candidate_digest !== finalApproval.candidate_digest
      || finalApproval.decision !== 'approve_all_120'
      || worldManifest.world_revision_id !== release.worldRevision
      || worldManifest.catalog_digest !== release.worldCatalogDigest
      || worldManifest.status !== 'approved') {
    fail(
      'FIRST_PLAYABLE_APPROVAL_CHAIN_INVALID',
      'Stage 3C and Spatial-v3 approval evidence must match exact sources.'
    );
  }
}

async function readCurrentActivationEvent(pool) {
  const row = (await pool.query(
    `SELECT event_id,event_sequence,event_type,catalog_scope,
            catalog_revision_id,catalog_digest,import_id,import_audit_digest,
            record_registry_digest,runtime_contract_digest,
            compatible_world_revision_id,compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest,request_digest,
            attestation_digest,expected_previous_event_id,runtime_release_id,
            operator_principal,event_digest
       FROM world_base.runtime_catalog_activation_events
      WHERE catalog_scope=$1
      ORDER BY event_sequence DESC
      LIMIT 1`,
    [CATALOG_SCOPE]
  )).rows[0];
  return row ? { ...row, event_sequence: Number(row.event_sequence) } : null;
}

async function readActivationEvent(pool, eventId) {
  if (eventId == null) return null;
  const row = (await pool.query(
    `SELECT event_id,event_sequence
       FROM world_base.runtime_catalog_activation_events
      WHERE event_id=$1`, [eventId])).rows[0];
  return row ? { ...row, event_sequence: Number(row.event_sequence) } : null;
}

export function selectExactActivationPredecessor({ latestEvent,
  targetRevisionId, replayEvent }) {
  if (latestEvent?.catalog_revision_id === targetRevisionId) {
    if (exactActivationEvent(latestEvent, replayEvent)) {
      return latestEvent.expected_previous_event_id ?? null;
    }
    if (latestEvent.request_digest === replayEvent?.request_digest
        || latestEvent.attestation_digest === replayEvent?.attestation_digest) {
      fail('ACTIVATION_EVENT_COLLISION',
        'Stored activation identity has a different event envelope.');
    }
  }
  return latestEvent?.event_id ?? null;
}

function buildActivationArtifacts({ activationFields, expectedPreviousEventId,
  partyPreflight, authorizationRef, release }) {
  const request = buildActivationRequest({ fields: { ...activationFields,
    expected_previous_event_id: expectedPreviousEventId }, partyPreflight });
  const attestation = sealAttestation({
    schema: 'rus.runtime_catalog_activation_attestation.v2',
    activation_request_digest: request.activation_request_digest,
    catalog_scope: request.catalog_scope,
    target_revision_id: request.target_revision_id,
    target_catalog_digest: request.target_catalog_digest,
    import_id: request.import_id,
    import_audit_digest: request.import_audit_digest,
    runtime_contract_digest: request.runtime_contract_digest,
    runtime_release_id: request.runtime_release_id,
    decision: 'approve_activation',
    attested_by: authorizationRef,
    source_authorization: release.activationBasis
  });
  return { request, attestation };
}

function exactActivationEvent(actual, expected) {
  const expectedRow = activationEventRow(expected);
  return actual != null && Object.entries(expectedRow).every(
    ([field, value]) => actual[field] === value);
}

function activationEventRow(event) {
  return {
    event_id: event.event_id,
    event_sequence: event.event_sequence,
    event_type: event.event_type,
    catalog_scope: event.catalog_scope,
    catalog_revision_id: event.catalog_revision_id,
    catalog_digest: event.catalog_digest,
    import_id: event.import_id,
    import_audit_digest: event.import_audit_digest,
    record_registry_digest: event.record_registry_digest,
    runtime_contract_digest: event.runtime_contract_digest,
    compatible_world_revision_id: event.compatible_world_revision_id,
    compatible_world_catalog_digest: event.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      event.compatible_world_pin_manifest_digest,
    request_digest: event.request_digest,
    attestation_digest: event.attestation_digest,
    expected_previous_event_id: event.expected_previous_event_id,
    runtime_release_id: event.runtime_release_id,
    operator_principal: event.operator_principal,
    event_digest: event.event_digest
  };
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
