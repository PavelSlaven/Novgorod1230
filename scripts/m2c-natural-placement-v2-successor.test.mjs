import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildNaturalPlacementV2Successor } from './generate-m2c-natural-placement-v2-successor.mjs';
import { buildG4NaturalPlacementCompiledRecords } from
  '../tools/runtime-catalog-activation/src/g4-natural-placement-compiled-records.js';

test('placement successor changes only approved forest scene template version', async () => {
  const root = resolve(import.meta.dirname, '..');
  const files = await buildNaturalPlacementV2Successor();
  for (const [path, bytes] of files) assert.deepEqual(await readFile(resolve(root, path)), bytes);
  const sourceBytes = await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-natural-placement/candidate.json'));
  const successorBytes = [...files.values()][0];
  assert.equal(successorBytes.length, sourceBytes.length);
  assert.deepEqual([...successorBytes].flatMap((byte, index) =>
    byte === sourceBytes[index] ? [] : [[sourceBytes[index], byte]]), [[49, 50]]);
  const old = JSON.parse(sourceBytes);
  const candidate = JSON.parse(successorBytes);
  const row = candidate.placements.find((item) => item.id.includes('dry_pine_ridge__stfv3__g5_route_approach_v1__arrival'));
  assert.equal(row.scene_template_ref.version, 2);
  row.scene_template_ref.version = 1;
  assert.deepEqual(candidate, old);
  const oldApproval = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-sol-data-approval.json')));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({
    candidateBytes: successorBytes.toString(), approval: oldApproval
  }), /Exact independently approved natural placement bytes/);
  const inputs = {
    candidateBytes: successorBytes.toString(), sourceCandidateBytes: sourceBytes.toString(),
    approvedStartBytes: await readFile(resolve(root,
      'data/world-catalogs/novgorod/live-world-runtime-v17/capacity-v2-start-successors/novgorod_pine_ridge_approach_v1.start.json'), 'utf8'),
    sceneTemplateBytes: await readFile(resolve(root,
      'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_templates.json'), 'utf8'),
    capacityApproval: JSON.parse(await readFile(resolve(root,
      'data/world-catalogs/novgorod/live-world-runtime-v17/capacity-v2-start-successors/data-approval.json'))),
    approval: oldApproval
  };
  const [compiled] = buildG4NaturalPlacementCompiledRecords(inputs);
  assert.equal(compiled.payload.placements.find((item) => item.id === row.id)
    .scene_template_ref.version, 2);
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    candidateBytes: inputs.candidateBytes.replace('"version": 1,\n  "status"', '"version": 3,\n  "status"') }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    candidateBytes: `${inputs.candidateBytes}\n` }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    sourceCandidateBytes: `${inputs.sourceCandidateBytes}\n` }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    approvedStartBytes: `${inputs.approvedStartBytes}\n` }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    sceneTemplateBytes: `${inputs.sceneTemplateBytes}\n` }));
  assert.throws(() => buildG4NaturalPlacementCompiledRecords({ ...inputs,
    capacityApproval: { ...inputs.capacityApproval, source_pins: {} } }));
});
