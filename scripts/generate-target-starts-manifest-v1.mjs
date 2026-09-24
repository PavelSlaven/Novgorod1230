import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildStartArtifacts } from './generate-additional-start-artifacts-v1.mjs';

const root = resolve(import.meta.dirname, '..');
const base = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const candidatePath = `${base}/additional-starts-candidate.json`;
const approvalPath = `${base}/additional-starts-data-approval.json`;
const outputPath = `${base}/target-starts-manifest.v1.candidate.json`;
const bytes = (path) => readFile(resolve(root, path));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export async function buildManifest() {
  const [candidateBytes, approvalBytes] = await Promise.all([bytes(candidatePath), bytes(approvalPath)]);
  const candidate = JSON.parse(candidateBytes);
  const approval = JSON.parse(approvalBytes);
  assert.equal(approval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(approval.candidate_path, candidatePath);
  assert.equal(approval.candidate_sha256, sha256(candidateBytes));
  assert.equal(candidate.starts.length, 6);
  assert.equal(new Set(candidate.starts.map((start) => start.scenario_id)).size, 6);
  assert.equal(candidate.activation_authorized, false);
  assert.equal(approval.activation_authorized, false);
  for (const pin of candidate.source_pins) assert.equal(sha256(await bytes(pin.path)), pin.sha256, pin.path);
  const generated = await buildStartArtifacts();
  for (const [path, expected] of generated.files) assert.deepEqual(await bytes(path), expected, path);
  return {
    schema: 'rus.live_world_runtime.target_starts_manifest.v1',
    version: 1,
    status: 'candidate',
    activation_authorized: false,
    source_artifacts: {
      candidate: { path: candidatePath, sha256: sha256(candidateBytes) },
      approval: { path: approvalPath, sha256: sha256(approvalBytes) }
    },
    starts: candidate.starts.map((start, index) => ({
      binding_revision: index + 1,
      scenario_id: start.scenario_id,
      canonical_g5_ref: start.initial_placement.canonical_g5_ref,
      ...generated.artifacts.find(({ scenario_id }) => scenario_id === start.scenario_id)
    }))
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const generated = `${JSON.stringify(await buildManifest(), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    assert.equal(await bytes(outputPath).then(String), generated);
  } else {
    await writeFile(resolve(root, outputPath), generated);
  }
}
