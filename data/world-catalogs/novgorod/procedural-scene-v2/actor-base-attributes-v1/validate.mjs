import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalCandidateDigest, canonicalDigest, canonicalRequestDigest,
  validateActorBaseAttributesCandidate } from '../../../../../packages/materialization/src/index.js';

const root = resolve(import.meta.dirname);
const candidate = JSON.parse(await readFile(resolve(root, 'candidate.json'), 'utf8'));
const request = JSON.parse(await readFile(resolve(root, 'approval-request.json'), 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

assert.equal(validateActorBaseAttributesCandidate(candidate), true);
assert.equal(candidate.profile_digest, canonicalDigest(candidate.profile));
assert.equal(candidate.candidate_digest, canonicalCandidateDigest(candidate));
assert.deepEqual(Object.keys(candidate).sort(), ['activation_authorized',
  'candidate_digest','import_authorized','profile','profile_digest',
  'runtime_authorized','schema','source_provenance','status','subject_commit',
  'version']);
assert.deepEqual(Object.keys(request).sort(), ['candidate_digest','candidate_ref',
  'decision','profile_digest','request_digest','requested_activation',
  'requested_equipment_allocation_activation','requested_import',
  'requested_runtime_activation','schema','scope','status','subject_commit',
  'version']);
assert.equal(request.subject_commit, candidate.subject_commit);
assert.equal(request.candidate_digest, candidate.candidate_digest);
assert.equal(request.profile_digest, candidate.profile_digest);
assert.equal(request.request_digest, canonicalRequestDigest(request));
assert.equal(request.decision, 'pending');
assert.equal(request.requested_runtime_activation, false);
assert.equal(request.requested_equipment_allocation_activation, false);
assert.equal(request.requested_import, false);
assert.equal(request.requested_activation, false);
for (const mapping of candidate.source_provenance.priority_mappings) {
  assert.equal(mapping.directness, 'editorial_inference');
  assert.equal(mapping.confidence, 'medium');
}
assert.equal(sha256(await readFile(resolve(root,
  '../../../../novgorod-region/novgorod_occupations_v1_enriched.tsv'))),
candidate.source_provenance.priority_mappings[0].occupation_tsv_digest);
const [header, ...lines] = (await readFile(resolve(root,
  '../../../../novgorod-region/novgorod_occupations_v1_enriched.tsv'), 'utf8'))
  .trim().split(/\r?\n/u);
const columns = header.split('\t');
const occupationId = columns.indexOf('occupation_id');
const archetypeId = columns.indexOf('occupation_archetype_id');
const actual = new Map();
for (const line of lines) {
  const row = line.split('\t');
  if (row[columns.indexOf('status')] !== 'approved') continue;
  const values = actual.get(row[archetypeId]) ?? [];
  values.push(row[occupationId]);
  actual.set(row[archetypeId], values);
}
for (const mapping of candidate.source_provenance.priority_mappings) {
  assert.deepEqual(mapping.occupation_ids,
    (actual.get(mapping.occupation_archetype_id) ?? []).sort());
}
console.log(JSON.stringify({ pass: true, profile_digest: candidate.profile_digest,
  candidate_digest: candidate.candidate_digest, request_digest: request.request_digest }));
