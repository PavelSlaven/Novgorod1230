-- Turn-step direct ordinary actions may create item instances without an
-- authored catalog template.  Such rows carry their complete, immutable
-- inventory mechanics input in party_items.state instead of using placeholder
-- catalog identifiers.

CREATE OR REPLACE FUNCTION
  party_runtime.runtime_item_jsonb_exact_keys(
    value jsonb,
    expected_keys text[]
  )
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(value) = 'object' THEN
      value ?& expected_keys
      AND (
        SELECT count(*) = cardinality(expected_keys)
        FROM jsonb_object_keys(value)
      )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION
  party_runtime.runtime_item_jsonb_exact_text(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(value) = 'string' THEN
      (value #>> '{}') <> ''
      AND btrim(
        value #>> '{}',
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
      ) = value #>> '{}'
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION
  party_runtime.runtime_instance_mechanics_snapshot_valid(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  provenance jsonb;
  mechanics jsonb;
  quantity jsonb;
  source_refs jsonb;
  source_ref jsonb;
  source_ref_text text;
  seen_source_refs text[] := ARRAY[]::text[];
  numeric_value numeric;
BEGIN
  IF value IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      value,
      ARRAY['schema','version','provenance','mechanics']
    )
    OR jsonb_typeof(value->'schema') <> 'string'
    OR value->>'schema'
      <> 'rus.items.runtime_instance_mechanics_snapshot.v1'
  THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(value->'version') <> 'number' THEN
    RETURN false;
  END IF;
  IF (value->>'version')::numeric <> 1 THEN
    RETURN false;
  END IF;

  provenance := value->'provenance';
  IF provenance IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      provenance,
      ARRAY[
        'source_kind','root_turn_id','step_index','operation_ref',
        'origin_kind','source_refs'
      ]
    )
    OR jsonb_typeof(provenance->'source_kind') <> 'string'
    OR provenance->>'source_kind' <> 'ordinary_direct_action_result'
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'root_turn_id'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'operation_ref'
    )
    OR jsonb_typeof(provenance->'origin_kind') <> 'string'
    OR provenance->>'origin_kind' NOT IN (
      'direct_partition','ambient_ordinary','crafted'
    )
  THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(provenance->'step_index') <> 'number' THEN
    RETURN false;
  END IF;
  numeric_value := (provenance->>'step_index')::numeric;
  IF numeric_value <= 0
    OR numeric_value > 8
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;

  source_refs := provenance->'source_refs';
  IF source_refs IS NULL
    OR jsonb_typeof(source_refs) <> 'array'
  THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(source_refs) = 0 THEN
    RETURN false;
  END IF;
  FOR source_ref IN SELECT value FROM jsonb_array_elements(source_refs)
  LOOP
    IF NOT party_runtime.runtime_item_jsonb_exact_text(source_ref) THEN
      RETURN false;
    END IF;
    source_ref_text := source_ref #>> '{}';
    IF source_ref_text = ANY(seen_source_refs) THEN
      RETURN false;
    END IF;
    seen_source_refs := array_append(seen_source_refs, source_ref_text);
  END LOOP;

  mechanics := value->'mechanics';
  IF mechanics IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      mechanics,
      ARRAY[
        'mass_grams','external_hand_cost','carry_form','packing_slot_cost',
        'quantity','container'
      ]
    )
    OR jsonb_typeof(mechanics->'mass_grams') <> 'number'
    OR jsonb_typeof(mechanics->'external_hand_cost') <> 'number'
    OR jsonb_typeof(mechanics->'carry_form') <> 'string'
    OR mechanics->>'carry_form' NOT IN (
      'compact','regular','long','bulky'
    )
    OR jsonb_typeof(mechanics->'packing_slot_cost') <> 'number'
    OR mechanics->'container' <> 'null'::jsonb
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'mass_grams')::numeric;
  IF numeric_value < 0
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'external_hand_cost')::numeric;
  IF numeric_value NOT IN (0, 1, 2)
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;
  numeric_value := (mechanics->>'packing_slot_cost')::numeric;
  IF numeric_value < 0
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;

  quantity := mechanics->'quantity';
  IF quantity <> 'null'::jsonb THEN
    IF NOT party_runtime.runtime_item_jsonb_exact_keys(
        quantity,
        ARRAY['value','unit']
      )
      OR jsonb_typeof(quantity->'value') <> 'number'
      OR NOT party_runtime.runtime_item_jsonb_exact_text(quantity->'unit')
    THEN
      RETURN false;
    END IF;
    numeric_value := (quantity->>'value')::numeric;
    IF numeric_value <= 0
      OR numeric_value > 1.7976931348623157e308
      OR numeric_value < 4.9406564584124654e-324
    THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END $$;

ALTER TABLE party_runtime.party_items
  ALTER COLUMN run_id DROP NOT NULL,
  ALTER COLUMN template_id DROP NOT NULL,
  ALTER COLUMN profile_id DROP NOT NULL,
  ALTER COLUMN category_id DROP NOT NULL;

ALTER TABLE party_runtime.party_items
  DROP CONSTRAINT IF EXISTS party_items_mechanics_source_check;
ALTER TABLE party_runtime.party_items
  ADD CONSTRAINT party_items_mechanics_source_check CHECK (
    (
      run_id IS NOT NULL
      AND template_id IS NOT NULL
      AND profile_id IS NOT NULL
      AND category_id IS NOT NULL
      AND NOT state ? 'runtime_instance_mechanics_snapshot'
    )
    OR (
      run_id IS NULL
      AND template_id IS NULL
      AND profile_id IS NULL
      AND category_id IS NULL
      AND party_runtime.runtime_instance_mechanics_snapshot_valid(
        state->'runtime_instance_mechanics_snapshot'
      )
    )
  );

ALTER TABLE party_runtime.party_item_placements
  ADD COLUMN IF NOT EXISTS attached_item_id text;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'party_runtime.party_item_placements'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%anchor_id%container_id%holder_npc_id%holder_character_id%'
      AND pg_get_constraintdef(oid) NOT LIKE '%attached_item_id%'
  LOOP
    EXECUTE format(
      'ALTER TABLE party_runtime.party_item_placements DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

END $$;

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_owner_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_owner_check CHECK (
    (CASE WHEN anchor_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN container_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_npc_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN holder_character_id IS NULL THEN 0 ELSE 1 END)
    + (CASE WHEN attached_item_id IS NULL THEN 0 ELSE 1 END) = 1
  );

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_attached_item_fk;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_attached_item_fk
  FOREIGN KEY (party_id, attached_item_id)
  REFERENCES party_runtime.party_items(party_id, item_id)
  ON DELETE RESTRICT;

ALTER TABLE party_runtime.party_item_placements
  DROP CONSTRAINT IF EXISTS party_item_placements_no_self_attachment_check;
ALTER TABLE party_runtime.party_item_placements
  ADD CONSTRAINT party_item_placements_no_self_attachment_check
  CHECK (attached_item_id IS NULL OR attached_item_id <> item_id);
