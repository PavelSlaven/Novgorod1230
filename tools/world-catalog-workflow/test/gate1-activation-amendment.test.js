import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  activateGate1RuntimeCatalog,
  assertGate1Authority
} from
  '../../runtime-catalog-activation/src/gate1-runtime-activation.js';
import {
  assertGate1ActivationAmendmentV2Attestation,
  assertGate1ActivationAmendmentV3Attestation,
  buildGate1ActivationAmendmentRequest,
  GATE1_ACTIVATION_AMENDMENT_V1_REQUEST_DIGEST,
  GATE1_ACTIVATION_AMENDMENT_V1_REQUEST_PATH,
  GATE1_ACTIVATION_AMENDMENT_V2_ATTESTATION_PATH,
  GATE1_ACTIVATION_AMENDMENT_V2_REQUEST_DIGEST,
  GATE1_ACTIVATION_AMENDMENT_V2_REQUEST_PATH,
  GATE1_ACTIVATION_AMENDMENT_V3_ATTESTATION_PATH,
  GATE1_ACTIVATION_AMENDMENT_V3_REQUEST_PATH,
  validateGate1RuntimeActivationAttestation,
  validatePendingGate1ActivationAmendment
} from
  '../../../scripts/generate-gate1-activation-amendment-request.mjs';

const requestPath = GATE1_ACTIVATION_AMENDMENT_V3_REQUEST_PATH;
const attestationPath = GATE1_ACTIVATION_AMENDMENT_V3_ATTESTATION_PATH;
const v1RequestPath = GATE1_ACTIVATION_AMENDMENT_V1_REQUEST_PATH;
const v2RequestPath = GATE1_ACTIVATION_AMENDMENT_V2_REQUEST_PATH;
const v2AttestationPath = GATE1_ACTIVATION_AMENDMENT_V2_ATTESTATION_PATH;
const v1AttestationPath = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/activation-amendment-v1/'
  + 'runtime-activation-approval-attestation.json';
const importReadbackPath = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/import-readback-result.json';
const V2_RESTART_SHA =
  '1235aa3108555fcabf9622436e8651b1eb7ea77abde7f4e31f4b3bc8f6b57074';
const V3_RESTART_SHA =
  '67c08266fd5bf8a225f6aad1cf2b0227433b03f026f6d14c7484d37422c28601';

async function loadV3Request() {
  return JSON.parse(await readFile(requestPath, 'utf8'));
}

async function loadV3Pair() {
  return {
    request: JSON.parse(await readFile(requestPath, 'utf8')),
    attestation: JSON.parse(await readFile(attestationPath, 'utf8')),
    result: JSON.parse(await readFile(importReadbackPath, 'utf8'))
  };
}

test('Gate1 activation amendment reproduces exact checked pending request',
  async () => {
    const generated = await buildGate1ActivationAmendmentRequest();
    const checked = await loadV3Request();
    assert.deepEqual(generated, checked);
    assert.equal(validatePendingGate1ActivationAmendment(generated), true);
    assert.equal(generated.predecessor.request_digest,
      '81435027867fdc0060c117c0afaa4b20ed6cb3650a4f6067855c15e299457f29');
    assert.equal(generated.completed_import_readback.restart_verified, true);
    assert.equal(generated.completed_import_readback
      .requests_new_import_authority, false);
    assert.equal(generated.supersedes.path,
      GATE1_ACTIVATION_AMENDMENT_V2_REQUEST_PATH);
    assert.equal(generated.supersedes.request_digest,
      GATE1_ACTIVATION_AMENDMENT_V2_REQUEST_DIGEST);
    assert.notEqual(generated.completed_import_readback.restart_verification
      .sha256, V2_RESTART_SHA);
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

test('sealed v2 runtime attestation remains exact historical archive',
  async () => {
    const request = JSON.parse(await readFile(v2RequestPath, 'utf8'));
    const attestation = JSON.parse(await readFile(v2AttestationPath, 'utf8'));
    assert.equal(validateGate1RuntimeActivationAttestation({ request,
      attestation }), true);
    assert.equal(assertGate1ActivationAmendmentV2Attestation(request,
      attestation), true);
    assert.equal(request.request_digest,
      GATE1_ACTIVATION_AMENDMENT_V2_REQUEST_DIGEST);
    assert.equal(attestation.restart_evidence.verification.sha256,
      V2_RESTART_SHA);
    const v3Request = await loadV3Request();
    assert.throws(() => validateGate1RuntimeActivationAttestation({ request:
      v3Request, attestation }),
    /GATE1_RUNTIME_ACTIVATION_ATTESTATION_INVALID/u);
  });

test('runtime attestation v3 approves only exact new-development activation',
  async () => {
    const { request, attestation, result } = await loadV3Pair();
    assert.equal(validateGate1RuntimeActivationAttestation({ request,
      attestation }), true);
    assert.equal(assertGate1ActivationAmendmentV3Attestation(request,
      attestation), true);
    assertGate1Authority({
      request,
      attestation,
      result,
      worldReleaseId: 'spatial-v3-production-v5'
    });
    assert.equal(attestation.activation_amendment_request_digest,
      request.request_digest);
    assert.equal(attestation.activation_executed, false);
    assert.equal(attestation.database_mutated, false);
    assert.equal(attestation.restart_evidence.verification.sha256,
      V3_RESTART_SHA);

    for (const mutate of [
      (value) => {
        value.status = 'approved_production_not_executed';
      },
      (value) => { value.activation_executed = true; },
      (value) => {
        value.activation_amendment_request_digest = '0'.repeat(64);
      },
      (value) => {
        value.restart_evidence.verification.sha256 = V2_RESTART_SHA;
      },
      (value) => {
        value.approved_permissions.production_activation = true;
      }
    ]) {
      const tampered = structuredClone(attestation);
      mutate(tampered);
      assert.throws(() => validateGate1RuntimeActivationAttestation({ request,
        attestation: tampered }),
      /GATE1_RUNTIME_ACTIVATION_ATTESTATION_(INVALID|DIGEST_INVALID)/u);
      assert.throws(() => assertGate1Authority({
        request,
        attestation: tampered,
        result,
        worldReleaseId: 'spatial-v3-production-v5'
      }),
      /GATE1_RUNTIME_ACTIVATION_ATTESTATION_(INVALID|DIGEST_INVALID)/u);
    }

    const v2Attestation = JSON.parse(await readFile(v2AttestationPath,
      'utf8'));
    assert.throws(() => validateGate1RuntimeActivationAttestation({ request,
      attestation: v2Attestation }),
    /GATE1_RUNTIME_ACTIVATION_ATTESTATION_INVALID/u);
  });

test('Gate1 activation amendment v3 refuses missing attestation',
  async () => {
    const request = await buildGate1ActivationAmendmentRequest();
    assert.throws(() => assertGate1ActivationAmendmentV3Attestation(request,
      null),
    /GATE1_ACTIVATION_AMENDMENT_ATTESTATION_V3_REQUIRED/u);
    const tmp = await mkdtemp(join(tmpdir(), 'gate1-amendment-v3-'));
    try {
      const relDir = join(tmp,
        'data/world-catalogs/novgorod/runtime-catalog/'
        + 'gate1-owner-data-v1/activation-amendment-v3');
      await mkdir(relDir, { recursive: true });
      await copyFile(requestPath, join(tmp, requestPath));
      await assert.rejects(() => activateGate1RuntimeCatalog({
        worldPool: {},
        partyPool: {},
        repositoryRoot: tmp,
        worldReleaseId: 'spatial-v3-production-v5'
      }), (error) => {
        assert.equal(error.code,
          'GATE1_ACTIVATION_AMENDMENT_ATTESTATION_V3_REQUIRED');
        return true;
      });
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
