import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateActorBaseAttributesActivationResult } from
  '../src/actor-base-attributes-activation.js';

const ROOT = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1/runtime-activation-v1';

test('tracked actor activation result binds exact narrow authority',
  async () => {
    const [request, attestation, result] = await Promise.all([
      json(`${ROOT}/request.json`),
      json(`${ROOT}/runtime-activation-approval-attestation.json`),
      json(`${ROOT}/activation-readback-result.json`)
    ]);
    assert.equal(validateActorBaseAttributesActivationResult({ result,
      request, attestation }), true);
    assert.equal(result.activation_scope, 'new_development_parties_only');
    assert.equal(result.runtime_authorized, true);
    assert.equal(result.equipment_allocation_activation_authorized, false);
    assert.equal(result.runtime_item_creation_authorized, false);
    assert.equal(result.broader_m3_attested, false);
    assert.throws(() => validateActorBaseAttributesActivationResult({
      result: { ...result, production_authorized: true },
      request, attestation
    }), { code: 'ACTOR_BASE_ATTRIBUTES_ACTIVATION_RESULT_INVALID' });
  });

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
