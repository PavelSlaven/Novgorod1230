import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deriveApprovedNaturalPlacementV2Successor } from
  '../tools/runtime-catalog-activation/src/g4-natural-placement-compiled-records.js';

const root = resolve(import.meta.dirname, '..');
const base = 'data/world-catalogs/novgorod/';
const sourcePath = `${base}m2c-natural-placement/candidate.json`;
const outputPath = `${base}m2c-natural-placement/scene-template-v2-successor-candidate.json`;
const manifestPath = `${base}m2c-natural-placement/scene-template-v2-derivation-manifest.json`;
const approvalPath = `${base}live-world-runtime-v17/capacity-v2-start-successors/data-approval.json`;
const scenePath = `${base}m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_templates.json`;
const oldApprovalPath = `${base}m2c-sol-data-approval.json`;
const read = (path) => readFile(resolve(root, path));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const encode = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const pin = (path, bytes) => ({ path, sha256: hash(bytes) });

export async function buildNaturalPlacementV2Successor() {
  const [sourceBytes, approvalBytes, sceneBytes, oldApprovalBytes] = await Promise.all(
    [sourcePath, approvalPath, scenePath, oldApprovalPath].map(read));
  const approval = JSON.parse(approvalBytes);
  const oldApproval = JSON.parse(oldApprovalBytes);
  assert.deepEqual(approval.source_pins.scene_templates, pin(scenePath, sceneBytes));
  const startBytesByPath = new Map(await Promise.all(approval.approved_successors
    .map(async ({ start }) => [start.path, (await read(start.path)).toString()])));
  const candidateBytes = Buffer.from(deriveApprovedNaturalPlacementV2Successor({
    sourceCandidateBytes: sourceBytes.toString(), approvedStartBytesByPath: startBytesByPath,
    capacityApproval: approval, sceneTemplateBytes: sceneBytes.toString(), approval: oldApproval
  }));
  const manifestBytes = encode({
    schema: 'rus.m2c_natural_placement_scene_template_v2_derivation_manifest.v1',
    status: 'deterministically_derived',
    source: pin(sourcePath, sourceBytes),
    approved_starts: approval.approved_successors.map(({ start }) => pin(start.path, Buffer.from(startBytesByPath.get(start.path)))),
    start_approval: pin(approvalPath, approvalBytes),
    approved_scene_templates: pin(scenePath, sceneBytes),
    candidate: pin(outputPath, candidateBytes),
    exact_change: { placement_ids: JSON.parse(sourceBytes).placements.map((row) => row.id),
      field: 'scene_template_ref.version', from: 1, to: 2,
    retained_source_scene_placements: 'same source row with __scene_v1 id',
    all_other_fields_unchanged: true }
  });
  return new Map([[outputPath, candidateBytes], [manifestPath, manifestBytes]]);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const files = await buildNaturalPlacementV2Successor();
  for (const [path, bytes] of files) {
    if (process.argv.includes('--check')) assert.deepEqual(await read(path), bytes, path);
    else await writeFile(resolve(root, path), bytes);
  }
  console.log(`${files.size} deterministic placement successor artifacts`);
}
