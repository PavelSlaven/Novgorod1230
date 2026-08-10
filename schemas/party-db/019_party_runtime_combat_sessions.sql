CREATE TABLE IF NOT EXISTS party_runtime.party_combat_sessions (
  combat_id text PRIMARY KEY,
  party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  state_version bigint NOT NULL CHECK(state_version >= 1),
  status text NOT NULL CHECK(status IN ('active','paused_for_player','paused_for_decisions','ended')),
  started_at jsonb NOT NULL CHECK (jsonb_typeof(started_at) = 'object'),
  scope_ref jsonb NOT NULL CHECK (jsonb_typeof(scope_ref) = 'object'),
  participant_refs jsonb NOT NULL
    CHECK (jsonb_typeof(participant_refs) = 'array'),
  participant_states jsonb NOT NULL
    CHECK (jsonb_typeof(participant_states) = 'array'),
  exchange_ordinal bigint NOT NULL CHECK(exchange_ordinal >= 0),
  last_exchange_ref jsonb
    CHECK (
      last_exchange_ref IS NULL
      OR jsonb_typeof(last_exchange_ref) = 'object'
    ),
  player_response_required boolean NOT NULL,
  last_change_set_id text NOT NULL,
  canonical_digest text NOT NULL,
  session_schema text NOT NULL CHECK(session_schema = 'combat_session_v1'),
  UNIQUE(combat_id, party_id),
  FOREIGN KEY (party_id, last_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id, id)
    ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION party_runtime.combat_session_lifecycle_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.combat_id IS DISTINCT FROM OLD.combat_id
    OR NEW.party_id IS DISTINCT FROM OLD.party_id
    OR NEW.started_at IS DISTINCT FROM OLD.started_at
    OR NEW.scope_ref IS DISTINCT FROM OLD.scope_ref
    OR NEW.state_version <> OLD.state_version + 1
    OR NEW.exchange_ordinal < OLD.exchange_ordinal
  THEN
    RAISE EXCEPTION
      'combat session identity, ordinal or state version changed: %',
      OLD.combat_id;
  END IF;

  IF NOT (
    (OLD.status = 'active'
      AND NEW.status IN (
        'active', 'paused_for_player', 'paused_for_decisions', 'ended'
      ))
    OR (OLD.status = 'paused_for_player'
      AND NEW.status IN ('active', 'paused_for_player', 'ended'))
    OR (OLD.status = 'paused_for_decisions'
      AND NEW.status IN ('active', 'paused_for_decisions', 'ended'))
  ) THEN
    RAISE EXCEPTION
      'combat session lifecycle transition is invalid: %',
      OLD.combat_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS combat_session_lifecycle_valid
  ON party_runtime.party_combat_sessions;
CREATE TRIGGER combat_session_lifecycle_valid
BEFORE UPDATE
ON party_runtime.party_combat_sessions
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.combat_session_lifecycle_valid();

CREATE INDEX IF NOT EXISTS party_combat_sessions_party_idx
  ON party_runtime.party_combat_sessions(party_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS party_combat_sessions_one_open_per_party_uq
  ON party_runtime.party_combat_sessions(party_id)
  WHERE status <> 'ended';
