import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { computeSpatialV3CanonicalDigest } from '../../packages/contracts/src/spatial-v3/registry.js';
import { buildLocalMovementEligibilityCandidate, loadLocalMovementEligibilityCandidate } from
  '../../tools/spatial-v3/m2c-local-movement-adjunct.mjs';

const root = 'data/world-catalogs/novgorod';
const read = async (path) => JSON.parse(await readFile(`${root}/${path}`, 'utf8'));

test('local movement adjunct is deterministic and preserves directed relation and position facts', async () => {
  const candidate = await loadLocalMovementEligibilityCandidate();
  assert.deepEqual(candidate, await read('m2c-scene-movement-edges/local-movement-eligibility-candidate.json'));
  assert.equal(candidate.records.length, 68);
  assert.equal(new Set(candidate.records.map((row) => row.scene_template_id)).size, 17);
  assert.equal(candidate.approved, false);
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
  for (const row of candidate.records) {
    assert.equal(row.eligibility_kind, 'two_approved_directed_edges');
    assert.equal(row.max_root_owners_per_transition, 1);
    assert.notEqual(row.edge_slot_key, row.opposing_edge_slot_key);
    assert.equal(Object.hasOwn(row, 'reverse_edge_slot_key'), false);
    assert.equal(Object.hasOwn(row, 'capacity'), false);
    assert.equal(Object.hasOwn(row, 'destination_capacity'), false);
  }
  assert.match(candidate.runtime_requirements.current_visibility, /authoritative visibility/);
  assert.match(candidate.provenance.destination_capacity, /Actual committed occupancy/);
});

test('adjunct authoring rejects missing opposite direction and altered source relation facts', async () => {
  const base = 'spatial-v3/candidates/m2c-g4-expansion-v1/datasets';
  const input = {
    mechanics: await read('m2c-scene-movement-edges/candidate.json'),
    scenes: await read(`${base}/spatial_v3_scene_templates.json`),
    edges: await read(`${base}/spatial_v3_scene_movement_edge_templates.json`),
    positions: await read(`${base}/spatial_v3_scene_position_templates.json`), source_refs: []
  };
  for (const mutate of [
    (value) => value.edges.splice(1, 1),
    (value) => { value.edges[1].to_position_slot_key = 'departure'; },
    (value) => { value.edges[0].reverse_edge_slot_key = 'edge_2'; },
    (value) => { value.edges[0].capacity = 1; },
    (value) => { value.positions[0].capacity = 3; },
    (value) => { value.mechanics.scene_movement_edge_templates[0].capacity = 3; }
  ]) {
    const value = structuredClone(input);
    mutate(value);
    assert.throws(() => buildLocalMovementEligibilityCandidate(value));
  }
});

test('mapped adjunct preserves raw facts with exact independently reviewed bytes and authoring pins', async () => {
  const candidate = await read('m2c-scene-movement-edges/local-movement-eligibility-candidate.json');
  const base = 'm2c-scene-movement-edges/local-movement-eligibility-v1';
  const manifestBytes = await readFile(`${root}/${base}/manifest.json`);
  const manifest = JSON.parse(manifestBytes);
  const approval = (await read('m2c-sol-data-approval.json')).local_movement_eligibility_mapped_approval;
  assert.equal(createHash('sha256').update(manifestBytes).digest('hex'), approval.manifest_sha256);
  for (const dataset of manifest.datasets) {
    const bytes = await readFile(`${root}/${base}/${dataset.file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), dataset.sha256);
  }
  const rows = await read(`${base}/datasets/spatial_v3_local_movement_eligibility_profiles.json`);
  const versions = await read(`${base}/datasets/spatial_v3_authoring_versions.json`);
  assert.equal(rows.length, candidate.records.length);
  for (const [index, row] of rows.entries()) {
    const { entity_kind, status, provenance_ref, canonical_digest, ...facts } = row;
    assert.deepEqual(facts, candidate.records[index]);
    assert.equal(status, 'approved');
    assert.equal(canonical_digest, computeSpatialV3CanonicalDigest({ entity_kind, ...facts,
      status, provenance_ref }).replace('sha256:', ''));
    assert.equal(versions[index].canonical_digest, canonical_digest);
  }
});
