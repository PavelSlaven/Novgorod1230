/** Adapts active owner factories to one Phase 7 NPC actor-step. */
import { npcSafeSnapshotHasEntityEvidence } from '@rus/npc-runtime';
import { createNpcContainerCapability } from './lower-dvina-trace-n1-container-capability.js';
import { applyActionProducedRuntimeProjection } from './lower-dvina-trace-action-produced-runtime.js';
import { initializeRuntimeState } from './lower-dvina-trace-turn-step-item-support.js';
import { createCommittedItemMechanicsResolver } from './lower-dvina-trace-committed-inventory.js';
import { projectTracePhase7CurrentBoundaryState } from
  './lower-dvina-trace-local-fire-current-state.js';
import { npcSafeActorRefs, npcSafeModeCapabilities } from
  './lower-dvina-trace-n1-mode-handoffs.js';
import { npcItemWorkingProjection, npcPosition, npcSafeItemRefs } from
  './lower-dvina-trace-n1-item-context.js';
export { projectTracePhase7CurrentBoundaryState } from
  './lower-dvina-trace-local-fire-current-state.js';

export function createLowerDvinaTraceN1OwnerCapabilitiesFactory({
  createOrdinaryDiscoveryResolver = null,
  createActionProductionOwner = null, loadOrdinaryEnablement = null,
  createOrdinaryContainerContentsResolver = null,
  createModeOwnerCapabilities = null
} = {}) {
  return async ({ partyId, requestId, inputDigest, state, phase7Contracts,
    workingProjection = null, priorLocalFirePlans = [] }) => {
    state = projectTracePhase7CurrentBoundaryState({
      state, workingProjection, priorLocalFirePlans
    });
    if (!activeN1Profile(phase7Contracts?.npcSemanticProfile)) return [];
    const npcRef = phase7Contracts?.zhdanko?.instance_id;
    const npc = (state?.npcs ?? []).find(({ instance_id }) => instance_id === npcRef);
    if (typeof npcRef !== 'string' || npc == null) return [];
    const capabilities = [];
    const discoveryTargets = await enabledNpcDiscoveryTargets({ partyId, npc,
      loadOrdinaryEnablement });
    const ordinary = typeof createOrdinaryDiscoveryResolver === 'function'
      && discoveryTargets.length > 0
      ? createOrdinaryDiscoveryResolver({ partyId, inputDigest }) : null;
    if (typeof ordinary === 'function') {
      capabilities.push({
        operation: 'request_discovery',
        capability: { owner: '@rus/turn', allowed: [
          ...(typeof ordinary !== 'function' ? [] : discoveryTargets.map(
            (target_ref) => ({ target_refs: [target_ref],
              discovery_kinds: ['inspect', 'search'] }))),
        ] },
        isApplicable: () => true,
        supports: ({ operation }) => operation.actor_ref === npcRef
          && operation.target_refs?.length === 1
          && (typeof ordinary === 'function'
            && ['inspect', 'search'].includes(operation.discovery_kind)
            && discoveryTargets.includes(operation.target_refs[0])),
        execute: (execution) => typeof ordinary === 'function'
          && ['inspect', 'search'].includes(execution.operation.discovery_kind)
          && discoveryTargets.includes(execution.operation.target_refs[0])
          ? ordinary(ordinaryOwnerInput(execution, state, npc,
            'turn_step_ordinary_discovery_request_v1'))
          : null
      });
    }
    const itemRefs = npcSafeItemRefs(state, npc);
    if (typeof createActionProductionOwner === 'function' && itemRefs.length > 0
        && genericContextStrength(phase7Contracts?.genericCheckContext) != null) {
      const referenceInput = ({ item_ref, source_refs, tool_refs }) => ({
        actor_ref: npcRef, item_ref, source_refs, tool_refs,
        root_turn_id: `turn:${partyId}:${Number(state.party_state?.turn_number) + 1}`,
        step_index: 1,
        committed_state_version: Number(state.party_state?.state_version)
      });
      const projectionOwner = createNpcA1ProjectionOwner({ state, npc, itemRefs });
      const ownerFor = (ownerRequestId) => createActionProductionOwner({ partyId,
        requestId: ownerRequestId, inputDigest, applyWorkingProjection: projectionOwner });
      const owner = ownerFor(requestId);
      const applicable = typeof owner?.referencesApplicable === 'function'
        ? await applicableNpcA1Refs(owner, itemRefs, referenceInput)
        : { source_refs: itemRefs, tool_refs: itemRefs };
      const applicableRefs = applicable;
      if (typeof projectionOwner === 'function' && typeof owner?.execute === 'function'
          && applicableRefs.source_refs.length > 0) capabilities.push({
        operation: 'request_item_use', capability: { owner: '@rus/items-property',
          item_refs: [...applicableRefs.source_refs], use_kinds: ['other'],
          action_production: { source_refs: [...applicableRefs.source_refs],
            tool_refs: [...applicableRefs.tool_refs] } },
        isApplicable: () => true,
        supports: ({ operation }) => npcA1OperationSupported(
          operation, npcRef, applicableRefs),
        execute: (execution) => ownerFor(execution.request.request_id).execute(
          ownerInput(execution, state, npcRef, execution.check_result == null
            ? 'turn_step_action_produced_remainder_request_v1'
            : 'turn_step_action_produced_remainder_request_v2'))
      });
    }
    const containerCapability = createNpcContainerCapability({ state, npc, partyId,
      inputDigest, createOrdinaryContainerContentsResolver });
    if (containerCapability != null) capabilities.push(containerCapability);
    if (typeof createModeOwnerCapabilities === 'function') {
      const visibleTargetRefs = npcSafeActorRefs(npc, state);
      const modeCapabilities = await createModeOwnerCapabilities({ partyId, requestId,
        inputDigest, state, npc: structuredClone(npc),
        visibleTargetRefs: structuredClone(visibleTargetRefs),
        availableResourceRefs: structuredClone(itemRefs) });
      capabilities.push(...npcSafeModeCapabilities({ modeCapabilities, npcRef, visibleTargetRefs }));
    }
    return capabilities;
  };
}

export async function resolveNpcOwnerCapabilities(factory, fallback, input) {
  return typeof factory === 'function' ? await factory(input) : fallback;
}

async function applicableNpcA1Refs(owner, refs, input) {
  const source_refs = [];
  for (const ref of refs) {
    if (await owner.referencesApplicable(input({ item_ref: ref,
      source_refs: [ref], tool_refs: [] }))) source_refs.push(ref);
  }
  const tool_refs = [];
  for (const ref of refs) {
    const source = source_refs.find((candidate) => candidate !== ref);
    if (source != null && await owner.referencesApplicable(input({
      item_ref: source, source_refs: [source], tool_refs: [ref] }))) {
      tool_refs.push(ref);
    }
  }
  return { source_refs, tool_refs };
}

function npcA1OperationSupported(operation, npcRef, refs) {
  const action = operation?.action_production;
  const sources = action?.source_refs;
  const tools = action?.tool_refs;
  return operation?.actor_ref === npcRef && operation.use_kind === 'other'
    && Array.isArray(sources) && sources.length > 0
    && Array.isArray(tools) && sources[0] === operation.item_ref
    && new Set(sources).size === sources.length
    && new Set(tools).size === tools.length
    && !sources.some((ref) => tools.includes(ref))
    && sources.every((ref) => refs.source_refs.includes(ref))
    && tools.every((ref) => refs.tool_refs.includes(ref))
    && sameRefSet(operation.target_refs, [...sources.slice(1), ...tools]);
}

function sameRefSet(left, right) {
  return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && new Set(left).size === left.length
    && left.every((ref) => right.includes(ref));
}

function createNpcA1ProjectionOwner({ state, npc, itemRefs }) {
  let runtimeState = null;
  return ({ working_projection, actor, action_production_atomic_write_plan: plan }) => {
    runtimeState ??= initializeRuntimeState(state);
    const projection = npcItemWorkingProjection({ workingProjection:
      working_projection, state, npc, itemRefs, runtimeState });
    return applyActionProducedRuntimeProjection({ workingProjection: projection,
      actor, plan, state: runtimeState,
      resolveItemMechanics: createCommittedItemMechanicsResolver(state) });
  };
}


function genericContextStrength(context) {
  const value = context?.attributes?.find(({ attribute_ref }) =>
    attribute_ref === 'strength')?.value;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function ownerInput(execution, state, npcRef, schema) {
  return {
    schema,
    operation: structuredClone(execution.operation),
    plan: structuredClone(execution.plan),
    request: structuredClone(execution.request),
    actor: structuredClone(execution.request.actor),
    working_projection: structuredClone(execution.working_projection),
    committed_state: structuredClone(state),
    prepared_chain_context: structuredClone(execution.prepared_chain_context),
    ...(execution.check_result == null ? {} : {
      check_result: structuredClone(execution.check_result) }),
    ...(execution.prepared_ordinary_materialization_atomic_write_plan == null ? {} : {
      prepared_ordinary_materialization_atomic_write_plan: structuredClone(
        execution.prepared_ordinary_materialization_atomic_write_plan) }),
    ...(execution.prepared_action_production_atomic_write_plans == null ? {} : {
      prepared_action_production_atomic_write_plans: structuredClone(
        execution.prepared_action_production_atomic_write_plans) })
  };
}

function ordinaryOwnerInput(execution, state, npc, schema) {
  return { ...ownerInput(execution, state, npc.instance_id, schema),
    committed_state: npcCommittedState(state, npc) };
}

async function enabledNpcDiscoveryTargets({ partyId, npc, loadOrdinaryEnablement }) {
  const scope = npcLocalScope(npc);
  if (scope == null || typeof loadOrdinaryEnablement !== 'function') return [];
  const enabled = await loadOrdinaryEnablement({ partyId, scopeRef: scope });
  const execution = enabled?.execution_context;
  const candidates = [execution?.candidate_context?.target_ref,
    ...(execution?.context_bound_capabilities ?? []).map(({ source_ref }) => source_ref)];
  return [...new Set(candidates.filter((ref) => npcKnowsRef(ref, npc, scope)))];
}

function npcLocalScope(npc) {
  const position = npcPosition(npc);
  const id = position?.g6_id ?? position?.g6_ref;
  return typeof id === 'string' && id.length > 0
    ? { entity_kind: 'g6', entity_id: id } : null;
}

function npcCommittedState(state, npc) {
  const position = npcPosition(npc);
  return { ...structuredClone(state), ...(position == null ? {} : { position }) };
}

function npcKnowsRef(ref, npc, scope) {
  return ref === scope.entity_id || npcSafeSnapshotHasEntityEvidence({
    entity_ref: ref, perception_snapshot: npc.perception_snapshot,
    knowledge_snapshot: npc.knowledge_snapshot });
}

export function activeN1Profile(profile) {
  return profile?.profile_id === 'lower_dvina_trace_n1_npc_semantic_profile_v1'
    && profile.revision === 1 && profile.status === 'approved'
    && profile.activation_boundary?.phase === 'phase_7'
    && profile.activation_boundary?.npc_participant_slot_ref
      === 'zhdanko_storehouse_controller';
}
