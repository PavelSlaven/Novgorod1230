import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOptionalProceduralSceneCatalog } from
  '../src/internal/procedural-scene-start-boundary.js';

test('procedural data gap preserves existing authored start', () => {
  const result = resolveOptionalProceduralSceneCatalog({ generate() {
    throw new Error('PROCEDURAL_SCENE_GENERATOR_INPUT_INVALID');
  }, bindings: {}, approvedRecordBundle: {} });
  assert.equal(result, null);
});

test('approved procedural catalog passes while unrelated defects propagate', () => {
  const catalog = { status: 'approved', profiles: [{}] };
  assert.equal(resolveOptionalProceduralSceneCatalog({ generate: () => catalog }),
    catalog);
  assert.throws(() => resolveOptionalProceduralSceneCatalog({ generate() {
    throw new Error('unexpected');
  } }), /unexpected/u);
});
