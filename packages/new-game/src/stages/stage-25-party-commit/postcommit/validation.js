import { REQUIRED_POSTCOMMIT_CHECKS, STAGE25_POSTCOMMIT_SCHEMA, STAGE25_POSTCOMMIT_STATE_SCHEMA } from '../policy/constants.js';
import { array, findForbiddenPublicPaths, isObject, issue, passCheck, text } from '../shared/utils.js';
export function validateStage25PostcommitState(state = {}, input = {}, transactionResult = {}, physicalPlanDigest = null) {
  const concerns = [];
  if (!isObject(state) || state.version !== 1 || state.schema !== STAGE25_POSTCOMMIT_STATE_SCHEMA) {
    return [issue('STAGE25_POSTCOMMIT_STATE_INVALID', `Expected ${STAGE25_POSTCOMMIT_STATE_SCHEMA} version 1.`, 'postcommit_state')];
  }
  if (state.request_id !== input.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Postcommit request_id mismatch.', 'postcommit_state.request_id'));
  if (state.party_id !== input.party_creation_context?.party_id) concerns.push(issue('STAGE25_POSTCOMMIT_STATE_INVALID', 'Postcommit party_id mismatch.', 'postcommit_state.party_id'));
  if (state.transaction_id !== transactionResult.transaction_id) concerns.push(issue('STAGE25_POSTCOMMIT_STATE_INVALID', 'Postcommit transaction_id mismatch.', 'postcommit_state.transaction_id'));
  if (state.physical_write_plan_digest !== physicalPlanDigest) concerns.push(issue('STAGE25_POSTCOMMIT_DIGEST_MISMATCH', 'Postcommit physical plan digest mismatch.', 'postcommit_state.physical_write_plan_digest'));
  if (state.party_state?.status !== 'ready' || state.party_state?.is_ready_for_player !== true || state.party_state?.current_phase !== 'awaiting_player_input') concerns.push(issue('STAGE25_PARTY_NOT_READY', 'Live party state is not ready for player.', 'postcommit_state.party_state'));
  if (!isObject(state.current_position)) concerns.push(issue('STAGE25_POSTCOMMIT_POSITION_MISSING', 'Live current position is required.', 'postcommit_state.current_position'));
  if (!isObject(state.current_clock)) concerns.push(issue('STAGE25_POSTCOMMIT_CLOCK_MISSING', 'Live current clock is required.', 'postcommit_state.current_clock'));
  if (!isObject(state.player_character)) concerns.push(issue('STAGE25_POSTCOMMIT_PLAYER_MISSING', 'Live player character is required.', 'postcommit_state.player_character'));
  if (!text(state.player_output_ref?.narrator_output_id) || state.player_output_ref?.player_visible_message_ready !== true) concerns.push(issue('STAGE25_POSTCOMMIT_OUTPUT_MISSING', 'Committed narrator output reference is required.', 'postcommit_state.player_output_ref'));
  if (state.idempotency_record?.idempotency_key !== input.party_creation_context?.idempotency_key || state.idempotency_record?.payload_hash !== input.party_creation_context?.payload_hash || state.idempotency_record?.status !== 'committed') concerns.push(issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', 'Committed idempotency record mismatch.', 'postcommit_state.idempotency_record'));
  const leakedPaths = findForbiddenPublicPaths(state.party_public_state);
  for (const path of leakedPaths) concerns.push(issue('STAGE25_HIDDEN_PUBLIC_LEAK', `Forbidden public field at ${path}.`, `postcommit_state.party_public_state.${path}`));
  return concerns;
}

export function buildStage25PostcommitValidation(state = {}, input = {}, transactionResult = {}, physicalPlanDigest = null) {
  const concerns = validateStage25PostcommitState(state, input, transactionResult, physicalPlanDigest);
  const checks = {
    party_state_ready: passCheck(state.party_state?.status === 'ready' && state.party_state?.is_ready_for_player === true),
    player_output_allowed: passCheck(state.player_output_ref?.player_visible_message_ready === true),
    current_position_exists: passCheck(isObject(state.current_position)),
    current_clock_exists: passCheck(isObject(state.current_clock)),
    player_character_exists: passCheck(isObject(state.player_character)),
    anchors_match_plan: passCheck(state.integrity?.anchors_match_plan !== false),
    routes_match_plan: passCheck(state.integrity?.routes_match_plan !== false),
    npcs_match_plan: passCheck(state.integrity?.npcs_match_plan !== false),
    items_match_plan: passCheck(state.integrity?.items_match_plan !== false),
    containers_match_plan: passCheck(state.integrity?.containers_match_plan !== false),
    knowledge_hash_matches: passCheck(state.integrity?.knowledge_hash_matches !== false),
    knowledge_counts_match: passCheck(state.integrity?.knowledge_counts_match !== false),
    single_current_knowledge_map: passCheck(state.integrity?.single_current_knowledge_map !== false),
    visible_context_digest_matches: passCheck(state.integrity?.visible_context_digest_matches !== false),
    narrator_prose_digest_matches: passCheck(state.integrity?.narrator_prose_digest_matches !== false),
    audit_snapshots_complete: passCheck(state.integrity?.audit_snapshots_complete !== false),
    source_trace_complete: passCheck(state.integrity?.source_trace_complete !== false),
    hidden_public_boundary_valid: passCheck(findForbiddenPublicPaths(state.party_public_state).length === 0),
    idempotency_record_committed: passCheck(state.idempotency_record?.status === 'committed')
  };
  for (const key of REQUIRED_POSTCOMMIT_CHECKS) {
    if (checks[key]?.pass !== true && !concerns.some((item) => item.path === `checks.${key}`)) concerns.push(issue('STAGE25_POSTCOMMIT_CHECK_FAILED', `Postcommit check failed: ${key}.`, `checks.${key}`));
  }
  return {
    version: 1,
    schema: STAGE25_POSTCOMMIT_SCHEMA,
    request_id: input.request_id ?? null,
    party_id: state.party_id ?? null,
    transaction_id: state.transaction_id ?? null,
    physical_write_plan_digest: physicalPlanDigest,
    pass: concerns.length === 0,
    checks,
    concerns,
    evidence: concerns.length === 0 ? ['Committed live party state passed Stage 25 postcommit validation.'] : []
  };
}

