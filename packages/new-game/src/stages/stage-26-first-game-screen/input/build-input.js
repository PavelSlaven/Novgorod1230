import { STAGE26_INPUT_SCHEMA } from '../policy/constants.js';
import { deepFreeze, isObject, safeClone } from '../shared/utils.js';
import { normalizeStage26ScreenPolicy } from './screen-policy.js';
import { buildNarratorProseAuditApproval, buildStage25PartyCommitApproval, buildVisibleContextAuditApproval, computeNarratorStartingProseDigest, computeVisibleContextPackageDigest } from '@rus/contracts';

export function buildNarratorProseApproval(stage23Result = {}) {
  return buildNarratorProseAuditApproval(stage23Result);
}

export function buildStage26Input({
  request_id,
  stage25_result,
  stage25_party_commit_approval,
  party_start_committed,
  committed_public_read_model,
  approved_narrator_output,
  narrator_output_digest,
  narrator_prose_approval,
  stage23_result,
  approved_visible_context,
  visible_context_package_digest,
  visible_context_approval,
  stage21_result,
  screen_policy = {}
} = {}) {
  const stage25 = isObject(stage25_result) ? stage25_result : {};
  const narrator = safeClone(approved_narrator_output ?? null);
  const visible = safeClone(approved_visible_context ?? null);
  const input = {
    version: 1,
    schema: STAGE26_INPUT_SCHEMA,
    request_id: request_id ?? stage25.request_id ?? narrator?.request_id ?? visible?.request_id ?? null,
    stage25_party_commit_approval: safeClone(stage25_party_commit_approval ?? buildStage25PartyCommitApproval(stage25)),
    party_start_committed: safeClone(party_start_committed ?? stage25.party_start_committed ?? null),
    committed_public_read_model: safeClone(committed_public_read_model ?? stage25.party_public_state ?? null),
    approved_narrator_output: narrator,
    narrator_output_digest: narrator_output_digest ?? (isObject(narrator) ? computeNarratorStartingProseDigest(narrator) : null),
    narrator_prose_approval: safeClone(narrator_prose_approval ?? buildNarratorProseApproval(stage23_result ?? {})),
    approved_visible_context: visible,
    visible_context_package_digest: visible_context_package_digest ?? (isObject(visible) ? computeVisibleContextPackageDigest(visible) : null),
    visible_context_approval: safeClone(visible_context_approval ?? buildVisibleContextAuditApproval(stage21_result ?? {})),
    screen_policy: normalizeStage26ScreenPolicy(screen_policy)
  };
  return deepFreeze(input);
}
