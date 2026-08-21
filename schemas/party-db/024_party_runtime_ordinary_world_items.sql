-- O1 ordinary-world materialization persists template-less items in the same
-- normalized item store as other runtime instances. Its provenance remains a
-- separate, closed v2 contract; direct-action v1 is not widened.

CREATE OR REPLACE FUNCTION
  party_runtime.ordinary_world_runtime_instance_mechanics_snapshot_valid(
    value jsonb
  )
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
  previous_source_ref text := NULL;
  numeric_value numeric;
BEGIN
  IF value IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      value,
      ARRAY['schema','version','provenance','mechanics']
    )
    OR jsonb_typeof(value->'schema') <> 'string'
    OR value->>'schema'
      <> 'rus.items.runtime_instance_mechanics_snapshot.v2'
    OR jsonb_typeof(value->'version') <> 'number'
    OR (value->>'version')::numeric <> 2
  THEN
    RETURN false;
  END IF;

  provenance := value->'provenance';
  IF provenance IS NULL
    OR NOT party_runtime.runtime_item_jsonb_exact_keys(
      provenance,
      ARRAY[
        'source_kind','causal_ref','request_id','candidate_key',
        'coverage_key','context_version','policy_ref','source_refs'
      ]
    )
    OR jsonb_typeof(provenance->'source_kind') <> 'string'
    OR provenance->>'source_kind' <> 'ordinary_world_materialization'
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'causal_ref'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'request_id'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'candidate_key'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'coverage_key'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'context_version'
    )
    OR NOT party_runtime.runtime_item_jsonb_exact_text(
      provenance->'policy_ref'
    )
  THEN
    RETURN false;
  END IF;

  source_refs := provenance->'source_refs';
  IF source_refs IS NULL
    OR jsonb_typeof(source_refs) <> 'array'
    OR jsonb_array_length(source_refs) = 0
  THEN
    RETURN false;
  END IF;
  FOR source_ref IN SELECT entry.value
    FROM jsonb_array_elements(source_refs) WITH ORDINALITY AS entry(value, n)
    ORDER BY entry.n
  LOOP
    IF NOT party_runtime.runtime_item_jsonb_exact_text(source_ref) THEN
      RETURN false;
    END IF;
    source_ref_text := source_ref #>> '{}';
    IF previous_source_ref IS NOT NULL
      AND previous_source_ref >= source_ref_text
    THEN
      RETURN false;
    END IF;
    previous_source_ref := source_ref_text;
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
  IF numeric_value < 1
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
  IF NOT party_runtime.runtime_item_jsonb_exact_keys(
      quantity,
      ARRAY['value','unit']
    )
    OR jsonb_typeof(quantity->'value') <> 'number'
    OR jsonb_typeof(quantity->'unit') <> 'string'
    OR quantity->>'unit' <> 'item'
  THEN
    RETURN false;
  END IF;
  numeric_value := (quantity->>'value')::numeric;
  IF numeric_value < 1
    OR numeric_value > 9007199254740991
    OR numeric_value <> trunc(numeric_value)
  THEN
    RETURN false;
  END IF;

  RETURN true;
END $$;

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
      AND (
        party_runtime.runtime_instance_mechanics_snapshot_valid(
          state->'runtime_instance_mechanics_snapshot'
        )
        OR party_runtime
          .ordinary_world_runtime_instance_mechanics_snapshot_valid(
            state->'runtime_instance_mechanics_snapshot'
          )
      )
    )
  );
