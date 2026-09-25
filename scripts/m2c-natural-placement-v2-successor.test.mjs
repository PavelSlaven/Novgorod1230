import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildNaturalPlacementV2Successor } from './generate-m2c-natural-placement-v2-successor.mjs';
import { buildG4NaturalPlacementCompiledRecords } from
  '../tools/runtime-catalog-activation/src/g4-natural-placement-compiled-records.js';

test('placement successor changes only seven approved scene template versions', async () => {
  const root = resolve(import.meta.dirname, '..');
  const files = await buildNaturalPlacementV2Successor();
  for (const [path, bytes] of files) assert.deepEqual(await readFile(resolve(root, path)), bytes);
  const sourceBytes = await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-natural-placement/candidate.json'));
  const successorBytes = [...files.values()][0];
  assert.equal(successorBytes.length, sourceBytes.length);
  assert.deepEqual([...successorBytes].flatMap((byte, index) =>
    byte === sourceBytes[index] ? [] : [[sourceBytes[index], byte]]), Array.from({ length: 7 }, () => [49, 50]));
  const old = JSON.parse(sourceBytes);
  const candidate = JSON.parse(successorBytes);
  const capacityApproval = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/live-world-runtime-v17/capacity-v2-start-successors/data-approval.json')));
  const startBytesByPath = new Map(await Promise.all(capacityApproval.approved_successors.map(async ({ start }) =>
    [start.path, await readFile(resolve(root, start.path), 'utf8')])));
  const ids = capacityApproval.approved_successors.map(({ start }) => {
    const row = JSON.parse(startBytesByPath.get(start.path));
    return row.initial_perception_rule?.placement_candidate?.placement_ref.id ?? row.natural_placement_ref.id;
  });
  for (const id of ids) {
    const row = candidate.placements.find((item) => item.id === id);
    assert.equal(row.scene_template_ref.version, 2);
    row.scene_template_ref.version = 1;
  }
  assert.deepEqual(candidate, old);
  const oldApproval = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-sol-data-approval.json')));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({
    candidateBytes: successorBytes.toString(), approval: oldApproval
  }), /Exact independently approved natural placement bytes/);
  const inputs = {
    candidateBytes: successorBytes.toString(), sourceCandidateBytes: sourceBytes.toString(),
    approvedStartBytesByPath: startBytesByPath,
    sceneTemplateBytes: await readFile(resolve(root,
      'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_templates.json'), 'utf8'),
    capacityApproval,
    approval: oldApproval
  };
  const [compiled] = buildG4NaturalPlacementCompiledRecords(inputs);
  for (const id of ids) assert.equal(compiled.payload.placements.find((item) => item.id === id)
    .scene_template_ref.version, 2);
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    candidateBytes: inputs.candidateBytes.replace('"version": 1,\n  "status"', '"version": 3,\n  "status"') }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    candidateBytes: `${inputs.candidateBytes}\n` }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    sourceCandidateBytes: `${inputs.sourceCandidateBytes}\n` }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    approvedStartBytesByPath: new Map(startBytesByPath).set(capacityApproval.approved_successors[0].start.path,
      `${startBytesByPath.get(capacityApproval.approved_successors[0].start.path)}\n`) }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    sceneTemplateBytes: `${inputs.sceneTemplateBytes}\n` }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    capacityApproval: { ...inputs.capacityApproval, source_pins: {} } }));
});
