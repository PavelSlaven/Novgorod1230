import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRuntimeCatalogContext } from '../src/orchestrator/runtime-catalog-context.js';

const pin = {
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'procedural_scene_final_candidate_v2_001',
  catalog_digest: '6fcf5c50d01bd56605a037de3d79cd1aa5e56a1c520db70bd0ab5b6ade6b1361',
  compatible_world_revision_id: 'world',
  compatible_world_catalog_digest: 'a'.repeat(64)
};

test('runtime context carries only a pin-matched verified procedural catalog', () => {
  const context = {
    schema: 'rus.runtime_catalog_context.v2', pin,
    world_pin: { world_revision_id: 'world', world_catalog_digest: 'a'.repeat(64) },
    verified_catalog: { schema: 'rus.verified_item_catalog.v2', verified: true, pin },
    verified_procedural_compiled_catalog: {
      schema: 'rus.verified_procedural_compiled_catalog.v1', verified: true, pin
    }
  };
  assert.equal(validateRuntimeCatalogContext(context), context);
  assert.throws(() => validateRuntimeCatalogContext({ ...context,
    verified_procedural_compiled_catalog: { ...context.verified_procedural_compiled_catalog,
      pin: { ...pin, catalog_digest: 'b'.repeat(64) } } }),
  { code: 'RUNTIME_CATALOG_CONTEXT_INVALID' });
});
