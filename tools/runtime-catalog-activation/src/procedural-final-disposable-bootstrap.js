import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import registry from '../../../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import { generateProceduralFinalCandidatePack } from '../../../scripts/generate-procedural-final-candidate-pack.mjs';
import { buildBaselineRegistrationId, buildBaselineRegistrationRequest,
  buildOperatorBaselineSnapshotManifest, digestEnvelope } from './artifact-contracts.js';
import { WORLD_RUNTIME_CATALOG_MIGRATION,
  WORLD_RUNTIME_CATALOG_MIGRATION_V3 } from './forward-migrations.js';
import { importProceduralFinalCandidatePack, importProceduralFinalV2Pack } from './procedural-v6-import.js';
import { registerCatalogBaseline } from './operator-executors.js';
import { RECORD_ADAPTERS } from './record-adapters.generated.js';
import { RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST } from '@rus/runtime-catalog/runtime-contract';
import { buildSpatialV3DevelopmentV13ActivationBundle,
  applySpatialV3DevelopmentV13ActivationBundle,
  SPATIAL_V3_DEVELOPMENT_V13_RELEASE } from './spatial-v3-production-v12-activation.js';
import { buildProceduralFinalCurrentSchemaV1DevelopmentActivation,
  applyProceduralFinalCurrentSchemaV1DevelopmentActivation } from './procedural-final-development-activation.js';
import { buildProceduralFinalCurrentSchemaV2DevelopmentActivation,
  applyProceduralFinalCurrentSchemaV2DevelopmentActivation } from './procedural-final-v2-development-activation.js';
import { loadActiveRuntimeCatalogPin } from '../../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';

const SHA = '8bbe8fef01c433e4cca40e3a121cfdefd9efc0b0';

/** Current-schema disposable dev chain; historical V12 remains immutable. */
export async function bootstrapProceduralFinalV2Disposable({ worldPool,
  partyPool, repositoryRoot, worldMigration = WORLD_RUNTIME_CATALOG_MIGRATION_V3 }) {
  const release = worldMigration.migration_id
    === WORLD_RUNTIME_CATALOG_MIGRATION.migration_id
    ? Object.freeze({ ...SPATIAL_V3_DEVELOPMENT_V13_RELEASE,
      worldSchemaFingerprint: WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
      worldSchemaMigration: WORLD_RUNTIME_CATALOG_MIGRATION })
    : SPATIAL_V3_DEVELOPMENT_V13_RELEASE;
  const root = resolve(repositoryRoot);
  const developmentBundle = await buildSpatialV3DevelopmentV13ActivationBundle({
    worldPool, partyPool, repositoryRoot: root, gitCommitSha: SHA,
    authorizationRef: 'disposable development fixture activation', release });
  const developmentActivation = await applySpatialV3DevelopmentV13ActivationBundle({
    worldPool, partyPool, bundle: developmentBundle, release });
  const developmentPin = await loadActiveRuntimeCatalogPin(worldPool,
    'item_container_materialization_v2');
  await seedPartyWithPin(partyPool, 'party-development-fixture', developmentPin);
  const pack = await generateProceduralFinalCandidatePack(root);
  const rowsByTable = {};
  for (const entry of registry.entries) rowsByTable[entry.table_name] =
    (await worldPool.query(RECORD_ADAPTERS[entry.table_name].select_all_sql)).rows
      .map(normalizeRow);
  delete rowsByTable.world_revisions;
  const baselineManifest = buildOperatorBaselineSnapshotManifest({
    schemaFingerprint:
      WORLD_RUNTIME_CATALOG_MIGRATION_V3.target_schema_fingerprint,
    registry, rowsByTable });
  const request = buildBaselineRegistrationRequest({
    parentRevisionId: 'procedural_final_disposable_baseline_001',
    parentCatalogDigest: baselineManifest.records_aggregate_digest,
    baselineManifest, compatibleWorldTuple: pack.compatibility_manifest });
  const payload = { schema: 'rus.baseline_registration_attestation.v2',
    registration_request_digest: request.registration_request_digest,
    decision: 'approve_register_baseline', parent_tuple: {
      parent_revision_id: request.parent_revision_id,
      parent_catalog_digest: request.parent_catalog_digest,
      parent_snapshot_manifest_digest: request.parent_snapshot_manifest_digest },
    compatible_world_tuple: {
      compatible_world_revision_id: request.compatible_world_revision_id,
      compatible_world_catalog_digest: request.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest: request.compatible_world_pin_manifest_digest },
    action: 'register_baseline',
    attested_by: 'independent_final_candidate_auditor:disposable-workflow' };
  const baseline = { request, attestation: { ...payload,
    attestation_digest: digestEnvelope(payload) }, baselineManifest,
    compatibilityManifest: pack.compatibility_manifest,
    runtimeConfigurationTuple: {
      compatible_world_revision_id: pack.compatibility_manifest.compatible_world_revision_id,
      compatible_world_catalog_digest: pack.compatibility_manifest.compatible_world_catalog_digest,
      source_runtime_configuration_digest: pack.compatibility_manifest.source_runtime_configuration_digest },
    registrationId: buildBaselineRegistrationId(request) };
  await registerCatalogBaseline({ pool: worldPool, ...baseline });
  const imported = await importProceduralFinalCandidatePack({ pool: worldPool,
    baseline, pack, runtimeContractDigest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST });
  const [v2Pack, v2ApprovalAttestation] = await Promise.all([
    readFile(resolve(root, 'data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v2/candidate.json'), 'utf8').then(JSON.parse),
    readFile(resolve(root, 'data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v2/approval-attestation.json'), 'utf8').then(JSON.parse)
  ]);
  const v2Imported = await importProceduralFinalV2Pack({ pool: worldPool,
    baseline, v1Pack: pack, v2Pack, attestation: v2ApprovalAttestation,
    runtimeContractDigest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST });
  const activationBundle = await buildProceduralFinalCurrentSchemaV1DevelopmentActivation({
    worldPool, partyPool, pack, ledger: imported.ledger, gitCommitSha: SHA,
  });
  const activation = await applyProceduralFinalCurrentSchemaV1DevelopmentActivation({ worldPool,
    partyPool, bundle: activationBundle });
  const v1Pin = await loadActiveRuntimeCatalogPin(worldPool,
    'item_container_materialization_v2');
  await seedPartyWithPin(partyPool, 'party-v1-development', v1Pin);
  const pinsBeforeV2 = (await partyPool.query(`SELECT party_id,catalog_revision_id,catalog_digest,activation_event_id FROM party_runtime.party_catalog_pins ORDER BY party_id`)).rows;
  const v2Bundle = await buildProceduralFinalCurrentSchemaV2DevelopmentActivation({
    worldPool, partyPool, v1Pack: pack, v2Pack, v2ApprovalAttestation,
    ledger: v2Imported.ledger, gitCommitSha: SHA });
  const v2Activation = await applyProceduralFinalCurrentSchemaV2DevelopmentActivation({
    worldPool, partyPool, bundle: v2Bundle });
  const pinsAfterV2 = (await partyPool.query(`SELECT party_id,catalog_revision_id,catalog_digest,activation_event_id FROM party_runtime.party_catalog_pins ORDER BY party_id`)).rows;
  if (JSON.stringify(pinsBeforeV2) !== JSON.stringify(pinsAfterV2))
    throw Object.assign(new Error('DISPOSABLE_V2_EXISTING_PARTY_PIN_MUTATION'),
      { code: 'DISPOSABLE_V2_EXISTING_PARTY_PIN_MUTATION' });
  return Object.freeze({ developmentActivation, developmentPin, baseline, pack, imported,
    activation, v1Pin, v2Pack, v2ApprovalAttestation, v2Imported,
    v2Activation, v2Pin: await loadActiveRuntimeCatalogPin(worldPool,
      'item_container_materialization_v2') });
}

async function seedPartyWithPin(pool, partyId, pin) {
  await pool.query(`INSERT INTO party_runtime.parties (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status) VALUES ($1,3,$2,$3,'development-materializer@1','request-bound-sha256@1','commands','profiles','active')`, [partyId, pin.compatible_world_revision_id, pin.compatible_world_catalog_digest]);
  await pool.query(`INSERT INTO party_runtime.party_catalog_pins (party_id,catalog_scope,catalog_revision_id,catalog_digest,import_id,import_audit_digest,record_registry_digest,runtime_contract_digest,compatible_world_revision_id,compatible_world_catalog_digest,compatible_world_pin_manifest_digest,activation_event_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [partyId, pin.catalog_scope, pin.catalog_revision_id, pin.catalog_digest, pin.import_id, pin.import_audit_digest, pin.record_registry_digest, pin.runtime_contract_digest, pin.compatible_world_revision_id, pin.compatible_world_catalog_digest, pin.compatible_world_pin_manifest_digest, pin.activation_event_id]);
}

export function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value instanceof Date ? value.toISOString().slice(0, 10) : value]));
}
