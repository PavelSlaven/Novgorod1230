-- Fix 015's PL/pgSQL variable/column name conflict for already-migrated DBs.
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
  FOR source_ref IN SELECT entry.value
    FROM jsonb_array_elements(source_refs) AS entry(value)
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
