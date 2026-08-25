import { createItemOperationHandlers, initializeRuntimeState } from
  './lower-dvina-trace-turn-step-item-operations.js';
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
  const runtimeRefs = itemRefs.filter((ref) => runtimeState.entities.has(ref));
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
  const all = createItemOperationHandlers(runtimeState, {
    ordinaryResultPolicy,
    ambientOrdinaryPortionAdmission,
    requireAmbientOrdinaryAdmission: ambientOrdinaryPortionAdmission != null,
    resolveItemMechanics: createCommittedItemMechanicsResolver(state, {
      packingCalculator, actorId: npcRef, actorStrength: null,
      normalizeNpcHolder: true
    })
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
    ...(itemRefs.length > 0 && placements.length > 0 ? { move_entity: {
      owner: '@rus/items-property', allowed: placements.map((placement) =>
        ({ entity_refs: ['inside', 'attached_to'].includes(placement.relation)
          ? itemRefs.filter((ref) => ref !== placement.target_ref) : itemRefs,
        placement })).filter(({ entity_refs }) => entity_refs.length > 0) } } : {}),
    ...(runtimeRefs.length > 0 ? { change_entity_facts: {
      owner: '@rus/items-property', allowed: runtimeRefs.map((entity_ref) =>
        ({ entity_ref })) } } : {}),
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
