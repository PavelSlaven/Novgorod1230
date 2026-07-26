import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildFirstPlayableRevisions
} from '../../tools/spatial-v3/build-lower-dvina-first-playable-revisions.mjs';

test('first-playable content revisions are deterministic and self-contained', async () => {
  const first = await buildFirstPlayableRevisions();
  const second = await buildFirstPlayableRevisions();

  assert.deepEqual(second, first);
  assert.equal(first.length, 2);
  for (const revision of first) {
    const bytes = await readFile(revision.archive_path);
    assert.ok(bytes.length > 0);
    assert.match(revision.archive_sha256, /^[a-f0-9]{64}$/u);
  }
});

test('yp026 explicitly supersedes r003 and yp025 starts its first formal content revision', async () => {
  const revisions = await buildFirstPlayableRevisions();

  assert.equal(revisions[0].revision_id, 'content_revision_004_first_playable_candidate');
  assert.equal(revisions[1].revision_id, 'content_revision_001_first_playable_candidate');
});
