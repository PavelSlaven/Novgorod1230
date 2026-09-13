-- A committed NPC routine may precede materialization of its approved G6.
-- First entry binds the exact position; it does not restart the routine.
ALTER TABLE party_runtime.party_npc_spatial_schedules
  ALTER COLUMN current_position_node_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION party_runtime.party_npc_schedule_party_reference_valid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE placement jsonb := NEW.causal_state_ref->'deferred_placement';
BEGIN
  IF NEW.current_position_node_id IS NOT NULL THEN
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
    RAISE EXCEPTION 'npc schedule requires an exact or approved deferred placement';
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
