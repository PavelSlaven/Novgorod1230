import { webError } from '../shared/errors.js';
import {
  LANDSCAPE_SCENE_ASSET_IDS,
  validActiveInterlocutor,
  validCurrentTask,
  validLandscapeContext
} from '../shared/scene-affordances.js';

const FORBIDDEN_KEYS = new Set([
  'hidden', 'hidden_state', 'private_motives', 'private_knowledge',
  'closed_container_contents', 'future_event_timers', 'truth_status_for_system',
  'actual_truth_hidden_from_character', 'write_plan', 'commit_plan', 'raw_audit',
  'raw_prompt', 'provider_request', 'provider_response', 'diagnostics', 'trace',
  'candidate_set', 'candidate_sets', 'resolved_factual_target_ref', 'factual_topology',
  'factual_route', 'internal_route_binding', 'endpoint_binding', 'recovery_topology',
  'pins', 'dependency_pins', 'dependency_pin_set', 'candidate', 'candidates',
  'raw_diagnostic', 'raw_diagnostics', 'diagnostic_trace', 'route_plan', 'route_steps',
  'route_binding', 'route_bindings', 'resolved_route', 'routes', 'factual_routes', 'internal_routes'
  , 'coordinate', 'coordinates', 'layout_x', 'layout_y', 'bearing', 'distance',
  'trace', 'traces', 'raw_trace', 'raw_traces', 'binding', 'bindings', 'endpoint_binding', 'endpoint_bindings'
]);

export function validateApiEnvelope(value) {
  if (!plain(value) || value.version !== 1 || value.schema !== 'rus_api_success' || value.ok !== true) {
    throw webError('API_ENVELOPE_INVALID', 'Expected rus_api_success version 1.');
  }
  assertNoHiddenFields(value.data);
  return value;
}

export function validatePublicScreen(screen) {
  if (!plain(screen) || screen.version !== 1) throw webError('SCREEN_INVALID', 'Versioned screen is required.');
  if (!['first_game_screen', 'turn_screen',
    'lower_dvina_trace_turn_screen'].includes(screen.schema)) {
    throw webError('SCREEN_SCHEMA_UNSUPPORTED', 'Unsupported screen schema.');
  }
  if (screen.screen_status !== 'ready') throw webError('SCREEN_NOT_READY', 'Screen must be ready.');
  if (!text(screen.party_id)) throw webError('SCREEN_PARTY_ID_REQUIRED', 'party_id is required.');
  if (['turn_screen', 'lower_dvina_trace_turn_screen']
    .includes(screen.schema)) {
    if (!text(screen.turn_id) || !Number.isInteger(Number(screen.turn_number))) throw webError('TURN_SCREEN_ID_INVALID', 'turn_id and turn_number are required.');
    if (screen.input_panel?.input_contract !== 'intent_not_fact') throw webError('INPUT_CONTRACT_INVALID', 'Turn input must use intent_not_fact.');
  }
  validateSceneAffordances(screen);
  assertNoHiddenFields(screen);
  return screen;
}

function validateSceneAffordances(screen) {
  if (Object.hasOwn(screen, 'scene_asset_id')
      && !LANDSCAPE_SCENE_ASSET_IDS.includes(screen.scene_asset_id)) {
    throw webError(
      'LANDSCAPE_SCENE_ASSET_INVALID',
      'scene_asset_id must reference an authored player-safe scene.'
    );
  }
  if (!validLandscapeContext(screen.visible_context ?? {})) {
    throw webError(
      'LANDSCAPE_AFFORDANCE_INVALID',
      'Landscape inputs must use exact player-safe vocabularies.'
    );
  }
  const journal = screen.panels?.journal?.data;
  if (plain(journal) && Object.hasOwn(journal, 'current_task')
      && !validCurrentTask(journal.current_task)) {
    throw webError(
      'CURRENT_TASK_INVALID',
      'Journal current_task must be a non-empty string.'
    );
  }
  const people = screen.panels?.people?.data;
  if (plain(people) && Object.hasOwn(people, 'active_interlocutor')
      && !validActiveInterlocutor(people.active_interlocutor)) {
    throw webError(
      'ACTIVE_INTERLOCUTOR_INVALID',
      'People active_interlocutor must use the exact player-safe shape.'
    );
  }
}

export function assertNoHiddenFields(value, path = '$') {
  const leaks = [];
  walk(value, path, leaks);
  if (leaks.length) throw webError('PUBLIC_PAYLOAD_HIDDEN_LEAK', 'Public payload contains forbidden hidden fields.', { leaks });
  return value;
}

function walk(value, path, leaks) {
  if (Array.isArray(value)) return value.forEach((entry, index) => walk(entry, `${path}[${index}]`, leaks));
  if (!plain(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    const panelRoute = path.endsWith('.panels') && normalized === 'route';
    if (!panelRoute && forbidden(normalized)) {
      leaks.push(`${path}.${key}`);
    }
    walk(child, `${path}.${key}`, leaks);
  }
}
function normalizeKey(key) { return String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[\s.-]+/g, '_').toLowerCase(); }
function forbidden(key) {
  return FORBIDDEN_KEYS.has(key) || key.startsWith('hidden_') || key.startsWith('private_') ||
    key.includes('candidate') || key.includes('diagnostic') || key.includes('dependency_pin') ||
    key === 'pin' || key.endsWith('_pins') || key.includes('trace') || key.includes('binding') ||
    key.startsWith('route_') || key.endsWith('_route') || key === 'route' || key === 'routes' || key.includes('factual_topology') ||
    key === 'x' || key === 'y' || key === 'z';
}
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
