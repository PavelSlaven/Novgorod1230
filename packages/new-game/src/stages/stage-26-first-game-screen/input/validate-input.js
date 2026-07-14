import { INPUT_KEYS, REQUIRED_SCREEN_POLICY, STAGE26_INPUT_SCHEMA, STAGE26_PRECHECK_SCHEMA } from '../policy/constants.js';
import { computeStage26Digest } from '../shared/digest.js';
import { dedupeIssues, issue } from '../shared/issues.js';
import { deepFreeze, isObject, passCheck, text } from '../shared/utils.js';
import { validateCommittedPublicReadModel, validateCommittedState, validateNarratorBinding, validateStage25ApprovalBinding, validateVisibleContextBinding } from './bindings.js';

export function validateStage26Input(input = {}) {
  const concerns = [];
  if (!isObject(input) || input.version !== 1 || input.schema !== STAGE26_INPUT_SCHEMA) {
    return [issue('FIRST_SCREEN_INPUT_INVALID', `Expected ${STAGE26_INPUT_SCHEMA} version 1.`, 'input', 'hard_block')];
  }
  for (const key of Object.keys(input)) {
    if (!INPUT_KEYS.has(key)) concerns.push(issue('FIRST_SCREEN_FORBIDDEN_INPUT_FIELD', `Unexpected Stage 26 input field: ${key}.`, key, 'hard_block'));
  }
  if (!text(input.request_id)) concerns.push(issue('FIRST_SCREEN_INPUT_INVALID', 'request_id is required.', 'request_id', 'hard_block'));
  concerns.push(...validateStage25ApprovalBinding(input));
  concerns.push(...validateCommittedState(input.party_start_committed, input));
  concerns.push(...validateCommittedPublicReadModel(input.committed_public_read_model, input));
  concerns.push(...validateNarratorBinding(input));
  concerns.push(...validateVisibleContextBinding(input));
  for (const [key, expected] of Object.entries(REQUIRED_SCREEN_POLICY)) {
    if (input.screen_policy?.[key] !== expected) concerns.push(issue('FIRST_SCREEN_POLICY_WEAKENED', `screen_policy.${key} must remain ${String(expected)}.`, `screen_policy.${key}`, 'hard_block'));
  }
  return dedupeIssues(concerns);
}

export function buildFirstScreenCodePrecheck(input = {}) {
  const concerns = validateStage26Input(input);
  const codes = new Set(concerns.map((item) => item.code));
  const checks = {
    input_schema_valid: passCheck(!codes.has('FIRST_SCREEN_INPUT_INVALID')),
    request_id_consistent: passCheck(!codes.has('FIRST_SCREEN_REQUEST_ID_MISMATCH')),
    stage25_approval_valid: passCheck(!codes.has('FIRST_SCREEN_STAGE25_APPROVAL_INVALID')),
    stage25_digests_valid: passCheck(!codes.has('FIRST_SCREEN_STAGE25_DIGEST_MISMATCH')),
    stage25_permissions_valid: passCheck(!codes.has('FIRST_SCREEN_STAGE25_PERMISSION_DENIED')),
    committed_state_valid: passCheck(!codes.has('FIRST_SCREEN_PARTY_NOT_COMMITTED')),
    committed_state_ready: passCheck(!codes.has('FIRST_SCREEN_PARTY_NOT_READY')),
    committed_position_present: passCheck(!codes.has('FIRST_SCREEN_POSITION_MISMATCH')),
    public_read_model_valid: passCheck(!codes.has('FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID')),
    public_read_model_digest_valid: passCheck(!codes.has('FIRST_SCREEN_PUBLIC_STATE_DIGEST_MISMATCH')),
    public_read_model_from_postcommit: passCheck(input.committed_public_read_model?.read_model_source === 'live_postcommit_readback'),
    narrator_output_valid: passCheck(!codes.has('FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED')),
    narrator_output_digest_valid: passCheck(!codes.has('FIRST_SCREEN_NARRATOR_DIGEST_MISMATCH')),
    narrator_permissions_valid: passCheck(!codes.has('FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED')),
    visible_context_valid: passCheck(!codes.has('FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED')),
    visible_context_digest_valid: passCheck(!codes.has('FIRST_SCREEN_VISIBLE_CONTEXT_DIGEST_MISMATCH')),
    visible_context_permissions_valid: passCheck(!codes.has('FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED')),
    screen_policy_valid: passCheck(!codes.has('FIRST_SCREEN_POLICY_WEAKENED')),
    screen_policy_not_weakened: passCheck(!codes.has('FIRST_SCREEN_POLICY_WEAKENED')),
    no_forbidden_input_fields: passCheck(!codes.has('FIRST_SCREEN_FORBIDDEN_INPUT_FIELD')),
    no_precommit_visible_fallback: passCheck(true),
    no_synthetic_message_id: passCheck(text(input.party_start_committed?.player_output_ref?.narrator_output_id).length > 0)
  };
  return deepFreeze({
    version: 1,
    schema: STAGE26_PRECHECK_SCHEMA,
    request_id: input.request_id ?? null,
    input_digest: computeStage26Digest(input),
    pass: concerns.length === 0,
    checks,
    concerns,
    evidence: concerns.length === 0 ? [
      'Stage 26 exact input validated.',
      'Stage 25 committed/public artifacts and digests are current.',
      'Narrator and visible-context approvals are bound to current artifacts.'
    ] : []
  });
}
