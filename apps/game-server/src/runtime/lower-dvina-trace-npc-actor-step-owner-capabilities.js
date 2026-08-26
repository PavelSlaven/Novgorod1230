/** Adapts active owner factories to one Phase 7 NPC actor-step. */
import { matchesOperationContract, npcSafeSnapshotHasEntityEvidence } from
  '@rus/npc-runtime';
import { createNpcContainerCapability } from './lower-dvina-trace-npc-actor-step-container-capability.js';
import { applyActionProducedRuntimeProjection } from './lower-dvina-trace-action-produced-runtime.js';
import { initializeRuntimeState } from './lower-dvina-trace-turn-step-item-support.js';
import { createCommittedItemMechanicsResolver } from './lower-dvina-trace-committed-inventory.js';
import { projectTracePhase7CurrentBoundaryState } from
  './lower-dvina-trace-local-fire-current-state.js';
import { npcSafeActorRefs, npcSafeModeCapabilities } from
  './lower-dvina-trace-npc-actor-step-mode-handoffs.js';
import { npcItemWorkingProjection, npcPosition, npcSafeItemRefs } from
  './lower-dvina-trace-npc-actor-step-item-context.js';
import { applicableNpcA1Refs } from
  './lower-dvina-trace-npc-a1-capability-projection.js';
import { projectLowerDvinaTraceNpcS1Capability } from
  './releases/lower-dvina-trace-s1-production.js';
export { projectTracePhase7CurrentBoundaryState } from
  './lower-dvina-trace-local-fire-current-state.js';

export function createLowerDvinaTraceNpcActorStepOwnerCapabilitiesFactory({
  createOrdinaryDiscoveryResolver = null,
  createActionProductionOwner = null, loadOrdinaryEnablement = null,
  createOrdinaryContainerContentsResolver = null,
  createSpatialSemanticResolver = null,
  createModeOwnerCapabilities = null,
  runNpcConversationExchange = null
} = {}) {
  return async ({ partyId, requestId, inputDigest, state, phase7Contracts,
    workingProjection = null, priorLocalFirePlans = [],
    conversationBindings = null, conversationActivity = null,
    parentTemporal = null,
    runNpcConversationExchange: boundaryConversationExchange =
      runNpcConversationExchange, bundle = null, npcCombatModel = null,
    revalidateStateVersion = null }) => {
    state = projectTracePhase7CurrentBoundaryState({
      state, workingProjection, priorLocalFirePlans
    });
    if (!activeNpcActorStepProfile(phase7Contracts?.npcSemanticProfile)) return [];
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
    const spatial = npcS1Capability({ state, npc,
      resolverAvailable: typeof createSpatialSemanticResolver === 'function' });
    const s1 = spatial != null ? createSpatialSemanticResolver({ partyId }) : null;
    if (typeof s1 === 'function') capabilities.push({
      operation: 'request_discovery', capability: { owner: '@rus/turn', allowed: [{
        target_refs: [spatial.safe_state.spatial_semantic.position_ref],
        discovery_kinds: ['look']
      }] },
      isApplicable: () => true,
      supports: ({ operation }) => operation.actor_ref === npcRef
        && operation.target_refs?.length === 1
        && operation.target_refs[0] === spatial.safe_state.spatial_semantic.position_ref
        && operation.discovery_kind === 'look',
      execute: (execution) => s1(spatialOwnerInput(execution,
        spatial.committed_state, npc, spatial.safe_state))
    });
    const itemRefs = npcSafeItemRefs(state, npc);
    if (typeof createActionProductionOwner === 'function' && itemRefs.length > 0) {
      const referenceInput = ({ item_ref, source_refs, tool_refs,
        identity_mode = null }) => ({
        actor_ref: npcRef, item_ref, source_refs, tool_refs,
        ...(identity_mode === null ? {} : { identity_mode }),
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
        : { source_refs: itemRefs, tool_refs: itemRefs,
          independent_output_source_groups: [itemRefs] };
      const applicableRefs = applicable;
      const actionProductionContract = {
        source_refs: [...applicableRefs.source_refs],
        tool_refs: [...applicableRefs.tool_refs],
        independent_output_source_groups: structuredClone(
          applicableRefs.independent_output_source_groups),
        ...structuredClone(owner?.actionProductionContract ?? {}),
        ...(typeof owner?.actionProductionCapability !== 'function' ? {} : {
          partial_independent_source_refs:
            applicableRefs.partial_independent_source_refs,
          partial_preserve_secondary_source_refs:
            applicableRefs.partial_preserve_secondary_source_refs }),
        ...(typeof owner?.actionProductionCapability !== 'function' ? {} : {
          removable_physical_fact_refs_by_source:
            applicableRefs.removable_physical_fact_refs_by_source })
      };
      const capability = { owner: '@rus/items-property',
        item_refs: [...applicableRefs.source_refs], use_kinds: ['other'],
        action_production: actionProductionContract };
      if (typeof projectionOwner === 'function' && typeof owner?.execute === 'function'
          && applicableRefs.source_refs.length > 0) capabilities.push({
        operation: 'request_item_use', capability,
        isApplicable: () => true,
        supports: ({ operation }) => operation?.op === 'request_item_use'
          && operation.actor_ref === npcRef
          && matchesOperationContract(operation, capability),
        preflight: (execution) => {
          const activeOwner = ownerFor(execution.request.request_id);
          if (typeof activeOwner.preflight !== 'function') {
            fail('TRACE_PHASE_7_A1_PREFLIGHT_MISSING');
          }
          return activeOwner.preflight(ownerInput(execution, state, npcRef,
            'turn_step_action_produced_remainder_request_v1'));
        },
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
      const conversationExchange = typeof boundaryConversationExchange !== 'function'
        ? null : (input) => boundaryConversationExchange({ ...input,
          conversation_bindings: conversationBindings,
          conversation_activity: conversationActivity });
      const modeCapabilities = await createModeOwnerCapabilities({ partyId, requestId,
        inputDigest, state, npc: structuredClone(npc),
        bundle: structuredClone(bundle), npcCombatModel, revalidateStateVersion,
        visibleTargetRefs: structuredClone(visibleTargetRefs),
        availableResourceRefs: structuredClone(itemRefs),
        runNpcConversationExchange: conversationExchange,
        parentTemporal: structuredClone(parentTemporal),
        conversationActivity: structuredClone(conversationActivity) });
      capabilities.push(...npcSafeModeCapabilities({ modeCapabilities, npcRef, visibleTargetRefs }));
    }
    return capabilities;
  };
}

export async function resolveNpcOwnerCapabilities(factory, fallback, input) {
  return typeof factory === 'function' ? await factory(input) : fallback;
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
function ownerInput(execution, state, npcRef, schema) {
  return {
    schema,
    ...(execution.operation == null ? {} : {
      operation: structuredClone(execution.operation) }),
    plan: structuredClone(execution.plan),
    request: structuredClone(execution.request),
    actor: structuredClone(execution.request.actor),
    working_projection: structuredClone(execution.working_projection),
    committed_state: structuredClone(state),
    prepared_chain_context: structuredClone(execution.prepared_chain_context),
    ...(execution.operations == null ? {} : {
      operations: structuredClone(execution.operations) }),
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

function npcS1Capability({ state, npc, resolverAvailable }) {
  const scope = npcLocalScope(npc);
  if (scope == null) return null;
  const position = [...new Set((state?.spatial_semantic ?? []).flatMap((entry) =>
    entry?.status === 'committed' && entry.envelope?.g6_ref === scope.entity_id
      && typeof entry.envelope.position_ref === 'string'
      ? [entry.envelope.position_ref] : []))];
  if (position.length !== 1 || !npcKnowsRef(position[0], npc, scope)) return null;
  const committed_state = { ...npcCommittedState(state, npc), position: {
    ...npcPosition(npc), position_id: position[0] } };
  const safe_state = projectLowerDvinaTraceNpcS1Capability({ npcSnapshot: npc,
    committedState: committed_state, resolverAvailable });
  return safe_state.spatial_semantic?.position_ref === position[0]
    ? { committed_state, safe_state } : null;
}

function spatialOwnerInput(execution, state, npc, safeState) {
  const input = ownerInput(execution, state, npc.instance_id,
    'turn_step_spatial_semantic_remainder_request_v1');
  return { ...input, request: { ...input.request,
    npc_safe_state: structuredClone(safeState) } };
}

function npcKnowsRef(ref, npc, scope) {
  return ref === scope.entity_id || npcSafeSnapshotHasEntityEvidence({
    entity_ref: ref, perception_snapshot: npc.perception_snapshot,
    knowledge_snapshot: npc.knowledge_snapshot });
}

function fail(code) { throw Object.assign(new Error(code), { code }); }

export function activeNpcActorStepProfile(profile) {
  return profile?.profile_id === 'lower_dvina_trace_npc_actor_step_profile_v1'
    && profile.revision === 1 && profile.status === 'approved'
    && profile.activation_boundary?.phase === 'phase_7'
    && profile.activation_boundary?.npc_participant_slot_ref
      === 'zhdanko_storehouse_controller';
}
