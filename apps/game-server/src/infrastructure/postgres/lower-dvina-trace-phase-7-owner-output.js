import { applyOrdinaryMaterializationProjection, ordinaryPlanFromRaw } from
  './lower-dvina-trace-ordinary-p16.js';
import { createActionProducedAtomicWritePlan } from './action-produced-atomic-write-plan.js';
import { applyActionProductionProjection } from './lower-dvina-trace-action-production-projection.js';
import { applyLocalFireProjection, createLocalFireAtomicWritePlan } from './local-fire-atomic-write-plan.js';
import { createSpatialSemanticAtomicWritePlan } from './spatial-semantic-atomic-write-plan.js';
import { requireTurnStepOperationBatch, TURN_STEP_OPERATION_BATCH_TARGET } from '@rus/turn';
import { actionProducedTraceActionRef } from
  './action-produced-causal-binding.js';
import { prepareLowerDvinaTraceTurnStepPersistence } from
  './lower-dvina-trace-turn-step-persistence.js';
import { requireTurnStepOwnerCarrierBinding } from
  './lower-dvina-trace-turn-step-plan-binding.js';

export function phase7OwnerOutputPlans({ ownerOutputs, partyId, changeSetId,
  npcRef, temporalPlans, rootTurnId, committedStateVersion,
  semanticOperation = null, semanticOperations = null, semanticPlan = null, semanticRequest = null,
  registeredOwner = null, carrierPlan = semanticPlan, fail }) {
  const keys = ['write_fragments', 'consequence_fragment',
    'ordinary_materialization_atomic_write_plan',
    'action_production_atomic_write_plans', 'local_fire_atomic_write_plans',
    'spatial_semantic_atomic_write_plan'];
  const plain = (value) => value != null && typeof value === 'object'
    && !Array.isArray(value);
  if (!plain(ownerOutputs) || Object.keys(ownerOutputs).length !== keys.length
      || !keys.every((key) => Object.hasOwn(ownerOutputs, key))
      || !Array.isArray(ownerOutputs.write_fragments)
      || !(ownerOutputs.consequence_fragment === null
        || plain(ownerOutputs.consequence_fragment))
      || !(ownerOutputs.ordinary_materialization_atomic_write_plan === null
        || plain(ownerOutputs.ordinary_materialization_atomic_write_plan))
      || !Array.isArray(ownerOutputs.action_production_atomic_write_plans)
      || !Array.isArray(ownerOutputs.local_fire_atomic_write_plans)
      || !(ownerOutputs.spatial_semantic_atomic_write_plan === null
        || plain(ownerOutputs.spatial_semantic_atomic_write_plan))) {
    return fail('TRACE_PHASE_7_ACTOR_STEP_OWNER_OUTPUTS_INVALID');
  }
  try {
    const operations = semanticOperations ?? (semanticOperation == null
      ? [] : [semanticOperation]);
    requireSelectedOwnerOutput(ownerOutputs, operations, {
      semanticPlan: carrierPlan, semanticRequest, registeredOwner
    });
    const operationBatch = ownerOutputs.write_fragments.length === 0 ? null
      : requireTurnStepOperationBatch({ version: 1,
          schema: 'party_turn_step_operation_batch_v1',
          root_turn_id: rootTurnId,
          committed_state_version: committedStateVersion,
          operations: ownerOutputs.write_fragments });
    const ordinaryPlan = ordinaryPlanFromRaw(
      ownerOutputs.ordinary_materialization_atomic_write_plan, partyId);
    const actionProductionPlans = ownerOutputs.action_production_atomic_write_plans
      .map(createActionProducedAtomicWritePlan);
    const localFirePlans = [...ownerOutputs.local_fire_atomic_write_plans, ...temporalPlans]
      .map(createLocalFireAtomicWritePlan);
    const spatialSemanticPlan = ownerOutputs.spatial_semantic_atomic_write_plan == null
      ? null : createSpatialSemanticAtomicWritePlan(
        ownerOutputs.spatial_semantic_atomic_write_plan);
    if (actionProductionPlans.some((plan) => plan.party_id !== partyId
        || plan.change_set_id !== changeSetId || plan.actor_ref !== npcRef)
      || localFirePlans.some((plan) => plan.party_id !== partyId
        || plan.change_set_id !== changeSetId)
      || spatialSemanticPlan != null && (spatialSemanticPlan.party_id !== partyId
        || spatialSemanticPlan.change_set_id !== changeSetId)) throw new Error();
    requireOwnerCarrierBindings({ ordinaryPlan, actionProductionPlans,
      localFirePlans: localFirePlans.slice(0,
        ownerOutputs.local_fire_atomic_write_plans.length), spatialSemanticPlan,
      semanticOperations: operations, semanticPlan, carrierPlan, semanticRequest, registeredOwner });
    return { operationBatch, ordinaryPlan, actionProductionPlans,
      localFirePlans, spatialSemanticPlan };
  } catch { return fail('TRACE_PHASE_7_OWNER_OUTPUT_PLAN_INVALID'); }
}

function requireSelectedOwnerOutput(outputs, operations, binding) {
  const directKinds = outputs.write_fragments.map(
    (fragment) => fragment?.value?.operation_kind);
  const consequenceKinds = outputs.consequence_fragment?.state_changes
    ?.map((change) => change?.operation_kind
      ?? (change?.kind === 'direct_body_event'
        ? 'apply_body_event' : null)) ?? [];
  const positionTransition =
    outputs.consequence_fragment?.position_transition != null;
  const ordinary = outputs.ordinary_materialization_atomic_write_plan != null;
  const actionProduction = outputs.action_production_atomic_write_plans.length > 0;
  const localFire = outputs.local_fire_atomic_write_plans.length > 0;
  const spatialSemantic = outputs.spatial_semantic_atomic_write_plan != null;
  const operationFor = (kind) => operations.filter(({ op }) => op === kind);
  const primary = operations.filter(({ op }) => !DIRECT.has(op));
  const op = primary[0]?.op ?? null;
  const primaryOperation = primary[0] ?? null;
  if (!Array.isArray(operations) || operations.some(({ op: kind }) =>
      typeof kind !== 'string') || primary.length > 1
      || [...directKinds, ...consequenceKinds].some((kind) =>
        operationFor(kind).length === 0)
      || outputs.consequence_fragment != null
        && (positionTransition
          ? op !== 'request_movement' || consequenceKinds.length > 0
          : consequenceKinds.length === 0)
      || ordinary && !['request_discovery',
        'request_container_access'].includes(op)
      || actionProduction && (op !== 'request_item_use'
        || primaryOperation.action_production == null)
      || localFire && op !== 'request_world_process'
      || spatialSemantic && op !== 'request_discovery'
      || [ordinary, actionProduction, localFire, spatialSemantic]
        .filter(Boolean).length > 1) {
    throw new Error();
  }
  for (const fragment of outputs.write_fragments) {
    requireTurnStepOwnerCarrierBinding({ ...binding, semanticOperations: operations,
      carrier: fragment?.value });
  }
  for (const change of outputs.consequence_fragment?.state_changes ?? []) {
    if (change?.kind === 'direct_body_event') continue;
    requireTurnStepOwnerCarrierBinding({ ...binding, semanticOperations: operations,
      carrier: change });
  }
}

function requireOwnerCarrierBindings({ ordinaryPlan, actionProductionPlans,
  localFirePlans, spatialSemanticPlan, semanticOperations, semanticPlan,
  carrierPlan = semanticPlan, semanticRequest, registeredOwner }) {
  if (semanticRequest == null) return;
  const binding = { semanticOperations, semanticPlan: carrierPlan, semanticRequest,
    registeredOwner };
  if (ordinaryPlan != null) {
    if (ordinaryPlan.schema === 'ordinary_materialization_atomic_write_plan_v1') {
      requireO1CarrierBinding({ ...binding, ordinaryPlan });
    } else {
    const provenance = ordinaryPlan.items?.[0]?.runtime_mechanics_snapshot
      ?.provenance;
    requireTurnStepOwnerCarrierBinding({ ...binding, carrier: {
      container_ref: ordinaryPlan.scope_ref.entity_id,
      access_kind: ordinaryPlan.container_transition?.access_kind,
      root_turn_id: provenance?.root_turn_id, step_index: provenance?.step_index
    }, carrierOperation: operationFor('request_container_access',
      semanticOperations) });
    }
  }
  for (const plan of actionProductionPlans) {
    requireTurnStepOwnerCarrierBinding({ ...binding, actionRef:
      actionProducedTraceActionRef({ rootTurnId: semanticRequest?.root_turn_id,
        stepIndex: semanticRequest?.decision_index, approvedPlan: semanticPlan }),
    carrierOperation: { ...operationFor('request_item_use', semanticOperations),
      ...operationFor('request_item_use', semanticOperations).action_production },
    carrier: { actor_ref: plan.actor_ref,
      source_refs: plan.source_pins.map(({ item_id }) => item_id),
      tool_refs: plan.tool_pins.map(({ item_id }) => item_id),
      causal_identity: plan.transition_proposal.causal_identity } });
  }
  for (const plan of localFirePlans) {
    const proposal = plan.transition_proposal;
    requireTurnStepOwnerCarrierBinding({ ...binding, carrier: {
      actor_ref: plan.actor_ref,
      source_refs: plan.input_pins.map(({ item_id }) => item_id),
      process_ref: operationFor('request_world_process', semanticOperations).process_action === 'affect'
        ? proposal.process_after.process_ref : null,
      cause: proposal.cause
    }, carrierOperation: operationFor('request_world_process',
      semanticOperations) });
  }
  if (spatialSemanticPlan != null) {
    requireTurnStepOwnerCarrierBinding({ ...binding,
      actionRef: `s1:${semanticRequest?.root_turn_id}:${semanticRequest?.decision_index}`,
      carrier: { actor_ref: spatialSemanticPlan.causal_identity.actor_ref,
        target_refs: [spatialSemanticPlan.resolution.position_ref],
        causal_identity: spatialSemanticPlan.causal_identity },
      carrierOperation: operationFor('request_discovery', semanticOperations) });
  }
}

const DIRECT = new Set(['create_entity', 'move_entity', 'change_entity_facts',
  'set_entity_mechanics', 'retire_entity', 'apply_body_event']);
function operationFor(op, operations) {
  const matches = operations.filter((operation) => operation.op === op);
  if (matches.length !== 1) throw new Error();
  return matches[0];
}

function requireO1CarrierBinding({ ordinaryPlan, semanticRequest, ...binding }) {
  const requestIdentity = ordinaryPlan.request_identity;
  const rootTurnId = semanticRequest?.root_turn_id;
  if (!['seed', 'presence'].some((phase) => requestIdentity ===
      `${rootTurnId}:ordinary:${phase}`)
      || ordinaryPlan.item != null
        && ordinaryPlan.item.mechanics_snapshot.provenance.request_id
          !== requestIdentity) throw new Error();
  requireTurnStepOwnerCarrierBinding({ ...binding, semanticRequest, carrier: {
    target_refs: [ordinaryPlan.scope_ref.entity_id]
  }, carrierOperation: operationFor('request_discovery',
    binding.semanticOperations) });
}

export function applyPhase7OwnerOutputProjection({ next, visibleContext, plans }) {
  for (const plan of plans.actionProductionPlans) applyActionProductionProjection({ next, plan });
  for (const plan of plans.localFirePlans) applyLocalFireProjection({ next, plan });
  applyOrdinaryMaterializationProjection({ next, visibleContext, ordinaryPlan: plans.ordinaryPlan });
}

export function preparePhase7OwnerOperationPersistence({ partyId, writePlan,
  state, snapshot, factual, changeSetId, idemId, operationBatch }) {
  const persistenceWritePlan = operationBatch == null ? writePlan : {
    ...writePlan, turn_id: operationBatch.root_turn_id,
    write_targets: [...writePlan.write_targets, {
      target: TURN_STEP_OPERATION_BATCH_TARGET, value: operationBatch
    }]
  };
  return prepareLowerDvinaTraceTurnStepPersistence({
    partyId,
    writePlan: persistenceWritePlan,
    state,
    snapshot,
    factual: operationBatch == null
      ? factual : neutralPhase7OwnerFactual(factual, state),
    changeSetId,
    idemId
  });
}

function neutralPhase7OwnerFactual(factual, state) {
  const event = factual.consequence.phase7.actor_step_owner_outputs
    ?.write_fragments?.find(({ value }) =>
      value?.operation_kind === 'apply_body_event')?.value;
  const direct = event?.payload;
  const change = factual.consequence.phase7.actor_step_owner_outputs
    ?.consequence_fragment?.state_changes
    ?.find(({ kind }) => kind === 'direct_body_event');
  if (direct != null && change != null) return {
    ...structuredClone(factual),
    consequence: { ...structuredClone(factual.consequence),
      body_effect_ref: direct.body_effect_ref === null ? null
        : 'trace_ld_v1_turn_step_generic_body_effect_v1',
      state_changes: [structuredClone(change)] },
    time_update: neutralOwnerTimeUpdate(factual),
    hidden_update: { npc_body_event:
      structuredClone(direct.payload) },
    body_update: { version: 1, schema: 'turn_body_update',
      owner: '@rus/body-state', applied: true, state_after:
        structuredClone(direct.payload.state_after), proposal: {
          schema: 'rus.body_state.composite_fixed_effect_proposal.v1',
          profile_ref: 'trace_ld_v1_turn_step_generic_body_effect_v1',
          profile_pin: structuredClone(direct.payload.profile_pin),
          component_proposals: [{
            schema: 'rus.body_state.fixed_approved_effect_proposal.v1',
            profile_ref: direct.body_effect_ref,
            profile_pin: structuredClone(direct.payload.profile_pin),
            selected_context: structuredClone(direct.payload.selected_context),
            exact_deltas: structuredClone(direct.payload.exact_deltas),
            condition_transitions: [],
            selection_policy: direct.payload.selection_policy,
            rng_consumption: direct.payload.rng_consumption,
            state_after: structuredClone(direct.payload.state_after)
          }], exact_deltas: structuredClone(direct.payload.exact_deltas),
          selection_policy: 'ordered_committed_step_components',
          rng_consumption: 'forbidden' } }
  };
  return {
    ...structuredClone(factual),
    consequence: { ...structuredClone(factual.consequence),
      body_effect_ref: null, state_changes: [] },
    time_update: neutralOwnerTimeUpdate(factual),
    body_update: { version: 1, schema: 'turn_body_update',
      owner: '@rus/body-state', applied: false, proposal: null,
      state_after: structuredClone(state.body_state) }
  };
}

function neutralOwnerTimeUpdate(factual) {
  return { ...structuredClone(factual.time_update),
    semantic_activity_elapsed: { exact_minutes: {
      numerator: '0', denominator: '1' } },
    semantic_activity_resolutions: [] };
}
