-- A resumed timed activity may reach its terminal boundary in the same
-- atomic command. The domain owner still performs paused -> active ->
-- completed/failed; the normalized execution row persists the final state,
-- while the new attempt remains append-only proof of the resumed interval.
CREATE OR REPLACE FUNCTION party_runtime.activity_execution_temporal_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'active' OR NEW.state_version<>1
      OR NEW.next_attempt_ordinal<>0
      OR NEW.terminal_change_set_id IS NOT NULL THEN
      RAISE EXCEPTION 'activity execution initial state is invalid';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT (
      NEW.state_version=OLD.state_version+1
      OR (OLD.status='paused'
        AND NEW.status IN ('completed','failed')
        AND NEW.state_version=OLD.state_version+2
        AND NEW.next_attempt_ordinal=OLD.next_attempt_ordinal+1
        AND NEW.terminal_change_set_id IS NOT NULL)
    )
    OR NEW.id<>OLD.id
    OR NEW.route_plan_execution_id<>OLD.route_plan_execution_id
    OR NEW.plan_step_ordinal<>OLD.plan_step_ordinal
    OR NEW.series_ordinal<>OLD.series_ordinal
    OR NEW.predecessor_activity_execution_id
      IS DISTINCT FROM OLD.predecessor_activity_execution_id
    OR NEW.activity_snapshot<>OLD.activity_snapshot
    OR NEW.started_at_whole_minutes<>OLD.started_at_whole_minutes
    OR NEW.started_at_subminute_numerator
      <>OLD.started_at_subminute_numerator
    OR NEW.started_at_subminute_denominator
      <>OLD.started_at_subminute_denominator THEN
    RAISE EXCEPTION
      'activity execution identity, static snapshot or state version changed';
  END IF;
  IF NOT (
    (OLD.status='active'
      AND NEW.status IN ('active','paused','completed','failed','aborted'))
    OR (OLD.status='paused' AND NEW.status IN ('active','aborted'))
    OR (OLD.status='paused'
      AND NEW.status IN ('completed','failed')
      AND NEW.state_version=OLD.state_version+2
      AND NEW.next_attempt_ordinal=OLD.next_attempt_ordinal+1
      AND NEW.terminal_change_set_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'activity execution lifecycle transition is invalid';
  END IF;
  IF NEW.next_attempt_ordinal<OLD.next_attempt_ordinal THEN
    RAISE EXCEPTION 'activity attempt cursor cannot decrease';
  END IF;
  IF OLD.last_processed_at_whole_minutes IS NOT NULL
    AND (NEW.last_processed_at_whole_minutes
      < OLD.last_processed_at_whole_minutes
      OR (NEW.last_processed_at_whole_minutes
        = OLD.last_processed_at_whole_minutes
        AND NEW.last_processed_at_subminute_numerator
          * OLD.last_processed_at_subminute_denominator
          < OLD.last_processed_at_subminute_numerator
            * NEW.last_processed_at_subminute_denominator)) THEN
    RAISE EXCEPTION 'activity last_processed_at must be monotonic';
  END IF;
  IF NEW.cumulative_elapsed_numerator*OLD.cumulative_elapsed_denominator
    < OLD.cumulative_elapsed_numerator*NEW.cumulative_elapsed_denominator THEN
    RAISE EXCEPTION 'activity elapsed time cannot decrease';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.activity_attempt_ordinal_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
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
  SELECT * INTO execution_row
    FROM party_runtime.party_timed_activity_executions
    WHERE id=execution_id_value;
  IF execution_row.id IS NULL
    OR execution_row.next_attempt_ordinal<>(
      SELECT count(*)
        FROM party_runtime.party_timed_activity_attempts a
        WHERE a.activity_execution_id=execution_id_value
    ) THEN
    RAISE EXCEPTION 'activity attempt ordinal/cursor mismatch';
  END IF;
  SELECT * INTO latest_attempt
    FROM party_runtime.party_timed_activity_attempts
    WHERE activity_execution_id=execution_id_value
    ORDER BY attempt_ordinal DESC LIMIT 1;
  IF latest_attempt.activity_execution_id IS NOT NULL AND (
    execution_row.last_processed_at_whole_minutes
      <>latest_attempt.ended_at_whole_minutes
    OR execution_row.last_processed_at_subminute_numerator
      <>latest_attempt.ended_at_subminute_numerator
    OR execution_row.last_processed_at_subminute_denominator
      <>latest_attempt.ended_at_subminute_denominator
  ) THEN
    RAISE EXCEPTION
      'activity last_processed_at does not match the latest attempt';
  END IF;
  IF execution_row.status IN ('completed','failed') AND (
    latest_attempt.activity_execution_id IS NULL
    OR latest_attempt.attempt_ordinal
      <>execution_row.next_attempt_ordinal-1
    OR latest_attempt.result_kind<>execution_row.status
    OR latest_attempt.result_change_set_id
      IS DISTINCT FROM execution_row.terminal_change_set_id
    OR latest_attempt.reason_code
      IS DISTINCT FROM execution_row.terminal_reason_code
    OR latest_attempt.cumulative_time_after_numerator
      * execution_row.cumulative_elapsed_denominator
      <>execution_row.cumulative_elapsed_numerator
        * latest_attempt.cumulative_time_after_denominator
    OR latest_attempt.remaining_after_numerator
      * execution_row.remaining_time_denominator
      <>execution_row.remaining_time_numerator
        * latest_attempt.remaining_after_denominator
    OR latest_attempt.progress_after IS DISTINCT FROM execution_row.progress
  ) THEN
    RAISE EXCEPTION
      'terminal activity execution does not match its append-only attempt';
  END IF;
  RETURN NEW;
END $$;
