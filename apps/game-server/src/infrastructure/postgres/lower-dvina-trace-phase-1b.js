import { createHash } from 'node:crypto';
import {
  createLowerDvinaTracePhase1ARepository
} from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import {
  createLowerDvinaTracePhase1APostcommitProjector,
  materializeLowerDvinaTraceParty
} from '../../internal/lower-dvina-trace-phase-1a.js';
import {
  createPostgresStage25Ports
} from './stage25.js';
import {
  loadPhase1ASchemaMetadata,
  mandatorySchemaContracts,
  PHASE_1A_TABLES
} from './lower-dvina-trace-phase-1b-schema-metadata.js';
import {
  assertLowerDvinaTraceExecutionSupport
} from './lower-dvina-trace-execution-support.js';

export function createLowerDvinaTracePhase1BProductionAdapter({
  partyPool,
  worldPool,
  release,
  runtimeCatalogPin,
  rootDir = process.cwd()
} = {}) {
  requirePool(partyPool, 'partyPool');
  requirePool(worldPool, 'worldPool');
  assertProductionPin(release, runtimeCatalogPin);
  const repository = createLowerDvinaTracePhase1ARepository({
    query: partyPool.query.bind(partyPool)
  });
  const stage25Ports = createPostgresStage25Ports({
    pool: partyPool,
    postcommitProjector:
      createLowerDvinaTracePhase1APostcommitProjector({ repository })
  });
  return Object.freeze({
    assertExecutionSupport(executionIdentity) {
      assertLowerDvinaTraceExecutionSupport(executionIdentity);
    },
    async materialize(request) {
      assertLowerDvinaTraceExecutionSupport(request);
      assertRequestWorldBinding(request, release, runtimeCatalogPin);
      const [partyDatabaseSchema, worldBaseReferenceSnapshot] =
        await Promise.all([
          readPartyDatabaseSchemaSnapshot(partyPool),
          readWorldBaseReferenceSnapshot(
            worldPool,
            request.world_compatibility
          )
        ]);
      return materializeLowerDvinaTraceParty({
        request,
        domainCatalogPinLoader: async (identity) => {
          if (identity?.catalog_scope !== runtimeCatalogPin.catalog_scope
            || identity.world_revision_id
              !== runtimeCatalogPin.compatible_world_revision_id
            || identity.world_catalog_digest
              !== runtimeCatalogPin.compatible_world_catalog_digest) {
            fail(
              'TRACE_PHASE_1B_RUNTIME_CATALOG_PIN_MISMATCH',
              'Active runtime catalog pin is incompatible with the trace party world tuple.'
            );
          }
          return runtimeCatalogPin;
        },
        partyDatabaseSchema,
        worldBaseReferenceSnapshot,
        repository,
        stage25Ports,
        rootDir
      });
    },
    loadInternal: (partyId) => repository.loadInternal(partyId),
    loadVisible: (partyId) => repository.loadVisible(partyId)
  });
}

export async function readPartyDatabaseSchemaSnapshot(partyPool) {
  requirePool(partyPool, 'partyPool');
  const metadata = await loadPhase1ASchemaMetadata(partyPool);
  const tables = PHASE_1A_TABLES.map((name) => ({
    name,
    allowed_operations: ['insert_only'],
    columns: metadata.columns
      .filter((row) => row.table_name === name)
      .map((row) => ({
        name: row.column_name,
        data_type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default
      }))
  }));
  const foreignKeys = metadata.foreignKeys.flatMap((row) =>
    row.columns.map((column, index) => ({
      name: row.name,
      table: row.table_name,
      from_table: row.table_name,
      from_column: column,
      columns: row.columns,
      referenced_table: row.referenced_table_name,
      to_table: row.referenced_table_name,
      to_column: row.referenced_columns[index],
      referenced_columns: row.referenced_columns,
      column_ordinal: index,
      on_delete_code: row.on_delete_code,
      on_update_code: row.on_update_code
    })));
  const uniqueConstraints = metadata.uniqueConstraints.map((row) => ({
    name: row.name,
    table: row.table_name,
    columns: row.columns,
    constraint_type: row.constraint_type === 'p'
      ? 'primary_key'
      : 'unique'
  }));
  const checkConstraints = metadata.checkConstraints.map((row) => ({
    name: row.name,
    table: row.table_name,
    columns: row.columns,
    definition: row.definition,
    ...(row.name === 'parties_schema_version_check'
      ? { column: 'schema_version', allowed_values: [2, 3] }
      : {})
  }));
  const enumDefinitions = metadata.enumDefinitions.map((row) => ({
    enum_name: row.enum_name,
    values: row.values
  }));
  const indexes = metadata.indexes.map((row) => ({
    name: row.name,
    table: row.table_name,
    definition: row.definition
  }));
  const mandatoryContracts = mandatorySchemaContracts({
    foreignKeys,
    uniqueConstraints,
    checkConstraints,
    indexes
  });
  const missingContracts = Object.entries(mandatoryContracts)
    .filter(([, present]) => !present)
    .map(([name]) => name);
  if (tables.some((table) => table.columns.length === 0)
    || missingContracts.length > 0) {
    fail(
      'TRACE_PHASE_1B_PARTY_SCHEMA_INCOMPLETE',
      `The complete Phase 1A party schema must be installed before public start: ${missingContracts.join(',')}.`
    );
  }
  const snapshot = {
    version: 1,
    schema: 'party_database_schema_snapshot',
    schema_version: 'party_runtime_v2',
    tables,
    columns: [],
    foreign_keys: foreignKeys,
    unique_constraints: uniqueConstraints,
    check_constraints: checkConstraints,
    enum_definitions: enumDefinitions,
    indexes,
    allowed_operations: ['insert_only']
  };
  return Object.freeze({
    ...snapshot,
    readonly_checksum: digest(snapshot)
  });
}

export async function readWorldBaseReferenceSnapshot(
  worldPool,
  compatibility
) {
  requirePool(worldPool, 'worldPool');
  const ids = [
    compatibility?.source_world_revision_id,
    ...(compatibility?.lineage ?? []).map((entry) =>
      entry.world_revision_id)
  ];
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    fail(
      'TRACE_PHASE_1B_WORLD_LINEAGE_INVALID',
      'Exact source-to-production world revision lineage is required.'
    );
  }
  const { rows } = await worldPool.query(
    `SELECT id,parent_revision_id,catalog_digest,status
       FROM world_base.spatial_v3_world_revisions
      WHERE id=ANY($1::text[])
      ORDER BY id`,
    [ids]
  );
  if (rows.length !== ids.length) {
    fail(
      'TRACE_PHASE_1B_WORLD_LINEAGE_MISSING',
      'Pinned scenario world lineage is absent from world-base.'
    );
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const source = byId.get(compatibility.source_world_revision_id);
  if (source?.catalog_digest
      !== compatibility.source_world_catalog_digest
    || compatibility.source_status !== 'approved'
    || source.status !== compatibility.source_status) {
    fail(
      'TRACE_PHASE_1B_WORLD_LINEAGE_MISMATCH',
      'Scenario source world revision is not the pinned approved revision.'
    );
  }
  let parent = source.id;
  for (const ref of compatibility.lineage) {
    const row = byId.get(ref.world_revision_id);
    if (row?.parent_revision_id !== parent
      || row.catalog_digest !== ref.world_catalog_digest
      || ref.status !== 'approved'
      || row.status !== ref.status) {
      fail(
        'TRACE_PHASE_1B_WORLD_LINEAGE_MISMATCH',
        'Production world revision is not an approved descendant of the scenario source.'
      );
    }
    parent = row.id;
  }
  if (parent !== compatibility.production_world_revision_id) {
    fail(
      'TRACE_PHASE_1B_WORLD_LINEAGE_MISMATCH',
      'World lineage does not terminate at the public production revision.'
    );
  }
  if (compatibility.production_status !== 'approved'
    || byId.get(parent)?.status !== compatibility.production_status) {
    fail(
      'TRACE_PHASE_1B_WORLD_LINEAGE_MISMATCH',
      'Production world revision does not have the pinned approved status.'
    );
  }
  return Object.freeze({
    version: 1,
    schema: 'world_base_reference_snapshot',
    readonly_checksum: digest(rows),
    allowed_region_ids: [],
    allowed_graph_node_ids: [],
    allowed_graph_edge_ids: [],
    allowed_place_template_ids: [],
    allowed_npc_candidate_ids: [],
    allowed_item_profile_ids: [],
    allowed_container_profile_ids: [],
    allowed_property_rule_ids: [],
    allowed_source_ids: []
  });
}

function assertProductionPin(release, pin) {
  if (!release?.world_revision_id
    || pin?.schema !== 'rus.runtime_catalog_pin.v2'
    || pin.catalog_scope !== 'item_container_materialization_v2'
    || pin.compatible_world_revision_id !== release.world_revision_id
    || pin.compatible_world_catalog_digest !== release.world_catalog_digest
    || pin.compatible_world_pin_manifest_digest
      !== release.compatible_world_pin_manifest_digest) {
    fail(
      'TRACE_PHASE_1B_RUNTIME_CATALOG_PIN_MISMATCH',
      'Exact active production runtime catalog pin is required.'
    );
  }
}

function assertRequestWorldBinding(request, release, pin) {
  if (request?.world_revision_id !== release.world_revision_id
    || request.world_catalog_digest !== release.world_catalog_digest
    || request.world_revision_id !== pin.compatible_world_revision_id
    || request.world_catalog_digest !== pin.compatible_world_catalog_digest
    || request.world_compatibility?.production_world_revision_id
      !== release.world_revision_id
    || request.world_compatibility?.production_world_catalog_digest
      !== release.world_catalog_digest) {
    fail(
      'TRACE_PHASE_1B_WORLD_TUPLE_MISMATCH',
      'Trace request, publication lineage and active production tuple differ.'
    );
  }
}

function requirePool(pool, name) {
  if (!pool?.query) throw new TypeError(`${name} is required.`);
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code, status: 409 });
}
