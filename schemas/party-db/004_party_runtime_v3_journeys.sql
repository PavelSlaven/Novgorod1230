-- Target-only spatial v3 journey carriers, exact time and commit envelopes.
-- It is deliberately absent from the production migration composition until P28.
CREATE SCHEMA IF NOT EXISTS party_runtime;

CREATE TABLE IF NOT EXISTS party_runtime.party_v3_change_sets (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  operation_kind text NOT NULL, expected_state_version_set_digest text NOT NULL,
  expected_state_version_set jsonb NOT NULL CHECK(jsonb_typeof(expected_state_version_set) = 'array'),
  committed_state_version_set_digest text NOT NULL, write_plan_digest text NOT NULL,
  parent_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0), committed_at_turn bigint NOT NULL CHECK(committed_at_turn >= 0),
  UNIQUE(party_id, operation_kind, write_plan_digest)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_change_set_write_plans (
  change_set_id text PRIMARY KEY REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  canonical_write_plan jsonb NOT NULL, canonical_write_plan_digest text NOT NULL,
  expected_state_version_set jsonb NOT NULL, expected_state_version_set_digest text NOT NULL, lock_key_set jsonb NOT NULL,
  CHECK(jsonb_typeof(expected_state_version_set) = 'array'), CHECK(jsonb_typeof(lock_key_set) = 'array')
);

CREATE TABLE IF NOT EXISTS party_runtime.party_command_idempotency (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  operation_kind text NOT NULL, idempotency_key text NOT NULL, parent_record_id text REFERENCES party_runtime.party_command_idempotency(id) ON DELETE RESTRICT,
  child_ordinal integer CHECK(child_ordinal >= 0), canonical_input_digest text NOT NULL, expected_state_version_set_digest text NOT NULL,
  status text NOT NULL CHECK(status IN ('leased','committed','failed_terminal')), lease_token text, lease_expires_at timestamptz,
  result_change_set_id text REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  terminal_failure_code text, terminal_failure_digest text,
  created_at_turn bigint NOT NULL CHECK(created_at_turn >= 0), finalized_at_turn bigint,
  UNIQUE(party_id, operation_kind, idempotency_key),
  UNIQUE(parent_record_id, child_ordinal),
  CHECK((parent_record_id IS NULL) = (child_ordinal IS NULL)),
  CHECK((status = 'leased') = (result_change_set_id IS NULL AND terminal_failure_code IS NULL AND terminal_failure_digest IS NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK((status = 'committed') = (result_change_set_id IS NOT NULL AND terminal_failure_code IS NULL AND terminal_failure_digest IS NULL AND finalized_at_turn IS NOT NULL)),
  CHECK((status = 'failed_terminal') = (result_change_set_id IS NULL AND terminal_failure_code IS NOT NULL AND terminal_failure_digest IS NOT NULL AND finalized_at_turn IS NOT NULL))
);
ALTER TABLE party_runtime.party_command_idempotency ADD COLUMN IF NOT EXISTS state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1);

CREATE TABLE IF NOT EXISTS party_runtime.party_cohorts (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  pace_rule_ref jsonb NOT NULL, status text NOT NULL CHECK(status IN ('active','split','merged','retired')),
  state_version bigint NOT NULL CHECK(state_version >= 0), created_change_set_id text NOT NULL, updated_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);

CREATE TABLE IF NOT EXISTS party_runtime.party_cohort_memberships (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  cohort_id text NOT NULL REFERENCES party_runtime.party_cohorts(id) ON DELETE RESTRICT, actor_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','left','split','merged')), state_version bigint NOT NULL CHECK(state_version >= 0),
  joined_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_cohort_membership_actor_active_uq ON party_runtime.party_cohort_memberships(party_id, actor_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS party_runtime.party_carrier_attachments (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  subject_kind text NOT NULL CHECK(subject_kind IN ('actor','cohort')), subject_id text NOT NULL,
  carrier_kind text NOT NULL CHECK(carrier_kind IN ('cohort','transport')), carrier_id text NOT NULL,
  status text NOT NULL CHECK(status IN ('active','detached')), state_version bigint NOT NULL CHECK(state_version >= 0),
  attached_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK(NOT (subject_kind = carrier_kind AND subject_id = carrier_id)),
  CHECK((subject_kind = 'actor' AND carrier_kind IN ('cohort','transport')) OR (subject_kind = 'cohort' AND carrier_kind = 'transport')),
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_carrier_attachment_subject_active_uq ON party_runtime.party_carrier_attachments(party_id, subject_kind, subject_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS party_runtime.party_journey_locations (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  owner_kind text NOT NULL CHECK(owner_kind IN ('actor','cohort','transport')), owner_id text NOT NULL,
  location_kind text NOT NULL CHECK(location_kind IN ('scene','transit_anchor','in_transit')),
  scene_position_id text REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  transit_anchor_id text REFERENCES party_runtime.party_transit_anchors(id) ON DELETE RESTRICT,
  travel_state_id text REFERENCES party_runtime.traveller_travel_states(id) ON DELETE RESTRICT,
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL,
  CHECK((location_kind = 'scene') = (scene_position_id IS NOT NULL AND transit_anchor_id IS NULL AND travel_state_id IS NULL)),
  CHECK((location_kind = 'transit_anchor') = (scene_position_id IS NULL AND transit_anchor_id IS NOT NULL AND travel_state_id IS NULL)),
  CHECK((location_kind = 'in_transit') = (scene_position_id IS NULL AND transit_anchor_id IS NULL AND travel_state_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_journey_location_root_owner_uq ON party_runtime.party_journey_locations(party_id, owner_kind, owner_id);

CREATE TABLE IF NOT EXISTS party_runtime.party_actor_carrier_positions (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_id text NOT NULL, root_carrier_kind text NOT NULL CHECK(root_carrier_kind IN ('cohort','transport')), root_carrier_id text NOT NULL,
  scene_baseline_id text NOT NULL REFERENCES party_runtime.party_scene_baselines(id) ON DELETE RESTRICT,
  g6_instance_id text NOT NULL REFERENCES party_runtime.party_g6_instances(id) ON DELETE RESTRICT,
  position_node_id text NOT NULL REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN ('active','cleared')), state_version bigint NOT NULL CHECK(state_version >= 0), created_change_set_id text NOT NULL, terminal_change_set_id text,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS party_actor_carrier_position_active_uq ON party_runtime.party_actor_carrier_positions(party_id, actor_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS party_runtime.party_clocks (
  party_id text PRIMARY KEY REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  whole_minutes numeric NOT NULL CHECK(whole_minutes >= 0 AND party_runtime.integral_numeric(whole_minutes)), subminute_numerator numeric NOT NULL CHECK(subminute_numerator >= 0 AND party_runtime.integral_numeric(subminute_numerator)), subminute_denominator numeric NOT NULL CHECK(subminute_denominator > 0 AND party_runtime.integral_numeric(subminute_denominator)),
  clock_owner_kind text NOT NULL CHECK(clock_owner_kind IN ('party','cohort','transport')), clock_owner_id text,
  state_version bigint NOT NULL CHECK(state_version >= 0), updated_change_set_id text NOT NULL,
  CHECK(subminute_numerator < subminute_denominator), CHECK(gcd(subminute_numerator, subminute_denominator) = 1),
  CHECK((clock_owner_kind = 'party') = (clock_owner_id IS NULL))
);

CREATE TABLE IF NOT EXISTS party_runtime.party_clock_owner_handoffs (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  old_owner_kind text NOT NULL CHECK(old_owner_kind IN ('party','cohort','transport')), old_owner_id text,
  new_owner_kind text NOT NULL CHECK(new_owner_kind IN ('party','cohort','transport')), new_owner_id text,
  effective_whole_minutes numeric NOT NULL CHECK(effective_whole_minutes >= 0 AND party_runtime.integral_numeric(effective_whole_minutes)), effective_subminute_numerator numeric NOT NULL CHECK(effective_subminute_numerator >= 0 AND party_runtime.integral_numeric(effective_subminute_numerator)), effective_subminute_denominator numeric NOT NULL CHECK(effective_subminute_denominator > 0 AND party_runtime.integral_numeric(effective_subminute_denominator)),
  change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  CHECK(effective_subminute_numerator < effective_subminute_denominator), CHECK(gcd(effective_subminute_numerator,effective_subminute_denominator)=1),
  CHECK((old_owner_kind='party')=(old_owner_id IS NULL)), CHECK((new_owner_kind='party')=(new_owner_id IS NULL)),
  UNIQUE(party_id, change_set_id), UNIQUE(party_id, effective_whole_minutes, effective_subminute_numerator, effective_subminute_denominator, new_owner_kind, new_owner_id)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_synchronized_time_slices (
  id text PRIMARY KEY, party_id text NOT NULL REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  root_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  root_travel_state_id text NOT NULL REFERENCES party_runtime.traveller_travel_states(id) ON DELETE RESTRICT,
  clock_owner_kind text NOT NULL CHECK(clock_owner_kind IN ('cohort','transport')), clock_owner_id text NOT NULL,
  elapsed_numerator numeric NOT NULL CHECK(elapsed_numerator > 0 AND party_runtime.integral_numeric(elapsed_numerator)), elapsed_denominator numeric NOT NULL CHECK(elapsed_denominator > 0 AND party_runtime.integral_numeric(elapsed_denominator)),
  clock_before_whole_minutes numeric NOT NULL CHECK(clock_before_whole_minutes >= 0 AND party_runtime.integral_numeric(clock_before_whole_minutes)), clock_before_subminute_numerator numeric NOT NULL CHECK(clock_before_subminute_numerator >= 0 AND party_runtime.integral_numeric(clock_before_subminute_numerator)), clock_before_subminute_denominator numeric NOT NULL CHECK(clock_before_subminute_denominator > 0 AND party_runtime.integral_numeric(clock_before_subminute_denominator)),
  clock_after_whole_minutes numeric NOT NULL CHECK(clock_after_whole_minutes >= 0 AND party_runtime.integral_numeric(clock_after_whole_minutes)), clock_after_subminute_numerator numeric NOT NULL CHECK(clock_after_subminute_numerator >= 0 AND party_runtime.integral_numeric(clock_after_subminute_numerator)), clock_after_subminute_denominator numeric NOT NULL CHECK(clock_after_subminute_denominator > 0 AND party_runtime.integral_numeric(clock_after_subminute_denominator)),
  crossed_whole_minute_boundaries numeric NOT NULL CHECK(crossed_whole_minute_boundaries >= 0 AND party_runtime.integral_numeric(crossed_whole_minute_boundaries)), change_set_id text NOT NULL REFERENCES party_runtime.party_v3_change_sets(id) ON DELETE RESTRICT,
  idempotency_record_id text NOT NULL REFERENCES party_runtime.party_command_idempotency(id) ON DELETE RESTRICT,
  CHECK(gcd(elapsed_numerator, elapsed_denominator) = 1), CHECK(clock_before_subminute_numerator < clock_before_subminute_denominator), CHECK(gcd(clock_before_subminute_numerator, clock_before_subminute_denominator) = 1), CHECK(clock_after_subminute_numerator < clock_after_subminute_denominator), CHECK(gcd(clock_after_subminute_numerator, clock_after_subminute_denominator) = 1),
  UNIQUE(root_execution_id, change_set_id), UNIQUE(change_set_id)
);

CREATE TABLE IF NOT EXISTS party_runtime.party_synchronized_time_slice_results (
  id text PRIMARY KEY, slice_id text NOT NULL REFERENCES party_runtime.party_synchronized_time_slices(id) ON DELETE RESTRICT,
  participant_execution_id text NOT NULL REFERENCES party_runtime.party_route_plan_executions(id) ON DELETE RESTRICT,
  participant_actor_id text, result_kind text NOT NULL CHECK(result_kind IN ('root_traversal','carrier_local_activity','carrier_local_traversal','blocked','paused','failed')),
  elapsed_numerator numeric NOT NULL CHECK(elapsed_numerator >= 0 AND party_runtime.integral_numeric(elapsed_numerator)), elapsed_denominator numeric NOT NULL CHECK(elapsed_denominator > 0 AND party_runtime.integral_numeric(elapsed_denominator)),
  result_ref jsonb NOT NULL, CHECK(gcd(elapsed_numerator, elapsed_denominator) = 1), UNIQUE(slice_id, participant_execution_id)
);

CREATE OR REPLACE FUNCTION party_runtime.v3_journey_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'spatial_immutable_payload_violation: %', TG_TABLE_NAME; END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_journey_deferred_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject_kind_value text; subject_id_value text; party_value text; attachment_depth integer; attachment_cycle boolean;
BEGIN
  IF TG_TABLE_NAME = 'party_journey_locations' THEN
    IF EXISTS(SELECT 1 FROM party_runtime.party_carrier_attachments a WHERE a.party_id=NEW.party_id AND a.subject_kind=NEW.owner_kind AND a.subject_id=NEW.owner_id AND a.status='active') THEN RAISE EXCEPTION 'spatial_root_authority_xor_violation: attached owner has own journey location'; END IF;
    IF NEW.owner_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.owner_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_journey_location_cohort_owner_invalid'; END IF;
    IF NEW.location_kind='scene' AND NOT EXISTS(SELECT 1 FROM party_runtime.scene_position_nodes p JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id JOIN party_runtime.party_scene_baselines b ON b.id=g.scene_baseline_id WHERE p.id=NEW.scene_position_id AND p.party_id=NEW.party_id AND g.party_id=NEW.party_id AND b.party_id=NEW.party_id AND p.status='active' AND g.status='active' AND b.status='active') THEN RAISE EXCEPTION 'spatial_journey_location_scene_context_invalid'; END IF;
    IF NEW.location_kind='transit_anchor' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_transit_anchors a WHERE a.id=NEW.transit_anchor_id AND a.party_id=NEW.party_id AND a.status='active') THEN RAISE EXCEPTION 'spatial_journey_location_anchor_context_invalid'; END IF;
    IF NEW.location_kind='in_transit' AND NOT EXISTS(SELECT 1 FROM party_runtime.traveller_travel_states t JOIN party_runtime.party_route_plan_executions e ON e.id=t.route_plan_execution_id WHERE t.id=NEW.travel_state_id AND t.party_id=NEW.party_id AND e.party_id=NEW.party_id AND t.status IN ('active','paused_in_transit','stranded_in_transit')) THEN RAISE EXCEPTION 'spatial_journey_location_travel_context_invalid'; END IF;
  ELSIF TG_TABLE_NAME = 'party_carrier_attachments' THEN
    IF NEW.status='active' THEN
      IF NEW.subject_kind='actor' AND NEW.carrier_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c JOIN party_runtime.party_cohort_memberships m ON m.cohort_id=c.id WHERE c.id=NEW.carrier_id AND c.party_id=NEW.party_id AND c.status='active' AND m.party_id=NEW.party_id AND m.actor_id=NEW.subject_id AND m.status='active') THEN RAISE EXCEPTION 'spatial_actor_cohort_attachment_membership_invalid'; END IF;
      IF NEW.subject_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.subject_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_cohort_attachment_subject_invalid'; END IF;
      IF EXISTS(SELECT 1 FROM party_runtime.party_journey_locations l WHERE l.party_id=NEW.party_id AND l.owner_kind=NEW.subject_kind AND l.owner_id=NEW.subject_id) THEN RAISE EXCEPTION 'spatial_root_authority_xor_violation: attached subject has own journey location'; END IF;
      WITH RECURSIVE chain(kind,id,depth,path,cycle) AS (
        SELECT NEW.carrier_kind,NEW.carrier_id,1,ARRAY[NEW.subject_kind || ':' || NEW.subject_id, NEW.carrier_kind || ':' || NEW.carrier_id],false
        UNION ALL SELECT a.carrier_kind,a.carrier_id,c.depth+1,c.path || (a.carrier_kind || ':' || a.carrier_id),(a.carrier_kind || ':' || a.carrier_id)=ANY(c.path)
        FROM chain c JOIN party_runtime.party_carrier_attachments a ON a.party_id=NEW.party_id AND a.status='active' AND a.subject_kind=c.kind AND a.subject_id=c.id WHERE c.depth < 3 AND NOT c.cycle
      ) SELECT coalesce(max(depth),1),coalesce(bool_or(cycle),false) INTO attachment_depth,attachment_cycle FROM chain;
      IF attachment_cycle OR attachment_depth > 2 THEN RAISE EXCEPTION 'spatial_carrier_attachment_graph_invalid: cycle or depth'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'party_cohort_memberships' THEN
    IF NEW.status='active' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.cohort_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_cohort_membership_cohort_invalid'; END IF;
    IF NEW.status='active' AND EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions e WHERE e.party_id=NEW.party_id AND e.status IN ('planned','active','waiting_at_anchor','suspended_at_scene','stranded_in_transit') AND e.journey_scope='world_travel' AND e.journey_owner_ref->>'entity_kind'='actor' AND e.journey_owner_ref->>'entity_id'=NEW.actor_id) THEN RAISE EXCEPTION 'spatial_cohort_member_independent_world_travel'; END IF;
  ELSIF TG_TABLE_NAME = 'party_cohorts' THEN
    IF NEW.status<>'active' AND (EXISTS(SELECT 1 FROM party_runtime.party_cohort_memberships m WHERE m.cohort_id=NEW.id AND m.party_id=NEW.party_id AND m.status='active') OR EXISTS(SELECT 1 FROM party_runtime.party_carrier_attachments a WHERE a.party_id=NEW.party_id AND a.status='active' AND ((a.subject_kind='actor' AND a.carrier_kind='cohort' AND a.carrier_id=NEW.id) OR (a.subject_kind='cohort' AND a.subject_id=NEW.id))) OR EXISTS(SELECT 1 FROM party_runtime.party_journey_locations l WHERE l.party_id=NEW.party_id AND l.owner_kind='cohort' AND l.owner_id=NEW.id) OR EXISTS(SELECT 1 FROM party_runtime.party_clocks c WHERE c.party_id=NEW.party_id AND c.clock_owner_kind='cohort' AND c.clock_owner_id=NEW.id) OR EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions e WHERE e.party_id=NEW.party_id AND e.journey_scope='world_travel' AND e.status IN ('planned','active','waiting_at_anchor','suspended_at_scene','stranded_in_transit') AND e.journey_owner_ref->>'entity_kind'='cohort' AND e.journey_owner_ref->>'entity_id'=NEW.id)) THEN RAISE EXCEPTION 'spatial_cohort_terminal_dependents_active'; END IF;
  ELSIF TG_TABLE_NAME = 'party_actor_carrier_positions' THEN
    IF NEW.status='active' AND NEW.root_carrier_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.root_carrier_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_actor_carrier_position_cohort_root_invalid'; END IF;
    IF NEW.status='active' AND NOT EXISTS(SELECT 1 FROM party_runtime.scene_position_nodes p JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id JOIN party_runtime.party_scene_baselines b ON b.id=g.scene_baseline_id WHERE p.id=NEW.position_node_id AND p.g6_instance_id=NEW.g6_instance_id AND g.scene_baseline_id=NEW.scene_baseline_id AND p.party_id=NEW.party_id AND g.party_id=NEW.party_id AND b.party_id=NEW.party_id AND p.status='active' AND g.status='active' AND b.status='active') THEN RAISE EXCEPTION 'spatial_actor_carrier_position_context_invalid'; END IF;
    IF NEW.status='active' AND NOT EXISTS(WITH RECURSIVE chain(kind,id,depth) AS (SELECT a.carrier_kind,a.carrier_id,1 FROM party_runtime.party_carrier_attachments a WHERE a.party_id=NEW.party_id AND a.subject_kind='actor' AND a.subject_id=NEW.actor_id AND a.status='active' UNION ALL SELECT a.carrier_kind,a.carrier_id,c.depth+1 FROM chain c JOIN party_runtime.party_carrier_attachments a ON a.party_id=NEW.party_id AND a.subject_kind=c.kind AND a.subject_id=c.id AND a.status='active' WHERE c.depth<2) SELECT 1 FROM chain WHERE kind=NEW.root_carrier_kind AND id=NEW.root_carrier_id) THEN RAISE EXCEPTION 'spatial_actor_carrier_position_attachment_invalid'; END IF;
  ELSIF TG_TABLE_NAME = 'party_synchronized_time_slices' THEN
    IF NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions e JOIN party_runtime.traveller_travel_states s ON s.id=NEW.root_travel_state_id JOIN party_runtime.party_clocks c ON c.party_id=NEW.party_id WHERE e.id=NEW.root_execution_id AND e.party_id=NEW.party_id AND s.party_id=NEW.party_id AND e.journey_scope='world_travel' AND s.route_plan_execution_id=e.id AND e.journey_owner_ref->>'entity_kind'=NEW.clock_owner_kind AND e.journey_owner_ref->>'entity_id'=NEW.clock_owner_id AND c.clock_owner_kind=NEW.clock_owner_kind AND c.clock_owner_id=NEW.clock_owner_id AND c.whole_minutes=NEW.clock_after_whole_minutes AND c.subminute_numerator=NEW.clock_after_subminute_numerator AND c.subminute_denominator=NEW.clock_after_subminute_denominator) THEN RAISE EXCEPTION 'spatial_synchronized_slice_root_or_clock_invalid'; END IF;
    IF NEW.clock_after_whole_minutes < NEW.clock_before_whole_minutes OR (NEW.clock_after_whole_minutes=NEW.clock_before_whole_minutes AND NEW.clock_after_subminute_numerator * NEW.clock_before_subminute_denominator < NEW.clock_before_subminute_numerator * NEW.clock_after_subminute_denominator) THEN RAISE EXCEPTION 'spatial_clock_non_monotonic'; END IF;
    IF (((NEW.clock_after_whole_minutes-NEW.clock_before_whole_minutes)*NEW.clock_after_subminute_denominator*NEW.clock_before_subminute_denominator+NEW.clock_after_subminute_numerator*NEW.clock_before_subminute_denominator-NEW.clock_before_subminute_numerator*NEW.clock_after_subminute_denominator)*NEW.elapsed_denominator) <> (NEW.elapsed_numerator*NEW.clock_after_subminute_denominator*NEW.clock_before_subminute_denominator) THEN RAISE EXCEPTION 'spatial_synchronized_slice_clock_delta_invalid'; END IF;
    IF NEW.crossed_whole_minute_boundaries<>(NEW.clock_after_whole_minutes-NEW.clock_before_whole_minutes) THEN RAISE EXCEPTION 'spatial_synchronized_slice_boundary_count_invalid'; END IF;
  ELSIF TG_TABLE_NAME = 'party_synchronized_time_slice_results' THEN
    IF NEW.result_kind='root_traversal' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_synchronized_time_slices s WHERE s.id=NEW.slice_id AND s.root_execution_id=NEW.participant_execution_id) THEN RAISE EXCEPTION 'spatial_synchronized_slice_root_result_invalid'; END IF;
    IF NEW.result_kind IN ('carrier_local_activity','carrier_local_traversal') AND NOT EXISTS(SELECT 1 FROM party_runtime.party_route_plan_executions e WHERE e.id=NEW.participant_execution_id AND e.journey_scope='carrier_local') THEN RAISE EXCEPTION 'spatial_synchronized_slice_scope_invalid'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_clock_deferred_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.clock_owner_kind='cohort' AND NOT EXISTS(SELECT 1 FROM party_runtime.party_cohorts c WHERE c.id=NEW.clock_owner_id AND c.party_id=NEW.party_id AND c.status='active') THEN RAISE EXCEPTION 'spatial_clock_cohort_owner_invalid'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_clock_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.whole_minutes < OLD.whole_minutes OR (NEW.whole_minutes=OLD.whole_minutes AND NEW.subminute_numerator * OLD.subminute_denominator < OLD.subminute_numerator * NEW.subminute_denominator) THEN RAISE EXCEPTION 'spatial_clock_non_monotonic'; END IF;
  IF NEW.state_version<>OLD.state_version+1 THEN RAISE EXCEPTION 'spatial_clock_state_version_invalid'; END IF;
  IF (NEW.clock_owner_kind<>OLD.clock_owner_kind OR NEW.clock_owner_id IS DISTINCT FROM OLD.clock_owner_id) AND NOT EXISTS(SELECT 1 FROM party_runtime.party_clock_owner_handoffs h JOIN party_runtime.party_v3_change_sets c ON c.id=h.change_set_id AND c.party_id=h.party_id WHERE h.party_id=NEW.party_id AND h.change_set_id=NEW.updated_change_set_id AND c.operation_kind='clock_handoff' AND h.old_owner_kind=OLD.clock_owner_kind AND h.old_owner_id IS NOT DISTINCT FROM OLD.clock_owner_id AND h.new_owner_kind=NEW.clock_owner_kind AND h.new_owner_id IS NOT DISTINCT FROM NEW.clock_owner_id AND h.effective_whole_minutes=NEW.whole_minutes AND h.effective_subminute_numerator=NEW.subminute_numerator AND h.effective_subminute_denominator=NEW.subminute_denominator) THEN RAISE EXCEPTION 'spatial_clock_owner_handoff_invalid'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_clock_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'spatial_clock_delete_forbidden'; END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_clock_handoff_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'spatial_clock_handoff_immutable'; END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_change_set_write_plan_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM party_runtime.party_v3_change_sets c WHERE c.id=NEW.change_set_id AND c.write_plan_digest=NEW.canonical_write_plan_digest AND c.expected_state_version_set_digest=NEW.expected_state_version_set_digest AND c.expected_state_version_set=NEW.expected_state_version_set) THEN RAISE EXCEPTION 'spatial_change_set_write_plan_contract_invalid'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_idempotency_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF OLD.status IN ('committed','failed_terminal') THEN RAISE EXCEPTION 'spatial_idempotency_terminal_immutable'; END IF;
    IF NEW.party_id<>OLD.party_id OR NEW.operation_kind<>OLD.operation_kind OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.parent_record_id IS DISTINCT FROM OLD.parent_record_id OR NEW.child_ordinal IS DISTINCT FROM OLD.child_ordinal OR NEW.canonical_input_digest<>OLD.canonical_input_digest OR NEW.expected_state_version_set_digest<>OLD.expected_state_version_set_digest THEN RAISE EXCEPTION 'spatial_idempotency_payload_immutable'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION party_runtime.v3_synchronized_slice_result_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM party_runtime.party_synchronized_time_slice_results r WHERE r.slice_id=NEW.id AND r.result_kind='root_traversal' AND r.elapsed_numerator=NEW.elapsed_numerator AND r.elapsed_denominator=NEW.elapsed_denominator) THEN RAISE EXCEPTION 'spatial_synchronized_slice_missing_root_result'; END IF;
  IF EXISTS(SELECT 1 FROM party_runtime.party_synchronized_time_slice_results r WHERE r.slice_id=NEW.id AND r.result_kind IN ('carrier_local_activity','carrier_local_traversal') AND r.elapsed_numerator * NEW.elapsed_denominator > NEW.elapsed_numerator * r.elapsed_denominator) THEN RAISE EXCEPTION 'spatial_synchronized_slice_local_elapsed_invalid'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS v3_idempotency_integrity ON party_runtime.party_command_idempotency;
CREATE TRIGGER v3_idempotency_integrity BEFORE UPDATE ON party_runtime.party_command_idempotency FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_idempotency_integrity();
DROP TRIGGER IF EXISTS v3_clock_integrity ON party_runtime.party_clocks;
CREATE TRIGGER v3_clock_integrity BEFORE UPDATE ON party_runtime.party_clocks FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_clock_integrity();
DROP TRIGGER IF EXISTS v3_clock_no_delete ON party_runtime.party_clocks;
CREATE TRIGGER v3_clock_no_delete BEFORE DELETE ON party_runtime.party_clocks FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_clock_no_delete();
DROP TRIGGER IF EXISTS v3_clock_deferred_integrity ON party_runtime.party_clocks;
CREATE CONSTRAINT TRIGGER v3_clock_deferred_integrity AFTER INSERT OR UPDATE ON party_runtime.party_clocks DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_clock_deferred_integrity();
DROP TRIGGER IF EXISTS v3_clock_handoff_immutable ON party_runtime.party_clock_owner_handoffs;
CREATE TRIGGER v3_clock_handoff_immutable BEFORE UPDATE OR DELETE ON party_runtime.party_clock_owner_handoffs FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_clock_handoff_immutable();
DROP TRIGGER IF EXISTS v3_change_set_write_plan_immutable ON party_runtime.party_change_set_write_plans;
CREATE TRIGGER v3_change_set_write_plan_immutable BEFORE UPDATE OR DELETE ON party_runtime.party_change_set_write_plans FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_immutable();
DROP TRIGGER IF EXISTS v3_change_set_write_plan_integrity ON party_runtime.party_change_set_write_plans;
CREATE CONSTRAINT TRIGGER v3_change_set_write_plan_integrity AFTER INSERT OR UPDATE ON party_runtime.party_change_set_write_plans DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_change_set_write_plan_integrity();
DROP TRIGGER IF EXISTS v3_journey_location_integrity ON party_runtime.party_journey_locations;
CREATE CONSTRAINT TRIGGER v3_journey_location_integrity AFTER INSERT OR UPDATE ON party_runtime.party_journey_locations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_carrier_attachment_integrity ON party_runtime.party_carrier_attachments;
CREATE CONSTRAINT TRIGGER v3_carrier_attachment_integrity AFTER INSERT OR UPDATE ON party_runtime.party_carrier_attachments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_cohort_membership_integrity ON party_runtime.party_cohort_memberships;
CREATE CONSTRAINT TRIGGER v3_cohort_membership_integrity AFTER INSERT OR UPDATE ON party_runtime.party_cohort_memberships DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_cohort_integrity ON party_runtime.party_cohorts;
CREATE CONSTRAINT TRIGGER v3_cohort_integrity AFTER INSERT OR UPDATE ON party_runtime.party_cohorts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_actor_carrier_position_integrity ON party_runtime.party_actor_carrier_positions;
CREATE CONSTRAINT TRIGGER v3_actor_carrier_position_integrity AFTER INSERT OR UPDATE ON party_runtime.party_actor_carrier_positions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_sync_slice_integrity ON party_runtime.party_synchronized_time_slices;
CREATE CONSTRAINT TRIGGER v3_sync_slice_integrity AFTER INSERT OR UPDATE ON party_runtime.party_synchronized_time_slices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_sync_slice_result_integrity ON party_runtime.party_synchronized_time_slice_results;
CREATE CONSTRAINT TRIGGER v3_sync_slice_result_integrity AFTER INSERT OR UPDATE ON party_runtime.party_synchronized_time_slice_results DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_journey_deferred_integrity();
DROP TRIGGER IF EXISTS v3_sync_slice_results_complete ON party_runtime.party_synchronized_time_slices;
CREATE CONSTRAINT TRIGGER v3_sync_slice_results_complete AFTER INSERT OR UPDATE ON party_runtime.party_synchronized_time_slices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION party_runtime.v3_synchronized_slice_result_integrity();

CREATE INDEX IF NOT EXISTS party_v3_change_sets_party_lock_idx ON party_runtime.party_v3_change_sets(party_id, created_at_turn, id);
CREATE INDEX IF NOT EXISTS party_idempotency_party_lock_idx ON party_runtime.party_command_idempotency(party_id, operation_kind, idempotency_key);
CREATE INDEX IF NOT EXISTS party_route_execution_lock_idx ON party_runtime.party_route_plan_executions(party_id, status, id);
CREATE INDEX IF NOT EXISTS party_journey_location_lock_idx ON party_runtime.party_journey_locations(party_id, owner_kind, owner_id);
CREATE INDEX IF NOT EXISTS party_carrier_attachment_lock_idx ON party_runtime.party_carrier_attachments(party_id, subject_kind, subject_id) WHERE status='active';
