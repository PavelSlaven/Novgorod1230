import {
  assertAllowedKeys,
  compact,
  finite,
  plain,
  projectionError,
  scalarRecord,
  text,
  textArray
} from './lower-dvina-trace-player-safe-json.js';

const BODY_KEYS = new Set([
  'health', 'satiety', 'energy', 'body_parts', 'active_conditions'
]);
const ATTRIBUTE_IDS = new Set([
  'strength', 'dexterity', 'endurance', 'reason', 'attention', 'influence'
]);
const SKILL_IDS = new Set([
  'athletics', 'stealth', 'melee', 'ranged_combat', 'craft', 'household',
  'survival', 'riding', 'healing', 'observation', 'communication',
  'custom_and_law'
]);
const BODY_PART_IDS = new Set([
  'head', 'neck', 'torso', 'chest', 'abdomen', 'back', 'left_arm',
  'right_arm', 'left_hand', 'right_hand', 'left_leg', 'right_leg',
  'left_foot', 'right_foot'
]);
const NPC_KEYS = new Set([
  'instance_id', 'actor_id', 'npc_id', 'participant_slot_ref', 'profile_id',
  'profile_level', 'anchor_id', 'g5_anchor_id', 'location_ref', 'zone_ref',
  'role_ref', 'occupation_ref', 'identity_state', 'status',
  'visibility_state', 'body_condition', 'surrender_state', 'restraint_state'
]);
const OCCURRED_AT_KEYS = new Set([
  'whole_minutes', 'subminute_numerator', 'subminute_denominator',
  'day', 'hour', 'minute'
]);
const BODY_PART_KEYS = new Set([
  'id', 'state', 'status', 'condition', 'severity', 'function', 'pain'
]);

export function projectActor({ profile, body, actorId }) {
  return compact({
    actor_id: actorId,
    attributes: projectCapabilityMap(profile?.attributes, ATTRIBUTE_IDS,
      ['value', 'bonus']),
    skills: projectCapabilityMap(profile?.skills, SKILL_IDS,
      ['level', 'display', 'bonus']),
    body: projectBodyState(body ?? profile?.body)
  });
}

export function projectBodyState(value, { strict = false } = {}) {
  if (!plain(value)) return undefined;
  if (strict) assertAllowedKeys(value, BODY_KEYS, 'body_state', invalidCode());
  return compact({
    health: finite(value.health),
    satiety: finite(value.satiety),
    energy: finite(value.energy),
    body_parts: projectBodyParts(value.body_parts, strict),
    active_conditions: Array.isArray(value.active_conditions)
      ? value.active_conditions.map((condition) => projectCondition(
          condition, strict
        )).filter(Boolean)
      : undefined
  });
}

export function projectNpcs(records, { position, explicitlyVisible = false,
  strict = false } = {}) {
  if (!Array.isArray(records)) return undefined;
  return records.filter((npc) => explicitlyVisible
    ? !recordIsClosed(npc)
    : sceneNpcIsVisible(npc, position))
    .map((npc) => projectNpc(npc, strict));
}

export function projectInteractions(records, { strict = false } = {}) {
  if (!Array.isArray(records)) return undefined;
  const allowed = new Set([
    'interaction_id', 'id', 'interaction_kind', 'kind', 'speaker_actor_id',
    'target_actor_ids', 'statement_ref', 'content', 'occurred_at',
    'visible', 'is_visible', 'visibility', 'visibility_state',
    'knowledge_state', 'disclosure_state'
  ]);
  return records.filter((record) => !recordIsClosed(record)).map((record) => {
    if (strict) {
      assertAllowedKeys(record, allowed, 'interactions[]', invalidCode());
    }
    return compact({
      interaction_id: text(record.interaction_id ?? record.id),
      interaction_kind: text(record.interaction_kind ?? record.kind),
      speaker_actor_id: text(record.speaker_actor_id),
      target_actor_ids: textArray(record.target_actor_ids),
      statement_ref: text(record.statement_ref),
      content: text(record.content),
      occurred_at: scalarRecord(record.occurred_at, {
        strict, path: 'occurred_at', allowedKeys: OCCURRED_AT_KEYS
      })
    });
  });
}

function projectCapabilityMap(value, allowedIds, allowedKeys) {
  if (!plain(value)) return undefined;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => allowedIds.has(key))
    .map(([key, record]) => [
      key,
      compact(Object.fromEntries(allowedKeys.map((field) => [
        field,
        field === 'value' || field === 'bonus'
          ? finite(record?.[field])
          : text(record?.[field])
      ])))
    ]));
}

function projectBodyParts(value, strict) {
  if (!plain(value)) return undefined;
  if (strict && Object.keys(value).some((key) => !BODY_PART_IDS.has(key))) {
    throw projectionError(invalidCode(),
      'body_parts contains an unsupported body part.');
  }
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => BODY_PART_IDS.has(key))
    .map(([key, part]) => [
      key,
      scalarRecord(part, {
        strict, path: `body_parts.${key}`, allowedKeys: BODY_PART_KEYS
      })
    ]));
}

function projectCondition(value, strict) {
  if (!plain(value)) return undefined;
  const allowed = new Set([
    'id', 'label', 'status', 'location', 'severity', 'effect'
  ]);
  if (strict) {
    assertAllowedKeys(value, allowed, 'active_conditions[]', invalidCode());
  }
  return compact({
    id: text(value.id), label: text(value.label), status: text(value.status),
    location: text(value.location), severity: finite(value.severity),
    effect: text(value.effect)
  });
}

function projectNpc(npc, strict) {
  if (typeof npc === 'string') return npc;
  if (strict) assertAllowedKeys(npc, NPC_KEYS, 'npcs[]', invalidCode());
  const machineState = plain(npc.machine_state) ? npc.machine_state : null;
  return compact({
    instance_id: text(npc.instance_id), actor_id: text(npc.actor_id),
    npc_id: text(npc.npc_id), participant_slot_ref: text(npc.participant_slot_ref),
    profile_id: text(npc.profile_id), profile_level: text(npc.profile_level),
    anchor_id: text(npc.anchor_id), g5_anchor_id: text(npc.g5_anchor_id),
    location_ref: text(npc.location_ref), zone_ref: text(npc.zone_ref),
    role_ref: text(npc.role_ref), occupation_ref: text(npc.occupation_ref),
    identity_state: projectIdentity(npc.identity_state, strict),
    status: text(machineState ? machineState.status : npc.status),
    visibility_state: text(npc.visibility_state),
    body_condition: machineText(machineState
      ? machineState.body_condition : npc.body_condition),
    surrender_state: text(machineState
      ? machineState.surrender_state : npc.surrender_state),
    restraint_state: text(machineState
      ? machineState.restraint_state : npc.restraint_state)
  });
}

function machineText(value) {
  return text(plain(value) ? value.state : value);
}

function projectIdentity(value, strict) {
  if (!plain(value)) return undefined;
  const allowed = new Set(['canonical_name', 'display_name']);
  if (strict) assertAllowedKeys(value, allowed, 'identity_state', invalidCode());
  return compact({
    canonical_name: text(value.canonical_name),
    display_name: text(value.display_name)
  });
}

function sceneNpcIsVisible(npc, position) {
  if (typeof npc === 'string') return true;
  if (!plain(npc) || recordIsClosed(npc)) return false;
  const scopes = [['location_ref', 'location_ref'], ['anchor_id', 'g5_anchor_id'],
    ['g5_anchor_id', 'g5_anchor_id'], ['g5_node_id', 'g5_node_id'],
    ['zone_ref', 'zone_ref']]
    .filter(([npcKey, positionKey]) => npc[npcKey] != null
      && position?.[positionKey] != null);
  if (scopes.length > 0) return scopes.every(([npcKey, positionKey]) =>
    npc[npcKey] === position?.[positionKey]);
  return npc.visible === true || npc.is_visible === true
    || ['visible', 'scene'].includes(npc.visibility_state);
}

function recordIsClosed(record) {
  if (!plain(record)) return false;
  if (record.visible === false || record.is_visible === false) return true;
  const closed = new Set([
    'closed', 'closed_until_disclosed', 'hidden', 'private', 'secret',
    'sealed', 'unknown', 'unmaterialized'
  ]);
  return [record.visibility, record.visibility_state, record.knowledge_state,
    record.disclosure_state].some((state) => typeof state === 'string'
      && closed.has(state.toLowerCase()));
}

function invalidCode() {
  return 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID';
}
