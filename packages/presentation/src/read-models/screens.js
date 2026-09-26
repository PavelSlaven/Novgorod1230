import { deepFreeze } from '@rus/kernel';
import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import {
  FIRST_GAME_SCREEN_SCHEMA,
  FACTUAL_TURN_DELIVERY_SCREEN_SCHEMA,
  PRESENTATION_VERSION,
  TURN_SCREEN_SCHEMA
} from './contracts.js';
import {
  sceneAffordanceContextErrors,
  sceneAffordancePanelErrors
} from
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
  checks = [],
  panels = {},
  generatedAt = new Date().toISOString()
} = {}) {
  const approved = approvedNarration(narration);
  if (!text(partyId) || !text(turnId)) throw presentationError('TURN_SCREEN_ID_REQUIRED', 'partyId and turnId are required.');
  if (!Number.isInteger(Number(turnNumber)) || Number(turnNumber) < 1) throw presentationError('TURN_SCREEN_NUMBER_INVALID', 'turnNumber must be a positive integer.');
  if (!plain(visibleContext)) throw presentationError('TURN_SCREEN_VISIBLE_CONTEXT_REQUIRED', 'visibleContext is required.');
  if (!Array.isArray(actions)) throw presentationError('TURN_SCREEN_ACTIONS_INVALID', 'actions must be an array.');
  if (!validChecks(checks)) throw presentationError('TURN_SCREEN_CHECKS_INVALID', 'checks must be an ordered player-safe array.');
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
    checks: structuredClone(checks),
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

export function createFactualTurnDeliveryScreenReadModel({
  partyId,
  turnId,
  turnNumber,
  packageId,
  committedStateVersion,
  visibleContext,
  visibleChanges,
  uncertainties,
  actionPanel,
  actions = [],
  checks = [],
  panels = {},
  inputPanel = { free_text_enabled: true, input_contract: 'intent_not_fact' },
  scenarioId,
  screenKind,
  deliveryState = { ready: true },
  openingScreenDigest,
  currentProjectionAnchor,
  presentationContext,
  sceneAssetId,
  combatState
} = {}) {
  if (!text(partyId) || !text(turnId) || !text(packageId)) {
    throw presentationError('FACTUAL_TURN_DELIVERY_ID_REQUIRED', 'partyId, turnId and packageId are required.');
  }
  if (!Number.isInteger(Number(turnNumber)) || Number(turnNumber) < 1) {
    throw presentationError('FACTUAL_TURN_DELIVERY_NUMBER_INVALID', 'turnNumber must be a positive integer.');
  }
  if (!text(committedStateVersion)) {
    throw presentationError('FACTUAL_TURN_DELIVERY_STATE_VERSION_REQUIRED', 'committedStateVersion is required.');
  }
  const safeActionPanel = actionPanel ?? { suggested_actions: actions };
  const fullCarrier = hasFullFactualCarrier({ actionPanel: safeActionPanel, actions, checks,
    scenarioId, screenKind, deliveryState, openingScreenDigest,
    currentProjectionAnchor, presentationContext, sceneAssetId, combatState });
  if (!plain(visibleContext) || !textArray(visibleChanges)
      || !textArray(uncertainties) || !validActionPanel(safeActionPanel)
      || !sameJson(safeActionPanel.suggested_actions, actions)
      || !validChecks(checks) || !plain(panels)
      || !validInputPanel(inputPanel)
      || !validReadyDeliveryState(deliveryState)
      || (fullCarrier && !validFullFactualCarrier({ actionPanel, actions, checks,
        scenarioId, screenKind, deliveryState, openingScreenDigest,
        currentProjectionAnchor, presentationContext, sceneAssetId, combatState }))) {
    throw presentationError('FACTUAL_TURN_DELIVERY_PAYLOAD_INVALID', 'Committed public payload is invalid.');
  }
  const output = {
    version: PRESENTATION_VERSION,
    schema: FACTUAL_TURN_DELIVERY_SCREEN_SCHEMA,
    screen_status: 'ready',
    party_id: text(partyId),
    turn_id: text(turnId),
    turn_number: Number(turnNumber),
    package_id: text(packageId),
    committed_state_version: text(committedStateVersion),
    presentation_quality: 'degraded',
    scenario_id: scenarioId,
    screen_kind: screenKind,
    visible_context: structuredClone(visibleContext),
    visible_changes: structuredClone(visibleChanges),
    uncertainties: structuredClone(uncertainties),
    action_panel: structuredClone(safeActionPanel),
    actions: structuredClone(actions),
    checks: structuredClone(checks),
    panels: structuredClone(panels),
    input_panel: structuredClone(inputPanel),
    delivery_state: structuredClone(deliveryState),
    ...(fullCarrier ? {
      scenario_id: scenarioId,
      screen_kind: screenKind,
      opening_screen_digest: text(openingScreenDigest),
      current_projection_anchor: structuredClone(currentProjectionAnchor),
      presentation_context: structuredClone(presentationContext),
      ...(sceneAssetId == null ? {} : { scene_asset_id: text(sceneAssetId) }),
      ...(combatState == null ? {} : { combat_state: structuredClone(combatState) })
    } : {})
  };
  const validation = validateFactualTurnDeliveryScreen(output);
  if (!validation.ok) throw presentationError('FACTUAL_TURN_DELIVERY_SCREEN_INVALID', validation.errors.join('; '));
  return deepFreeze(output);
}

export function validateFirstGameScreen(value) {
  const errors = [];
  if (!plain(value)) return fail('first game screen must be an object');
  if (value.version !== 1 || value.schema !== FIRST_GAME_SCREEN_SCHEMA) errors.push(`expected ${FIRST_GAME_SCREEN_SCHEMA} version 1`);
  if (value.screen_status !== 'ready') errors.push('screen_status must be ready');
  if (!text(value.party_id)) errors.push('party_id is required');
  errors.push(...sceneAffordanceContextErrors(value.visible_context ?? {}));
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
  if (!validChecks(value.checks ?? [])) errors.push('checks must be an ordered player-safe array');
  errors.push(...sceneAffordanceContextErrors(value.visible_context));
  errors.push(...sceneAffordancePanelErrors(value.panels));
  if (detectHiddenLeaks(value).length) errors.push('screen contains hidden data');
  return result(errors);
}

export function validateFactualTurnDeliveryScreen(value) {
  const errors = [];
  if (!plain(value)) return fail('factual turn delivery screen must be an object');
  const allowed = new Set([
    'version', 'schema', 'screen_status', 'party_id', 'turn_id', 'turn_number',
    'package_id', 'committed_state_version', 'visible_context', 'visible_changes',
    'uncertainties', 'presentation_quality', 'scenario_id', 'screen_kind',
    'action_panel', 'actions', 'checks', 'panels', 'input_panel',
    'delivery_state', 'opening_screen_digest', 'current_projection_anchor',
    'presentation_context', 'scene_asset_id', 'combat_state'
  ]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`forbidden key: ${key}`);
  if (value.version !== 1 || value.schema !== FACTUAL_TURN_DELIVERY_SCREEN_SCHEMA) errors.push(`expected ${FACTUAL_TURN_DELIVERY_SCREEN_SCHEMA} version 1`);
  if (value.screen_status !== 'ready') errors.push('screen_status must be ready');
  if (!text(value.party_id) || !text(value.turn_id) || !text(value.package_id)) errors.push('party_id, turn_id and package_id are required');
  if (!Number.isInteger(value.turn_number) || value.turn_number < 1) errors.push('turn_number must be a positive integer');
  if (!text(value.committed_state_version)) errors.push('committed_state_version is required');
  if (value.presentation_quality !== 'degraded') errors.push('presentation_quality must be degraded');
  if (!plain(value.visible_context)) errors.push('visible_context is required');
  if (!textArray(value.visible_changes)) errors.push('visible_changes must be an exact structured string array');
  if (!textArray(value.uncertainties)) errors.push('uncertainties must be an exact structured string array');
  if (!validActionPanel(value.action_panel) || !Array.isArray(value.actions)
      || !sameJson(value.action_panel.suggested_actions, value.actions)) {
    errors.push('actions must match the player-safe action panel');
  }
  if (!validChecks(value.checks)) errors.push('checks must be an ordered player-safe array');
  if (!validInputPanel(value.input_panel)) errors.push('input contract must be intent_not_fact');
  if (!validReadyDeliveryState(value.delivery_state)) errors.push('delivery_state must be ready');
  const carrier = factualCarrierFromScreen(value);
  if (hasFullFactualCarrier(carrier) && !validFullFactualCarrier(carrier)) {
    errors.push('full factual carrier is incomplete or invalid');
  }
  errors.push(...sceneAffordanceContextErrors(value.visible_context));
  errors.push(...sceneAffordancePanelErrors(value.panels));
  if (detectHiddenLeaks(value).length) errors.push('screen contains hidden data');
  return result(errors);
}

export function validateLowerDvinaFactualTurnDeliveryScreen(value) {
  const base = validateFactualTurnDeliveryScreen(value);
  if (!base.ok) return base;
  return validFullFactualCarrier(factualCarrierFromScreen(value))
    ? base : fail('Lower Dvina factual delivery requires a complete carrier');
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
function textArray(value) { return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim()); }
function validChecks(checks) {
  const modifierKinds = ['attribute', 'skill', 'state', 'equipment',
    'circumstances'];
  const outcomeBands = ['clean_success', 'success', 'success_with_cost',
    'failure_with_consequence', 'severe_failure'];
  return Array.isArray(checks) && checks.every((check, index) =>
    plain(check) && check.ordinal === index + 1
    && text(check.actor_label) && text(check.action_label)
    && check.die === 'd20' && text(check.formula)
    && Number.isInteger(check.roll) && check.roll >= 1 && check.roll <= 20
    && Number.isInteger(check.difficulty)
    && Number.isFinite(check.total)
    && Array.isArray(check.modifiers)
    && check.modifiers.length === modifierKinds.length
    && check.modifiers.every((modifier, modifierIndex) =>
      plain(modifier) && modifier.kind === modifierKinds[modifierIndex]
      && text(modifier.label) && Number.isFinite(modifier.value))
    && plain(check.outcome) && outcomeBands.includes(check.outcome.band)
    && Number.isFinite(check.outcome.margin)
    && typeof check.outcome.success === 'boolean'
    && typeof check.outcome.cost_required === 'boolean'
    && typeof check.outcome.severe_failure === 'boolean'
    && (check.outcome.roll_note === null
      || ['natural_1', 'natural_20'].includes(check.outcome.roll_note))
    && (check.consequence_label === null || text(check.consequence_label)));
}
function validActionPanel(value) {
  return plain(value) && Object.keys(value).length === 1
    && Array.isArray(value.suggested_actions);
}
function hasFullFactualCarrier(value) {
  return ['scenarioId', 'screenKind', 'openingScreenDigest', 'currentProjectionAnchor',
    'presentationContext', 'sceneAssetId', 'combatState'].some((key) =>
    value[key] !== undefined);
}
function factualCarrierFromScreen(value) {
  return { actionPanel: value.action_panel, actions: value.actions,
    checks: value.checks, scenarioId: value.scenario_id,
    screenKind: value.screen_kind, deliveryState: value.delivery_state,
    openingScreenDigest: value.opening_screen_digest,
    currentProjectionAnchor: value.current_projection_anchor,
    presentationContext: value.presentation_context,
    sceneAssetId: value.scene_asset_id, combatState: value.combat_state };
}
function validFullFactualCarrier({
  scenarioId, screenKind, deliveryState,
  openingScreenDigest, currentProjectionAnchor, presentationContext,
  sceneAssetId, combatState
}) {
  return text(scenarioId)
    && ['trace_turn', 'live_world_turn'].includes(screenKind)
    && validDeliveryState(deliveryState) && text(openingScreenDigest)
    && validProjectionAnchor(currentProjectionAnchor)
    && validPresentationContext(presentationContext)
    && (sceneAssetId == null || text(sceneAssetId))
    && validCombatState(combatState ?? null);
}
function validInputPanel(value) {
  return plain(value) && Object.keys(value).length === 2
    && value.free_text_enabled === true
    && value.input_contract === 'intent_not_fact';
}
function validDeliveryState(value) {
  return plain(value) && Object.keys(value).length === 2
    && value.ready === true && text(value.generated_at);
}
function validReadyDeliveryState(value) {
  return plain(value) && value.ready === true
    && Object.keys(value).every((key) => ['ready', 'generated_at'].includes(key))
    && (!Object.hasOwn(value, 'generated_at') || text(value.generated_at));
}
function validProjectionAnchor(value) {
  const keys = ['committed_state_version', 'package_id', 'package_digest',
    'narration_output_digest'];
  return plain(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key))
    && text(value.committed_state_version) && text(value.package_id)
    && text(value.package_digest) && value.narration_output_digest === null;
}
function validPresentationContext(value) {
  const keys = ['location_label', 'date_label', 'time_label',
    'turn_elapsed_label'];
  return plain(value) && Object.keys(value).every((key) => keys.includes(key))
    && Object.values(value).every(text);
}
function validCombatState(value) {
  return value === null || (plain(value)
    && Object.keys(value).length === 2
    && ['paused_for_player', 'ended'].includes(value.status)
    && typeof value.player_response_required === 'boolean');
}
function sameJson(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => sameJson(value, right[index]));
  }
  if (!plain(left) || !plain(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.hasOwn(right, key)
      && sameJson(left[key], right[key]));
}
function result(errors) { return { ok: errors.length === 0, errors }; }
function fail(message) { return { ok: false, errors: [message] }; }
