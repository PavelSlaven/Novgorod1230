-- PR8 current-target only. Production v2 remains unchanged until the
-- versioned production activation cutover.
ALTER TABLE party_runtime.preparation_snapshot_members
  ADD COLUMN IF NOT EXISTS prepared_scene_materialization jsonb;

ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_check;
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_check1;
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_branch_check;
ALTER TABLE party_runtime.preparation_snapshot_members
  DROP CONSTRAINT IF EXISTS preparation_snapshot_members_prepared_object_check;

ALTER TABLE party_runtime.preparation_snapshot_members
  ADD CONSTRAINT preparation_snapshot_members_branch_check CHECK (
    (
      member_kind = 'endpoint'
      AND resolved_endpoint_snapshot IS NOT NULL
      AND resolved_scene_baseline_id IS NULL
      AND resolved_g6_instance_id IS NULL
      AND resolved_position_id IS NULL
      AND prepared_scene_materialization IS NULL
    )
    OR
    (
      member_kind = 'transfer_scene'
      AND resolved_endpoint_snapshot IS NULL
      AND (
        (
          resolved_scene_baseline_id IS NOT NULL
          AND resolved_g6_instance_id IS NOT NULL
          AND resolved_position_id IS NOT NULL
          AND prepared_scene_materialization IS NULL
        )
        OR
        (
          resolved_scene_baseline_id IS NULL
          AND resolved_g6_instance_id IS NULL
          AND resolved_position_id IS NULL
          AND prepared_scene_materialization IS NOT NULL
        )
      )
    )
  );

ALTER TABLE party_runtime.preparation_snapshot_members
  ADD CONSTRAINT preparation_snapshot_members_prepared_object_check CHECK (
    prepared_scene_materialization IS NULL
    OR jsonb_typeof(prepared_scene_materialization) = 'object'
  );
