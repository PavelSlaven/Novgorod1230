import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildTargetStartCompiledRecords } from '../src/target-start-compiled-records.js';

const root = resolve(import.meta.dirname, '../../..');
test('canonical initial rule compilation requires exact separate start approval', async () => {
  const candidateBytes = await readFile(resolve(root,
    'data/world-catalogs/novgorod/live-world-runtime-v17/target-start-candidate.json'), 'utf8');
  const approval = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-sol-data-approval.json'), 'utf8'));
  const [record] = buildTargetStartCompiledRecords({ candidateBytes, approval });
  assert.equal(record.record_id, `profile:${record.payload.rule.id}`);
  assert.equal(record.status, 'approved_authoring_not_runtime_selectable');
  assert.equal(record.payload.source_candidate_sha256,
    approval.target_start_proposal_approval.candidate_sha256);
  assert.equal(record.payload.rule.status, undefined);
  assert.equal(record.payload.placement_candidate_sha256,
    approval.approved_exact_candidates.natural_placement_sha256);
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes }));
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes: `${candidateBytes}\n`, approval }));
  assert.throws(() => buildTargetStartCompiledRecords({ candidateBytes,
    approval: { ...approval, target_start_proposal_approval: null } }));
});
