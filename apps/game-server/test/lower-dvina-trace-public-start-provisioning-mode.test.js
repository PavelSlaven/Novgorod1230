import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { startLowerDvinaTrace } from '../src/runtime/lower-dvina-trace-public-start.js';

const V17_CATALOG_ID = 'novgorod_live_world_runtime_v17';
const V1_CATALOG_ID = 'novgorod_live_world_runtime_v1';
const manifest = JSON.parse(readFileSync(new URL(
  '../../../data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.json',
  import.meta.url), 'utf8'));

/** Runs the public start up to the point where the authored narrator is required and reports provisioning. */
async function provisioningCalls(runtimeBinding) {
  let request = null;
  let provisioned = 0;
  await assert.rejects(startLowerDvinaTrace({
    requestId: 'r', partyId: 'party:1', creationIdentity: { scenario_id: 'scenario' },
    release: { world_revision_id: 'world', world_catalog_digest: 'digest' },
    publicationLoader: async () => ({ manifest_digest: 'm', public_projection: {},
      binding: { scenario_id: 'scenario', runtime_binding: runtimeBinding, binding_id: 'b', revision: 1,
        world_compatibility: { production_world_revision_id: 'world', production_world_catalog_digest: 'digest' },
        scenario_definition_ref: { revision: 1, digest: 'd' }, phase_1a_manifest_ref: { digest: 'm' },
        execution_identity: { materializer_version: '1', rng_algorithm_id: 'a', seed_context: 'c',
          trigger: 'new_game', occurrence: 0 } } }),
    traceStartAdapter: {
      assertExecutionSupport() {},
      async loadInternal() {
        return request == null ? null : { request_identity: request, player: { instance_id: 'p' } };
      },
      async materialize(input) { request = input; return { status: 'committed' }; },
      async loadVisible() { return {}; },
      async provisionInitialOrdinary() { provisioned += 1; }
    }
  }), { code: 'AUTHORED_OPENING_NARRATOR_MISSING' });
  return provisioned;
}

test('public start provisions initial ordinary presence for every v17 start regardless of binding revision', async () => {
  assert.equal(manifest.starts.length, 7);
  for (const { binding_revision: revision, scenario_id: scenarioId } of manifest.starts) {
    assert.equal(await provisioningCalls({ catalog_id: V17_CATALOG_ID, revision }), 1,
      `${scenarioId} (binding_revision ${revision})`);
  }
});

test('public start keeps legacy and v1 provisioning rules', async () => {
  assert.equal(await provisioningCalls({ catalog_id: V1_CATALOG_ID, revision: 4 }), 0);
  assert.equal(await provisioningCalls({ catalog_id: V1_CATALOG_ID, revision: 6 }), 1);
});
