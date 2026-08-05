-- NPC decision identity is scoped by NPC and temporal batch. The selected mode
-- is a property of that one semantic decision, not a parallel identity axis.

DROP INDEX IF EXISTS
  party_runtime.party_npc_decision_traces_batch_npc_mode_key;

CREATE UNIQUE INDEX IF NOT EXISTS
  party_npc_decision_traces_batch_npc_key
  ON party_runtime.party_npc_decision_traces (
    party_id,
    npc_id,
    (same_time_batch_ref ->> 'entity_id')
  )
  WHERE boundary_id IS NOT NULL;
