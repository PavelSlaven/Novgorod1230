import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import { buildActorBaseAttributesRuntimeActivationRequest,
  validatePendingActorBaseAttributesRuntimeActivationRequest } from
  '../../../scripts/generate-actor-base-attributes-runtime-activation-request.mjs';

const requestPath = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1/runtime-activation-v1/request.json';

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
