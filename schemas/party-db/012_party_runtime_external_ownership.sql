ALTER TABLE party_runtime.party_ownership
  ADD COLUMN IF NOT EXISTS owner_external_ref JSONB;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
    FROM pg_constraint
   WHERE conrelid = 'party_runtime.party_ownership'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid)
       LIKE '%owner_npc_id IS NULL%owner_character_id IS NULL%owner_party%'
     AND pg_get_constraintdef(oid) NOT LIKE '%owner_external_ref%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE party_runtime.party_ownership DROP CONSTRAINT %I',
      constraint_name
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'party_runtime.party_ownership'::regclass
       AND conname = 'party_ownership_exactly_one_owner_check'
  ) THEN
    ALTER TABLE party_runtime.party_ownership
      ADD CONSTRAINT party_ownership_exactly_one_owner_check CHECK (
        (CASE WHEN owner_npc_id IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN owner_character_id IS NULL THEN 0 ELSE 1 END)
        + (CASE WHEN owner_party THEN 1 ELSE 0 END)
        + (CASE WHEN owner_external_ref IS NULL THEN 0 ELSE 1 END) = 1
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'party_runtime.party_ownership'::regclass
       AND conname = 'party_ownership_external_owner_ref_check'
  ) THEN
    ALTER TABLE party_runtime.party_ownership
      ADD CONSTRAINT party_ownership_external_owner_ref_check CHECK (
        owner_external_ref IS NULL OR (
          jsonb_typeof(owner_external_ref) = 'object'
          AND COALESCE(
            NULLIF(btrim(owner_external_ref->>'entity_kind'), ''), ''
          ) <> ''
          AND COALESCE(
            NULLIF(btrim(owner_external_ref->>'entity_id'), ''), ''
          ) <> ''
        )
      );
  END IF;
END $$;
