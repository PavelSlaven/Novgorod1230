import {
  assertCompatibleWorldPin,
  createRuntimeCatalogLoader,
  selectApplicableItemCatalog
} from '@rus/runtime-catalog';
import { loadCommonCatalogLookupRecords } from '@rus/runtime-catalog/common-lookups';
import { RUNTIME_CATALOG_CONTRACT_DIGEST } from '@rus/runtime-catalog/runtime-contract';

export const ITEM_CONTAINER_CATALOG_SCOPE = 'item_container_materialization_v2';

export class RuntimeCatalogBoundaryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeCatalogBoundaryError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function createRuntimeCatalogCoordinator({
  worldBaseReader,
  partyPool,
  commonCatalogLookupLoader = loadCommonCatalogLookupRecords,
  supportedRuntimeContractDigests = [RUNTIME_CATALOG_CONTRACT_DIGEST],
  loader = createRuntimeCatalogLoader({
    worldBaseReader,
    supportedRuntimeContractDigests
  })
} = {}) {
  if (!partyPool || typeof partyPool.query !== 'function') {
    throw new TypeError('partyPool.query is required.');
  }

  async function prepareNewPartyContext({ worldPin, regionId, effectiveDate }) {
    const pin = await loader.loadActivePin({ catalogScope: ITEM_CONTAINER_CATALOG_SCOPE });
    compatible({ domainPin: pin, worldPin });
    return buildContext({ loader, projection, commonCatalogLookupLoader, pin, worldPin, regionId, effectiveDate, source: 'active' });
  }

  async function restoreNewPartyContext({ pin, worldPin, regionId, effectiveDate }) {
    compatible({ domainPin: pin, worldPin });
    return buildContext({ loader, projection, commonCatalogLookupLoader, pin, worldPin, regionId, effectiveDate, source: 'checkpoint' });
  }

  async function loadPartyContext({ partyId, regionId = null, effectiveDate = null }) {
    const result = await partyPool.query(
      `SELECT
         p.world_revision_id,
         p.world_catalog_digest,
         c.catalog_scope,
         c.catalog_revision_id,
         c.catalog_digest,
         c.import_id,
         c.import_audit_digest,
         c.record_registry_digest,
         c.runtime_contract_digest,
         c.compatible_world_revision_id,
         c.compatible_world_catalog_digest,
         c.compatible_world_pin_manifest_digest,
         c.activation_event_id
       FROM party_runtime.parties p
       LEFT JOIN party_runtime.party_catalog_pins c
         ON c.party_id = p.party_id
        AND c.catalog_scope = 'item_container_materialization_v2'
       WHERE p.party_id = $1`,
      [partyId]
    );
    if (result.rows.length === 0) {
      fail('PARTY_CATALOG_PIN_MISSING', 'Party does not exist or has no catalog pin.', { party_id: partyId });
    }
    const row = result.rows[0];
    if (!row.catalog_revision_id) {
      fail('PARTY_CATALOG_PIN_MISSING', 'Party has no item/container domain pin.', { party_id: partyId });
    }
    const pin = pinFromRow(row);
    const worldPin = {
      world_revision_id: row.world_revision_id,
      world_catalog_digest: row.world_catalog_digest
    };
    compatible({ domainPin: pin, worldPin });
    return buildContext({ loader, projection, commonCatalogLookupLoader, pin, worldPin, regionId, effectiveDate, source: 'persisted_party' });
  }

  async function assertMaterializationRunPin({ partyId, runId, expectedPin }) {
    const result = await partyPool.query(
      `SELECT
         r.catalog_digest AS materialization_catalog_digest,
         p.catalog_scope,
         p.catalog_revision_id,
         p.catalog_digest,
         p.import_id,
         p.import_audit_digest,
         p.record_registry_digest,
         p.runtime_contract_digest,
         p.activation_event_id
       FROM party_runtime.party_materialization_runs r
       LEFT JOIN party_runtime.party_materialization_run_catalog_pins p
         ON p.party_id = r.party_id
        AND p.run_id = r.run_id
        AND p.catalog_scope = 'item_container_materialization_v2'
       WHERE r.party_id = $1 AND r.run_id = $2`,
      [partyId, runId]
    );
    const row = result.rows[0];
    if (!row?.catalog_revision_id) {
      fail('PARTY_CATALOG_PIN_MISSING', 'Materialization run has no normalized catalog pin.', {
        party_id: partyId,
        run_id: runId
      });
    }
    const keys = [
      'catalog_scope',
      'catalog_revision_id',
      'catalog_digest',
      'import_id',
      'import_audit_digest',
      'record_registry_digest',
      'runtime_contract_digest',
      'activation_event_id'
    ];
    if (row.materialization_catalog_digest !== row.catalog_digest
        || keys.some((key) => row[key] !== expectedPin[key])) {
      fail('PARTY_CATALOG_PIN_MISMATCH', 'Materialization run catalog pin is inconsistent.', {
        party_id: partyId,
        run_id: runId
      });
    }
    return Object.freeze({ pass: true, party_id: partyId, run_id: runId });
  }

  return Object.freeze({
    prepareNewPartyContext,
    restoreNewPartyContext,
    loadPartyContext,
    assertMaterializationRunPin
  });

  function compatible(input) {
    return (loader.assertCompatibleWorldPin ?? assertCompatibleWorldPin)(input);
  }

  function projection(input) {
    return (loader.selectApplicableItemCatalog ?? selectApplicableItemCatalog)(input);
  }
}

async function buildContext({
  loader,
  projection,
  commonCatalogLookupLoader,
  pin,
  worldPin,
  regionId,
  effectiveDate,
  source
}) {
  const verifiedCatalog = withCommonLookups(
    await loader.loadApprovedItemCatalog({ pin }),
    await commonCatalogLookupLoader()
  );
  const actorProfileCatalog = regionId && effectiveDate
    && typeof loader.loadApprovedActorProfileCatalog === 'function'
    ? await loader.loadApprovedActorProfileCatalog({
      worldPin,
      regionId,
      effectiveDate
    })
    : null;
  const applicableCatalog = regionId && effectiveDate
    ? projection({
      verifiedCatalog,
      regionId,
      effectiveDate
    })
    : null;
  return deepFreeze({
    schema: 'rus.runtime_catalog_context.v2',
    source,
    pin,
    world_pin: structuredClone(worldPin),
    selection: {
      region_id: regionId ?? null,
      effective_date: effectiveDate ?? null
    },
    actor_profile_catalog: actorProfileCatalog,
    verified_catalog: verifiedCatalog,
    applicable_catalog: applicableCatalog
  });
}

function withCommonLookups(catalog, lookupRecords) {
  return deepFreeze({
    ...structuredClone(catalog),
    records_by_table: {
      ...structuredClone(catalog?.records_by_table ?? {}),
      ...structuredClone(lookupRecords)
    }
  });
}

function pinFromRow(row) {
  return deepFreeze({
    schema: 'rus.runtime_catalog_pin.v2',
    catalog_scope: row.catalog_scope,
    catalog_revision_id: row.catalog_revision_id,
    catalog_digest: row.catalog_digest,
    activation_event_id: row.activation_event_id,
    import_id: row.import_id,
    import_audit_digest: row.import_audit_digest,
    record_registry_digest: row.record_registry_digest,
    runtime_contract_digest: row.runtime_contract_digest,
    compatible_world_revision_id: row.compatible_world_revision_id,
    compatible_world_catalog_digest: row.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest: row.compatible_world_pin_manifest_digest
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(code, message, details) {
  throw new RuntimeCatalogBoundaryError(code, message, details);
}
