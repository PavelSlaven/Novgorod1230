import { createHash } from 'node:crypto';
import {
  canonicalStringify,
  computeCanonicalRecordDigest,
  computeRecordRegistryDigest,
  projectCanonicalRecord
} from '@rus/runtime-catalog/canonical-records';
import {
  computeDependencyAssertionsAuditDigest,
  computeDependencyAssertionsSemanticDigest,
  computeImportAuditDigest,
  computeRecordsDigest,
  computeTablesDigest
} from '@rus/runtime-catalog/ledger-digests';

export class RuntimeCatalogArtifactError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeCatalogArtifactError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function buildOperatorBaselineSnapshotManifest({
  schemaFingerprint,
  registry,
  rowsByTable
}) {
  const includedTables = [];
  const excludedTables = [];
  for (const entry of registry.entries) {
    const rows = rowsByTable?.[entry.table_name];
    if (!Array.isArray(rows)) {
      excludedTables.push({
        table_name: entry.table_name,
        reason_code: 'not_present_in_operator_snapshot'
      });
      continue;
    }
    const records = rows.map((row) => {
      const projection = projectCanonicalRecord({ registryEntry: entry, row });
      return {
        record_key: canonicalStringify(projection.record_key),
        record_digest: computeCanonicalRecordDigest(projection),
        canonical_payload: projection
      };
    }).sort((left, right) => left.record_key.localeCompare(right.record_key));
    includedTables.push({
      table_name: entry.table_name,
      primary_key_fields: [...entry.primary_key_fields],
      record_count: records.length,
      payload_digest: digest(records),
      dependency_order: entry.dependency_order
    });
  }
  includedTables.sort((left, right) =>
    left.dependency_order - right.dependency_order
    || left.table_name.localeCompare(right.table_name));
  const payload = {
    schema: 'rus.operator_baseline_snapshot_manifest.v2',
    schema_fingerprint: requireDigest(schemaFingerprint, 'schemaFingerprint'),
    canonicalization_algorithm: 'canonical-json-sha256',
    canonicalization_version: 2,
    record_registry_digest: computeRecordRegistryDigest(registry),
    included_tables: includedTables,
    excluded_tables: excludedTables,
    records_aggregate_digest: digest(includedTables.map((table) => ({
      table_name: table.table_name,
      record_count: table.record_count,
      payload_digest: table.payload_digest
    })))
  };
  return withDigest(payload, 'parent_snapshot_manifest_digest');
}

export function buildBaselineRegistrationRequest({
  parentRevisionId,
  parentCatalogDigest,
  baselineManifest,
  compatibleWorldTuple
}) {
  const parentDigest = requireDigest(parentCatalogDigest, 'parentCatalogDigest');
  if (parentDigest !== baselineManifest?.records_aggregate_digest) {
    fail(
      'BASELINE_MANIFEST_MISMATCH',
      'Parent catalog digest must equal the baseline records aggregate digest.'
    );
  }
  const payload = {
    schema: 'rus.baseline_registration_request.v2',
    parent_revision_id: requiredText(parentRevisionId, 'parentRevisionId'),
    parent_catalog_digest: parentDigest,
    parent_snapshot_manifest_digest:
      requireDigest(baselineManifest?.parent_snapshot_manifest_digest, 'parentSnapshotManifestDigest'),
    schema_fingerprint:
      requireDigest(baselineManifest?.schema_fingerprint, 'schemaFingerprint'),
    record_registry_digest:
      requireDigest(baselineManifest?.record_registry_digest, 'recordRegistryDigest'),
    compatible_world_revision_id:
      requiredText(compatibleWorldTuple?.compatible_world_revision_id, 'compatibleWorldRevisionId'),
    compatible_world_catalog_digest:
      requireDigest(compatibleWorldTuple?.compatible_world_catalog_digest, 'compatibleWorldCatalogDigest'),
    compatible_world_pin_manifest_digest:
      requireDigest(compatibleWorldTuple?.compatible_world_pin_manifest_digest, 'compatibleWorldPinManifestDigest')
  };
  return withDigest(payload, 'registration_request_digest');
}

export function buildBaselineRegistrationId(request) {
  const identity = {
    schema: 'rus.catalog_baseline_registration_identity.v1',
    registration_request_digest:
      requireDigest(request?.registration_request_digest, 'registrationRequestDigest'),
    parent_revision_id: requiredText(request?.parent_revision_id, 'parentRevisionId')
  };
  return `catalog_baseline_${digest(identity).slice(0, 32)}`;
}

export function buildBaseWorldCompatibilityManifest({
  compatibleWorldRevisionId,
  compatibleWorldCatalogDigest,
  sourceRuntimeConfigurationDigest,
  sourceArtifactPaths,
  sourceCommitSha,
  validationContractVersion
}) {
  if (!Array.isArray(sourceArtifactPaths)
      || sourceArtifactPaths.length === 0
      || sourceArtifactPaths.some((value) => !String(value ?? '').trim())
      || !/^[a-f0-9]{40}$/u.test(String(sourceCommitSha ?? ''))) {
    throw new TypeError('Exact source paths and source commit SHA are required.');
  }
  return withDigest({
    schema: 'rus.base_world_compatibility_manifest.v1',
    compatible_world_revision_id:
      requiredText(compatibleWorldRevisionId, 'compatibleWorldRevisionId'),
    compatible_world_catalog_digest:
      requireDigest(compatibleWorldCatalogDigest, 'compatibleWorldCatalogDigest'),
    source_runtime_configuration_digest:
      requireDigest(sourceRuntimeConfigurationDigest, 'sourceRuntimeConfigurationDigest'),
    source_artifact_paths:
      [...new Set(sourceArtifactPaths.map((value) => String(value).trim()))].sort(),
    source_commit_sha: sourceCommitSha,
    validation_contract_version:
      requiredText(validationContractVersion, 'validationContractVersion')
  }, 'compatible_world_pin_manifest_digest');
}

export function verifyDecisionAttestation({
  attestation,
  expectedSchema,
  requestDigestField,
  expectedRequestDigest,
  expectedDecision,
  expectedBindings = {}
}) {
  if (attestation?.schema !== expectedSchema
      || attestation?.[requestDigestField] !== expectedRequestDigest
      || attestation?.decision !== expectedDecision
      || Object.entries(expectedBindings).some(
        ([field, expected]) => canonicalStringify(attestation?.[field])
          !== canonicalStringify(expected)
      )) {
    fail('ATTESTATION_MISMATCH', 'Attestation is not bound to the exact request and decision.');
  }
  const { attestation_digest: claimedDigest, attested_at: ignoredTimestamp, ...payload } = attestation;
  if (claimedDigest !== digest(payload)) {
    fail('ATTESTATION_MISMATCH', 'Attestation digest is invalid.');
  }
  return deepFreeze(structuredClone(attestation));
}

export function buildImportLedger({
  importId,
  rootFields,
  tables,
  records,
  dependencyAssertions,
  importedBy,
  importedAt = null
}) {
  assertNoReservedFields(rootFields, [
    'schema', 'import_id', 'import_audit_digest', 'imported_by', 'imported_at',
    'tables_digest', 'records_digest', 'dependency_assertions_semantic_digest',
    'dependency_assertions_audit_digest'
  ]);
  const normalizedTables = structuredClone(tables);
  const normalizedRecords = structuredClone(records);
  const normalizedAssertions = structuredClone(dependencyAssertions);
  const root = {
    ...structuredClone(rootFields),
    schema: 'rus.catalog_import_audit.v2',
    import_id: requiredText(importId, 'importId'),
    tables_digest: computeTablesDigest(normalizedTables),
    records_digest: computeRecordsDigest(normalizedRecords),
    dependency_assertions_semantic_digest:
      computeDependencyAssertionsSemanticDigest(normalizedAssertions),
    dependency_assertions_audit_digest:
      computeDependencyAssertionsAuditDigest(normalizedAssertions),
    imported_by: requiredText(importedBy, 'importedBy'),
    imported_at: importedAt
  };
  root.import_audit_digest = computeImportAuditDigest(root);
  return deepFreeze({
    root,
    tables: normalizedTables,
    records: normalizedRecords,
    dependency_assertions: normalizedAssertions
  });
}

export function finalizeOverlayCandidate({
  compiledSemanticPayload,
  semanticEquivalenceReportDigest
}) {
  const payload = {
    schema: 'rus.item_container_overlay_candidate.v3',
    catalog_scope: compiledSemanticPayload.catalog_scope,
    parent_tuple: structuredClone(compiledSemanticPayload.parent_tuple),
    compatible_world_tuple:
      structuredClone(compiledSemanticPayload.compatible_world_tuple),
    record_registry_digest: compiledSemanticPayload.record_registry_digest,
    target_revision_id: compiledSemanticPayload.target_revision_id,
    record_operations_by_table:
      structuredClone(compiledSemanticPayload.record_operations_by_table),
    dependency_assertions:
      structuredClone(compiledSemanticPayload.dependency_assertions),
    semantic_equivalence_report_digest:
      requireDigest(semanticEquivalenceReportDigest, 'semanticEquivalenceReportDigest')
  };
  return withDigest(payload, 'candidate_digest');
}

export function buildPromotionManifest({
  compiledSemanticPayload,
  candidate
}) {
  const payload = {
    schema: 'rus.revision_promotion_manifest.v3',
    catalog_scope: candidate.catalog_scope,
    parent_tuple: structuredClone(candidate.parent_tuple),
    compatible_world_tuple: structuredClone(candidate.compatible_world_tuple),
    record_registry_digest: candidate.record_registry_digest,
    target_revision_id: candidate.target_revision_id,
    target_catalog_digest: compiledSemanticPayload.target_catalog_digest,
    candidate_digest: candidate.candidate_digest,
    tables: compiledSemanticPayload.record_operations_by_table.map((table) => ({
      table_name: table.table_name,
      dependency_order: table.dependency_order,
      insert_count: table.insert_count,
      assert_existing_count: table.assert_existing_count,
      records_digest: table.records_digest
    })),
    dependency_assertions_semantic_digest:
      compiledSemanticPayload.dependency_assertions_semantic_digest
  };
  return withDigest(payload, 'promotion_manifest_digest');
}

export function buildOverlayApprovalRequest({
  candidate,
  promotionManifest,
  historicalPr17AttestationDigest
}) {
  return withDigest({
    schema: 'rus.item_container_overlay_approval_request.v2',
    parent_tuple: structuredClone(candidate.parent_tuple),
    compatible_world_tuple: structuredClone(candidate.compatible_world_tuple),
    record_registry_digest: candidate.record_registry_digest,
    candidate_digest: candidate.candidate_digest,
    promotion_manifest_digest: promotionManifest.promotion_manifest_digest,
    target_catalog_digest: promotionManifest.target_catalog_digest,
    semantic_equivalence_report_digest:
      candidate.semantic_equivalence_report_digest,
    historical_pr17_attestation_digest:
      requireDigest(historicalPr17AttestationDigest, 'historicalPr17AttestationDigest')
  }, 'approval_request_digest');
}

export function buildRuntimeReleaseIdentity({
  gitCommitSha,
  buildReleaseManifestDigest,
  supportedRuntimeContractDigests
}) {
  if (!/^[a-f0-9]{40}$/u.test(String(gitCommitSha ?? ''))
      || !Array.isArray(supportedRuntimeContractDigests)
      || supportedRuntimeContractDigests.length === 0) {
    throw new TypeError('Exact git commit and supported runtime contracts are required.');
  }
  const payload = {
    schema: 'rus.runtime_release.v2',
    git_commit_sha: gitCommitSha,
    build_release_manifest_digest:
      requireDigest(buildReleaseManifestDigest, 'buildReleaseManifestDigest'),
    supported_runtime_contract_digests:
      [...supportedRuntimeContractDigests].map((value) =>
        requireDigest(value, 'supportedRuntimeContractDigests')).sort()
  };
  return deepFreeze({ ...payload, runtime_release_id: digest(payload) });
}

export function buildPartyPreflight({
  partyCount,
  pinnedPartyCount,
  missingDomainPinCount,
  inflightStage24Stage25Count,
  runtimeReleaseId,
  runtimeContractDigest,
  checkedAt = null
}) {
  const payload = {
    schema: 'rus.runtime_catalog_party_preflight.v2',
    catalog_scope: 'item_container_materialization_v2',
    party_count: nonnegative(partyCount, 'partyCount'),
    pinned_party_count: nonnegative(pinnedPartyCount, 'pinnedPartyCount'),
    missing_domain_pin_count: nonnegative(missingDomainPinCount, 'missingDomainPinCount'),
    inflight_stage24_stage25_count:
      nonnegative(inflightStage24Stage25Count, 'inflightStage24Stage25Count'),
    runtime_release_id: requireDigest(runtimeReleaseId, 'runtimeReleaseId'),
    runtime_contract_digest: requireDigest(runtimeContractDigest, 'runtimeContractDigest'),
    checked_at: checkedAt
  };
  if (payload.party_count !== 0
      || payload.missing_domain_pin_count !== 0
      || payload.inflight_stage24_stage25_count !== 0) {
    fail('ACTIVATION_PARTY_PREFLIGHT_BLOCKED', 'Initial activation requires an empty party database.', payload);
  }
  const { checked_at: ignored, ...semantic } = payload;
  return deepFreeze({ ...payload, party_preflight_digest: digest(semantic) });
}

export function buildActivationRequest({ fields, partyPreflight }) {
  if (fields.runtime_release_id !== partyPreflight.runtime_release_id
      || fields.runtime_contract_digest !== partyPreflight.runtime_contract_digest) {
    fail('ACTIVATION_PARTY_PREFLIGHT_STALE', 'Activation request does not match party preflight runtime identity.');
  }
  assertNoReservedFields(fields, [
    'schema', 'catalog_scope', 'party_preflight_digest', 'party_count',
    'pinned_party_count', 'missing_domain_pin_count',
    'inflight_stage24_stage25_count', 'activation_request_digest'
  ]);
  return withDigest({
    schema: 'rus.runtime_catalog_activation_request.v2',
    catalog_scope: 'item_container_materialization_v2',
    parent_revision_id: requiredText(fields.parent_revision_id, 'parentRevisionId'),
    parent_catalog_digest:
      requireDigest(fields.parent_catalog_digest, 'parentCatalogDigest'),
    parent_snapshot_manifest_digest:
      requireDigest(fields.parent_snapshot_manifest_digest, 'parentSnapshotManifestDigest'),
    compatible_world_revision_id:
      requiredText(fields.compatible_world_revision_id, 'compatibleWorldRevisionId'),
    compatible_world_catalog_digest:
      requireDigest(fields.compatible_world_catalog_digest, 'compatibleWorldCatalogDigest'),
    compatible_world_pin_manifest_digest:
      requireDigest(fields.compatible_world_pin_manifest_digest, 'compatibleWorldPinManifestDigest'),
    target_revision_id: requiredText(fields.target_revision_id, 'targetRevisionId'),
    target_catalog_digest:
      requireDigest(fields.target_catalog_digest, 'targetCatalogDigest'),
    record_registry_digest:
      requireDigest(fields.record_registry_digest, 'recordRegistryDigest'),
    runtime_contract_digest:
      requireDigest(fields.runtime_contract_digest, 'runtimeContractDigest'),
    import_id: requiredText(fields.import_id, 'importId'),
    import_audit_digest:
      requireDigest(fields.import_audit_digest, 'importAuditDigest'),
    promotion_manifest_digest:
      requireDigest(fields.promotion_manifest_digest, 'promotionManifestDigest'),
    approval_request_digest:
      requireDigest(fields.approval_request_digest, 'approvalRequestDigest'),
    approval_attestation_digest:
      requireDigest(fields.approval_attestation_digest, 'approvalAttestationDigest'),
    expected_previous_event_id: fields.expected_previous_event_id == null
      ? null
      : requiredText(fields.expected_previous_event_id, 'expectedPreviousEventId'),
    runtime_release_id:
      requireDigest(fields.runtime_release_id, 'runtimeReleaseId'),
    party_preflight_digest: partyPreflight.party_preflight_digest,
    party_count: partyPreflight.party_count,
    pinned_party_count: partyPreflight.pinned_party_count,
    missing_domain_pin_count: partyPreflight.missing_domain_pin_count,
    inflight_stage24_stage25_count: partyPreflight.inflight_stage24_stage25_count
  }, 'activation_request_digest');
}

export function buildActivationEvent({
  request,
  attestation,
  previousEvent,
  operatorPrincipal
}) {
  verifyDecisionAttestation({
    attestation,
    expectedSchema: 'rus.runtime_catalog_activation_attestation.v2',
    requestDigestField: 'activation_request_digest',
    expectedRequestDigest: request.activation_request_digest,
    expectedDecision: 'approve_activation',
    expectedBindings: {
      catalog_scope: request.catalog_scope,
      target_revision_id: request.target_revision_id,
      target_catalog_digest: request.target_catalog_digest,
      import_id: request.import_id,
      import_audit_digest: request.import_audit_digest,
      runtime_contract_digest: request.runtime_contract_digest,
      runtime_release_id: request.runtime_release_id
    }
  });
  const expectedPrevious = previousEvent?.event_id ?? null;
  if ((request.expected_previous_event_id ?? null) !== expectedPrevious) {
    fail('ACTIVATION_PREVIOUS_EVENT_STALE', 'Activation compare-and-swap predecessor is stale.');
  }
  const eventEnvelope = {
    schema: 'rus.runtime_catalog_activation_event.v2',
    event_sequence: Number(previousEvent?.event_sequence ?? 0) + 1,
    event_type: 'activate',
    catalog_scope: request.catalog_scope,
    catalog_revision_id: request.target_revision_id,
    catalog_digest: request.target_catalog_digest,
    import_id: request.import_id,
    import_audit_digest: request.import_audit_digest,
    record_registry_digest: request.record_registry_digest,
    runtime_contract_digest: request.runtime_contract_digest,
    compatible_world_revision_id: request.compatible_world_revision_id,
    compatible_world_catalog_digest: request.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest: request.compatible_world_pin_manifest_digest,
    request_digest: request.activation_request_digest,
    attestation_digest: attestation.attestation_digest,
    expected_previous_event_id: expectedPrevious,
    runtime_release_id: request.runtime_release_id,
    operator_principal: requiredText(operatorPrincipal, 'operatorPrincipal')
  };
  const eventDigest = digest(eventEnvelope);
  return deepFreeze({
    ...eventEnvelope,
    event_id: `runtime_catalog_activation_${eventDigest.slice(0, 32)}`,
    event_digest: eventDigest
  });
}

export function digestEnvelope(payload) {
  return digest(payload);
}

function withDigest(payload, field) {
  return deepFreeze({ ...payload, [field]: digest(payload) });
}

function digest(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

function requireDigest(value, field) {
  if (!/^[a-f0-9]{64}$/u.test(String(value ?? ''))) {
    throw new TypeError(`${field} must be a SHA-256 digest.`);
  }
  return value;
}

function requiredText(value, field) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${field} is required.`);
  return normalized;
}

function nonnegative(value, field) {
  if (!Number.isInteger(value) || value < 0) throw new TypeError(`${field} must be nonnegative.`);
  return value;
}

function assertNoReservedFields(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Artifact fields must be an object.');
  }
  const reserved = fields.find((field) => Object.hasOwn(value, field));
  if (reserved) {
    fail('ARTIFACT_RESERVED_FIELD_OVERRIDE', `Artifact input cannot override ${reserved}.`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code, message, details) {
  throw new RuntimeCatalogArtifactError(code, message, details);
}
