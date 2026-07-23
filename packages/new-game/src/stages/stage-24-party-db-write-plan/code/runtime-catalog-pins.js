const REQUIRED_WORLD_PINS = Object.freeze([
  'world_revision_id',
  'world_catalog_digest',
  'materializer_version',
  'rng_version',
  'command_catalog_digest',
  'profile_bundle_digest'
]);

const REQUIRED_DOMAIN_PINS = Object.freeze([
  'catalog_scope',
  'catalog_revision_id',
  'catalog_digest',
  'import_id',
  'import_audit_digest',
  'record_registry_digest',
  'runtime_contract_digest',
  'compatible_world_revision_id',
  'compatible_world_catalog_digest',
  'compatible_world_pin_manifest_digest',
  'activation_event_id'
]);

export function assertPartyRuntimeCatalogPins(context = {}) {
  const pins = context.version_pins ?? {};
  const domainPin = context.domain_catalog_pin ?? {};
  const missing = REQUIRED_WORLD_PINS.filter((key) => !pins[key]);
  const missingDomain = REQUIRED_DOMAIN_PINS.filter((key) => !domainPin[key]);
  if (context.schema_version !== 'party_runtime_v2'
      || missing.length > 0
      || missingDomain.length > 0) {
    const allMissing = [...missing, ...missingDomain];
    throw Object.assign(
      new Error(`party_runtime_v2 version pins are missing: ${allMissing.join(', ')}`),
      { code: 'WRITE_PLAN_VERSION_PINS_MISSING', missing: allMissing }
    );
  }
}

export function assertMaterializationRuntimeCatalogPins({ trace, pins, domainPin }) {
  const pairs = [
    ['world_revision_id', 'world_revision_id'],
    ['materializer_version', 'materializer_version'],
    ['rng_version', 'rng_version']
  ];
  const mismatches = pairs.filter(
    ([traceKey, pinKey]) => trace[traceKey] !== pins[pinKey]
  );
  if (trace.catalog_digest !== domainPin.catalog_digest) {
    mismatches.push(['catalog_digest', 'domain_catalog_pin.catalog_digest']);
  }
  if (mismatches.length > 0) {
    throw Object.assign(
      new Error(
        `Materialization trace differs from party pins: ${
          mismatches.map(([key]) => key).join(', ')
        }.`
      ),
      { code: 'WRITE_PLAN_VERSION_PIN_MISMATCH' }
    );
  }
}

export function buildPartyCatalogPinRecord(partyId, domainPin) {
  return {
    party_id: partyId,
    catalog_scope: domainPin.catalog_scope,
    catalog_revision_id: domainPin.catalog_revision_id,
    catalog_digest: domainPin.catalog_digest,
    import_id: domainPin.import_id,
    import_audit_digest: domainPin.import_audit_digest,
    record_registry_digest: domainPin.record_registry_digest,
    runtime_contract_digest: domainPin.runtime_contract_digest,
    compatible_world_revision_id: domainPin.compatible_world_revision_id,
    compatible_world_catalog_digest: domainPin.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      domainPin.compatible_world_pin_manifest_digest,
    activation_event_id: domainPin.activation_event_id
  };
}

export function buildMaterializationRunCatalogPinRecord({
  partyId,
  runId,
  domainPin
}) {
  return {
    party_id: partyId,
    run_id: runId,
    catalog_scope: domainPin.catalog_scope,
    catalog_revision_id: domainPin.catalog_revision_id,
    catalog_digest: domainPin.catalog_digest,
    import_id: domainPin.import_id,
    import_audit_digest: domainPin.import_audit_digest,
    record_registry_digest: domainPin.record_registry_digest,
    runtime_contract_digest: domainPin.runtime_contract_digest,
    activation_event_id: domainPin.activation_event_id
  };
}
