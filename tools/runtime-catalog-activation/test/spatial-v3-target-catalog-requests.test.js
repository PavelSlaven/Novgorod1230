import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateActorBaseAttributesImportRequest } from
  '../../../scripts/generate-actor-base-attributes-import-request.mjs';
import { digestEnvelope } from '../src/artifact-contracts.js';
import { buildSpatialV3TargetCatalogRequests,
  TARGET_CATALOG_REQUEST_DIRECTORY } from
  '../src/spatial-v3-target-catalog-requests.js';

const root = resolve(import.meta.dirname, '../../..');
const read = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));

test('target requests reproduce pending exact source bindings without activation authority',
  async () => {
    const tracked = await read(`${TARGET_CATALOG_REQUEST_DIRECTORY}/item-compatibility-request.json`);
    const artifacts = await buildSpatialV3TargetCatalogRequests({
      repositoryRoot: root, subjectCommit: tracked.subject_commit
    });
    for (const [name, request] of Object.entries(artifacts)) {
      assert.deepEqual(request, await read(`${TARGET_CATALOG_REQUEST_DIRECTORY}/${name}`));
      assert.equal(request.status, 'pending_independent_compatibility_approval');
      assert.equal(request.runtime_configuration.release_id, 'spatial-v3-production-v17');
      assert.equal(request.compatible_world.compatible_world_revision_id,
        'novgorod_spatial_v3_target_contract_approval_001');
      assert.equal(request.compatible_world.compatible_world_catalog_digest,
        '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e');
      assert.equal(request.runtime_pin, null);
      assert.equal(request.target_catalog_digest, null);
      assert.equal(request.independent_approval_attestation, null);
      assert.ok(Object.values(request.authority).every((value) => value === false));
      const { request_digest: digest, ...payload } = request;
      assert.equal(digest, digestEnvelope(payload));
    }
    const item = artifacts['item-compatibility-request.json'];
    const actor = artifacts['actor-compatibility-request.json'];
    assert.equal(actor.parent_catalog.catalog_revision_id, item.target_revision_id);
    assert.equal(actor.parent_catalog.compatibility_request_digest, item.request_digest);
    assert.equal(actor.parent_catalog.catalog_digest, null);
    assert.equal(actor.parent_catalog.import_readback, null);
    assert.equal(actor.historical_activation.live_predecessor_verified, false);
    assert.equal(actor.operational_import_request, null);
    assert.equal(actor.operational_activation_request, null);
    const historical = await read('data/world-catalogs/novgorod/procedural-scene-v2/'
      + 'actor-base-attributes-v1/runtime-import-v1/request.json');
    assert.deepEqual(actor.owner_rows[0].row.profile_payload,
      historical.owner_rows[0].row.profile_payload);
    assert.notEqual(actor.owner_rows[0].row.catalog_revision_id,
      historical.owner_rows[0].row.catalog_revision_id);
    assert.throws(() => validateActorBaseAttributesImportRequest(actor),
      { code: 'ACTOR_BASE_ATTRIBUTES_IMPORT_REQUEST_INVALID' });
  });

test('target request requires an exact subject commit', async () => {
  await assert.rejects(buildSpatialV3TargetCatalogRequests({
    repositoryRoot: root, subjectCommit: 'HEAD'
  }), /Exact source paths and source commit SHA are required/u);
});
