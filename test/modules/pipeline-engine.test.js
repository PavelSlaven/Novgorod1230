import test from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactRegistry, runStageGraph } from '@rus/pipeline-engine';

test('pipeline stores approved immutable artifacts', async () => {
  const stages = [
    { id: 1, name: 'one', execute: async ({ input }) => ({ status: 'approved', artifact: { value: input + 1 } }) },
    { id: 2, name: 'two', execute: async ({ input }) => ({ status: 'approved', artifact: { value: input.value + 1 } }) }
  ];
  const result = await runStageGraph({ stages, input: 1 });
  assert.equal(result.status, 'approved');
  assert.deepEqual(result.artifact, { value: 3 });
  assert.equal(result.registry.has('stage:1'), true);
});

test('registry rejects overwrite', () => {
  const registry = new ArtifactRegistry();
  registry.put('x', { value: 1 });
  assert.throws(() => registry.put('x', { value: 2 }));
});
