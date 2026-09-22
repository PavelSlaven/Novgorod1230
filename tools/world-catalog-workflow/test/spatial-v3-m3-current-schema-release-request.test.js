import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import {
  buildSpatialV3M3CurrentSchemaReleaseArtifacts,
  validateSpatialV3M3CurrentSchemaReleaseApproval,
  validateSpatialV3M3CurrentSchemaReleaseArtifacts
} from '../../../scripts/generate-spatial-v3-m3-current-schema-release-request.mjs';

const root = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'spatial-v3-m3-current-schema-development-v1';

const attestationPath = `${root}/runtime-approval-attestation.json`;

test('M3 current-schema development release request is deterministic and pending',
  async () => {
    const generated = await buildSpatialV3M3CurrentSchemaReleaseArtifacts();
    const candidate = JSON.parse(await readFile(`${root}/candidate.json`));
    const request = JSON.parse(await readFile(`${root}/approval-request.json`));
    assert.deepEqual(generated, { candidate, request });
    assert.equal(validateSpatialV3M3CurrentSchemaReleaseArtifacts(generated),
      true);
    assert.deepEqual(Object.entries(request.requested_permissions)
      .filter(([, value]) => value).map(([key]) => key),
    ['activate_for_new_development_parties_only']);
    assert.ok(Object.values(request.authority).every((value) => !value));
    assert.equal(candidate.activation_executed, false);
    assert.equal(candidate.database_mutated, false);
  });

test('M3 current-schema release request rejects mutation and scope widening',
  async () => {
    const artifacts = await buildSpatialV3M3CurrentSchemaReleaseArtifacts();
    const cases = [
      (value) => { value.candidate.proposed_release.release_id =
        'spatial-v3-development-v13'; },
      (value) => { value.candidate.compatible_world.world_catalog_digest =
        '0'.repeat(64); },
      (value) => { value.candidate.preserved_actor_approval_chain
        .world_owner_migration.migration_digest = '0'.repeat(64); },
      (value) => { value.candidate.preserved_actor_approval_chain
        .activation_attestation_ref = 'invented-attestation.json'; },
      (value) => { value.request.requested_permissions.production_activation =
        true; },
      (value) => { value.request.requested_permissions.runtime_item_creation =
        true; },
      (value) => { value.request.requested_permissions
        .functional_allocation_runtime_selection = true; },
      (value) => { value.request.authority.activation_authorized = true; },
      (value) => { value.candidate.activation_executed = true; },
      (value) => { value.request.hidden_authority = true; }
    ];
    for (const mutate of cases) {
      const value = structuredClone(artifacts);
      mutate(value);
      refreshDigest(value.candidate, 'candidate_digest');
      value.request.candidate_digest = value.candidate.candidate_digest;
      refreshDigest(value.request, 'request_digest');
      assert.throws(() =>
        validateSpatialV3M3CurrentSchemaReleaseArtifacts(value),
      /SPATIAL_V3_M3_CURRENT_SCHEMA_RELEASE_REQUEST_INVALID/u);
    }
  });

test('M3 current-schema development release approval is exact and not executed',
  async () => {
    const artifacts = await buildSpatialV3M3CurrentSchemaReleaseArtifacts();
    const attestation = JSON.parse(await readFile(attestationPath, 'utf8'));
    assert.equal(validateSpatialV3M3CurrentSchemaReleaseApproval({
      ...artifacts, attestation
    }), true);
    assert.deepEqual(Object.entries(attestation.approved_permissions)
      .filter(([, value]) => value).map(([key]) => key), [
      'transactional_registration_activation_readback_for_new_development_parties_only'
    ]);
    assert.equal(attestation.activation_executed, false);
    assert.equal(attestation.database_mutated, false);
    assert.equal(attestation.actor_migrations_executed, false);
    assert.equal(attestation.party_pins_written, false);
    assert.equal(attestation.gameplay_writes_performed, false);
    assert.equal(attestation.broader_m3_attested, false);
  });

test('M3 current-schema development release approval rejects tamper and widening',
  async () => {
    const artifacts = await buildSpatialV3M3CurrentSchemaReleaseArtifacts();
    const attestation = JSON.parse(await readFile(attestationPath, 'utf8'));
    const cases = [
      (value) => { value.approved_bindings.release.release_id =
        'spatial-v3-development-v13'; },
      (value) => { value.approved_bindings.compatible_world
        .world_manifest_sha256 = '0'.repeat(64); },
      (value) => { value.approved_bindings.preserved_actor_approval_chain
        .activation_result_digest = '0'.repeat(64); },
      (value) => { value.approved_permissions.production_activation = true; },
      (value) => { value.approved_permissions
        .actor_world_owner_migration_execution = true; },
      (value) => { value.approved_permissions.gameplay_writes = true; },
      (value) => { value.authority.production_authorized = true; },
      (value) => { value.activation_executed = true; },
      (value) => { value.database_mutated = true; },
      (value) => { value.party_pins_written = true; },
      (value) => { value.hidden_authority = true; }
    ];
    for (const mutate of cases) {
      const tampered = structuredClone(attestation);
      mutate(tampered);
      refreshDigest(tampered, 'attestation_digest');
      assert.throws(() =>
        validateSpatialV3M3CurrentSchemaReleaseApproval({
          ...artifacts, attestation: tampered
        }),
      /SPATIAL_V3_M3_CURRENT_SCHEMA_RELEASE_APPROVAL_ATTESTATION_INVALID/u);
    }
  });

function refreshDigest(value, field) {
  const { [field]: ignored, ...payload } = value;
  value[field] = canonicalDigest(payload);
}
