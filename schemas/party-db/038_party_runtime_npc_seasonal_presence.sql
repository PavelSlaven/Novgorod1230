-- Seasonal presence may leave an NPC's semantic PF unresolved while its physical
-- scene position remains known. Keep the two facts independently validated.
CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_party_reference_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  placement jsonb := NEW.causal_state_ref->'deferred_placement';
  presence_state text := NEW.causal_state_ref #>> '{routine_state,presence_state}';
BEGIN
  IF presence_state = 'offstage_away' THEN
    IF NEW.current_position_node_id IS NOT NULL
      OR (placement IS NOT NULL AND placement <> 'null'::jsonb) THEN
      RAISE EXCEPTION 'NPC away cannot carry a position or deferred placement (npc %, position %, deferred %)',
        NEW.npc_id, NEW.current_position_node_id, placement;
    END IF;
  ELSIF presence_state = 'location_gap' THEN
    IF placement IS NOT NULL AND placement <> 'null'::jsonb THEN
      RAISE EXCEPTION 'NPC location gap cannot carry deferred placement (npc %, deferred %)',
        NEW.npc_id, placement;
    END IF;
    IF NEW.current_position_node_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM party_runtime.scene_position_nodes position
      WHERE position.id=NEW.current_position_node_id AND position.party_id=NEW.party_id)
    THEN RAISE EXCEPTION 'npc schedule position belongs to another party'; END IF;
  ELSIF NEW.current_position_node_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM party_runtime.scene_position_nodes position
      WHERE position.id=NEW.current_position_node_id AND position.party_id=NEW.party_id)
    THEN RAISE EXCEPTION 'npc schedule position belongs to another party'; END IF;
  ELSIF placement->>'kind'='prepared_scene' THEN
    IF NOT EXISTS (SELECT 1 FROM party_runtime.preparation_snapshot_members member
      JOIN party_runtime.preparation_snapshots snapshot ON snapshot.id=member.preparation_snapshot_id
      WHERE snapshot.party_id=NEW.party_id
        AND member.preparation_snapshot_id=placement->>'snapshot_id'
        AND member.ordinal=(placement->>'member_ordinal')::integer)
    THEN RAISE EXCEPTION 'npc schedule prepared scope is absent or belongs to another party'; END IF;
  ELSIF placement->>'kind'='legacy_anchor' THEN
    IF NOT EXISTS (SELECT 1 FROM party_runtime.party_g5_anchors anchor
      WHERE anchor.party_id=NEW.party_id AND anchor.anchor_id=placement->>'anchor_id')
    THEN RAISE EXCEPTION 'npc schedule anchor is absent or belongs to another party'; END IF;
  ELSE
    RAISE EXCEPTION 'npc schedule requires an exact, approved deferred, or explicit seasonal placement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM party_runtime.party_npcs npc
    WHERE npc.party_id=NEW.party_id AND npc.npc_id=NEW.npc_id)
  THEN RAISE EXCEPTION 'npc schedule actor belongs to another party'; END IF;
  IF NEW.current_activity_execution_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM party_runtime.party_timed_activity_executions activity
    JOIN party_runtime.party_route_plan_executions execution ON execution.id=activity.route_plan_execution_id
    WHERE activity.id=NEW.current_activity_execution_id AND execution.party_id=NEW.party_id)
  THEN RAISE EXCEPTION 'npc schedule activity belongs to another party'; END IF;
  RETURN NEW;
END $$;

-- Schedule position and entity placement are one physical fact. Check their
-- final transaction state because the P16 writer may update either table first.
CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_placement_integrity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  check_party_id text;
  check_npc_id text;
  schedule_id text;
  schedule_status text;
  schedule_position text;
  presence_state text;
  deferred_placement jsonb;
  schedule_found boolean := false;
  placement_position text;
  placement_found boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'party_npc_spatial_schedules' THEN
    IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
    schedule_id := NEW.id;
    SELECT s.party_id, s.npc_id, s.status, s.current_position_node_id,
        s.causal_state_ref #>> '{routine_state,presence_state}',
        s.causal_state_ref->'deferred_placement'
      INTO check_party_id, check_npc_id, schedule_status, schedule_position,
        presence_state, deferred_placement
      FROM party_runtime.party_npc_spatial_schedules s
      WHERE s.id=schedule_id;
    schedule_found := FOUND;
    IF NOT schedule_found OR schedule_status <> 'active' THEN RETURN NULL; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      IF OLD.entity_kind <> 'npc' THEN RETURN NULL; END IF;
      check_party_id := OLD.party_id;
      check_npc_id := OLD.entity_id;
    ELSE
      IF NEW.entity_kind <> 'npc' THEN RETURN NULL; END IF;
      check_party_id := NEW.party_id;
      check_npc_id := NEW.entity_id;
    END IF;
    SELECT s.id, s.status, s.current_position_node_id,
        s.causal_state_ref #>> '{routine_state,presence_state}',
        s.causal_state_ref->'deferred_placement'
      INTO schedule_id, schedule_status, schedule_position,
        presence_state, deferred_placement
      FROM party_runtime.party_npc_spatial_schedules s
      WHERE s.party_id=check_party_id AND s.npc_id=check_npc_id
        AND s.status='active';
    schedule_found := FOUND;
    IF NOT schedule_found THEN RETURN NULL; END IF;
  END IF;

  SELECT p.position_node_id INTO placement_position
    FROM party_runtime.entity_placements p
    WHERE p.party_id=check_party_id AND p.entity_kind='npc' AND p.entity_id=check_npc_id;
  placement_found := FOUND;
  IF presence_state = 'offstage_away' THEN
    IF schedule_position IS NOT NULL OR placement_found
      OR (deferred_placement IS NOT NULL AND deferred_placement <> 'null'::jsonb) THEN
      RAISE EXCEPTION 'offstage NPC schedule requires no physical or deferred placement (npc %)', check_npc_id;
    END IF;
  ELSIF presence_state = 'location_gap' THEN
    IF deferred_placement IS NOT NULL AND deferred_placement <> 'null'::jsonb THEN
      RAISE EXCEPTION 'NPC location gap cannot carry deferred placement (npc %)', check_npc_id;
    END IF;
    IF schedule_position IS NULL AND placement_found THEN
      RAISE EXCEPTION 'positionless NPC location gap cannot retain entity placement (npc %)', check_npc_id;
    END IF;
    IF schedule_position IS NOT NULL
      AND (NOT placement_found OR placement_position IS DISTINCT FROM schedule_position) THEN
      RAISE EXCEPTION 'NPC location gap position must match existing entity placement (npc %, position %, placement %)',
        check_npc_id, schedule_position, placement_position;
    END IF;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS party_npc_schedule_placement_integrity_on_schedule ON party_runtime.party_npc_spatial_schedules;
CREATE CONSTRAINT TRIGGER party_npc_schedule_placement_integrity_on_schedule
AFTER INSERT OR UPDATE ON party_runtime.party_npc_spatial_schedules
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION party_runtime.party_npc_schedule_placement_integrity();

DROP TRIGGER IF EXISTS party_npc_schedule_placement_integrity_on_placement ON party_runtime.entity_placements;
CREATE CONSTRAINT TRIGGER party_npc_schedule_placement_integrity_on_placement
AFTER INSERT OR UPDATE OR DELETE ON party_runtime.entity_placements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION party_runtime.party_npc_schedule_placement_integrity();

-- A seasonal D-1 selection may replace the pinned routine profile. Keep all
-- schedule identity and candidate bindings immutable, and bind the new pin to
-- the profile and selected rule persisted in routine_state.
CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_lifecycle_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  before_rule jsonb := OLD.causal_state_ref #> '{routine_state,schedule_context,selected_rule_ref}';
  after_rule jsonb := NEW.causal_state_ref #> '{routine_state,schedule_context,selected_rule_ref}';
  before_profile jsonb := OLD.causal_state_ref #> '{routine_state,profile}';
  after_profile jsonb := NEW.causal_state_ref #> '{routine_state,profile}';
  seasonal_selection_changed boolean := before_rule IS DISTINCT FROM after_rule
    OR before_profile IS DISTINCT FROM after_profile;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.state_version<1 THEN RAISE EXCEPTION 'npc schedule state version is invalid'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.state_version<>OLD.state_version+1
    OR NEW.id<>OLD.id OR NEW.party_id<>OLD.party_id OR NEW.npc_id<>OLD.npc_id
    OR NEW.candidate_profile_refs<>OLD.candidate_profile_refs THEN
    RAISE EXCEPTION 'npc schedule identity or state version changed';
  END IF;
  IF NEW.schedule_profile_ref IS DISTINCT FROM OLD.schedule_profile_ref
    OR NEW.dependency_pins IS DISTINCT FROM OLD.dependency_pins
    OR seasonal_selection_changed THEN
    IF NOT seasonal_selection_changed
      OR after_profile->>'profile_id' IS NULL
      OR NEW.schedule_profile_ref->'entity_ref'->>'entity_kind' IS DISTINCT FROM 'activity_profile'
      OR NEW.schedule_profile_ref->'entity_ref'->>'entity_id' IS DISTINCT FROM after_profile->>'profile_id'
      OR NEW.schedule_profile_ref->>'authoring_version' IS DISTINCT FROM after_profile->>'revision'
      OR NEW.dependency_pins #>> '{pins,0,dependency_role}' IS DISTINCT FROM 'profile'
      OR NEW.dependency_pins #>> '{pins,0,entity_ref,entity_kind}' IS DISTINCT FROM 'activity_profile'
      OR NEW.dependency_pins #>> '{pins,0,entity_ref,entity_id}' IS DISTINCT FROM after_profile->>'profile_id'
      OR NEW.dependency_pins #>> '{pins,0,version_pin,authoring_version}' IS DISTINCT FROM after_profile->>'revision'
      OR after_rule->>'schedule_id' IS NULL
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
        NEW.causal_state_ref #> '{routine_state,schedule_context,approved_rule_rows}') rule
        WHERE rule->>'schedule_id'=after_rule->>'schedule_id'
          AND rule->>'schedule_version'=(after_rule->>'schedule_version')
          AND rule->>'world_revision_id'=after_rule->>'world_revision_id'
          AND rule #>> '{routine_profile,profile_id}'=after_profile->>'profile_id'
          AND rule #>> '{routine_profile,revision}'=after_profile->>'revision'
          AND rule->>'season' IS NOT NULL) THEN
      RAISE EXCEPTION 'npc schedule profile may change only with a pinned seasonal rule selection';
    END IF;
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
