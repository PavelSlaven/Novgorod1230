import { createHash } from 'node:crypto';
import {
  canonicalStringify,
  computeCanonicalRecordDigest,
  computeRecordRegistryDigest,
  projectCanonicalRecord
} from '@rus/runtime-catalog/canonical-records';
import {
  computeDependencyAssertionsSemanticDigest,
  computeTablePayloadDigest,
  computeTargetCatalogDigest
} from '@rus/runtime-catalog/ledger-digests';

const CATALOG_SCOPE = 'item_container_materialization_v2';

export class RuntimeCatalogToolingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeCatalogToolingError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

export function compileOverlaySemanticPayload({
  registry,
  parentTuple,
  compatibleWorldTuple,
  targetRevisionId,
  parentRowsByTable,
  candidateRowsByTable,
  dependencyLinks,
  g4Transitions
}) {
  assertRegistry(registry);
  if (candidateRowsByTable?.graph_nodes?.length > 0) {
    fail(
      'OVERLAY_GRAPH_NODE_WRITE_FORBIDDEN',
      'graph_nodes transitions must be scoped dependency assertions.'
    );
  }

  const entryByTable = new Map(
    registry.entries.map((entry) => [entry.table_name, entry])
  );
  for (const tableName of Object.keys(candidateRowsByTable ?? {})) {
    if (!entryByTable.has(tableName)) {
      fail('OVERLAY_TABLE_NOT_REGISTERED', 'Candidate contains an unknown table.', {
        table_name: tableName
      });
    }
  }

  const recordOperationsByTable = registry.entries
    .filter(({ operation_domain: operationDomain, table_name: tableName }) =>
      operationDomain === 'catalog_membership'
      && Array.isArray(candidateRowsByTable?.[tableName])
      && candidateRowsByTable[tableName].length > 0)
    .sort((left, right) =>
      left.dependency_order - right.dependency_order
      || left.table_name.localeCompare(right.table_name))
    .map((entry) => compileTableOperations({
      entry,
      parentRows: parentRowsByTable?.[entry.table_name] ?? [],
      candidateRows: candidateRowsByTable[entry.table_name]
    }));

  assertDependencyClosure(recordOperationsByTable, dependencyLinks ?? []);
  const dependencyAssertions = compileDependencyAssertions({
    graphEntry: entryByTable.get('graph_nodes'),
    parentGraphRows: parentRowsByTable?.graph_nodes ?? [],
    g4Transitions
  });
  const dependencyAssertionsSemanticDigest =
    computeDependencyAssertionsSemanticDigest(dependencyAssertions);
  const recordRegistryDigest = computeRecordRegistryDigest(registry);
  const tables = recordOperationsByTable.map((table) => ({
    table_name: table.table_name,
    dependency_order: table.dependency_order,
    insert_count: table.insert_count,
    assert_existing_count: table.assert_existing_count,
    record_count: table.record_count,
    records_digest: table.records_digest
  }));
  const targetCatalogPayload = {
    schema: 'rus.domain_catalog_payload.v2',
    catalog_scope: CATALOG_SCOPE,
    target_revision_id: targetRevisionId,
    compatible_world_tuple: structuredClone(compatibleWorldTuple),
    record_registry_digest: recordRegistryDigest,
    tables,
    dependency_assertions_semantic_digest: dependencyAssertionsSemanticDigest
  };
  const targetCatalogDigest = computeTargetCatalogDigest(targetCatalogPayload);
  const semanticPayload = {
    schema: 'rus.item_container_overlay_candidate_semantic_payload.v1',
    catalog_scope: CATALOG_SCOPE,
    parent_tuple: structuredClone(parentTuple),
    compatible_world_tuple: structuredClone(compatibleWorldTuple),
    record_registry_digest: recordRegistryDigest,
    target_revision_id: targetRevisionId,
    record_operations_by_table: recordOperationsByTable,
    dependency_assertions: dependencyAssertions
  };

  return deepFreeze({
    ...semanticPayload,
    semantic_payload_digest: sha256(canonicalStringify(semanticPayload)),
    target_catalog_digest: targetCatalogDigest,
    target_catalog_payload: targetCatalogPayload,
    dependency_assertions_semantic_digest: dependencyAssertionsSemanticDigest
  });
}

function compileTableOperations({ entry, parentRows, candidateRows }) {
  const parentByKey = indexRows(entry, parentRows, 'parent');
  const candidateByKey = indexRows(entry, candidateRows, 'candidate');
  const records = [...candidateByKey.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([recordKey, candidate], ordinal) => {
      const parent = parentByKey.get(recordKey);
      const operationKind = parent
        ? parent.digest === candidate.digest
          ? 'assert_existing'
          : 'conflict'
        : 'insert';
      if (operationKind === 'conflict') {
        fail(
          'OVERLAY_RECORD_CONFLICT',
          'An existing canonical key has different semantic content.',
          {
            table_name: entry.table_name,
            record_key: recordKey,
            parent_record_digest: parent.digest,
            candidate_record_digest: candidate.digest
          }
        );
      }
      return {
        table_name: entry.table_name,
        record_key: recordKey,
        operation_kind: operationKind,
        canonical_payload: candidate.projection,
        record_digest: candidate.digest,
        ordinal
      };
    });
  return {
    table_name: entry.table_name,
    dependency_order: entry.dependency_order,
    insert_count: records.filter(({ operation_kind: kind }) => kind === 'insert').length,
    assert_existing_count: records.filter(
      ({ operation_kind: kind }) => kind === 'assert_existing'
    ).length,
    record_count: records.length,
    records_digest: computeTablePayloadDigest(records),
    records
  };
}

function indexRows(entry, rows, source) {
  if (!Array.isArray(rows)) {
    fail('OVERLAY_RECORD_SET_INVALID', 'Record set must be an array.', {
      table_name: entry.table_name,
      source
    });
  }
  const result = new Map();
  for (const row of rows) {
    const projection = projectCanonicalRecord({ registryEntry: entry, row });
    const key = canonicalStringify(projection.record_key);
    if (result.has(key)) {
      fail('OVERLAY_RECORD_KEY_DUPLICATE', 'Record key is duplicated.', {
        table_name: entry.table_name,
        record_key: key,
        source
      });
    }
    result.set(key, {
      projection,
      digest: computeCanonicalRecordDigest(projection)
    });
  }
  return result;
}

function assertDependencyClosure(tables, links) {
  const recordsByTable = new Map(
    tables.map((table) => [table.table_name, table.records])
  );
  for (const link of links) {
    const sourceRecords = recordsByTable.get(link.source_table) ?? [];
    const targetRecords = recordsByTable.get(link.target_table) ?? [];
    for (const source of sourceRecords) {
      const value = source.canonical_payload.canonical_fields[link.source_column];
      if (value == null) continue;
      const found = targetRecords.some((target) =>
        target.canonical_payload.canonical_fields[link.target_column] === value);
      if (!found) {
        fail(
          'OVERLAY_DEPENDENCY_OUTSIDE_MEMBERSHIP',
          'A transitive dependency is absent from exact membership.',
          {
            source_table: link.source_table,
            source_record_key: source.record_key,
            source_column: link.source_column,
            target_table: link.target_table,
            target_column: link.target_column,
            target_value: value
          }
        );
      }
    }
  }
}

function compileDependencyAssertions({
  graphEntry,
  parentGraphRows,
  g4Transitions
}) {
  if (!graphEntry || graphEntry.operation_domain !== 'dependency_assertion'
    || !Array.isArray(g4Transitions) || g4Transitions.length !== 9) {
    fail(
      'OVERLAY_G4_ASSERTION_SET_INVALID',
      'The overlay requires exactly nine registered G4 transitions.'
    );
  }
  const parentByKey = indexRows(graphEntry, parentGraphRows, 'parent_graph');
  const seen = new Set();
  return [...g4Transitions]
    .sort((left, right) =>
      left.graph_node_id.localeCompare(right.graph_node_id))
    .map((transition, ordinal) => {
      if (seen.has(transition.graph_node_id)
        || transition.asserted_status !== 'approved') {
        fail(
          'OVERLAY_G4_ASSERTION_SET_INVALID',
          'G4 transitions must be unique approved assertions.'
        );
      }
      seen.add(transition.graph_node_id);
      const recordKey = canonicalStringify({ id: transition.graph_node_id });
      const parent = parentByKey.get(recordKey);
      if (!parent) {
        fail(
          'OVERLAY_G4_BASE_ROW_MISSING',
          'A scoped assertion has no exact parent graph row.',
          { record_key: recordKey }
        );
      }
      const semanticCore = {
        catalog_scope: CATALOG_SCOPE,
        target_table: 'graph_nodes',
        record_key: recordKey,
        expected_base_canonical_payload: parent.projection,
        expected_base_record_digest: parent.digest,
        asserted_status: transition.asserted_status,
        source_transition_semantic_digest:
          transition.source_transition_semantic_digest,
        historical_approval_basis_digest:
          transition.historical_approval_basis_digest
      };
      return {
        ...semanticCore,
        semantic_assertion_digest: sha256(canonicalStringify(semanticCore)),
        ordinal
      };
    });
}

function assertRegistry(registry) {
  if (registry?.schema !== 'rus.catalog_record_registry.v1'
    || registry.catalog_scope !== CATALOG_SCOPE
    || !Array.isArray(registry.entries)
    || registry.entries.length === 0) {
    fail('OVERLAY_RECORD_REGISTRY_INVALID', 'Record registry is invalid.');
  }
  computeRecordRegistryDigest(registry);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(code, message, details) {
  throw new RuntimeCatalogToolingError(code, message, details);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
