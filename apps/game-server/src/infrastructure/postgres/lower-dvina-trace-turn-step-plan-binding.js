import { canonicalDigest } from '@rus/materialization';
import {
  planRuntimeContainerAccess,
  runtimeItemContentsAreOpen,
  runtimeItemRecordIsConcealed
} from '@rus/items-property';
import { fail, text } from
  './lower-dvina-trace-turn-step-persistence-support.js';

const DIRECT = new Set([
  'create_entity', 'move_entity', 'change_entity_facts',
  'set_entity_mechanics', 'retire_entity', 'apply_body_event'
]);

/** Every physical fragment must be authorized by the exact applied step. */
export function validateTurnStepBatchPlanBindings({ batch, factual, state }) {
  const slots = expectedSlots(factual?.loop_trace?.step_traces ?? []);
  const aliases = new Map();
  const materializedItems = [
    ...structuredClone(state.items ?? []),
    ...(state.containers ?? []).map((container) => ({
      ...structuredClone(container), item_id: container.container_id,
      placement: {
        anchor_id: container.anchor_id ?? null,
        container_id: container.parent_container_id ?? null,
        holder_npc_id: container.holder_npc_id ?? null,
        holder_character_id: container.holder_character_id ?? null,
        physical_position: container.physical_position ?? null,
        equipment_slot_category_id:
          container.equipment_slot_category_id ?? null
      }
    }))
  ];
  let cursor = 0;
  for (const fragment of batch.operations) {
    const candidate = fragment.target === 'party_events'
      ? { type: 'activity', step: fragment.value.step_index }
      : { type: 'operation', step: fragment.value.step_index,
          kind: fragment.value.operation_kind };
    const slot = slots[cursor];
    if (!slot || slot.type !== candidate.type || slot.step !== candidate.step
        || (slot.type === 'operation' && slot.operation.op !== candidate.kind)
        || !slotMatches(slot, fragment.value, aliases, {
          ...state, items: materializedItems
        })) {
      mismatch(fragment.value, 'fragment is not authorized in this order');
    }
    cursor += 1;
    bindAliases(slot, fragment.value, aliases);
    applyBindingState(slot, fragment.value, materializedItems);
  }
  if (cursor !== slots.length) {
    const slot = slots[cursor];
    mismatch({
      step_index: slot.step,
      operation_kind: slot.type === 'operation'
        ? slot.operation.op : 'semantic_activity'
    }, 'approved physical fragment is missing');
  }
}

function expectedSlots(traces) {
  return traces.flatMap((trace) => {
    if (trace?.applied !== true) return [];
    const plan = trace.approved_plan;
    const selected = plan?.resolution === 'generic_check'
      ? plan.check?.outcomes?.[trace.check_outcome] : null;
    const operations = selected?.operations ?? plan?.operations ?? [];
    const direct = operations.filter(({ op }) => DIRECT.has(op));
    const domain = operations.filter(({ op }) => !DIRECT.has(op)
      && op === 'request_container_access');
    const activities = plan?.resolution === 'domain_request' ? [] : [
      plan?.activity,
      ...(selected?.additional_activity == null
        ? [] : [selected.additional_activity])
    ].filter(Boolean);
    return [
      ...direct.map((operation) => ({ type: 'operation',
        step: trace.step_index, operation })),
      ...domain.map((operation) => ({ type: 'operation',
        step: trace.step_index, operation,
        checkOutcome: trace.check_outcome })),
      ...activities.map((activity) => ({ type: 'activity',
        step: trace.step_index, activity }))
    ];
  });
}

function slotMatches(slot, value, aliases, state) {
  if (slot.type === 'activity') {
    return value.duration_class === slot.activity.duration_class
      && value.effort === slot.activity.effort;
  }
  const expected = slot.operation;
  const payload = value.payload;
  if (expected.op === 'create_entity') {
    return payload.temp_ref === expected.temp_ref
      && payload.semantic_type === expected.semantic_type
      && payload.name === expected.name
      && payload.origin?.kind === expected.origin.kind
      && same(payload.origin?.source_refs,
        expected.origin.source_refs.map((ref) => resolve(ref, aliases)))
      && same(payload.facts?.map(({ temp_ref, text: factText }) => ({
        temp_ref, text: factText
      })), expected.facts)
      && same(payload.runtime_instance_mechanics_snapshot?.mechanics,
        expected.mechanics)
      && placementMatches(payload.placement, expected.placement,
        aliases, state);
  }
  if (expected.op === 'move_entity') {
    return payload.entity_ref === resolve(expected.entity_ref, aliases)
      && placementMatches(payload.placement, expected.placement,
        aliases, state);
  }
  if (expected.op === 'change_entity_facts') {
    return payload.entity_ref === resolve(expected.entity_ref, aliases)
      && same(payload.remove_fact_refs,
        expected.remove_fact_refs.map((ref) => resolve(ref, aliases)))
      && same(payload.add_facts?.map(({ temp_ref, text: factText }) => ({
        temp_ref, text: factText
      })), expected.add_facts);
  }
  if (expected.op === 'set_entity_mechanics') {
    return payload.entity_ref === resolve(expected.entity_ref, aliases)
      && payload.reason === expected.reason
      && same(payload.runtime_instance_mechanics_snapshot?.mechanics,
        expected.mechanics);
  }
  if (expected.op === 'retire_entity') {
    return payload.entity_ref === resolve(expected.entity_ref, aliases)
      && payload.reason === expected.reason;
  }
  if (expected.op === 'apply_body_event') {
    return payload.actor_ref === resolve(expected.actor_ref, aliases)
      && same(payload.payload?.selected_context, {
        kind: 'direct_body_event', mechanism: expected.mechanism,
        severity: expected.severity, body_part_ref: expected.body_part_ref
      });
  }
  return expected.op === 'request_container_access'
    && containerAccessMatches(slot, payload, expected, aliases, state);
}

function containerAccessMatches(slot, payload, expected, aliases, state) {
  const containerRef = resolve(expected.container_ref, aliases);
  const container = state.items.find((item) => itemRef(item) === containerRef);
  const plan = planRuntimeContainerAccess({
    container,
    access_kind: expected.access_kind,
    check_result: slot.checkOutcome == null ? null : {
      outcome: { band: slot.checkOutcome }
    }
  });
  if (expected.actor_ref !== state.actor_id
      || payload.container_ref !== containerRef
      || payload.access_kind !== expected.access_kind
      || plan.pass !== true
      || !same(payload.state_patch, plan.state_patch)) return false;
  const alreadyVisible = runtimeItemContentsAreOpen(container);
  const revealedRefs = !plan.reveal_contents || alreadyVisible ? []
    : state.items.filter((item) =>
      placement(item)?.container_id === containerRef
        && !runtimeItemRecordIsConcealed(item, { includeAccess: false }))
      .map(itemRef)
      .filter(Boolean);
  return same(payload.revealed_refs, revealedRefs);
}

function placementMatches(actual, expected, aliases, state) {
  if (!actual || !expected) return false;
  const target = resolve(expected.target_ref, aliases);
  if (Object.hasOwn(actual, 'relation')) {
    return actual.relation === expected.relation
      && actual.target_ref === target;
  }
  if (expected.relation === 'held_by') {
    return actual.holder_character_id === target
      && actual.physical_position === 'hands';
  }
  if (expected.relation === 'worn_by') {
    return actual.holder_character_id === target
      && ['worn', 'equipped'].includes(actual.physical_position);
  }
  if (expected.relation === 'inside') return actual.container_id === target;
  if (expected.relation === 'attached_to') {
    return actual.attached_item_id === target;
  }
  return expected.relation === 'located_at'
    && (actual.location_ref === target || actual.anchor_id === target
      || target === state.position?.location_ref
        && actual.anchor_id === state.position?.g5_anchor_id);
}

function bindAliases(slot, value, aliases) {
  if (slot.type !== 'operation' || slot.operation.op !== 'create_entity') {
    return;
  }
  aliases.set(slot.operation.temp_ref, value.payload.entity_ref);
  for (const fact of value.payload.facts ?? []) {
    aliases.set(fact.temp_ref, fact.fact_id);
  }
}

function applyBindingState(slot, value, items) {
  if (slot.type !== 'operation') return;
  const payload = value.payload;
  if (slot.operation.op === 'create_entity') {
    items.push({ item_id: payload.entity_ref,
      placement: structuredClone(payload.placement) });
    return;
  }
  const ref = payload.entity_ref ?? payload.container_ref;
  const item = items.find((candidate) => itemRef(candidate) === ref);
  if (!item) return;
  if (slot.operation.op === 'move_entity') {
    item.placement = structuredClone(payload.placement);
  } else if (slot.operation.op === 'request_container_access'
      && payload.state_patch != null) {
    Object.assign(item, structuredClone(payload.state_patch));
    if (item.state != null) Object.assign(item.state,
      structuredClone(payload.state_patch));
  }
}

function placement(item) {
  return item?.placement != null ? item.placement : item;
}

function itemRef(item) {
  return item?.item_id ?? item?.instance_id ?? item?.container_id ?? null;
}

function resolve(ref, aliases) {
  return aliases.get(ref) ?? ref;
}

function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}

function mismatch(value, reason) {
  fail('TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH', {
    reason, operation_id: text(value?.operation_id)
      ? value.operation_id : null,
    activity_id: text(value?.activity_id) ? value.activity_id : null,
    step_index: value?.step_index ?? null,
    operation_kind: value?.operation_kind ?? 'semantic_activity'
  });
}
