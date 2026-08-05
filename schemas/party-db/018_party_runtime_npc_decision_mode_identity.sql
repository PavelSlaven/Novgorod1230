-- NPC decision identity is scoped by resolution mode, NPC and temporal batch.
-- This permits an autonomous decision to hand off to a distinct conversation
-- or combat decision without colliding with append-only semantic traces.

DROP INDEX IF EXISTS
  party_runtime.party_npc_decision_traces_batch_npc_key;

CREATE UNIQUE INDEX IF NOT EXISTS
  party_npc_decision_traces_batch_npc_mode_key
  ON party_runtime.party_npc_decision_traces (
    party_id,
    npc_id,
    decision_mode,
    (same_time_batch_ref ->> 'entity_id')
  )
  WHERE boundary_id IS NOT NULL;
