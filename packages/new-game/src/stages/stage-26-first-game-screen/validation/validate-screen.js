import { STAGE26_CODE_VALIDATION_SCHEMA, STAGE26_SCREEN_SCHEMA } from '../policy/constants.js';
import { buildStage26ReferenceIndex } from '../references/reference-index.js';
import { computeStage26Digest } from '../shared/digest.js';
import { dedupeIssues, issue } from '../shared/issues.js';
import { deepFreeze, isObject, passCheck } from '../shared/utils.js';
import { validateActionPanel, validateAttentionPanel, validateDeliveryState, validateMapPanel, validatePositionPanel, validateTimePanel } from './panels.js';
import { findForbiddenFirstScreenFields, findRawIdLeaks } from './security.js';

export function validateFirstGameScreen(screen = {}, input = {}) {
  const concerns = [];
  const index = buildStage26ReferenceIndex(input);
  if (!isObject(screen) || screen.version !== 1 || screen.schema !== STAGE26_SCREEN_SCHEMA) concerns.push(issue('FIRST_SCREEN_SCHEMA_MISMATCH', `Expected ${STAGE26_SCREEN_SCHEMA} version 1.`, 'screen', 'format_error'));
  if (screen.screen_status !== 'ready') concerns.push(issue('FIRST_SCREEN_NOT_READY', 'screen_status must be ready.', 'screen.screen_status', 'format_error'));
  if (screen.request_id !== input.request_id) concerns.push(issue('FIRST_SCREEN_REQUEST_ID_MISMATCH', 'Screen request_id mismatch.', 'screen.request_id', 'hard_block'));
  if (screen.party_id !== input.party_start_committed?.party_id || screen.turn_number !== 0) concerns.push(issue('FIRST_SCREEN_PARTY_NOT_READY', 'Screen party/turn binding is invalid.', 'screen.party_id', 'hard_block'));
  if (screen.main_prose !== input.approved_narrator_output?.prose) concerns.push(issue('FIRST_SCREEN_MAIN_PROSE_MISMATCH', 'main_prose must equal approved narrator prose.', 'screen.main_prose', 'upstream_block'));
  validatePositionPanel(screen.position_panel, input, concerns);
  validateTimePanel(screen.time_panel, input, concerns);
  validateAttentionPanel(screen.attention_panel, index, concerns);
  validateActionPanel(screen.action_panel, input, index, concerns);
  validateMapPanel(screen.map_panel, input, index, concerns);
  if (screen.action_panel?.free_text_input?.enabled !== true) concerns.push(issue('FIRST_SCREEN_FREE_TEXT_DISABLED', 'Free-text input must be enabled.', 'screen.action_panel.free_text_input.enabled', 'format_error'));
  if (screen.action_panel?.free_text_input?.input_contract !== 'player_intent_not_world_fact') concerns.push(issue('FIRST_SCREEN_INPUT_CONTRACT_INVALID', 'First-turn input contract must be player_intent_not_world_fact.', 'screen.action_panel.free_text_input.input_contract', 'format_error'));
  validateDeliveryState(screen.delivery_state, input, concerns);
  for (const leak of findForbiddenFirstScreenFields(screen)) concerns.push(issue(leak.code, leak.message, leak.path, leak.severity));
  for (const leak of findRawIdLeaks(screen)) concerns.push(leak);
  const pass = concerns.length === 0;
  const checks = {
    party_committed: passCheck(input.party_start_committed?.commit_status === 'committed'),
    party_ready: passCheck(input.party_start_committed?.party_state?.status === 'ready'),
    narrator_output_approved: passCheck(input.narrator_prose_approval?.pass === true),
    visible_context_approved: passCheck(input.visible_context_approval?.pass === true),
    main_prose_matches_approved_output: passCheck(screen.main_prose === input.approved_narrator_output?.prose),
    position_matches_committed_position: passCheck(!concerns.some((item) => item.code === 'FIRST_SCREEN_POSITION_MISMATCH')),
    time_panel_matches_committed_clock: passCheck(!concerns.some((item) => ['FIRST_SCREEN_TIME_PANEL_CLOCK_CONFLICT', 'FIRST_SCREEN_LIGHT_PANEL_CONFLICT', 'FIRST_SCREEN_WEATHER_PANEL_CONFLICT'].includes(item.code))),
    action_options_refs_valid: passCheck(!concerns.some((item) => item.code.startsWith('FIRST_SCREEN_ACTION_'))),
    attention_refs_valid: passCheck(!concerns.some((item) => item.code === 'FIRST_SCREEN_ATTENTION_REF_NOT_FOUND')),
    map_uses_character_known_only: passCheck(!concerns.some((item) => item.code.startsWith('FIRST_SCREEN_MAP_') || item.code === 'FIRST_SCREEN_UNKNOWN_ROUTE_DESTINATION_LEAK')),
    hidden_state_absent: passCheck(!concerns.some((item) => item.code.includes('HIDDEN') || item.code.includes('PRIVATE') || item.code.includes('CLOSED_CONTAINER') || item.code.includes('FUTURE_EVENT') || item.code.includes('TRUE_OWNERSHIP'))),
    audit_absent: passCheck(!concerns.some((item) => item.code === 'FIRST_SCREEN_AUDIT_TEXT_LEAK')),
    source_trace_absent: passCheck(!concerns.some((item) => item.code === 'FIRST_SCREEN_SOURCE_TRACE_LEAK')),
    raw_json_absent: passCheck(!concerns.some((item) => item.code === 'FIRST_SCREEN_RAW_JSON_LEAK')),
    free_text_input_enabled: passCheck(screen.action_panel?.free_text_input?.enabled === true),
    first_turn_contract_visible: passCheck(screen.action_panel?.free_text_input?.input_contract === 'player_intent_not_world_fact')
  };
  return deepFreeze({
    version: 1,
    schema: STAGE26_CODE_VALIDATION_SCHEMA,
    request_id: input.request_id ?? null,
    screen_digest: computeStage26Digest(screen),
    pass,
    checks,
    concerns: dedupeIssues(concerns),
    evidence: pass ? ['First screen passed deterministic structure, reference, provenance and player-safety checks.'] : []
  });
}
