import { resolvePhysicalItemCondition } from '@rus/items-property';

export function lowerDvinaTraceDirectResultChanges(input, sceneItems = [],
  body = {}) {
  const plans = input?.mode_resolution?.decision_trace?.step_traces ?? [];
  const kinds = new Set(plans.filter(({ approved_plan: plan, applied }) =>
    applied === true && plan?.resolution === 'direct'
      && plan.goal_result !== 'not_achieved'
      && Array.isArray(plan.operations) && plan.operations.length === 0
      && plan.check === null).map(({ approved_plan }) =>
        approved_plan.direct_result_kind));
  return [
    ...(kinds.has('player_safe_observation')
      ? ['Наблюдение завершено по уже доступным вам признакам.'] : []),
    ...(kinds.has('player_safe_item_observation')
      ? carriedItemObservationChanges(sceneItems) : []),
    ...(kinds.has('player_safe_body_observation')
      ? bodyObservationChanges(body) : []),
    ...(kinds.has('no_state_gesture')
      ? ['Вы завершили простой жест.'] : [])
  ];
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

export function lowerDvinaTraceVisibleSceneItems(items, position, actorId) {
  return (items ?? []).flatMap((item) => {
    const placement = item?.placement ?? {};
    const coLocated = placement.location_ref === position?.location_ref
      || [position?.g5_anchor_id, position?.anchor_id]
        .includes(placement.g5_anchor_id ?? placement.anchor_id);
    const held = placement.holder_character_id === actorId;
    const itemId = item?.item_id ?? item?.instance_id;
    if ((!coLocated && !held) || !text(itemId)) return [];
    return [{ physicalFacts: item.physical_facts ?? [], held,
      condition: resolvePhysicalItemCondition(item), visibleObject: {
      entity_ref: { entity_kind: 'item', entity_id: itemId },
      display_label: visibleItemLabel(item), recognition: 'recognized',
      visible_status: held
        ? placement.physical_position === 'hands'
          ? 'у вас в руках' : 'при вас'
        : 'available' } }];
  });
}

export function lowerDvinaTraceCarriedItemObservations(items, visibleObjects) {
  const visible = new Map((visibleObjects ?? []).filter(({ entity_ref: ref,
    visible_status: status }) => ref?.entity_kind === 'item'
      && text(ref.entity_id)
      && ['при вас', 'у вас в руках'].includes(status))
    .map((object) => [object.entity_ref.entity_id, object]));
  return (items ?? []).flatMap((item) => {
    const itemId = item?.item_id ?? item?.instance_id;
    const visibleObject = visible.get(itemId);
    return visibleObject == null ? [] : [{ held: true,
      condition: resolvePhysicalItemCondition(item), visibleObject }];
  });
}

function carriedItemObservationChanges(sceneItems) {
  const carried = sceneItems.filter(({ held }) => held);
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

function visibleItemLabel(item) {
  if (text(item?.name)) return item.name;
  const slot = item?.visual_profile_snapshot?.equipment_slot
    ?? item?.placement?.equipment_slot_category_id;
  if (['base_garment', 'base'].includes(slot)) return 'нижняя одежда';
  if (['outer_garment', 'outer'].includes(slot)) return 'верхняя одежда';
  if (slot === 'headwear') return 'головной убор';
  return 'предмет снаряжения';
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}
