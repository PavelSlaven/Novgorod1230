-- Spatial v3 permits independent non-portal availability conditions.
-- A portal still requires an availability condition set. Preserve existing rows.
DO $$
DECLARE
  relation_name text;
  constraint_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['scene_movement_edges', 'g5_site_connections']
  LOOP
    FOR constraint_name IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = format('party_runtime.%I', relation_name)::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) =
          'CHECK (((portal_entity_id IS NOT NULL) = (availability_condition_set_ref IS NOT NULL)))'
    LOOP
      EXECUTE format('ALTER TABLE party_runtime.%I DROP CONSTRAINT %I',
        relation_name, constraint_name);
    END LOOP;
    constraint_name := relation_name || '_portal_requires_availability_check';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid = format('party_runtime.%I', relation_name)::regclass
        AND conname = constraint_name)
    THEN
      EXECUTE format('ALTER TABLE party_runtime.%I ADD CONSTRAINT %I CHECK
        (portal_entity_id IS NULL OR availability_condition_set_ref IS NOT NULL)',
        relation_name, constraint_name);
    END IF;
  END LOOP;
END $$;
