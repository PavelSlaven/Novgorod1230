import { row } from './first-playable/plan-shared.js';
import { appendTurnStepSemanticActivityWrites } from
  './lower-dvina-trace-turn-step-activity-writes.js';
import { itemRecord, mergeKnowledge, physicalPlacement } from
  './lower-dvina-trace-turn-step-item-state.js';
import { appendAuthoredTurnStepWrites } from
  './lower-dvina-trace-turn-step-authored-writes.js';
import { projectPersistedTurnStepContainers } from
  './lower-dvina-trace-turn-step-container-persistence.js';

export function projectTurnStepPersistenceSnapshot({
  next, authoredItems, authoredContainers, entities, context, batch,
  writePlan, idemId
}) {
  next.items = [
    ...authoredItems.map((item) => structuredClone(item)),
    ...entities.values()
      .filter((entity) => !entity.created_in_batch
        || entity.lifecycle_status === 'active')
      .map(({ db_state: dbState, lifecycle_status: _status,
        created_in_batch: _created, ...item }) => structuredClone({
        ...item,
        state: context.touched.has(item.item_id) ? dbState : item.state
      }))
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

export function buildTurnStepPersistenceWrites({
  partyId, state, next, commit, changeSetId, idemId, entities, authoredItems,
  authoredContainers, context
}) {
  const writes = { inserts: [], updates: [], appends: [], deletes: [] };
  if (context.bodyHistory != null) writes.appends.push(context.bodyHistory.write);
  appendTurnStepSemanticActivityWrites({
    writes, activities: context.activityHistory, partyId, state,
    snapshot: next, factual: commit, changeSetId, idemId
  });
  for (const entity of entities.values()) {
    if (!context.touched.has(entity.item_id)
        || entity.created_in_batch && entity.lifecycle_status === 'retired') {
      continue;
    }
    const mode = context.creates.has(entity.item_id) ? 'inserts' : 'updates';
    writes[mode].push(row(
      'party_items', entity.item_id, itemRecord(partyId, entity)));
    if (context.placements.has(entity.item_id)) {
      writes[mode].push(row('party_item_placements', entity.item_id, {
        party_id: partyId, item_id: entity.item_id,
        ...physicalPlacement(entity.placement)
      }));
    }
  }
  appendAuthoredTurnStepWrites({
    writes, authoredItems, authoredContainers,
    authoredStateTouched: context.authoredStateTouched,
    placements: context.placements, ownerships: context.ownerships,
    partyId, changeSetId
  });
  for (const knowledge of context.knowledgeInserts) {
    writes.inserts.push(row('party_character_knowledge',
      `${state.actor_id}:${knowledge.fact_id}`, {
        party_id: partyId, character_id: state.actor_id,
        fact_id: knowledge.fact_id,
        knowledge_state: knowledge.knowledge_state,
        evidence: knowledge.evidence_refs
      }));
  }
  return writes;
}
