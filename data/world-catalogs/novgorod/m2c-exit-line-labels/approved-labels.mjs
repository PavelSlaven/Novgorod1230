import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exitKey = (id, version) => `${id}@${version}`;

/** Load only the exact rows named by the independent Opus attestation. */
export function loadApprovedExitLineLabels() {
  try {
    return approvedExitLineLabelsFromAttestation(read('./candidate.json'),
      JSON.parse(read('./approval-attestation.json')));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export function approvedExitLineLabelsFromAttestation(candidateBytes, approval) {
  let candidate;
  try { candidate = JSON.parse(candidateBytes); } catch { return null; }
  if (!['APPROVE_DATA_ONLY', 'APPROVE_WITH_LIMITS'].includes(approval?.decision)
    || approval.candidate_ref !== `${candidate.candidate_id}@${candidate.version}`
    || approval.candidate_sha256 !== hash(candidateBytes)
    || !Array.isArray(candidate.labels) || !Array.isArray(approval.approved_rows)
    || !Array.isArray(approval.withheld_rows?.rows)) return null;

  const candidates = new Map();
  for (const row of candidate.labels) {
    const key = exitKey(row.directional_exit_ref?.id, row.directional_exit_ref?.version);
    if (!row.directional_exit_ref?.id || !Number.isInteger(row.directional_exit_ref?.version)
      || candidates.has(key) || row.status !== 'candidate_approval_pending'
      || typeof row.display_label !== 'string' || !row.display_label.trim()
      || typeof row.line_name !== 'string' || !row.line_name.trim()
      || !Object.hasOwn(row, 'line_discriminator')
      || !Object.hasOwn(row, 'line_direction_id')) return null;
    candidates.set(key, row);
  }

  const approved = new Map();
  const partition = new Set();
  for (const row of [...approval.approved_rows, ...approval.withheld_rows.rows]) {
    if (typeof row.directional_exit_id !== 'string' || typeof row.route_pair_id !== 'string'
      || typeof row.from_place !== 'string' || typeof row.display_label !== 'string') return null;
    const matches = [...candidates].filter(([, candidateRow]) =>
      candidateRow.directional_exit_ref.id === row.directional_exit_id
      && candidateRow.route_pair_id === row.route_pair_id
      && candidateRow.display_label === row.display_label);
    if (matches.length !== 1) return null;
    const [key, candidateRow] = matches[0];
    if (partition.has(key)) return null;
    partition.add(key);
    if (approval.approved_rows.includes(row)) approved.set(key, candidateRow);
  }
  if (partition.size !== candidates.size) return null;
  return approved;
}
