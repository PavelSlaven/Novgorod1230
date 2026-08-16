import {
  createRuntimeInstanceMechanicsSnapshot
} from '@rus/items-property';
import {
  applied,
  collectCurrentRefs,
  deterministicRef,
  directFragment,
  fail,
  nextOperationIdentity,
  requireProjection,
  requireRef,
  visibleConsequence
} from './lower-dvina-trace-turn-step-runtime-common.js';
import {
  actualRef,
  admitOrdinaryText,
  applyInventoryTransition,
  factRef,
  matchesItem,
  requireAvailableTempRef,
  requireProjectedItem,
  requireRuntimeEntity,
  reserveTempRef
} from './lower-dvina-trace-turn-step-item-support.js';
import { moveEntity } from './lower-dvina-trace-turn-step-item-move.js';

export function createMutationOperationHandlers(state, options = {}) {
  return Object.freeze({
    move_entity: (execution) => moveEntity(execution, state, options),
    change_entity_facts: (execution) =>
      changeEntityFacts(execution, state, options),
    set_entity_mechanics: (execution) => setEntityMechanics(execution, state),
    retire_entity: (execution) => retireEntity(execution, state)
  });
}

function changeEntityFacts(execution, state, options) {
  const { operation, working_projection: projection } = execution;
  const rootTurnId = execution.request.root_turn_id;
  requireProjection(projection);
  const refs = collectCurrentRefs(execution);
  requireRef(operation.entity_ref, refs, 'entity_ref');
  const owned = requireRuntimeEntity(operation.entity_ref, state);
  requireProjectedItem(projection, operation.entity_ref);
  for (const ref of operation.remove_fact_refs) {
    requireRef(ref, refs, 'remove_fact_refs');
    if (state.factOwners.get(ref) !== owned.instance_id) {
      fail('TRACE_TURN_STEP_FACT_OWNER_UNRESOLVED', { fact_ref: ref });
    }
  }
  const identity = nextOperationIdentity(execution, state);
  const pendingAdded = operation.add_facts.map((fact) => {
    requireAvailableTempRef(fact.temp_ref, refs, state, rootTurnId);
    admitOrdinaryText(fact.text, owned, options.ordinaryResultPolicy);
    const factId = deterministicRef('runtime-fact', {
      root_turn_id: identity.root_turn_id,
      step_index: identity.step_index,
      temp_ref: fact.temp_ref
    });
    refs.add(fact.temp_ref);
    return {
      temp_ref: fact.temp_ref,
      fact_id: factId,
      visible: {
        fact_id: fact.temp_ref,
        knowledge_state: 'known_from_direct_action',
        category: 'ordinary_entity_fact',
        text: fact.text
      },
      persisted: { fact_id: factId, temp_ref: fact.temp_ref, text: fact.text }
    };
  });
  const added = pendingAdded.map((fact) => {
    reserveTempRef(fact.temp_ref, state, rootTurnId);
    state.aliases.set(fact.temp_ref, fact.fact_id);
    state.factOwners.set(fact.temp_ref, owned.instance_id);
    return fact;
  });
  const removed = new Set(operation.remove_fact_refs);
  const next = structuredClone(projection);
  next.knowledge = [
    ...(next.knowledge ?? []).filter((record) =>
      !removed.has(factRef(record))),
    ...added.map(({ visible }) => visible)
  ];
  operation.remove_fact_refs.forEach((ref) => state.factOwners.delete(ref));
  return applied({
    projection: next,
    summary: `facts_changed:${operation.entity_ref}`,
    fragment: directFragment(identity, 'party_items', {
      entity_ref: owned.instance_id,
      remove_fact_refs: operation.remove_fact_refs.map((ref) =>
        actualRef(ref, state)),
      add_facts: added.map(({ persisted }) => persisted)
    }),
    consequence: visibleConsequence(identity, {
      change: 'facts_changed', entity_ref: owned.instance_id
    })
  });
}

function setEntityMechanics(execution, state) {
  const { operation, working_projection: projection } = execution;
  requireProjection(projection);
  const refs = collectCurrentRefs(execution);
  requireRef(operation.entity_ref, refs, 'entity_ref');
  const owned = requireRuntimeEntity(operation.entity_ref, state);
  if (!['direct_partition', 'crafted'].includes(owned.origin_kind)) {
    fail('TRACE_TURN_STEP_MECHANICS_CHANGE_UNPROVEN');
  }
  const current = requireProjectedItem(projection, operation.entity_ref);
  const identity = nextOperationIdentity(execution, state);
  const snapshot = createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: identity.root_turn_id,
      step_index: identity.step_index,
      operation_ref: identity.operation_id,
      origin_kind: owned.origin_kind,
      source_refs: [owned.instance_id]
    },
    mechanics: structuredClone(operation.mechanics)
  });
  let next = structuredClone(projection);
  next.items = next.items.map((item) =>
    matchesItem(item, operation.entity_ref) ? {
      ...item,
      quantity: operation.mechanics.quantity?.value ?? 1,
      quantity_unit_id: operation.mechanics.quantity?.unit
    } : item);
  next = applyInventoryTransition({
    projection: next,
    actor: execution.request.actor,
    beforePlacement: current.placement,
    afterPlacement: current.placement,
    beforeMechanics: owned.mechanics,
    afterMechanics: snapshot.mechanics,
    itemRef: operation.entity_ref,
    state
  });
  owned.mechanics = snapshot.mechanics;
  owned.snapshot = snapshot;
  return applied({
    projection: next,
    summary: `mechanics_changed:${operation.entity_ref}`,
    fragment: directFragment(identity, 'party_items', {
      entity_ref: owned.instance_id,
      reason: operation.reason,
      runtime_instance_mechanics_snapshot: snapshot
    }),
    consequence: visibleConsequence(identity, {
      change: 'mechanics_changed', entity_ref: owned.instance_id
    })
  });
}

function retireEntity(execution, state) {
  const { operation, working_projection: projection } = execution;
  requireProjection(projection);
  const refs = collectCurrentRefs(execution);
  requireRef(operation.entity_ref, refs, 'entity_ref');
  const owned = requireRuntimeEntity(operation.entity_ref, state);
  if (!state.consumableSources.has(owned.instance_id)) {
    fail('TRACE_TURN_STEP_RETIRE_CAUSE_UNPROVEN');
  }
  const current = requireProjectedItem(projection, operation.entity_ref);
  let next = structuredClone(projection);
  next.items = next.items.filter((item) =>
    !matchesItem(item, operation.entity_ref));
  next = applyInventoryTransition({
    projection: next,
    actor: execution.request.actor,
    beforePlacement: current.placement,
    afterPlacement: null,
    beforeMechanics: owned.mechanics,
    afterMechanics: null,
    itemRef: operation.entity_ref,
    state
  });
  const ownedFacts = new Set([...state.factOwners.entries()]
    .filter(([, entityRef]) => entityRef === owned.instance_id)
    .map(([factRef]) => factRef));
  next.knowledge = (next.knowledge ?? []).filter((record) =>
    !ownedFacts.has(factRef(record)));
  ownedFacts.forEach((ref) => state.factOwners.delete(ref));
  state.retiredEntities.add(owned.instance_id);
  state.entities.delete(owned.instance_id);
  state.consumableSources.delete(owned.instance_id);
  const identity = nextOperationIdentity(execution, state);
  return applied({
    projection: next,
    summary: `retired:${operation.entity_ref}`,
    fragment: directFragment(identity, 'party_items', {
      entity_ref: owned.instance_id,
      reason: operation.reason
    }),
    consequence: visibleConsequence(identity, {
      change: 'retired', entity_ref: owned.instance_id
    })
  });
}
