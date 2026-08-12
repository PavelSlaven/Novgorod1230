import {
  admitOrdinaryRuntimeFact,
  admitOrdinaryRuntimeResult,
  applyRuntimeInventoryTransition,
  normalizeRuntimeItemPlacement,
  resolveInventoryMechanicsProfile,
  runtimeItemIsTerminal
} from '@rus/items-property';
import {
  fail,
  plain,
  requireRefs,
  text
} from './lower-dvina-trace-turn-step-runtime-common.js';

export function initializeRuntimeState(committedState) {
  const state = {
    aliases: new Map(),
    reservedRefs: new Set(),
    entities: new Map(),
    factOwners: new Map(),
    consumableSources: new Set(),
    retiredEntities: new Set(),
    operationOrdinals: new Map(),
    activityOrdinals: new Map(),
    materializedItems: new Map(),
    authoredItems: new Map()
  };
  if (committedState == null) return state;
  if (!plain(committedState)) {
    fail('TRACE_TURN_STEP_COMMITTED_RUNTIME_STATE_INVALID');
  }
  for (const item of committedState.items ?? []) {
    const itemId = text(item?.item_id ?? item?.instance_id);
    if (itemId && !runtimeItemIsTerminal(item)) {
      state.materializedItems.set(itemId, structuredClone(item));
      if (item.template_id != null) {
        state.authoredItems.set(itemId, structuredClone(item));
      }
    }
    if (!plain(item) || item.template_id != null
        || runtimeItemIsTerminal(item)) continue;
    if (!itemId) fail('TRACE_TURN_STEP_COMMITTED_RUNTIME_ENTITY_INVALID');
    const resolved = resolveInventoryMechanicsProfile({
      instance: item,
      profiles: {}
    });
    if (!resolved.pass || resolved.source !== 'runtime_instance_snapshot') {
      fail('TRACE_TURN_STEP_COMMITTED_RUNTIME_MECHANICS_INVALID', {
        entity_ref: itemId,
        error_code: resolved.errors[0]?.code ?? null
      });
    }
    state.entities.set(itemId, {
      instance_id: itemId,
      mechanics: resolved.snapshot.mechanics,
      snapshot: resolved.snapshot,
      semantic_type: text(item.category_id
        ?? item.state?.ordinary_metadata?.semantic_type) || null,
      name: text(item.name ?? item.state?.ordinary_metadata?.name) || null,
      origin_kind: resolved.snapshot.provenance.origin_kind,
      source_refs: [...resolved.snapshot.provenance.source_refs]
    });
  }
  for (const container of committedState.containers ?? []) {
    const containerId = text(container?.container_id ?? container?.instance_id);
    if (!containerId) {
      fail('TRACE_TURN_STEP_COMMITTED_CONTAINER_INVALID');
    }
    state.materializedItems.set(containerId, {
      ...structuredClone(container), item_id: containerId,
      instance_id: containerId,
      placement: { holder_character_id: container.holder_character_id
        ?? container.state?.holder_character_id ?? null,
      holder_npc_id: container.holder_npc_id
        ?? container.state?.holder_npc_id ?? null,
      anchor_id: container.anchor_id ?? container.state?.anchor_id ?? null,
      location_ref: container.location_ref
        ?? container.state?.location_ref ?? null,
      zone_ref: container.zone_ref ?? container.state?.zone_ref ?? null }
    });
  }
  for (const entity of state.entities.values()) {
    entity.source_refs.filter((ref) => state.entities.has(ref))
      .forEach((ref) => state.consumableSources.add(ref));
  }
  for (const fact of committedState.knowledge ?? []) {
    const ref = factRef(fact);
    const entityRef = text(fact?.entity_ref);
    if (!ref || !entityRef || !state.entities.has(entityRef)) continue;
    state.factOwners.set(ref, entityRef);
  }
  for (const item of committedState.items ?? []) {
    const entityRef = text(item?.item_id ?? item?.instance_id);
    if (!state.entities.has(entityRef)) continue;
    const semanticFacts = [
      ...(item.semantic_facts ?? []),
      ...(item.state?.ordinary_metadata?.semantic_facts ?? [])
    ];
    for (const fact of semanticFacts) {
      const ref = factRef(fact);
      if (ref) state.factOwners.set(ref, entityRef);
    }
  }
  return state;
}

export function admitOrdinaryEntity(operation, policy) {
  const result = admitOrdinaryRuntimeResult({ operation, policy });
  if (!result.pass) failAdmission(result);
  return result.admission;
}

export function admitOrdinaryText(value, entity, policy) {
  const result = admitOrdinaryRuntimeFact({
    semantic_type: entity?.semantic_type,
    name: entity?.name,
    text: value,
    policy
  });
  if (!result.pass) failAdmission(result);
}

export function requireOrigin(origin, projection, state, refs) {
  if (origin.kind === 'ambient_ordinary') {
    const current = projection.position?.location_ref;
    if (!current || origin.source_refs.some((ref) => ref !== current)) {
      fail('TRACE_TURN_STEP_AMBIENT_SOURCE_INVALID');
    }
    return;
  }
  if (origin.source_refs.some((ref) =>
    !state.entities.has(actualRef(ref, state)))) {
    fail('TRACE_TURN_STEP_ORDINARY_SOURCE_UNRESOLVED');
  }
  requireRefs(origin.source_refs, refs, 'origin.source_refs');
}

export function normalizePlacement({ placement, projection, state, entityRef,
  incomingMechanics, resolveItemMechanics }) {
  const result = normalizeRuntimeItemPlacement({
    placement,
    actor_id: projection.actor_id,
    current_location_ref: projection.position?.location_ref,
    entity_ref: entityRef,
    visible_items: projection.items,
    incoming_mechanics: incomingMechanics,
    resolve_mechanics: (ref) => {
      const runtime = state?.entities.get(actualRef(ref, state));
      return runtime?.mechanics ?? (typeof resolveItemMechanics === 'function'
        ? resolveItemMechanics(actualRef(ref, state), {
            runtimeItems: runtimeItemOverlay(projection, state),
            retiredItemRefs: [...state.retiredEntities]
          })
        : null);
    }
  });
  if (!result.pass) failIssue(result.errors[0]);
  return result.placement;
}

export function applyInventoryTransition({ projection, actor,
  beforePlacement, afterPlacement, beforeMechanics, afterMechanics,
  itemRef, state }) {
  const runtimeItems = (projection.items ?? []).map((item) => {
    const ref = text(item.item_id ?? item.instance_id);
    const actual = actualRef(ref, state);
    return {
      item_ref: ref,
      placement: structuredClone(item.placement ?? {}),
      mechanics: state.entities.get(actual)?.mechanics ?? null
    };
  });
  if (!runtimeItems.some(({ item_ref: ref }) => ref === itemRef)) {
    runtimeItems.push({
      item_ref: itemRef,
      placement: structuredClone(beforePlacement ?? {}),
      mechanics: beforeMechanics ?? afterMechanics
    });
  }
  const result = applyRuntimeInventoryTransition({
    inventory: projection.inventory,
    actor_id: projection.actor_id,
    strength: actor?.attributes?.strength?.value,
    item_ref: itemRef,
    before_placement: beforePlacement,
    after_placement: afterPlacement,
    before_mechanics: beforeMechanics,
    after_mechanics: afterMechanics,
    runtime_items: runtimeItems
  });
  if (!result.pass) failIssue(result.errors[0]);
  return { ...projection, inventory: result.inventory };
}

export function persistedPlacement(placement, state) {
  const output = structuredClone(placement);
  for (const key of ['holder_character_id', 'location_ref', 'container_id',
    'attached_item_id']) {
    if (output[key]) output[key] = actualRef(output[key], state);
  }
  return output;
}

export function requireProjectedItem(projection, ref) {
  const item = (projection.items ?? []).find((candidate) =>
    matchesItem(candidate, ref));
  if (!item) fail('TRACE_TURN_STEP_ENTITY_NOT_MUTABLE', { entity_ref: ref });
  return item;
}

export function requireRuntimeEntity(ref, state) {
  const record = state.entities.get(actualRef(ref, state));
  if (!record) {
    fail('TRACE_TURN_STEP_RUNTIME_ENTITY_REQUIRED', { entity_ref: ref });
  }
  return record;
}

export function matchesItem(item, ref) {
  return item?.item_id === ref || item?.instance_id === ref;
}

export function actualRef(ref, state) {
  return state.aliases.get(ref) ?? ref;
}

export function requireAvailableTempRef(ref, refs, state, rootTurnId) {
  if (state.reservedRefs.has(reservedKey(rootTurnId, ref))) {
    fail('TRACE_TURN_STEP_TEMP_REF_RETIRED_OR_RESERVED', { temp_ref: ref });
  }
  if (refs.has(ref)) {
    fail('TRACE_TURN_STEP_REF_ALREADY_EXISTS', { ref });
  }
}

export function reserveTempRef(ref, state, rootTurnId) {
  state.reservedRefs.add(reservedKey(rootTurnId, ref));
}

export function factRef(record) {
  return typeof record === 'string'
    ? record
    : record?.fact_id ?? record?.knowledge_id ?? record?.id;
}

function failAdmission(result) {
  failIssue(result.errors[0]);
}

function failIssue(issue) {
  fail(issue?.code ?? 'ITEM_RUNTIME_DATA_GAP', issue?.details ?? {});
}

function reservedKey(rootTurnId, ref) {
  const root = text(rootTurnId);
  const temp = text(ref);
  if (!root || !temp) fail('TRACE_TURN_STEP_TEMP_REF_SCOPE_INVALID');
  return `${root}\u0000${temp}`;
}

function runtimeItemOverlay(projection, state) {
  return (projection.items ?? []).flatMap((item) => {
    const visibleRef = text(item?.item_id ?? item?.instance_id);
    const itemId = actualRef(visibleRef, state);
    const runtime = state.entities.get(itemId);
    if (!visibleRef || !runtime?.snapshot) return [];
    return [{
      item_id: itemId,
      instance_id: itemId,
      template_id: null,
      runtime_instance_mechanics_snapshot: structuredClone(runtime.snapshot),
      placement: persistedPlacement(item.placement ?? {}, state),
      state: { lifecycle_status: 'active' }
    }];
  });
}
