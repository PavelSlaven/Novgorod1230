import { createHash } from 'node:crypto';
import { canonicalStringify } from '@rus/runtime-catalog/canonical-records';
import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog/needs-check-blocker';

export function buildNeedsCheckBlockerCompiledRecord(snapshot) {
  NEEDS_CHECK_BLOCKER.validateSnapshot(snapshot);
  const payload = structuredClone(snapshot);
  const payload_digest = digest(payload);
  return {
    record_id: 'profile:needs_check_blockers',
    version: 2,
    record_kind: 'profile',
    family_candidate_ref: null,
    payload,
    payload_digest,
    source_pack_digest: payload_digest,
    status: 'approved_authoring_not_runtime_selectable'
  };
}

function digest(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}
