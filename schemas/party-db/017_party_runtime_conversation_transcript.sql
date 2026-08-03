BEGIN;

CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_contributions (
  contribution_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  exchange_id text NOT NULL,
  party_state_version integer NOT NULL CHECK (party_state_version > 0),
  session_state_version integer NOT NULL CHECK (session_state_version > 0),
  contribution_index integer NOT NULL CHECK (contribution_index > 0),
  contribution_schema text NOT NULL CHECK (
    contribution_schema IN (
      'conversation_statement_event_v1',
      'conversation_non_statement_contribution_v1'
    )
  ),
  contribution_payload jsonb NOT NULL
    CHECK (jsonb_typeof(contribution_payload) = 'object'),
  change_set_id text NOT NULL,
  idempotency_key text NOT NULL,
  canonical_digest text NOT NULL,
  FOREIGN KEY (party_id, conversation_id)
    REFERENCES party_runtime.party_conversation_sessions(
      party_id,
      conversation_id
    ) ON DELETE CASCADE,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT,
  UNIQUE (party_id, conversation_id, session_state_version, contribution_index),
  UNIQUE (party_id, idempotency_key)
);

DROP TRIGGER IF EXISTS temporal_append_only
  ON party_runtime.party_conversation_contributions;
CREATE TRIGGER temporal_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_conversation_contributions
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();

CREATE INDEX IF NOT EXISTS party_conversation_contributions_transcript_idx
  ON party_runtime.party_conversation_contributions (
    party_id,
    conversation_id,
    session_state_version,
    contribution_index
  );

COMMIT;
