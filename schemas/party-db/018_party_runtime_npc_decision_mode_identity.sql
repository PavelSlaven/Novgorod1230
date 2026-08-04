-- One NPC has at most one semantic decision in one fully resolved temporal batch.
-- The decision mode selects the resolution profile; it does not split identity.
-- A database that admitted mode-split traces requires explicit operator repair:
-- the append-only decision owner cannot discard or rewrite either trace safely.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM party_runtime.party_npc_decision_traces
    WHERE boundary_id IS NOT NULL
    GROUP BY
      party_id,
      npc_id,
      (same_time_batch_ref ->> 'entity_id')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'party_npc_decision_batch_identity_conflict: operator repair required before migration 018';
  END IF;
END
$$;

DROP INDEX IF EXISTS
  party_runtime.party_npc_decision_traces_batch_npc_mode_key;

CREATE UNIQUE INDEX IF NOT EXISTS party_npc_decision_traces_batch_npc_key
  ON party_runtime.party_npc_decision_traces (
    party_id,
    npc_id,
    (same_time_batch_ref ->> 'entity_id')
  )
  WHERE boundary_id IS NOT NULL;
