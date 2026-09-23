import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';

const digest = 'a'.repeat(64);
const g4 = { id: 'g4-target', version: 1, world_revision_id: 'target',
  canonical_digest: digest };
const generationTemplate = { id: 'g5-family', version: 1,
  world_revision_id: 'target', canonical_digest: digest };

test('M2c NPC closure requires exact same-revision G4 and template pins before querying', async () => {
  const calls = [];
  const reader = createSpatialV3WorldBaseReader({ query: async (...args) => {
    calls.push(args);
    return { rows: [] };
  } });

  assert.equal((await reader.readPinnedG4NpcCompositionClosure({
    g4, generation_template: { ...generationTemplate,
      world_revision_id: 'other' }
  })).ok, false);
  assert.equal((await reader.readPinnedG4NpcCompositionClosure({
    g4, generation_template: { ...generationTemplate, canonical_digest: 'bad' }
  })).ok, false);
  assert.equal(calls.length, 0);
  assert.equal((await reader.readPinnedG4NpcCompositionClosure({
    g4, generation_template: generationTemplate
  })).ok, false);
  assert.equal(calls.length, 3);
});

test('M2c NPC closure rejects absent approved source rows', async () => {
  const calls = [];
  const reader = createSpatialV3WorldBaseReader({ query: async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  } });

  const result = await reader.readPinnedG4NpcCompositionClosure({ g4,
    generation_template: generationTemplate });

  assert.equal(result.ok, false);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(({ params }) => params), [
    [g4.id, g4.version, g4.world_revision_id, g4.canonical_digest],
    [generationTemplate.id, generationTemplate.version,
      generationTemplate.world_revision_id, generationTemplate.canonical_digest],
    [g4.world_revision_id, g4.id, g4.version, generationTemplate.id,
      generationTemplate.version]
  ]);
});
