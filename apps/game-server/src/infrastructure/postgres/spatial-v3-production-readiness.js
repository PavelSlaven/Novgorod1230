import {
  RUNTIME_CATALOG_ACTIVATION_LOCK_KEY
} from '@rus/runtime-catalog/runtime-contract';
import { serverError } from '../../errors.js';
import { createHash } from 'node:crypto';
import { canonicalStringify, createRuntimeCatalogLoader } from '@rus/runtime-catalog';
import { loadActiveActorBaseAttributesBinding } from './actor-base-attributes-profile-loader.js';
export {
  loadActiveRuntimeCatalogPin
} from './runtime-catalog-pin-loader.js';

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

// Read-only successor gate. The operator owns import, approval validation and
// activation; composition requires those exact approvals and their committed rows.
export async function assertTargetCatalogActivationReadiness(worldPool, {
  release, itemApproval, actorApproval
} = {}) {
  const invalid = () => { throw serverError('SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED',
    'Exact issued target catalog approvals and committed readbacks are required.'); };
  const hash = (value) => createHash('sha256').update(canonicalStringify(value)).digest('hex');
  const sealed = (value, field) => {
    if (value == null) return false;
    const { [field]: expected, ...payload } = value;
    return /^[a-f0-9]{64}$/u.test(expected ?? '') && expected === hash(payload);
  };
  const item = itemApproval?.request, actor = actorApproval?.request;
  const itemAttestation = itemApproval?.attestation, actorAttestation = actorApproval?.attestation;
  if (item?.schema !== 'rus.runtime_catalog_activation_request.v2'
      || actor?.schema !== 'rus.actor_base_attributes_runtime_activation_request.v2'
      || item.activation_scope !== 'new_production_parties_only'
      || actor.activation_scope !== 'new_production_parties_only'
      || !sealed(item, 'activation_request_digest') || !sealed(actor, 'request_digest')
      || !sealed(itemAttestation, 'attestation_digest')
      || !sealed(actorAttestation, 'attestation_digest')
      || itemAttestation.schema !== 'rus.runtime_catalog_activation_attestation.v2'
      || itemAttestation.decision !== 'approve_activation'
      || itemAttestation.activation_request_digest !== item.activation_request_digest
      || typeof itemAttestation.attested_by !== 'string' || !itemAttestation.attested_by
      || ['catalog_scope', 'target_revision_id', 'target_catalog_digest', 'import_id',
        'import_audit_digest', 'runtime_contract_digest', 'runtime_release_id']
        .some((field) => itemAttestation[field] !== item[field])
      || actorAttestation.schema !== 'rus.actor_base_attributes_successor_activation_attestation.v1'
      || actorAttestation.decision !== 'approve_exact_actor_base_attributes_new_production_activation'
      || actorAttestation.request_digest !== actor.request_digest
      || typeof actorAttestation.attested_by !== 'string' || !actorAttestation.attested_by
      || !actorAttestation.independence_basis
      || actorAttestation.reviewed_repository_head !== actor.subject_commit
      || actorAttestation.database_mutated !== false
      || actorAttestation.authority?.import_authorized !== false
      || actorAttestation.authority?.production_authorized !== true
      || actorAttestation.authority?.activation_authorized !== true
      || actorAttestation.authority?.existing_party_migration_authorized !== false
      || actorAttestation.authority?.old_save_rematerialization_authorized !== false
      || item.target_revision_id !== release?.runtime_catalog_revision_id
      || actor.target_binding?.target_revision_id !== release?.actor_base_attributes_catalog_revision_id
      || item.runtime_release_id !== hash(release.release_id)) invalid();
  const pins = [];
  for (const [request, attestation, scope, binding, requestDigest] of [
    [item, itemAttestation, release.runtime_catalog_scope, item, item.activation_request_digest],
    [actor, actorAttestation, 'actor_base_attributes_v1', actor.target_binding, actor.request_digest]
  ]) {
    const rows = (await worldPool.query(
      `SELECT * FROM world_base.runtime_catalog_activation_events
        WHERE catalog_scope=$1 ORDER BY event_sequence DESC LIMIT 1`, [scope])).rows;
    const event = rows[0];
    if (rows.length !== 1 || event.event_type !== 'activate'
        || event.request_digest !== requestDigest
        || event.attestation_digest !== attestation.attestation_digest
        || event.catalog_revision_id !== binding.target_revision_id
        || event.catalog_digest !== binding.target_catalog_digest
        || event.runtime_release_id !== (request === item ? hash(release.release_id)
          : hash({ schema: 'rus.actor_base_attributes_runtime_release.v1',
            activation_request_digest: actor.request_digest,
            activation_attestation_digest: actorAttestation.attestation_digest,
            activation_scope: actor.activation_scope,
            runtime_capability: actor.runtime_capability }))
        || event.compatible_world_revision_id !== release.world_revision_id
        || event.compatible_world_catalog_digest !== release.world_catalog_digest
        || event.compatible_world_pin_manifest_digest !== release.compatible_world_pin_manifest_digest
        || event.record_registry_digest !== binding.record_registry_digest
        || event.runtime_contract_digest !== binding.runtime_contract_digest) invalid();
    const { event_id, event_digest } = event;
    const envelope = { schema: 'rus.runtime_catalog_activation_event.v2',
      ...Object.fromEntries([...PIN_FIELDS, 'event_type', 'request_digest',
        'attestation_digest', 'expected_previous_event_id', 'runtime_release_id',
        'operator_principal'].map((field) => [field, event[field]])),
      event_sequence: Number(event.event_sequence) };
    if (hash(envelope) !== event_digest
        || event_id !== `runtime_catalog_activation_${event_digest.slice(0, 32)}`) invalid();
    const imported = request === item ? item : actor.completed_import_readback;
    if (event.import_id !== imported.import_id || event.import_audit_digest !== imported.import_audit_digest) invalid();
    pins.push(Object.freeze({ schema: 'rus.runtime_catalog_pin.v2',
      ...Object.fromEntries(PIN_FIELDS.map((field) => [field, event[field]])),
      activation_event_id: event.event_id }));
  }
  const [itemPin, actorPin] = pins;
  if (actor.target_binding.parent_catalog?.catalog_revision_id !== itemPin.catalog_revision_id
      || actor.target_binding.parent_catalog?.catalog_digest !== itemPin.catalog_digest) invalid();
  const spatial = await assertWorldReleaseReadiness(worldPool, itemPin, release);
  await createRuntimeCatalogLoader({ worldBaseReader: {
    read: (sql, values) => worldPool.query(sql, values)
  }, supportedRuntimeContractDigests: [release.runtime_catalog_contract_digest]
  }).loadApprovedItemCatalog({ pin: itemPin });
  const actorBinding = await loadActiveActorBaseAttributesBinding(worldPool, { expectedPin: actorPin });
  return Object.freeze({ spatial, item_pin: itemPin, actor_binding: actorBinding });
}

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
    `WITH latest_event AS (
       SELECT
         e.event_id,e.catalog_scope,e.catalog_revision_id,e.catalog_digest,
         e.import_id,e.import_audit_digest,e.record_registry_digest,
         e.runtime_contract_digest,e.compatible_world_revision_id,
         e.compatible_world_catalog_digest,
         e.compatible_world_pin_manifest_digest
       FROM world_base.runtime_catalog_activation_events e
       WHERE e.catalog_scope=$1
       ORDER BY e.event_sequence DESC
       LIMIT 1
     )
     SELECT
       e.event_id,e.catalog_scope,e.catalog_revision_id,e.catalog_digest,
       e.import_id,e.import_audit_digest,e.record_registry_digest,
       e.runtime_contract_digest,e.compatible_world_revision_id,
       e.compatible_world_catalog_digest,
       e.compatible_world_pin_manifest_digest
     FROM latest_event e
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
    `,
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
           OR (NOT $5 AND p.world_revision_id <> $1)
           OR (NOT $5 AND p.world_catalog_digest <> $2)
           OR c.party_id IS NULL
           OR c.catalog_scope <> $3
           OR c.compatible_world_revision_id <> p.world_revision_id
           OR c.compatible_world_catalog_digest <> p.world_catalog_digest
           OR ((NOT $5 OR p.world_revision_id = $1)
             AND c.compatible_world_pin_manifest_digest <> $4)
      )::integer AS incompatible_party_count
    FROM party_runtime.parties p
    LEFT JOIN party_runtime.party_catalog_pins c
      ON c.party_id=p.party_id AND c.catalog_scope=$3
  `, [
    release.world_revision_id,
    release.world_catalog_digest,
    release.runtime_catalog_scope,
    release.compatible_world_pin_manifest_digest,
    release.activation_scope === 'new_production_parties_only'
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
