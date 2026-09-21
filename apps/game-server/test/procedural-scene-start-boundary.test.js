import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveOptionalProceduralSceneCatalog } from
  '../src/internal/procedural-scene-start-boundary.js';

test('procedural data gap preserves existing authored start', () => {
  const result = resolveOptionalProceduralSceneCatalog({ generate() {
    throw new Error('PROCEDURAL_SCENE_GENERATOR_INPUT_INVALID');
  }, bindings: {}, approvedRecordBundle: {} });
  assert.deepEqual(result, {
    status: 'blocked_data_gap', type: 'DATA_GAP',
    code: 'PROCEDURAL_SCENE_PROFILE_DATA_GAP',
    cause_code: 'PROCEDURAL_SCENE_GENERATOR_INPUT_INVALID'
  });
});

test('approved procedural catalog passes while unrelated defects propagate', () => {
  const gap = { status: 'blocked_data_gap', blocked_bindings: ['binding-1'] };
  assert.deepEqual(resolveOptionalProceduralSceneCatalog({
    generate: () => gap
  }), { ...gap, type: 'DATA_GAP',
    code: 'PROCEDURAL_SCENE_PROFILE_DATA_GAP' });
  const catalog = { status: 'approved', profiles: [{}] };
  assert.equal(resolveOptionalProceduralSceneCatalog({ generate: () => catalog }),
    catalog);
  assert.throws(() => resolveOptionalProceduralSceneCatalog({ generate() {
    throw new Error('unexpected');
  } }), /unexpected/u);
});
