import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The runtime reads m2c-pass-target-labels/candidate.json directly, with no digest gate
// (AI §17, LW-075). "The file is the approved content" is checked here, in CI: the digest
// recorded in the independent approval attestation must be the digest of the file.
const dir = new URL('../../data/world-catalogs/novgorod/m2c-pass-target-labels/', import.meta.url);

test('m2c-pass-target-labels candidate.json is exactly the content the attestation approved', () => {
  const bytes = readFileSync(new URL('candidate.json', dir));
  const candidate = JSON.parse(bytes);
  const attestation = JSON.parse(readFileSync(new URL('approval-attestation.json', dir)));
  assert.equal(attestation.decision, 'APPROVE_DATA_ONLY');
  assert.equal(attestation.candidate_ref, `${candidate.candidate_id}@${candidate.version}`);
  assert.equal(attestation.candidate_sha256, createHash('sha256').update(bytes).digest('hex'),
    'candidate.json changed after approval: run the data approval pass and update the attestation');
});
