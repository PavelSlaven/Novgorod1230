import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { buildTargetFiniteProfileMapping, buildTargetFiniteCompiledRecords } from '../src/target-finite-profile.js';

test('finite mapping preserves exact approved source and cannot self-approve runtime compilation', async () => {
  const directory = new URL('../../../data/world-catalogs/novgorod/', import.meta.url);
  const candidateBytes = await readFile(new URL('live-world-runtime-v17/m2c-finite-only-ordinary-base-candidate.json', directory), 'utf8');
  const approval = JSON.parse(await readFile(new URL('m2c-sol-data-approval.json', directory), 'utf8'));
  const result = buildTargetFiniteProfileMapping({ candidateBytes, approval });
  assert.deepEqual(JSON.parse(result.datasetBytes).profile, JSON.parse(candidateBytes).profile);
  assert.equal(JSON.parse(result.manifestBytes).authority.activation_authorized, false);
  assert.throws(() => buildTargetFiniteProfileMapping({ candidateBytes: `${candidateBytes} `, approval }));
  const missing = { ...approval }; delete missing.finite_only_ordinary_base_mapped_approval;
  assert.throws(() => buildTargetFiniteCompiledRecords({ mappedBytes: result.datasetBytes,
    manifestBytes: result.manifestBytes, approval: missing }));
});
