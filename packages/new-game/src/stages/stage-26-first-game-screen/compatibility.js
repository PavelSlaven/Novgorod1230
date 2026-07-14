import { STAGE26_RESULT_SCHEMA } from './policy/constants.js';
import { computeStage26Digest } from './shared/digest.js';
import { issue } from './shared/issues.js';
import { isObject } from './shared/utils.js';
import { buildStage26ScreenApproval } from '@rus/contracts';

export function buildStage26Approval(result = {}) {
  return buildStage26ScreenApproval(result);
}

export function validateStage26ToStage27Handoff(result = {}) {
  const concerns = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE26_RESULT_SCHEMA || result.pass !== true) return [issue('FIRST_SCREEN_INPUT_INVALID', 'Successful Stage 26 result is required.', 'stage26_result', 'hard_block')];
  if (result.first_game_screen?.screen_status !== 'ready') concerns.push(issue('FIRST_SCREEN_NOT_READY', 'Stage 26 screen is not ready.', 'stage26_result.first_game_screen', 'hard_block'));
  if (result.screen_digest !== computeStage26Digest(result.first_game_screen)) concerns.push(issue('FIRST_SCREEN_STAGE25_DIGEST_MISMATCH', 'Stage 26 screen digest mismatch.', 'stage26_result.screen_digest', 'hard_block'));
  for (const key of ['can_create_delivery_attempt', 'can_show_screen', 'can_accept_first_turn_intent']) {
    if (result.delivery_permission?.[key] !== true) concerns.push(issue('FIRST_SCREEN_STAGE25_PERMISSION_DENIED', `Stage 26 permission ${key} must be true.`, `stage26_result.delivery_permission.${key}`, 'hard_block'));
  }
  return concerns;
}

export function validateProvidedStage26Result() {
  throw new Error('Provided Stage 26 input/screen/audit/result is forbidden. Supply only Stage 26 role executors to the isolated block.');
}
