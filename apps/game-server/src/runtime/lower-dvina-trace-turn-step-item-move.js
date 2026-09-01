import {
  admitAuthoredItemPlacementTransition,
  authoredItemPlacementSourceProof
} from '@rus/items-property';
import {
  applied,
  collectCurrentRefs,
  directFragment,
  fail,
  nextOperationIdentity,
  requireProjection,
  requireRef,
  visibleConsequence
} from './lower-dvina-trace-turn-step-runtime-common.js';
import {
  actualRef,
  applyInventoryTransition,
  currentCommittedItemState,
  matchesItem,
  normalizePlacement,
  persistedPlacement,
  requireProjectedItem
} from './lower-dvina-trace-turn-step-item-support.js';
import {
  applyCommittedActorItemMove,
  planCommittedActorItemMove
} from './lower-dvina-trace-actor-item-transition.js';
import { resolveOrdinaryContents } from
  './lower-dvina-trace-turn-step-container-ordinary.js';
import { hydratePreparedOrdinaryRuntime } from
  './lower-dvina-trace-action-produced-runtime.js';

export async function moveEntity(execution, state, options) {
  const { operation } = execution;
  let projection = execution.working_projection;
  requireProjection(projection);
  const refs = collectCurrentRefs(execution);
  requireRef(operation.entity_ref, refs, 'entity_ref');
  requireRef(operation.placement.target_ref, refs, 'placement.target_ref');
  const current = requireProjectedItem(projection, operation.entity_ref);
  hydratePreparedOrdinaryRuntime(
    execution.prepared_ordinary_materialization_atomic_write_plan,
    operation.entity_ref, state);
  const runtime = state.entities.get(actualRef(operation.entity_ref, state));
  const authoredItem = state.authoredItems.get(operation.entity_ref);
  let authoredContainer = state.authoredContainers.get(
    operation.entity_ref);
  let authored = authoredItem ?? authoredContainer;
  const instanceKind = authoredContainer ? 'container' : 'item';
  let ordinaryPlan = null;
  if (authoredContainer) {
    const ordinary = await resolveOrdinaryContents({canonical:authoredContainer,
      revealContents:false,state,options,execution,projection});
    ordinaryPlan=ordinary?.plan ?? null;
    projection=ordinary?.working_projection ?? projection;
    authoredContainer=state.authoredContainers.get(operation.entity_ref);
    authored=authoredContainer;
  }
  let owned = runtime;
  if (!owned && authored) {
    const mechanics = typeof options.resolveItemMechanics === 'function'
      ? options.resolveItemMechanics(operation.entity_ref) : null;
    if (!mechanics) {
      fail('TRACE_TURN_STEP_AUTHORED_MECHANICS_DATA_GAP', {
        entity_ref: operation.entity_ref
      });
    }
    owned = {
      instance_id: operation.entity_ref,
      mechanics,
      authored: true
    };
  }
  if (!owned) {
    fail('TRACE_TURN_STEP_RUNTIME_ENTITY_REQUIRED', {
      entity_ref: operation.entity_ref
    });
  }
  let placement = normalizePlacement({
    placement: operation.placement,
    projection,
    state,
    entityRef: operation.entity_ref,
    incomingMechanics: owned.mechanics,
    resolveItemMechanics: options.resolveItemMechanics
  });
  if (owned.authored && placement.physical_position === 'worn') {
    const equipmentSlot = authored.state?.visual_profile_snapshot
      ?.equipment_slot;
    if (equipmentSlot) placement = {
      ...placement,
      physical_position: 'equipped',
      equipment_slot_category_id: equipmentSlot
    };
  }
  const actorTransition = owned.authored
    && actorPlacement(authored.placement)
    && actorPlacement(placement);
  let transitionedItem = null;
  if (actorTransition) {
    const committed = currentCommittedItemState(state);
    const planned = planCommittedActorItemMove({
      state: committed,
      item_id: operation.entity_ref,
      destination_placement: placement
    });
    if (!planned.pass) {
      fail(planned.errors[0]?.code
        ?? 'APPROVED_ACTOR_ITEM_TRANSITION_REJECTED',
      planned.errors[0]?.details ?? {});
    }
    transitionedItem = applyCommittedActorItemMove(
      authored, planned.proposal);
    placement = structuredClone(transitionedItem.placement);
  } else if (owned.authored) {
    const admission = admitAuthoredItemPlacementTransition({
      item: authored,
      placement
    });
    if (!admission.pass) {
      fail(admission.errors[0]?.code
        ?? 'ITEM_AUTHORED_PLACEMENT_TRANSITION_INVALID',
      admission.errors[0]?.details ?? {});
    }
  }
  let next = structuredClone(projection);
  next.items = next.items.map((item) => matchesItem(item, operation.entity_ref)
    ? { ...item, placement }
    : item);
  next = applyInventoryTransition({
    projection: next,
    actor: execution.request.actor,
    beforePlacement: current.placement,
    afterPlacement: placement,
    beforeMechanics: owned.mechanics,
    afterMechanics: owned.mechanics,
    itemRef: operation.entity_ref,
    state
  });
  if (owned.authored) {
    const nextAuthored = transitionedItem ?? {
      ...authored, placement: structuredClone(placement)
    };
    (instanceKind === 'container'
      ? state.authoredContainers : state.authoredItems)
      .set(operation.entity_ref, nextAuthored);
    state.materializedItems.set(operation.entity_ref, nextAuthored);
  }
  const identity = nextOperationIdentity(execution, state);
  return applied({
    projection: next,
    summary: `moved:${operation.entity_ref}`,
    fragment: directFragment(identity, instanceKind === 'container'
      ? 'party_containers' : 'party_items', {
      entity_ref: owned.instance_id,
      placement: persistedPlacement(placement, state),
      ...(owned.authored ? {
        authored_source: authoredItemPlacementSourceProof(authored),
        ...(actorTransition ? {
          actor_transition: {
            schema: 'rus.approved_actor_item_transition.v1', version: 1
          }
        } : {})
      } : {})
    }),
    consequence: visibleConsequence(identity, {
      change: 'moved', entity_ref: owned.instance_id,
      relation: operation.placement.relation,
      display_label: current.name ?? current.display_label ?? null
    }),ordinaryPlan
  });
}

function actorPlacement(value) {
  return Boolean(value?.holder_character_id ?? value?.holder_npc_id)
    && ['hands', 'worn', 'worn_quick', 'equipped', 'external',
      'external_load'].includes(value?.physical_position);
}
