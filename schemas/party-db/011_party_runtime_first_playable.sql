-- First-playable vertical slice. This migration extends existing spatial-v3
-- owners; it does not introduce a second activity, placement, control, clock,
-- idempotency or save engine.

-- An approved local passage may consume an action unit while carrying no
-- authored minute cost. Its traversal interval still owns exact progress and
-- any approved additive hazard delay.
ALTER TABLE party_runtime.party_traversal_interval_results
  DROP CONSTRAINT
    party_traversal_interval_results_planned_time_numerator_check;
ALTER TABLE party_runtime.party_traversal_interval_results
  ADD CONSTRAINT
    party_traversal_interval_results_planned_time_numerator_check
  CHECK(
    planned_time_numerator >= 0
    AND party_runtime.integral_numeric(planned_time_numerator)
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM party_runtime.party_activity_resource_bindings
  ) THEN
    RAISE EXCEPTION
      'party_activity_resource_binding_repair_required: legacy reserved/consumed rows cannot be mapped automatically';
  END IF;
  IF EXISTS (
    SELECT 1 FROM party_runtime.party_timed_activity_executions
  ) THEN
    RAISE EXCEPTION
      'party_activity_execution_repair_required: existing executions lack approved owner and series identities';
  END IF;
END $$;

ALTER TABLE party_runtime.party_command_idempotency
  ADD COLUMN semantic_command_snapshot jsonb,
  ADD COLUMN semantic_command_digest text,
  ADD COLUMN semantic_dependency_pins jsonb,
  ADD COLUMN request_id text,
  ADD CONSTRAINT party_semantic_command_seal_ck CHECK (
    (semantic_command_snapshot IS NULL
      AND semantic_command_digest IS NULL
      AND semantic_dependency_pins IS NULL
      AND request_id IS NULL)
    OR
    (semantic_command_snapshot IS NOT NULL
      AND jsonb_typeof(semantic_command_snapshot) = 'object'
      AND NULLIF(semantic_command_digest,'') IS NOT NULL
      AND semantic_dependency_pins IS NOT NULL
      AND jsonb_typeof(semantic_dependency_pins) = 'object'
      AND NULLIF(request_id,'') IS NOT NULL)
  );

-- Public screen/session and legacy container projections participate in the
-- same P16 CAS transaction as their authoritative v3 state.  They remain
-- projections/legacy owners; these columns only provide an exact concurrency
-- boundary and change-set evidence.
ALTER TABLE party_runtime.party_server_sessions
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1
    CHECK(state_version >= 1),
  ADD COLUMN updated_change_set_id text;

ALTER TABLE party_runtime.party_containers
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1
    CHECK(state_version >= 1),
  ADD COLUMN updated_change_set_id text;

-- The existing immediate-action owner gains a standalone branch. The row ID
-- remains the canonical action_run_id.
ALTER TABLE party_runtime.party_action_step_runs
  ALTER COLUMN execution_id DROP NOT NULL,
  ALTER COLUMN plan_step_ordinal DROP NOT NULL,
  ADD COLUMN party_id text
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  ADD COLUMN action_scope text,
  ADD COLUMN origin_location_snapshot jsonb,
  ADD COLUMN originating_command_ref jsonb,
  ADD COLUMN originating_command_digest text;

ALTER TABLE party_runtime.party_action_step_runs
  ALTER COLUMN party_id SET NOT NULL,
  ALTER COLUMN action_scope SET NOT NULL,
  ADD CONSTRAINT party_immediate_action_scope_ck CHECK (
    action_scope IN ('route_step','standalone')
    AND (
      (
        action_scope = 'route_step'
        AND execution_id IS NOT NULL
        AND plan_step_ordinal IS NOT NULL
        AND origin_location_snapshot IS NULL
        AND originating_command_ref IS NULL
        AND originating_command_digest IS NULL
      )
      OR
      (
        action_scope = 'standalone'
        AND execution_id IS NULL
        AND plan_step_ordinal IS NULL
        AND jsonb_typeof(origin_location_snapshot) = 'object'
        AND jsonb_typeof(execution_context_snapshot) = 'object'
        AND jsonb_typeof(originating_command_ref) = 'object'
        AND NULLIF(originating_command_digest,'') IS NOT NULL
      )
    )
  );

-- One execution owner and lineage model for route-step and standalone activity.
ALTER TABLE party_runtime.party_timed_activity_executions
  ALTER COLUMN route_plan_execution_id DROP NOT NULL,
  ALTER COLUMN plan_step_ordinal DROP NOT NULL,
  ADD COLUMN execution_scope text,
  ADD COLUMN activity_series_id text,
  ADD COLUMN activity_owner_ref jsonb,
  ADD COLUMN origin_location_snapshot jsonb,
  ADD COLUMN execution_context_snapshot jsonb,
  ADD COLUMN originating_command_ref jsonb,
  ADD COLUMN originating_command_digest text,
  ADD COLUMN idempotency_record_id text
    REFERENCES party_runtime.party_command_idempotency(id) ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_timed_activity_executions
  ALTER COLUMN execution_scope SET NOT NULL,
  ALTER COLUMN activity_series_id SET NOT NULL,
  ALTER COLUMN activity_owner_ref SET NOT NULL;

ALTER TABLE party_runtime.party_timed_activity_executions
  ADD CONSTRAINT party_activity_execution_scope_ck CHECK (
    execution_scope IN ('route_step','standalone')
    AND jsonb_typeof(activity_owner_ref) = 'object'
    AND NULLIF(activity_owner_ref->>'entity_kind','') IS NOT NULL
    AND NULLIF(activity_owner_ref->>'entity_id','') IS NOT NULL
    AND (
      (
        execution_scope = 'route_step'
        AND route_plan_execution_id IS NOT NULL
        AND plan_step_ordinal IS NOT NULL
        AND origin_location_snapshot IS NULL
        AND execution_context_snapshot IS NULL
        AND originating_command_ref IS NULL
        AND originating_command_digest IS NULL
        AND idempotency_record_id IS NULL
      )
      OR
      (
        execution_scope = 'standalone'
        AND route_plan_execution_id IS NULL
        AND plan_step_ordinal IS NULL
        AND jsonb_typeof(origin_location_snapshot) = 'object'
        AND jsonb_typeof(execution_context_snapshot) = 'object'
        AND jsonb_typeof(originating_command_ref) = 'object'
        AND NULLIF(originating_command_digest,'') IS NOT NULL
        AND idempotency_record_id IS NOT NULL
      )
    )
  );

DROP INDEX IF EXISTS party_runtime.party_activity_one_nonterminal_uq;
CREATE UNIQUE INDEX party_activity_series_ordinal_uq
  ON party_runtime.party_timed_activity_executions(
    activity_series_id,
    series_ordinal
  );
CREATE UNIQUE INDEX party_activity_series_one_nonterminal_uq
  ON party_runtime.party_timed_activity_executions(activity_series_id)
  WHERE status IN ('active','paused');

-- ResourceBinding v1. No unit_id is introduced until the formal contract
-- registry defines its exact physical representation.
ALTER TABLE party_runtime.party_activity_resource_bindings
  DROP CONSTRAINT party_activity_resource_bindings_pkey,
  DROP CONSTRAINT party_activity_resource_bindings_binding_kind_check,
  ADD COLUMN consumption_policy_ref jsonb,
  ADD COLUMN state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1);

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid =
      'party_runtime.party_activity_resource_bindings'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_activity_resource_bindings DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE party_runtime.party_activity_resource_bindings
  ALTER COLUMN consumption_policy_ref SET NOT NULL,
  ADD CONSTRAINT party_activity_resource_binding_kind_ck CHECK (
    binding_kind IN (
      'required_tool',
      'reserved_input',
      'consumable_input',
      'output_target'
    )
  ),
  ADD CONSTRAINT party_activity_resource_binding_policy_ck CHECK (
    jsonb_typeof(consumption_policy_ref) = 'object'
  ),
  ADD PRIMARY KEY (
    activity_execution_id,
    resource_kind,
    resource_id,
    binding_kind
  );

-- The permanent owner/controller relation must survive transport departure.
ALTER TABLE party_runtime.party_entity_controls
  DROP CONSTRAINT IF EXISTS party_entity_controls_party_id_entity_kind_entity_id_fkey;

CREATE OR REPLACE FUNCTION
party_runtime.validate_first_playable_entity_control()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  affected_party_id text := COALESCE(NEW.party_id, OLD.party_id);
  control_row record;
  root_location record;
  placement_row record;
BEGIN
  FOR control_row IN
    SELECT *
    FROM party_runtime.party_entity_controls
    WHERE party_id = affected_party_id
  LOOP
    IF control_row.entity_kind = 'transport' THEN
      SELECT *
      INTO root_location
      FROM party_runtime.party_journey_locations
      WHERE party_id = control_row.party_id
        AND owner_kind = 'transport'
        AND owner_id = control_row.entity_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION
          'transport_root_location_required: %', control_row.entity_id;
      END IF;

      SELECT *
      INTO placement_row
      FROM party_runtime.entity_placements
      WHERE party_id = control_row.party_id
        AND entity_kind = 'transport'
        AND entity_id = control_row.entity_id;

      IF root_location.location_kind = 'scene' THEN
        IF NOT FOUND
          OR placement_row.placement_kind <> 'moored_at_position'
          OR placement_row.position_node_id
            IS DISTINCT FROM root_location.scene_position_id
        THEN
          RAISE EXCEPTION
            'transport_mooring_location_mismatch: %', control_row.entity_id;
        END IF;
      ELSIF FOUND THEN
        RAISE EXCEPTION
          'transport_transit_placement_forbidden: %', control_row.entity_id;
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM party_runtime.entity_placements placement
      WHERE placement.party_id = control_row.party_id
        AND placement.entity_kind = control_row.entity_kind
        AND placement.entity_id = control_row.entity_id
    ) THEN
      RAISE EXCEPTION
        'controlled_entity_placement_required: %:%',
        control_row.entity_kind,
        control_row.entity_id;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS first_playable_entity_control_on_control
  ON party_runtime.party_entity_controls;
CREATE CONSTRAINT TRIGGER first_playable_entity_control_on_control
AFTER INSERT OR UPDATE OR DELETE ON party_runtime.party_entity_controls
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.validate_first_playable_entity_control();

DROP TRIGGER IF EXISTS first_playable_entity_control_on_placement
  ON party_runtime.entity_placements;
CREATE CONSTRAINT TRIGGER first_playable_entity_control_on_placement
AFTER INSERT OR UPDATE OR DELETE ON party_runtime.entity_placements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.validate_first_playable_entity_control();

DROP TRIGGER IF EXISTS first_playable_entity_control_on_location
  ON party_runtime.party_journey_locations;
CREATE CONSTRAINT TRIGGER first_playable_entity_control_on_location
AFTER INSERT OR UPDATE OR DELETE ON party_runtime.party_journey_locations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION
  party_runtime.validate_first_playable_entity_control();

CREATE TABLE party_runtime.party_actor_profile_bindings (
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_kind text NOT NULL CHECK(actor_kind IN ('player_character','npc')),
  actor_id text NOT NULL,
  role_ref jsonb NOT NULL,
  occupation_ref jsonb NOT NULL,
  skill_profile_snapshot jsonb NOT NULL,
  name_profile_snapshot jsonb NOT NULL,
  language_profile_snapshot jsonb NOT NULL,
  knowledge_profile_snapshot jsonb NOT NULL,
  profile_candidate_set_digest text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,actor_kind,actor_id),
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_actor_body_states (
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_kind text NOT NULL CHECK(actor_kind IN ('player_character','npc')),
  actor_id text NOT NULL,
  body_profile_ref jsonb NOT NULL,
  health numeric NOT NULL CHECK(health >= 0),
  energy numeric NOT NULL CHECK(energy >= 0),
  satiety numeric NOT NULL CHECK(satiety >= 0),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,actor_kind,actor_id),
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_actor_active_conditions (
  party_id text NOT NULL,
  actor_kind text NOT NULL,
  actor_id text NOT NULL,
  condition_id text NOT NULL,
  condition_profile_ref jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('active','resolved')),
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  terminal_change_set_id text,
  PRIMARY KEY(party_id,actor_kind,actor_id,condition_id),
  FOREIGN KEY(party_id,actor_kind,actor_id)
    REFERENCES party_runtime.party_actor_body_states(
      party_id,actor_kind,actor_id
    ) ON DELETE CASCADE,
  CHECK((status = 'active') = (terminal_change_set_id IS NULL))
);

CREATE TABLE party_runtime.party_resource_nodes (
  resource_node_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  source_resource_ref jsonb NOT NULL,
  position_node_id text NOT NULL
    REFERENCES party_runtime.scene_position_nodes(id) ON DELETE RESTRICT,
  quantity_numerator numeric NOT NULL
    CHECK(quantity_numerator >= 0
      AND party_runtime.integral_numeric(quantity_numerator)),
  quantity_denominator numeric NOT NULL
    CHECK(quantity_denominator > 0
      AND party_runtime.integral_numeric(quantity_denominator)
      AND gcd(quantity_numerator,quantity_denominator) = 1),
  quantity_unit_ref jsonb NOT NULL,
  quality_ref jsonb NOT NULL,
  access_policy_ref jsonb NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  UNIQUE(party_id,resource_node_id),
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_transports (
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  transport_id text NOT NULL,
  transport_category_ref jsonb NOT NULL,
  transport_template_ref jsonb NOT NULL,
  applicability_snapshot jsonb NOT NULL,
  capacity_policy_ref jsonb NOT NULL,
  movement_capability_refs jsonb NOT NULL,
  control_requirement_ref jsonb NOT NULL,
  route_applicability_ref jsonb NOT NULL,
  transport_contract_digest text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  PRIMARY KEY(party_id,transport_id),
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_actor_relations (
  relation_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  subject_ref jsonb NOT NULL,
  object_ref jsonb NOT NULL,
  relation_category_ref jsonb NOT NULL,
  relation_state jsonb NOT NULL,
  causal_evidence_kind text NOT NULL CHECK(
    causal_evidence_kind IN (
      'interaction',
      'terminal_activity_attempt',
      'immediate_action',
      'traversal_interval'
    )
  ),
  causal_evidence_ref jsonb NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  updated_change_set_id text NOT NULL,
  FOREIGN KEY(party_id,created_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,updated_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);
CREATE UNIQUE INDEX party_actor_relation_semantic_identity_uq
  ON party_runtime.party_actor_relations(
    party_id,
    (subject_ref->>'entity_kind'),
    (subject_ref->>'entity_id'),
    (object_ref->>'entity_kind'),
    (object_ref->>'entity_id'),
    (relation_category_ref->>'entity_id')
  );

CREATE TABLE party_runtime.party_check_resolutions (
  check_resolution_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  check_scope_kind text NOT NULL CHECK(
    check_scope_kind IN (
      'immediate_action',
      'timed_activity_attempt',
      'traversal_interval'
    )
  ),
  check_scope_key jsonb NOT NULL,
  check_policy_ref jsonb NOT NULL,
  deterministic_roll_input_digest text NOT NULL,
  roll_value integer NOT NULL,
  modifier_snapshot jsonb NOT NULL,
  target_value integer NOT NULL,
  result_kind text NOT NULL CHECK(result_kind IN ('success','failure')),
  consequence_policy_ref jsonb NOT NULL,
  result_change_set_id text NOT NULL,
  canonical_digest text NOT NULL,
  UNIQUE(party_id,check_scope_kind,check_scope_key),
  FOREIGN KEY(party_id,result_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT
);

CREATE TABLE party_runtime.party_actor_npc_interactions (
  interaction_id text PRIMARY KEY,
  party_id text NOT NULL
    REFERENCES party_runtime.parties(party_id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  npc_id text NOT NULL,
  interaction_kind text NOT NULL CHECK(interaction_kind = 'conversation'),
  activity_execution_id text NOT NULL UNIQUE
    REFERENCES party_runtime.party_timed_activity_executions(id)
    ON DELETE RESTRICT,
  started_at jsonb NOT NULL,
  ended_at jsonb,
  location_ref jsonb NOT NULL,
  outcome text NOT NULL CHECK(outcome IN ('completed','failed','aborted')),
  terminal_change_set_id text NOT NULL,
  terminal_evidence_kind text NOT NULL CHECK(
    terminal_evidence_kind IN ('terminal_attempt','lifecycle_abort')
  ),
  terminal_evidence_ref jsonb NOT NULL,
  interaction_policy_ref jsonb NOT NULL,
  canonical_digest text NOT NULL,
  FOREIGN KEY(party_id,npc_id)
    REFERENCES party_runtime.party_npcs(party_id,npc_id)
    ON DELETE RESTRICT,
  FOREIGN KEY(party_id,terminal_change_set_id)
    REFERENCES party_runtime.party_v3_change_sets(party_id,id)
    ON DELETE RESTRICT,
  CHECK((outcome = 'aborted') = (terminal_evidence_kind = 'lifecycle_abort'))
);

CREATE TABLE party_runtime.party_actor_npc_interaction_summaries (
  summary_id text PRIMARY KEY,
  interaction_id text NOT NULL
    REFERENCES party_runtime.party_actor_npc_interactions(interaction_id)
    ON DELETE RESTRICT,
  summary_scope text NOT NULL
    CHECK(summary_scope IN ('player_journal','npc_memory')),
  remembering_subject_kind text NOT NULL,
  remembering_subject_id text NOT NULL,
  summary_text text NOT NULL,
  salience integer NOT NULL CHECK(salience >= 0),
  source_message_digest text NOT NULL,
  state_version bigint NOT NULL DEFAULT 1 CHECK(state_version >= 1),
  created_change_set_id text NOT NULL,
  UNIQUE(interaction_id,summary_scope,remembering_subject_kind,
    remembering_subject_id,source_message_digest)
);

CREATE TRIGGER first_playable_interaction_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_actor_npc_interactions
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();

CREATE TRIGGER first_playable_interaction_summary_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_actor_npc_interaction_summaries
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();

CREATE TRIGGER first_playable_check_resolution_append_only
BEFORE UPDATE OR DELETE
ON party_runtime.party_check_resolutions
FOR EACH ROW EXECUTE FUNCTION party_runtime.temporal_append_only();
