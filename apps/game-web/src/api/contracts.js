import { webError } from '../shared/errors.js';

const FORBIDDEN_KEYS = new Set([
  'hidden', 'hidden_state', 'private_motives', 'private_knowledge',
  'closed_container_contents', 'future_event_timers', 'truth_status_for_system',
  'actual_truth_hidden_from_character', 'write_plan', 'commit_plan', 'raw_audit',
  'raw_prompt', 'provider_request', 'provider_response'
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
  if (!['first_game_screen', 'turn_screen'].includes(screen.schema)) throw webError('SCREEN_SCHEMA_UNSUPPORTED', 'Unsupported screen schema.');
  if (screen.screen_status !== 'ready') throw webError('SCREEN_NOT_READY', 'Screen must be ready.');
  if (!text(screen.party_id)) throw webError('SCREEN_PARTY_ID_REQUIRED', 'party_id is required.');
  if (screen.schema === 'turn_screen') {
    if (!text(screen.turn_id) || !Number.isInteger(Number(screen.turn_number))) throw webError('TURN_SCREEN_ID_INVALID', 'turn_id and turn_number are required.');
    if (screen.input_panel?.input_contract !== 'intent_not_fact') throw webError('INPUT_CONTRACT_INVALID', 'Turn input must use intent_not_fact.');
  }
  assertNoHiddenFields(screen);
  return screen;
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
    const normalized = key.toLowerCase();
    if (FORBIDDEN_KEYS.has(normalized) || normalized.startsWith('hidden_') || normalized.startsWith('private_')) leaks.push(`${path}.${key}`);
    walk(child, `${path}.${key}`, leaks);
  }
}
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim(); }
