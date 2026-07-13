import { computeStage26Digest, sameJson } from '../shared/digest.js';
import { dedupeIssues, issue } from '../shared/issues.js';
import { getPath, isObject, safeClone } from '../shared/utils.js';
import { isDisplayStringKey } from '../validation/security.js';
import { validateFirstGameScreen } from '../validation/validate-screen.js';

export function validateScreenRepair(previous, repaired, input, { formatOnly }) {
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

export function sameRefStructure(a, b) {
  return computeStage26Digest(extractRefStructure(a)) === computeStage26Digest(extractRefStructure(b));
}

export function extractRefStructure(value) {
  if (Array.isArray(value)) return value.map(extractRefStructure);
  if (!isObject(value)) return null;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (key.includes('ref') || key.endsWith('_id') || ['party_id', 'transaction_id', 'option_id', 'action_kind', 'target_type', 'map_mode'].includes(key)) out[key] = safeClone(child);
    else if (isObject(child) || Array.isArray(child)) out[key] = extractRefStructure(child);
  }
  return out;
}

export function sameDisplayText(a, b) {
  return computeStage26Digest(extractDisplayText(a)) === computeStage26Digest(extractDisplayText(b));
}

export function extractDisplayText(value, key = '') {
  if (typeof value === 'string') return isDisplayStringKey(key) ? value : null;
  if (Array.isArray(value)) return value.map((item) => extractDisplayText(item, key));
  if (!isObject(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, extractDisplayText(child, childKey)]));
}
