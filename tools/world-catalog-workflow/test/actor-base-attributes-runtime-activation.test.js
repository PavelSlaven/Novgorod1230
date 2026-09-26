import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import { buildActorBaseAttributesRuntimeActivationRequest,
  validateActorBaseAttributesRuntimeActivationAttestation,
  validatePendingActorBaseAttributesRuntimeActivationRequest } from
  '../../../scripts/generate-actor-base-attributes-runtime-activation-request.mjs';

const requestPath = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1/runtime-activation-v1/request.json';
const attestationPath = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1/runtime-activation-v1/'
  + 'runtime-activation-approval-attestation.json';

test('actor base attributes activation request is deterministic and pending',
  async () => {
    const generated =
      await buildActorBaseAttributesRuntimeActivationRequest();
    const checked = JSON.parse(await readFile(requestPath, 'utf8'));
    assert.deepEqual(generated, checked);
    assert.equal(
      validatePendingActorBaseAttributesRuntimeActivationRequest(checked),
      true);
    assert.deepEqual(Object.entries(checked.requested_permissions)
      .filter(([, value]) => value === true).map(([key]) => key), [
      'activate_actor_base_attributes_runtime_selection_for_new_development_parties_only'
    ]);
    assert.deepEqual(Object.values(checked.authority),
      Object.values(checked.authority).map(() => false));
  });

test('actor base attributes runtime approval is exact and not executed',
  async () => {
    const request = await buildActorBaseAttributesRuntimeActivationRequest();
    const attestation = JSON.parse(await readFile(attestationPath, 'utf8'));
    assert.equal(validateActorBaseAttributesRuntimeActivationAttestation({
      request, attestation
    }), true);
    assert.equal(attestation.activation_executed, false);
    assert.equal(attestation.database_mutated, false);
    assert.equal(attestation.broader_m3_attested, false);
    assert.equal(attestation.authority.runtime_authorized, true);
    assert.equal(attestation.authority.activation_authorized, true);
    assert.equal(attestation.authority
      .actor_base_attributes_runtime_selection_authorized, true);
    assert.equal(attestation.authority
      .new_development_party_activation_authorized, true);
  });

test('actor base attributes runtime approval rejects tamper and widening',
  async () => {
    const request = await buildActorBaseAttributesRuntimeActivationRequest();
    const attestation = JSON.parse(await readFile(attestationPath, 'utf8'));
    const falseAuthority = [
      'import_authorized', 'production_authorized',
      'equipment_allocation_activation_authorized',
      'functional_allocation_runtime_selection_authorized',
      'runtime_item_creation_authorized',
      'existing_party_migration_authorized',
      'old_save_rematerialization_authorized',
      'world_schema_migration_authorized',
      'party_schema_migration_authorized'
    ];
    const cases = [
      ...falseAuthority.map((field) => (value) => {
        value.authority[field] = true;
      }),
      (value) => { value.activation_scope = 'production'; },
      (value) => { value.approved_bindings.target_binding
        .target_catalog_digest = '0'.repeat(64); },
      (value) => { value.activation_executed = true; },
      (value) => { value.database_mutated = true; },
      (value) => { value.broader_m3_attested = true; }
    ];
    for (const mutate of cases) {
      const tampered = structuredClone(attestation);
      mutate(tampered);
      const { attestation_digest: ignored, ...payload } = tampered;
      tampered.attestation_digest = canonicalDigest(payload);
      assert.throws(() =>
        validateActorBaseAttributesRuntimeActivationAttestation({ request,
          attestation: tampered }),
      /ACTOR_BASE_ATTRIBUTES_RUNTIME_ACTIVATION_ATTESTATION_INVALID/u);
    }
  });

test('actor base attributes activation request rejects scope widening',
  async () => {
    const request = await buildActorBaseAttributesRuntimeActivationRequest();
    const cases = [
      (value) => { value.activation_scope = 'production'; },
      (value) => { value.completed_import_readback.result_digest =
        '0'.repeat(64); },
      (value) => { value.target_binding.compatible_world
        .compatible_world_pin_manifest_digest = '0'.repeat(64); },
      (value) => { value.requested_permissions
        .equipment_allocation_activation = true; },
      (value) => { value.authority.activation_authorized = true; }
    ];
    for (const mutate of cases) {
      const tampered = structuredClone(request);
      mutate(tampered);
      const { request_digest: ignored, ...payload } = tampered;
      tampered.request_digest = canonicalDigest(payload);
      assert.throws(() =>
        validatePendingActorBaseAttributesRuntimeActivationRequest(tampered),
      /ACTOR_BASE_ATTRIBUTES_RUNTIME_ACTIVATION_REQUEST_INVALID/u);
    }
  });
