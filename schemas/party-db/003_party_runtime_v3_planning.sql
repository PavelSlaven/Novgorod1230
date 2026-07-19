-- Target-only spatial v3 planning/execution persistence (P14).  This file is
-- deliberately absent from the production migration composition until P28.
CREATE SCHEMA IF NOT EXISTS party_runtime;

CREATE TABLE IF NOT EXISTS party_runtime.preparation_snapshots (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  planning_request_id text NOT NULL, planning_request_digest text NOT NULL,
  immutable_members_digest text NOT NULL, canonical_digest text NOT NULL,
  created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0), created_change_set_id text NOT NULL,
  UNIQUE(party_id, planning_request_id, planning_request_digest, immutable_members_digest)
);
CREATE TABLE IF NOT EXISTS party_runtime.preparation_snapshot_members (
  preparation_snapshot_id text NOT NULL REFERENCES party_runtime.preparation_snapshots(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK(ordinal >= 0), member_kind text NOT NULL CHECK(member_kind IN ('endpoint','transfer_scene')),
  source_authoring_ref jsonb NOT NULL, resolved_endpoint_snapshot jsonb,
  resolved_scene_baseline_id text REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,
  resolved_g6_instance_id text REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  resolved_position_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  dependency_pins jsonb NOT NULL, share_mode text NOT NULL CHECK(share_mode IN ('execution_exclusive','reusable')),
  member_digest text NOT NULL, PRIMARY KEY(preparation_snapshot_id, ordinal),
  CHECK ((member_kind='endpoint') = (resolved_endpoint_snapshot IS NOT NULL AND resolved_scene_baseline_id IS NULL AND resolved_g6_instance_id IS NULL AND resolved_position_id IS NULL)),
  CHECK ((member_kind='transfer_scene') = (resolved_endpoint_snapshot IS NULL AND resolved_scene_baseline_id IS NOT NULL AND resolved_g6_instance_id IS NOT NULL AND resolved_position_id IS NOT NULL)),
  UNIQUE(preparation_snapshot_id, member_kind, dependency_pins)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_route_plans (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  journey_owner_ref jsonb NOT NULL, journey_scope text NOT NULL CHECK(journey_scope IN ('world_travel','carrier_local')),
  request_kind text NOT NULL CHECK(request_kind IN ('ordinary','rescue','repair','migration')),
  recovery_binding_id text, administrative_authorization_pins jsonb,
  planning_request_id text NOT NULL, path_query_digest text NOT NULL, option_id text NOT NULL,
  knowledge_scope text NOT NULL CHECK(knowledge_scope IN ('factual','character_known','admin')), knowledge_subject_ref jsonb,
  source_endpoint_snapshot jsonb NOT NULL, target_request jsonb, resolved_factual_target_ref jsonb,
  target_resolution_dependency_pins jsonb, intended_direction_id text,
  world_revision_id text NOT NULL, catalog_digest text NOT NULL, planning_algorithm_version text NOT NULL,
  planning_state_version bigint NOT NULL CHECK(planning_state_version >= 0), planning_context_dependency_pins jsonb NOT NULL,
  preparation_snapshot_id text REFERENCES party_runtime.preparation_snapshots(id) ON DELETE RESTRICT, preparation_snapshot_digest text,
  canonical_serialization_digest text NOT NULL, status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','superseded','retired')),
  superseded_by_plan_id text REFERENCES party_runtime.party_route_plans(id) ON DELETE RESTRICT, retired_reason_code text,
  lifecycle_state_version bigint NOT NULL DEFAULT 1 CHECK(lifecycle_state_version >= 1),
  created_change_set_id text NOT NULL, lifecycle_change_set_id text NOT NULL, created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0),
  CHECK ((target_request IS NULL) <> (intended_direction_id IS NULL)),
  CHECK ((target_request IS NULL) = (resolved_factual_target_ref IS NULL)),
  CHECK ((target_request IS NULL) = (target_resolution_dependency_pins IS NULL)),
  CHECK ((preparation_snapshot_id IS NULL) = (preparation_snapshot_digest IS NULL)),
  CHECK ((request_kind='ordinary') = (recovery_binding_id IS NULL AND administrative_authorization_pins IS NULL)),
  CHECK ((request_kind='rescue') = (recovery_binding_id IS NOT NULL AND administrative_authorization_pins IS NULL)),
  CHECK ((request_kind IN ('repair','migration')) = (recovery_binding_id IS NULL AND administrative_authorization_pins IS NOT NULL)),
  CHECK ((knowledge_scope='character_known') = (knowledge_subject_ref IS NOT NULL)),
  CHECK ((status='ready' AND superseded_by_plan_id IS NULL AND retired_reason_code IS NULL)
      OR (status='superseded' AND superseded_by_plan_id IS NOT NULL AND retired_reason_code IS NULL)
      OR (status='retired' AND superseded_by_plan_id IS NULL AND retired_reason_code IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS party_runtime.party_route_plan_steps (
  route_plan_id text NOT NULL REFERENCES party_runtime.party_route_plans(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK(ordinal >= 0), step_kind text NOT NULL CHECK(step_kind IN ('immediate_action','timed_activity','timed_traversal')),
  departure_endpoint_snapshot jsonb NOT NULL, arrival_endpoint_snapshot jsonb NOT NULL,
  static_contract_snapshot jsonb NOT NULL, PRIMARY KEY(route_plan_id, ordinal),
  CHECK(static_contract_snapshot->>'snapshot_kind'=step_kind)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_route_plan_executions (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  route_plan_id text NOT NULL UNIQUE REFERENCES party_runtime.party_route_plans(id) ON DELETE RESTRICT,
  journey_owner_ref jsonb NOT NULL, journey_scope text NOT NULL CHECK(journey_scope IN ('world_travel','carrier_local')),
  status text NOT NULL CHECK(status IN ('planned','active','waiting_at_anchor','suspended_at_scene','stranded_in_transit','completed','aborted','superseded')),
  current_step_ordinal integer CHECK(current_step_ordinal >= 0), current_endpoint_ref jsonb,
  active_travel_state_id text, active_activity_execution_id text, suspension_endpoint_ref jsonb,
  final_location_snapshot jsonb, abort_reason_code text,
  supersedes_execution_id text UNIQUE, superseded_by_execution_id text UNIQUE,
  started_at_turn bigint CHECK(started_at_turn >= 0), terminal_at_turn bigint CHECK(terminal_at_turn >= 0),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1), updated_change_set_id text NOT NULL,
  CHECK ((status='planned' AND current_step_ordinal=0 AND current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NULL AND terminal_at_turn IS NULL)
    OR (status='active' AND current_step_ordinal IS NOT NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL AND ((current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL) OR (current_endpoint_ref IS NULL AND active_travel_state_id IS NOT NULL)) )
    OR (status='waiting_at_anchor' AND current_step_ordinal IS NOT NULL AND current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL)
    OR (status='suspended_at_scene' AND current_step_ordinal IS NOT NULL AND current_endpoint_ref IS NOT NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref=current_endpoint_ref AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL)
    OR (status='stranded_in_transit' AND current_step_ordinal IS NOT NULL AND current_endpoint_ref IS NULL AND active_travel_state_id IS NOT NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NULL)
    OR (status IN ('completed','aborted','superseded') AND current_step_ordinal IS NULL AND current_endpoint_ref IS NULL AND active_travel_state_id IS NULL AND active_activity_execution_id IS NULL AND suspension_endpoint_ref IS NULL AND final_location_snapshot IS NOT NULL AND started_at_turn IS NOT NULL AND terminal_at_turn IS NOT NULL)),
  CHECK ((status='aborted') = (abort_reason_code IS NOT NULL)),
  CHECK ((status='superseded') = (superseded_by_execution_id IS NOT NULL)),
  CHECK(terminal_at_turn IS NULL OR started_at_turn IS NULL OR terminal_at_turn >= started_at_turn)
);
ALTER TABLE party_runtime.party_route_plan_executions DROP CONSTRAINT IF EXISTS party_route_plan_executions_supersedes_fk;
ALTER TABLE party_runtime.party_route_plan_executions ADD CONSTRAINT party_route_plan_executions_supersedes_fk FOREIGN KEY(supersedes_execution_id) REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE party_runtime.party_route_plan_executions DROP CONSTRAINT IF EXISTS party_route_plan_executions_superseded_by_fk;
ALTER TABLE party_runtime.party_route_plan_executions ADD CONSTRAINT party_route_plan_executions_superseded_by_fk FOREIGN KEY(superseded_by_execution_id) REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS party_runtime.preparation_claims (
  id text PRIMARY KEY, preparation_snapshot_id text NOT NULL REFERENCES party_runtime.preparation_snapshots(id) ON DELETE RESTRICT,
  preparation_member_ordinal integer NOT NULL CHECK(preparation_member_ordinal>=0), route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  claim_status text NOT NULL CHECK(claim_status IN ('reserved','consumed','released','failed')), state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1),
  reserved_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK ((claim_status='reserved')=(terminal_change_set_id IS NULL)),
  UNIQUE(route_plan_execution_id, preparation_member_ordinal),
  FOREIGN KEY(preparation_snapshot_id,preparation_member_ordinal) REFERENCES party_runtime.preparation_snapshot_members(preparation_snapshot_id,ordinal) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS party_runtime.party_route_plan_execution_events (
  execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE CASCADE,
  event_ordinal integer NOT NULL CHECK(event_ordinal>=0),
  event_kind text NOT NULL CHECK(event_kind IN ('planned','activated','step_progressed','step_paused','step_completed','wait_started','suspended','stranded','resumed','completed','aborted','superseded')),
  from_status text, to_status text NOT NULL, step_ordinal integer NOT NULL CHECK(step_ordinal>=0),
  location_snapshot jsonb NOT NULL, causal_result_ref jsonb, change_set_id text NOT NULL, idempotency_record_id text NOT NULL,
  occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0), PRIMARY KEY(execution_id,event_ordinal)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_action_step_runs (
  id text PRIMARY KEY, execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), attempt_ordinal integer NOT NULL CHECK(attempt_ordinal>=0),
  action_snapshot jsonb NOT NULL, departure_endpoint_snapshot jsonb NOT NULL, arrival_endpoint_snapshot jsonb NOT NULL, execution_context_snapshot jsonb NOT NULL,
  result_kind text NOT NULL CHECK(result_kind IN ('completed','blocked','failed')), result_code text NOT NULL,
  result_change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0),
  UNIQUE(execution_id,plan_step_ordinal,attempt_ordinal)
);
CREATE UNIQUE INDEX IF NOT EXISTS party_action_step_one_completed_uq ON party_runtime.party_action_step_runs(execution_id,plan_step_ordinal) WHERE result_kind='completed';

CREATE TABLE IF NOT EXISTS party_runtime.party_timed_activity_executions (
  id text PRIMARY KEY, route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), series_ordinal integer NOT NULL CHECK(series_ordinal>=0), predecessor_activity_execution_id text UNIQUE,
  activity_snapshot jsonb NOT NULL, original_total_minutes integer NOT NULL CHECK(original_total_minutes>0),
  cumulative_elapsed_numerator bigint NOT NULL CHECK(cumulative_elapsed_numerator>=0), cumulative_elapsed_denominator bigint NOT NULL CHECK(cumulative_elapsed_denominator>0),
  remaining_time_numerator bigint NOT NULL CHECK(remaining_time_numerator>=0), remaining_time_denominator bigint NOT NULL CHECK(remaining_time_denominator>0),
  next_attempt_ordinal integer NOT NULL DEFAULT 0 CHECK(next_attempt_ordinal>=0), status text NOT NULL CHECK(status IN ('active','paused','completed','failed','aborted')),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1), updated_change_set_id text NOT NULL, terminal_change_set_id text,
  UNIQUE(route_plan_execution_id,plan_step_ordinal,series_ordinal),
  CHECK((status IN ('active','paused'))=(terminal_change_set_id IS NULL)),
  CHECK((status='completed')=(remaining_time_numerator=0))
);
ALTER TABLE party_runtime.party_timed_activity_executions DROP CONSTRAINT IF EXISTS party_activity_predecessor_fk;
ALTER TABLE party_runtime.party_timed_activity_executions ADD CONSTRAINT party_activity_predecessor_fk FOREIGN KEY(predecessor_activity_execution_id) REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX IF NOT EXISTS party_activity_one_nonterminal_uq ON party_runtime.party_timed_activity_executions(route_plan_execution_id,plan_step_ordinal) WHERE status IN ('active','paused');
CREATE TABLE IF NOT EXISTS party_runtime.party_timed_activity_attempts (
  activity_execution_id text NOT NULL REFERENCES party_runtime.party_timed_activity_executions(id) ON DELETE RESTRICT, attempt_ordinal integer NOT NULL CHECK(attempt_ordinal>=0),
  remaining_before_numerator bigint NOT NULL CHECK(remaining_before_numerator>0), remaining_before_denominator bigint NOT NULL CHECK(remaining_before_denominator>0), planned_time_numerator bigint NOT NULL CHECK(planned_time_numerator>0), planned_time_denominator bigint NOT NULL CHECK(planned_time_denominator>0), actual_time_numerator bigint NOT NULL CHECK(actual_time_numerator>=0), actual_time_denominator bigint NOT NULL CHECK(actual_time_denominator>0), remaining_after_numerator bigint NOT NULL CHECK(remaining_after_numerator>=0), remaining_after_denominator bigint NOT NULL CHECK(remaining_after_denominator>0), cumulative_time_before_numerator bigint NOT NULL CHECK(cumulative_time_before_numerator>=0), cumulative_time_before_denominator bigint NOT NULL CHECK(cumulative_time_before_denominator>0), cumulative_time_after_numerator bigint NOT NULL CHECK(cumulative_time_after_numerator>=0), cumulative_time_after_denominator bigint NOT NULL CHECK(cumulative_time_after_denominator>0), crossed_whole_minute_boundaries integer NOT NULL CHECK(crossed_whole_minute_boundaries>=0), clock_commit_mode text NOT NULL CHECK(clock_commit_mode IN ('direct_party_clock','shared_root_transport_clock')), synchronized_time_slice_result_id text, execution_context_snapshot jsonb NOT NULL, result_kind text NOT NULL CHECK(result_kind IN ('progressed','completed','paused','blocked','failed')), result_code text NOT NULL, dynamic_dependency_pins jsonb NOT NULL, result_change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0), PRIMARY KEY(activity_execution_id,attempt_ordinal), CHECK((clock_commit_mode='direct_party_clock')=(synchronized_time_slice_result_id IS NULL))
);

CREATE TABLE IF NOT EXISTS party_runtime.traveller_travel_states (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE, route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT, plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), movement_carrier_ref jsonb NOT NULL, segment_progress_ppm integer NOT NULL CHECK(segment_progress_ppm BETWEEN 0 AND 1000000), cumulative_actual_time_numerator bigint NOT NULL CHECK(cumulative_actual_time_numerator>=0), cumulative_actual_time_denominator bigint NOT NULL CHECK(cumulative_actual_time_denominator>0), next_interval_ordinal integer NOT NULL DEFAULT 0 CHECK(next_interval_ordinal>=0), intended_direction_id text, navigation_state text NOT NULL CHECK(navigation_state IN ('on_course','deviating','lost')), last_confirmed_endpoint_ref jsonb NOT NULL, last_dynamic_snapshot_digest text, status text NOT NULL CHECK(status IN ('active','paused_in_transit','stranded_in_transit','closed')), stranded_reason_code text, closed_result text CHECK(closed_result IN ('completed','interrupted_to_anchor','superseded')), state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1), updated_change_set_id text NOT NULL, closed_change_set_id text,
  CHECK((status='stranded_in_transit')=(stranded_reason_code IS NOT NULL)),
  CHECK((status='closed')=(closed_result IS NOT NULL AND closed_change_set_id IS NOT NULL)),
  CHECK(status<>'closed' OR (closed_result='completed' AND segment_progress_ppm=1000000) OR (closed_result IN ('interrupted_to_anchor','superseded') AND segment_progress_ppm<1000000)),
  UNIQUE(route_plan_execution_id,plan_step_ordinal)
);
CREATE TABLE IF NOT EXISTS party_runtime.party_traversal_interval_results (
  id text PRIMARY KEY, route_plan_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT, plan_step_ordinal integer NOT NULL CHECK(plan_step_ordinal>=0), interval_ordinal integer NOT NULL CHECK(interval_ordinal>=0), progress_before_ppm integer NOT NULL CHECK(progress_before_ppm BETWEEN 0 AND 999999), planned_progress_after_ppm integer NOT NULL CHECK(planned_progress_after_ppm BETWEEN 1 AND 1000000), actual_progress_after_ppm integer NOT NULL CHECK(actual_progress_after_ppm BETWEEN 0 AND 1000000), planned_time_numerator bigint NOT NULL CHECK(planned_time_numerator>0), planned_time_denominator bigint NOT NULL CHECK(planned_time_denominator>0), actual_time_numerator bigint NOT NULL CHECK(actual_time_numerator>=0), actual_time_denominator bigint NOT NULL CHECK(actual_time_denominator>0), cumulative_time_before_numerator bigint NOT NULL CHECK(cumulative_time_before_numerator>=0), cumulative_time_before_denominator bigint NOT NULL CHECK(cumulative_time_before_denominator>0), cumulative_time_after_numerator bigint NOT NULL CHECK(cumulative_time_after_numerator>=0), cumulative_time_after_denominator bigint NOT NULL CHECK(cumulative_time_after_denominator>0), crossed_whole_minute_boundaries integer NOT NULL CHECK(crossed_whole_minute_boundaries>=0), clock_commit_mode text NOT NULL CHECK(clock_commit_mode IN ('direct_party_clock','shared_root_transport_clock')), synchronized_time_slice_result_id text, dynamic_snapshot jsonb NOT NULL, result_kind text NOT NULL CHECK(result_kind IN ('progressed','segment_completed','paused_in_transit','interrupted_at_anchor','stranded','blocked_before_progress')), result_code text NOT NULL, navigation_resolution jsonb, hazard_resolution jsonb, outcome_composition_policy_version text NOT NULL, outcome_composition_trace_digest text NOT NULL, interruption_anchor_id text, result_change_set_id text NOT NULL, idempotency_record_id text NOT NULL, occurred_at_turn bigint NOT NULL CHECK(occurred_at_turn>=0), UNIQUE(route_plan_execution_id,plan_step_ordinal,interval_ordinal), CHECK(planned_progress_after_ppm>progress_before_ppm), CHECK(actual_progress_after_ppm BETWEEN progress_before_ppm AND planned_progress_after_ppm), CHECK((clock_commit_mode='direct_party_clock')=(synchronized_time_slice_result_id IS NULL)), CHECK((result_kind='segment_completed')=(actual_progress_after_ppm=1000000)), CHECK((result_kind='interrupted_at_anchor')=(interruption_anchor_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS party_runtime.party_recovery_transition_bindings (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  stranded_travel_state_id text NOT NULL REFERENCES party_runtime.traveller_travel_states(id) ON DELETE RESTRICT,
  source_endpoint_snapshot jsonb NOT NULL, target_endpoint_snapshot jsonb NOT NULL, template_ref jsonb NOT NULL,
  executable_cost_step_snapshot jsonb, status text NOT NULL CHECK(status IN ('active','consumed','superseded')),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version>=1), created_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status='active')=(terminal_change_set_id IS NULL))
);
ALTER TABLE party_runtime.party_route_plans DROP CONSTRAINT IF EXISTS party_route_plans_recovery_binding_fk;
ALTER TABLE party_runtime.party_route_plans ADD CONSTRAINT party_route_plans_recovery_binding_fk FOREIGN KEY(recovery_binding_id) REFERENCES party_runtime.party_recovery_transition_bindings(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION party_runtime.v3_planning_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='party_route_plans' THEN
    IF (to_jsonb(NEW)-ARRAY['status','superseded_by_plan_id','retired_reason_code','lifecycle_state_version','lifecycle_change_set_id']) <> (to_jsonb(OLD)-ARRAY['status','superseded_by_plan_id','retired_reason_code','lifecycle_state_version','lifecycle_change_set_id']) THEN RAISE EXCEPTION 'spatial_immutable_payload_violation: route plan payload'; END IF;
    IF OLD.status<>'ready' OR NEW.status='ready' OR NEW.lifecycle_state_version<>OLD.lifecycle_state_version+1 THEN RAISE EXCEPTION 'spatial_plan_lifecycle_invalid'; END IF;
  ELSE
    RAISE EXCEPTION 'spatial_immutable_payload_violation: %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_planning_no_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'spatial_immutable_payload_violation: %', TG_TABLE_NAME; END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_claim_transition_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'spatial_claim_history_immutable'; END IF;
  IF OLD.claim_status<>'reserved' OR NEW.claim_status NOT IN ('consumed','released','failed') OR NEW.state_version<>OLD.state_version+1 OR NEW.terminal_change_set_id IS NULL THEN
    RAISE EXCEPTION 'spatial_preparation_claim_transition_invalid';
  END IF;
  IF (to_jsonb(NEW)-ARRAY['claim_status','state_version','terminal_change_set_id']) <> (to_jsonb(OLD)-ARRAY['claim_status','state_version','terminal_change_set_id']) THEN RAISE EXCEPTION 'spatial_preparation_claim_immutable'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_plan_step_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_id text:=NEW.route_plan_id; n integer; max_ordinal integer;
BEGIN
  SELECT count(*),max(ordinal) INTO n,max_ordinal FROM party_runtime.party_route_plan_steps WHERE route_plan_id=plan_id;
  IF n=0 OR max_ordinal<>n-1 OR EXISTS(SELECT 1 FROM party_runtime.party_route_plan_steps a JOIN party_runtime.party_route_plan_steps b ON b.route_plan_id=a.route_plan_id AND b.ordinal=a.ordinal+1 WHERE a.route_plan_id=plan_id AND a.arrival_endpoint_snapshot<>b.departure_endpoint_snapshot) THEN RAISE EXCEPTION 'spatial_plan_step_continuity_invalid'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'spatial_append_only_history_violation: %', TG_TABLE_NAME; END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_recovery_binding_valid() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source_endpoint_snapshot->>'endpoint_kind'<>'stranded_state' OR NEW.source_endpoint_snapshot->>'endpoint_id'<>NEW.stranded_travel_state_id THEN RAISE EXCEPTION 'spatial_recovery_binding_invalid: exact stranded source'; END IF;
  IF NOT EXISTS(SELECT 1 FROM party_runtime.traveller_travel_states s JOIN party_runtime.party_route_plan_executions e ON e.id=s.route_plan_execution_id WHERE s.id=NEW.stranded_travel_state_id AND s.party_id=NEW.party_id AND s.status='stranded_in_transit' AND e.status='stranded_in_transit') THEN RAISE EXCEPTION 'spatial_recovery_binding_invalid: stranded state'; END IF;
  IF NEW.source_endpoint_snapshot<>NEW.target_endpoint_snapshot AND NEW.executable_cost_step_snapshot IS NULL THEN RAISE EXCEPTION 'spatial_recovery_binding_invalid: missing cost'; END IF;
  IF NEW.source_endpoint_snapshot=NEW.target_endpoint_snapshot AND NEW.executable_cost_step_snapshot IS NOT NULL THEN RAISE EXCEPTION 'spatial_recovery_binding_invalid: unexpected cost'; END IF;
  IF TG_OP='UPDATE' AND (OLD.status<>'active' OR NEW.status NOT IN ('consumed','superseded') OR NEW.state_version<>OLD.state_version+1 OR NEW.terminal_change_set_id IS NULL) THEN RAISE EXCEPTION 'spatial_recovery_binding_transition_invalid'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_event_causal_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE step_kind text; actual_change_set text; actual_idempotency text; causal_id text; causal_kind text;
BEGIN
  IF NEW.event_kind NOT IN ('step_progressed','step_paused','step_completed','wait_started','suspended','stranded','completed') THEN RETURN NEW; END IF;
  causal_id:=NEW.causal_result_ref->>'entity_id'; causal_kind:=NEW.causal_result_ref->>'entity_kind';
  SELECT s.step_kind INTO step_kind FROM party_runtime.party_route_plan_executions e JOIN party_runtime.party_route_plan_steps s ON s.route_plan_id=e.route_plan_id AND s.ordinal=NEW.step_ordinal WHERE e.id=NEW.execution_id;
  IF step_kind='immediate_action' AND causal_kind='party_action_step_run' THEN SELECT result_change_set_id,idempotency_record_id INTO actual_change_set,actual_idempotency FROM party_runtime.party_action_step_runs WHERE id=causal_id AND execution_id=NEW.execution_id AND plan_step_ordinal=NEW.step_ordinal;
  ELSIF step_kind='timed_activity' AND causal_kind='party_timed_activity_attempt' THEN SELECT a.result_change_set_id,a.idempotency_record_id INTO actual_change_set,actual_idempotency FROM party_runtime.party_timed_activity_attempts a JOIN party_runtime.party_timed_activity_executions x ON x.id=a.activity_execution_id WHERE a.activity_execution_id=causal_id AND a.attempt_ordinal=(NEW.causal_result_ref->>'attempt_ordinal')::integer AND x.route_plan_execution_id=NEW.execution_id AND x.plan_step_ordinal=NEW.step_ordinal;
  ELSIF step_kind='timed_traversal' AND causal_kind='party_traversal_interval_result' THEN SELECT result_change_set_id,idempotency_record_id INTO actual_change_set,actual_idempotency FROM party_runtime.party_traversal_interval_results WHERE id=causal_id AND route_plan_execution_id=NEW.execution_id AND plan_step_ordinal=NEW.step_ordinal;
  ELSE RAISE EXCEPTION 'spatial_execution_event_causal_invalid: typed result'; END IF;
  IF actual_change_set IS NULL OR actual_change_set<>NEW.change_set_id OR actual_idempotency<>NEW.idempotency_record_id THEN RAISE EXCEPTION 'spatial_execution_event_causal_invalid: change set or idempotency'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_execution_transition_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed boolean; expected_kind text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'planned' THEN RAISE EXCEPTION 'spatial_execution_transition_invalid: creation must be planned'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  allowed=(OLD.status='planned' AND NEW.status IN ('active','aborted')) OR (OLD.status='active' AND NEW.status IN ('waiting_at_anchor','suspended_at_scene','stranded_in_transit','completed','aborted','superseded')) OR (OLD.status='waiting_at_anchor' AND NEW.status IN ('active','aborted','superseded')) OR (OLD.status='suspended_at_scene' AND NEW.status IN ('aborted','superseded')) OR (OLD.status='stranded_in_transit' AND NEW.status='superseded');
  IF NOT allowed THEN RAISE EXCEPTION 'spatial_execution_transition_invalid: % -> %',OLD.status,NEW.status; END IF;
  IF OLD.status='active' AND NEW.status='superseded' AND OLD.active_travel_state_id IS NOT NULL THEN RAISE EXCEPTION 'spatial_execution_transition_invalid: raw in-transit supersession'; END IF;
  IF NEW.state_version<>OLD.state_version+1 THEN RAISE EXCEPTION 'spatial_execution_transition_invalid: state version'; END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_execution_event_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.event_ordinal=0 THEN
    IF NEW.event_kind<>'planned' OR NEW.from_status IS NOT NULL OR NEW.to_status<>'planned' OR NEW.causal_result_ref IS NOT NULL THEN RAISE EXCEPTION 'spatial_execution_event_invalid: planned'; END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_execution_events e WHERE e.execution_id=NEW.execution_id AND e.event_ordinal=NEW.event_ordinal-1) THEN RAISE EXCEPTION 'spatial_execution_event_invalid: noncontiguous ordinal'; END IF;
    ok=(NEW.event_kind='activated' AND NEW.from_status='planned' AND NEW.to_status='active' AND NEW.causal_result_ref IS NULL) OR (NEW.event_kind='resumed' AND NEW.from_status='waiting_at_anchor' AND NEW.to_status='active' AND NEW.causal_result_ref IS NULL) OR (NEW.event_kind='wait_started' AND NEW.from_status='active' AND NEW.to_status='waiting_at_anchor' AND NEW.causal_result_ref IS NOT NULL) OR (NEW.event_kind='suspended' AND NEW.from_status='active' AND NEW.to_status='suspended_at_scene' AND NEW.causal_result_ref IS NOT NULL) OR (NEW.event_kind='stranded' AND NEW.from_status='active' AND NEW.to_status='stranded_in_transit' AND NEW.causal_result_ref IS NOT NULL) OR (NEW.event_kind='completed' AND NEW.from_status='active' AND NEW.to_status='completed' AND NEW.causal_result_ref IS NOT NULL) OR (NEW.event_kind='aborted' AND NEW.from_status IN ('planned','active','waiting_at_anchor','suspended_at_scene') AND NEW.to_status='aborted') OR (NEW.event_kind='superseded' AND NEW.from_status IN ('active','waiting_at_anchor','suspended_at_scene','stranded_in_transit') AND NEW.to_status='superseded') OR (NEW.event_kind IN ('step_progressed','step_paused','step_completed') AND NEW.from_status='active' AND NEW.to_status='active' AND NEW.causal_result_ref IS NOT NULL);
    IF NOT ok THEN RAISE EXCEPTION 'spatial_execution_event_invalid: mapping'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION party_runtime.v3_planning_deferred_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE e party_runtime.party_route_plan_executions%ROWTYPE; plan_row party_runtime.party_route_plans%ROWTYPE; exclusive_member boolean; step_kind text;
BEGIN
  IF TG_TABLE_NAME='party_route_plan_executions' THEN
    SELECT * INTO plan_row FROM party_runtime.party_route_plans WHERE id=NEW.route_plan_id;
    IF plan_row.party_id<>NEW.party_id OR plan_row.journey_owner_ref<>NEW.journey_owner_ref OR plan_row.journey_scope<>NEW.journey_scope THEN RAISE EXCEPTION 'spatial_party_or_plan_mismatch'; END IF;
    IF NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_execution_events x WHERE x.execution_id=NEW.id AND x.event_ordinal=0) THEN RAISE EXCEPTION 'spatial_execution_event_missing: planned'; END IF;
    IF TG_OP='UPDATE' AND NEW.status<>OLD.status AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_execution_events x WHERE x.execution_id=NEW.id AND x.from_status=OLD.status AND x.to_status=NEW.status) THEN RAISE EXCEPTION 'spatial_execution_event_missing: transition'; END IF;
    IF plan_row.request_kind='rescue' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_recovery_transition_bindings b JOIN party_runtime.party_route_plan_steps s ON s.route_plan_id=plan_row.id AND s.ordinal=0 JOIN party_runtime.party_route_plan_executions current_execution ON current_execution.id=NEW.id WHERE b.id=plan_row.recovery_binding_id AND b.party_id=plan_row.party_id AND b.status=CASE WHEN current_execution.status='completed' THEN 'consumed' ELSE 'active' END AND b.source_endpoint_snapshot=plan_row.source_endpoint_snapshot AND plan_row.target_request=b.target_endpoint_snapshot AND plan_row.resolved_factual_target_ref=b.target_endpoint_snapshot AND s.departure_endpoint_snapshot=b.source_endpoint_snapshot AND s.arrival_endpoint_snapshot=b.target_endpoint_snapshot AND (b.executable_cost_step_snapshot IS NULL OR s.static_contract_snapshot=b.executable_cost_step_snapshot)) THEN RAISE EXCEPTION 'spatial_recovery_plan_invalid: exact binding target/cost'; END IF;
    IF plan_row.request_kind='rescue' AND EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions current_execution WHERE current_execution.id=NEW.id AND current_execution.status='completed') AND NOT EXISTS(SELECT 1 FROM party_runtime.party_recovery_transition_bindings b JOIN party_runtime.party_route_plan_executions current_execution ON current_execution.id=NEW.id WHERE b.id=plan_row.recovery_binding_id AND b.status='consumed' AND b.terminal_change_set_id=current_execution.updated_change_set_id) THEN RAISE EXCEPTION 'spatial_recovery_plan_invalid: successful binding must be consumed'; END IF;
    IF NEW.status='superseded' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions s WHERE s.id=NEW.superseded_by_execution_id AND s.supersedes_execution_id=NEW.id) THEN RAISE EXCEPTION 'spatial_supersession_invalid: reciprocal successor'; END IF;
    IF NEW.supersedes_execution_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions q WHERE q.id=NEW.supersedes_execution_id AND q.superseded_by_execution_id=NEW.id AND q.party_id=NEW.party_id) THEN RAISE EXCEPTION 'spatial_supersession_invalid: reciprocal predecessor'; END IF;
    IF NEW.supersedes_execution_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions predecessor JOIN party_runtime.party_route_plans successor_plan ON successor_plan.id=NEW.route_plan_id WHERE predecessor.id=NEW.supersedes_execution_id AND successor_plan.source_endpoint_snapshot=predecessor.final_location_snapshot->'handoff_endpoint_snapshot') THEN RAISE EXCEPTION 'spatial_supersession_invalid: exact handoff source'; END IF;
    IF NEW.supersedes_execution_id IS NOT NULL AND EXISTS(WITH RECURSIVE chain(id) AS (SELECT NEW.supersedes_execution_id UNION ALL SELECT q.supersedes_execution_id FROM party_runtime.party_route_plan_executions q JOIN chain c ON q.id=c.id WHERE q.supersedes_execution_id IS NOT NULL) SELECT 1 FROM chain WHERE id=NEW.id) THEN RAISE EXCEPTION 'spatial_supersession_invalid: cycle'; END IF;
    IF NEW.status='active' AND EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions current_execution WHERE current_execution.id=NEW.id AND current_execution.status='active') THEN
      SELECT s.step_kind INTO step_kind FROM party_runtime.party_route_plan_steps s WHERE s.route_plan_id=NEW.route_plan_id AND s.ordinal=NEW.current_step_ordinal;
      IF step_kind='immediate_action' AND (NEW.current_endpoint_ref IS NULL OR NEW.active_activity_execution_id IS NOT NULL OR NEW.active_travel_state_id IS NOT NULL) THEN RAISE EXCEPTION 'spatial_execution_state_invalid: action fields'; END IF;
      IF step_kind='timed_activity' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_timed_activity_executions a WHERE a.id=NEW.active_activity_execution_id AND a.route_plan_execution_id=NEW.id AND a.plan_step_ordinal=NEW.current_step_ordinal AND a.status IN ('active','paused')) THEN RAISE EXCEPTION 'spatial_execution_state_invalid: activity reference'; END IF;
      IF step_kind='timed_traversal' AND NOT EXISTS(SELECT 1 FROM party_runtime.traveller_travel_states t WHERE t.id=NEW.active_travel_state_id AND t.route_plan_execution_id=NEW.id AND t.plan_step_ordinal=NEW.current_step_ordinal AND t.status IN ('active','paused_in_transit')) THEN RAISE EXCEPTION 'spatial_execution_state_invalid: travel reference'; END IF;
    ELSIF NEW.status='stranded_in_transit' AND NOT EXISTS(SELECT 1 FROM party_runtime.traveller_travel_states t WHERE t.id=NEW.active_travel_state_id AND t.route_plan_execution_id=NEW.id AND t.plan_step_ordinal=NEW.current_step_ordinal AND t.status='stranded_in_transit') THEN RAISE EXCEPTION 'spatial_execution_state_invalid: stranded reference'; END IF;
  ELSIF TG_TABLE_NAME='preparation_claims' THEN
    SELECT * INTO e FROM party_runtime.party_route_plan_executions WHERE id=NEW.route_plan_execution_id;
    SELECT m.share_mode='execution_exclusive' INTO exclusive_member FROM party_runtime.preparation_snapshot_members m WHERE m.preparation_snapshot_id=NEW.preparation_snapshot_id AND m.ordinal=NEW.preparation_member_ordinal;
    IF exclusive_member IS NULL THEN RAISE EXCEPTION 'spatial_preparation_claim_invalid: member'; END IF;
    IF NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plans pr WHERE pr.id=e.route_plan_id AND pr.preparation_snapshot_id=NEW.preparation_snapshot_id) THEN RAISE EXCEPTION 'spatial_preparation_claim_invalid: plan pin'; END IF;
    IF exclusive_member AND NEW.claim_status='reserved' AND EXISTS(SELECT 1 FROM party_runtime.preparation_claims c WHERE c.preparation_snapshot_id=NEW.preparation_snapshot_id AND c.preparation_member_ordinal=NEW.preparation_member_ordinal AND c.claim_status='reserved' AND c.id<>NEW.id) THEN RAISE EXCEPTION 'spatial_preparation_claim_conflict'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS v3_plan_immutable ON party_runtime.party_route_plans;
CREATE TRIGGER v3_plan_immutable BEFORE UPDATE ON party_runtime.party_route_plans FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_immutable();
DROP TRIGGER IF EXISTS v3_plan_step_immutable ON party_runtime.party_route_plan_steps;
CREATE TRIGGER v3_plan_step_immutable BEFORE UPDATE OR DELETE ON party_runtime.party_route_plan_steps FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_no_update();
DROP TRIGGER IF EXISTS v3_preparation_snapshot_immutable ON party_runtime.preparation_snapshots;
CREATE TRIGGER v3_preparation_snapshot_immutable BEFORE UPDATE OR DELETE ON party_runtime.preparation_snapshots FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_no_update();
DROP TRIGGER IF EXISTS v3_preparation_member_immutable ON party_runtime.preparation_snapshot_members;
CREATE TRIGGER v3_preparation_member_immutable BEFORE UPDATE OR DELETE ON party_runtime.preparation_snapshot_members FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_no_update();
DROP TRIGGER IF EXISTS v3_claim_transition ON party_runtime.preparation_claims;
CREATE TRIGGER v3_claim_transition BEFORE UPDATE OR DELETE ON party_runtime.preparation_claims FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_claim_transition_valid();
DROP TRIGGER IF EXISTS v3_plan_step_continuity ON party_runtime.party_route_plan_steps;
CREATE CONSTRAINT TRIGGER v3_plan_step_continuity AFTER INSERT ON party_runtime.party_route_plan_steps DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_plan_step_integrity();
DROP TRIGGER IF EXISTS v3_execution_transition ON party_runtime.party_route_plan_executions;
CREATE TRIGGER v3_execution_transition BEFORE INSERT OR UPDATE ON party_runtime.party_route_plan_executions FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_execution_transition_valid();
DROP TRIGGER IF EXISTS v3_execution_event_mapping ON party_runtime.party_route_plan_execution_events;
CREATE TRIGGER v3_execution_event_mapping BEFORE INSERT ON party_runtime.party_route_plan_execution_events FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_execution_event_valid();
DROP TRIGGER IF EXISTS v3_execution_event_causal ON party_runtime.party_route_plan_execution_events;
CREATE CONSTRAINT TRIGGER v3_execution_event_causal AFTER INSERT ON party_runtime.party_route_plan_execution_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_event_causal_integrity();
DROP TRIGGER IF EXISTS v3_execution_event_append_only ON party_runtime.party_route_plan_execution_events;
CREATE TRIGGER v3_execution_event_append_only BEFORE UPDATE OR DELETE ON party_runtime.party_route_plan_execution_events FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_append_only();
DROP TRIGGER IF EXISTS v3_action_run_append_only ON party_runtime.party_action_step_runs;
CREATE TRIGGER v3_action_run_append_only BEFORE UPDATE OR DELETE ON party_runtime.party_action_step_runs FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_append_only();
DROP TRIGGER IF EXISTS v3_activity_attempt_append_only ON party_runtime.party_timed_activity_attempts;
CREATE TRIGGER v3_activity_attempt_append_only BEFORE UPDATE OR DELETE ON party_runtime.party_timed_activity_attempts FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_append_only();
DROP TRIGGER IF EXISTS v3_interval_append_only ON party_runtime.party_traversal_interval_results;
CREATE TRIGGER v3_interval_append_only BEFORE UPDATE OR DELETE ON party_runtime.party_traversal_interval_results FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_append_only();
DROP TRIGGER IF EXISTS v3_recovery_binding_transition ON party_runtime.party_recovery_transition_bindings;
CREATE TRIGGER v3_recovery_binding_transition BEFORE INSERT OR UPDATE ON party_runtime.party_recovery_transition_bindings FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_recovery_binding_valid();
DROP TRIGGER IF EXISTS v3_execution_integrity ON party_runtime.party_route_plan_executions;
CREATE CONSTRAINT TRIGGER v3_execution_integrity AFTER INSERT OR UPDATE ON party_runtime.party_route_plan_executions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_deferred_integrity();
DROP TRIGGER IF EXISTS v3_claim_integrity ON party_runtime.preparation_claims;
CREATE CONSTRAINT TRIGGER v3_claim_integrity AFTER INSERT OR UPDATE ON party_runtime.preparation_claims DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_planning_deferred_integrity();
