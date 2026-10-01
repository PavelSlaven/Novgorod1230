-- Additive party-side schema for approved local line connections and F.1.1 traversal.
-- Existing site connections and interval history are retained byte-for-byte.
ALTER TABLE party_runtime.g5_site_connections
  ADD COLUMN line_kind_id text,
  ADD COLUMN line_kind_profile_ref jsonb,
  ADD COLUMN line_name text,
  ADD COLUMN line_discriminator text,
  ADD COLUMN line_direction_id text,
  ADD COLUMN line_toponym text,
  ADD COLUMN source_canonical_connection_ref jsonb;

ALTER TABLE party_runtime.g5_site_connections
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
  ADD COLUMN mirrored boolean NOT NULL DEFAULT false;

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
  ADD CONSTRAINT traveller_travel_states_closed_result_check
    CHECK (closed_result IN ('completed','interrupted_to_anchor','returned_to_departure','superseded')),
  ADD CONSTRAINT traveller_travel_states_terminal_state_check CHECK (
    status <> 'closed'
    OR (closed_result = 'completed' AND segment_progress_ppm = 1000000 AND mirrored = false)
    OR (closed_result = 'returned_to_departure' AND segment_progress_ppm = 1000000 AND mirrored = true)
    OR (closed_result = 'interrupted_to_anchor' AND segment_progress_ppm < 1000000)
    OR (closed_result = 'superseded' AND segment_progress_ppm < 1000000)
  );

ALTER TABLE party_runtime.party_traversal_interval_results
  ADD COLUMN turn_back boolean NOT NULL DEFAULT false;

ALTER TABLE party_runtime.party_traversal_interval_results
  DROP CONSTRAINT IF EXISTS party_traversal_interval_results_result_kind_check;

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
  );
