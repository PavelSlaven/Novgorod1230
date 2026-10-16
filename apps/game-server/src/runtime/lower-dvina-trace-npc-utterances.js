import { findUnsafePlayerText } from '../public-boundary.js';

const PROVENANCE = Object.freeze({
  source: 'phase3_statement_receipt',
  player_receipt: 'full',
  precommit_service_marker_check: true
});

export function phase3CommittedNpcUtterances(semantic) {
  if (!Array.isArray(semantic?.statements)
      || !Array.isArray(semantic?.audiences)) return [];
  const result = [];
  for (const statement of semantic.statements) {
    if (statement?.speaker_ref?.entity_kind !== 'npc'
        || typeof statement.utterance_text !== 'string'
        || !statement.utterance_text.trim()) continue;
    const audiences = semantic.audiences.filter(({ statement_ref }) =>
      statement_ref?.entity_kind === 'conversation_statement'
      && statement_ref.entity_id === statement.statement_id);
    if (audiences.length !== 1) continue;
    const receipts = (audiences[0].received_messages ?? []).filter(
      ({ listener_ref, comprehension, utterance_text }) =>
        listener_ref?.entity_kind === 'player_character'
        && comprehension === 'full'
        && utterance_text === statement.utterance_text);
    if (receipts.length !== 1) continue;
    const marker = findUnsafePlayerText(statement.utterance_text, { label: true, generatedProse: true });
    if (marker != null) {
      console.error('[game-server] omitted unsafe committed NPC utterance', {
        category: marker.category
      });
      continue;
    }
    result.push({ speaker_ref: structuredClone(statement.speaker_ref),
      utterance_text: statement.utterance_text, provenance: {
        ...PROVENANCE,
        statement_ref: { entity_kind: 'conversation_statement',
          entity_id: statement.statement_id },
        listener_ref: structuredClone(receipts[0].listener_ref),
        receipt_utterance_text: receipts[0].utterance_text
      } });
  }
  return result;
}

export function validExactNpcUtterances(value) {
  const expected = ['speaker_ref', 'utterance_text', 'provenance'];
  const provenanceKeys = [...Object.keys(PROVENANCE), 'statement_ref',
    'listener_ref', 'receipt_utterance_text'];
  return Array.isArray(value) && value.every((entry) => plain(entry)
    && exactKeys(entry, expected)
    && plain(entry.speaker_ref)
    && exactKeys(entry.speaker_ref, ['entity_kind', 'entity_id'])
    && entry.speaker_ref.entity_kind === 'npc'
    && nonempty(entry.speaker_ref.entity_id)
    && nonempty(entry.utterance_text)
    && plain(entry.provenance)
    && exactKeys(entry.provenance, provenanceKeys)
    && entry.provenance.source === PROVENANCE.source
    && entry.provenance.player_receipt === PROVENANCE.player_receipt
    && entry.provenance.precommit_service_marker_check
      === PROVENANCE.precommit_service_marker_check
    && plain(entry.provenance.statement_ref)
    && exactKeys(entry.provenance.statement_ref,
      ['entity_kind', 'entity_id'])
    && entry.provenance.statement_ref.entity_kind
      === 'conversation_statement'
    && nonempty(entry.provenance.statement_ref.entity_id)
    && plain(entry.provenance.listener_ref)
    && exactKeys(entry.provenance.listener_ref,
      ['entity_kind', 'entity_id'])
    && entry.provenance.listener_ref.entity_kind === 'player_character'
    && nonempty(entry.provenance.listener_ref.entity_id)
    && entry.provenance.receipt_utterance_text === entry.utterance_text);
}

function exactKeys(value, expected) {
  const keys = Object.keys(value);
  return keys.length === expected.length
    && keys.every((key) => expected.includes(key));
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plain(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
