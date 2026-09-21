import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalCandidateDigest, canonicalDigest, canonicalRequestDigest } from
  '../../../../../packages/materialization/src/index.js';

const root = resolve(import.meta.dirname);
const candidatePath = resolve(root, 'candidate.json');
const requestPath = resolve(root, 'approval-request.json');
const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
candidate.profile_digest = canonicalDigest(candidate.profile);
candidate.candidate_digest = canonicalCandidateDigest(candidate);
const request = JSON.parse(await readFile(requestPath, 'utf8'));
request.subject_commit = candidate.subject_commit;
request.candidate_digest = candidate.candidate_digest;
request.profile_digest = candidate.profile_digest;
request.request_digest = canonicalRequestDigest(request);
if (process.argv.includes('--check')) {
  const stored = JSON.parse(await readFile(requestPath, 'utf8'));
  if (stored.request_digest !== request.request_digest) process.exitCode = 1;
} else {
  await writeFile(candidatePath, JSON.stringify(candidate, null, 2) + '\n');
  await writeFile(requestPath, JSON.stringify(request, null, 2) + '\n');
}
