export {
  validateVisibleContextPackageBoundary as validateVisibleContextPackage,
  buildVisibleContextCodePrecheckBoundary as buildVisibleContextCodePrecheck
} from '../../../visible-context/boundary-validation.js';
import { STAGE20_OUTPUT_SCHEMA, STAGE20_PRECHECK_SCHEMA } from '../policy/constants.js';

export function validateStage20CommitPermission(output, precheck) {
  const reasons = [];
  if (output?.version !== 1 || output?.schema !== STAGE20_OUTPUT_SCHEMA) reasons.push('invalid_visible_context_schema');
  if (!['formed', 'empty_limited'].includes(output?.visible_context_status)) reasons.push('visible_context_not_audit_ready');
  if (precheck?.version !== 1 || precheck?.schema !== STAGE20_PRECHECK_SCHEMA || precheck?.pass !== true) reasons.push('code_precheck_failed');
  return {
    can_continue_to_visible_context_audit: reasons.length === 0,
    can_send_to_narrator: false,
    can_write_visible_context_snapshot: false,
    can_generate_player_facing_prose: false,
    reasons
  };
}
