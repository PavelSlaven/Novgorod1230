import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import registry from '../../../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import { generateProceduralFinalCandidatePack } from '../../../scripts/generate-procedural-final-candidate-pack.mjs';
import { buildBaselineRegistrationId, buildBaselineRegistrationRequest,
  buildOperatorBaselineSnapshotManifest, digestEnvelope } from './artifact-contracts.js';
import { WORLD_RUNTIME_CATALOG_MIGRATION } from './forward-migrations.js';
import { importProceduralFinalCandidatePack, importProceduralFinalV2Pack } from './procedural-v6-import.js';
import { registerCatalogBaseline } from './operator-executors.js';
import { RECORD_ADAPTERS } from './record-adapters.generated.js';
import { RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST } from '@rus/runtime-catalog/runtime-contract';
import { buildSpatialV3ProductionV12ActivationBundle,
  applySpatialV3ProductionV12ActivationBundle } from './spatial-v3-production-v12-activation.js';
import { buildProceduralFinalDevelopmentActivation,
  applyProceduralFinalDevelopmentActivation } from './procedural-final-development-activation.js';
import { buildProceduralFinalV2DevelopmentActivation,
  applyProceduralFinalV2DevelopmentActivation } from './procedural-final-v2-development-activation.js';
import { loadActiveRuntimeCatalogPin } from '../../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';

const SHA = '8bbe8fef01c433e4cca40e3a121cfdefd9efc0b0';

/** Exact disposable V12→V1→V2 activation chain; caller owns schema/import setup. */
export async function bootstrapProceduralFinalV2Disposable({ worldPool,
  partyPool, repositoryRoot }) {
  const root = resolve(repositoryRoot);
  const oldBundle = await buildSpatialV3ProductionV12ActivationBundle({
    worldPool, partyPool, repositoryRoot: root, gitCommitSha: SHA,
    authorizationRef: 'disposable old-party fixture activation' });
  const oldActivation = await applySpatialV3ProductionV12ActivationBundle({
    worldPool, partyPool, bundle: oldBundle });
  const oldPin = await loadActiveRuntimeCatalogPin(worldPool,
    'item_container_materialization_v2');
  await seedPartyWithPin(partyPool, 'party-old-fixture', oldPin);
  const pack = await generateProceduralFinalCandidatePack(root);
  const rowsByTable = {};
  for (const entry of registry.entries) rowsByTable[entry.table_name] =
    (await worldPool.query(RECORD_ADAPTERS[entry.table_name].select_all_sql)).rows
      .map(normalizeRow);
  delete rowsByTable.world_revisions;
  const baselineManifest = buildOperatorBaselineSnapshotManifest({
    schemaFingerprint: WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
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
  const activationBundle = await buildProceduralFinalDevelopmentActivation({
    worldPool, partyPool, pack, ledger: imported.ledger, gitCommitSha: SHA,
    authorizationRef: 'bounded development cutover task' });
  const activation = await applyProceduralFinalDevelopmentActivation({ worldPool,
    partyPool, bundle: activationBundle });
  const v1Pin = await loadActiveRuntimeCatalogPin(worldPool,
    'item_container_materialization_v2');
  await seedPartyWithPin(partyPool, 'party-v1-development', v1Pin);
  const v1Event = (await worldPool.query(`SELECT event_id,import_id,
    import_audit_digest,attestation_digest,request_digest,runtime_release_id,
    expected_previous_event_id FROM world_base.runtime_catalog_activation_events
    WHERE catalog_scope='item_container_materialization_v2'
    ORDER BY event_sequence DESC LIMIT 1`)).rows[0];
  const expectedV1 = {
    event_id: 'runtime_catalog_activation_94447901cebfed28716db756f089d0e4',
    import_id: 'procedural_final_import_0204d109cbe18d06aed0957be3c10d12',
    import_audit_digest: 'd5ab73748cd0f79a9064be2434899faa5eac70e96f011f2d09d48657031aa117',
    attestation_digest: 'c81c4965fea835ed8f5769a0cb21fec3b4be50cbb9a87735808bf4020487f97a',
    request_digest: 'ce54f3849dc5dd58a374b1972c3553791fd36a89472e4b31b8dd30643c0ceeb6',
    runtime_release_id: '662d663a583f8bab6dab9aae4340ff72db835f3f817c7764af498605fe294f0e',
    expected_previous_event_id: 'runtime_catalog_activation_369484deea6a4041fccb5a422737abf7'
  };
  if (JSON.stringify(v1Event) !== JSON.stringify(expectedV1)) {
    throw Object.assign(new Error('DISPOSABLE_V1_PREDECESSOR_DIFFERENT'), {
      code: 'DISPOSABLE_V1_PREDECESSOR_DIFFERENT', details: { v1Event,
        expectedV1, baseline: {
          manifest: baselineManifest.parent_snapshot_manifest_digest,
          request: request.registration_request_digest,
          id: baseline.registrationId }, oldActivation } });
  }
  const pinsBeforeV2 = (await partyPool.query(`SELECT party_id,catalog_revision_id,catalog_digest,activation_event_id FROM party_runtime.party_catalog_pins ORDER BY party_id`)).rows;
  const v2Bundle = await buildProceduralFinalV2DevelopmentActivation({
    worldPool, partyPool, v1Pack: pack, v2Pack, v2ApprovalAttestation,
    ledger: v2Imported.ledger, gitCommitSha: SHA });
  const v2Activation = await applyProceduralFinalV2DevelopmentActivation({
    worldPool, partyPool, bundle: v2Bundle });
  const pinsAfterV2 = (await partyPool.query(`SELECT party_id,catalog_revision_id,catalog_digest,activation_event_id FROM party_runtime.party_catalog_pins ORDER BY party_id`)).rows;
  if (JSON.stringify(pinsBeforeV2) !== JSON.stringify(pinsAfterV2))
    throw Object.assign(new Error('DISPOSABLE_V2_EXISTING_PARTY_PIN_MUTATION'),
      { code: 'DISPOSABLE_V2_EXISTING_PARTY_PIN_MUTATION' });
  return Object.freeze({ oldActivation, oldPin, baseline, pack, imported,
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
