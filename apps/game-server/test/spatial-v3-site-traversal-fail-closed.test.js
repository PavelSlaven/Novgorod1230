import assert from 'node:assert/strict';
import test from 'node:test';
import { siteTraversalWrites, SITE_TRAVERSAL_OWNER } from
  '../src/infrastructure/postgres/spatial-v3-site-traversal-commit.js';

test('site traversal refuses positive-progress paused or stranded state before commit', () => {
  for (const [result_kind, status] of [
    ['paused_in_transit', 'paused_in_transit'],
    ['stranded', 'stranded_in_transit']
  ]) {
    const consequence = {
      position_transition: { owner: SITE_TRAVERSAL_OWNER },
      spatial_v3_traversal: {
        result: { result_kind, actual_progress_after_ppm: 1 },
        final_travel_state: { status, progress_ppm: 1 }
      }
    };

    assert.throws(() => siteTraversalWrites({
      partyId: 'party', envelope: { consequence }, changeSetId: 'change',
      idemId: 'idem', turnNumber: 1
    }), { code: 'SPATIAL_V3_SITE_TRAVERSAL_COMMIT_INVALID' }, result_kind);
  }
});
