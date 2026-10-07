import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const g5Key = (ref) => `${ref.id}@${ref.version}`;
const validRef = (ref) => typeof ref?.id === 'string' && ref.id.trim()
  && Number.isSafeInteger(ref.version) && ref.version >= 1;
const naturalKey = (ref) => {
  if (!validRef(ref?.natural_profile_ref) || !validRef(ref?.scene_template_ref)) return null;
  return `natural:${g5Key(ref.natural_profile_ref)}|${g5Key(ref.scene_template_ref)}`;
};
const candidateKey = (row) => {
  const hasG5 = row?.canonical_g5_ref != null;
  const hasNatural = row?.natural_place_ref != null;
  if (hasG5 === hasNatural) return null;
  if (hasG5 && validRef(row.canonical_g5_ref)) return g5Key(row.canonical_g5_ref);
  if (hasNatural) return naturalKey(row.natural_place_ref);
  return null;
};
const approvalKey = (row) => {
  const hasG5 = row?.canonical_g5_id != null || row?.canonical_g5_version != null;
  const hasNatural = row?.natural_place_ref != null;
  if (hasG5 === hasNatural) return null;
  if (hasG5 && typeof row.canonical_g5_id === 'string' && row.canonical_g5_id.trim()
    && Number.isSafeInteger(row.canonical_g5_version) && row.canonical_g5_version >= 1) {
    return `${row.canonical_g5_id}@${row.canonical_g5_version}`;
  }
  return hasNatural ? naturalKey(row.natural_place_ref) : null;
};

export function loadApprovedPlaceLabels() {
  try {
    return approvedPlaceLabelsFromAttestation(read('./candidate.json'),
      JSON.parse(read('./approval-attestation.json')));
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export function approvedPlaceLabelsFromAttestation(candidateBytes, approval) {
  let candidate;
  try { candidate = JSON.parse(candidateBytes); } catch { return null; }
  if (approval?.decision !== 'APPROVE_DATA_ONLY'
    || approval.decision_ref !== candidate?.decision_reference?.id
    || JSON.stringify(approval.decision_refs) !== JSON.stringify(candidate?.decision_references)
    || JSON.stringify(approval.natural_label_decision_refs)
      !== JSON.stringify(candidate?.natural_label_decision_references)
    || approval.candidate_ref !== `${candidate?.candidate_id}@${candidate?.version}`
    || approval.candidate_sha256 !== hash(candidateBytes)
    || candidate?.status !== 'candidate_approval_pending'
    || candidate?.approved !== false || candidate?.activation_authorized !== false
    || !Array.isArray(candidate?.labels) || !Array.isArray(approval.approved_rows)
    || approval.approved_rows.length !== candidate.labels.length) return null;

  const candidates = new Map();
  for (const row of candidate.labels) {
    const key = candidateKey(row);
    const isG5 = row?.canonical_g5_ref != null;
    const validDecisionBasis = isG5
      ? row.decision_ref === candidate.decision_reference.id
        && row.approval_basis == null
      : row.approval_basis === 'approved_natural_label_source'
        && Array.isArray(candidate.natural_label_decision_references)
        && candidate.natural_label_decision_references.length > 0;
    if (!key || row.status !== 'candidate_approval_pending' || !validDecisionBasis
      || typeof row.display_label !== 'string' || !row.display_label.trim()) return null;
    if (candidates.has(key)) return null;
    candidates.set(key, row);
  }

  const approved = new Map();
  for (const row of approval.approved_rows) {
    const key = approvalKey(row);
    if (!key || typeof row.display_label !== 'string') return null;
    const candidateRow = candidates.get(key);
    if (!candidateRow || candidateRow.display_label !== row.display_label || approved.has(key)) return null;
    approved.set(key, candidateRow);
  }
  if (approved.size !== candidates.size) return null;
  return approved;
}
