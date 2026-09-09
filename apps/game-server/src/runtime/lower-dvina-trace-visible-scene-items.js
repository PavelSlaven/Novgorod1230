export function lowerDvinaTraceDirectResultChanges(input) {
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
    ...(kinds.has('no_state_gesture')
      ? ['Вы завершили простой жест.'] : [])
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
    return [{ physicalFacts: item.physical_facts ?? [], visibleObject: {
      entity_ref: { entity_kind: 'item', entity_id: itemId },
      display_label: visibleItemLabel(item), recognition: 'recognized',
      visible_status: held
        ? placement.physical_position === 'hands'
          ? 'у вас в руках' : 'при вас'
        : 'available' } }];
  });
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
