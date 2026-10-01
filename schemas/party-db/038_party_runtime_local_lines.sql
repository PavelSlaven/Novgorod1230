-- Additive party-side schema for approved local line connections and F.1.1 traversal.
-- Committed traversal history is not migrated in place (D51): recreate party DB.
DO $$
DECLARE travel_state_count bigint; interval_count bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'party_runtime'
      AND table_name = 'party_traversal_interval_results'
      AND column_name = 'travel_state_id'
  ) THEN
    SELECT count(*) INTO travel_state_count FROM party_runtime.traveller_travel_states;
    SELECT count(*) INTO interval_count FROM party_runtime.party_traversal_interval_results;
    IF travel_state_count > 0 OR interval_count > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'PARTY_DATABASE_REBUILD_REQUIRED',
        DETAIL = format('D51: traveller_travel_states=%s, party_traversal_interval_results=%s',
          travel_state_count, interval_count);
    END IF;
  END IF;
END
$$;

ALTER TABLE party_runtime.g5_site_connections
  ADD COLUMN IF NOT EXISTS line_kind_id text,
  ADD COLUMN IF NOT EXISTS line_kind_profile_ref jsonb,
  ADD COLUMN IF NOT EXISTS line_name text,
  ADD COLUMN IF NOT EXISTS line_discriminator text,
  ADD COLUMN IF NOT EXISTS line_direction_id text,
  ADD COLUMN IF NOT EXISTS line_toponym text,
  ADD COLUMN IF NOT EXISTS source_canonical_connection_ref jsonb;

ALTER TABLE party_runtime.g5_site_connections
  DROP CONSTRAINT IF EXISTS g5_site_connections_line_binding_ck,
  ADD CONSTRAINT g5_site_connections_line_binding_ck CHECK (
    (line_kind_id IS NULL AND line_kind_profile_ref IS NULL AND line_name IS NULL
      AND line_discriminator IS NULL AND line_direction_id IS NULL AND line_toponym IS NULL)
    OR
    (line_kind_id IS NOT NULL AND line_kind_profile_ref IS NOT NULL
      AND line_name IS NOT NULL AND length(btrim(line_name)) > 0
      AND (line_discriminator IS NULL OR length(btrim(line_discriminator)) > 0)
      AND (line_toponym IS NULL OR length(btrim(line_toponym)) > 0)
      AND cost_kind = 'time' AND action_units IS NULL
      AND baseline_movement_method_id IS NOT NULL
      AND movement_method_cost_profile_ref IS NOT NULL
      AND base_minutes IS NOT NULL AND base_minutes > 0
      AND party_runtime.integral_numeric(base_minutes)
      AND dynamic_recheck_policy_ref IS NOT NULL)
  );

ALTER TABLE party_runtime.traveller_travel_states
  ADD COLUMN IF NOT EXISTS mirrored boolean NOT NULL DEFAULT false;

ALTER TABLE party_runtime.traveller_travel_states
  DROP CONSTRAINT IF EXISTS traveller_travel_states_closed_result_check;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.traveller_travel_states'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%closed_result%'
      AND pg_get_constraintdef(oid) LIKE '%segment_progress_ppm%'
  LOOP
    EXECUTE format('ALTER TABLE party_runtime.traveller_travel_states DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

ALTER TABLE party_runtime.traveller_travel_states
  DROP CONSTRAINT IF EXISTS traveller_travel_states_terminal_state_check,
  DROP CONSTRAINT IF EXISTS traveller_travel_states_paused_progress_ck,
  ADD CONSTRAINT traveller_travel_states_closed_result_check
    CHECK (closed_result IN ('completed','interrupted_to_anchor','returned_to_departure','superseded')),
  ADD CONSTRAINT traveller_travel_states_paused_progress_ck CHECK (
    status <> 'paused_in_transit' OR segment_progress_ppm BETWEEN 1 AND 999999
  ),
  ADD CONSTRAINT traveller_travel_states_terminal_state_check CHECK (
    status <> 'closed'
    OR (closed_result = 'completed' AND segment_progress_ppm = 1000000 AND mirrored = false)
    OR (closed_result = 'returned_to_departure' AND segment_progress_ppm = 1000000 AND mirrored = true)
    OR (closed_result = 'interrupted_to_anchor' AND segment_progress_ppm < 1000000)
    OR (closed_result = 'superseded' AND segment_progress_ppm < 1000000)
  );

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.traveller_travel_states'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (route_plan_execution_id, plan_step_ordinal)'
  LOOP
    EXECUTE format('ALTER TABLE party_runtime.traveller_travel_states DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS traveller_travel_states_one_open_step_uq
  ON party_runtime.traveller_travel_states(route_plan_execution_id, plan_step_ordinal)
  WHERE status IN ('active','paused_in_transit','stranded_in_transit');

ALTER TABLE party_runtime.party_traversal_interval_results
  ADD COLUMN IF NOT EXISTS travel_state_id text,
  ADD COLUMN IF NOT EXISTS turn_back boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS traveller_travel_states_scope_identity_uq
  ON party_runtime.traveller_travel_states(id, route_plan_execution_id, plan_step_ordinal);

ALTER TABLE party_runtime.party_traversal_interval_results
  ALTER COLUMN travel_state_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS party_traversal_interval_results_travel_state_id_fkey,
  ADD CONSTRAINT party_traversal_interval_results_travel_state_id_fkey
    FOREIGN KEY(travel_state_id, route_plan_execution_id, plan_step_ordinal)
    REFERENCES party_runtime.traveller_travel_states(id, route_plan_execution_id, plan_step_ordinal)
    ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS party_traversal_interval_results_result_kind_check,
  DROP CONSTRAINT IF EXISTS party_traversal_interval_results_turn_back_ck,
  DROP CONSTRAINT IF EXISTS party_traversal_interval_results_terminal_result_ck;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_traversal_interval_results'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (route_plan_execution_id, plan_step_ordinal, interval_ordinal)'
  LOOP
    EXECUTE format('ALTER TABLE party_runtime.party_traversal_interval_results DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_traversal_interval_results'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%segment_completed%'
      AND pg_get_constraintdef(oid) LIKE '%actual_progress_after_ppm%'
  LOOP
    EXECUTE format('ALTER TABLE party_runtime.party_traversal_interval_results DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

ALTER TABLE party_runtime.party_traversal_interval_results
  ADD CONSTRAINT party_traversal_interval_results_result_kind_check
    CHECK (result_kind IN ('progressed','segment_completed','returned_to_departure',
      'paused_in_transit','interrupted_at_anchor','stranded','blocked_before_progress')),
  ADD CONSTRAINT party_traversal_interval_results_terminal_result_ck CHECK (
    (result_kind IN ('segment_completed','returned_to_departure'))
      = (actual_progress_after_ppm = 1000000)
  ),
  ADD CONSTRAINT party_traversal_interval_results_turn_back_ck CHECK (
    NOT (turn_back AND result_kind = 'blocked_before_progress')
    AND (NOT turn_back OR progress_before_ppm BETWEEN 1 AND 999999)
    AND (result_code <> 'turn_back_refused'
      OR (result_kind = 'blocked_before_progress' AND turn_back = false))
    AND (result_kind <> 'paused_in_transit' OR actual_progress_after_ppm BETWEEN 1 AND 999999)
  );

CREATE UNIQUE INDEX IF NOT EXISTS party_traversal_interval_results_state_identity_uq
  ON party_runtime.party_traversal_interval_results(travel_state_id, interval_ordinal);

CREATE OR REPLACE FUNCTION party_runtime.v3_event_causal_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE step_kind text; actual_change_set text; actual_idempotency text; actual_kind text; causal_id text; causal_kind text; is_final boolean; positive_nonterminal boolean;
BEGIN
  IF NEW.event_kind NOT IN ('step_progressed','step_paused','step_completed','wait_started','suspended','stranded','completed') THEN RETURN NEW; END IF;
  causal_id := NEW.causal_result_ref->>'entity_id';
  causal_kind := NEW.causal_result_ref->>'entity_kind';
  SELECT s.step_kind INTO step_kind
  FROM party_runtime.party_route_plan_executions e
  JOIN party_runtime.party_route_plan_steps s ON s.route_plan_id=e.route_plan_id AND s.ordinal=NEW.step_ordinal
  WHERE e.id=NEW.execution_id;
  SELECT NOT EXISTS (
    SELECT 1 FROM party_runtime.party_route_plan_executions e
    JOIN party_runtime.party_route_plan_steps next_step ON next_step.route_plan_id=e.route_plan_id AND next_step.ordinal=NEW.step_ordinal+1
    WHERE e.id=NEW.execution_id
  ) INTO is_final;
  IF step_kind='immediate_action' AND causal_kind='party_action_step_run' THEN
    SELECT result_change_set_id,idempotency_record_id,result_kind,false
      INTO actual_change_set,actual_idempotency,actual_kind,positive_nonterminal
    FROM party_runtime.party_action_step_runs
    WHERE id=causal_id AND execution_id=NEW.execution_id AND plan_step_ordinal=NEW.step_ordinal;
  ELSIF step_kind='timed_activity' AND causal_kind='party_timed_activity_attempt' THEN
    SELECT a.result_change_set_id,a.idempotency_record_id,a.result_kind,
      (a.result_kind='progressed' AND a.actual_time_numerator>0 AND a.remaining_after_numerator>0)
      INTO actual_change_set,actual_idempotency,actual_kind,positive_nonterminal
    FROM party_runtime.party_timed_activity_attempts a
    JOIN party_runtime.party_timed_activity_executions x ON x.id=a.activity_execution_id
    WHERE a.activity_execution_id=causal_id
      AND a.attempt_ordinal=(NEW.causal_result_ref->>'attempt_ordinal')::integer
      AND x.route_plan_execution_id=NEW.execution_id AND x.plan_step_ordinal=NEW.step_ordinal;
  ELSIF step_kind='timed_traversal' AND causal_kind='party_traversal_interval_result' THEN
    SELECT result_change_set_id,idempotency_record_id,result_kind,
      (result_kind='progressed' AND actual_progress_after_ppm>progress_before_ppm AND actual_progress_after_ppm<1000000)
      INTO actual_change_set,actual_idempotency,actual_kind,positive_nonterminal
    FROM party_runtime.party_traversal_interval_results
    WHERE id=causal_id AND route_plan_execution_id=NEW.execution_id AND plan_step_ordinal=NEW.step_ordinal;
  ELSE
    RAISE EXCEPTION 'spatial_execution_event_causal_invalid: typed result';
  END IF;
  IF actual_change_set IS NULL OR actual_change_set<>NEW.change_set_id OR actual_idempotency<>NEW.idempotency_record_id THEN
    RAISE EXCEPTION 'spatial_execution_event_causal_invalid: change set or idempotency';
  END IF;
  IF NEW.event_kind='step_progressed' AND NOT positive_nonterminal THEN
    RAISE EXCEPTION 'spatial_execution_event_causal_invalid: positive nonterminal progress';
  END IF;
  IF NEW.event_kind='step_paused' AND NOT ((step_kind='timed_activity' AND actual_kind='paused')
    OR (step_kind='timed_traversal' AND actual_kind='paused_in_transit')) THEN
    RAISE EXCEPTION 'spatial_execution_event_causal_invalid: paused result';
  END IF;
  IF NEW.event_kind='step_completed' AND (is_final OR actual_kind NOT IN ('completed','segment_completed')) THEN
    RAISE EXCEPTION 'spatial_execution_event_causal_invalid: nonfinal completed step';
  END IF;
  IF NEW.event_kind='completed' AND (NOT is_final OR actual_kind NOT IN ('completed','segment_completed')) THEN
    RAISE EXCEPTION 'spatial_execution_event_causal_invalid: final completed step';
  END IF;
  IF NEW.event_kind='wait_started' AND NOT (
    actual_kind IN ('blocked','failed','blocked_before_progress','returned_to_departure')
    OR (actual_kind='interrupted_at_anchor' AND causal_kind='party_traversal_interval_result'
      AND EXISTS (SELECT 1 FROM party_runtime.party_traversal_interval_results r
        WHERE r.id=causal_id AND r.actual_progress_after_ppm=0))
  ) THEN
    RAISE EXCEPTION 'spatial_execution_event_causal_invalid: waiting result';
  END IF;
  IF NEW.event_kind='suspended' AND (actual_kind<>'interrupted_at_anchor'
    OR (causal_kind='party_traversal_interval_result'
      AND EXISTS (SELECT 1 FROM party_runtime.party_traversal_interval_results r
        WHERE r.id=causal_id AND r.actual_progress_after_ppm=0))) THEN
    RAISE EXCEPTION 'spatial_execution_event_causal_invalid: suspension result';
  END IF;
  IF NEW.event_kind='stranded' AND actual_kind<>'stranded' THEN
    RAISE EXCEPTION 'spatial_execution_event_causal_invalid: stranded result';
  END IF;
  RETURN NEW;
END $$;
