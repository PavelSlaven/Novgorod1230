-- Equipment is a placement of an existing item and may be controlled by an
-- NPC or by a player character. Existing rows are not rewritten.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_item_placements'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%equipment_slot_category_id%'
        OR (
          pg_get_constraintdef(oid) LIKE '%physical_position%'
          AND pg_get_constraintdef(oid) LIKE '%holder_character_id%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_item_placements DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_actor_position_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_actor_position_check CHECK (
    (physical_position IS NOT NULL) = (
      holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL
    )
  );

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_equipment_slot_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_equipment_slot_check CHECK (
    equipment_slot_category_id IS NULL
    OR (
      physical_position = 'equipped'
      AND (holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL)
    )
  );

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_equipped_requires_slot_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_equipped_requires_slot_check CHECK (
    physical_position IS DISTINCT FROM 'equipped'
    OR equipment_slot_category_id IS NOT NULL
  );

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_containers'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) LIKE '%equipment_slot_category_id%'
        OR (
          pg_get_constraintdef(oid) LIKE '%physical_position%'
          AND pg_get_constraintdef(oid) LIKE '%holder_character_id%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_containers DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_actor_position_check;
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_actor_position_check CHECK (
    (physical_position IS NOT NULL) = (
      holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL
    )
  ) NOT VALID;

ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_equipment_slot_check;
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_equipment_slot_check CHECK (
    equipment_slot_category_id IS NULL
    OR (
      physical_position = 'equipped'
      AND (holder_npc_id IS NOT NULL OR holder_character_id IS NOT NULL)
    )
  );

ALTER TABLE party_runtime.party_containers
  DROP CONSTRAINT IF EXISTS party_containers_equipped_requires_slot_check;
ALTER TABLE party_runtime.party_containers
  ADD CONSTRAINT party_containers_equipped_requires_slot_check CHECK (
    physical_position IS DISTINCT FROM 'equipped'
    OR equipment_slot_category_id IS NOT NULL
  );
