import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deriveConnectionLabels } from './derive.mjs';

/** Approved connection labels keyed by binding id. The approval is the attestation of the exact
 * candidate bytes (like the other m2c label catalogs); the rows must equal the deterministic
 * derivation from the approved bindings, so the file cannot drift from its source. */
export function loadApprovedConnectionLabels({ candidatePath = './candidate.json',
  approvalPath = './approval-attestation.json' } = {}) {
  const bytes = readFileSync(new URL(candidatePath, import.meta.url));
  const candidate = JSON.parse(bytes);
  const approval = JSON.parse(readFileSync(new URL(approvalPath, import.meta.url)));
  if (approval.decision !== 'APPROVE_DATA_ONLY'
    || approval.candidate_ref !== `${candidate.candidate_id}@${candidate.version}`
    || approval.candidate_sha256 !== createHash('sha256').update(bytes).digest('hex')
    || JSON.stringify(candidate.labels) !== JSON.stringify(deriveConnectionLabels())) {
    throw new Error('CANONICAL_CONNECTION_LABEL_APPROVAL_REQUIRED');
  }
  return new Map(candidate.labels.map((row) => [row.binding_ref.id, row]));
}
