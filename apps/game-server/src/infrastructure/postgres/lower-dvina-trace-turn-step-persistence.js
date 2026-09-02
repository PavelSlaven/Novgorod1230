import { requireTurnStepOperationBatch, TURN_STEP_OPERATION_BATCH_TARGET } from '@rus/turn';
import {
  requireTurnStepSemanticActivityTimeline
} from './lower-dvina-trace-turn-step-activity-writes.js';
import { prepareTurnStepBodyHistory } from './lower-dvina-trace-turn-step-body-history.js';
import {
  requireActivityOwnerBinding, requireFactualCommit,
  validateBodyComponentOrder,
  validateBodyEventCommit,
  validateMechanicsProvenance
} from './lower-dvina-trace-turn-step-commit-validation.js';
import { validateNoBatchFactualCommit } from './lower-dvina-trace-turn-step-state-reconciliation.js';
import { applyItemOperation } from './lower-dvina-trace-turn-step-item-operations.js';
import { runtimeEntities } from
  './lower-dvina-trace-turn-step-item-state.js';
import { validateFragment } from
  './lower-dvina-trace-turn-step-operation-validation.js';
import { attachTurnStepCommit, emptyTurnStepPersistence, fail,
  mergeLowerDvinaTraceTurnStepWrites } from
  './lower-dvina-trace-turn-step-persistence-support.js';
import { requiresFinalTurnStepInventoryValidation,
  validateFinalTurnStepInventory } from
  './lower-dvina-trace-turn-step-final-inventory.js';
import { validateTurnStepBatchPlanBindings } from
  './lower-dvina-trace-turn-step-plan-binding.js';
import { validatePreparedEffectCommit } from './lower-dvina-trace-turn-step-prepared-effect-validation.js';
import { authoredTurnStepContainers } from
  './lower-dvina-trace-turn-step-container-persistence.js';
import { isDeepStrictEqual } from 'node:util';
import {
  buildTurnStepPersistenceWrites,
  projectTurnStepPersistenceSnapshot
} from './lower-dvina-trace-turn-step-persistence-projection.js';
export { mergeLowerDvinaTraceTurnStepWrites };
export function prepareLowerDvinaTraceTurnStepPersistence({
  partyId, writePlan, state, snapshot, factual, changeSetId, idemId,
  phase3Contracts = null, preparedFactual = factual,
  turnStepApprovedOwners = null
}) {
  const committedSnapshot = attachTurnStepCommit({ snapshot,
    envelope: writePlan?.turn_step_commit, idemId });
  const targets = (writePlan?.write_targets ?? []).filter(({ target }) =>
    target === TURN_STEP_OPERATION_BATCH_TARGET);
  if (targets.length === 0) {
    const preparedEffect = validatePreparedEffectCommit({
      batch: null,
      envelope: writePlan?.turn_step_commit,
      factual,
      state, phase3Contracts, turnStepApprovedOwners,
      localFirePlans: writePlan
        ?.local_fire_atomic_write_plans ?? []
    });
    validateNoBatchFactualCommit({ writePlan, factual, state, preparedEffect });
    return emptyTurnStepPersistence(committedSnapshot);
  }
  if (targets.length !== 1) fail('TRACE_TURN_STEP_OPERATION_BATCH_INVALID', {
    reason: 'exactly one logical operation batch is allowed'
  });
  const batch = requireBatch(targets[0].value);
  validateBatchIdentity(batch, writePlan, state);
  const commit = requireFactualCommit({ writePlan, factual, partyId, batch });
  if (!commit?.player_input?.idempotency_key
      || !commit.player_input?.request_id
      || !commit.player_input?.raw_text
      || !commit.mode_resolution?.decision_trace) {
    fail('TRACE_TURN_STEP_DIRECT_COMMIT_CONTRACT_GAP', {
      reason: 'direct-only write plan lacks replay and visible-envelope identity'
    });
  }
  const actorRef = commit.consequence?.phase7?.autonomous?.request?.npc_ref ?? state.actor_id;
  const preparedEffect = validatePreparedEffectCommit({
    batch,
    envelope: commit,
    factual: preparedFactual,
    state, phase3Contracts, turnStepApprovedOwners,
    localFirePlans: writePlan?.local_fire_atomic_write_plans ?? []
  });
  const next = structuredClone(committedSnapshot);
  const authoredItems = (next.items ?? []).filter((item) =>
    item?.template_id != null
    && item?.runtime_instance_mechanics_snapshot == null
    && item?.state?.runtime_instance_mechanics_snapshot == null);
  const authoredItemRefs = new Set(authoredItems.map((item) =>
    item.item_id ?? item.instance_id));
  const authoredContainers = authoredTurnStepContainers(next.containers);
  const authoredContainerRefs = new Set(authoredContainers.map(({ item_id }) => item_id));
  const entities = runtimeEntities(next.items ?? []);
  const context = {
    creates: new Set(), touched: new Set(), placements: new Set(),
    ownerships: new Set(),
    retired: new Set(), operationIds: new Set(), activityIds: new Set(),
    knowledgeInserts: [], activityHistory: [],
    activityOwnerBindings: new Map(), semanticDuration: 0,
    bodyHistory: null, activityResolutions: new Map(),
    authoredStateTouched: new Set()
  };
  // Every envelope and owner binding is checked before the first mutation.
  if (writePlan.turn_step_commit != null) {
    validateBatchPlanBindings({ batch, factual: commit, state, actorRef });
  }
  for (const [index, fragment] of batch.operations.entries()) {
    prevalidateFragment({ fragment, index, batch, commit, state, context });
  }
  if (!preparedEffect.prepared) {
    validateBodyComponentOrder(batch, commit, state);
  }
  const hasActivityFragments = batch.operations.some(({ target }) =>
    target === 'party_events');
  const activityTimeline = actorRef !== state.actor_id
      && preparedEffect.prepared && !hasActivityFragments
    ? { semanticDuration: 0, resolutions: new Map() }
    : requireTurnStepSemanticActivityTimeline({
        factual: commit, batch, expectedClockBefore: state.clock
      });
  context.semanticDuration = activityTimeline.semanticDuration;
  context.activityResolutions = activityTimeline.resolutions;
  for (const fragment of batch.operations) {
    if (fragment.target === 'party_events') {
      const activity = structuredClone(fragment.value);
      const binding = context.activityOwnerBindings.get(activity.activity_id);
      const resolution = context.activityResolutions.get(
        activity.activity_id);
      context.activityHistory.push({
        ...activity,
        profile_pin: structuredClone(binding.profile_pin),
        body_effect_profile_ref: binding.body_effect_profile_ref,
        fragment_order: resolution.fragment_order,
        owner_resolution: structuredClone(resolution),
        request_id: commit.player_input.request_id,
        change_set_id: changeSetId,
        idempotency_record_id: idemId,
        base_state_version: batch.committed_state_version
      });
    } else if (fragment.target !== 'party_state') {
      applyItemOperation({
        operation: fragment.value,
        entities,
        authoredItems,
        authoredItemRefs,
        authoredContainers,
        authoredContainerRefs,
        authoredStateTouched: context.authoredStateTouched,
        creates: context.creates,
        touched: context.touched,
        placements: context.placements,
        ownerships: context.ownerships,
        retired: context.retired,
        state,
        changeSetId,
        knowledgeInserts: context.knowledgeInserts,
        recordActorKnowledge: actorRef === state.actor_id,
        actorId: actorRef
      });
    }
  }
  projectTurnStepPersistenceSnapshot({
    next, authoredItems, authoredContainers, entities,
    context, batch,
    writePlan, idemId });
  context.bodyHistory = preparedEffect.prepared ? null
    : prepareTurnStepBodyHistory({
        partyId, state, factual: commit, batch, changeSetId, idemId
      });
  if (context.bodyHistory != null) {
    next.turn_step_body_history = [
      ...(next.turn_step_body_history ?? []), context.bodyHistory.snapshot
    ];
  }
  if (requiresFinalTurnStepInventoryValidation({
    state, committedSnapshot, batch
  })) {
    validateFinalTurnStepInventory(next, committedSnapshot);
  }
  const writes = buildTurnStepPersistenceWrites({
    partyId, state, next, commit, changeSetId, idemId, entities,
    authoredItems, authoredContainers, context
  });
  return {
    batch,
    snapshot: next,
    writes,
    physicalKeys: Object.values(writes).flat().map(
      (write) => `party_runtime.${write.target_table}:${write.id}`),
    semanticDuration: context.semanticDuration
  };
}

function validateBatchPlanBindings({ batch, factual, state, actorRef }) {
  if (actorRef === state.actor_id) {
    validateTurnStepBatchPlanBindings({ batch, factual, state });
    return;
  }
  const phase7 = factual.consequence?.phase7;
  const plan = phase7?.autonomous?.proposal?.plan;
  const fragments = phase7?.actor_step_owner_outputs?.write_fragments;
  if (!Array.isArray(fragments)
      || !isDeepStrictEqual(batch.operations, fragments)
      || !Number.isSafeInteger(plan?.decision_index)) {
    fail('TRACE_TURN_STEP_OPERATION_PLAN_MISMATCH', {
      reason: 'NPC owner batch is detached from the approved actor step'
    });
  }
  validateTurnStepBatchPlanBindings({ batch, state, factual: {
    loop_trace: { step_traces: [{
      applied: true,
      step_index: plan.decision_index,
      approved_plan: plan,
      check_outcome: phase7.actor_step_check?.result?.outcome?.band ?? null
    }] }
  } });
}
function requireBatch(value) {
  try {
    return requireTurnStepOperationBatch(value);
  } catch (cause) {
    fail('TRACE_TURN_STEP_OPERATION_BATCH_INVALID', {
      cause: cause?.code ?? cause?.message,
      errors: cause?.details?.errors ?? []
    });
  }
}

function validateBatchIdentity(batch, writePlan, state) {
  if (batch.root_turn_id !== writePlan.turn_id
      || batch.committed_state_version !== writePlan.base_state_version
      || batch.committed_state_version !== state.party_state.state_version) {
    fail('TRACE_TURN_STEP_OPERATION_BATCH_STALE', {
      batch_root_turn_id: batch.root_turn_id,
      plan_turn_id: writePlan.turn_id,
      batch_state_version: batch.committed_state_version,
      plan_state_version: writePlan.base_state_version,
      current_state_version: state.party_state.state_version
    });
  }
}

function prevalidateFragment({ fragment, index, batch, commit, state, context }) {
  validateFragment(fragment, batch, index);
  const identity = fragment.value.operation_id ?? fragment.value.activity_id;
  const identities = fragment.target === 'party_events'
    ? context.activityIds : context.operationIds;
  if (identities.has(identity)) fail('TRACE_TURN_STEP_OPERATION_DUPLICATE', {
    index, operation_id: identity
  });
  identities.add(identity);
  if (fragment.target === 'party_events') {
    context.activityOwnerBindings.set(identity,
      requireActivityOwnerBinding(fragment.value, commit));
  } else if (fragment.target === 'party_state') {
    validateBodyEventCommit(fragment.value, commit, state);
  } else if (fragment.value.operation_kind === 'create_entity') {
    validateMechanicsProvenance(
      fragment.value,
      fragment.value.payload.runtime_instance_mechanics_snapshot,
      fragment.value.payload.origin
    );
  }
}
