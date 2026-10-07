import { resolvePhysicalItemCondition } from '@rus/items-property';
import { isMovementVisibleObject } from './spatial-v3-movement-objects.js';
import { playerSafeAppearanceSummary } from
  './lower-dvina-trace-player-safe-appearance.js';
import { resolveVisibleItemLabel } from './lower-dvina-trace-visible-item-label.js';
const CARRIED_VISIBLE_STATUSES = Object.freeze({ hands: 'у вас в руках', other: 'при вас' });
const carriedVisibleStatus = (status) => Object.values(CARRIED_VISIBLE_STATUSES).includes(status);

export function lowerDvinaTraceDirectResultChanges(input, sceneItems = [],
  body = {}, currentScene = null) {
  const plans = input?.mode_resolution?.decision_trace?.step_traces ?? [];
  const directPlans = plans.filter(({ approved_plan: plan, applied }) =>
    applied === true && plan?.resolution === 'direct'
      && plan.goal_result !== 'not_achieved'
      && Array.isArray(plan.operations) && plan.operations.length === 0
      && plan.check === null).map(({ approved_plan }) => approved_plan);
  const kinds = new Set(directPlans.map(({ direct_result_kind: kind }) => kind));
  return [
    ...(directPlans.some((plan) => plan.direct_result_kind === 'player_safe_observation'
        && plan.assessment == null)
      ? ['Вы внимательно изучили обстановку.',
        ...lowerDvinaTraceObservedSceneChanges(currentScene)] : []),
    ...(kinds.has('player_safe_item_observation')
      ? carriedItemObservationChanges(sceneItems) : []),
    ...(kinds.has('player_safe_body_observation')
      ? bodyObservationChanges(body) : []),
    ...(kinds.has('no_state_gesture')
      ? ['Вы завершили простой жест.'] : [])
  ];
}

// Call only for a confirmed observation or a newly reached scene. Snapshot
// knowledge (including inventory/body metadata) is not a new observation.
export function lowerDvinaTraceObservedSceneChanges(scene) {
  const visibleNpcs = distinctNpcLabels(scene?.visible_npc ?? []);
  return [...new Set([
    ...(scene?.sensory_details ?? []),
    ...visibleNpcs.flatMap((npc) => [
      ...observedEntityChanges(npc),
      ...[npc.observable_cues?.ordinary_remainder?.ordinary_descriptor,
        npc.observable_cues?.ordinary_remainder?.ordinary_activity]
        .filter(text).map((fact) => `${npc.display_label}: ${fact}`)
    ]),
    ...(scene?.visible_objects ?? []).filter((object) => !isMovementVisibleObject(object)
      && !carriedVisibleStatus(object.visible_status)).flatMap(observedEntityChanges)
  ])];
}

export function distinctNpcLabels(npcs) {
  const normalized = npcs.map((npc) => / \(\d+\)$/u.test(npc?.display_label)
    ? { ...npc, display_label: npc.display_label.replace(/ \(\d+\)$/u, '') }
    : npc);
  const totals = new Map();
  for (const { display_label: label } of normalized) {
    if (text(label)) totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  return normalized.map((npc) => {
    const label = npc?.display_label;
    if (!text(label) || totals.get(label) < 2) return npc;
    const appearance = playerSafeAppearanceSummary(npc);
    return appearance == null ? npc
      : { ...npc, display_label: `${label}, ${appearance}` };
  });
}

function observedEntityChanges(entity) {
  if (!text(entity?.display_label)) return [];
  const status = entity.visible_status;
  return [`В поле зрения — ${entity.display_label}${text(status)
    && status !== 'available' ? `: ${status}` : ''}.`];
}

function bodyObservationChanges(body) {
  const active = body?.active_conditions ?? [];
  const labels = active.flatMap((condition) =>
    text(condition?.label) ? [condition.label] : []);
  if (active.length === 0) return [
    'Осмотр тела не подтвердил активных телесных состояний; новое повреждение или диагноз не установлены.'
  ];
  return [
    labels.length === active.length
      ? `Подтверждённые вам телесные состояния: ${russianList(labels)}.`
      : 'Осмотр подтвердил наличие активного телесного состояния.',
    'Новое повреждение или диагноз этим осмотром не установлены.'
  ];
}

export function lowerDvinaTraceVisibleSceneItems(items, position, actorId,
  itemLabels = {}) {
  return (items ?? []).flatMap((item) => {
    const placement = item?.placement ?? {};
    const location = placement.location_ref;
    const anchor = placement.g5_anchor_id ?? placement.anchor_id;
    const coLocated = text(location)
        && location === position?.location_ref
      || text(anchor) && [position?.g5_anchor_id, position?.anchor_id]
        .filter(text).includes(anchor);
    const held = isLowerDvinaTraceItemHeldBy(item, actorId);
    const itemId = item?.item_id ?? item?.instance_id;
    if ((!coLocated && !held) || !text(itemId)) return [];
    const label = resolveVisibleItemLabel(item, itemLabels);
    return [{ physicalFacts: item.physical_facts ?? [], held,
      condition: resolvePhysicalItemCondition(item), visibleObject: {
      entity_ref: { entity_kind: 'item', entity_id: itemId },
      ...(label.kind === 'labeled'
        ? { display_label: label.label, recognition: 'recognized' }
        : { label_gap: { code: label.code } }),
      visible_status: held
        ? placement.physical_position === 'hands'
          ? CARRIED_VISIBLE_STATUSES.hands : CARRIED_VISIBLE_STATUSES.other
        : 'available' } }];
  });
}

export function lowerDvinaTraceCarriedItemIds(items, actorId) {
  return new Set((items ?? []).flatMap((item) => {
    if (!isLowerDvinaTraceItemHeldBy(item, actorId)) return [];
    const itemId = item?.item_id ?? item?.instance_id;
    return text(itemId) ? [itemId] : [];
  }));
}

function isLowerDvinaTraceItemHeldBy(item, actorId) {
  return typeof actorId === 'string' && actorId.length > 0
    && item?.placement?.holder_character_id === actorId;
}

export function lowerDvinaTraceCarriedItemObservations(items, visibleObjects) {
  const visible = new Map((visibleObjects ?? []).filter(({ entity_ref: ref,
    visible_status: status }) => ref?.entity_kind === 'item'
      && text(ref.entity_id)
      && carriedVisibleStatus(status))
    .map((object) => [object.entity_ref.entity_id, object]));
  return (items ?? []).flatMap((item) => {
    const itemId = item?.item_id ?? item?.instance_id;
    const visibleObject = visible.get(itemId);
    return visibleObject == null ? [] : [{ held: true,
      condition: resolvePhysicalItemCondition(item), visibleObject }];
  });
}

function carriedItemObservationChanges(sceneItems) {
  const carried = sceneItems.filter(({ held, visibleObject }) =>
    held && text(visibleObject?.display_label));
  if (carried.length === 0) {
    return ['Осмотр не дал подтверждённых сведений о состоянии вещей при вас.'];
  }
  const changes = [`При вас находятся ${russianList(carried.map(
    ({ visibleObject }) => visibleObject.display_label))}.`];
  for (const [condition, description] of [
    ['serviceable', 'пригодное к обычному использованию'],
    ['damaged', 'повреждённое']
  ]) {
    const matching = carried.filter((item) => item.condition === condition)
      .map(({ visibleObject }) => visibleObject.display_label);
    if (matching.length > 0) {
      changes.push(`Подтверждено ${description} состояние: ${russianList(matching)}.`);
    }
  }
  const unknown = carried.filter(({ condition }) => condition == null)
    .map(({ visibleObject }) => visibleObject.display_label);
  if (unknown.length > 0) {
    changes.push(`Точное состояние не подтверждено: ${russianList(unknown)}.`);
  }
  return changes;
}

export function existingItemObservationChanges(item, actorId, itemLabels = {}) {
  const resolved = resolveVisibleItemLabel(item, itemLabels);
  if (resolved.kind === 'gap') return [];
  const label = resolved.label;
  const placement = item.placement ?? {};
  const carried = placement.holder_character_id === actorId;
  const position = carried ? {
    hands: 'у вас в руках', equipped: 'надето на вас',
    worn: 'надето на вас', worn_quick: 'закреплено на вас',
    external: 'снаружи вашей ноши', external_load: 'снаружи вашей ноши'
  }[placement.physical_position] ?? 'при вас' : null;
  const condition = resolvePhysicalItemCondition(item);
  const state = { serviceable: 'пригодно к обычному использованию',
    damaged: 'повреждено' }[condition];
  return [`Вам доступен для наблюдения предмет: ${label}.`,
    ...(position == null ? [] : [`Расположение предмета «${label}»: ${position}.`]),
    ...(state == null ? [] : [`Состояние предмета «${label}»: ${state}.`]),
    ...(item.physical_facts ?? []).map(fact => `У предмета «${label}»: ${fact}`)];
}

function russianList(values) {
  return values.length < 2 ? values[0]
    : `${values.slice(0, -1).join(', ')} и ${values.at(-1)}`;
}

export function uniqueLowerDvinaTraceVisibleObjects(values) {
  const seen = new Set();
  return values.filter((value) => {
    const ref = value?.entity_ref;
    const key = `${ref?.entity_kind ?? ''}:${ref?.entity_id ?? ''}`;
    if (key === ':' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function visibleItemLabel(item) {
  const resolved = resolveVisibleItemLabel(item);
  return resolved.kind === 'labeled' ? resolved.label : null;
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}
