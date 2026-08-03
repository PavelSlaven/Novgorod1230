import { createRuntimeInstanceMechanicsSnapshot } from '@rus/items-property';
import {
  applied,
  collectCurrentRefs,
  deterministicRef,
  directFragment,
  nextOperationIdentity,
  requireProjection,
  requireRef,
  requireRefs,
  visibleConsequence
} from './lower-dvina-trace-turn-step-runtime-common.js';
import { createMutationOperationHandlers } from
  './lower-dvina-trace-turn-step-item-mutations.js';
import {
  actualRef,
  admitOrdinaryEntity,
  admitOrdinaryText,
  applyInventoryTransition,
  initializeRuntimeState,
  normalizePlacement,
  persistedPlacement,
  requireAvailableTempRef,
  reserveTempRef,
  requireOrigin
} from './lower-dvina-trace-turn-step-item-support.js';

export { initializeRuntimeState };

export function createItemOperationHandlers(state, options = {}) {
  return Object.freeze({
    create_entity: (execution) => createEntity(execution, state, options),
    ...createMutationOperationHandlers(state, options)
  });
}

function createEntity(execution, state, options) {
  const { operation, working_projection: projection } = execution;
  const rootTurnId = execution.request.root_turn_id;
  requireProjection(projection);
  const refs = collectCurrentRefs(execution);
  requireAvailableTempRef(operation.temp_ref, refs, state, rootTurnId);
  const admitted = admitOrdinaryEntity(operation,
    options.ordinaryResultPolicy);
  requireOrigin(operation.origin, projection, state, refs);
  requireRefs(operation.origin.source_refs, refs, 'origin.source_refs');
  requireRef(operation.placement.target_ref, refs, 'placement.target_ref');
  const operationIdentity = nextOperationIdentity(execution, state);
  const instanceId = deterministicRef('runtime-item', {
    root_turn_id: operationIdentity.root_turn_id,
    temp_ref: operation.temp_ref
  });
  const snapshot = createRuntimeInstanceMechanicsSnapshot({
    schema: 'rus.items.runtime_instance_mechanics_snapshot.v1',
    version: 1,
    provenance: {
      source_kind: 'ordinary_direct_action_result',
      root_turn_id: operationIdentity.root_turn_id,
      step_index: operationIdentity.step_index,
      operation_ref: operationIdentity.operation_id,
      origin_kind: operation.origin.kind,
      source_refs: operation.origin.source_refs.map((ref) =>
        actualRef(ref, state))
    },
    mechanics: structuredClone(operation.mechanics)
  });
  const placement = normalizePlacement({
    placement: operation.placement,
    projection,
    state,
    entityRef: operation.temp_ref,
    incomingMechanics: snapshot.mechanics,
    resolveItemMechanics: options.resolveItemMechanics
  });
  let next = structuredClone(projection);
  next.items = [...(next.items ?? []), {
    item_id: operation.temp_ref,
    instance_id: instanceId,
    category_id: admitted.semantic_type,
    name: admitted.name,
    quantity: operation.mechanics.quantity?.value ?? 1,
    quantity_unit_id: operation.mechanics.quantity?.unit,
    condition_state: 'ordinary_runtime_instance',
    placement,
    state: { semantic_category: admitted.semantic_type }
  }];
  next = applyInventoryTransition({
    projection: next,
    actor: execution.request.actor,
    beforePlacement: null,
    afterPlacement: placement,
    beforeMechanics: null,
    afterMechanics: snapshot.mechanics,
    itemRef: operation.temp_ref,
    state
  });
  const factRefs = collectCurrentRefs({
    ...execution,
    working_projection: next
  });
  const pendingFacts = operation.facts.map((fact) => {
    requireAvailableTempRef(fact.temp_ref, factRefs, state, rootTurnId);
    factRefs.add(fact.temp_ref);
    admitOrdinaryText(fact.text, admitted, options.ordinaryResultPolicy);
    const factId = deterministicRef('runtime-fact', {
      root_turn_id: operationIdentity.root_turn_id,
      temp_ref: fact.temp_ref
    });
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
  reserveTempRef(operation.temp_ref, state, rootTurnId);
  state.aliases.set(operation.temp_ref, instanceId);
  const facts = pendingFacts.map((fact) => {
    reserveTempRef(fact.temp_ref, state, rootTurnId);
    state.aliases.set(fact.temp_ref, fact.fact_id);
    state.factOwners.set(fact.temp_ref, instanceId);
    return fact;
  });
  next.knowledge = [
    ...(next.knowledge ?? []),
    ...facts.map(({ visible }) => visible)
  ];
  state.entities.set(instanceId, {
    instance_id: instanceId,
    mechanics: snapshot.mechanics,
    snapshot,
    semantic_type: admitted.semantic_type,
    name: admitted.name,
    origin_kind: operation.origin.kind,
    source_refs: [...operation.origin.source_refs]
  });
  if (operation.origin.kind !== 'ambient_ordinary') {
    operation.origin.source_refs.forEach((ref) =>
      state.consumableSources.add(actualRef(ref, state)));
  }
  return applied({
    projection: next,
    summary: `created:${operation.temp_ref}`,
    fragment: directFragment(operationIdentity, 'party_items', {
      temp_ref: operation.temp_ref,
      entity_ref: instanceId,
      semantic_type: admitted.semantic_type,
      name: admitted.name,
      origin: {
        kind: operation.origin.kind,
        source_refs: snapshot.provenance.source_refs
      },
      facts: facts.map(({ persisted }) => persisted),
      runtime_instance_mechanics_snapshot: snapshot,
      placement: persistedPlacement(placement, state)
    }),
    consequence: visibleConsequence(operationIdentity, {
      change: 'created', entity_ref: instanceId, name: admitted.name
    })
  });
}
