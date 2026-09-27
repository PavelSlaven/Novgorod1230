import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { activateGate1RuntimeCatalog } from
  '../../runtime-catalog-activation/src/gate1-runtime-activation.js';
import {
  assertGate1ActivationAmendmentV2Attestation,
  buildGate1ActivationAmendmentRequest,
  GATE1_ACTIVATION_AMENDMENT_V1_REQUEST_DIGEST,
  GATE1_ACTIVATION_AMENDMENT_V1_REQUEST_PATH,
  validateGate1RuntimeActivationAttestation,
  validatePendingGate1ActivationAmendment
} from
  '../../../scripts/generate-gate1-activation-amendment-request.mjs';

const requestPath = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/activation-amendment-v2/request.json';
const v1RequestPath = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/activation-amendment-v1/request.json';
const v1AttestationPath = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/activation-amendment-v1/'
  + 'runtime-activation-approval-attestation.json';

test('Gate1 activation amendment reproduces exact checked pending request',
  async () => {
    const generated = await buildGate1ActivationAmendmentRequest();
    const checked = JSON.parse(await readFile(requestPath, 'utf8'));
    assert.deepEqual(generated, checked);
    assert.equal(validatePendingGate1ActivationAmendment(generated), true);
    assert.equal(generated.predecessor.request_digest,
      '81435027867fdc0060c117c0afaa4b20ed6cb3650a4f6067855c15e299457f29');
    assert.equal(generated.completed_import_readback.restart_verified, true);
    assert.equal(generated.completed_import_readback
      .requests_new_import_authority, false);
    assert.equal(generated.supersedes.path,
      GATE1_ACTIVATION_AMENDMENT_V1_REQUEST_PATH);
    assert.equal(generated.supersedes.request_digest,
      GATE1_ACTIVATION_AMENDMENT_V1_REQUEST_DIGEST);
    assert.equal(generated.completed_import_readback.restart_verification
      .sha256,
      '1235aa3108555fcabf9622436e8651b1eb7ea77abde7f4e31f4b3bc8f6b57074');
  });

test('pending amendment requests only new-development activation authority',
  async () => {
    const request = await buildGate1ActivationAmendmentRequest();
    assert.deepEqual(Object.entries(request.requested_permissions)
      .filter(([, value]) => value === true).map(([key]) => key),
    ['activate_for_new_development_parties_only']);
    assert.deepEqual(Object.values(request.authority),
      Object.values(request.authority).map(() => false));
    for (const field of ['import_approved_item_container_catalog',
      'production_activation', 'existing_party_migration',
      'old_save_rematerialization',
      'authoring_only_functional_allocation_runtime_selection',
      'runtime_item_creation']) {
      assert.equal(request.requested_permissions[field], false);
    }
  });

test('activation amendment validation fails closed on scope or chain widening',
  async () => {
    const request = await buildGate1ActivationAmendmentRequest();
    const cases = [
      (value) => { value.completed_import_readback.restart_verified = false; },
      (value) => { value.predecessor.request_digest = '0'.repeat(64); },
      (value) => {
        value.requested_permissions.import_approved_item_container_catalog =
          true;
      },
      (value) => {
        value.supersedes.request_digest = '0'.repeat(64);
      }
    ];
    for (const mutate of cases) {
      const widened = structuredClone(request);
      mutate(widened);
      assert.throws(() => validatePendingGate1ActivationAmendment(widened),
        /GATE1_ACTIVATION_AMENDMENT_INVALID/u);
    }
    const authorized = structuredClone(request);
    authorized.authority.activation_authorized = true;
    assert.throws(() => validatePendingGate1ActivationAmendment(authorized),
      /GATE1_ACTIVATION_AMENDMENT_AUTHORITY_FORBIDDEN/u);
  });

test('sealed v1 runtime attestation remains exact historical archive',
  async () => {
    const request = JSON.parse(await readFile(v1RequestPath, 'utf8'));
    const attestation = JSON.parse(await readFile(v1AttestationPath, 'utf8'));
    assert.equal(validateGate1RuntimeActivationAttestation({ request,
      attestation }), true);
    assert.equal(request.request_digest,
      GATE1_ACTIVATION_AMENDMENT_V1_REQUEST_DIGEST);
    assert.equal(attestation.activation_executed, false);
    assert.equal(attestation.database_mutated, false);
    assert.equal(attestation.authority.activation_authorized, true);
    assert.equal(attestation.authority
      .new_development_party_activation_authorized, true);
    for (const field of ['import_authorized', 'production_authorized',
      'existing_party_migration_authorized',
      'old_save_rematerialization_authorized',
      'authoring_only_functional_allocation_runtime_selection',
      'runtime_item_creation_authorized']) {
      assert.equal(attestation.authority[field], false);
      const widened = structuredClone(attestation);
      widened.authority[field] = true;
      assert.throws(() => validateGate1RuntimeActivationAttestation({ request,
        attestation: widened }),
      /GATE1_RUNTIME_ACTIVATION_ATTESTATION_INVALID/u);
    }
    for (const mutate of [
      (value) => { value.activation_scope = 'production'; },
      (value) => { value.approved_bindings.target_catalog.catalog_digest =
        '0'.repeat(64); },
      (value) => { value.restart_evidence.verified = false; },
      (value) => { value.restart_evidence.managed_postgresql_result =
        'failed'; },
      (value) => { value.activation_executed = true; }
    ]) {
      const tampered = structuredClone(attestation);
      mutate(tampered);
      assert.throws(() => validateGate1RuntimeActivationAttestation({ request,
        attestation: tampered }),
      /GATE1_RUNTIME_ACTIVATION_ATTESTATION_INVALID/u);
    }
  });

test('Gate1 activation amendment v2 refuses missing attestation',
  async () => {
    const request = await buildGate1ActivationAmendmentRequest();
    assert.throws(() => assertGate1ActivationAmendmentV2Attestation(request,
      null),
    /GATE1_ACTIVATION_AMENDMENT_ATTESTATION_V2_REQUIRED/u);
    await assert.rejects(() => activateGate1RuntimeCatalog({
      worldPool: {},
      partyPool: {},
      repositoryRoot: process.cwd(),
      worldReleaseId: 'spatial-v3-production-v5'
    }), (error) => {
      assert.equal(error.code,
        'GATE1_ACTIVATION_AMENDMENT_ATTESTATION_V2_REQUIRED');
      return true;
    });
  });
