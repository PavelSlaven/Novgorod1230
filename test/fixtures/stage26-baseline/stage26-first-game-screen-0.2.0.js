import { createGateResult } from '../../../legacy/src/world/new-game-pipeline/gate.js';
import {
  buildNarratorProseAuditApproval,
  buildStage25PartyCommitApproval,
  buildStage26ScreenApproval,
  buildVisibleContextAuditApproval,
  computeNarratorStartingProseDigest,
  computeStage25ArtifactDigest,
  computeStage26ScreenDigest,
  computeVisibleContextPackageDigest,
  NARRATOR_PROSE_AUDIT_APPROVAL_SCHEMA,
  PARTY_PUBLIC_STATE_SCHEMA,
  STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA,
  STAGE26_SCREEN_APPROVAL_SCHEMA,
  VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA
} from '@rus/contracts';

export const STAGE26_INPUT_SCHEMA = 'first_game_screen_input';
export const STAGE26_PRECHECK_SCHEMA = 'first_screen_code_precheck';
export const STAGE26_SCREEN_SCHEMA = 'first_game_screen';
export const STAGE26_CODE_VALIDATION_SCHEMA = 'first_screen_code_validation';
export const STAGE26_SAFETY_AUDIT_SCHEMA = 'first_screen_safety_audit';
export const STAGE26_ACTION_AUDIT_SCHEMA = 'first_screen_action_label_audit';
export const STAGE26_RESULT_SCHEMA = 'stage26_first_game_screen_result';
export const STAGE26_APPROVAL_SCHEMA = STAGE26_SCREEN_APPROVAL_SCHEMA;
export const STAGE26_NARRATOR_APPROVAL_SCHEMA = NARRATOR_PROSE_AUDIT_APPROVAL_SCHEMA;
export const STAGE26_DELIVERY_POLICY_SCHEMA = 'first_screen_delivery_policy';

export const STAGE26_SEVERITIES = Object.freeze([
  'format_error',
  'repairable',
  'upstream_block',
  'hard_block',
  'delivery_block'
]);

export const STAGE26_REPAIR_ROUTES = Object.freeze([
  'first_screen_format_repair',
  'first_screen_label_semantic_repair',
  'first_screen_action_label_repair',
  'party_public_read_model_repair',
  'stage25_postcommit_repair',
  'narrator_prose_repair',
  'visible_context_repair',
  'delivery_state_repair',
  'blocked',
  'manual_review'
]);

export const STAGE26_CONCERN_CODES = Object.freeze([
  'FIRST_SCREEN_INPUT_INVALID',
  'FIRST_SCREEN_FORBIDDEN_INPUT_FIELD',
  'FIRST_SCREEN_REQUEST_ID_MISMATCH',
  'FIRST_SCREEN_STAGE25_APPROVAL_INVALID',
  'FIRST_SCREEN_STAGE25_PERMISSION_DENIED',
  'FIRST_SCREEN_STAGE25_DIGEST_MISMATCH',
  'FIRST_SCREEN_PARTY_NOT_COMMITTED',
  'FIRST_SCREEN_PARTY_NOT_READY',
  'FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID',
  'FIRST_SCREEN_PUBLIC_STATE_DIGEST_MISMATCH',
  'FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED',
  'FIRST_SCREEN_NARRATOR_DIGEST_MISMATCH',
  'FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED',
  'FIRST_SCREEN_VISIBLE_CONTEXT_DIGEST_MISMATCH',
  'FIRST_SCREEN_POLICY_WEAKENED',
  'FIRST_SCREEN_SCHEMA_MISMATCH',
  'FIRST_SCREEN_NOT_READY',
  'FIRST_SCREEN_MAIN_PROSE_MISMATCH',
  'FIRST_SCREEN_POSITION_MISMATCH',
  'FIRST_SCREEN_TIME_PANEL_CLOCK_CONFLICT',
  'FIRST_SCREEN_LIGHT_PANEL_CONFLICT',
  'FIRST_SCREEN_WEATHER_PANEL_CONFLICT',
  'FIRST_SCREEN_ATTENTION_REF_NOT_FOUND',
  'FIRST_SCREEN_ACTION_OPTION_NOT_APPROVED',
  'FIRST_SCREEN_ACTION_REF_NOT_FOUND',
  'FIRST_SCREEN_ACTION_CREATED_TARGET',
  'FIRST_SCREEN_ACTION_LABEL_HIDDEN_LEAK',
  'FIRST_SCREEN_ACTION_PROMISES_OUTCOME',
  'FIRST_SCREEN_ACTION_USES_HIDDEN_TRUTH',
  'FIRST_SCREEN_MAP_REF_NOT_KNOWN',
  'FIRST_SCREEN_UNKNOWN_ROUTE_DESTINATION_LEAK',
  'FIRST_SCREEN_HIDDEN_STATE_LEAK',
  'FIRST_SCREEN_PRIVATE_MOTIVE_LEAK',
  'FIRST_SCREEN_CLOSED_CONTAINER_CONTENTS_LEAK',
  'FIRST_SCREEN_FUTURE_EVENT_LEAK',
  'FIRST_SCREEN_TRUE_OWNERSHIP_LEAK',
  'FIRST_SCREEN_RAW_JSON_LEAK',
  'FIRST_SCREEN_AUDIT_TEXT_LEAK',
  'FIRST_SCREEN_SOURCE_TRACE_LEAK',
  'FIRST_SCREEN_DEBUG_TEXT_LEAK',
  'FIRST_SCREEN_RAW_ID_LEAK',
  'FIRST_SCREEN_TECHNICAL_TEXT',
  'FIRST_SCREEN_FREE_TEXT_DISABLED',
  'FIRST_SCREEN_INPUT_CONTRACT_INVALID',
  'FIRST_SCREEN_DELIVERY_ID_MISSING',
  'FIRST_SCREEN_OPENING_PRESENTED_WITHOUT_ACK',
  'FIRST_SCREEN_AUDIT_INVALID',
  'FIRST_SCREEN_AUDIT_FAILED',
  'FIRST_SCREEN_REPAIR_INVALID',
  'FIRST_SCREEN_REPAIR_EXHAUSTED'
]);

export const REQUIRED_SCREEN_POLICY = Object.freeze({
  show_narrator_prose: true,
  show_public_position: true,
  show_time_and_light: true,
  show_body_status: true,
  show_attention_options: true,
  show_action_options: true,
  show_free_text_input: true,
  show_debug_ids: false,
  show_json: false,
  show_audit: false,
  show_source_trace: false,
  show_hidden_state: false,
  require_safe_labels: true,
  require_action_options_from_approved_refs: true,
  require_attention_from_committed_refs: true,
  require_map_from_current_knowledge: true,
  require_first_turn_input_as_intent_not_fact: true,
  require_delivery_ack_before_presented: true,
  require_delivery_ack_before_first_turn: true
});

const READY_PHASE = 'awaiting_player_input';
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const TECHNICAL_TOKEN_PATTERN = /\b(?:G[1-5]_|g[1-5]_|npc_|item_|container_|anchor_|place_|location_|minilocation_|region_|candidate_|source_|audit_|hidden_)[A-Za-z0-9_-]+\b/u;
const INPUT_KEYS = new Set([
  'version', 'schema', 'request_id', 'stage25_party_commit_approval', 'party_start_committed',
  'committed_public_read_model', 'approved_narrator_output', 'narrator_output_digest',
  'narrator_prose_approval', 'approved_visible_context', 'visible_context_package_digest',
  'visible_context_approval', 'screen_policy'
]);
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'hidden_state', 'private_motives', 'private_knowledge', 'closed_container_contents',
  'future_event_timers', 'truth_status_for_system', 'actual_truth_hidden_from_character',
  'audit', 'audit_result', 'repair_route', 'source_trace', 'prompt', 'raw_json',
  'llm_diagnostics', 'diagnostics', 'debug', 'full_hidden_scene_state'
]);
const SAFETY_CHECK_KEYS = Object.freeze([
  'no_new_world_facts', 'hidden_state_absent', 'private_motives_absent',
  'closed_container_truth_absent', 'future_events_absent', 'unknown_route_destination_absent',
  'position_time_consistent', 'technical_text_absent', 'screen_grounded_in_approved_data'
]);
const ACTION_CHECK_KEYS = Object.freeze([
  'attention_labels_grounded', 'action_labels_grounded', 'no_hidden_truth',
  'no_outcome_promises', 'no_created_targets', 'no_unknown_destination',
  'uncertainty_preserved'
]);
const SCREEN_FORMAT_CODES = new Set([
  'FIRST_SCREEN_SCHEMA_MISMATCH', 'FIRST_SCREEN_NOT_READY', 'FIRST_SCREEN_FREE_TEXT_DISABLED',
  'FIRST_SCREEN_INPUT_CONTRACT_INVALID', 'FIRST_SCREEN_DELIVERY_ID_MISSING'
]);
const ACTION_REPAIR_CODES = new Set([
  'FIRST_SCREEN_ACTION_PROMISES_OUTCOME', 'FIRST_SCREEN_ACTION_USES_HIDDEN_TRUTH',
  'FIRST_SCREEN_ACTION_LABEL_HIDDEN_LEAK', 'FIRST_SCREEN_UNKNOWN_ROUTE_DESTINATION_LEAK'
]);
const LABEL_REPAIR_CODES = new Set([
  'FIRST_SCREEN_HIDDEN_STATE_LEAK', 'FIRST_SCREEN_PRIVATE_MOTIVE_LEAK',
  'FIRST_SCREEN_CLOSED_CONTAINER_CONTENTS_LEAK', 'FIRST_SCREEN_FUTURE_EVENT_LEAK',
  'FIRST_SCREEN_TRUE_OWNERSHIP_LEAK', 'FIRST_SCREEN_RAW_ID_LEAK', 'FIRST_SCREEN_TECHNICAL_TEXT'
]);

export function canonicalStage26Json(value) {
  return JSON.stringify(sortValue(value));
}

export function computeStage26Digest(value) {
  return computeStage26ScreenDigest(value);
}

export function normalizeStage26ScreenPolicy(additionalPolicy = {}) {
  if (!isObject(additionalPolicy)) throw new Error('Stage 26 screen policy must be an object.');
  for (const [key, required] of Object.entries(REQUIRED_SCREEN_POLICY)) {
    if (Object.hasOwn(additionalPolicy, key) && additionalPolicy[key] !== required) {
      throw new Error(`Stage 26 screen policy cannot weaken required invariant: ${key}.`);
    }
  }
  return deepFreeze({ ...REQUIRED_SCREEN_POLICY, ...safeClone(additionalPolicy) });
}

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

export function buildStage26ReferenceIndex(input = {}) {
  const publicState = input.committed_public_read_model ?? {};
  const visible = input.approved_visible_context ?? {};
  const index = {
    visibleNpcRefs: new Set(),
    visibleItemRefs: new Set(),
    visibleContainerRefs: new Set(),
    visibleExitRefs: new Set(),
    visibleCueRefs: new Set(),
    attentionTargetRefs: new Set(),
    actionTargetRefs: new Set(),
    knownNodeRefs: new Set(),
    knownRouteRefs: new Set(),
    approvedActionOptionIds: new Set(),
    approvedNarratorUsedRefs: new Set(),
    availableActions: new Map()
  };
  collectRecordRefs(publicList(publicState, 'npcs'), index.visibleNpcRefs, ['npc_instance_id', 'npc_ref', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'items'), index.visibleItemRefs, ['item_instance_id', 'item_ref', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'containers'), index.visibleContainerRefs, ['container_instance_id', 'container_ref', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'exits'), index.visibleExitRefs, ['exit_id', 'anchor_id', 'route_id', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'cues'), index.visibleCueRefs, ['cue_id', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'attention_targets'), index.attentionTargetRefs, ['target_ref', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'action_targets'), index.actionTargetRefs, ['target_ref', 'source_ref', 'anchor_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id', 'id']);
  collectRecordRefs(mapList(publicState, 'known_nodes'), index.knownNodeRefs, ['node_ref', 'node_id', 'anchor_id', 'source_ref', 'id']);
  collectRecordRefs(publicList(publicState, 'known_routes'), index.knownRouteRefs, ['route_ref', 'route_id', 'edge_id', 'source_ref', 'id']);
  collectVisibleContextRefs(visible, index);
  for (const option of array(input.approved_narrator_output?.action_options)) {
    if (text(option?.option_id)) index.approvedActionOptionIds.add(option.option_id);
  }
  for (const ref of array(input.approved_narrator_output?.used_visible_context_refs)) {
    if (text(ref)) index.approvedNarratorUsedRefs.add(ref);
  }
  for (const action of array(visible.available_actions_context)) {
    if (!text(action?.action_id)) continue;
    index.availableActions.set(action.action_id, safeClone(action));
    const target = targetRefValue(action.target_ref);
    if (target) index.actionTargetRefs.add(target);
  }
  return index;
}

export function buildFirstGameScreenProjection(input = {}) {
  const precheck = buildFirstScreenCodePrecheck(input);
  if (!precheck.pass) throw stage26Error('input_validation', precheck.concerns, 'Stage 26 input precheck failed.');
  const publicState = input.committed_public_read_model;
  const committed = input.party_start_committed;
  const narrator = input.approved_narrator_output;
  const index = buildStage26ReferenceIndex(input);
  const delivery = resolveCommittedDeliveryState(committed, publicState);
  const screen = {
    version: 1,
    schema: STAGE26_SCREEN_SCHEMA,
    request_id: input.request_id,
    screen_status: 'ready',
    party_id: committed.party_id,
    turn_number: committed.party_state.current_turn_number,
    main_prose: requirePublicText(narrator.prose, 'approved_narrator_output.prose'),
    position_panel: buildPositionPanel(publicState, committed),
    time_panel: buildTimePanel(publicState, committed),
    character_panel: buildCharacterPanel(publicState),
    attention_panel: buildAttentionPanel(publicState),
    action_panel: {
      suggested_actions: buildApprovedActions(narrator.action_options),
      free_text_input: {
        enabled: true,
        placeholder: 'Что ты делаешь?',
        input_contract: 'player_intent_not_world_fact'
      }
    },
    map_panel: buildMapPanel(publicState),
    ui_safety_boundary: {
      hidden_state_not_included: false,
      audit_not_included: false,
      source_trace_not_included: false,
      raw_ids_not_included: false,
      player_sees_only_character_safe_context: false
    },
    delivery_state: delivery,
    provenance: {
      stage25_postcommit_state_digest: input.stage25_party_commit_approval.postcommit_state_digest,
      committed_public_read_model_digest: input.stage25_party_commit_approval.party_public_state_digest,
      narrator_output_digest: input.narrator_output_digest,
      visible_context_package_digest: input.visible_context_package_digest,
      approved_reference_counts: summarizeReferenceIndex(index)
    }
  };
  return deepFreeze(screen);
}

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

export function validateFirstScreenSafetyAudit(audit = {}, screen = {}, input = {}) {
  return validateAuditCommon(audit, {
    schema: STAGE26_SAFETY_AUDIT_SCHEMA,
    requiredChecks: SAFETY_CHECK_KEYS,
    screen,
    input,
    requirePermissions: true
  });
}

export function validateFirstScreenActionAudit(audit = {}, screen = {}, input = {}) {
  return validateAuditCommon(audit, {
    schema: STAGE26_ACTION_AUDIT_SCHEMA,
    requiredChecks: ACTION_CHECK_KEYS,
    screen,
    input,
    requirePermissions: false
  });
}

export async function runStage26FirstGameScreenBlock({
  input,
  safetyAuditor,
  actionLabelAuditor,
  formatRepairer = null,
  semanticRepairer = null,
  seniorRepairer = null,
  maxRepairCycles = 2
} = {}) {
  const precheck = buildFirstScreenCodePrecheck(input);
  if (!precheck.pass) return buildStage26Failure({ input, phase: 'input_validation', precheck, concerns: precheck.concerns });
  if (typeof safetyAuditor !== 'function' || typeof actionLabelAuditor !== 'function') {
    return buildStage26Failure({ input, phase: 'audit_setup', precheck, concerns: [issue('FIRST_SCREEN_AUDIT_INVALID', 'Stage 26 requires safetyAuditor and actionLabelAuditor.', 'auditors', 'hard_block')] });
  }

  let screen;
  try {
    screen = buildFirstGameScreenProjection(input);
  } catch (error) {
    return buildStage26Failure({ input, phase: 'projection', precheck, concerns: extractIssues(error, 'FIRST_SCREEN_INPUT_INVALID') });
  }

  const validationHistory = [];
  const auditHistory = [];
  const repairHistory = [];
  const diagnostics = {
    projection_attempts: 1,
    safety_audit_attempts: 0,
    action_audit_attempts: 0,
    format_repair_attempts: 0,
    semantic_repair_attempts: 0,
    senior_repair_attempts: 0
  };

  for (let cycle = 0; cycle <= maxRepairCycles + 1; cycle += 1) {
    let codeValidation = validateFirstGameScreen(screen, input);
    validationHistory.push(stripSensitiveValidation(codeValidation));
    if (!codeValidation.pass) {
      const formatOnly = codeValidation.concerns.every((item) => SCREEN_FORMAT_CODES.has(item.code));
      if (formatOnly && typeof formatRepairer === 'function' && diagnostics.format_repair_attempts < 1) {
        diagnostics.format_repair_attempts += 1;
        const repaired = await invokeRole(formatRepairer, buildFormatRepairRoleInput({ artifactKind: 'first_game_screen', artifact: screen, issues: codeValidation.concerns, input }), 'FirstScreenFormatRepairer');
        const repairIssues = validateScreenRepair(screen, repaired, input, { formatOnly: true });
        if (repairIssues.length > 0) return buildStage26Failure({ input, phase: 'format_repair', precheck, screen, codeValidation, concerns: repairIssues, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
        repairHistory.push({ cycle, repair_kind: 'first_screen_format_repair', concerns: safeClone(codeValidation.concerns) });
        screen = deepFreeze(safeClone(repaired));
        continue;
      }
      return buildStage26Failure({ input, phase: 'code_validation', precheck, screen, codeValidation, concerns: codeValidation.concerns, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    }

    diagnostics.safety_audit_attempts += 1;
    let safetyAuditRaw = await invokeRole(safetyAuditor, buildSafetyAuditorRoleInput(input, screen), 'FirstScreenSafetyAuditor');
    let safetyIssues = validateFirstScreenSafetyAudit(safetyAuditRaw, screen, input);
    if (safetyIssues.length > 0 && typeof formatRepairer === 'function' && diagnostics.format_repair_attempts < 2) {
      diagnostics.format_repair_attempts += 1;
      safetyAuditRaw = await invokeRole(formatRepairer, buildFormatRepairRoleInput({ artifactKind: STAGE26_SAFETY_AUDIT_SCHEMA, artifact: safetyAuditRaw, issues: safetyIssues, input, screen }), 'FirstScreenFormatRepairer');
      safetyIssues = validateFirstScreenSafetyAudit(safetyAuditRaw, screen, input);
    }
    if (safetyIssues.length > 0) return buildStage26Failure({ input, phase: 'safety_audit_format', precheck, screen, codeValidation, concerns: safetyIssues, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    auditHistory.push({ cycle, kind: STAGE26_SAFETY_AUDIT_SCHEMA, audit: safeClone(safetyAuditRaw) });

    diagnostics.action_audit_attempts += 1;
    let actionAuditRaw = await invokeRole(actionLabelAuditor, buildActionAuditorRoleInput(input, screen), 'FirstScreenActionLabelAuditor');
    let actionIssues = validateFirstScreenActionAudit(actionAuditRaw, screen, input);
    if (actionIssues.length > 0 && typeof formatRepairer === 'function' && diagnostics.format_repair_attempts < 3) {
      diagnostics.format_repair_attempts += 1;
      actionAuditRaw = await invokeRole(formatRepairer, buildFormatRepairRoleInput({ artifactKind: STAGE26_ACTION_AUDIT_SCHEMA, artifact: actionAuditRaw, issues: actionIssues, input, screen }), 'FirstScreenFormatRepairer');
      actionIssues = validateFirstScreenActionAudit(actionAuditRaw, screen, input);
    }
    if (actionIssues.length > 0) return buildStage26Failure({ input, phase: 'action_audit_format', precheck, screen, codeValidation, safetyAudit: safetyAuditRaw, concerns: actionIssues, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    auditHistory.push({ cycle, kind: STAGE26_ACTION_AUDIT_SCHEMA, audit: safeClone(actionAuditRaw) });

    if (safetyAuditRaw.pass === true && actionAuditRaw.pass === true) {
      const finalized = finalizeSafetyBoundary(screen, codeValidation, safetyAuditRaw, actionAuditRaw);
      codeValidation = validateFirstGameScreen(finalized, input);
      validationHistory.push(stripSensitiveValidation(codeValidation));
      if (!codeValidation.pass) return buildStage26Failure({ input, phase: 'final_validation', precheck, screen: finalized, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, concerns: codeValidation.concerns, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
      return buildStage26Success({ input, precheck, screen: finalized, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, validationHistory, auditHistory, repairHistory, diagnostics });
    }

    const semanticConcerns = normalizeAuditConcerns([
      ...array(safetyAuditRaw.concerns),
      ...array(actionAuditRaw.concerns)
    ]);
    const route = routeForStage26Concerns(semanticConcerns);
    if (route.return_to_stage !== 'first_screen_label_semantic_repair' && route.return_to_stage !== 'first_screen_action_label_repair') {
      return buildStage26Failure({ input, phase: 'semantic_audit', precheck, screen, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, concerns: semanticConcerns, repairRoute: route, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    }

    const useSenior = cycle >= maxRepairCycles;
    const repairer = useSenior ? seniorRepairer : semanticRepairer;
    if (typeof repairer !== 'function') {
      return buildStage26Failure({ input, phase: useSenior ? 'senior_repair' : 'semantic_repair', precheck, screen, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, concerns: semanticConcerns.length ? semanticConcerns : [issue('FIRST_SCREEN_AUDIT_FAILED', 'Screen semantic audit failed.', 'audit', 'repairable')], repairRoute: route, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    }
    if (useSenior) diagnostics.senior_repair_attempts += 1;
    else diagnostics.semantic_repair_attempts += 1;
    const repaired = await invokeRole(repairer, buildSemanticRepairRoleInput({ input, screen, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, route, senior: useSenior }), useSenior ? 'SeniorFirstScreenRepairer' : 'FirstScreenSemanticRepairer');
    const repairIssues = validateScreenRepair(screen, repaired, input, { formatOnly: false });
    if (repairIssues.length > 0) return buildStage26Failure({ input, phase: useSenior ? 'senior_repair' : 'semantic_repair', precheck, screen, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, concerns: repairIssues, repairRoute: route, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    repairHistory.push({ cycle, repair_kind: route.return_to_stage, senior: useSenior, concerns: safeClone(semanticConcerns) });
    screen = deepFreeze(safeClone(repaired));
  }

  return buildStage26Failure({ input, phase: 'repair_exhausted', precheck, screen, concerns: [issue('FIRST_SCREEN_REPAIR_EXHAUSTED', 'Stage 26 repair escalation exhausted.', 'repair', 'hard_block')], histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
}

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

export function findForbiddenFirstScreenFields(value, path = 'screen') {
  const violations = [];
  walkPublicValue(value, path, violations);
  return violations;
}

function validateStage25ApprovalBinding(input) {
  const concerns = [];
  const approval = input.stage25_party_commit_approval;
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA || approval.pass !== true || approval.commit_status !== 'committed') {
    return [issue('FIRST_SCREEN_STAGE25_APPROVAL_INVALID', 'Successful Stage 25 approval is required.', 'stage25_party_commit_approval', 'hard_block')];
  }
  if (approval.request_id !== input.request_id) concerns.push(issue('FIRST_SCREEN_REQUEST_ID_MISMATCH', 'Stage 25 approval request_id mismatch.', 'stage25_party_commit_approval.request_id', 'hard_block'));
  for (const key of ['can_start_stage_26', 'can_show_player_output', 'can_accept_player_input']) {
    if (approval.permissions?.[key] !== true) concerns.push(issue('FIRST_SCREEN_STAGE25_PERMISSION_DENIED', `Stage 25 permission ${key} must be true.`, `stage25_party_commit_approval.permissions.${key}`, 'hard_block'));
  }
  for (const key of ['physical_plan_digest', 'postcommit_state_digest', 'party_start_committed_digest', 'party_public_state_digest']) {
    if (!SHA256_PATTERN.test(approval[key] ?? '')) concerns.push(issue('FIRST_SCREEN_STAGE25_APPROVAL_INVALID', `Stage 25 approval ${key} is required.`, `stage25_party_commit_approval.${key}`, 'hard_block'));
  }
  if (approval.party_start_committed_digest !== computeStage25ArtifactDigest(input.party_start_committed)) concerns.push(issue('FIRST_SCREEN_STAGE25_DIGEST_MISMATCH', 'Committed-state digest mismatch.', 'party_start_committed', 'hard_block'));
  if (approval.party_public_state_digest !== computeStage25ArtifactDigest(input.committed_public_read_model)) concerns.push(issue('FIRST_SCREEN_PUBLIC_STATE_DIGEST_MISMATCH', 'Committed public read-model digest mismatch.', 'committed_public_read_model', 'hard_block'));
  return concerns;
}

function validateCommittedState(committed, input) {
  const concerns = [];
  if (!isObject(committed) || committed.version !== 1 || committed.schema !== 'party_start_committed' || committed.commit_status !== 'committed') return [issue('FIRST_SCREEN_PARTY_NOT_COMMITTED', 'Valid committed party state is required.', 'party_start_committed', 'hard_block')];
  if (committed.request_id !== input.request_id) concerns.push(issue('FIRST_SCREEN_REQUEST_ID_MISMATCH', 'Committed state request_id mismatch.', 'party_start_committed.request_id', 'hard_block'));
  const approval = input.stage25_party_commit_approval;
  if (committed.party_id !== approval?.party_id || committed.transaction_id !== approval?.transaction_id) concerns.push(issue('FIRST_SCREEN_STAGE25_APPROVAL_INVALID', 'Committed identifiers do not match Stage 25 approval.', 'party_start_committed', 'hard_block'));
  const state = committed.party_state;
  if (state?.status !== 'ready' || state?.is_ready_for_player !== true || state?.current_phase !== READY_PHASE || state?.current_turn_number !== 0) concerns.push(issue('FIRST_SCREEN_PARTY_NOT_READY', 'Committed party must be ready at turn zero.', 'party_start_committed.party_state', 'hard_block'));
  if (!isObject(committed.current_position)) concerns.push(issue('FIRST_SCREEN_POSITION_MISMATCH', 'Committed current position is required.', 'party_start_committed.current_position', 'hard_block'));
  if (!isObject(committed.current_clock)) concerns.push(issue('FIRST_SCREEN_TIME_PANEL_CLOCK_CONFLICT', 'Committed current clock is required.', 'party_start_committed.current_clock', 'hard_block'));
  if (!text(committed.player_output_ref?.narrator_output_id) || committed.player_output_ref?.player_visible_message_ready !== true) concerns.push(issue('FIRST_SCREEN_DELIVERY_ID_MISSING', 'Committed narrator message reference is required.', 'party_start_committed.player_output_ref', 'delivery_block'));
  return concerns;
}

function validateCommittedPublicReadModel(model, input) {
  const concerns = [];
  if (!isObject(model) || model.version !== 1 || model.schema !== PARTY_PUBLIC_STATE_SCHEMA) return [issue('FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID', `Committed ${PARTY_PUBLIC_STATE_SCHEMA} version 1 is required.`, 'committed_public_read_model', 'hard_block')];
  if (model.request_id !== input.request_id || model.party_id !== input.party_start_committed?.party_id || model.transaction_id !== input.party_start_committed?.transaction_id) concerns.push(issue('FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID', 'Committed public read-model identifiers mismatch.', 'committed_public_read_model', 'hard_block'));
  if (model.read_model_source !== 'live_postcommit_readback') concerns.push(issue('FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID', 'Public read model must originate from live postcommit readback.', 'committed_public_read_model.read_model_source', 'hard_block'));
  if (model.current_turn_number !== 0) concerns.push(issue('FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID', 'Public read model must be for turn zero.', 'committed_public_read_model.current_turn_number', 'hard_block'));
  if (!sameJson(model.current_position_ref, input.party_start_committed?.current_position)) concerns.push(issue('FIRST_SCREEN_POSITION_MISMATCH', 'Public read-model position does not match committed position.', 'committed_public_read_model.current_position_ref', 'hard_block'));
  if (!sameJson(model.current_clock_ref, input.party_start_committed?.current_clock)) concerns.push(issue('FIRST_SCREEN_TIME_PANEL_CLOCK_CONFLICT', 'Public read-model clock does not match committed clock.', 'committed_public_read_model.current_clock_ref', 'hard_block'));
  for (const field of ['public_position_label', 'public_time_label', 'public_light_label']) {
    if (!text(model[field])) concerns.push(issue('FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID', `committed_public_read_model.${field} is required.`, `committed_public_read_model.${field}`, 'hard_block'));
  }
  return concerns;
}

function validateNarratorBinding(input) {
  const concerns = [];
  const narrator = input.approved_narrator_output;
  const approval = input.narrator_prose_approval;
  if (!isObject(narrator) || narrator.version !== 1 || narrator.schema !== 'narrator_starting_prose' || narrator.prose_status !== 'drafted' || !text(narrator.prose) || !Array.isArray(narrator.action_options)) return [issue('FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED', 'Approved narrator output is invalid.', 'approved_narrator_output', 'upstream_block')];
  if (narrator.request_id !== input.request_id) concerns.push(issue('FIRST_SCREEN_REQUEST_ID_MISMATCH', 'Narrator output request_id mismatch.', 'approved_narrator_output.request_id', 'upstream_block'));
  const digest = computeNarratorStartingProseDigest(narrator);
  if (input.narrator_output_digest !== digest) concerns.push(issue('FIRST_SCREEN_NARRATOR_DIGEST_MISMATCH', 'Narrator output digest mismatch.', 'narrator_output_digest', 'upstream_block'));
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== STAGE26_NARRATOR_APPROVAL_SCHEMA || approval.request_id !== input.request_id || approval.pass !== true || approval.narrator_output_digest !== digest || approval.repair_route != null) concerns.push(issue('FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED', 'Narrator approval is invalid or stale.', 'narrator_prose_approval', 'upstream_block'));
  for (const key of ['can_show_to_player', 'can_write_player_visible_message', 'can_mark_opening_scene_presented']) if (approval?.permissions?.[key] !== true) concerns.push(issue('FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED', `Narrator permission ${key} must be true.`, `narrator_prose_approval.permissions.${key}`, 'upstream_block'));
  if (text(input.party_start_committed?.player_output_ref?.narrator_output_id) !== text(narrator.narrator_output_id ?? narrator.message_id ?? input.party_start_committed?.player_output_ref?.narrator_output_id)) {
    concerns.push(issue('FIRST_SCREEN_NARRATOR_OUTPUT_NOT_APPROVED', 'Committed narrator output reference does not match approved narrator output.', 'party_start_committed.player_output_ref.narrator_output_id', 'upstream_block'));
  }
  return concerns;
}

function validateVisibleContextBinding(input) {
  const concerns = [];
  const visible = input.approved_visible_context;
  const approval = input.visible_context_approval;
  if (!isObject(visible) || visible.version !== 1 || visible.schema !== 'visible_context_package' || visible.visible_context_status !== 'formed') return [issue('FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED', 'Approved visible context is invalid.', 'approved_visible_context', 'upstream_block')];
  if (visible.request_id !== input.request_id) concerns.push(issue('FIRST_SCREEN_REQUEST_ID_MISMATCH', 'Visible context request_id mismatch.', 'approved_visible_context.request_id', 'upstream_block'));
  const digest = computeVisibleContextPackageDigest(visible);
  if (input.visible_context_package_digest !== digest) concerns.push(issue('FIRST_SCREEN_VISIBLE_CONTEXT_DIGEST_MISMATCH', 'Visible-context package digest mismatch.', 'visible_context_package_digest', 'upstream_block'));
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA || approval.request_id !== input.request_id || approval.pass !== true || approval.visible_context_package_digest !== digest) concerns.push(issue('FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED', 'Visible-context approval is invalid or stale.', 'visible_context_approval', 'upstream_block'));
  for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) if (approval?.commit_permission?.[key] !== true) concerns.push(issue('FIRST_SCREEN_VISIBLE_CONTEXT_NOT_APPROVED', `Visible-context permission ${key} must be true.`, `visible_context_approval.commit_permission.${key}`, 'upstream_block'));
  return concerns;
}

function buildPositionPanel(publicState, committed) {
  return {
    public_position_label: requirePublicText(publicState.public_position_label, 'committed_public_read_model.public_position_label'),
    position_ref: safeClone(publicState.current_position_ref),
    committed_position_digest: computeStage26Digest(committed.current_position),
    technical_position_hidden: true,
    debug_position: null
  };
}

function buildTimePanel(publicState, committed) {
  return {
    public_time_label: requirePublicText(publicState.public_time_label, 'committed_public_read_model.public_time_label'),
    public_light_label: requirePublicText(publicState.public_light_label, 'committed_public_read_model.public_light_label'),
    public_weather_label: optionalPublicText(publicState.public_weather_label),
    clock_ref: safeClone(publicState.current_clock_ref),
    committed_clock_digest: computeStage26Digest(committed.current_clock)
  };
}

function buildCharacterPanel(publicState) {
  return {
    public_character_label: optionalPublicText(publicState.public_character_label) ?? 'Ты',
    body_state_summary: publicTextList(publicState.public_body_state_summary ?? publicState.body_state_summary),
    inventory_summary: publicTextList(publicState.public_inventory_summary ?? publicState.inventory_summary),
    warning_badges: publicTextList(publicState.public_warning_badges ?? publicState.warning_badges)
  };
}

function buildAttentionPanel(publicState) {
  return {
    visible_npcs: buildAttentionItems(publicList(publicState, 'npcs'), 'visible_npc'),
    visible_items: buildAttentionItems(publicList(publicState, 'items'), 'visible_item'),
    visible_containers: buildAttentionItems(publicList(publicState, 'containers'), 'visible_container'),
    visible_exits: buildAttentionItems(publicList(publicState, 'exits'), 'visible_exit'),
    audible_or_sensory_cues: buildAttentionItems(publicList(publicState, 'cues'), 'sensory_cue'),
    known_context_hints: buildAttentionItems(publicList(publicState, 'context_hints'), 'known_context_hint')
  };
}

function buildAttentionItems(items, targetType) {
  return array(items).map((item, index) => {
    const sourceRef = resolveRecordRef(item, referenceCandidatesForType(targetType));
    return withoutNullish({
      attention_target_id: text(item.attention_target_id) || sourceRef,
      source_ref: sourceRef,
      label: requirePublicText(item.label ?? item.public_label ?? item.text, `${targetType}[${index}].label`),
      target_type: text(item.target_type) || targetType,
      attention_mode: optionalPublicText(item.attention_mode ?? item.mode),
      risk_hint: optionalPublicText(item.risk_hint),
      certainty: optionalPublicText(item.certainty),
      must_not_reveal_hidden_truth: true
    });
  });
}

function buildApprovedActions(options) {
  return array(options).map((option, index) => ({
    option_id: requireText(option?.option_id, `action_options[${index}].option_id`),
    label: requirePublicText(option?.label, `action_options[${index}].label`),
    action_kind: requireText(option?.action_kind, `action_options[${index}].action_kind`),
    basis: requireText(option?.basis, `action_options[${index}].basis`),
    risk_hint: requireText(option?.risk_hint, `action_options[${index}].risk_hint`),
    target_ref: safeClone(option?.target_ref ?? null),
    basis_refs: safeClone(option?.basis_refs ?? []),
    requires_resolution_pipeline: true,
    must_not_reveal_hidden_truth: option?.must_not_reveal_hidden_truth === true,
    promises_outcome: option?.promises_outcome === true || option?.outcome_guaranteed === true
  }));
}

function buildMapPanel(publicState) {
  const map = publicState.public_visible_map ?? publicState.known_map ?? {};
  return {
    enabled: true,
    map_mode: 'character_known_only',
    known_current_node: buildMapNode(map.known_current_node ?? publicState.known_current_node),
    known_nearby_nodes: array(map.known_nearby_nodes ?? publicState.known_nearby_nodes).map(buildMapNode),
    unknown_exits: array(map.unknown_exits ?? publicState.unknown_exits).map(buildUnknownExit),
    must_not_show_hidden_nodes: true
  };
}

function buildMapNode(item = {}) {
  return withoutNullish({
    node_ref: resolveRecordRef(item, ['node_ref', 'node_id', 'anchor_id', 'source_ref', 'id']),
    label: requirePublicText(item.label ?? item.public_label, 'map node label'),
    certainty: optionalPublicText(item.certainty)
  });
}

function buildUnknownExit(item = {}) {
  return withoutNullish({
    exit_ref: resolveRecordRef(item, ['exit_ref', 'exit_id', 'anchor_id', 'route_id', 'source_ref', 'id']),
    label: requirePublicText(item.label ?? item.public_label, 'unknown exit label'),
    certainty: optionalPublicText(item.certainty),
    destination_unknown: item.destination_unknown !== false,
    exact_destination: item.exact_destination ?? item.destination_ref ?? item.destination_id ?? null
  });
}

function resolveCommittedDeliveryState(committed, publicState) {
  const messageId = text(committed.player_output_ref?.narrator_output_id);
  if (!messageId) throw stage26Error('projection', [issue('FIRST_SCREEN_DELIVERY_ID_MISSING', 'Committed message ID is required.', 'party_start_committed.player_output_ref.narrator_output_id', 'delivery_block')]);
  const ack = isObject(publicState.delivery_state) ? publicState.delivery_state : {};
  const presented = committed.player_output_ref?.opening_scene_presented === true || committed.party_state?.opening_scene_presented === true;
  if (presented && (!text(ack.client_ack_id) || text(ack.message_id) !== messageId)) {
    throw stage26Error('projection', [issue('FIRST_SCREEN_OPENING_PRESENTED_WITHOUT_ACK', 'opening_scene_presented requires matching committed client acknowledgement.', 'committed_public_read_model.delivery_state', 'delivery_block')]);
  }
  return withoutNullish({
    message_id: messageId,
    opening_scene_presented: presented,
    awaiting_client_ack: !presented,
    shown_at: presented ? ack.shown_at : null,
    client_ack_id: presented ? ack.client_ack_id : null
  });
}

function validatePositionPanel(panel, input, concerns) {
  if (!text(panel?.public_position_label) || !sameJson(panel?.position_ref, input.party_start_committed?.current_position) || panel?.committed_position_digest !== computeStage26Digest(input.party_start_committed?.current_position)) concerns.push(issue('FIRST_SCREEN_POSITION_MISMATCH', 'Position panel is not bound to committed position.', 'screen.position_panel', 'hard_block'));
}

function validateTimePanel(panel, input, concerns) {
  if (!text(panel?.public_time_label) || !sameJson(panel?.clock_ref, input.party_start_committed?.current_clock) || panel?.committed_clock_digest !== computeStage26Digest(input.party_start_committed?.current_clock)) concerns.push(issue('FIRST_SCREEN_TIME_PANEL_CLOCK_CONFLICT', 'Time panel is not bound to committed clock.', 'screen.time_panel', 'hard_block'));
  if (!text(panel?.public_light_label)) concerns.push(issue('FIRST_SCREEN_LIGHT_PANEL_CONFLICT', 'Public light label is required.', 'screen.time_panel.public_light_label', 'hard_block'));
  if (input.committed_public_read_model?.public_weather_label != null && panel?.public_weather_label !== input.committed_public_read_model.public_weather_label) concerns.push(issue('FIRST_SCREEN_WEATHER_PANEL_CONFLICT', 'Weather label differs from committed public read model.', 'screen.time_panel.public_weather_label', 'hard_block'));
}

function validateAttentionPanel(panel, index, concerns) {
  const groups = [
    ['visible_npcs', index.visibleNpcRefs], ['visible_items', index.visibleItemRefs],
    ['visible_containers', index.visibleContainerRefs], ['visible_exits', index.visibleExitRefs],
    ['audible_or_sensory_cues', index.visibleCueRefs], ['known_context_hints', index.attentionTargetRefs]
  ];
  for (const [key, allowed] of groups) {
    for (const [position, item] of array(panel?.[key]).entries()) {
      if (!text(item?.source_ref) || (!allowed.has(item.source_ref) && !(key === 'known_context_hints' && index.approvedNarratorUsedRefs.has(item.source_ref)))) concerns.push(issue('FIRST_SCREEN_ATTENTION_REF_NOT_FOUND', `Attention ref is not approved: ${item?.source_ref ?? 'missing'}.`, `screen.attention_panel.${key}[${position}].source_ref`, 'upstream_block'));
      if (!text(item?.label) || item?.must_not_reveal_hidden_truth !== true) concerns.push(issue('FIRST_SCREEN_HIDDEN_STATE_LEAK', 'Attention item safety contract is invalid.', `screen.attention_panel.${key}[${position}]`, 'repairable'));
    }
  }
}

function validateActionPanel(panel, input, index, concerns) {
  const approved = new Map(array(input.approved_narrator_output?.action_options).map((item) => [item.option_id, item]));
  const seen = new Set();
  for (const [position, action] of array(panel?.suggested_actions).entries()) {
    const source = approved.get(action?.option_id);
    if (!source) concerns.push(issue('FIRST_SCREEN_ACTION_OPTION_NOT_APPROVED', `Action option is not approved: ${action?.option_id ?? 'missing'}.`, `screen.action_panel.suggested_actions[${position}].option_id`, 'upstream_block'));
    if (seen.has(action?.option_id)) concerns.push(issue('FIRST_SCREEN_ACTION_OPTION_NOT_APPROVED', 'Duplicate action option ID.', `screen.action_panel.suggested_actions[${position}].option_id`, 'hard_block'));
    seen.add(action?.option_id);
    if (source && (action.action_kind !== source.action_kind || !sameJson(action.target_ref, source.target_ref))) concerns.push(issue('FIRST_SCREEN_ACTION_CREATED_TARGET', 'Action kind or target differs from approved option.', `screen.action_panel.suggested_actions[${position}]`, 'hard_block'));
    const target = targetRefValue(action?.target_ref);
    if (target && !index.actionTargetRefs.has(target)) concerns.push(issue('FIRST_SCREEN_ACTION_REF_NOT_FOUND', `Action target is not committed/visible: ${target}.`, `screen.action_panel.suggested_actions[${position}].target_ref`, 'upstream_block'));
    if (action?.promises_outcome === true || action?.requires_resolution_pipeline !== true) concerns.push(issue('FIRST_SCREEN_ACTION_PROMISES_OUTCOME', 'Suggested action promises an outcome instead of an intent.', `screen.action_panel.suggested_actions[${position}]`, 'repairable'));
    if (action?.must_not_reveal_hidden_truth !== true) concerns.push(issue('FIRST_SCREEN_ACTION_USES_HIDDEN_TRUTH', 'Suggested action lacks hidden-truth guard.', `screen.action_panel.suggested_actions[${position}]`, 'repairable'));
  }
}

function validateMapPanel(panel, input, index, concerns) {
  if (panel?.map_mode !== 'character_known_only') concerns.push(issue('FIRST_SCREEN_MAP_REF_NOT_KNOWN', 'Map mode must be character_known_only.', 'screen.map_panel.map_mode', 'hard_block'));
  if (panel?.must_not_show_hidden_nodes !== true) concerns.push(issue('FIRST_SCREEN_HIDDEN_STATE_LEAK', 'Map hidden-node guard is missing.', 'screen.map_panel.must_not_show_hidden_nodes', 'hard_block'));
  const current = panel?.known_current_node;
  if (!text(current?.node_ref) || !index.knownNodeRefs.has(current.node_ref)) concerns.push(issue('FIRST_SCREEN_MAP_REF_NOT_KNOWN', 'Current map node is not in committed knowledge.', 'screen.map_panel.known_current_node.node_ref', 'upstream_block'));
  for (const [position, node] of array(panel?.known_nearby_nodes).entries()) if (!text(node?.node_ref) || !index.knownNodeRefs.has(node.node_ref)) concerns.push(issue('FIRST_SCREEN_MAP_REF_NOT_KNOWN', 'Nearby map node is not in committed knowledge.', `screen.map_panel.known_nearby_nodes[${position}].node_ref`, 'upstream_block'));
  for (const [position, exit] of array(panel?.unknown_exits).entries()) {
    if (!text(exit?.exit_ref) || (!index.visibleExitRefs.has(exit.exit_ref) && !index.knownRouteRefs.has(exit.exit_ref))) concerns.push(issue('FIRST_SCREEN_MAP_REF_NOT_KNOWN', 'Unknown exit ref is not committed/known.', `screen.map_panel.unknown_exits[${position}].exit_ref`, 'upstream_block'));
    if (exit?.destination_unknown !== true || exit?.exact_destination != null) concerns.push(issue('FIRST_SCREEN_UNKNOWN_ROUTE_DESTINATION_LEAK', 'Unknown exit exposes exact destination.', `screen.map_panel.unknown_exits[${position}]`, 'repairable'));
  }
  const positionAnchor = text(input.party_start_committed?.current_position?.anchor_id);
  if (positionAnchor && current?.node_ref !== positionAnchor && !index.knownNodeRefs.has(positionAnchor)) concerns.push(issue('FIRST_SCREEN_POSITION_MISMATCH', 'Map current node is not bound to committed position anchor.', 'screen.map_panel.known_current_node', 'hard_block'));
}

function validateDeliveryState(delivery, input, concerns) {
  const expected = text(input.party_start_committed?.player_output_ref?.narrator_output_id);
  if (!text(delivery?.message_id) || delivery.message_id !== expected) concerns.push(issue('FIRST_SCREEN_DELIVERY_ID_MISSING', 'Delivery message ID must equal committed narrator output ID.', 'screen.delivery_state.message_id', 'delivery_block'));
  if (delivery?.opening_scene_presented === true && (!text(delivery?.client_ack_id) || delivery.awaiting_client_ack !== false)) concerns.push(issue('FIRST_SCREEN_OPENING_PRESENTED_WITHOUT_ACK', 'Opening scene cannot be marked presented without ACK.', 'screen.delivery_state', 'delivery_block'));
  if (delivery?.opening_scene_presented !== true && delivery?.awaiting_client_ack !== true) concerns.push(issue('FIRST_SCREEN_OPENING_PRESENTED_WITHOUT_ACK', 'Unpresented screen must await client ACK.', 'screen.delivery_state.awaiting_client_ack', 'delivery_block'));
}

function validateAuditCommon(audit, { schema, requiredChecks, screen, input, requirePermissions }) {
  const concerns = [];
  if (!isObject(audit) || audit.version !== 1 || audit.schema !== schema) return [issue('FIRST_SCREEN_AUDIT_INVALID', `Expected ${schema} version 1.`, 'audit', 'format_error')];
  if (audit.request_id !== input.request_id) concerns.push(issue('FIRST_SCREEN_REQUEST_ID_MISMATCH', 'Audit request_id mismatch.', 'audit.request_id', 'format_error'));
  if (audit.screen_digest !== computeStage26Digest(screen)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Audit screen digest mismatch.', 'audit.screen_digest', 'format_error'));
  if (typeof audit.pass !== 'boolean') concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Audit pass must be boolean.', 'audit.pass', 'format_error'));
  for (const key of requiredChecks) if (audit.checks?.[key]?.pass !== true && audit.pass === true) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', `Successful audit missing passed check: ${key}.`, `audit.checks.${key}`, 'format_error'));
  for (const concern of array(audit.concerns)) {
    if (!STAGE26_CONCERN_CODES.includes(concern?.code) || !STAGE26_SEVERITIES.includes(concern?.severity) || !text(concern?.message)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Audit concern is invalid.', 'audit.concerns', 'format_error'));
  }
  if (audit.pass === true) {
    if (array(audit.concerns).length !== 0 || array(audit.evidence).length === 0) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Successful audit requires empty concerns and non-empty evidence.', 'audit', 'format_error'));
    if (requirePermissions && (audit.commit_permission?.can_show_to_player !== true || audit.commit_permission?.can_accept_first_turn !== true)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Successful safety audit permissions must be true.', 'audit.commit_permission', 'format_error'));
  } else {
    if (array(audit.concerns).length === 0 || array(audit.evidence).length === 0) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Failed audit requires concerns and evidence.', 'audit', 'format_error'));
    if (requirePermissions && (audit.commit_permission?.can_show_to_player !== false || audit.commit_permission?.can_accept_first_turn !== false)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Failed safety audit permissions must be false.', 'audit.commit_permission', 'format_error'));
  }
  for (const forbidden of ['first_game_screen', 'modified_screen', 'hidden_state', 'visible_context_package', 'party_public_state']) if (Object.hasOwn(audit, forbidden)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', `Audit must not embed ${forbidden}.`, `audit.${forbidden}`, 'format_error'));
  return dedupeIssues(concerns);
}

function buildSafetyAuditorRoleInput(input, screen) {
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

function buildActionAuditorRoleInput(input, screen) {
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

function buildFormatRepairRoleInput({ artifactKind, artifact, issues, input, screen = null }) {
  return deepFreeze({
    version: 1,
    schema: 'first_screen_format_repair_request',
    request_id: input.request_id,
    artifact_kind: artifactKind,
    artifact: safeClone(artifact),
    format_issues: safeClone(issues),
    first_game_screen_digest: screen ? computeStage26Digest(screen) : null,
    constraints: {
      change_format_only: true,
      preserve_player_visible_text: true,
      preserve_refs: true,
      preserve_party_and_transaction_binding: true,
      do_not_add_world_facts: true
    }
  });
}

function buildSemanticRepairRoleInput({ input, screen, safetyAudit, actionAudit, route, senior }) {
  return deepFreeze({
    version: 1,
    schema: senior ? 'senior_first_screen_semantic_repair_request' : 'first_screen_semantic_repair_request',
    request_id: input.request_id,
    first_game_screen: safeClone(screen),
    safety_audit: safeClone(safetyAudit),
    action_label_audit: safeClone(actionAudit),
    repair_route: safeClone(route),
    allowed_mutable_paths: [
      'position_panel.public_position_label', 'time_panel.public_time_label', 'time_panel.public_light_label',
      'time_panel.public_weather_label', 'character_panel.public_character_label', 'character_panel.body_state_summary',
      'character_panel.inventory_summary', 'character_panel.warning_badges', 'attention_panel.*.label',
      'attention_panel.*.risk_hint', 'action_panel.suggested_actions.*.label',
      'action_panel.suggested_actions.*.risk_hint', 'map_panel.*.label'
    ],
    forbidden_mutable_paths: [
      'request_id', 'party_id', 'turn_number', 'main_prose', 'position_panel.position_ref',
      'time_panel.clock_ref', 'attention_panel.*.source_ref', 'action_panel.suggested_actions.*.option_id',
      'action_panel.suggested_actions.*.action_kind', 'action_panel.suggested_actions.*.target_ref',
      'map_panel.*.*_ref', 'delivery_state', 'provenance'
    ],
    approved_narrator_output: safeClone(input.approved_narrator_output),
    committed_public_read_model: safeClone(input.committed_public_read_model),
    approved_visible_context: safeClone(input.approved_visible_context)
  });
}

function validateScreenRepair(previous, repaired, input, { formatOnly }) {
  const concerns = [];
  if (!isObject(repaired)) return [issue('FIRST_SCREEN_REPAIR_INVALID', 'Repairer must return a screen object.', 'repair', 'hard_block')];
  const immutablePaths = [
    'request_id', 'party_id', 'turn_number', 'main_prose', 'position_panel.position_ref',
    'position_panel.committed_position_digest', 'time_panel.clock_ref', 'time_panel.committed_clock_digest',
    'delivery_state.message_id', 'provenance'
  ];
  for (const path of immutablePaths) if (!sameJson(getPath(previous, path), getPath(repaired, path))) concerns.push(issue('FIRST_SCREEN_REPAIR_INVALID', `Repair changed immutable path: ${path}.`, path, 'hard_block'));
  if (!sameRefStructure(previous.attention_panel, repaired.attention_panel) || !sameRefStructure(previous.action_panel?.suggested_actions, repaired.action_panel?.suggested_actions) || !sameRefStructure(previous.map_panel, repaired.map_panel)) concerns.push(issue('FIRST_SCREEN_REPAIR_INVALID', 'Repair changed approved reference topology.', 'repair', 'hard_block'));
  if (formatOnly && !sameDisplayText(previous, repaired)) concerns.push(issue('FIRST_SCREEN_REPAIR_INVALID', 'Format repair changed player-visible text.', 'repair', 'hard_block'));
  const validation = validateFirstGameScreen(repaired, input);
  for (const item of validation.concerns) concerns.push(item);
  return dedupeIssues(concerns);
}

function finalizeSafetyBoundary(screen, codeValidation, safetyAudit, actionAudit) {
  const next = safeClone(screen);
  next.ui_safety_boundary = {
    hidden_state_not_included: codeValidation.checks.hidden_state_absent.pass === true && safetyAudit.checks.hidden_state_absent?.pass === true && actionAudit.checks.no_hidden_truth?.pass === true,
    audit_not_included: codeValidation.checks.audit_absent.pass === true,
    source_trace_not_included: codeValidation.checks.source_trace_absent.pass === true,
    raw_ids_not_included: !findRawIdLeaks(screen).length && safetyAudit.checks.technical_text_absent?.pass === true,
    player_sees_only_character_safe_context: codeValidation.pass === true && safetyAudit.pass === true && actionAudit.pass === true
  };
  return deepFreeze(next);
}

function buildStage26Success({ input, precheck, screen, codeValidation, safetyAudit, actionAudit, validationHistory, auditHistory, repairHistory, diagnostics }) {
  const result = {
    version: 1,
    schema: STAGE26_RESULT_SCHEMA,
    request_id: input.request_id,
    pass: true,
    party_id: screen.party_id,
    transaction_id: input.party_start_committed.transaction_id,
    input_digest: computeStage26Digest(input),
    screen_digest: computeStage26Digest(screen),
    party_public_state_digest: input.stage25_party_commit_approval.party_public_state_digest,
    narrator_output_digest: input.narrator_output_digest,
    visible_context_package_digest: input.visible_context_package_digest,
    postcommit_state_digest: input.stage25_party_commit_approval.postcommit_state_digest,
    first_screen_code_precheck: safeClone(precheck),
    first_screen_code_validation: safeClone(codeValidation),
    first_game_screen: safeClone(screen),
    first_screen_safety_audit: safeClone(safetyAudit),
    first_screen_action_label_audit: safeClone(actionAudit),
    repair_route: null,
    validation_history: safeClone(validationHistory),
    audit_history: safeClone(auditHistory),
    repair_history: safeClone(repairHistory),
    diagnostics: safeClone(diagnostics),
    delivery_permission: {
      can_create_delivery_attempt: true,
      can_show_screen: true,
      can_accept_first_turn_intent: true
    }
  };
  return deepFreeze(result);
}

function buildStage26Failure({ input, phase, precheck = null, screen = null, codeValidation = null, safetyAudit = null, actionAudit = null, concerns = [], repairRoute = null, histories = {}, diagnostics = {} }) {
  const normalized = dedupeIssues(normalizeAuditConcerns(concerns));
  return deepFreeze({
    version: 1,
    schema: STAGE26_RESULT_SCHEMA,
    request_id: input?.request_id ?? null,
    pass: false,
    failed_phase: phase ?? 'unknown',
    input_digest: isObject(input) ? computeStage26Digest(input) : null,
    screen_digest: isObject(screen) ? computeStage26Digest(screen) : null,
    postcommit_state_digest: input?.stage25_party_commit_approval?.postcommit_state_digest ?? null,
    first_screen_code_precheck: safeClone(precheck),
    first_screen_code_validation: safeClone(codeValidation),
    first_game_screen: safeClone(screen),
    first_screen_safety_audit: safeClone(safetyAudit),
    first_screen_action_label_audit: safeClone(actionAudit),
    concerns: normalized,
    evidence: normalized.map((item) => item.message),
    repair_route: safeClone(repairRoute ?? routeForStage26Concerns(normalized)),
    validation_history: safeClone(histories.validationHistory ?? []),
    audit_history: safeClone(histories.auditHistory ?? []),
    repair_history: safeClone(histories.repairHistory ?? []),
    diagnostics: safeClone(diagnostics),
    delivery_permission: {
      can_create_delivery_attempt: false,
      can_show_screen: false,
      can_accept_first_turn_intent: false
    }
  });
}

function routeForStage26Concerns(concerns) {
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

function findRawIdLeaks(screen) {
  const concerns = [];
  walkDisplayStrings(screen, 'screen', (value, path) => {
    if (TECHNICAL_TOKEN_PATTERN.test(value)) concerns.push(issue('FIRST_SCREEN_RAW_ID_LEAK', `Raw technical ID detected in player-visible text at ${path}.`, path, 'repairable'));
  });
  return concerns;
}

function walkDisplayStrings(value, path, visitor, key = '') {
  if (typeof value === 'string') {
    if (isDisplayStringKey(key)) visitor(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkDisplayStrings(item, `${path}[${index}]`, visitor, key));
    return;
  }
  if (!isObject(value)) return;
  for (const [childKey, child] of Object.entries(value)) walkDisplayStrings(child, `${path}.${childKey}`, visitor, childKey);
}

function isDisplayStringKey(key) {
  return ['main_prose', 'label', 'public_position_label', 'public_time_label', 'public_light_label', 'public_weather_label', 'public_character_label', 'risk_hint', 'certainty', 'placeholder'].includes(key)
    || key.endsWith('_summary') || key.endsWith('_badges');
}

function walkPublicValue(value, path, violations) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkPublicValue(item, `${path}[${index}]`, violations));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) {
      violations.push({ code: codeForForbiddenKey(key), path: childPath, message: `Forbidden public field: ${key}.`, severity: 'hard_block' });
      continue;
    }
    walkPublicValue(child, childPath, violations);
  }
}

function codeForForbiddenKey(key) {
  if (key.includes('source')) return 'FIRST_SCREEN_SOURCE_TRACE_LEAK';
  if (key.includes('audit')) return 'FIRST_SCREEN_AUDIT_TEXT_LEAK';
  if (key.includes('debug')) return 'FIRST_SCREEN_DEBUG_TEXT_LEAK';
  if (key.includes('raw')) return 'FIRST_SCREEN_RAW_JSON_LEAK';
  if (key.includes('private')) return 'FIRST_SCREEN_PRIVATE_MOTIVE_LEAK';
  if (key.includes('closed_container')) return 'FIRST_SCREEN_CLOSED_CONTAINER_CONTENTS_LEAK';
  if (key.includes('future')) return 'FIRST_SCREEN_FUTURE_EVENT_LEAK';
  return 'FIRST_SCREEN_HIDDEN_STATE_LEAK';
}

function collectVisibleContextRefs(visible, index) {
  collectRecordRefs(array(visible.visible_npcs), index.visibleNpcRefs, ['npc_instance_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_items), index.visibleItemRefs, ['item_instance_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_containers), index.visibleContainerRefs, ['container_instance_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_exits), index.visibleExitRefs, ['exit_id', 'anchor_id', 'route_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.audible_context), index.visibleCueRefs, ['cue_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_anchors), index.knownNodeRefs, ['anchor_id', 'source_ref', 'id']);
  collectRecordRefs(array(visible.visible_exits), index.knownRouteRefs, ['route_id', 'edge_id', 'exit_id', 'source_ref', 'id']);
  for (const action of array(visible.available_actions_context)) {
    const target = targetRefValue(action?.target_ref);
    if (target) index.actionTargetRefs.add(target);
  }
}

function publicList(state, kind) {
  const keys = {
    npcs: ['public_visible_npcs', 'visible_npcs'],
    items: ['public_visible_items', 'visible_items'],
    containers: ['public_visible_containers', 'visible_containers'],
    exits: ['public_visible_exits', 'visible_exits'],
    cues: ['public_visible_cues', 'visible_cues', 'public_attention_targets'],
    context_hints: ['public_context_hints', 'known_context_hints'],
    attention_targets: ['public_attention_targets', 'attention_targets'],
    action_targets: ['public_action_targets', 'action_targets'],
    known_routes: ['public_known_routes', 'known_routes']
  };
  for (const key of keys[kind] ?? []) if (Array.isArray(state?.[key])) return state[key];
  return [];
}

function mapList(state, kind) {
  const map = state?.public_visible_map ?? state?.known_map ?? {};
  if (kind === 'known_nodes') return [map.known_current_node, ...array(map.known_nearby_nodes)].filter(Boolean);
  return [];
}

function collectRecordRefs(records, target, candidates) {
  for (const item of array(records)) {
    const ref = resolveRecordRef(item, candidates);
    if (ref) target.add(ref);
  }
}

function referenceCandidatesForType(type) {
  if (type === 'visible_npc') return ['npc_instance_id', 'npc_ref', 'source_ref', 'id'];
  if (type === 'visible_item') return ['item_instance_id', 'item_ref', 'source_ref', 'id'];
  if (type === 'visible_container') return ['container_instance_id', 'container_ref', 'source_ref', 'id'];
  if (type === 'visible_exit') return ['exit_id', 'anchor_id', 'route_id', 'source_ref', 'id'];
  if (type === 'sensory_cue') return ['cue_id', 'source_ref', 'id'];
  return ['target_ref', 'source_ref', 'id'];
}

function resolveRecordRef(item, candidates) {
  if (!isObject(item)) return null;
  for (const key of candidates) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (isObject(value)) {
      const target = targetRefValue(value);
      if (target) return target;
    }
  }
  return targetRefValue(item.target_ref);
}

function targetRefValue(ref) {
  if (!isObject(ref)) return null;
  for (const key of ['anchor_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id', 'exit_id', 'route_id', 'node_id']) if (text(ref[key])) return ref[key];
  return null;
}

function serializeReferenceIndex(index) {
  return Object.fromEntries(Object.entries(index).map(([key, value]) => [key, value instanceof Set ? [...value] : value instanceof Map ? [...value.entries()] : value]));
}

function summarizeReferenceIndex(index) {
  return Object.fromEntries(Object.entries(index).filter(([, value]) => value instanceof Set || value instanceof Map).map(([key, value]) => [key, value.size]));
}

function sameRefStructure(a, b) {
  return computeStage26Digest(extractRefStructure(a)) === computeStage26Digest(extractRefStructure(b));
}

function extractRefStructure(value) {
  if (Array.isArray(value)) return value.map(extractRefStructure);
  if (!isObject(value)) return null;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (key.includes('ref') || key.endsWith('_id') || ['party_id', 'transaction_id', 'option_id', 'action_kind', 'target_type', 'map_mode'].includes(key)) out[key] = safeClone(child);
    else if (isObject(child) || Array.isArray(child)) out[key] = extractRefStructure(child);
  }
  return out;
}

function sameDisplayText(a, b) {
  return computeStage26Digest(extractDisplayText(a)) === computeStage26Digest(extractDisplayText(b));
}

function extractDisplayText(value, key = '') {
  if (typeof value === 'string') return isDisplayStringKey(key) ? value : null;
  if (Array.isArray(value)) return value.map((item) => extractDisplayText(item, key));
  if (!isObject(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, extractDisplayText(child, childKey)]));
}

function normalizeAuditConcerns(concerns) {
  return array(concerns).map((item) => {
    if (isObject(item)) return issue(item.code ?? 'FIRST_SCREEN_AUDIT_FAILED', item.message ?? item.code ?? 'Stage 26 audit failed.', item.path ?? item.field ?? 'audit', item.severity ?? 'repairable');
    return issue('FIRST_SCREEN_AUDIT_FAILED', String(item), 'audit', 'repairable');
  });
}

function stripSensitiveValidation(validation) {
  return safeClone(validation);
}

async function invokeRole(role, roleInput, roleId) {
  const response = await role({
    input: roleInput,
    stage: Object.freeze({ id: 26, slug: 'first_game_screen', role_id: roleId })
  });
  return safeClone(response?.output ?? response?.result ?? response);
}

function stage26Error(phase, concerns, message = 'Stage 26 failed.') {
  const error = new Error(message);
  error.stage26_phase = phase;
  error.concerns = normalizeAuditConcerns(concerns);
  return error;
}

function extractIssues(error, fallbackCode) {
  if (Array.isArray(error?.concerns)) return normalizeAuditConcerns(error.concerns);
  return [issue(fallbackCode, error?.message ?? String(error), 'stage26', 'hard_block')];
}

function issue(code, message, path = null, severity = 'hard_block') {
  return { code, severity, path, message };
}

function dedupeIssues(items) {
  const seen = new Set();
  return array(items).filter((item) => {
    const key = `${item.code}|${item.path ?? ''}|${item.message ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function passCheck(pass) {
  return { pass: pass === true };
}

function requirePublicText(value, field) {
  const result = optionalPublicText(value);
  if (!result) throw stage26Error('projection', [issue('FIRST_SCREEN_PUBLIC_READ_MODEL_INVALID', `Public text is required: ${field}.`, field, 'hard_block')]);
  return result;
}

function optionalPublicText(value) {
  return text(value) || null;
}

function requireText(value, field) {
  const result = text(value);
  if (!result) throw stage26Error('projection', [issue('FIRST_SCREEN_INPUT_INVALID', `Text is required: ${field}.`, field, 'hard_block')]);
  return result;
}

function publicTextList(value) {
  return array(value).map(optionalPublicText).filter(Boolean);
}

function getPath(value, path) {
  return path.split('.').reduce((current, part) => current?.[part], value);
}

function sameJson(a, b) {
  return canonicalStage26Json(a) === canonicalStage26Json(b);
}

function withoutNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child != null));
}

function safeClone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}
