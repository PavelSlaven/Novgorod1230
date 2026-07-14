import { ACTION_REPAIR_CODES, LABEL_REPAIR_CODES, SCREEN_FORMAT_CODES } from '../policy/constants.js';
import { array } from '../shared/utils.js';

export function routeForStage26Concerns(concerns) {
  const codes = new Set(array(concerns).map((item) => item.code));
  let route = 'blocked';
  if ([...codes].some((code) => ACTION_REPAIR_CODES.has(code))) route = 'first_screen_action_label_repair';
  else if ([...codes].some((code) => LABEL_REPAIR_CODES.has(code))) route = 'first_screen_label_semantic_repair';
  else if ([...codes].some((code) => code.includes('PUBLIC_READ_MODEL') || code.includes('PUBLIC_STATE'))) route = 'party_public_read_model_repair';
  else if ([...codes].some((code) => code.includes('DELIVERY') || code.includes('OPENING_PRESENTED'))) route = 'delivery_state_repair';
  else if ([...codes].some((code) => code.includes('STAGE25') || code.includes('PARTY_NOT'))) route = 'stage25_postcommit_repair';
  else if ([...codes].some((code) => code.includes('NARRATOR') || code.includes('MAIN_PROSE'))) route = 'narrator_prose_repair';
  else if ([...codes].some((code) => code.includes('VISIBLE_CONTEXT'))) route = 'visible_context_repair';
  else if ([...codes].every((code) => SCREEN_FORMAT_CODES.has(code))) route = 'first_screen_format_repair';
  return {
    version: 1,
    schema: 'first_screen_repair_route',
    return_to_stage: route,
    repair_kind: route,
    reason: [...codes].join(',') || 'Stage 26 blocked.',
    supporting_concern_codes: [...codes]
  };
}
