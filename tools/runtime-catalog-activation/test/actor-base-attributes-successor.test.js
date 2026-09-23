import assert from 'node:assert/strict';
import test from 'node:test';
import { digestEnvelope } from '../src/artifact-contracts.js';
import { buildActorBaseAttributesSuccessorImportRequest,
  validateActorBaseAttributesSuccessorImportApproval,
  buildActorBaseAttributesSuccessorPreflight } from '../src/actor-base-attributes-successor.js';
import { runActorBaseAttributesImport } from '../../../scripts/run-actor-base-attributes-import.mjs';

test('actor successor requires exact parent, reviewed import-only approval and preserves historical artifacts', async () => {
  const request = buildActorBaseAttributesSuccessorImportRequest({
    subjectCommit: 'a'.repeat(40), parentCatalog: {
      catalog_scope: 'item_container_materialization_v2',
      catalog_revision_id: 'item_container_spatial_v3_target_001',
      catalog_digest: 'b'.repeat(64), import_readback_ref: 'test-only:readback',
      import_readback_digest: 'c'.repeat(64), compatible_world_pin_manifest_digest: 'd'.repeat(64)
    }
  });
  const payload = { schema: 'rus.actor_base_attributes_successor_import_attestation.v1',
    request_digest: request.request_digest,
    decision: 'approve_exact_actor_base_attributes_successor_import',
    reviewed_repository_head: request.subject_commit,
    attested_by: 'unit-test-only', independence_basis: 'unit test fixture', database_mutated: false,
    authority: { import_authorized: true, activation_authorized: false,
      production_authorized: false, existing_party_migration_authorized: false,
      old_save_rematerialization_authorized: false } };
  const attestation = { ...payload, attestation_digest: digestEnvelope(payload) };
  assert.equal(validateActorBaseAttributesSuccessorImportApproval({ request, attestation }), true);
  assert.throws(() => validateActorBaseAttributesSuccessorImportApproval({ request, attestation: null }));
  const changed = structuredClone(request);
  changed.owner_rows[0].row.profile_payload.ordinary_array[0] = 99;
  const { request_digest: ignored, ...changedPayload } = changed;
  changed.request_digest = digestEnvelope(changedPayload);
  assert.throws(() => validateActorBaseAttributesSuccessorImportApproval({ request: changed, attestation }));
  const production = { ...payload, authority: { ...payload.authority, production_authorized: true } };
  assert.throws(() => validateActorBaseAttributesSuccessorImportApproval({ request,
    attestation: { ...production, attestation_digest: digestEnvelope(production) } }));
  await assert.rejects(runActorBaseAttributesImport({ databaseUrl: 'unused',
    approval: { request, attestation }, resultPath: 'data/world-catalogs/novgorod/'
      + 'procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/import-readback-result.json'
  }), /ACTOR_SUCCESSOR_HISTORICAL_RESULT_PATH_FORBIDDEN/u);
  assert.deepEqual(buildActorBaseAttributesSuccessorPreflight({
    party_count: 2, pinned_party_count: 2, missing_domain_pin_count: 0, inflight_count: 0
  }), { party_count: 2, pinned_party_count: 2, missing_domain_pin_count: 0, inflight_count: 0 });
  assert.throws(() => buildActorBaseAttributesSuccessorPreflight({
    party_count: 2, pinned_party_count: 1, missing_domain_pin_count: 1, inflight_count: 0
  }), { code: 'ACTIVATION_PARTY_PREFLIGHT_BLOCKED' });
});
