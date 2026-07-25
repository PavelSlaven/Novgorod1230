-- PR8 immutable reaction option proposals, introduced in target-only scope
-- and activated by the spatial-v3-production-v1 cutover. It does not reuse
-- the v2 generic party_decision_requests tables or their wall-clock timestamps.
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_reaction_option_proposals (
  request_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL,
  source_perception_id text NOT NULL,
  state_version bigint NOT NULL CHECK (state_version >= 1),
  options_digest text NOT NULL,
  proposal jsonb NOT NULL CHECK (jsonb_typeof(proposal) = 'object'),
  dependency_pins jsonb NOT NULL
    CHECK (jsonb_typeof(dependency_pins) = 'object'),
  canonical_digest text NOT NULL,
  idempotency_key text NOT NULL,
  change_set_id text NOT NULL,
  FOREIGN KEY (party_id, npc_id)
    REFERENCES party_runtime.party_npcs(party_id, npc_id) ON DELETE CASCADE,
  FOREIGN KEY (party_id, source_perception_id)
    REFERENCES party_runtime.party_perception_records(party_id, perception_id)
      ON DELETE RESTRICT,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
      ON DELETE RESTRICT,
  UNIQUE (party_id, request_id),
  UNIQUE (party_id, idempotency_key)
);

DROP TRIGGER IF EXISTS temporal_append_only
  ON party_runtime.party_npc_reaction_option_proposals;
CREATE TRIGGER temporal_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_npc_reaction_option_proposals
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();
