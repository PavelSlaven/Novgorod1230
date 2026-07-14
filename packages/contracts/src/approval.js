import { sha256 } from '@rus/kernel';

export function createApproval({ stageId, artifact, approvedBy = 'system', reasons = [] }) {
  if (!Number.isInteger(stageId)) throw new TypeError('stageId must be an integer.');
  return Object.freeze({
    stage_id: stageId,
    artifact_digest: sha256(artifact),
    approved_by: approvedBy,
    reasons: Object.freeze([...reasons])
  });
}

export function verifyApproval(approval, artifact) {
  return Boolean(approval && approval.artifact_digest === sha256(artifact));
}
