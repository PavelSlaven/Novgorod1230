import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';
import {
  loadActorBaseAttributesAuthoringArtifacts,
  validateActorBaseAttributesAuthoringAttestation
} from '../../../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/validate.mjs';

test('actor base attributes attestation approves authoring only', async () => {
  const artifacts = await loadActorBaseAttributesAuthoringArtifacts();
  assert.equal(validateActorBaseAttributesAuthoringAttestation(artifacts), true);
  assert.equal(artifacts.attestation.authority.authoring_approved, true);
  for (const [field, value] of Object.entries(
    artifacts.attestation.authority)) {
    if (field === 'authoring_approved') continue;
    assert.equal(value, false, field);
    const widened = structuredClone(artifacts);
    widened.attestation.authority[field] = true;
    assert.throws(() => validateActorBaseAttributesAuthoringAttestation(
      widened), /ACTOR_BASE_ATTRIBUTES_AUTHORING_ATTESTATION_INVALID/u);
  }
  assert.equal(artifacts.attestation.activation_request, null);
  const denied = structuredClone(artifacts);
  denied.attestation.authority.authoring_approved = false;
  assert.throws(() => validateActorBaseAttributesAuthoringAttestation(denied),
    /ACTOR_BASE_ATTRIBUTES_AUTHORING_ATTESTATION_INVALID/u);
});

test('actor base attributes attestation rejects resealed scope tamper',
  async () => {
    const artifacts = await loadActorBaseAttributesAuthoringArtifacts();
    for (const mutate of [
      (value) => { value.candidate_digest = '0'.repeat(64); },
      (value) => { value.approved_scope.ordinary_array[0] = 14; },
      (value) => { value.source_bindings.task_attachment_sha256 =
        '0'.repeat(64); },
      (value) => { value.activation_request = {}; }
    ]) {
      const tampered = structuredClone(artifacts);
      mutate(tampered.attestation);
      const { attestation_digest: ignored, ...core } = tampered.attestation;
      tampered.attestation.attestation_digest = canonicalDigest(core);
      assert.throws(() => validateActorBaseAttributesAuthoringAttestation(
        tampered), /ACTOR_BASE_ATTRIBUTES_AUTHORING_ATTESTATION_INVALID/u);
    }
  });
