import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { validateActorBaseAttributesImportRequest } from
  '../../../scripts/generate-actor-base-attributes-import-request.mjs';
import { buildBaseWorldCompatibilityManifest, digestEnvelope } from
  './artifact-contracts.js';

export const TARGET_CATALOG_REQUEST_DIRECTORY =
  'data/world-catalogs/novgorod/runtime-catalog/spatial-v3-target-v1';
const WORLD_ROOT = 'data/world-catalogs/novgorod/spatial-v3';
const ITEM_ROOT = 'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1';
const ACTOR_ROOT = 'data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1';
const TARGET_WORLD = 'novgorod_spatial_v3_target_contract_approval_001';
const TARGET_WORLD_DIGEST =
  '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e';

/** Prepare review inputs only. Operational requests require live exact readback. */
export async function buildSpatialV3TargetCatalogRequests({ repositoryRoot,
  subjectCommit, contentIdentity = false }) {
  const read = async (path) => JSON.parse(await readFile(
    resolve(repositoryRoot, path), 'utf8'));
  const manifestBytes = await readFile(resolve(repositoryRoot,
    `${WORLD_ROOT}/manifest.json`));
  const manifest = JSON.parse(manifestBytes);
  const worlds = await read(`${WORLD_ROOT}/datasets/spatial_v3_world_revisions.json`);
  assert.equal(manifest.world_revision_id, TARGET_WORLD);
  assert.equal(manifest.status, 'approved');
  assert.equal(worlds.length, 1);
  assert.equal(worlds[0].id, TARGET_WORLD);
  assert.equal(worlds[0].catalog_digest, TARGET_WORLD_DIGEST);
  assert.equal(worlds[0].status, 'approved');

  const itemRequest = await read(`${ITEM_ROOT}/activation-amendment-v1/request.json`);
  const itemReadback = await read(`${ITEM_ROOT}/import-readback-result.json`);
  assert.equal(digestEnvelope(itemReadback),
    itemRequest.completed_import_readback.canonical_digest);
  assert.equal(itemReadback.target_revision_id,
    itemRequest.target_catalog.revision_id);
  assert.equal(itemReadback.target_catalog_digest,
    itemRequest.target_catalog.catalog_digest);
  for (const binding of Object.values(itemRequest.approval_chain)) {
    const bytes = await readFile(resolve(repositoryRoot, binding.path));
    assert.equal(sha256(bytes), binding.sha256);
    assert.equal(JSON.parse(bytes).attestation_digest, binding.attestation_digest);
  }
  const actorImport = await read(`${ACTOR_ROOT}/runtime-import-v1/request.json`);
  validateActorBaseAttributesImportRequest(actorImport);
  assert.equal(itemReadback.target_revision_id,
    actorImport.parent_catalog.catalog_revision_id);
  assert.equal(itemReadback.target_catalog_digest,
    actorImport.parent_catalog.catalog_digest);
  assert.equal(digestEnvelope(itemReadback),
    actorImport.parent_catalog.import_readback_digest);
  const actorActivation = await read(
    `${ACTOR_ROOT}/runtime-activation-v1/activation-readback-result.json`);
  const { result_digest: actorResultDigest, ...actorResult } = actorActivation;
  assert.equal(digestEnvelope(actorResult), actorResultDigest);
  assert.equal(actorActivation.catalog_revision_id, actorImport.target_revision_id);
  assert.equal(actorActivation.catalog_digest, actorImport.target_catalog_digest);

  const runtimeConfiguration = {
    schema: 'rus.spatial_v3_target_catalog_configuration.v1',
    release_id: 'spatial-v3-production-v17',
    world_revision_id: TARGET_WORLD,
    world_catalog_digest: TARGET_WORLD_DIGEST,
    world_manifest_sha256: sha256(manifestBytes)
  };
  const schemaRequest = contentIdentity
    ? await read('data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-request.json')
    : null;
  const sourceArtifactPaths = contentIdentity ? [
    `${WORLD_ROOT}/manifest.json`,
    `${WORLD_ROOT}/datasets/spatial_v3_world_revisions.json`,
    ...schemaRequest.world_schema.ordered_parts.map((part) => part.path),
    ...schemaRequest.party_schema.ordered_migrations.map((part) => part.path),
    'tools/runtime-catalog-activation/migrations/world/001_runtime_catalog_activation.sql',
    'tools/runtime-catalog-activation/migrations/world/002_actor_base_attributes_owner.sql',
    'tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql',
    'tools/runtime-catalog-activation/migrations/party/002_actor_base_attributes_pins.sql'
  ] : [`${WORLD_ROOT}/manifest.json`,
    `${WORLD_ROOT}/datasets/spatial_v3_world_revisions.json`];
  const sourceArtifactDigests = contentIdentity
    ? await Promise.all(sourceArtifactPaths.map(async (path) =>
      ({ path, sha256: sha256(await readFile(resolve(repositoryRoot, path))) })))
    : undefined;
  const compatibility = buildBaseWorldCompatibilityManifest({
    compatibleWorldRevisionId: TARGET_WORLD,
    compatibleWorldCatalogDigest: TARGET_WORLD_DIGEST,
    sourceRuntimeConfigurationDigest: digestEnvelope(runtimeConfiguration),
    sourceArtifactPaths,
    sourceArtifactDigests,
    sourceCommitSha: subjectCommit,
    validationContractVersion: 'base_world_compatibility_v2'
  });
  const common = {
    version: contentIdentity ? 2 : 1,
    status: 'pending_independent_compatibility_approval',
    ...(!contentIdentity ? { subject_commit: subjectCommit } : {}),
    runtime_configuration: runtimeConfiguration,
    compatible_world: compatibility,
    activation_scope: 'new_production_parties_only',
    authority: { import_authorized: false, activation_authorized: false,
      production_authorized: false, existing_party_migration_authorized: false,
      old_save_rematerialization_authorized: false },
    independent_approval_attestation: null,
    runtime_pin: null
  };
  const item = seal({
    schema: `rus.item_container_target_compatibility_request.v${contentIdentity ? 2 : 1}`,
    ...common,
    catalog_scope: 'item_container_materialization_v2',
    target_revision_id: 'item_container_spatial_v3_target_001',
    target_catalog_digest: null,
    approved_source_catalog: itemRequest.target_catalog,
    approved_source_readback: itemRequest.completed_import_readback,
    authoring_approval_chain: itemRequest.approval_chain,
    requested_operations: ['register_target_compatible_baseline',
      'assert_existing_approved_item_container_membership',
      'exact_readback', 'activate_for_new_production_parties_only'],
    operational_request: null,
    required_before_operational_request: [
      'live_target_world_and_approved_source_membership_readback',
      'exact_target_baseline_and_compiled_overlay',
      'independent_target_compatibility_and_import_approval',
      'target_import_exact_readback',
      'live_activation_predecessor_and_party_preflight',
      'independent_new_production_activation_approval'
    ]
  });
  const actor = seal({
    schema: `rus.actor_base_attributes_target_compatibility_request.v${contentIdentity ? 2 : 1}`,
    ...common,
    catalog_scope: 'actor_base_attributes_v1',
    target_revision_id: 'actor_base_attributes_spatial_v3_target_001',
    target_catalog_digest: null,
    parent_catalog: {
      catalog_scope: item.catalog_scope,
      catalog_revision_id: item.target_revision_id,
      compatibility_request_digest: item.request_digest,
      catalog_digest: null,
      import_readback: null
    },
    authoring_approval: actorImport.authoring_approval,
    record_registry_digest: actorImport.record_registry_digest,
    runtime_contract_digest: actorImport.runtime_contract_digest,
    owner_rows: actorImport.owner_rows.map((entry) => ({ ...entry,
      row: { ...entry.row,
        catalog_revision_id: 'actor_base_attributes_spatial_v3_target_001' }
    })),
    historical_activation: {
      path: `${ACTOR_ROOT}/runtime-activation-v1/activation-readback-result.json`,
      result_digest: actorResultDigest,
      event_id: actorActivation.event_id,
      event_digest: actorActivation.event_digest,
      live_predecessor_verified: false
    },
    requested_operations: ['transactional_successor_import', 'exact_readback',
      'append_successor_activation_for_new_production_parties_only'],
    operational_import_request: null,
    operational_activation_request: null,
    required_before_operational_request: [
      'exact_target_item_parent_catalog_and_registration_readback',
      'independent_target_actor_import_approval',
      'target_actor_import_exact_readback',
      'live_activation_predecessor_and_party_preflight',
      'independent_new_production_activation_approval'
    ]
  });
  return { 'item-compatibility-request.json': item,
    'actor-compatibility-request.json': actor };
}

function seal(payload) {
  return { ...payload, request_digest: digestEnvelope(payload) };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    'subject-commit': { type: 'string' },
    write: { type: 'boolean' }, check: { type: 'boolean' }
  } });
  const root = resolve(import.meta.dirname, '../../..');
  const artifacts = await buildSpatialV3TargetCatalogRequests({
    repositoryRoot: root, subjectCommit: values['subject-commit']
  });
  for (const [name, artifact] of Object.entries(artifacts)) {
    const path = resolve(root, TARGET_CATALOG_REQUEST_DIRECTORY, name);
    const rendered = `${JSON.stringify(artifact, null, 2)}\n`;
    if (values.check) assert.equal(await readFile(path, 'utf8'), rendered);
    else if (values.write) {
      await mkdir(resolve(root, TARGET_CATALOG_REQUEST_DIRECTORY), { recursive: true });
      await writeFile(path, rendered);
    } else process.stdout.write(rendered);
  }
}
