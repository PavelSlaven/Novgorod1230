import { requireTurnStepOperationBatch, TURN_STEP_OPERATION_BATCH_TARGET } from '@rus/turn';
import { row } from './first-playable/plan-shared.js';
import {
  appendTurnStepSemanticActivityWrites,
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
import { itemRecord, mergeKnowledge, physicalPlacement, runtimeEntities } from
  './lower-dvina-trace-turn-step-item-state.js';
import { validateFragment } from
  './lower-dvina-trace-turn-step-operation-validation.js';
import { attachTurnStepCommit, emptyTurnStepPersistence, fail,
  mergeLowerDvinaTraceTurnStepWrites } from
  './lower-dvina-trace-turn-step-persistence-support.js';
import { appendAuthoredTurnStepWrites } from './lower-dvina-trace-turn-step-authored-writes.js';
import { requiresFinalTurnStepInventoryValidation,
  validateFinalTurnStepInventory } from
  './lower-dvina-trace-turn-step-final-inventory.js';
import { validateTurnStepBatchPlanBindings } from
  './lower-dvina-trace-turn-step-plan-binding.js';
import { validatePreparedEffectCommit } from './lower-dvina-trace-turn-step-prepared-effect-validation.js';
import { authoredTurnStepContainers, projectPersistedTurnStepContainers } from
  './lower-dvina-trace-turn-step-container-persistence.js';
export { mergeLowerDvinaTraceTurnStepWrites };
export function prepareLowerDvinaTraceTurnStepPersistence({
  partyId, writePlan, state, snapshot, factual, changeSetId, idemId,
  phase3Contracts = null,
  turnStepApprovedOwners = null
}) {
  const committedSnapshot = attachTurnStepCommit({ snapshot,
    envelope: writePlan?.turn_step_commit, idemId });
  const targets = (writePlan?.write_targets ?? []).filter(
    ({ target }) => target === TURN_STEP_OPERATION_BATCH_TARGET);
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
  const preparedEffect = validatePreparedEffectCommit({
    batch,
    envelope: commit,
    factual,
    state, phase3Contracts, turnStepApprovedOwners,
    localFirePlans: writePlan
      ?.local_fire_atomic_write_plans ?? []
  });
  const next = structuredClone(committedSnapshot);
  const authoredItems = (next.items ?? []).filter((item) =>
    item?.template_id != null
    && item?.runtime_instance_mechanics_snapshot == null
    && item?.state?.runtime_instance_mechanics_snapshot == null);
  const authoredItemRefs = new Set(authoredItems.map((item) =>
    item.item_id ?? item.instance_id));
  const authoredContainers = authoredTurnStepContainers(next.containers);
  const authoredContainerRefs = new Set(authoredContainers.map((container) =>
    container.item_id));
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
    validateTurnStepBatchPlanBindings({ batch, factual: commit, state });
  }
  for (const [index, fragment] of batch.operations.entries()) {
    prevalidateFragment({ fragment, index, batch, commit, state, context });
  }
  if (!preparedEffect.prepared) {
    validateBodyComponentOrder(batch, commit, state);
  }
  const activityTimeline = requireTurnStepSemanticActivityTimeline({
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
        knowledgeInserts: context.knowledgeInserts
      });
    }
  }
  projectSnapshot({ next, authoredItems, authoredContainers, entities,
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
  const writes = buildWrites({
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

function projectSnapshot({
  next, authoredItems, authoredContainers, entities, context, batch,
  writePlan, idemId
}) {
  next.items = [
    ...authoredItems.map((item) => structuredClone(item)),
    ...entities.values()
      .filter((entity) => !entity.created_in_batch
        || entity.lifecycle_status === 'active')
      .map(({ db_state: _dbState, lifecycle_status: _status,
        created_in_batch: _created, ...item }) => structuredClone(item))
  ].sort((left, right) => left.item_id.localeCompare(right.item_id));
  projectPersistedTurnStepContainers(next, authoredContainers);
  next.knowledge = mergeKnowledge(next.knowledge, context.knowledgeInserts);
  next.turn_step_activity_history = [
    ...(next.turn_step_activity_history ?? []), ...context.activityHistory
  ];
  next.last_turn = {
    ...next.last_turn,
    turn_step_operation_batch: structuredClone(batch),
    turn_step_idempotency_record_id: idemId,
    decision_trace: structuredClone(writePlan.command_trace),
    semantic_activity_duration_minutes: context.semanticDuration
  };
}

function buildWrites({
  partyId, state, next, commit, changeSetId, idemId, entities, authoredItems,
  authoredContainers, context
}) {
  const writes = { inserts: [], updates: [], appends: [], deletes: [] };
  if (context.bodyHistory != null) {
    writes.appends.push(context.bodyHistory.write);
  }
  appendTurnStepSemanticActivityWrites({
    writes,
    activities: context.activityHistory,
    partyId, state, snapshot: next, factual: commit, changeSetId, idemId
  });
  for (const entity of entities.values()) {
    if (!context.touched.has(entity.item_id)
        || (entity.created_in_batch
          && entity.lifecycle_status === 'retired')) continue;
    const mode = context.creates.has(entity.item_id) ? 'inserts' : 'updates';
    writes[mode].push(row(
      'party_items', entity.item_id, itemRecord(partyId, entity)));
    if (context.placements.has(entity.item_id)) {
      writes[mode].push(row('party_item_placements', entity.item_id, {
        party_id: partyId,
        item_id: entity.item_id,
        ...physicalPlacement(entity.placement)
      }));
    }
  }
  appendAuthoredTurnStepWrites({
    writes, authoredItems, authoredContainers,
    authoredStateTouched: context.authoredStateTouched,
    placements: context.placements,
    ownerships: context.ownerships,
    partyId, changeSetId
  });
  for (const knowledge of context.knowledgeInserts) {
    writes.inserts.push(row('party_character_knowledge',
      `${state.actor_id}:${knowledge.fact_id}`, {
        party_id: partyId,
        character_id: state.actor_id,
        fact_id: knowledge.fact_id,
        knowledge_state: knowledge.knowledge_state,
        evidence: knowledge.evidence_refs
      }));
  }
  return writes;
}
