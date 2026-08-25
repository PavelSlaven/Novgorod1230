import {
  databaseQuantity
} from './lower-dvina-trace-turn-step-item-state.js';
import { validateMechanicsProvenance } from
  './lower-dvina-trace-turn-step-commit-validation.js';
import { validatePlacementShape } from
  './lower-dvina-trace-turn-step-operation-validation.js';
import {
  exact,
  fail,
  requireMechanics,
  text
} from './lower-dvina-trace-turn-step-persistence-support.js';
import { applyAuthoredItemOperation } from
  './lower-dvina-trace-turn-step-authored-item-operation.js';

export function applyItemOperation({
  operation, entities, authoredItems, authoredItemRefs, authoredContainers,
  authoredContainerRefs, authoredStateTouched,
  creates, touched, placements, ownerships, retired, state, changeSetId,
  knowledgeInserts, recordActorKnowledge = true, actorId = state.actor_id
}) {
  const { operation_kind: kind, payload } = operation;
  if (kind === 'create_entity') {
    if (authoredItemRefs.has(payload.entity_ref)) {
      fail('TRACE_TURN_STEP_MIXED_ITEM_SOURCE', {
        entity_ref: payload.entity_ref
      });
    }
    if (entities.has(payload.entity_ref)) {
      fail('TRACE_TURN_STEP_ENTITY_STATE_CONFLICT', {
        entity_ref: payload.entity_ref, reason: 'entity already exists'
      });
    }
    const mechanics = requireMechanics(
      payload.runtime_instance_mechanics_snapshot);
    validateMechanicsProvenance(operation, mechanics, payload.origin);
    for (const sourceRef of payload.origin.source_refs) {
      if (!entities.has(sourceRef) && !knownStateRef(state, sourceRef)) {
        fail('TRACE_TURN_STEP_REF_UNRESOLVED', {
          field: 'origin.source_refs', ref: sourceRef
        });
      }
    }
    const placement = normalizePlacement(
      payload.placement, state, entities, actorId);
    const semanticFacts = payload.facts.map((fact) => ({
      fact_id: fact.fact_id, text: fact.text,
      operation_id: operation.operation_id
    }));
    const dbState = {
      lifecycle_status: 'active',
      runtime_instance_mechanics_snapshot: mechanics,
      ordinary_metadata: {
        semantic_type: payload.semantic_type,
        name: payload.name,
        origin: structuredClone(payload.origin),
        semantic_facts: semanticFacts,
        operation_history: [history(operation, 'created')]
      }
    };
    entities.set(payload.entity_ref, {
      item_id: payload.entity_ref,
      instance_id: payload.entity_ref,
      template_id: null,
      profile_id: null,
      category_id: null,
      name: payload.name,
      quantity: databaseQuantity(),
      quantity_unit_id: mechanics.mechanics.quantity?.unit,
      condition_state: 'ordinary_runtime_instance',
      legal_status: 'unowned_ordinary_runtime',
      placement,
      runtime_instance_mechanics_snapshot: mechanics,
      state: dbState,
      db_state: dbState,
      lifecycle_status: 'active',
      created_in_batch: true
    });
    creates.add(payload.entity_ref);
    touched.add(payload.entity_ref);
    placements.add(payload.entity_ref);
    if (recordActorKnowledge) appendKnowledge(
      knowledgeInserts, semanticFacts, operation.operation_id);
    return;
  }
  const authoredRef = payload.entity_ref ?? payload.container_ref;
  if (applyAuthoredItemOperation({
    operation, authoredItems, authoredItemRefs, authoredContainers,
    authoredContainerRefs, authoredStateTouched,
    placements, ownerships, state,
    normalizePlacement: (value) => normalizePlacement(
      value, state, entities, actorId)
  })) return;
  const entity = requireMutableRuntimeEntity(
    entities, authoredRef, retired);
  touched.add(entity.item_id);
  if (kind === 'request_container_access') {
    entity.state = { ...(entity.state ?? {}), ...(payload.state_patch ?? {}) };
    entity.db_state = {
      ...(entity.db_state ?? {}), ...(payload.state_patch ?? {})
    };
    Object.assign(entity, payload.state_patch ?? {});
    appendHistory(entity, operation, 'container_accessed', {
      access_kind: payload.access_kind
    });
    return;
  }
  if (kind === 'move_entity') {
    entity.placement = normalizePlacement(
      payload.placement, state, entities, actorId);
    placements.add(entity.item_id);
    appendHistory(entity, operation, 'moved');
    return;
  }
  if (kind === 'change_entity_facts') {
    const facts = entity.db_state.ordinary_metadata.semantic_facts;
    const byId = new Map(facts.map((fact) => [fact.fact_id, fact]));
    for (const factId of payload.remove_fact_refs) {
      if (!byId.delete(factId)) fail('TRACE_TURN_STEP_FACT_REF_UNRESOLVED', {
        entity_ref: entity.item_id, fact_ref: factId
      });
      removePendingKnowledge(knowledgeInserts, factId);
    }
    for (const fact of payload.add_facts) {
      if (byId.has(fact.fact_id)) fail('TRACE_TURN_STEP_FACT_REF_CONFLICT', {
        entity_ref: entity.item_id, fact_ref: fact.fact_id
      });
      byId.set(fact.fact_id, {
        fact_id: fact.fact_id, text: fact.text,
        operation_id: operation.operation_id
      });
    }
    entity.db_state.ordinary_metadata.semantic_facts = [...byId.values()];
    if (recordActorKnowledge) appendKnowledge(knowledgeInserts,
      payload.add_facts, operation.operation_id);
    appendHistory(entity, operation, 'facts_changed');
    return;
  }
  if (kind === 'set_entity_mechanics') {
    const mechanics = requireMechanics(
      payload.runtime_instance_mechanics_snapshot);
    validateMechanicsProvenance(
      operation, mechanics, entity.db_state.ordinary_metadata.origin);
    entity.runtime_instance_mechanics_snapshot = mechanics;
    entity.db_state.runtime_instance_mechanics_snapshot = mechanics;
    entity.quantity = databaseQuantity();
    entity.quantity_unit_id = mechanics.mechanics.quantity?.unit;
    appendHistory(entity, operation, 'mechanics_changed', {
      reason: payload.reason
    });
    return;
  }
  if (kind === 'retire_entity') {
    for (const fact of entity.db_state.ordinary_metadata.semantic_facts) {
      removePendingKnowledge(knowledgeInserts, fact.fact_id);
    }
    entity.lifecycle_status = 'retired';
    entity.condition_state = 'retired';
    entity.db_state.lifecycle_status = 'retired';
    entity.db_state.retirement = {
      reason: payload.reason,
      operation_id: operation.operation_id,
      change_set_id: changeSetId
    };
    appendHistory(entity, operation, 'retired', { reason: payload.reason });
    retired.add(entity.item_id);
    return;
  }
  fail('TRACE_TURN_STEP_OPERATION_SCHEMA_UNKNOWN', { operation_kind: kind });
}

function normalizePlacement(value, state, entities, actorId) {
  let placement = structuredClone(value);
  if (Object.hasOwn(placement, 'relation')) {
    exact(placement, ['relation', 'target_ref']);
    placement = placement.relation === 'located_at'
      ? { location_ref: placement.target_ref }
      : placement.relation === 'inside'
        ? { container_id: placement.target_ref }
        : placement.relation === 'attached_to'
          ? { attached_item_id: placement.target_ref }
          : {
              holder_character_id: placement.target_ref,
              physical_position: placement.relation === 'held_by'
                ? 'hands' : 'worn'
            };
  }
  validatePlacementShape(placement);
  if (placement.holder_character_id) {
    if (placement.holder_character_id !== actorId
        || !['hands', 'worn', 'worn_quick', 'equipped', 'external',
          'external_load'].includes(placement.physical_position)) {
      unresolvedPlacement(placement);
    }
    if (actorId === state.actor_id) return placement;
    if (!(state.npcs ?? []).some(({ instance_id: id }) => id === actorId)) {
      unresolvedPlacement(placement);
    }
    return { holder_npc_id: actorId,
      physical_position: placement.physical_position };
  }
  if (placement.location_ref) {
    const knownAnchors = new Set([
      state.position?.g5_anchor_id,
      ...(state.anchors ?? []).flatMap((anchor) => [
        anchor?.anchor_id, anchor?.g5_anchor_id
      ])
    ].filter(Boolean));
    const locatedNpc = (state.npcs ?? []).find(({ instance_id: id,
      machine_state: machine }) => id === actorId
        && machine?.location_ref === placement.location_ref);
    const npcAnchor = locatedNpc?.anchor_id
      ?? locatedNpc?.machine_state?.g5_anchor_id
      ?? locatedNpc?.machine_state?.anchor_id ?? null;
    const anchorId = placement.location_ref === state.position?.location_ref
      ? state.position?.g5_anchor_id
      : knownAnchors.has(placement.location_ref)
        ? placement.location_ref : npcAnchor;
    if (!text(anchorId)) unresolvedPlacement(placement);
    return { anchor_id: anchorId };
  }
  if (placement.container_id) {
    if (!(state.containers ?? []).some((container) =>
      container.container_id === placement.container_id)) {
      unresolvedPlacement(placement);
    }
    return placement;
  }
  if (!entities.has(placement.attached_item_id)
      && !(state.items ?? []).some((item) =>
        (item.item_id ?? item.instance_id) === placement.attached_item_id
        && item.state?.lifecycle_status !== 'retired'
        && item.condition_state !== 'retired')) {
    unresolvedPlacement(placement);
  }
  return placement;
}

function requireMutableRuntimeEntity(entities, entityRef, retired) {
  const entity = entities.get(entityRef);
  if (!entity || retired.has(entityRef)
      || entity.lifecycle_status !== 'active') {
    fail('TRACE_TURN_STEP_ENTITY_STATE_CONFLICT', {
      entity_ref: entityRef,
      reason: entity ? 'entity is retired' : 'runtime entity is unresolved'
    });
  }
  return entity;
}

function knownStateRef(state, ref) {
  if ([state.actor_id, state.position?.location_ref,
    state.position?.g5_anchor_id].includes(ref)) return true;
  return (state.items ?? []).some((item) =>
    item?.item_id === ref || item?.instance_id === ref)
    || (state.containers ?? []).some((container) =>
      container?.container_id === ref)
    || (state.knowledge ?? []).some((fact) => fact?.fact_id === ref)
    || (state.npcs ?? []).some((npc) =>
      npc?.npc_id === ref || npc?.instance_id === ref);
}

function appendHistory(entity, operation, result, extra = {}) {
  entity.db_state.ordinary_metadata.operation_history.push(
    history(operation, result, extra));
}

function history(operation, result, extra = {}) {
  return {
    operation_id: operation.operation_id,
    root_turn_id: operation.root_turn_id,
    step_index: operation.step_index,
    operation_kind: operation.operation_kind,
    result,
    ...extra
  };
}

function appendKnowledge(output, facts, operationId) {
  for (const fact of facts) output.push({
    fact_id: fact.fact_id,
    knowledge_state: 'known_from_direct_action',
    text: fact.text,
    evidence_refs: [operationId]
  });
}

function removePendingKnowledge(output, factId) {
  const index = output.findIndex((entry) => entry.fact_id === factId);
  if (index >= 0) output.splice(index, 1);
}

function unresolvedPlacement(placement) {
  fail('TRACE_TURN_STEP_PLACEMENT_REF_UNRESOLVED', { placement });
}
