import { ACTION_CHECK_KEYS, SAFETY_CHECK_KEYS, STAGE26_ACTION_AUDIT_SCHEMA, STAGE26_SAFETY_AUDIT_SCHEMA } from '../policy/constants.js';
import { buildStage26ReferenceIndex, publicList, serializeReferenceIndex } from '../references/reference-index.js';
import { computeStage26Digest } from '../shared/digest.js';
import { deepFreeze, safeClone } from '../shared/utils.js';

export function buildSafetyAuditorRoleInput(input, screen) {
  return deepFreeze({
    version: 1,
    schema: 'first_screen_safety_audit_request',
    request_id: input.request_id,
    first_game_screen: safeClone(screen),
    approved_narrator_output: safeClone(input.approved_narrator_output),
    approved_visible_context: safeClone(input.approved_visible_context),
    committed_public_read_model: safeClone(input.committed_public_read_model),
    screen_policy: safeClone(input.screen_policy),
    reference_index: serializeReferenceIndex(buildStage26ReferenceIndex(input)),
    output_contract: { version: 1, schema: STAGE26_SAFETY_AUDIT_SCHEMA, required_checks: [...SAFETY_CHECK_KEYS] }
  });
}

export function buildActionAuditorRoleInput(input, screen) {
  return deepFreeze({
    version: 1,
    schema: 'first_screen_action_label_audit_request',
    request_id: input.request_id,
    attention_panel: safeClone(screen.attention_panel),
    action_panel: safeClone(screen.action_panel),
    map_unknown_exits: safeClone(screen.map_panel?.unknown_exits ?? []),
    approved_action_options: safeClone(input.approved_narrator_output?.action_options ?? []),
    committed_action_targets: safeClone(publicList(input.committed_public_read_model, 'action_targets')),
    screen_digest: computeStage26Digest(screen),
    output_contract: { version: 1, schema: STAGE26_ACTION_AUDIT_SCHEMA, required_checks: [...ACTION_CHECK_KEYS] }
  });
}
