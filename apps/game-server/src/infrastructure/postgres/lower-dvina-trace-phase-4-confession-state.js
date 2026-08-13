import { mergeKnowledge } from './lower-dvina-trace-phase-4-state-shared.js';

export function projectPhase4Confession({ state, confession, contracts,
  turnNumber }) {
  if (confession === null) return;
  state.interactions = [...(state.interactions ?? []), {
    interaction_id:
      `interaction:${state.party_id}:trace-phase4:${turnNumber}:confession`,
    statement_ref: confession.statement_ref,
    source_statement_ref: structuredClone(confession.source_statement_ref),
    assertion: structuredClone(confession.assertion),
    speaker_npc_id: contracts.actors.ratsha_storehouse_helper.instance_id,
    audience_ids: [state.actor_id, ...confession.required_audience_ids],
    truth_projection: 'forbidden',
    memory_ref: confession.statement_ref,
    journal_ref: confession.statement_ref
  }];
  state.knowledge = mergeKnowledge(state.knowledge, [{
    fact_id: 'trace_ld_v1_evidence_ratsha_confession',
    knowledge_state: 'known_from_committed_source',
    evidence_refs: [confession.source_statement_ref.entity_id]
  }]);
}
