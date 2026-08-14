import { deepFreeze } from '@rus/kernel';
import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import {
  FIRST_GAME_SCREEN_SCHEMA,
  PRESENTATION_VERSION,
  TURN_SCREEN_SCHEMA
} from './contracts.js';
import { sceneAffordancePanelErrors } from
  './scene-affordance-validation.js';

export function createFirstGameScreenReadModel({ stage26Result, generatedAt = new Date().toISOString() } = {}) {
  if (!plain(stage26Result) || stage26Result.pass !== true || stage26Result.schema !== 'stage26_first_game_screen_result') {
    throw presentationError('FIRST_GAME_SCREEN_RESULT_REQUIRED', 'Successful Stage 26 result is required.');
  }
  const source = stage26Result.first_game_screen;
  const validation = validateFirstGameScreen(source);
  if (!validation.ok) throw presentationError('FIRST_GAME_SCREEN_INVALID', validation.errors.join('; '));
  const output = {
    ...structuredClone(source),
    version: PRESENTATION_VERSION,
    schema: FIRST_GAME_SCREEN_SCHEMA,
    generated_at: source.generated_at ?? generatedAt,
    source_approval: {
      request_id: stage26Result.request_id,
      screen_digest: stage26Result.screen_digest,
      visible_context_package_digest: stage26Result.visible_context_package_digest,
      narrator_output_digest: stage26Result.narrator_output_digest
    }
  };
  rejectHidden(output, 'first_game_screen');
  return deepFreeze(output);
}

export function createTurnScreenReadModel({
  partyId,
  turnId,
  turnNumber,
  visibleContext,
  narration,
  actions = [],
  panels = {},
  generatedAt = new Date().toISOString()
} = {}) {
  const approved = approvedNarration(narration);
  if (!text(partyId) || !text(turnId)) throw presentationError('TURN_SCREEN_ID_REQUIRED', 'partyId and turnId are required.');
  if (!Number.isInteger(Number(turnNumber)) || Number(turnNumber) < 1) throw presentationError('TURN_SCREEN_NUMBER_INVALID', 'turnNumber must be a positive integer.');
  if (!plain(visibleContext)) throw presentationError('TURN_SCREEN_VISIBLE_CONTEXT_REQUIRED', 'visibleContext is required.');
  if (!Array.isArray(actions)) throw presentationError('TURN_SCREEN_ACTIONS_INVALID', 'actions must be an array.');
  if (!plain(panels)) throw presentationError('TURN_SCREEN_PANELS_INVALID', 'panels must be an object.');

  const output = {
    version: PRESENTATION_VERSION,
    schema: TURN_SCREEN_SCHEMA,
    screen_status: 'ready',
    party_id: text(partyId),
    turn_id: text(turnId),
    turn_number: Number(turnNumber),
    main_prose: approved.prose,
    prose: approved.prose,
    visible_context: structuredClone(visibleContext),
    action_panel: { suggested_actions: structuredClone(actions) },
    actions: structuredClone(actions),
    panels: structuredClone(panels),
    input_panel: { free_text_enabled: true, input_contract: 'intent_not_fact' },
    delivery_state: { generated_at: generatedAt, ready: true },
    narration_approval: {
      request_id: narration.request_id,
      output_id: approved.output_id,
      audit_evidence: structuredClone(narration.final_audit?.evidence ?? [])
    }
  };
  const validation = validateTurnScreen(output);
  if (!validation.ok) throw presentationError('TURN_SCREEN_INVALID', validation.errors.join('; '));
  return deepFreeze(output);
}

export function validateFirstGameScreen(value) {
  const errors = [];
  if (!plain(value)) return fail('first game screen must be an object');
  if (value.version !== 1 || value.schema !== FIRST_GAME_SCREEN_SCHEMA) errors.push(`expected ${FIRST_GAME_SCREEN_SCHEMA} version 1`);
  if (value.screen_status !== 'ready') errors.push('screen_status must be ready');
  if (!text(value.party_id)) errors.push('party_id is required');
  errors.push(...sceneAffordancePanelErrors(value.panels));
  if (detectHiddenLeaks(value).length) errors.push('screen contains hidden data');
  return result(errors);
}

export function validateTurnScreen(value) {
  const errors = [];
  if (!plain(value)) return fail('turn screen must be an object');
  if (value.version !== 1 || value.schema !== TURN_SCREEN_SCHEMA) errors.push(`expected ${TURN_SCREEN_SCHEMA} version 1`);
  if (value.screen_status !== 'ready') errors.push('screen_status must be ready');
  if (!text(value.party_id) || !text(value.turn_id)) errors.push('party_id and turn_id are required');
  if (!text(value.main_prose)) errors.push('main_prose is required');
  if (!plain(value.visible_context)) errors.push('visible_context is required');
  if (value.input_panel?.input_contract !== 'intent_not_fact') errors.push('input contract must be intent_not_fact');
  errors.push(...sceneAffordancePanelErrors(value.panels));
  if (detectHiddenLeaks(value).length) errors.push('screen contains hidden data');
  return result(errors);
}

export function createPublicViewModel({ visibleContext, prose, actions = [] }) {
  if (!plain(visibleContext)) throw new TypeError('visibleContext is required.');
  const output = { visible_context: structuredClone(visibleContext), prose: String(prose ?? ''), actions: Object.freeze([...actions]) };
  rejectHidden(output, 'public_view_model');
  return deepFreeze(output);
}

function approvedNarration(narration) {
  if (!plain(narration) || narration.schema !== 'narration_flow_result' || narration.status !== 'approved' || narration.pass !== true) {
    throw presentationError('NARRATION_APPROVAL_REQUIRED', 'Approved narration_flow_result is required.');
  }
  const output = narration.approved_output;
  if (!plain(output) || output.schema !== 'narration_output' || !text(output.prose)) {
    throw presentationError('NARRATION_OUTPUT_INVALID', 'Approved narration output is invalid.');
  }
  return output;
}
function rejectHidden(value, label) {
  const leaks = detectHiddenLeaks(value);
  if (leaks.length) throw presentationError('PRESENTATION_HIDDEN_LEAK', `${label} contains hidden data`, { leaks });
}
function presentationError(code, message, details = {}) { const error = new Error(message); error.code = code; error.details = details; return error; }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
function result(errors) { return { ok: errors.length === 0, errors }; }
function fail(message) { return { ok: false, errors: [message] }; }
