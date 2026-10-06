import { detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { serverError } from './errors.js';

const PLAYER_TEXT_FIELDS = new Set([
  'action_label', 'actor_label', 'allowed_tensions', 'biography', 'content',
  'consequence_label', 'current_place', 'day_part_label', 'description',
  'detail', 'display_label', 'effect', 'error_message', 'label',
  'location_label', 'main_prose',
  'memories', 'message', 'name', 'npc_utterance', 'prose', 'role', 'route_labels',
  'people_labels', 'notes', 'reason', 'status', 'status_label', 'summary',
  'text', 'title', 'utterance_text', 'uncertainties', 'visible_changes', 'visible_scene',
  'visible_status', 'sensory_details', 'knowledge', 'condition', 'use', 'risk',
  'owner', 'holder', 'access', 'carry_location', 'date_label', 'time_label',
  'turn_elapsed_label', 'warnings', 'weather_label', 'display_name',
  'ordinary_descriptor', 'ordinary_activity', 'physical_facts', 'risk', 'use',
  'appearance', 'activity', 'state', 'mood', 'approximate_area',
  'approximate_direction', 'certainty', 'current_task', 'role_label',
  'placeholder', 'observed_conditions', 'place_label', 'date', 'formula', 'die',
  'place', 'calendar', 'health', 'energy', 'satiety'
]);

const CALIBRATION_PREFIX = /^(?:INFERENCE|HARD|FACT|CALIBRATION|DIRECTNESS|ANALOGY|EDITORIAL|UNCERTAIN)\s*:\s*/iu;

// One content rule set for published prose and player-safe projection.
const PLAYER_TEXT_MARKERS = Object.freeze([
  ['entity_ref', /(?:^|[\s([{])(?:npc|item|claim|canconn|party|actor|location|route|trace|node|g[0-6])[:/][a-z0-9][a-z0-9_.:/-]*/iu],
  ['entity_ref', /(?:^|[\s([{])baseline:g[45]_[a-z0-9][a-z0-9_.:/-]*/iu],
  ['entity_id', /\b(?:npc|item|claim|canconn|party|actor|location|route|trace|node|g[0-6])-[a-z0-9][a-z0-9_-]*/iu],
  ['entity_id', /(?:^|[\s([{])(?:npc|item|claim|canconn|party|actor|location|route|trace|node|pf|g[0-6])_[a-z0-9][a-z0-9_-]*/iu],
  ['entity_id', /(?:^|[\s([{])cg[45][a-z0-9_]*[a-z0-9][a-z0-9_-]*/iu],
  ['technical_enum', /\b(?:npc|actor|player|turn|phase|screen|scene|entity|world|item|claim|canconn|party|route|trace|game|llm|public|visible|presentation|typed|free|semantic|runtime|m2c|g[0-6])_[a-z0-9]+(?:_[a-z0-9]+)*\b/iu],
  ['error_code', /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/u],
  ['calibration_marker', /\b(?:INFERENCE|HARD|FACT|CALIBRATION|DIRECTNESS|ANALOGY|EDITORIAL|UNCERTAIN)\s*:/iu],
  ['calibration_marker', /\b(?:confidence|calibration|directness)\s*[:=]/iu],
  ['data_status', /\b(?:typed_gap|on_site|game_policy|not_started|retryable|uncommitted|runtime_text)\b/iu],
  ['data_status', /\b(?:status|data_status|visible_status)\s*[:=]\s*(?:pending|available|unavailable|ready|blocked|approved|rejected|failed|success|unknown|debug|fallback|recovery|enum)\b/iu],
  ['digest', /\b(?:sha-?256|digest)\s*[:=]?\s*[a-f0-9]{8,}\b/iu],
  ['digest', /\b[a-f0-9]{32,}\b/iu]
]);

export function findUnsafePlayerText(value, { label = false,
  statusField = false, generatedProse = false } = {}) {
  if (typeof value !== 'string') return null;
  if (label && /^(?:проход\s+\d+|выход\s+\d+|продолжить путь\s*[—-]\s*выход\s+\d+|человек\s+\(\d+\))$/iu.test(value.trim())) {
    return { category: 'ordinal_placeholder' };
  }
  if (statusField && /^(?:pending|available|unavailable|ready|blocked|approved|rejected|failed|success|unknown|debug|fallback|recovery|enum)$/iu.test(value.trim())) {
    return { category: 'data_status' };
  }
  if (label && /\s+\(\d+\)$/u.test(value.trim())) return { category: 'ordinal_placeholder' };
  // Capitalized generated route placeholders, not ordinary counts in player input.
  if (generatedProse && (/(?:^|[^\p{L}\p{N}_])(?:(?:Проход|Выход)\s+\d+(?![\p{L}\p{N}_])|[Чч]еловек\s+\(\d+\))/u.test(value)
      || /(?:^|[^\p{L}\p{N}_])(?:проход|выход)\s+\d+(?=$|[\s]*[.,;:!?»”"')\]])/iu.test(value))) {
    return { category: 'ordinal_placeholder' };
  }
  for (const [category, pattern] of PLAYER_TEXT_MARKERS) {
    if (pattern.test(value)) return { category };
  }
  return null;
}

export function playerSafeOrdinalLabel(value, entityKind = null) {
  if (typeof value !== 'string') return value;
  if (/^человек\s+\(\d+\)$/iu.test(value.trim())) return 'человек';
  if (/^проход\s+\d+$/iu.test(value.trim())) {
    return entityKind === 'g5_site_connection' ? 'переход' : 'проход';
  }
  if (/^выход\s+\d+$/iu.test(value.trim())) return 'выход';
  const directionalExit = value.trim().match(/^(.*?)\s*[—-]\s*выход\s+\d+$/iu);
  if (directionalExit) return directionalExit[1].trim() || 'выход';
  return value.replace(/\s+\(\d+\)$/u, '').trim();
}

/** Known compact WK markers become structured qualifiers on the narration wire. */
export function playerSafeCalibrationText(value) {
  if (typeof value !== 'string') return value;
  let text = value.trim();
  while (CALIBRATION_PREFIX.test(text)) text = text.replace(CALIBRATION_PREFIX, '');
  return text;
}

export function findUnsafePublishedText(value, field = '') {
  return findPublishedText(value, '$', field);
}

function findPublishedText(value, path = '$', field = '', seen = new Set()) {
  if (typeof value === 'string') {
    if (!PLAYER_TEXT_FIELDS.has(field)) return null;
    const finding = findUnsafePlayerText(value, {
      label: ['display_label', 'label', 'route_labels', 'people_labels'].includes(field),
      generatedProse: ['prose', 'main_prose'].includes(field),
      statusField: ['status', 'visible_status', 'data_status', 'health',
        'energy', 'satiety'].includes(field)
    });
    return finding == null ? null : { ...finding, path };
  }
  if (value == null || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    const nestedField = PLAYER_TEXT_FIELDS.has(key) ? key : field;
    const finding = findPublishedText(nested, `${path}.${key}`, nestedField, seen);
    if (finding != null) return finding;
  }
  seen.delete(value);
  return null;
}

export function assertPublicPayload(value) {
  validateExactNpcUtteranceFields(value);
  const leaks = detectHiddenLeaks(value);
  if (leaks.length) {
    throw serverError('PUBLIC_PAYLOAD_HIDDEN_LEAK', 'Public API payload contains hidden fields.', { status: 500 });
  }
  const finding = findPublishedText(value);
  if (finding != null) {
    throw serverError('PUBLIC_PAYLOAD_SERVICE_TEXT',
      'Public API payload contains service text.', {
        status: 500,
        details: { field_path: finding.path, category: finding.category }
      });
  }
  return value;
}


function validateExactNpcUtteranceFields(value, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'exact_npc_utterances'
        && !validExactNpcUtterances(nested)) {
      throw serverError('PUBLIC_PAYLOAD_EXACT_SPEECH_INVALID',
        'Public exact speech must use verified NPC statement provenance.', {
          status: 500
        });
    }
    validateExactNpcUtteranceFields(nested, seen);
  }
}

function validExactNpcUtterances(value) {
  const provenanceKeys = ['source', 'player_receipt',
    'precommit_service_marker_check', 'statement_ref', 'listener_ref',
    'receipt_utterance_text'];
  const exactKeys = (record, keys) => record != null
    && typeof record === 'object' && !Array.isArray(record)
    && Object.keys(record).length === keys.length
    && keys.every((key) => Object.hasOwn(record, key));
  const nonempty = (item) => typeof item === 'string' && item.trim();
  return Array.isArray(value) && value.every((entry) =>
    exactKeys(entry, ['speaker_ref', 'utterance_text', 'provenance'])
    && exactKeys(entry.speaker_ref, ['entity_kind', 'entity_id'])
    && entry.speaker_ref.entity_kind === 'npc'
    && nonempty(entry.speaker_ref.entity_id)
    && nonempty(entry.utterance_text)
    && exactKeys(entry.provenance, provenanceKeys)
    && entry.provenance.source === 'phase3_statement_receipt'
    && entry.provenance.player_receipt === 'full'
    && entry.provenance.precommit_service_marker_check === true
    && exactKeys(entry.provenance.statement_ref,
      ['entity_kind', 'entity_id'])
    && entry.provenance.statement_ref.entity_kind
      === 'conversation_statement'
    && nonempty(entry.provenance.statement_ref.entity_id)
    && exactKeys(entry.provenance.listener_ref,
      ['entity_kind', 'entity_id'])
    && entry.provenance.listener_ref.entity_kind === 'player_character'
    && nonempty(entry.provenance.listener_ref.entity_id)
    && entry.provenance.receipt_utterance_text === entry.utterance_text);
}

export function projectPublicPayload(value) {
  const output = structuredClone(value);
  stripExactNpcUtteranceProvenance(output);
  return output;
}

function stripExactNpcUtteranceProvenance(value, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((nested) => stripExactNpcUtteranceProvenance(nested, seen));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'exact_npc_utterances' && Array.isArray(nested)) {
      for (const entry of nested) {
        if (entry && typeof entry === 'object') delete entry.provenance;
      }
    }
    stripExactNpcUtteranceProvenance(nested, seen);
  }
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
