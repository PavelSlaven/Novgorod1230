import { projectNpcConversationSubject } from '@rus/npc-runtime';
import { projectConversationMemory, validateConversationMemoryRecord }
  from '@rus/visibility-knowledge-memory';

const SCENE_REF = 'p3-scene';
const NATIVE_NO_ACTIVITY = 'ACT_NULL';
const RECORD_KEYS = ['kind', 'speaker_ref', 'listener_ref', 'text', 'turn'];
const PLACEMENT_TEXT = Object.freeze({ ground: 'лежит поблизости', worn: 'на мне',
  carried: 'при мне', wielded: 'у меня в руках' });
const WIRE_SERVICE_KEYS = new Set(['request_id', 'boundary_id', 'conversation_id',
  'exchange_id', 'state_version', 'requested_at', 'signal_refs', 'template_ref']);
const CYRILLIC = /\p{Script=Cyrillic}/u;

export function p3Error(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function p3GameTimeOfTurn(turn) {
  const remainder = turn % 60;
  const divisor = (left, right) => right === 0 ? left : divisor(right, left % right);
  const common = divisor(remainder, 60) || 60;
  return { whole_minutes: String(Math.floor(turn / 60)),
    subminute_numerator: String(remainder / common),
    subminute_denominator: String(60 / common) };
}

function convertRef(value, playerRef) {
  if (value === 'avatar') return { ...playerRef };
  const match = typeof value === 'string' ? /^npc:(\d+)$/u.exec(value) : null;
  if (!match) throw p3Error('P3_NPC_MEMORY_RECORD_INVALID');
  return { entity_kind: 'npc', entity_id: match[1] };
}

export function convertP3MemoryRecords(rawRecords, playerRef) {
  if (!Array.isArray(rawRecords)) throw p3Error('P3_NPC_MEMORY_RECORD_INVALID');
  return rawRecords.map((raw) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)
        || Object.keys(raw).length !== RECORD_KEYS.length
        || !RECORD_KEYS.every(key => Object.hasOwn(raw, key))) {
      throw p3Error('P3_NPC_MEMORY_RECORD_INVALID');
    }
    const record = { kind: raw.kind, speaker_ref: convertRef(raw.speaker_ref, playerRef),
      listener_ref: convertRef(raw.listener_ref, playerRef), text: raw.text, turn: raw.turn };
    if (!validateConversationMemoryRecord(record)) throw p3Error('P3_NPC_MEMORY_RECORD_INVALID');
    return record;
  });
}

const sameRef = (left, right) => left.entity_kind === right.entity_kind
  && left.entity_id === right.entity_id;

function withoutCurrentPhrase(records, { playerRef, npcRef, utterance, turns }) {
  // Native writes the heard record when the sound is processed, a turn or two after the speech
  // starts, so its turn lies inside the operation window rather than on its ends.
  const first = Math.min(...turns);
  const last = Math.max(...turns);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record.kind === 'heard' && record.text === utterance
        && record.turn >= first && record.turn <= last
        && sameRef(record.speaker_ref, playerRef) && sameRef(record.listener_ref, npcRef)) {
      return records.filter((_, position) => position !== index);
    }
  }
  return records;
}

// Thresholds follow npc::opinion_text in src/npc.cpp.
function trustLevel(value) {
  if (value <= -3) return 'low';
  if (value <= 2) return undefined;
  return value <= 4 ? 'medium' : 'high';
}

function hostilityLevel(value) {
  return value <= 2 ? 'none' : value <= 5 ? 'mild' : 'strong';
}

function perceptionRefOfItem(turn, npcId, uid) {
  return { entity_kind: 'perception_result', entity_id: `p3-seen-${turn}-${npcId}-${uid}` };
}

function wireValue(value, key, named, insideReferences) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object') return value;
  let projected;
  if (Array.isArray(value)) {
    projected = value.map(entry => wireValue(entry, '', named, insideReferences))
      .filter(entry => entry !== undefined);
  } else {
    // The request carries the same resources twice (top level and npc); the model gets them once.
    const once = (name, entry) => {
      if (name !== 'npc' || !Object.hasOwn(value, 'available_resources')
          || entry === null || typeof entry !== 'object') return entry;
      const { available_resources: _duplicate, ...rest } = entry;
      return rest;
    };
    projected = Object.fromEntries(Object.entries(value).flatMap(([name, entry]) => {
      if (WIRE_SERVICE_KEYS.has(name)) return [];
      const child = wireValue(once(name, entry), name, named,
        insideReferences || name === 'allowed_references');
      return child === undefined ? [] : [[name, child]];
    }));
  }
  const empty = Array.isArray(projected) ? projected.length === 0
    : Object.keys(projected).length === 0;
  return empty && !insideReferences && !named.has(key) ? undefined : projected;
}

export function projectP3NpcWire(value, system) {
  return wireValue(value, '', new Set(system.match(/[A-Za-z0-9_]+/gu)), false) ?? {};
}

function appearanceText(actor, who) {
  const look = actor.appearance;
  const worn = (look.worn_items ?? []).map(item => item.label).filter(Boolean);
  const wounds = (look.visible_wounds ?? []).map(wound => wound.label).filter(Boolean);
  return [`Вижу человека рядом: ${who}.`,
    ...(look.sex_label ? [`${look.sex_label}.`] : []),
    ...(worn.length > 0 ? [`Одежда: ${worn.join(', ')}.`] : []),
    ...(look.wielded_item?.label ? [`В руках: ${look.wielded_item.label}.`] : []),
    ...(look.wet === true ? ['Одежда мокрая.'] : []),
    ...(wounds.length > 0 ? [`Видно: ${wounds.join(', ')}.`] : [])].join(' ');
}

function environmentText(environment) {
  return [['Время суток', environment?.time_label],
    ['Свет там, где стоит собеседник', environment?.light_label],
    ['Погода', environment?.weather_label]]
    .filter(([, label]) => typeof label === 'string' && label !== '')
    .map(([name, label]) => `${name}: ${label}.`).join(' ');
}

function withResourceLabels(resources, labels) {
  return resources.map(resource => labels.has(resource.resource_ref)
    ? { ...resource, label: labels.get(resource.resource_ref) } : resource);
}

export function buildP3NpcConversationSubject({ projection, profile, frame, player,
  npcRef, playerRef, perceptionRef, utterance, currentTurns }) {
  const npcId = npcRef.entity_id;
  const at = p3GameTimeOfTurn(frame.turn);
  const instanceId = `npc:${npcId}`;
  const converted = convertP3MemoryRecords(projection.conversation_memory, playerRef);
  const records = withoutCurrentPhrase(converted,
    { playerRef, npcRef, utterance, turns: currentTurns });
  const acquainted = records.some(({ speaker_ref: speaker, listener_ref: listener }) =>
    (sameRef(speaker, playerRef) && sameRef(listener, npcRef))
    || (sameRef(speaker, npcRef) && sameRef(listener, playerRef)));
  const female = projection.gender === 'female';
  const relation = acquainted
    ? `человек, с которым я уже ${female ? 'говорила' : 'говорил'}` : 'незнакомый человек';
  const memory = projectConversationMemory(records, { npc_ref: npcRef, limit: 40,
    label_of: (ref) => sameRef(ref, npcRef) ? 'я' : sameRef(ref, playerRef) ? 'собеседник'
      : 'другой человек',
    time_of: p3GameTimeOfTurn });

  const items = projection.visible_items;
  const activityRef = projection.activity_id && projection.activity_id !== NATIVE_NO_ACTIVITY
    ? projection.activity_id : null;
  const seen = (item) => perceptionRefOfItem(frame.turn, npcId, item.item_uid);
  const profileSnapshot = profile?.npc_snapshot ?? {};
  const npcSnapshot = { ...profileSnapshot, instance_id: instanceId,
    identity_state: { ...profileSnapshot.identity_state,
      canonical_name: projection.name.trim() || null },
    machine_state: { ...profileSnapshot.machine_state, location_ref: SCENE_REF } };
  const fact = (id, summary, extra = {}) => ({
    fact_ref: { entity_kind: 'known_fact', entity_id: id }, source_event_ref: null,
    resource_ref: null, process_ref: null, summary, state: 'known', ...extra });
  const knownFacts = [
    ...(profile?.knowledge_snapshot?.known_facts ?? []),
    fact(`p3-own-gender-${npcId}`, female ? 'Я женщина.' : 'Я мужчина.'),
    ...(projection.job_description?.trim()
      ? [fact(`p3-own-job-${npcId}`, projection.job_description.trim())] : []),
    ...items.filter(item => item.owner_faction_id !== '' && item.owner_faction_id
      === projection.faction_id).map(item => fact(`p3-owns-${item.item_uid}`,
      `Вещь «${item.label}» принадлежит мне.`, { resource_ref: item.item_ref,
        source_perception_ref: seen(item) }))
  ];
  const observation = (id, text) => ({ observation_ref: { entity_kind: 'perception_result',
    entity_id: id }, source_type: 'direct_perception', observed_at: at, fact_text: text });
  const surroundings = environmentText(frame.environment);
  const subject = projectNpcConversationSubject({
    npc_ref: npcRef,
    current_observations: [
      ...items.map(item => ({ observation_ref: seen(item), source_type: 'direct_perception',
        observed_at: at,
        fact_text: `Вижу вещь «${item.label}»: ${PLACEMENT_TEXT[item.placement]}.` })),
      ...(projection.visible_actors ?? []).filter(actor => actor.appearance)
        .map(actor => observation(`p3-seen-actor-${frame.turn}-${npcId}-${actor.actor_id}`,
          appearanceText(actor, actor.actor_id === player.actor_id ? relation
            : 'другой человек'))),
      ...(surroundings ? [observation(`p3-surroundings-${frame.turn}-${npcId}`, surroundings)]
        : []),
      { observation_ref: perceptionRef, source_type: 'direct_perception', observed_at: at,
        fact_text: `Слышу реплику, обращённую ко мне. Говорящий: ${relation}. `
          + `Слова: «${utterance}».` }
    ],
    received_messages: [],
    npc_snapshot: npcSnapshot,
    current_activity_snapshot: { activity_ref: activityRef, summary: null,
      status: activityRef ? 'in_progress' : 'idle',
      can_continue_automatically: false },
    relationship_snapshots: [{ relationship_ref: `npc${npcId}-relationship-${player.actor_id}`,
      actor_ref: playerRef, relation, status: acquainted ? 'acquainted' : 'first_meeting',
      trust: trustLevel(projection.opinion_of_avatar.trust),
      hostility: hostilityLevel(projection.opinion_of_avatar.anger), dependency: 'none' }],
    resource_snapshots: items.map(item => ({ resource_ref: item.item_ref,
      template_ref: item.type,
      ...(item.placement === 'ground'
        ? { state: { location_ref: SCENE_REF, access_state: 'accessible' } }
        : { holder_npc_id: instanceId }) })),
    perception_snapshot: { visible_objects: items.map(item => ({ resource_ref: item.item_ref,
      source_perception_ref: seen(item) })) },
    knowledge_snapshot: { ...profile?.knowledge_snapshot, known_facts: knownFacts },
    memory_snapshot: { recent_events: memory.recent_events }
  });
  const entityRefs = [...new Map(items.map(item => [item.item_uid,
    { entity_kind: 'item', entity_id: item.item_uid }])).values()]
    .sort((left, right) => `${left.entity_kind}\0${left.entity_id}`
      < `${right.entity_kind}\0${right.entity_id}` ? -1 : 1);
  const labels = new Map(items.filter(item => typeof item.label === 'string'
    && CYRILLIC.test(item.label)).map(item => [item.item_ref, item.label]));
  return { npc: { ...subject.npc,
    available_resources: withResourceLabels(subject.npc.available_resources, labels) },
    knowledge: subject.knowledge, memory: subject.memory,
    available_resources: withResourceLabels(subject.available_resources, labels),
    knowledge_refs: subject.knowledge_refs,
    entity_refs: entityRefs, public_conversation_history: memory.public_conversation_history };
}
