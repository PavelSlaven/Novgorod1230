import {
  ACTION_PRODUCED_WEAPON_CLASSES,
  ordinaryArmamentWeaponDanger,
  resolveActionProducedCombatWeaponClass
} from '@rus/combat-health';
import { resolvePhysicalItemCondition } from '@rus/items-property';

export function createLowerDvinaTraceActionProducedWeaponClassifier({
  roleRunner
} = {}) {
  if (typeof roleRunner?.run !== 'function') {
    throw new TypeError('roleRunner.run must be a function.');
  }
  return async (request) => (await roleRunner.run({
    scope: 'turn_runtime', role_id: 'combat_weapon_classification',
    messages: [{ role: 'system', content: [
      'Classify the supplied current physical item for this combat only.',
      'Choose exactly one allowed qualitative_class.',
      'Choose not_weapon_capable when current facts do not support a weapon.',
      'Return only schema, request_id and qualitative_class.',
      'Never return damage, weapon_danger, identity, facts, or mechanics.'
    ].join(' ') }, { role: 'user', content: JSON.stringify(request) }],
    overrides: { temperature: 0, maxTokens: 20_000 }
  }))?.output ?? null;
}

export function resolveTraceOrdinaryWeaponDanger(items, actorRef,
  actionProduced = null) {
  const snapshots = heldWeaponSnapshots(items, actorRef);
  if (snapshots.length === 0) return undefined;
  const ordinary = snapshots.filter(({ kind }) => kind === 'ordinary');
  if (ordinary.length > 1) return null;
  if (ordinary.length === 1) {
    const selected = ordinary[0];
    if (selected.snapshot.condition_state !== selected.condition) return null;
    const danger = ordinaryArmamentWeaponDanger(selected.snapshot);
    return danger == null || danger === 0 ? null : danger;
  }
  const selected = snapshots.find(({ kind, item }) =>
    kind === 'action_produced' && item.item_id === actionProduced?.item_ref);
  if (actionProduced?.item_ref === null
      && actionProduced.weapon_danger === 0) return undefined;
  if (selected == null || selected.condition !== 'serviceable') return null;
  const danger = actionProduced.weapon_danger;
  return danger == null || danger === 0 ? null : danger;
}

export async function classifyTraceActionProducedWeapon({ items, actor_ref,
  request_id, classify }) {
  const snapshots = heldWeaponSnapshots(items, actor_ref);
  if (snapshots.some(({ kind }) => kind === 'ordinary')) return null;
  const candidates = snapshots.filter(({ kind }) =>
    kind === 'action_produced');
  if (candidates.length === 0) return null;
  if (typeof classify !== 'function') return null;
  const weapons = [];
  for (const { item } of candidates) {
    const state = item.state ?? {};
    const metadata = state.ordinary_metadata ?? {};
    const request = {
      schema: 'rus.combat.action_produced_weapon_classification_request.v1',
      request_id: candidates.length === 1 ? request_id
        : `${request_id}:${item.item_id}`,
      item: {
        item_ref: item.item_id,
        name: text(metadata.name) ? metadata.name : null,
        condition_state: resolvePhysicalItemCondition(item),
        physical_form: state.action_production?.physical_form ?? null,
        physical_facts: factTexts(metadata.semantic_facts),
        carry_form: state.runtime_instance_mechanics_snapshot?.mechanics
          ?.carry_form ?? null
      },
      allowed_classes: [...ACTION_PRODUCED_WEAPON_CLASSES]
    };
    let raw;
    try { raw = await classify(structuredClone(request)); } catch { return null; }
    let resolved;
    try {
      resolved = resolveActionProducedCombatWeaponClass({
        classification: raw
      });
    } catch { return null; }
    if (resolved.request_id !== request.request_id) return null;
    if (resolved.formal_mechanics.weapon_danger > 0) weapons.push({
      item_ref: item.item_id,
      weapon_danger: resolved.formal_mechanics.weapon_danger
    });
  }
  return weapons.length === 0
    ? { item_ref: null, weapon_danger: 0 }
    : weapons.length === 1 ? weapons[0] : null;
}

export async function classifyTraceActionProducedWeapons({ session, items,
  classify, requestId }) {
  const values = new Map();
  for (const participant of session.participant_states) {
    if (participant.current_intent?.intent_kind !== 'engage') continue;
    const actor = participant.actor_ref;
    const result = await classifyTraceActionProducedWeapon({ items,
      actor_ref: actor, request_id: ['combat-weapon', requestId,
        session.exchange_ordinal, actor.entity_kind, actor.entity_id].join(':'),
      classify });
    if (result != null) values.set(actorKey(actor), result);
  }
  return values;
}

export function traceActionProducedWeaponForActor(values, actor) {
  return values?.get(actorKey(actor)) ?? null;
}

export function resolveTraceCombatWeaponDanger(items, actor, values) {
  return resolveTraceOrdinaryWeaponDanger(items, actor,
    traceActionProducedWeaponForActor(values, actor));
}

function heldWeaponSnapshots(items, actorRef) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const placement = item?.placement;
    return actorRef.entity_kind === 'player_character'
      ? placement?.holder_character_id === actorRef.entity_id
      : placement?.holder_npc_id === actorRef.entity_id;
  }).map((item) => {
    const snapshot = item.weapon_mechanics_snapshot
      ?? item.state?.weapon_mechanics_snapshot;
    if (snapshot != null) return { kind: 'ordinary', snapshot,
      condition: resolvePhysicalItemCondition(item), item };
    return item.state?.action_production?.schema
        === 'rus.items.action_production_item_state.v1'
      ? { kind: 'action_produced',
          condition: resolvePhysicalItemCondition(item),
          item }
      : null;
  }).filter(Boolean);
}

function factTexts(values) {
  if (!Array.isArray(values)) return [];
  return values.map((fact) => typeof fact === 'string' ? fact : fact?.text)
    .filter(text);
}
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function actorKey(actor) { return `${actor.entity_kind}:${actor.entity_id}`; }
