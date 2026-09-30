import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog/needs-check-blocker';
import { buildNeedsCheckBlockerCompiledRecord } from '../src/needs-check-blocker-compiled-record.js';

test('compiles the approved stage-one snapshot as one immutable catalog profile row', async () => {
  const snapshot = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/game-base-v1/needs_check_blockers.v2.json', import.meta.url), 'utf8'));
  const row = buildNeedsCheckBlockerCompiledRecord(snapshot);
  assert.equal(NEEDS_CHECK_BLOCKER.validateSnapshot(snapshot), undefined);
  assert.equal(row.record_id, 'profile:needs_check_blockers');
  assert.equal(row.version, 2);
  assert.equal(row.payload_digest.length, 64);
  assert.deepEqual(row.payload, snapshot);
  assert.throws(() => buildNeedsCheckBlockerCompiledRecord({ ...snapshot, digest: `sha256:${'0'.repeat(64)}` }), /digest mismatch/u);
});
