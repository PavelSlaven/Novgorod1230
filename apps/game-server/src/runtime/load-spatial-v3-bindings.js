import { pathToFileURL } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { serverError } from '../errors.js';

export const SPATIAL_V3_PRODUCTION_BINDINGS_MODULE =
  'builtin:spatial-v3-production-v11';

export function resolveSpatialV3ProductionBindingsModule(config, env) {
  const selected = config.spatialV3BindingsModule
    ?? env.RUS_SPATIAL_V3_BINDINGS_MODULE
    ?? SPATIAL_V3_PRODUCTION_BINDINGS_MODULE;
  if (selected !== SPATIAL_V3_PRODUCTION_BINDINGS_MODULE) {
    throw serverError(
      'RUNTIME_BINDINGS_MODULE_INACTIVE',
      'Only the production-v11 spatial-v3 runtime binding may be selected.'
    );
  }
  return selected;
}

export async function loadSpatialV3RuntimeBindings(
  moduleReference,
  context = {}
) {
  const reference = String(moduleReference ?? '').trim();
  if (!reference) {
    throw serverError(
      'RUNTIME_BINDINGS_MODULE_REQUIRED',
      'Spatial-v3 production requires RUS_SPATIAL_V3_BINDINGS_MODULE.'
    );
  }
  const specifier = reference === SPATIAL_V3_PRODUCTION_BINDINGS_MODULE
    ? new URL(
        './releases/spatial-v3-production-v11-bindings.js',
        import.meta.url
      ).href
    : reference.startsWith('.') || isAbsolute(reference)
      ? pathToFileURL(resolve(reference)).href
      : reference;
  const loaded = await import(specifier);
  const factory = loaded.createSpatialV3RuntimeBindings ?? loaded.default;
  if (typeof factory !== 'function') {
    throw serverError(
      'RUNTIME_BINDINGS_FACTORY_INVALID',
      'Spatial-v3 bindings must export createSpatialV3RuntimeBindings or default.'
    );
  }
  return validateSpatialV3RuntimeBindings(
    await factory(context),
    context.release
  );
}

const RELEASE_IDENTITY_FIELDS = Object.freeze([
  'release_id',
  'composition_id',
  'contract_version',
  'temporal_contract_id',
  'party_schema_version',
  'world_revision_id',
  'world_catalog_digest',
  'world_catalog_manifest_sha256',
  'dependency_pin_mode',
  'runtime_catalog_pin_schema',
  'runtime_catalog_scope',
  'runtime_catalog_resolution',
  'party_runtime_catalog_migration_id',
  'party_runtime_catalog_migration_digest',
  'party_runtime_catalog_target_fingerprint',
  'target_migration_count',
  'target_migration_chain_digest',
  'compatible_world_pin_manifest_digest',
  'rollback_source_release_id',
  'rollback_runtime_selectable',
  'release_status',
  'production_activation',
  'runtime_selectable_in_canonical_production',
  'scenario_binding_id',
  'boundary_crossing_capability',
  'npc_conversation_capability',
  'npc_autonomous_capability',
  'npc_combat_capability'
]);
const RUNTIME_PIN_FIELDS = Object.freeze([
  'schema',
  'catalog_scope',
  'catalog_revision_id',
  'catalog_digest',
  'activation_event_id',
  'import_id',
  'import_audit_digest',
  'record_registry_digest',
  'runtime_contract_digest',
  'compatible_world_revision_id',
  'compatible_world_catalog_digest',
  'compatible_world_pin_manifest_digest'
]);
const digest = (value) => (
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
);

export function validateSpatialV3RuntimeBindings(bindings, expectedRelease) {
  if (!bindings
    || typeof bindings !== 'object'
    || !bindings.targetCompositionPorts
    || typeof bindings.targetCompositionPorts !== 'object') {
    throw serverError(
      'RUNTIME_BINDINGS_INVALID',
      'Spatial-v3 bindings require targetCompositionPorts.'
    );
  }
  if (!expectedRelease || typeof expectedRelease !== 'object'
    || !bindings.releaseBinding
    || RELEASE_IDENTITY_FIELDS.some(
      (field) => bindings.releaseBinding[field] !== expectedRelease[field]
    )) {
    throw serverError(
      'RUNTIME_BINDINGS_RELEASE_MISMATCH',
      'Spatial-v3 bindings must be pinned to the exact production release.'
    );
  }
  const runtimeCatalogPin = bindings.runtimeCatalogPin;
  if (!runtimeCatalogPin
    || RUNTIME_PIN_FIELDS.some(
      (field) => typeof runtimeCatalogPin[field] !== 'string'
        || runtimeCatalogPin[field].length === 0
    )
    || runtimeCatalogPin.schema !== expectedRelease.runtime_catalog_pin_schema
    || runtimeCatalogPin.catalog_scope !== expectedRelease.runtime_catalog_scope
    || runtimeCatalogPin.compatible_world_revision_id
      !== expectedRelease.world_revision_id
    || runtimeCatalogPin.compatible_world_catalog_digest
      !== expectedRelease.world_catalog_digest
    || runtimeCatalogPin.compatible_world_pin_manifest_digest
      !== expectedRelease.compatible_world_pin_manifest_digest
    || [
      'catalog_digest',
      'import_audit_digest',
      'record_registry_digest',
      'runtime_contract_digest',
      'compatible_world_catalog_digest',
      'compatible_world_pin_manifest_digest'
    ].some((field) => !digest(runtimeCatalogPin[field]))) {
    throw serverError(
      'RUNTIME_BINDINGS_CATALOG_PIN_MISMATCH',
      'Spatial-v3 bindings require one exact compatible runtime-catalog pin.'
    );
  }
  for (const name of ['commitRecheck', 'createPublicRuntimeFacade']) {
    if (typeof bindings[name] !== 'function') {
      throw serverError(
        'RUNTIME_BINDINGS_INVALID',
        `Spatial-v3 binding ${name} must be a function.`
      );
    }
  }
  return Object.freeze({
    targetCompositionPorts: Object.freeze({
      ...bindings.targetCompositionPorts
    }),
    commitRecheck: bindings.commitRecheck,
    createPublicRuntimeFacade: bindings.createPublicRuntimeFacade,
    releaseBinding: Object.freeze({ ...bindings.releaseBinding }),
    runtimeCatalogPin: Object.freeze({ ...runtimeCatalogPin })
  });
}
