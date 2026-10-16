import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAdditionalStartOwnerRows } from '../../data/world-catalogs/novgorod/live-world-runtime-v17/additional-start-artifacts/owner-import.mjs';

test('capacity v2 acoustic successors preserve approved baseline content', async () => {
  const { acoustic, authoring } = await buildAdditionalStartOwnerRows();
  assert.equal(acoustic.length, 4);
  for (const first of acoustic.filter((row) => row.version === 1)) {
    const next = acoustic.find((row) => row.id === first.id && row.version === 2);
    assert.ok(next, first.id);
    const { version, scene_template_version, canonical_digest, ...content } = first;
    const { version: nextVersion, scene_template_version: nextSceneVersion,
      canonical_digest: nextDigest, ...nextContent } = next;
    assert.equal(nextVersion, 2);
    assert.equal(nextSceneVersion, 2);
    assert.deepEqual(nextContent, content);
    assert.match(nextDigest, /^[a-f0-9]{64}$/u);
    assert.ok(authoring.some((row) => row.entity_kind === 'g6_acoustic_baseline'
      && row.entity_id === next.id && row.version === 2 && row.canonical_digest === nextDigest));
  }
});
