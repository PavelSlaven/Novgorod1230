import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-records.js';

export function computeTablePayloadDigest(records) {
  const ordered = sortRecords(records);
  assertContiguousOrdinals(ordered, ordered[0]?.table_name ?? null);
  return digest(ordered.map((record) => membershipEntry(record, false)));
}

export function computeTablesDigest(tables) {
  return digest([...tables]
    .sort((left, right) =>
      left.dependency_order - right.dependency_order
      || left.table_name.localeCompare(right.table_name))
    .map((table) => ({
      table_name: table.table_name,
      dependency_order: table.dependency_order,
      insert_count: table.insert_count,
      assert_existing_count: table.assert_existing_count,
      record_count: table.record_count,
      payload_digest: table.payload_digest ?? table.records_digest
    })));
}

export function computeRecordsDigest(records) {
  return digest(sortRecords(records).map((record) => ({
    ...membershipEntry(record, true),
    canonical_payload: record.canonical_payload
  })));
}

export function computeDependencyAssertionsSemanticDigest(assertions) {
  return digest(sortAssertions(assertions).map((assertion) => ({
    catalog_scope: assertion.catalog_scope,
    target_table: assertion.target_table,
    record_key: assertion.record_key,
    expected_base_record_digest: assertion.expected_base_record_digest,
    asserted_status: assertion.asserted_status,
    source_transition_semantic_digest:
      assertion.source_transition_semantic_digest,
    historical_approval_basis_digest:
      assertion.historical_approval_basis_digest,
    semantic_assertion_digest: assertion.semantic_assertion_digest,
    ordinal: assertion.ordinal
  })));
}

export function computeDependencyAssertionSemanticDigest(assertion) {
  return digest({
    catalog_scope: assertion.catalog_scope,
    target_table: assertion.target_table,
    record_key: assertion.record_key,
    expected_base_canonical_payload: assertion.expected_base_canonical_payload,
    expected_base_record_digest: assertion.expected_base_record_digest,
    asserted_status: assertion.asserted_status,
    source_transition_semantic_digest:
      assertion.source_transition_semantic_digest,
    historical_approval_basis_digest:
      assertion.historical_approval_basis_digest
  });
}

export function computeDependencyAssertionsAuditDigest(assertions) {
  return digest(sortAssertions(assertions).map((assertion) => ({
    catalog_scope: assertion.catalog_scope,
    target_table: assertion.target_table,
    record_key: assertion.record_key,
    semantic_assertion_digest: assertion.semantic_assertion_digest,
    overlay_approval_request_digest:
      assertion.overlay_approval_request_digest,
    overlay_approval_attestation_digest:
      assertion.overlay_approval_attestation_digest,
    ordinal: assertion.ordinal
  })));
}

export function computeDependencyAssertionAuditDigest(assertion) {
  return digest({
    semantic_assertion_digest: assertion.semantic_assertion_digest,
    overlay_approval_request_digest:
      assertion.overlay_approval_request_digest,
    overlay_approval_attestation_digest:
      assertion.overlay_approval_attestation_digest
  });
}

export function computeTargetCatalogDigest(payload) {
  if (payload?.schema !== 'rus.domain_catalog_payload.v2') {
    throw new TypeError('Invalid domain catalog payload.');
  }
  return digest(payload);
}

export function computeImportAuditDigest(root) {
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new TypeError('Invalid catalog import audit root.');
  }
  const {
    schema: ignoredSchema,
    import_audit_digest: ignoredDigest,
    imported_at: ignoredTimestamp,
    ...audited
  } = root;
  return digest({
    schema: 'rus.catalog_import_audit.v2',
    ...audited
  });
}

function membershipEntry(record, includeTable) {
  if (!['insert', 'assert_existing'].includes(record.operation_kind)) {
    throw new TypeError('Unknown catalog membership operation.');
  }
  return {
    ...(includeTable ? { table_name: record.table_name } : {}),
    operation_kind: record.operation_kind,
    record_key: record.record_key,
    record_digest: record.record_digest,
    ordinal: record.ordinal
  };
}

function sortRecords(records) {
  if (!Array.isArray(records)) throw new TypeError('Catalog records must be an array.');
  return [...records].sort((left, right) =>
    left.table_name.localeCompare(right.table_name)
    || left.ordinal - right.ordinal
    || left.record_key.localeCompare(right.record_key));
}

function sortAssertions(assertions) {
  if (!Array.isArray(assertions)) {
    throw new TypeError('Dependency assertions must be an array.');
  }
  const ordered = [...assertions].sort((left, right) =>
    left.ordinal - right.ordinal || left.record_key.localeCompare(right.record_key));
  assertContiguousOrdinals(ordered, 'dependency_assertions');
  return ordered;
}

function assertContiguousOrdinals(records, subject) {
  for (let index = 0; index < records.length; index += 1) {
    if (records[index].ordinal !== index) {
      throw new TypeError(`${subject ?? 'records'} ordinals must be zero-based and contiguous.`);
    }
  }
}

function digest(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}
