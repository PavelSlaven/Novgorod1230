import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildGate1ActivationAmendmentRequest,
  validatePendingGate1ActivationAmendment } from
  '../../../scripts/generate-gate1-activation-amendment-request.mjs';

const requestPath = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/activation-amendment-v1/request.json';

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
