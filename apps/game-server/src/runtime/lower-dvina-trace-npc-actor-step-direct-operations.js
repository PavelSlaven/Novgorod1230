import { createItemOperationHandlers, initializeRuntimeState } from
  './lower-dvina-trace-turn-step-item-operations.js';
import { applyRuntimeInventoryTransition, normalizeRuntimeItemPlacement } from
  '@rus/items-property';
import { createCommittedItemMechanicsResolver } from
  './lower-dvina-trace-committed-inventory.js';
import { projectTracePhase7CurrentBoundaryState } from
  './lower-dvina-trace-local-fire-current-state.js';
import { activeNpcActorStepProfile } from './lower-dvina-trace-npc-actor-step-owner-capabilities.js';
import { npcItemWorkingProjection, npcPosition, npcSafeItemRefs,
  npcSafeOpenContainerRefs } from
  './lower-dvina-trace-npc-actor-step-item-context.js';
import { applyBodyEvent } from
  './lower-dvina-trace-turn-step-delegated-ports.js';

export function createLowerDvinaTraceNpcActorStepDirectOperations({ state,
  phase7Contracts, workingProjection = null, priorLocalFirePlans = [],
  ordinaryResultPolicy = null, packingCalculator = null,
  bodyEventOwner = null, createAmbientOrdinaryPortionAdmission = null } = {}) {
  state = projectTracePhase7CurrentBoundaryState({ state, workingProjection,
    priorLocalFirePlans });
  if (!activeNpcActorStepProfile(phase7Contracts?.npcSemanticProfile)) return empty();
  const npcRef = phase7Contracts?.zhdanko?.instance_id;
  const npc = (state?.npcs ?? []).find(({ instance_id: id }) => id === npcRef);
  if (npc == null) return empty();
  const itemRefs = npcSafeItemRefs(state, npc);
  const insideRefs = npcSafeOpenContainerRefs(state, npc);
  const bodyApplicable = hasNpcBody(npc) &&
    typeof bodyEventOwner?.resolve === 'function';
  const runtimeState = initializeRuntimeState(state);
  const position = npcPosition(npc);
  const locationRef = position?.location_ref ?? null;
  const ambientOrdinaryPortionAdmission = typeof createAmbientOrdinaryPortionAdmission
    === 'function' && position != null ? createAmbientOrdinaryPortionAdmission({ committedState: {
      ...structuredClone(state), actor_id: npcRef,
      position: structuredClone(position)
    } }) : null;
  const placements = directPlacements(npcRef, locationRef, insideRefs, itemRefs);
  const placementTargetRefs = [...new Set(placements.map(({ target_ref }) => target_ref)
    .filter((ref) => ref !== npcRef && ref !== locationRef))];
  const createAllowed = ambientOrdinaryPortionAdmission == null || locationRef == null
    ? [] : [{ origin_kind: 'ambient_ordinary', source_refs: [locationRef],
      placement: placements[0] }];
  const actorStrength = npcStrength(phase7Contracts.npcSemanticProfile);
  const resolveItemMechanics = createCommittedItemMechanicsResolver(state, {
    packingCalculator, actorId: npcRef, actorStrength,
    normalizeNpcHolder: true
  });
  const moveAllowed = itemRefs.length === 0 ? [] : feasibleMoves({ itemRefs, placements,
    projection: npcItemWorkingProjection({ workingProjection, state, npc,
      itemRefs, placementTargetRefs, runtimeState }), actorId: npcRef,
    strength: actorStrength, locationRef, runtimeState, resolveItemMechanics });
  const all = createItemOperationHandlers(runtimeState, {
    ordinaryResultPolicy,
    ambientOrdinaryPortionAdmission,
    requireAmbientOrdinaryAdmission: ambientOrdinaryPortionAdmission != null,
    resolveItemMechanics
  });
  const operationContract = {
    ...(bodyApplicable ? { apply_body_event: {
      owner: '@rus/body-state', actor_refs: [npcRef],
      mechanisms: ['impact', 'cut', 'puncture', 'burn', 'strain', 'crush',
        'fall', 'cold', 'heat', 'suffocation', 'poison', 'other'],
      severities: ['minor', 'moderate', 'severe', 'critical'] } } : {}),
    ...(createAllowed.length > 0
      ? { create_entity: { owner: '@rus/items-property',
        allowed: createAllowed } } : {}),
    ...(moveAllowed.length > 0 ? { move_entity: {
      owner: '@rus/items-property', allowed: moveAllowed } } : {}),
  };
  const handlers = Object.fromEntries(Object.keys(operationContract).map(
    (operation) => [operation, (execution) => operation === 'apply_body_event'
      ? applyBodyEvent({ ...execution, working_projection: {
        ...structuredClone(execution.working_projection), actor_id: npcRef
      } }, runtimeState, bodyEventOwner)
      : all[operation]({ ...execution,
        working_projection: npcItemWorkingProjection({
          workingProjection: execution.working_projection, state, npc,
          itemRefs, placementTargetRefs, runtimeState
        }) })]));
  return Object.freeze({ handlers: Object.freeze(handlers),
    operationContract: Object.freeze(operationContract) });
}

function feasibleMoves({ itemRefs, placements, projection, actorId, strength,
  locationRef, runtimeState, resolveItemMechanics }) {
  return placements.map((placement) => ({ placement, entity_refs: itemRefs.filter(
    (entityRef) => feasibleMove({ entityRef, placement, projection, actorId,
      strength, locationRef, runtimeState, resolveItemMechanics }))
  })).filter(({ entity_refs }) => entity_refs.length > 0);
}

function feasibleMove({ entityRef, placement, projection, actorId, strength,
  locationRef, runtimeState, resolveItemMechanics }) {
  if (!Number.isSafeInteger(strength) || strength < 0) return false;
  const item = (projection.items ?? []).find((candidate) =>
    (candidate.item_id ?? candidate.instance_id) === entityRef);
  const availableItems = runtimeOverlay(projection, runtimeState);
  const mechanicsFor = (ref) => runtimeState.entities.get(ref)?.mechanics
    ?? resolveItemMechanics(ref, { runtimeItems: availableItems });
  const mechanics = runtimeState.entities.get(entityRef)?.mechanics
    ?? mechanicsFor(entityRef);
  if (item == null || mechanics == null) return false;
  const normalized = normalizeRuntimeItemPlacement({ placement, actor_id: actorId,
    current_location_ref: locationRef, entity_ref: entityRef,
    visible_items: projection.items, incoming_mechanics: mechanics,
    resolve_mechanics: mechanicsFor });
  if (!normalized.pass) return false;
  const runtimeItems = (projection.items ?? []).map((candidate) => {
    const ref = candidate.item_id ?? candidate.instance_id;
    return { item_ref: ref, placement: candidate.placement,
      mechanics: mechanicsFor(ref) };
  });
  return applyRuntimeInventoryTransition({ inventory: projection.inventory,
    actor_id: actorId, strength, item_ref: entityRef,
    before_placement: item.placement, after_placement: normalized.placement,
    before_mechanics: mechanics, after_mechanics: mechanics,
    runtime_items: runtimeItems }).pass;
}

function runtimeOverlay(projection, runtimeState) {
  const containerRefs = new Set(runtimeState.committedState?.containers?.map(
    ({ container_id: id, item_id: itemId, instance_id: instanceId }) =>
      id ?? itemId ?? instanceId));
  return (projection.items ?? []).flatMap((candidate) => {
    const ref = candidate.item_id ?? candidate.instance_id;
    const item = runtimeState.materializedItems.get(ref);
    return item == null || containerRefs.has(ref)
      ? [] : [{ ...item, placement: candidate.placement }];
  });
}

function npcStrength(profile) {
  return profile?.actor_mechanics_context?.attributes?.find(
    ({ attribute_ref: ref }) => ref === 'strength')?.value;
}

function directPlacements(npcRef, locationRef, insideRefs, itemRefs) {
  return [
    { relation: 'held_by', target_ref: npcRef },
    { relation: 'worn_by', target_ref: npcRef },
    ...(locationRef == null ? [] : [{ relation: 'located_at', target_ref: locationRef }]),
    ...insideRefs.map((target_ref) => ({ relation: 'inside', target_ref })),
    ...itemRefs.map((target_ref) => ({ relation: 'attached_to', target_ref }))
  ];
}

function hasNpcBody(npc) {
  const body = npc?.check_body_state;
  return ['health', 'satiety', 'energy'].every((key) =>
    Number.isFinite(body?.[key])) && Array.isArray(body?.active_conditions);
}

function empty() {
  return Object.freeze({ handlers: Object.freeze({}),
    operationContract: Object.freeze({}) });
}
