import { STAGE26_FIRST_GAME_SCREEN_RESULT_SCHEMA } from '../schema-names.js';
import { computeStage26ScreenDigest } from '../digests.js';

export function validateStage26ResultForDelivery(result = {}) {
  const issues = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE26_FIRST_GAME_SCREEN_RESULT_SCHEMA || result.pass !== true) {
    return [issue('FIRST_SCREEN_INPUT_INVALID', 'Successful Stage 26 result is required.', 'stage26_result')];
  }
  if (result.first_game_screen?.screen_status !== 'ready') issues.push(issue('FIRST_SCREEN_NOT_READY', 'Stage 26 screen is not ready.', 'stage26_result.first_game_screen'));
  if (result.screen_digest !== computeStage26ScreenDigest(result.first_game_screen)) issues.push(issue('FIRST_SCREEN_SCREEN_DIGEST_MISMATCH', 'Stage 26 screen digest mismatch.', 'stage26_result.screen_digest'));
  for (const key of ['can_create_delivery_attempt', 'can_show_screen', 'can_accept_first_turn_intent']) {
    if (result.delivery_permission?.[key] !== true) issues.push(issue('FIRST_SCREEN_DELIVERY_PERMISSION_DENIED', `Stage 26 permission ${key} must be true.`, `stage26_result.delivery_permission.${key}`));
  }
  return issues;
}

export const validateStage26ToStage27HandoffContract = validateStage26ResultForDelivery;

function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function issue(code, message, path) { return { code, message, path, severity: 'hard_block' }; }
