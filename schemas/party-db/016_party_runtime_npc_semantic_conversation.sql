-- Semantic NPC decisions reuse the existing decision trace owner.  Bounded
-- decisions remain valid while semantic decisions carry their complete replay
-- identity and plan in the same append-only relation.

ALTER TABLE party_runtime.party_npc_decision_traces
  ALTER COLUMN option_id DROP NOT NULL,
  ALTER COLUMN command_token DROP NOT NULL,
  ALTER COLUMN options_digest DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS boundary_id text,
  ADD COLUMN IF NOT EXISTS decision_mode text,
  ADD COLUMN IF NOT EXISTS root_turn_id text,
  ADD COLUMN IF NOT EXISTS working_revision bigint,
  ADD COLUMN IF NOT EXISTS signal_refs jsonb,
  ADD COLUMN IF NOT EXISTS decision_categories jsonb,
  ADD COLUMN IF NOT EXISTS aggregate_significance text,
  ADD COLUMN IF NOT EXISTS same_time_batch_ref jsonb,
  ADD COLUMN IF NOT EXISTS semantic_request jsonb,
  ADD COLUMN IF NOT EXISTS boundary_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS signal_records jsonb,
  ADD COLUMN IF NOT EXISTS semantic_plan jsonb,
  ADD COLUMN IF NOT EXISTS canonical_input_digest text,
  ADD COLUMN IF NOT EXISTS semantic_trace_schema text;

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_decision_mode_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_decision_mode_check CHECK (
    decision_mode IS NULL
    OR decision_mode IN ('autonomous', 'conversation', 'combat')
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_working_revision_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_working_revision_check CHECK (
    working_revision IS NULL OR working_revision >= 0
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_categories_check;

CREATE OR REPLACE FUNCTION party_runtime.npc_semantic_categories_valid(
  categories jsonb
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN categories IS NULL
      OR jsonb_typeof(categories) <> 'array'
      OR jsonb_array_length(categories) = 0 THEN false
    ELSE categories = (
      SELECT jsonb_agg(category ORDER BY ordinal)
      FROM (VALUES
        ('self', 1),
        ('others', 2),
        ('environment', 3),
        ('objective', 4),
        ('communication', 5)
      ) AS allowed(category, ordinal)
      WHERE categories ? category
    )
  END
$$;

ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_categories_check CHECK (
    decision_categories IS NULL
    OR party_runtime.npc_semantic_categories_valid(decision_categories)
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_json_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_json_check CHECK (
    (signal_refs IS NULL OR jsonb_typeof(signal_refs) = 'array')
    AND (same_time_batch_ref IS NULL OR jsonb_typeof(same_time_batch_ref) = 'object')
    AND (semantic_request IS NULL OR jsonb_typeof(semantic_request) = 'object')
    AND (boundary_snapshot IS NULL OR jsonb_typeof(boundary_snapshot) = 'object')
    AND (signal_records IS NULL OR jsonb_typeof(signal_records) = 'array')
    AND (semantic_plan IS NULL OR jsonb_typeof(semantic_plan) = 'object')
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_significance_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_significance_check CHECK (
    aggregate_significance IS NULL
    OR aggregate_significance IN ('material', 'critical')
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_schema_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_schema_check CHECK (
    semantic_trace_schema IS NULL
    OR semantic_trace_schema = 'npc_semantic_decision_trace_v1'
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_branch_check;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_branch_check CHECK (
    (
      option_id IS NOT NULL
      AND command_token IS NOT NULL
      AND options_digest IS NOT NULL
      AND boundary_id IS NULL
      AND decision_mode IS NULL
      AND root_turn_id IS NULL
      AND working_revision IS NULL
      AND signal_refs IS NULL
      AND decision_categories IS NULL
      AND aggregate_significance IS NULL
      AND same_time_batch_ref IS NULL
      AND semantic_request IS NULL
      AND boundary_snapshot IS NULL
      AND signal_records IS NULL
      AND semantic_plan IS NULL
      AND canonical_input_digest IS NULL
      AND semantic_trace_schema IS NULL
    )
    OR
    (
      option_id IS NULL
      AND command_token IS NULL
      AND options_digest IS NULL
      AND boundary_id IS NOT NULL
      AND decision_mode IS NOT NULL
      AND root_turn_id IS NOT NULL
      AND working_revision IS NOT NULL
      AND signal_refs IS NOT NULL
      AND decision_categories IS NOT NULL
      AND aggregate_significance IS NOT NULL
      AND same_time_batch_ref IS NOT NULL
      AND semantic_request IS NOT NULL
      AND boundary_snapshot IS NOT NULL
      AND signal_records IS NOT NULL
      AND semantic_plan IS NOT NULL
      AND canonical_input_digest IS NOT NULL
      AND semantic_trace_schema IS NOT NULL
      AND change_set_id IS NOT NULL
      AND status = 'committed'
    )
  );

ALTER TABLE party_runtime.party_npc_decision_traces
  DROP CONSTRAINT IF EXISTS party_npc_decision_traces_semantic_change_set_fk;
ALTER TABLE party_runtime.party_npc_decision_traces
  ADD CONSTRAINT party_npc_decision_traces_semantic_change_set_fk
  FOREIGN KEY (party_id, change_set_id)
  REFERENCES party_runtime.party_v3_change_sets(party_id, id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS party_npc_decision_traces_boundary_key
  ON party_runtime.party_npc_decision_traces (party_id, boundary_id)
  WHERE boundary_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS party_npc_decision_traces_batch_npc_key
  ON party_runtime.party_npc_decision_traces (
    party_id,
    npc_id,
    (same_time_batch_ref ->> 'entity_id')
  )
  WHERE boundary_id IS NOT NULL;

-- Conversation sessions are mutable current projections updated through CAS.
CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_sessions (
  conversation_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version bigint NOT NULL CHECK (state_version >= 1),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'ended')),
  started_at jsonb NOT NULL CHECK (jsonb_typeof(started_at) = 'object'),
  location_ref jsonb NOT NULL CHECK (jsonb_typeof(location_ref) = 'object'),
  initiator_ref jsonb NOT NULL CHECK (jsonb_typeof(initiator_ref) = 'object'),
  active_participant_refs jsonb NOT NULL
    CHECK (jsonb_typeof(active_participant_refs) = 'array'),
  last_contribution_ref jsonb
    CHECK (
      last_contribution_ref IS NULL
      OR jsonb_typeof(last_contribution_ref) = 'object'
    ),
  topic_refs jsonb NOT NULL CHECK (jsonb_typeof(topic_refs) = 'array'),
  status_reason text,
  updated_change_set_id text NOT NULL,
  canonical_digest text NOT NULL,
  session_schema text NOT NULL
    CHECK (session_schema = 'conversation_session_v1'),
  UNIQUE (party_id, conversation_id),
  FOREIGN KEY (party_id, updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION party_runtime.conversation_session_lifecycle_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.party_id IS DISTINCT FROM OLD.party_id
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.initiator_ref IS DISTINCT FROM OLD.initiator_ref
    OR NEW.state_version <> OLD.state_version + 1
  THEN
    RAISE EXCEPTION
      'conversation session identity or state version changed: %',
      OLD.conversation_id;
  END IF;

  IF NOT (
    (OLD.status = 'active' AND NEW.status IN ('active', 'suspended', 'ended'))
    OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'suspended', 'ended'))
  ) THEN
    RAISE EXCEPTION
      'conversation session lifecycle transition is invalid: %',
      OLD.conversation_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS conversation_session_lifecycle_valid
  ON party_runtime.party_conversation_sessions;
CREATE TRIGGER conversation_session_lifecycle_valid
BEFORE UPDATE
ON party_runtime.party_conversation_sessions
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.conversation_session_lifecycle_valid();

-- Statements are the immutable factual transcript of a conversation.
CREATE TABLE IF NOT EXISTS party_runtime.party_conversation_statements (
  statement_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  conversation_id text NOT NULL,
  exchange_id text NOT NULL,
  speaker_ref jsonb NOT NULL CHECK (jsonb_typeof(speaker_ref) = 'object'),
  intended_addressee_refs jsonb NOT NULL
    CHECK (jsonb_typeof(intended_addressee_refs) = 'array'),
  utterance_text text NOT NULL,
  dominant_act text NOT NULL,
  interaction_tags jsonb NOT NULL
    CHECK (jsonb_typeof(interaction_tags) = 'array'),
  topic_refs jsonb NOT NULL CHECK (jsonb_typeof(topic_refs) = 'array'),
  claims jsonb NOT NULL CHECK (jsonb_typeof(claims) = 'array'),
  message_completeness text NOT NULL
    CHECK (message_completeness = 'complete'),
  spoken_at jsonb NOT NULL CHECK (jsonb_typeof(spoken_at) = 'object'),
  duration jsonb NOT NULL CHECK (jsonb_typeof(duration) = 'object'),
  social_delivery_result jsonb
    CHECK (
      social_delivery_result IS NULL
      OR jsonb_typeof(social_delivery_result) = 'object'
    ),
  source_plan_ref jsonb NOT NULL
    CHECK (jsonb_typeof(source_plan_ref) = 'object'),
  audience_projection jsonb NOT NULL
    CHECK (
      jsonb_typeof(audience_projection) = 'object'
      AND audience_projection ->> 'schema'
        = 'conversation_audience_projection_v1'
      AND audience_projection -> 'statement_ref' ->> 'entity_kind'
        = 'conversation_statement'
      AND audience_projection -> 'statement_ref' ->> 'entity_id'
        = statement_id
    ),
  audience_digest text NOT NULL CHECK (length(audience_digest) > 0),
  change_set_id text NOT NULL,
  statement_schema text NOT NULL
    CHECK (statement_schema = 'conversation_statement_event_v1'),
  idempotency_key text NOT NULL,
  canonical_digest text NOT NULL,
  FOREIGN KEY (party_id, conversation_id)
    REFERENCES party_runtime.party_conversation_sessions(
      party_id,
      conversation_id
    )
    ON DELETE CASCADE,
  FOREIGN KEY (party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT,
  UNIQUE (party_id, idempotency_key)
);

DROP TRIGGER IF EXISTS temporal_append_only
  ON party_runtime.party_conversation_statements;
CREATE TRIGGER temporal_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_conversation_statements
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();

CREATE INDEX IF NOT EXISTS party_conversation_sessions_party_status_idx
  ON party_runtime.party_conversation_sessions (party_id, status);

CREATE INDEX IF NOT EXISTS party_conversation_statements_conversation_exchange_idx
  ON party_runtime.party_conversation_statements (conversation_id, exchange_id);
