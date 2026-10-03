import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalDigest } from '@rus/materialization';
import { ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
  ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import { buildBaseWorldCompatibilityManifest, digestEnvelope } from
  '../tools/runtime-catalog-activation/src/artifact-contracts.js';
import { loadActorBaseAttributesAuthoringArtifacts } from
  '../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/validate.mjs';

const ROOT = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1';
const OUTPUT = `${ROOT}/runtime-import-v1/request.json`;
const SUBJECT_COMMIT = '725c45e52e3bd645339e6677baf0bfeed5ff3149';
const TARGET_REVISION = 'actor_base_attributes_runtime_profile_v1_001';
const AUTHORING_ATTESTATION_DIGEST =
  '06bbe4e0b12a460ecd8bb34119617c1699579d9724ce6524ed3573b2c9aea7ad';
const CANDIDATE_DIGEST =
  '7c0916640715c9c48bd023676b3268deccdc0c83a66c980835ae25173f04d309';
const PROFILE_DIGEST =
  '5643edda6b0993cfe100bee8c1366928167b3b487d6c51d91a70e546644965b7';
const AUTHORING_REQUEST_DIGEST =
  'fc362bb73f60ad87595d0ca51a2080bff7c970907fa8f2ca5f94e5acae155c89';
const PARENT_CATALOG = Object.freeze({
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id:
    'world_revision_novgorod_1230_item_container_approved_001',
  catalog_digest:
    '1d5fd4cd3c7dd9946d68276011cd3264e6e2ccd12f67486171928e18b56451f5',
  import_readback_ref: 'data/world-catalogs/novgorod/runtime-catalog/'
    + 'gate1-owner-data-v1/import-readback-result.json',
  import_readback_digest:
    '8fd919db006f54cb74e997be7d800b884f1743e54a2df9bfa3efd29230ac29e5'
});
const COMPATIBLE_WORLD = Object.freeze({
  world_revision_id: 'novgorod_spatial_v3_production_v6_candidate_001',
  world_catalog_digest:
    '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
  world_manifest_sha256:
    '776ab6989f5c8bb6c49858eb27b3bb9ac637a674e314f1c7e956a35cdbe569eb'
});

export async function generateActorBaseAttributesImportRequest(rootDir) {
  const root = resolve(rootDir);
  const { candidate, request: authoringRequest, attestation } =
    await loadActorBaseAttributesAuthoringArtifacts();
  assert.equal(attestation.attestation_digest, AUTHORING_ATTESTATION_DIGEST);
  const parentResult = JSON.parse(await readFile(resolve(root,
    PARENT_CATALOG.import_readback_ref), 'utf8'));
  assert.equal(canonicalDigest(parentResult),
    PARENT_CATALOG.import_readback_digest);
  assert.equal(parentResult.target_revision_id,
    PARENT_CATALOG.catalog_revision_id);
  assert.equal(parentResult.target_catalog_digest, PARENT_CATALOG.catalog_digest);
  const runtimeConfiguration = {
    schema: 'rus.actor_base_attributes_runtime_world_configuration.v1',
    release_id: 'spatial-v3-production-v12',
    world_revision_id: COMPATIBLE_WORLD.world_revision_id,
    world_catalog_digest: COMPATIBLE_WORLD.world_catalog_digest,
    world_manifest_sha256: COMPATIBLE_WORLD.world_manifest_sha256,
    runtime_contract_digest: ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST
  };
  const compatibilityManifest = buildBaseWorldCompatibilityManifest({
    compatibleWorldRevisionId: COMPATIBLE_WORLD.world_revision_id,
    compatibleWorldCatalogDigest: COMPATIBLE_WORLD.world_catalog_digest,
    sourceRuntimeConfigurationDigest: digestEnvelope(runtimeConfiguration),
    sourceArtifactPaths: [
      'data/world-catalogs/novgorod/spatial-v3/candidates/'
        + 'spatial-v3-production-v6/manifest.json',
      'apps/game-server/src/composition/production-spatial-v3.js',
      'apps/game-server/src/runtime/releases/'
        + 'spatial-v3-production-v12-bindings.js',
      `${ROOT}/candidate.json`
    ],
    sourceCommitSha: SUBJECT_COMMIT,
    validationContractVersion: 'base_world_compatibility_v2'
  });
  const ownerRows = [{
    table_name: 'actor_base_attribute_profiles',
    operation: 'insert',
    row: {
      catalog_revision_id: TARGET_REVISION,
      profile_id: candidate.profile.profile_id,
      profile_digest: candidate.profile_digest,
      profile_payload: candidate.profile,
      status: 'approved'
    }
  }];
  const targetCatalogDigest = canonicalDigest({
    schema: 'rus.actor_base_attributes_catalog_payload.v1',
    catalog_scope: 'actor_base_attributes_v1',
    target_revision_id: TARGET_REVISION,
    parent_catalog: PARENT_CATALOG,
    compatible_world: compatibilityManifest,
    record_registry_digest: ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
    runtime_contract_digest: ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST,
    owner_rows: ownerRows
  });
  const payload = {
    schema: 'rus.actor_base_attributes_import_request.v1',
    version: 1,
    status: 'pending_independent_import_approval',
    subject_commit: SUBJECT_COMMIT,
    catalog_scope: 'actor_base_attributes_v1',
    target_revision_id: TARGET_REVISION,
    target_catalog_digest: targetCatalogDigest,
    parent_catalog: PARENT_CATALOG,
    compatible_world: compatibilityManifest,
    record_registry_digest: ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
    runtime_contract_digest: ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST,
    authoring_approval: {
      candidate_ref: `${ROOT}/candidate.json`,
      candidate_digest: candidate.candidate_digest,
      profile_digest: candidate.profile_digest,
      request_ref: `${ROOT}/approval-request.json`,
      request_digest: authoringRequest.request_digest,
      attestation_ref: `${ROOT}/authoring-approval-attestation.json`,
      attestation_digest: attestation.attestation_digest
    },
    owner_rows: ownerRows,
    import_plan: {
      transaction: 'single_world_base_transaction',
      world_revision: {
        id: TARGET_REVISION,
        parent_revision_id: PARENT_CATALOG.catalog_revision_id,
        catalog_digest: targetCatalogDigest,
        status: 'approved'
      },
      domain_catalog_revision: {
        catalog_revision_id: TARGET_REVISION,
        catalog_scope: 'actor_base_attributes_v1',
        parent_registration_id_source:
          'exact_parent_domain_catalog_revision',
        target_catalog_digest: targetCatalogDigest,
        record_registry_digest:
          ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
        runtime_contract_digest:
          ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST,
        status: 'approved'
      },
      ledger_tables: ['catalog_imports', 'catalog_import_tables',
        'catalog_import_records'],
      activation_event_count: 0
    },
    requested_operations: ['transactional_import', 'exact_readback'],
    authority: {
      authoring_approved: true,
      import_authorized: false,
      runtime_authorized: false,
      activation_authorized: false,
      production_authorized: false,
      equipment_allocation_activation_authorized: false,
      functional_allocation_runtime_selection_authorized: false,
      runtime_item_creation_authorized: false,
      new_development_party_activation_authorized: false,
      existing_party_migration_authorized: false,
      old_save_rematerialization_authorized: false
    },
    independent_import_attestation: null
  };
  return { ...payload, request_digest: canonicalDigest(payload) };
}

export function validateActorBaseAttributesImportRequest(value) {
  const { request_digest: claimed, ...payload } = value ?? {};
  const row = value?.owner_rows?.[0];
  if (claimed !== canonicalDigest(payload)
      || !exact(value, ['schema', 'version', 'status', 'subject_commit',
        'catalog_scope', 'target_revision_id', 'target_catalog_digest',
        'parent_catalog', 'compatible_world', 'record_registry_digest',
        'runtime_contract_digest', 'authoring_approval', 'owner_rows',
        'import_plan', 'requested_operations', 'authority',
        'independent_import_attestation', 'request_digest'])
      || value.schema !== 'rus.actor_base_attributes_import_request.v1'
      || value.version !== 1
      || value.status !== 'pending_independent_import_approval'
      || value.subject_commit !== SUBJECT_COMMIT
      || value.catalog_scope !== 'actor_base_attributes_v1'
      || value.target_revision_id !== TARGET_REVISION
      || canonicalDigest(value.parent_catalog) !== canonicalDigest(PARENT_CATALOG)
      || value.compatible_world?.compatible_world_revision_id !==
        COMPATIBLE_WORLD.world_revision_id
      || value.compatible_world?.compatible_world_catalog_digest !==
        COMPATIBLE_WORLD.world_catalog_digest
      || value.compatible_world?.source_commit_sha !== SUBJECT_COMMIT
      || value.compatible_world?.compatible_world_pin_manifest_digest !==
        canonicalDigest(Object.fromEntries(Object.entries(
          value.compatible_world ?? {}).filter(([key]) =>
          key !== 'compatible_world_pin_manifest_digest')))
      || value.runtime_contract_digest !==
        ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST
      || value.record_registry_digest !==
        ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST
      || value.authoring_approval?.candidate_ref !== `${ROOT}/candidate.json`
      || value.authoring_approval?.candidate_digest !== CANDIDATE_DIGEST
      || value.authoring_approval?.profile_digest !== PROFILE_DIGEST
      || value.authoring_approval?.request_ref !==
        `${ROOT}/approval-request.json`
      || value.authoring_approval?.request_digest !== AUTHORING_REQUEST_DIGEST
      || value.authoring_approval?.attestation_ref !==
        `${ROOT}/authoring-approval-attestation.json`
      || value.authoring_approval?.attestation_digest !==
        AUTHORING_ATTESTATION_DIGEST
      || !Array.isArray(value.owner_rows) || value.owner_rows.length !== 1
      || !exact(row, ['table_name', 'operation', 'row'])
      || !exact(row?.row, ['catalog_revision_id', 'profile_id',
        'profile_digest', 'profile_payload', 'status'])
      || row.table_name !== 'actor_base_attribute_profiles'
      || row.operation !== 'insert'
      || row.row.catalog_revision_id !== TARGET_REVISION
      || row.row.profile_id !== row.row.profile_payload?.profile_id
      || row.row.profile_digest !== PROFILE_DIGEST
      || row.row.profile_digest !== canonicalDigest(row.row.profile_payload)
      || row.row.status !== 'approved'
      || value.target_catalog_digest !== canonicalDigest({
        schema: 'rus.actor_base_attributes_catalog_payload.v1',
        catalog_scope: value.catalog_scope,
        target_revision_id: value.target_revision_id,
        parent_catalog: value.parent_catalog,
        compatible_world: value.compatible_world,
        record_registry_digest: value.record_registry_digest,
        runtime_contract_digest: value.runtime_contract_digest,
        owner_rows: value.owner_rows
      })
      || value.import_plan?.transaction !== 'single_world_base_transaction'
      || !exact(value.import_plan, ['transaction', 'world_revision',
        'domain_catalog_revision', 'ledger_tables',
        'activation_event_count'])
      || !exact(value.import_plan?.world_revision, ['id',
        'parent_revision_id', 'catalog_digest', 'status'])
      || !exact(value.import_plan?.domain_catalog_revision,
        ['catalog_revision_id', 'catalog_scope',
          'parent_registration_id_source', 'target_catalog_digest',
          'record_registry_digest', 'runtime_contract_digest', 'status'])
      || value.import_plan?.world_revision?.id !== TARGET_REVISION
      || value.import_plan?.world_revision?.parent_revision_id !==
        PARENT_CATALOG.catalog_revision_id
      || value.import_plan?.world_revision?.catalog_digest !==
        value.target_catalog_digest
      || value.import_plan?.world_revision?.status !== 'approved'
      || value.import_plan?.domain_catalog_revision?.catalog_revision_id !==
        TARGET_REVISION
      || value.import_plan?.domain_catalog_revision?.catalog_scope !==
        'actor_base_attributes_v1'
      || value.import_plan?.domain_catalog_revision
        ?.parent_registration_id_source !==
          'exact_parent_domain_catalog_revision'
      || value.import_plan?.domain_catalog_revision?.target_catalog_digest !==
        value.target_catalog_digest
      || value.import_plan?.domain_catalog_revision?.record_registry_digest !==
        ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST
      || value.import_plan?.domain_catalog_revision?.runtime_contract_digest !==
        ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST
      || value.import_plan?.domain_catalog_revision?.status !== 'approved'
      || JSON.stringify(value.import_plan?.ledger_tables) !== JSON.stringify([
        'catalog_imports', 'catalog_import_tables', 'catalog_import_records'])
      || value.import_plan?.activation_event_count !== 0
      || JSON.stringify(value.requested_operations) !==
        JSON.stringify(['transactional_import', 'exact_readback'])
      || value.independent_import_attestation !== null
      || !exact(value.authority, ['authoring_approved', 'import_authorized',
        'runtime_authorized', 'activation_authorized',
        'production_authorized',
        'equipment_allocation_activation_authorized',
        'functional_allocation_runtime_selection_authorized',
        'runtime_item_creation_authorized',
        'new_development_party_activation_authorized',
        'existing_party_migration_authorized',
        'old_save_rematerialization_authorized'])
      || value.authority?.authoring_approved !== true
      || Object.entries(value.authority ?? {}).some(([key, authorized]) =>
        key !== 'authoring_approved' && authorized !== false)) {
    throw Object.assign(new Error(
      'ACTOR_BASE_ATTRIBUTES_IMPORT_REQUEST_INVALID'), {
      code: 'ACTOR_BASE_ATTRIBUTES_IMPORT_REQUEST_INVALID'
    });
  }
  return true;
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

async function main(argv) {
  const root = resolve(argv[0] ?? '.');
  const generated = await generateActorBaseAttributesImportRequest(root);
  validateActorBaseAttributesImportRequest(generated);
  const serialized = `${JSON.stringify(generated, null, 2)}\n`;
  if (argv.includes('--check')) {
    assert.equal(await readFile(resolve(root, OUTPUT), 'utf8'), serialized,
      'ACTOR_BASE_ATTRIBUTES_IMPORT_REQUEST_DRIFT');
  } else if (argv.includes('--write')) {
    await writeFile(resolve(root, OUTPUT), serialized, 'utf8');
  } else {
    process.stdout.write(serialized);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
