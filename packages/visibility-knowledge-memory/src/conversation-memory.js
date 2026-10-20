const RECORD_KEYS = ['kind', 'speaker_ref', 'listener_ref', 'text', 'turn'];
const REF_KEYS = ['entity_kind', 'entity_id'];
const KINDS = new Set(['heard', 'said', 'silence']);
const PARTICIPANT_KINDS = new Set(['npc', 'player_character']);
const DEFAULT_LIMIT = 40;

function plainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plainRecord(value)
    && Reflect.ownKeys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function participantRef(value) {
  return exactKeys(value, REF_KEYS)
    && PARTICIPANT_KINDS.has(value.entity_kind)
    && typeof value.entity_id === 'string'
    && value.entity_id.length > 0;
}

function sameRef(left, right) {
  return left.entity_kind === right.entity_kind && left.entity_id === right.entity_id;
}

export function validateConversationMemoryRecord(value) {
  if (!exactKeys(value, RECORD_KEYS) || !KINDS.has(value.kind)
    || !participantRef(value.speaker_ref) || !participantRef(value.listener_ref)
    || typeof value.text !== 'string'
    || !Number.isSafeInteger(value.turn) || value.turn < 0) {
    return false;
  }
  return value.kind === 'silence' ? value.text === '' : value.text.trim().length > 0;
}

function summarize(entry, npcRef, labelOf) {
  const { kind, speaker_ref: speaker, listener_ref: listener, text } = entry;
  if (kind === 'said') {
    return `Моя реплика. Кому: ${labelOf(listener)}. Слова: «${text}»`;
  }
  if (kind === 'silence') return `Моё молчание в ответ. Кому: ${labelOf(listener)}.`;
  if (sameRef(listener, npcRef)) {
    return `Реплика, обращённая ко мне. Говорящий: ${labelOf(speaker)}. `
      + `Слова: «${text}»`;
  }
  return `Чужая реплика. Говорящий: ${labelOf(speaker)}. Кому: ${labelOf(listener)}. `
    + `Слова: «${text}»`;
}

export function projectConversationMemory(rawRecords, {
  npc_ref,
  limit = DEFAULT_LIMIT,
  label_of,
  time_of
} = {}) {
  if (!Array.isArray(rawRecords) || !rawRecords.every(validateConversationMemoryRecord)) {
    throw new TypeError('Conversation memory requires a list of valid raw records');
  }
  if (!participantRef(npc_ref) || npc_ref.entity_kind !== 'npc') {
    throw new TypeError('Conversation memory requires the NPC entity ref');
  }
  if (typeof label_of !== 'function' || typeof time_of !== 'function') {
    throw new TypeError('Conversation memory requires label_of and time_of functions');
  }
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new TypeError('Conversation memory limit must be a positive safe integer');
  }
  const first = Math.max(0, rawRecords.length - limit);
  const windowed = rawRecords.slice(first);
  return {
    recent_events: windowed.map((entry, offset) => ({
      event_ref: {
        entity_kind: 'memory_event',
        entity_id: `conversation-memory:${npc_ref.entity_id}:${first + offset}`
      },
      source_event_ref: null,
      summary: summarize(entry, npc_ref, label_of),
      occurred_at: time_of(entry.turn)
    })),
    public_conversation_history: windowed
      .filter(({ kind }) => kind !== 'silence')
      .map(({ speaker_ref: speaker, text }) => ({
        speaker_ref: { entity_kind: speaker.entity_kind, entity_id: speaker.entity_id },
        utterance_text: text
      }))
  };
}
