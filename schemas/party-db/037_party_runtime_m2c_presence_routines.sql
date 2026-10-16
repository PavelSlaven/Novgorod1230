-- CR #158 party DDL: candidate routine profiles, ordinary scope g5, weather log.
-- C1: candidate_profile_refs immutable; schedule_profile_ref trigger not weakened.
-- C2/C14: g5 CHECK with contracts enum; weather-only append-only log, PK without seq.

ALTER TABLE party_runtime.party_npc_spatial_schedules
  ADD COLUMN IF NOT EXISTS candidate_profile_refs JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE party_runtime.party_npc_spatial_schedules
  DROP CONSTRAINT IF EXISTS party_npc_spatial_schedules_candidate_profile_refs_is_array;
ALTER TABLE party_runtime.party_npc_spatial_schedules
  ADD CONSTRAINT party_npc_spatial_schedules_candidate_profile_refs_is_array
  CHECK (jsonb_typeof(candidate_profile_refs) = 'array');

CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state_version<1 THEN RAISE EXCEPTION 'npc schedule state version is invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.id<>OLD.id OR NEW.party_id<>OLD.party_id OR NEW.npc_id<>OLD.npc_id
    OR NEW.schedule_profile_ref<>OLD.schedule_profile_ref
    OR NEW.dependency_pins<>OLD.dependency_pins
    OR NEW.candidate_profile_refs<>OLD.candidate_profile_refs THEN
    RAISE EXCEPTION 'npc schedule identity, pins or state version changed';
  END IF;
  IF OLD.next_transition_at_whole_minutes IS NOT NULL AND NEW.next_transition_at_whole_minutes IS NOT NULL
    AND (
      NEW.next_transition_at_whole_minutes<OLD.next_transition_at_whole_minutes
      OR (NEW.next_transition_at_whole_minutes=OLD.next_transition_at_whole_minutes
        AND NEW.next_transition_at_subminute_numerator*OLD.next_transition_at_subminute_denominator
          < OLD.next_transition_at_subminute_numerator*NEW.next_transition_at_subminute_denominator)
    ) THEN RAISE EXCEPTION 'npc schedule transition time must be monotonic'; END IF;
  RETURN NEW;
END $$;

ALTER TABLE party_runtime.party_ordinary_materialization_aggregates
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_aggregates_scope_kind_check;
ALTER TABLE party_runtime.party_ordinary_materialization_aggregates
  ADD CONSTRAINT party_ordinary_materialization_aggregates_scope_kind_check
  CHECK (scope_kind IN ('g5', 'g6', 'scene_position', 'container', 'source'));

ALTER TABLE party_runtime.party_ordinary_materialization_contexts
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_contexts_scope_kind_check;
ALTER TABLE party_runtime.party_ordinary_materialization_contexts
  ADD CONSTRAINT party_ordinary_materialization_contexts_scope_kind_check
  CHECK (scope_kind IN ('g5', 'g6', 'scene_position', 'container', 'source'));

ALTER TABLE party_runtime.party_ordinary_materialization_commits
  DROP CONSTRAINT IF EXISTS party_ordinary_materialization_commits_scope_kind_check;
ALTER TABLE party_runtime.party_ordinary_materialization_commits
  ADD CONSTRAINT party_ordinary_materialization_commits_scope_kind_check
  CHECK (scope_kind IN ('g5', 'g6', 'scene_position', 'container', 'source'));

CREATE TABLE IF NOT EXISTS party_runtime.party_environment_transition_log (
  party_id TEXT NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  g0_zone_ref TEXT NOT NULL CHECK (length(btrim(g0_zone_ref)) > 0),
  interval_index_6h numeric NOT NULL
    CHECK (party_runtime.integral_numeric(interval_index_6h) AND interval_index_6h >= 0),
  recorded_at_whole_minutes numeric NOT NULL
    CHECK (party_runtime.integral_numeric(recorded_at_whole_minutes)),
  recorded_at_subminute_numerator numeric NOT NULL DEFAULT 0
    CHECK (party_runtime.integral_numeric(recorded_at_subminute_numerator)
      AND recorded_at_subminute_numerator >= 0),
  recorded_at_subminute_denominator numeric NOT NULL DEFAULT 1
    CHECK (party_runtime.integral_numeric(recorded_at_subminute_denominator)
      AND recorded_at_subminute_denominator > 0),
  transition_kind TEXT NOT NULL CHECK (transition_kind = 'weather'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (party_id, g0_zone_ref, interval_index_6h),
  CHECK (party_runtime.game_timestamp_parts_valid(
    recorded_at_whole_minutes,
    recorded_at_subminute_numerator,
    recorded_at_subminute_denominator
  ))
);

DROP TRIGGER IF EXISTS temporal_append_only
  ON party_runtime.party_environment_transition_log;
CREATE TRIGGER temporal_append_only
  BEFORE UPDATE OR DELETE ON party_runtime.party_environment_transition_log
  FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();
