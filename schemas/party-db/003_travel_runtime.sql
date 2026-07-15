-- PR8 travel runtime. Apply after 002_environment_landmarks.sql.
CREATE TABLE IF NOT EXISTS party_runtime.party_journeys (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  journey_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','active','interrupted','camped','blocked','arrived','abandoned')),
  mode TEXT NOT NULL CHECK (mode IN ('route','course')),
  origin_g4_id TEXT NOT NULL,
  target_ref JSONB NOT NULL,
  intended_direction TEXT,
  pace_profile_id TEXT NOT NULL,
  movement_method TEXT NOT NULL,
  current_leg_id TEXT,
  elapsed_minutes INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_minutes >= 0),
  actual_position_state JSONB NOT NULL,
  perceived_position_state JSONB NOT NULL,
  orientation_confidence TEXT NOT NULL,
  deviation_level TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  world_revision_id TEXT NOT NULL,
  travel_rules_digest TEXT NOT NULL,
  environment_catalog_digest TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  rng_version TEXT NOT NULL,
  state_version BIGINT NOT NULL CHECK (state_version >= 0),
  idempotency_key TEXT NOT NULL,
  PRIMARY KEY (party_id, journey_id),
  UNIQUE (party_id, idempotency_key),
  CHECK ((status IN ('active','interrupted','camped','blocked')) = (current_leg_id IS NOT NULL)),
  CHECK ((mode = 'route' AND intended_direction IS NULL) OR (mode = 'course' AND intended_direction IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS party_one_open_journey_per_actor
  ON party_runtime.party_journeys (party_id, actor_id)
  WHERE status IN ('active','interrupted','camped');

CREATE TABLE IF NOT EXISTS party_runtime.party_journey_legs (
  party_id TEXT NOT NULL,
  journey_id TEXT NOT NULL,
  leg_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  edge_id TEXT NOT NULL,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','completed','interrupted','blocked','superseded')),
  base_gu NUMERIC,
  base_time_minutes INTEGER NOT NULL CHECK (base_time_minutes > 0),
  route_profile_id TEXT NOT NULL,
  progress_permille INTEGER NOT NULL CHECK (progress_permille BETWEEN 0 AND 1000),
  elapsed_minutes INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_minutes >= 0),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  interruption_id TEXT,
  PRIMARY KEY (party_id, journey_id, leg_id),
  UNIQUE (party_id, journey_id, sequence),
  FOREIGN KEY (party_id, journey_id) REFERENCES party_runtime.party_journeys(party_id, journey_id) ON DELETE CASCADE,
  CHECK ((status = 'completed') = (progress_permille = 1000)),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

ALTER TABLE party_runtime.party_journeys
  DROP CONSTRAINT IF EXISTS party_journeys_current_leg_fk;
ALTER TABLE party_runtime.party_journeys
  ADD CONSTRAINT party_journeys_current_leg_fk
  FOREIGN KEY (party_id, journey_id, current_leg_id)
  REFERENCES party_runtime.party_journey_legs(party_id, journey_id, leg_id)
  ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE party_runtime.party_positions
  ADD COLUMN IF NOT EXISTS position_kind TEXT NOT NULL DEFAULT 'node',
  ADD COLUMN IF NOT EXISTS journey_id TEXT,
  ADD COLUMN IF NOT EXISTS journey_leg_id TEXT,
  ADD COLUMN IF NOT EXISTS edge_id TEXT,
  ADD COLUMN IF NOT EXISTS from_g4_id TEXT,
  ADD COLUMN IF NOT EXISTS to_g4_id TEXT,
  ADD COLUMN IF NOT EXISTS progress_permille INTEGER,
  ADD COLUMN IF NOT EXISTS last_confirmed_g4_id TEXT,
  ADD COLUMN IF NOT EXISTS last_route_id TEXT;
ALTER TABLE party_runtime.party_positions
  ALTER COLUMN g4_id DROP NOT NULL;
ALTER TABLE party_runtime.party_positions
  DROP CONSTRAINT IF EXISTS party_positions_travel_union_check;
ALTER TABLE party_runtime.party_positions
  ADD CONSTRAINT party_positions_travel_union_check CHECK (
    (position_kind = 'node'
      AND g4_id IS NOT NULL
      AND journey_id IS NULL AND journey_leg_id IS NULL AND edge_id IS NULL
      AND from_g4_id IS NULL AND to_g4_id IS NULL AND progress_permille IS NULL AND last_confirmed_g4_id IS NULL)
    OR
    (position_kind = 'edge_progress'
      AND g4_id IS NULL AND g5_node_id IS NULL AND g5_anchor_id IS NULL
      AND journey_id IS NOT NULL AND journey_leg_id IS NOT NULL AND edge_id IS NOT NULL
      AND from_g4_id IS NOT NULL AND to_g4_id IS NOT NULL
      AND progress_permille BETWEEN 0 AND 1000 AND last_confirmed_g4_id IS NOT NULL)
  );
ALTER TABLE party_runtime.party_positions
  DROP CONSTRAINT IF EXISTS party_positions_journey_fk;
ALTER TABLE party_runtime.party_positions
  ADD CONSTRAINT party_positions_journey_fk
  FOREIGN KEY (party_id, journey_id)
  REFERENCES party_runtime.party_journeys(party_id, journey_id)
  ON DELETE RESTRICT;
ALTER TABLE party_runtime.party_positions
  DROP CONSTRAINT IF EXISTS party_positions_journey_leg_fk;
ALTER TABLE party_runtime.party_positions
  ADD CONSTRAINT party_positions_journey_leg_fk
  FOREIGN KEY (party_id, journey_id, journey_leg_id)
  REFERENCES party_runtime.party_journey_legs(party_id, journey_id, leg_id)
  ON DELETE RESTRICT;
