-- Semantic NPC decision identity includes the active decision mode.
-- A single NPC may therefore cross conversation/autonomous/combat boundaries
-- in one exact temporal batch without colliding with another mode's trace.

DROP INDEX IF EXISTS
  party_runtime.party_npc_decision_traces_batch_npc_key;

CREATE UNIQUE INDEX party_npc_decision_traces_batch_npc_mode_key
  ON party_runtime.party_npc_decision_traces (
    party_id,
    npc_id,
    decision_mode,
    (same_time_batch_ref ->> 'entity_id')
  )
  WHERE boundary_id IS NOT NULL;
