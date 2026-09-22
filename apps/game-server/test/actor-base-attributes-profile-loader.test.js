import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import { canonicalStringify, computeCanonicalRecordDigest,
  computeImportAuditDigest, computeRecordsDigest, computeTablePayloadDigest,
  computeTablesDigest, projectCanonicalRecord } from '@rus/runtime-catalog';
import { ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY,
  ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
  ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST } from
  '@rus/runtime-catalog/runtime-contract';
import {
  ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE,
  loadActiveActorBaseAttributesProfile
} from '../src/infrastructure/postgres/actor-base-attributes-profile-loader.js';

const digest = (character) => character.repeat(64);
const profile = Object.freeze({
  schema: 'rus.actor_base_attributes_profile.v1',
  version: 1,
  profile_id: 'ordinary-v1',
  algorithm_version: 'actor_base_attributes_v1',
  rng_version: 'mulberry32_v1',
  ordinary_array: [13, 12, 11, 10, 9, 8],
  occupation_archetype_priorities: []
});
const profileRow = Object.freeze({
  catalog_revision_id: 'attributes-v1',
  profile_id: profile.profile_id,
  profile_digest: canonicalDigest(profile),
  profile_payload: profile,
  status: 'approved'
});
const entry = ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY.entries[0];
const canonicalPayload = projectCanonicalRecord({
  registryEntry: entry,
  row: profileRow
});
const record = Object.freeze({
  import_id: 'import-1',
  table_name: entry.table_name,
  record_key: canonicalStringify(canonicalPayload.record_key),
  operation_kind: 'insert',
  canonical_payload: canonicalPayload,
  record_digest: computeCanonicalRecordDigest(canonicalPayload),
  ordinal: 0
});
const table = Object.freeze({
  import_id: record.import_id,
  table_name: entry.table_name,
  payload_digest: computeTablePayloadDigest([record]),
  record_count: 1,
  dependency_order: entry.dependency_order,
  insert_count: 1,
  assert_existing_count: 0
});
const importRootPayload = {
  import_id: record.import_id,
  catalog_scope: ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE,
  parent_revision_id: 'parent-v1',
  parent_catalog_digest: digest('1'),
  parent_snapshot_manifest_digest: digest('2'),
  compatible_world_revision_id: 'world-v1',
  compatible_world_catalog_digest: digest('3'),
  compatible_world_pin_manifest_digest: digest('4'),
  target_revision_id: profileRow.catalog_revision_id,
  target_catalog_digest: digest('5'),
  record_registry_digest: ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
  promotion_manifest_digest: digest('6'),
  approval_request_digest: digest('7'),
  approval_attestation_digest: digest('8'),
  schema_migration_digest: digest('9'),
  tables_digest: computeTablesDigest([table]),
  records_digest: computeRecordsDigest([record]),
  dependency_assertions_semantic_digest: digest('a'),
  dependency_assertions_audit_digest: digest('b'),
  imported_by: 'runtime_catalog_importer',
  imported_at: '2026-09-22T00:00:00.000000Z'
};
const importRoot = Object.freeze({
  ...importRootPayload,
  import_audit_digest: computeImportAuditDigest(importRootPayload),
  import_approval_status: 'approved'
});
const activationEnvelope = Object.freeze({
  schema: 'rus.runtime_catalog_activation_event.v2',
  event_sequence: 1,
  event_type: 'activate',
  catalog_scope: ACTOR_BASE_ATTRIBUTES_CATALOG_SCOPE,
  catalog_revision_id: profileRow.catalog_revision_id,
  catalog_digest: importRoot.target_catalog_digest,
  import_id: importRoot.import_id,
  import_audit_digest: importRoot.import_audit_digest,
  record_registry_digest: ACTOR_BASE_ATTRIBUTES_OWNER_REGISTRY_DIGEST,
  runtime_contract_digest: ACTOR_BASE_ATTRIBUTES_RUNTIME_CONTRACT_DIGEST,
  compatible_world_revision_id: importRoot.compatible_world_revision_id,
  compatible_world_catalog_digest: importRoot.compatible_world_catalog_digest,
  compatible_world_pin_manifest_digest:
    importRoot.compatible_world_pin_manifest_digest,
  request_digest: digest('c'),
  attestation_digest: digest('d'),
  expected_previous_event_id: null,
  runtime_release_id: 'runtime-release-v1',
  operator_principal: 'test'
});
const activationDigest = canonicalDigest(activationEnvelope);
const activation = Object.freeze({
  ...activationEnvelope,
  event_digest: activationDigest,
  event_id: `runtime_catalog_activation_${activationDigest.slice(0, 32)}`
});
const revision = Object.freeze({
  catalog_revision_id: activation.catalog_revision_id,
  catalog_scope: activation.catalog_scope,
  target_catalog_digest: activation.catalog_digest,
  compatible_world_revision_id: activation.compatible_world_revision_id,
  compatible_world_catalog_digest: activation.compatible_world_catalog_digest,
  compatible_world_pin_manifest_digest:
    activation.compatible_world_pin_manifest_digest,
  record_registry_digest: activation.record_registry_digest,
  runtime_contract_digest: activation.runtime_contract_digest,
  status: 'approved'
});

function pool({ activations = [activation], revisions = [revision],
  imports = [importRoot], tables = [table], records = [record],
  profiles = [profileRow] } = {}) {
  let call = 0;
  const rows = [activations, revisions, imports, tables, records, profiles];
  return { async query() { return { rows: rows[call++] }; } };
}

test('actor profile loader returns only exact active import membership',
  async () => {
    const loaded = await loadActiveActorBaseAttributesProfile(pool());
    assert.equal(loaded.catalog_revision_id, profileRow.catalog_revision_id);
    assert.equal(loaded.profile_digest, profileRow.profile_digest);
    assert.notEqual(loaded.profile, profile);
    assert.deepEqual(loaded.profile, profile);
  });

test('actor profile loader rejects missing, extra, and drifted membership',
  async () => {
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(pool({
      activations: []
    })), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP' });
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(pool({
      profiles: [{ ...profileRow, profile_digest: digest('d') }]
    })), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(pool({
      profiles: [profileRow, { ...profileRow, profile_id: 'late-extra' }]
    })), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(pool({
      records: [record, { ...record, record_key: 'late-extra', ordinal: 1 }]
    })), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(pool({
      revisions: [{ ...revision, compatible_world_catalog_digest: digest('c') }]
    })), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(pool({
      imports: [{ ...importRoot, promotion_manifest_digest: digest('d') }]
    })), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
  });

test('actor profile loader rejects tampered activation event envelope',
  async () => {
    await assert.rejects(() => loadActiveActorBaseAttributesProfile(pool({
      activations: [{ ...activation, request_digest: digest('e') }]
    })), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID' });
  });

test('actor profile loader maps absent owner schema to typed data gap',
  async () => {
    await assert.rejects(() => loadActiveActorBaseAttributesProfile({
      async query() {
        throw Object.assign(new Error('missing'), { code: '42P01' });
      }
    }), { code: 'ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_DATA_GAP' });
  });
