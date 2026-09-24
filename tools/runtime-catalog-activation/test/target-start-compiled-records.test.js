import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildTargetStartCompiledRecords } from '../src/target-start-compiled-records.js';

const root = resolve(import.meta.dirname, '../../..');
test('canonical initial rule compilation requires exact separate start approval', async () => {
  const candidateBytes = await readFile(resolve(root,
    'data/world-catalogs/novgorod/live-world-runtime-v17/target-start-candidate.json'), 'utf8');
  const approval = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-expansion-repin-data-approval.json'), 'utf8'));
  const historicalApproval = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-sol-data-approval.json'), 'utf8'));
  const [record] = buildTargetStartCompiledRecords({ candidateBytes, approval });
  assert.equal(record.record_id, `profile:${record.payload.rule.id}`);
  assert.equal(record.status, 'approved_authoring_not_runtime_selectable');
  assert.equal(record.payload.source_candidate_sha256,
    approval.target_start_proposal_approval.candidate_sha256);
  assert.equal(record.payload.rule.status, undefined);
  assert.equal(record.payload.placement_candidate_sha256,
    historicalApproval.approved_exact_candidates.natural_placement_sha256);
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes }));
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes: `${candidateBytes}\n`, approval }));
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes,
    approval: { ...approval, target_start_proposal_approval: null } }));
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes,
    approval: historicalApproval }));
});

test('capacity v2 forest successor compiles the exact approved initial rule', async () => {
  const path = 'data/world-catalogs/novgorod/live-world-runtime-v17/capacity-v2-start-successors/';
  const candidateBytes = await readFile(resolve(root,
    `${path}novgorod_pine_ridge_approach_v1.start.json`), 'utf8');
  const approval = JSON.parse(await readFile(resolve(root, `${path}data-approval.json`), 'utf8'));
  const [record] = buildTargetStartCompiledRecords({ candidateBytes, approval });
  assert.equal(record.payload.rule.scene_template_ref.version, 2);
  assert.equal(record.payload.source_candidate_sha256,
    approval.approved_successors[0].start.sha256);
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes: `${candidateBytes}\n`, approval }));
  const sourceApproval = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-sol-data-approval.json')));
  const successorBytes = await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-natural-placement/scene-template-v2-successor-candidate.json'), 'utf8');
  const candidate = JSON.parse(candidateBytes);
  const placement = JSON.parse(successorBytes).placements.find((row) =>
    row.id === candidate.initial_perception_rule.placement_candidate.placement_ref.id);
  const placementSuccessor = { path: 'data/world-catalogs/novgorod/m2c-natural-placement/scene-template-v2-successor-candidate.json',
    sourceApproval, record: { payload: { schema: 'rus.g4_natural_placement_catalog.v1',
      source_candidate_sha256: createHash('sha256').update(successorBytes).digest('hex'),
      placements: [placement] } } };
  const [derived] = buildTargetStartCompiledRecords({ candidateBytes, approval, placementSuccessor });
  assert.equal(derived.payload.placement_candidate_sha256,
    placementSuccessor.record.payload.source_candidate_sha256);
  assert.equal(derived.payload.rule.placement_candidate.path, placementSuccessor.path);
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes, approval,
    placementSuccessor: { ...placementSuccessor, sourceApproval: { ...sourceApproval,
      approved_exact_candidates: {} } } }));
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes, approval,
    placementSuccessor: { ...placementSuccessor, record: { payload: { ...placementSuccessor.record.payload,
      placements: [] } } } }));
});
