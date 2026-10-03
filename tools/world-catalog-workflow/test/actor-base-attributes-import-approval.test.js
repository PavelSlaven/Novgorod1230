import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import {
  loadActorBaseAttributesImportApproval,
  validateActorBaseAttributesImportApproval
} from '../../../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/validate-import-approval.mjs';

test('actor base attributes approval grants exact import/readback only',
  async () => {
    const artifacts = await loadActorBaseAttributesImportApproval();
    assert.equal(validateActorBaseAttributesImportApproval(artifacts), true);
    assert.equal(artifacts.attestation.authority.import_authorized, true);
    assert.equal(artifacts.attestation.authority
      .transactional_import_readback_only, true);
    assert.equal(artifacts.attestation.authority.exact_readback_required, true);
    for (const [field, value] of Object.entries(
      artifacts.attestation.authority)) {
      if (['authoring_approved', 'import_authorized',
        'transactional_import_readback_only',
        'exact_readback_required'].includes(field)) continue;
      assert.equal(value, false, field);
    }
    assert.equal(artifacts.attestation.database_mutated, false);
    assert.equal(artifacts.attestation.activation_request, null);
    assert.equal(artifacts.request.independent_import_attestation, null);
  });

test('actor base attributes import approval rejects resealed scope tamper',
  async () => {
    const artifacts = await loadActorBaseAttributesImportApproval();
    for (const mutate of [
      (value) => { value.request_digest = '0'.repeat(64); },
      (value) => { value.target_binding.record_registry_digest =
        '0'.repeat(64); },
      (value) => { value.owner_scope.profile_digest = '0'.repeat(64); },
      (value) => { value.import_scope.requested_operations.push('activate'); },
      (value) => { value.authority.runtime_authorized = true; },
      (value) => { value.authority.world_schema_migration_authorized = true; },
      (value) => { value.database_mutated = true; },
      (value) => { value.activation_request = {}; }
    ]) {
      const tampered = structuredClone(artifacts);
      mutate(tampered.attestation);
      const { attestation_digest: ignored, ...core } = tampered.attestation;
      tampered.attestation.attestation_digest = canonicalDigest(core);
      assert.throws(() => validateActorBaseAttributesImportApproval(tampered),
        /ACTOR_BASE_ATTRIBUTES_IMPORT_APPROVAL_INVALID/u);
    }
  });
