import { createItemOperationHandlers, initializeRuntimeState } from
  './lower-dvina-trace-turn-step-item-operations.js';
import { createCommittedItemMechanicsResolver } from
  './lower-dvina-trace-committed-inventory.js';
import { projectTracePhase7CurrentBoundaryState } from
  './lower-dvina-trace-local-fire-current-state.js';
import { activeN1Profile } from './lower-dvina-trace-n1-owner-capabilities.js';
import { npcItemWorkingProjection, npcPosition, npcSafeItemRefs } from
  './lower-dvina-trace-n1-item-context.js';
import { applyBodyEvent } from
  './lower-dvina-trace-turn-step-delegated-ports.js';

export function createLowerDvinaTraceN1DirectOperations({ state,
  phase7Contracts, workingProjection = null, priorLocalFirePlans = [],
  ordinaryResultPolicy = null, packingCalculator = null,
  bodyEventOwner = null, createAmbientOrdinaryPortionAdmission = null } = {}) {
  state = projectTracePhase7CurrentBoundaryState({ state, workingProjection,
    priorLocalFirePlans });
  if (!activeN1Profile(phase7Contracts?.npcSemanticProfile)) return empty();
  const npcRef = phase7Contracts?.zhdanko?.instance_id;
  const npc = (state?.npcs ?? []).find(({ instance_id: id }) => id === npcRef);
  if (npc == null) return empty();
  const itemRefs = npcSafeItemRefs(state, npc);
  const bodyApplicable = hasNpcBody(npc) &&
    typeof bodyEventOwner?.resolve === 'function';
  const runtimeState = initializeRuntimeState(state);
  const runtimeRefs = itemRefs.filter((ref) => runtimeState.entities.has(ref));
  const eligibleMechanicsRefs = runtimeRefs.filter((ref) =>
    ['direct_partition', 'crafted'].includes(
      runtimeState.entities.get(ref)?.origin_kind));
  const retireRefs = runtimeRefs.filter((ref) =>
    runtimeState.consumableSources.has(ref));
  const position = npcPosition(npc);
  const locationRef = position?.location_ref ?? null;
  const ambientOrdinaryPortionAdmission = typeof createAmbientOrdinaryPortionAdmission
    === 'function' && position != null ? createAmbientOrdinaryPortionAdmission({ committedState: {
      ...structuredClone(state), actor_id: npcRef,
      position: structuredClone(position)
    } }) : null;
  const createRefs = [...runtimeRefs, ...(ambientOrdinaryPortionAdmission != null
    && locationRef != null ? [locationRef] : [])];
  const targets = [npcRef, ...(locationRef == null ? [] : [locationRef])];
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
    ...(createRefs.length > 0 && targets.length > 0
      && ordinaryResultPolicy != null ? { create_entity: {
        owner: '@rus/items-property', source_refs: createRefs,
        target_refs: targets } } : {}),
    ...(itemRefs.length > 0 && targets.length > 0 ? { move_entity: {
      owner: '@rus/items-property', entity_refs: itemRefs,
      target_refs: targets } } : {}),
    ...(runtimeRefs.length > 0 ? { change_entity_facts: {
      owner: '@rus/items-property', entity_refs: runtimeRefs } } : {}),
    ...(eligibleMechanicsRefs.length > 0 ? { set_entity_mechanics: {
      owner: '@rus/items-property', entity_refs: eligibleMechanicsRefs } } : {}),
    ...(retireRefs.length > 0 ? { retire_entity: {
      owner: '@rus/items-property', entity_refs: retireRefs } } : {})
  };
  const handlers = Object.fromEntries(Object.keys(operationContract).map(
    (operation) => [operation, (execution) => operation === 'apply_body_event'
      ? applyBodyEvent({ ...execution, working_projection: {
        ...structuredClone(execution.working_projection), actor_id: npcRef
      } }, runtimeState, bodyEventOwner)
      : all[operation]({ ...execution,
        working_projection: npcItemWorkingProjection({
          workingProjection: execution.working_projection, state, npc,
          itemRefs, runtimeState
        }) })]));
  return Object.freeze({ handlers: Object.freeze(handlers),
    operationContract: Object.freeze(operationContract) });
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
