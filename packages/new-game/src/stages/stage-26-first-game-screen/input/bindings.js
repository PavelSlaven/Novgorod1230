import { READY_PHASE, SHA256_PATTERN, STAGE26_NARRATOR_APPROVAL_SCHEMA } from '../policy/constants.js';
import { sameJson } from '../shared/digest.js';
import { issue } from '../shared/issues.js';
import { isObject, text } from '../shared/utils.js';
import { PARTY_PUBLIC_STATE_SCHEMA, STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA, VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA, computeNarratorStartingProseDigest, computeStage25ArtifactDigest, computeVisibleContextPackageDigest } from '@rus/contracts';

export function validateStage25ApprovalBinding(input) {
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

export function validateCommittedState(committed, input) {
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

export function validateCommittedPublicReadModel(model, input) {
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

export function validateNarratorBinding(input) {
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

export function validateVisibleContextBinding(input) {
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
