-- Temporal World v4 target-only persistence amendment. It is not part of the
-- production-v2 migration composition before P28.

CREATE OR REPLACE FUNCTION party_runtime.game_timestamp_parts_valid(
  whole_minutes numeric,
  subminute_numerator numeric,
  subminute_denominator numeric
) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    whole_minutes IS NOT NULL
    AND subminute_numerator IS NOT NULL
    AND subminute_denominator IS NOT NULL
    AND party_runtime.integral_numeric(whole_minutes)
    AND whole_minutes >= 0
    AND party_runtime.integral_numeric(subminute_numerator)
    AND subminute_numerator >= 0
    AND party_runtime.integral_numeric(subminute_denominator)
    AND subminute_denominator > 0
    AND subminute_numerator < subminute_denominator
    AND gcd(subminute_numerator,subminute_denominator)=1,
    false
  )
$$;

ALTER TABLE party_runtime.party_timed_activity_executions
  ADD COLUMN IF NOT EXISTS started_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS last_processed_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS last_processed_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS last_processed_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS next_boundary_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS next_boundary_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS next_boundary_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS progress jsonb,
  ADD COLUMN IF NOT EXISTS preconditions_digest text,
  ADD COLUMN IF NOT EXISTS terminal_reason_code text;
ALTER TABLE party_runtime.party_timed_activity_executions
  DROP CONSTRAINT IF EXISTS party_activity_active_boundary_valid;
ALTER TABLE party_runtime.party_timed_activity_executions
  ADD CONSTRAINT party_activity_active_boundary_valid CHECK (
    (status = 'active') = (next_boundary_at_whole_minutes IS NOT NULL AND next_boundary_at_subminute_numerator IS NOT NULL AND next_boundary_at_subminute_denominator IS NOT NULL)
    AND party_runtime.game_timestamp_parts_valid(started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator)
    AND party_runtime.game_timestamp_parts_valid(last_processed_at_whole_minutes,last_processed_at_subminute_numerator,last_processed_at_subminute_denominator)
    AND (
      (next_boundary_at_whole_minutes IS NULL AND next_boundary_at_subminute_numerator IS NULL AND next_boundary_at_subminute_denominator IS NULL)
      OR party_runtime.game_timestamp_parts_valid(next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator)
    )
  );

ALTER TABLE party_runtime.party_timed_activity_attempts
  ADD COLUMN IF NOT EXISTS started_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS started_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS ended_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS ended_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS ended_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS failure_class text,
  ADD COLUMN IF NOT EXISTS progress_before jsonb,
  ADD COLUMN IF NOT EXISTS progress_after jsonb,
  ADD COLUMN IF NOT EXISTS resource_reservations jsonb,
  ADD COLUMN IF NOT EXISTS resource_consumptions jsonb,
  ADD COLUMN IF NOT EXISTS body_effect_refs jsonb,
  ADD COLUMN IF NOT EXISTS participant_attendance jsonb,
  ADD COLUMN IF NOT EXISTS rule_and_policy_pins jsonb,
  ADD COLUMN IF NOT EXISTS trace jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE party_runtime.party_timed_activity_attempts
  DROP CONSTRAINT IF EXISTS party_activity_attempt_timestamp_valid;
ALTER TABLE party_runtime.party_timed_activity_attempts
  ADD CONSTRAINT party_activity_attempt_timestamp_valid CHECK (
    party_runtime.game_timestamp_parts_valid(started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator)
    AND party_runtime.game_timestamp_parts_valid(ended_at_whole_minutes,ended_at_subminute_numerator,ended_at_subminute_denominator)
    AND progress_before IS NOT NULL
    AND progress_after IS NOT NULL
    AND resource_reservations IS NOT NULL
    AND resource_consumptions IS NOT NULL
    AND body_effect_refs IS NOT NULL
    AND participant_attendance IS NOT NULL
    AND rule_and_policy_pins IS NOT NULL
  );

ALTER TABLE party_runtime.party_npc_spatial_schedules
  ADD COLUMN IF NOT EXISTS next_transition_at_whole_minutes numeric,
  ADD COLUMN IF NOT EXISTS next_transition_at_subminute_numerator numeric,
  ADD COLUMN IF NOT EXISTS next_transition_at_subminute_denominator numeric,
  ADD COLUMN IF NOT EXISTS current_activity_execution_id text REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS attention_state_ref jsonb,
  ADD COLUMN IF NOT EXISTS body_state_ref jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_state_ref jsonb,
  ADD COLUMN IF NOT EXISTS relationship_state_ref jsonb;
ALTER TABLE party_runtime.party_npc_spatial_schedules
  DROP CONSTRAINT IF EXISTS party_npc_exact_schedule_boundary_valid;
ALTER TABLE party_runtime.party_npc_spatial_schedules
  ADD CONSTRAINT party_npc_exact_schedule_boundary_valid CHECK (
    state_version >= 1
    AND (status='active') = (
      next_transition_at_whole_minutes IS NOT NULL
      AND next_transition_at_subminute_numerator IS NOT NULL
      AND next_transition_at_subminute_denominator IS NOT NULL
    )
    AND (
      (next_transition_at_whole_minutes IS NULL AND next_transition_at_subminute_numerator IS NULL AND next_transition_at_subminute_denominator IS NULL)
      OR party_runtime.game_timestamp_parts_valid(next_transition_at_whole_minutes,next_transition_at_subminute_numerator,next_transition_at_subminute_denominator)
    )
  );

CREATE TABLE IF NOT EXISTS party_runtime.party_activity_participant_bindings (
  activity_execution_id text NOT NULL REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT,
  participant_kind text NOT NULL, participant_id text NOT NULL, role_id text NOT NULL,
  required boolean NOT NULL DEFAULT false, status text NOT NULL CHECK(status IN ('active','left','removed')),
  bound_change_set_id text NOT NULL, terminal_change_set_id text,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  PRIMARY KEY(activity_execution_id,participant_kind,participant_id),
  CHECK((status='active') = (terminal_change_set_id IS NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.party_activity_resource_bindings (
  activity_execution_id text NOT NULL REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT,
  resource_kind text NOT NULL, resource_id text NOT NULL, binding_kind text NOT NULL CHECK(binding_kind IN ('reserved','consumed')),
  quantity_numerator numeric NOT NULL CHECK(quantity_numerator >= 0 AND party_runtime.integral_numeric(quantity_numerator)),
  quantity_denominator numeric NOT NULL CHECK(quantity_denominator > 0 AND party_runtime.integral_numeric(quantity_denominator) AND gcd(quantity_numerator,quantity_denominator)=1),
  change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  PRIMARY KEY(activity_execution_id,resource_kind,resource_id,binding_kind,change_set_id),
  UNIQUE(activity_execution_id,resource_kind,resource_id,idempotency_record_id)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_temporal_events (
  event_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  event_kind text NOT NULL, status text NOT NULL CHECK(status IN ('pending','resolved','cancelled','blocked')),
  scheduled_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(scheduled_at_whole_minutes)),
  scheduled_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(scheduled_at_subminute_numerator) AND scheduled_at_subminute_numerator >= 0),
  scheduled_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(scheduled_at_subminute_denominator) AND scheduled_at_subminute_denominator > 0),
  rule_ref jsonb NOT NULL, policy_ref jsonb NOT NULL, preconditions_digest text NOT NULL,
  idempotency_key text NOT NULL, change_set_id text NOT NULL, terminal_change_set_id text,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  CHECK(party_runtime.game_timestamp_parts_valid(scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator)),
  UNIQUE(party_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_temporal_event_subjects (
  event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE CASCADE,
  subject_kind text NOT NULL, subject_id text NOT NULL, subject_role text NOT NULL,
  PRIMARY KEY(event_id,subject_kind,subject_id,subject_role)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_temporal_event_dependencies (
  event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE CASCADE,
  depends_on_event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE RESTRICT,
  PRIMARY KEY(event_id,depends_on_event_id), CHECK(event_id <> depends_on_event_id)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_npc_runtime_transitions (
  transition_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL, transition_kind text NOT NULL, event_id text REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE RESTRICT,
  change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_whole_minutes)),
  occurred_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_numerator) AND occurred_at_subminute_numerator >= 0),
  occurred_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_denominator) AND occurred_at_subminute_denominator > 0),
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(party_runtime.game_timestamp_parts_valid(occurred_at_whole_minutes,occurred_at_subminute_numerator,occurred_at_subminute_denominator)), UNIQUE(party_id,idempotency_record_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_perception_records (
  perception_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES party_runtime.party_temporal_events(event_id) ON DELETE RESTRICT,
  perceiver_kind text NOT NULL, perceiver_id text NOT NULL, result_kind text NOT NULL CHECK(result_kind IN ('perceived','misinterpreted','unperceived')),
  perceived_at_whole_minutes numeric NOT NULL,
  perceived_at_subminute_numerator numeric NOT NULL,
  perceived_at_subminute_denominator numeric NOT NULL,
  recognition_policy_ref jsonb NOT NULL, visibility_policy_ref jsonb NOT NULL,
  canonical_digest text NOT NULL, signal_refs jsonb NOT NULL, knowledge_update_refs jsonb NOT NULL,
  change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  CHECK(party_runtime.game_timestamp_parts_valid(perceived_at_whole_minutes,perceived_at_subminute_numerator,perceived_at_subminute_denominator)),
  UNIQUE(party_id,idempotency_record_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_perception_witnesses (
  perception_id text NOT NULL REFERENCES party_runtime.party_perception_records(perception_id) ON DELETE CASCADE,
  witness_kind text NOT NULL, witness_id text NOT NULL, PRIMARY KEY(perception_id,witness_kind,witness_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_npc_decision_traces (
  request_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  npc_id text NOT NULL, state_version bigint NOT NULL CHECK(state_version >= 1), option_id text NOT NULL, command_token text NOT NULL,
  options_digest text NOT NULL, status text NOT NULL CHECK(status IN ('validated','committed','cancelled')),
  validated_at_whole_minutes numeric NOT NULL,
  validated_at_subminute_numerator numeric NOT NULL,
  validated_at_subminute_denominator numeric NOT NULL,
  idempotency_key text NOT NULL, change_set_id text, trace_digest text NOT NULL,
  CHECK(party_runtime.game_timestamp_parts_valid(validated_at_whole_minutes,validated_at_subminute_numerator,validated_at_subminute_denominator)),
  UNIQUE(party_id,idempotency_key), UNIQUE(party_id,npc_id,options_digest)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_body_temporal_history (
  history_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  subject_kind text NOT NULL, subject_id text NOT NULL, effect_ref jsonb NOT NULL, change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  occurred_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_whole_minutes)),
  occurred_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_numerator) AND occurred_at_subminute_numerator >= 0),
  occurred_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(occurred_at_subminute_denominator) AND occurred_at_subminute_denominator > 0),
  CHECK(party_runtime.game_timestamp_parts_valid(occurred_at_whole_minutes,occurred_at_subminute_numerator,occurred_at_subminute_denominator)), UNIQUE(party_id,idempotency_record_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_remote_aggregate_states (
  aggregate_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  scope_ref jsonb NOT NULL, scope_mode text NOT NULL, last_updated_at_whole_minutes numeric NOT NULL CHECK(party_runtime.integral_numeric(last_updated_at_whole_minutes)),
  last_updated_at_subminute_numerator numeric NOT NULL CHECK(party_runtime.integral_numeric(last_updated_at_subminute_numerator) AND last_updated_at_subminute_numerator >= 0),
  last_updated_at_subminute_denominator numeric NOT NULL CHECK(party_runtime.integral_numeric(last_updated_at_subminute_denominator) AND last_updated_at_subminute_denominator > 0),
  next_boundary_at_whole_minutes numeric, next_boundary_at_subminute_numerator numeric, next_boundary_at_subminute_denominator numeric,
  state_version bigint NOT NULL CHECK(state_version >= 1), canonical_digest text NOT NULL,
  aggregate_process_refs jsonb NOT NULL, pending_incoming_effect_refs jsonb NOT NULL, coarse_rule_versions jsonb NOT NULL,
  CHECK(party_runtime.game_timestamp_parts_valid(last_updated_at_whole_minutes,last_updated_at_subminute_numerator,last_updated_at_subminute_denominator)),
  CHECK(
    (next_boundary_at_whole_minutes IS NULL AND next_boundary_at_subminute_numerator IS NULL AND next_boundary_at_subminute_denominator IS NULL)
    OR party_runtime.game_timestamp_parts_valid(next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator)
  )
);
CREATE TABLE IF NOT EXISTS party_runtime.party_propagation_processes (
  process_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  aggregate_id text REFERENCES party_runtime.party_remote_aggregate_states(aggregate_id) ON DELETE RESTRICT,
  process_kind text NOT NULL, source_ref jsonb NOT NULL, causal_basis_ref jsonb NOT NULL, scope_ref jsonb NOT NULL, path_ref jsonb,
  status text NOT NULL CHECK(status IN ('pending','active','completed','terminated')),
  started_at_whole_minutes numeric NOT NULL, started_at_subminute_numerator numeric NOT NULL, started_at_subminute_denominator numeric NOT NULL,
  next_boundary_at_whole_minutes numeric, next_boundary_at_subminute_numerator numeric, next_boundary_at_subminute_denominator numeric,
  visibility_policy_ref jsonb NOT NULL, termination_policy_ref jsonb NOT NULL,
  rule_pins jsonb NOT NULL, idempotency_key text NOT NULL, state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  UNIQUE(party_id,idempotency_key),
  CHECK(party_runtime.game_timestamp_parts_valid(started_at_whole_minutes,started_at_subminute_numerator,started_at_subminute_denominator)),
  CHECK(
    (status IN ('pending','active')) = (
      next_boundary_at_whole_minutes IS NOT NULL
      AND next_boundary_at_subminute_numerator IS NOT NULL
      AND next_boundary_at_subminute_denominator IS NOT NULL
    )
  ),
  CHECK(
    (next_boundary_at_whole_minutes IS NULL AND next_boundary_at_subminute_numerator IS NULL AND next_boundary_at_subminute_denominator IS NULL)
    OR party_runtime.game_timestamp_parts_valid(next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator)
  )
);

CREATE TABLE IF NOT EXISTS party_runtime.party_visible_packages (
  package_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  turn_id text NOT NULL, committed_state_version bigint NOT NULL CHECK(committed_state_version >= 1), change_set_id text NOT NULL,
  package_digest text NOT NULL, visible_payload jsonb NOT NULL,
  presentation_status text NOT NULL CHECK(presentation_status IN ('pending')),
  projection_policy_ref jsonb NOT NULL, dependency_pins jsonb NOT NULL, idempotency_record_id text NOT NULL,
  UNIQUE(party_id,idempotency_record_id), UNIQUE(party_id,change_set_id)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_narration_jobs (
  job_id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  package_id text NOT NULL REFERENCES party_runtime.party_visible_packages(package_id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('pending','in_progress','output_ready','delivered','failed_retryable')),
  idempotency_key text NOT NULL, next_attempt_ordinal integer NOT NULL DEFAULT 0 CHECK(next_attempt_ordinal >= 0),
  active_attempt_id text, claim_token text, lease_expires_at timestamptz,
  narration_output jsonb, output_digest text, state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  UNIQUE(party_id,idempotency_key), UNIQUE(package_id),
  CHECK(
    (status IN ('pending','failed_retryable') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NULL AND output_digest IS NULL)
    OR (status='in_progress' AND active_attempt_id IS NOT NULL AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL AND narration_output IS NULL AND output_digest IS NULL)
    OR (status IN ('output_ready','delivered') AND active_attempt_id IS NULL AND claim_token IS NULL AND lease_expires_at IS NULL AND narration_output IS NOT NULL AND output_digest IS NOT NULL)
  )
);
CREATE TABLE IF NOT EXISTS party_runtime.party_narration_attempts (
  attempt_id text PRIMARY KEY, job_id text NOT NULL REFERENCES party_runtime.party_narration_jobs(job_id) ON DELETE RESTRICT,
  attempt_ordinal integer NOT NULL CHECK(attempt_ordinal >= 0), outcome text NOT NULL CHECK(outcome IN ('delivered','failed_retryable')),
  output_digest text, failure_code text, failure_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,attempt_ordinal),
  CHECK((outcome='delivered') = (output_digest IS NOT NULL)),
  CHECK((outcome='delivered') = (failure_code IS NULL))
);

-- Party-owned causal references are composite even though their primary ids are
-- globally unique. This prevents a valid id from silently crossing party state.
CREATE UNIQUE INDEX IF NOT EXISTS party_temporal_events_event_party_uq
  ON party_runtime.party_temporal_events(event_id,party_id);
CREATE UNIQUE INDEX IF NOT EXISTS party_remote_aggregate_states_aggregate_party_uq
  ON party_runtime.party_remote_aggregate_states(aggregate_id,party_id);
CREATE UNIQUE INDEX IF NOT EXISTS party_visible_packages_package_party_uq
  ON party_runtime.party_visible_packages(package_id,party_id);

ALTER TABLE party_runtime.party_npc_runtime_transitions
  DROP CONSTRAINT IF EXISTS party_npc_runtime_transitions_event_id_fkey;
ALTER TABLE party_runtime.party_npc_runtime_transitions
  DROP CONSTRAINT IF EXISTS party_npc_transition_event_party_fk;
ALTER TABLE party_runtime.party_npc_runtime_transitions
  ADD CONSTRAINT party_npc_transition_event_party_fk
  FOREIGN KEY(event_id,party_id) REFERENCES party_runtime.party_temporal_events(event_id,party_id) ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_perception_records
  DROP CONSTRAINT IF EXISTS party_perception_records_event_id_fkey;
ALTER TABLE party_runtime.party_perception_records
  DROP CONSTRAINT IF EXISTS party_perception_event_party_fk;
ALTER TABLE party_runtime.party_perception_records
  ADD CONSTRAINT party_perception_event_party_fk
  FOREIGN KEY(event_id,party_id) REFERENCES party_runtime.party_temporal_events(event_id,party_id) ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_propagation_processes
  DROP CONSTRAINT IF EXISTS party_propagation_processes_aggregate_id_fkey;
ALTER TABLE party_runtime.party_propagation_processes
  DROP CONSTRAINT IF EXISTS party_propagation_aggregate_party_fk;
ALTER TABLE party_runtime.party_propagation_processes
  ADD CONSTRAINT party_propagation_aggregate_party_fk
  FOREIGN KEY(aggregate_id,party_id) REFERENCES party_runtime.party_remote_aggregate_states(aggregate_id,party_id) ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_narration_jobs
  DROP CONSTRAINT IF EXISTS party_narration_jobs_package_id_fkey;
ALTER TABLE party_runtime.party_narration_jobs
  DROP CONSTRAINT IF EXISTS party_narration_package_party_fk;
ALTER TABLE party_runtime.party_narration_jobs
  ADD CONSTRAINT party_narration_package_party_fk
  FOREIGN KEY(package_id,party_id) REFERENCES party_runtime.party_visible_packages(package_id,party_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION party_runtime.temporal_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'temporal history is append-only'; END $$;
CREATE OR REPLACE FUNCTION party_runtime.activity_execution_temporal_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NEW.state_version<>1 OR NEW.next_attempt_ordinal<>0 OR NEW.terminal_change_set_id IS NOT NULL THEN
      RAISE EXCEPTION 'activity execution initial state is invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.id<>OLD.id OR NEW.route_plan_execution_id<>OLD.route_plan_execution_id
    OR NEW.plan_step_ordinal<>OLD.plan_step_ordinal OR NEW.series_ordinal<>OLD.series_ordinal
    OR NEW.predecessor_activity_execution_id IS DISTINCT FROM OLD.predecessor_activity_execution_id
    OR NEW.activity_snapshot<>OLD.activity_snapshot
    OR NEW.started_at_whole_minutes<>OLD.started_at_whole_minutes
    OR NEW.started_at_subminute_numerator<>OLD.started_at_subminute_numerator
    OR NEW.started_at_subminute_denominator<>OLD.started_at_subminute_denominator THEN
    RAISE EXCEPTION 'activity execution identity, static snapshot or state version changed';
  END IF;
  IF NOT (
    (OLD.status='active' AND NEW.status IN ('active','paused','completed','failed','aborted'))
    OR (OLD.status='paused' AND NEW.status IN ('active','aborted'))
  ) THEN RAISE EXCEPTION 'activity execution lifecycle transition is invalid'; END IF;
  IF NEW.next_attempt_ordinal<OLD.next_attempt_ordinal THEN RAISE EXCEPTION 'activity attempt cursor cannot decrease'; END IF;
  IF OLD.last_processed_at_whole_minutes IS NOT NULL AND (NEW.last_processed_at_whole_minutes < OLD.last_processed_at_whole_minutes OR (NEW.last_processed_at_whole_minutes = OLD.last_processed_at_whole_minutes AND NEW.last_processed_at_subminute_numerator * OLD.last_processed_at_subminute_denominator < OLD.last_processed_at_subminute_numerator * NEW.last_processed_at_subminute_denominator)) THEN
    RAISE EXCEPTION 'activity last_processed_at must be monotonic';
  END IF;
  IF NEW.cumulative_elapsed_numerator*OLD.cumulative_elapsed_denominator < OLD.cumulative_elapsed_numerator*NEW.cumulative_elapsed_denominator THEN
    RAISE EXCEPTION 'activity elapsed time cannot decrease';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.activity_attempt_ordinal_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  execution_id_value text;
  execution_row party_runtime.party_timed_activity_executions%ROWTYPE;
  latest_attempt party_runtime.party_timed_activity_attempts%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME='party_timed_activity_executions' THEN
    execution_id_value:=NEW.id;
  ELSE
    execution_id_value:=NEW.activity_execution_id;
  END IF;
  SELECT * INTO execution_row FROM party_runtime.party_timed_activity_executions WHERE id=execution_id_value;
  IF execution_row.id IS NULL OR execution_row.next_attempt_ordinal<>(SELECT count(*) FROM party_runtime.party_timed_activity_attempts a WHERE a.activity_execution_id=execution_id_value) THEN
    RAISE EXCEPTION 'activity attempt ordinal/cursor mismatch';
  END IF;
  SELECT * INTO latest_attempt FROM party_runtime.party_timed_activity_attempts WHERE activity_execution_id=execution_id_value ORDER BY attempt_ordinal DESC LIMIT 1;
  IF latest_attempt.activity_execution_id IS NOT NULL AND (
    execution_row.last_processed_at_whole_minutes<>latest_attempt.ended_at_whole_minutes
    OR execution_row.last_processed_at_subminute_numerator<>latest_attempt.ended_at_subminute_numerator
    OR execution_row.last_processed_at_subminute_denominator<>latest_attempt.ended_at_subminute_denominator
  ) THEN RAISE EXCEPTION 'activity last_processed_at does not match the latest attempt'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_activity_participant_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NEW.state_version<>1 OR NEW.terminal_change_set_id IS NOT NULL THEN RAISE EXCEPTION 'activity participant must be created active'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'active' OR NEW.status NOT IN ('left','removed') OR NEW.state_version<>OLD.state_version+1 OR NEW.terminal_change_set_id IS NULL THEN
    RAISE EXCEPTION 'activity participant lifecycle transition is invalid';
  END IF;
  IF NEW.activity_execution_id<>OLD.activity_execution_id OR NEW.participant_kind<>OLD.participant_kind OR NEW.participant_id<>OLD.participant_id OR NEW.role_id<>OLD.role_id OR NEW.required<>OLD.required OR NEW.bound_change_set_id<>OLD.bound_change_set_id THEN
    RAISE EXCEPTION 'activity participant identity and binding are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state_version<1 THEN RAISE EXCEPTION 'npc schedule state version is invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.id<>OLD.id OR NEW.party_id<>OLD.party_id OR NEW.npc_id<>OLD.npc_id
    OR NEW.schedule_profile_ref<>OLD.schedule_profile_ref OR NEW.dependency_pins<>OLD.dependency_pins THEN
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
CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_party_reference_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM party_runtime.scene_position_nodes position
    WHERE position.id=NEW.current_position_node_id AND position.party_id=NEW.party_id
  ) THEN RAISE EXCEPTION 'npc schedule position belongs to another party'; END IF;
  IF NEW.current_activity_execution_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM party_runtime.party_timed_activity_executions activity
    JOIN party_runtime.party_route_plan_executions execution ON execution.id=activity.route_plan_execution_id
    WHERE activity.id=NEW.current_activity_execution_id AND execution.party_id=NEW.party_id
  ) THEN RAISE EXCEPTION 'npc schedule activity belongs to another party'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.temporal_event_dependency_acyclic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (WITH RECURSIVE walk(event_id,depends_on_event_id,path,cycle) AS (SELECT event_id,depends_on_event_id,ARRAY[event_id,depends_on_event_id],false FROM party_runtime.party_temporal_event_dependencies UNION ALL SELECT d.event_id,d.depends_on_event_id,w.path || d.depends_on_event_id,d.depends_on_event_id=ANY(w.path) FROM walk w JOIN party_runtime.party_temporal_event_dependencies d ON d.event_id=w.depends_on_event_id WHERE NOT w.cycle) SELECT 1 FROM walk WHERE cycle) THEN RAISE EXCEPTION 'temporal event dependency cycle'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.temporal_event_dependency_same_party() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM party_runtime.party_temporal_events event
    JOIN party_runtime.party_temporal_events dependency
      ON dependency.event_id=NEW.depends_on_event_id
    WHERE event.event_id=NEW.event_id AND event.party_id=dependency.party_id
  ) THEN RAISE EXCEPTION 'temporal event dependency crosses party state'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_temporal_event_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'pending' OR NEW.state_version<>1 OR NEW.terminal_change_set_id IS NOT NULL THEN RAISE EXCEPTION 'temporal event must be created pending'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status<>'pending' OR NEW.status NOT IN ('resolved','cancelled','blocked') OR NEW.state_version<>OLD.state_version+1 OR NEW.terminal_change_set_id IS NULL THEN
    RAISE EXCEPTION 'temporal event lifecycle transition is invalid';
  END IF;
  IF NEW.event_id<>OLD.event_id OR NEW.party_id<>OLD.party_id OR NEW.event_kind<>OLD.event_kind
    OR NEW.scheduled_at_whole_minutes<>OLD.scheduled_at_whole_minutes
    OR NEW.scheduled_at_subminute_numerator<>OLD.scheduled_at_subminute_numerator
    OR NEW.scheduled_at_subminute_denominator<>OLD.scheduled_at_subminute_denominator
    OR NEW.rule_ref<>OLD.rule_ref OR NEW.policy_ref<>OLD.policy_ref
    OR NEW.preconditions_digest<>OLD.preconditions_digest OR NEW.idempotency_key<>OLD.idempotency_key
    OR NEW.change_set_id<>OLD.change_set_id THEN
    RAISE EXCEPTION 'temporal event causal input is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_remote_aggregate_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state_version<>1 THEN RAISE EXCEPTION 'remote aggregate must start at state version one'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.aggregate_id<>OLD.aggregate_id OR NEW.party_id<>OLD.party_id
    OR NEW.scope_ref<>OLD.scope_ref OR NEW.scope_mode<>OLD.scope_mode THEN
    RAISE EXCEPTION 'remote aggregate lifecycle transition is invalid';
  END IF;
  IF NEW.last_updated_at_whole_minutes<OLD.last_updated_at_whole_minutes
    OR (NEW.last_updated_at_whole_minutes=OLD.last_updated_at_whole_minutes
      AND NEW.last_updated_at_subminute_numerator*OLD.last_updated_at_subminute_denominator
        < OLD.last_updated_at_subminute_numerator*NEW.last_updated_at_subminute_denominator) THEN
    RAISE EXCEPTION 'remote aggregate time must be monotonic';
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_propagation_process_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status NOT IN ('pending','active') OR NEW.state_version<>1 THEN RAISE EXCEPTION 'propagation process initial state is invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.process_id<>OLD.process_id OR NEW.party_id<>OLD.party_id
    OR NEW.process_kind<>OLD.process_kind OR NEW.source_ref<>OLD.source_ref
    OR NEW.causal_basis_ref<>OLD.causal_basis_ref OR NEW.scope_ref<>OLD.scope_ref
    OR NEW.path_ref IS DISTINCT FROM OLD.path_ref OR NEW.rule_pins<>OLD.rule_pins
    OR NEW.started_at_whole_minutes<>OLD.started_at_whole_minutes
    OR NEW.started_at_subminute_numerator<>OLD.started_at_subminute_numerator
    OR NEW.started_at_subminute_denominator<>OLD.started_at_subminute_denominator
    OR NEW.visibility_policy_ref<>OLD.visibility_policy_ref
    OR NEW.termination_policy_ref<>OLD.termination_policy_ref
    OR NEW.idempotency_key<>OLD.idempotency_key THEN
    RAISE EXCEPTION 'propagation process identity or pins changed';
  END IF;
  IF NOT (
    (OLD.status='pending' AND NEW.status IN ('active','terminated'))
    OR (OLD.status='active' AND NEW.status IN ('active','completed','terminated'))
  ) THEN RAISE EXCEPTION 'propagation process lifecycle transition is invalid'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.party_narration_job_lifecycle_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state_version <> OLD.state_version + 1 THEN RAISE EXCEPTION 'narration job state version must advance by one'; END IF;
  IF NOT (
    (OLD.status IN ('pending','failed_retryable') AND NEW.status='in_progress')
    OR (OLD.status='in_progress' AND NEW.status IN ('output_ready','failed_retryable'))
    OR (OLD.status='output_ready' AND NEW.status='delivered')
  ) THEN RAISE EXCEPTION 'narration job lifecycle transition is invalid'; END IF;
  IF NEW.job_id<>OLD.job_id OR NEW.party_id<>OLD.party_id OR NEW.package_id<>OLD.package_id OR NEW.idempotency_key<>OLD.idempotency_key THEN
    RAISE EXCEPTION 'narration job identity is immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS party_activity_attempt_ordinal_valid ON party_runtime.party_timed_activity_attempts;
CREATE CONSTRAINT TRIGGER party_activity_attempt_ordinal_valid AFTER INSERT OR UPDATE ON party_runtime.party_timed_activity_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.activity_attempt_ordinal_valid();
DROP TRIGGER IF EXISTS party_activity_execution_attempt_ordinal_valid ON party_runtime.party_timed_activity_executions;
CREATE CONSTRAINT TRIGGER party_activity_execution_attempt_ordinal_valid AFTER INSERT OR UPDATE ON party_runtime.party_timed_activity_executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.activity_attempt_ordinal_valid();
DROP TRIGGER IF EXISTS party_activity_execution_temporal_valid ON party_runtime.party_timed_activity_executions;
CREATE TRIGGER party_activity_execution_temporal_valid BEFORE INSERT OR UPDATE ON party_runtime.party_timed_activity_executions FOR EACH ROW EXECUTE FUNCTION party_runtime.activity_execution_temporal_valid();
DROP TRIGGER IF EXISTS party_activity_participant_lifecycle_valid ON party_runtime.party_activity_participant_bindings;
CREATE TRIGGER party_activity_participant_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_activity_participant_bindings FOR EACH ROW EXECUTE FUNCTION party_runtime.party_activity_participant_lifecycle_valid();
DROP TRIGGER IF EXISTS party_npc_schedule_lifecycle_valid ON party_runtime.party_npc_spatial_schedules;
CREATE TRIGGER party_npc_schedule_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_npc_spatial_schedules FOR EACH ROW EXECUTE FUNCTION party_runtime.party_npc_schedule_lifecycle_valid();
DROP TRIGGER IF EXISTS party_npc_schedule_party_reference_valid ON party_runtime.party_npc_spatial_schedules;
CREATE TRIGGER party_npc_schedule_party_reference_valid BEFORE INSERT OR UPDATE ON party_runtime.party_npc_spatial_schedules FOR EACH ROW EXECUTE FUNCTION party_runtime.party_npc_schedule_party_reference_valid();
DROP TRIGGER IF EXISTS temporal_event_dependency_same_party ON party_runtime.party_temporal_event_dependencies;
CREATE TRIGGER temporal_event_dependency_same_party BEFORE INSERT OR UPDATE ON party_runtime.party_temporal_event_dependencies FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_event_dependency_same_party();
DROP TRIGGER IF EXISTS party_temporal_event_dependency_acyclic ON party_runtime.party_temporal_event_dependencies;
CREATE CONSTRAINT TRIGGER party_temporal_event_dependency_acyclic AFTER INSERT OR UPDATE ON party_runtime.party_temporal_event_dependencies DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_event_dependency_acyclic();
DROP TRIGGER IF EXISTS party_temporal_event_lifecycle_valid ON party_runtime.party_temporal_events;
CREATE TRIGGER party_temporal_event_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_temporal_events FOR EACH ROW EXECUTE FUNCTION party_runtime.party_temporal_event_lifecycle_valid();
DROP TRIGGER IF EXISTS party_remote_aggregate_lifecycle_valid ON party_runtime.party_remote_aggregate_states;
CREATE TRIGGER party_remote_aggregate_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_remote_aggregate_states FOR EACH ROW EXECUTE FUNCTION party_runtime.party_remote_aggregate_lifecycle_valid();
DROP TRIGGER IF EXISTS party_propagation_process_lifecycle_valid ON party_runtime.party_propagation_processes;
CREATE TRIGGER party_propagation_process_lifecycle_valid BEFORE INSERT OR UPDATE ON party_runtime.party_propagation_processes FOR EACH ROW EXECUTE FUNCTION party_runtime.party_propagation_process_lifecycle_valid();
DROP TRIGGER IF EXISTS party_narration_job_lifecycle_valid ON party_runtime.party_narration_jobs;
CREATE TRIGGER party_narration_job_lifecycle_valid BEFORE UPDATE ON party_runtime.party_narration_jobs FOR EACH ROW EXECUTE FUNCTION party_runtime.party_narration_job_lifecycle_valid();

CREATE INDEX IF NOT EXISTS party_temporal_events_due_idx ON party_runtime.party_temporal_events(party_id,scheduled_at_whole_minutes,scheduled_at_subminute_numerator,scheduled_at_subminute_denominator) WHERE status='pending';
CREATE INDEX IF NOT EXISTS party_propagation_processes_due_idx ON party_runtime.party_propagation_processes(party_id,next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator) WHERE status IN ('pending','active');
CREATE INDEX IF NOT EXISTS party_activity_executions_due_idx ON party_runtime.party_timed_activity_executions(route_plan_execution_id,next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,next_boundary_at_subminute_denominator) WHERE status='active';

DO $$
DECLARE relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['party_activity_resource_bindings','party_temporal_event_subjects','party_temporal_event_dependencies','party_npc_runtime_transitions','party_perception_records','party_perception_witnesses','party_npc_decision_traces','party_body_temporal_history','party_visible_packages','party_narration_attempts']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS temporal_append_only ON party_runtime.%I', relation_name);
    EXECUTE format('CREATE TRIGGER temporal_append_only BEFORE UPDATE OR DELETE ON party_runtime.%I FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only()', relation_name);
  END LOOP;
END $$;
