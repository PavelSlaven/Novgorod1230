import {
  RUNTIME_CATALOG_ACTIVATION_LOCK_KEY
} from '@rus/runtime-catalog/runtime-contract';
import { serverError } from '../../errors.js';

const PIN_FIELDS = Object.freeze([
  'catalog_scope',
  'catalog_revision_id',
  'catalog_digest',
  'import_id',
  'import_audit_digest',
  'record_registry_digest',
  'runtime_contract_digest',
  'compatible_world_revision_id',
  'compatible_world_catalog_digest',
  'compatible_world_pin_manifest_digest'
]);

export async function withRuntimeCatalogActivationLock(
  worldPool,
  callback
) {
  const client = await worldPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock($1::bigint)',
      [RUNTIME_CATALOG_ACTIVATION_LOCK_KEY]
    );
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function assertWorldReleaseReadiness(
  worldPool,
  runtimeCatalogPin,
  release,
  historicalPins = []
) {
  const revision = await worldPool.query(
    `SELECT id,catalog_digest,status
     FROM world_base.spatial_v3_world_revisions
     WHERE id=$1 AND catalog_digest=$2 AND status='approved'`,
    [release.world_revision_id, release.world_catalog_digest]
  );
  const activation = await worldPool.query(
    `SELECT
       e.event_id,e.catalog_scope,e.catalog_revision_id,e.catalog_digest,
       e.import_id,e.import_audit_digest,e.record_registry_digest,
       e.runtime_contract_digest,e.compatible_world_revision_id,
       e.compatible_world_catalog_digest,
       e.compatible_world_pin_manifest_digest
     FROM world_base.runtime_catalog_activation_events e
     JOIN world_base.domain_catalog_revisions r
       ON r.catalog_revision_id=e.catalog_revision_id
      AND r.catalog_scope=e.catalog_scope
      AND r.status='approved'
      AND r.target_catalog_digest=e.catalog_digest
      AND r.compatible_world_revision_id=e.compatible_world_revision_id
      AND r.compatible_world_catalog_digest=e.compatible_world_catalog_digest
      AND r.compatible_world_pin_manifest_digest=
        e.compatible_world_pin_manifest_digest
      AND r.record_registry_digest=e.record_registry_digest
      AND r.runtime_contract_digest=e.runtime_contract_digest
     JOIN world_base.catalog_imports i
       ON i.import_id=e.import_id
      AND i.approval_status='approved'
      AND i.catalog_scope=e.catalog_scope
      AND i.target_revision_id=e.catalog_revision_id
      AND i.import_audit_digest=e.import_audit_digest
      AND i.target_catalog_digest=e.catalog_digest
      AND i.compatible_world_revision_id=e.compatible_world_revision_id
      AND i.compatible_world_catalog_digest=e.compatible_world_catalog_digest
      AND i.compatible_world_pin_manifest_digest=
        e.compatible_world_pin_manifest_digest
      AND i.record_registry_digest=e.record_registry_digest
     WHERE e.catalog_scope=$1
     ORDER BY e.event_sequence DESC
     LIMIT 1`,
    [release.runtime_catalog_scope]
  );
  const actualPin = activation.rows?.[0];
  if (revision.rows?.length !== 1
    || activation.rows?.length !== 1
    || !samePin(actualPin, runtimeCatalogPin)) {
    throw serverError(
      'SPATIAL_V3_WORLD_RELEASE_PIN_MISMATCH',
      'World revision and active runtime catalog must match the exact release pins.'
    );
  }

  const validatedEvents = new Set([actualPin.event_id]);
  for (const persistedPin of historicalPins) {
    if (validatedEvents.has(persistedPin.activation_event_id)) {
      if (!samePin(actualPin, persistedPin)) {
        throw historicalPinMismatch(persistedPin);
      }
      continue;
    }
    const historical = await worldPool.query(
      `SELECT
         e.event_id,e.catalog_scope,e.catalog_revision_id,e.catalog_digest,
         e.import_id,e.import_audit_digest,e.record_registry_digest,
         e.runtime_contract_digest,e.compatible_world_revision_id,
         e.compatible_world_catalog_digest,
         e.compatible_world_pin_manifest_digest
       FROM world_base.runtime_catalog_activation_events e
       JOIN world_base.domain_catalog_revisions r
         ON r.catalog_revision_id=e.catalog_revision_id
        AND r.catalog_scope=e.catalog_scope
        AND r.status='approved'
        AND r.target_catalog_digest=e.catalog_digest
        AND r.compatible_world_revision_id=e.compatible_world_revision_id
        AND r.compatible_world_catalog_digest=e.compatible_world_catalog_digest
        AND r.compatible_world_pin_manifest_digest=
          e.compatible_world_pin_manifest_digest
        AND r.record_registry_digest=e.record_registry_digest
        AND r.runtime_contract_digest=e.runtime_contract_digest
       JOIN world_base.catalog_imports i
         ON i.import_id=e.import_id
        AND i.approval_status='approved'
        AND i.catalog_scope=e.catalog_scope
        AND i.target_revision_id=e.catalog_revision_id
        AND i.import_audit_digest=e.import_audit_digest
        AND i.target_catalog_digest=e.catalog_digest
        AND i.compatible_world_revision_id=e.compatible_world_revision_id
        AND i.compatible_world_catalog_digest=e.compatible_world_catalog_digest
        AND i.compatible_world_pin_manifest_digest=
          e.compatible_world_pin_manifest_digest
        AND i.record_registry_digest=e.record_registry_digest
       WHERE e.catalog_scope=$1 AND e.event_id=$2`,
      [release.runtime_catalog_scope, persistedPin.activation_event_id]
    );
    if (historical.rows?.length !== 1
      || !samePin(historical.rows[0], persistedPin)) {
      throw historicalPinMismatch(persistedPin);
    }
    validatedEvents.add(persistedPin.activation_event_id);
  }

  return Object.freeze({
    status: 'ready',
    world_revision_id: revision.rows[0].id,
    runtime_catalog_activation_event_id: actualPin.event_id,
    historical_activation_count: historicalPins.length
  });
}

export async function assertPartyReleaseReadiness(
  partyPool,
  release
) {
  const migrationLedger = await partyPool.query(
    `SELECT migration_id,migration_digest,target_schema_fingerprint
     FROM party_runtime.schema_migrations
     WHERE migration_id=$1`,
    [release.party_runtime_catalog_migration_id]
  );
  const ledger = migrationLedger.rows?.[0];
  if (migrationLedger.rows?.length !== 1
    || ledger.migration_digest
      !== release.party_runtime_catalog_migration_digest
    || ledger.target_schema_fingerprint
      !== release.party_runtime_catalog_target_fingerprint) {
    throw serverError(
      'SPATIAL_V3_PARTY_CATALOG_MIGRATION_REQUIRED',
      'The exact party runtime-catalog migration must precede production cutover.'
    );
  }
  const result = await partyPool.query(`
    SELECT
      count(*)::integer AS party_count,
      count(*) FILTER (
        WHERE p.schema_version <> 3
           OR p.world_revision_id <> $1
           OR p.world_catalog_digest <> $2
           OR c.party_id IS NULL
           OR c.catalog_scope <> $3
           OR c.compatible_world_revision_id <> $1
           OR c.compatible_world_catalog_digest <> $2
           OR c.compatible_world_pin_manifest_digest <> $4
      )::integer AS incompatible_party_count
    FROM party_runtime.parties p
    LEFT JOIN party_runtime.party_catalog_pins c
      ON c.party_id=p.party_id AND c.catalog_scope=$3
  `, [
    release.world_revision_id,
    release.world_catalog_digest,
    release.runtime_catalog_scope,
    release.compatible_world_pin_manifest_digest
  ]);
  const row = result.rows?.[0];
  if (!row
    || !Number.isInteger(Number(row.party_count))
    || Number(row.party_count) < 0
    || Number(row.incompatible_party_count) !== 0) {
    throw serverError(
      'SPATIAL_V3_PARTY_MIGRATION_REQUIRED',
      'Every persisted party must complete the reviewed v3 migration before activation.',
      {
        status: 500,
        details: {
          party_count: Number(row?.party_count ?? 0),
          incompatible_party_count:
            Number(row?.incompatible_party_count ?? -1)
        }
      }
    );
  }
  const historical = await partyPool.query(`
    SELECT DISTINCT
      c.catalog_scope,c.catalog_revision_id,c.catalog_digest,
      c.import_id,c.import_audit_digest,c.record_registry_digest,
      c.runtime_contract_digest,c.compatible_world_revision_id,
      c.compatible_world_catalog_digest,
      c.compatible_world_pin_manifest_digest,c.activation_event_id
    FROM party_runtime.parties p
    JOIN party_runtime.party_catalog_pins c
      ON c.party_id=p.party_id AND c.catalog_scope=$1
    ORDER BY c.activation_event_id
  `, [release.runtime_catalog_scope]);
  const historicalPins = Object.freeze(
    (historical.rows ?? []).map((pin) => Object.freeze({ ...pin }))
  );
  return Object.freeze({
    party_count: Number(row.party_count),
    incompatible_party_count: 0,
    historical_pin_count: historicalPins.length,
    historical_pins: historicalPins,
    status: 'ready'
  });
}

function samePin(actual, expected) {
  return Boolean(actual && expected)
    && actual.event_id === expected.activation_event_id
    && PIN_FIELDS.every((field) => actual[field] === expected[field]);
}

function historicalPinMismatch(pin) {
  return serverError(
    'SPATIAL_V3_HISTORICAL_CATALOG_PIN_MISMATCH',
    'Every persisted party catalog pin must resolve to its exact approved activation event.',
    {
      status: 500,
      details: {
        activation_event_id: pin?.activation_event_id ?? null
      }
    }
  );
}
