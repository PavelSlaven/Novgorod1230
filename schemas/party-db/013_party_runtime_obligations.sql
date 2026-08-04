-- General party-scoped obligations.  These rows reuse the P16 change-set and
-- command-idempotency owners; they do not introduce a second runtime engine.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_item_placements'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE
          '%physical_position IS NULL%holder_character_id IS NOT NULL%'
        OR pg_get_constraintdef(oid) LIKE
          '%holder_character_id IS NULL%physical_position IS NOT NULL%'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_item_placements DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_holder_position_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_holder_position_check CHECK (
    (physical_position IS NOT NULL) = (
      holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION party_runtime.obligation_actor_ref_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND COALESCE(NULLIF(btrim(value->>'entity_kind'), ''), '') <> ''
    AND COALESCE(NULLIF(btrim(value->>'entity_id'), ''), '') <> '';
$$;

CREATE OR REPLACE FUNCTION party_runtime.obligation_actor_refs_valid(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_typeof(value) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(value) AS reference(value)
      WHERE NOT party_runtime.obligation_actor_ref_valid(reference.value)
    );
$$;

CREATE TABLE IF NOT EXISTS party_runtime.party_obligations (
  obligation_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  policy_ref jsonb NOT NULL,
  policy_version text NOT NULL,
  promisor_ref jsonb NOT NULL,
  beneficiary_ref jsonb NOT NULL,
  witness_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  scope_snapshot jsonb NOT NULL,
  current_state text NOT NULL,
  current_state_fact text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  last_change_set_id text NOT NULL,
  UNIQUE(party_id, obligation_id),
  CHECK(
    jsonb_typeof(policy_ref) = 'object'
    AND COALESCE(
      NULLIF(btrim(policy_ref->>'entity_id'), ''),
      NULLIF(btrim(policy_ref->>'id'), ''),
      ''
    ) <> ''
    AND NULLIF(btrim(policy_version), '') IS NOT NULL
  ),
  CHECK(party_runtime.obligation_actor_ref_valid(promisor_ref)),
  CHECK(party_runtime.obligation_actor_ref_valid(beneficiary_ref)),
  CHECK(party_runtime.obligation_actor_refs_valid(witness_refs)),
  CHECK(jsonb_typeof(scope_snapshot) = 'object'),
  CHECK(NULLIF(btrim(current_state), '') IS NOT NULL),
  CHECK(NULLIF(btrim(current_state_fact), '') IS NOT NULL),
  FOREIGN KEY(party_id, created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id, last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS party_runtime.party_obligation_transitions (
  obligation_transition_id text PRIMARY KEY,
  party_id text NOT NULL,
  obligation_id text NOT NULL,
  transition_ordinal integer NOT NULL CHECK(transition_ordinal >= 0),
  from_state text,
  to_state text NOT NULL,
  transition_kind text NOT NULL,
  causal_basis jsonb NOT NULL,
  witness_snapshot jsonb NOT NULL,
  activity_execution_id text
    REFERENCES party_runtime.party_timed_activity_executions(id)
    ON DELETE RESTRICT,
  check_resolution_id text
    REFERENCES party_runtime.party_check_resolutions(check_resolution_id)
    ON DELETE RESTRICT,
  npc_decision_request_id text
    REFERENCES party_runtime.party_npc_decision_traces(request_id)
    ON DELETE RESTRICT,
  change_set_id text NOT NULL,
  idempotency_record_id text
    REFERENCES party_runtime.party_command_idempotency(id)
    ON DELETE RESTRICT,
  occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn >= 0),
  occurred_at_whole_minutes numeric NOT NULL,
  occurred_at_subminute_numerator numeric NOT NULL,
  occurred_at_subminute_denominator numeric NOT NULL,
  UNIQUE(party_id, obligation_id, transition_ordinal),
  UNIQUE(
    party_id,
    obligation_id,
    idempotency_record_id,
    transition_ordinal
  ),
  CHECK(from_state IS NULL OR NULLIF(btrim(from_state), '') IS NOT NULL),
  CHECK(NULLIF(btrim(to_state), '') IS NOT NULL),
  CHECK(NULLIF(btrim(transition_kind), '') IS NOT NULL),
  CHECK(jsonb_typeof(causal_basis) = 'object'),
  CHECK(party_runtime.obligation_actor_refs_valid(witness_snapshot)),
  CHECK(party_runtime.game_timestamp_parts_valid(
    occurred_at_whole_minutes,
    occurred_at_subminute_numerator,
    occurred_at_subminute_denominator
  )),
  FOREIGN KEY(party_id, obligation_id)
    REFERENCES party_runtime.party_obligations(party_id, obligation_id)
    ON DELETE CASCADE,
  FOREIGN KEY(party_id, change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION party_runtime.obligation_current_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.party_id IS DISTINCT FROM OLD.party_id
    OR NEW.policy_ref IS DISTINCT FROM OLD.policy_ref
    OR NEW.policy_version IS DISTINCT FROM OLD.policy_version
    OR NEW.promisor_ref IS DISTINCT FROM OLD.promisor_ref
    OR NEW.beneficiary_ref IS DISTINCT FROM OLD.beneficiary_ref
    OR NEW.witness_refs IS DISTINCT FROM OLD.witness_refs
    OR NEW.scope_snapshot IS DISTINCT FROM OLD.scope_snapshot
    OR NEW.created_change_set_id IS DISTINCT FROM OLD.created_change_set_id
  THEN
    RAISE EXCEPTION
      'party_obligation_immutable_identity_or_scope: %', OLD.obligation_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE TRIGGER party_obligation_current_immutable
BEFORE UPDATE ON party_runtime.party_obligations
FOR EACH ROW EXECUTE FUNCTION party_runtime.obligation_current_immutable();

CREATE OR REPLACE TRIGGER party_obligation_transition_append_only
BEFORE UPDATE OR DELETE ON party_runtime.party_obligation_transitions
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();
