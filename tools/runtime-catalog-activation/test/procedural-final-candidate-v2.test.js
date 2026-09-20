import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateProceduralFinalCandidateV2 } from
  '../../../scripts/generate-procedural-final-candidate-v2.mjs';

const root = new URL('../../../', import.meta.url).pathname.replace(/^\/(.:)/u,
  '$1');

test('v2 is append-only, attested and inactive', async () => {
  const candidate = await generateProceduralFinalCandidateV2(root);
  const tracked = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/procedural-scene-v2/'
      + 'final-candidate-pack-v2/candidate.json', import.meta.url), 'utf8'));
  assert.deepEqual(candidate, tracked);
  assert.equal(candidate.allocation_source.approval_attestation_digest,
    '692960ad7561b60a0793f1f3fb097e757f8975aa91ec42251296edc6213b552a');
  assert.equal(candidate.append_only_delta.insert_count, 1);
  assert.equal(candidate.append_only_delta.delete_count, 0);
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
  assert.equal(candidate.existing_party_migration_authorized, false);
  assert.equal(candidate.inherited_closure.v5_assert_existing_record_count, 3248);
  assert.equal(candidate.append_only_delta.record.payload.policy.policy_id,
    'fishing_present_actor_functional_allocation_v1');
});

test('activated v1 stays immutable and non-migrated', async () => {
  const before = await readFile(new URL(
    '../../../data/world-catalogs/novgorod/procedural-scene-v2/'
      + 'final-candidate-pack-v1/candidate.json', import.meta.url), 'utf8');
  await generateProceduralFinalCandidateV2(root);
  const after = await readFile(new URL(
    '../../../data/world-catalogs/novgorod/procedural-scene-v2/'
      + 'final-candidate-pack-v1/candidate.json', import.meta.url), 'utf8');
  assert.equal(after, before);
});
