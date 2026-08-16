-- Canonical actor appearance profiles and item-owned portrait semantics.
-- Legacy single-option profile rows remain readable; new profiles use the
-- normalized entry tables below.

ALTER TABLE world_base.region_demographic_profiles
  ALTER COLUMN demographic_option_id DROP NOT NULL;

ALTER TABLE world_base.region_appearance_profiles
  ALTER COLUMN appearance_option_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS world_base.region_demographic_profile_entries (
  id TEXT PRIMARY KEY,
  demographic_profile_id TEXT NOT NULL
    REFERENCES world_base.region_demographic_profiles(id) ON DELETE CASCADE,
  facet TEXT NOT NULL CHECK (facet IN ('sex_category','age_category')),
  option_id TEXT NOT NULL
    REFERENCES world_base.region_category_options(id) ON DELETE RESTRICT,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(applicability) = 'object'),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (demographic_profile_id, facet, option_id)
);

CREATE TABLE IF NOT EXISTS world_base.region_appearance_profile_entries (
  id TEXT PRIMARY KEY,
  appearance_profile_id TEXT NOT NULL
    REFERENCES world_base.region_appearance_profiles(id) ON DELETE CASCADE,
  facet TEXT NOT NULL CHECK (facet IN (
    'build','skin_tone','face_shape','hair_color','hair_length',
    'hair_style','facial_hair','eye_color'
  )),
  option_id TEXT NOT NULL
    REFERENCES world_base.region_category_options(id) ON DELETE RESTRICT,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(applicability) = 'object'),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (appearance_profile_id, facet, option_id)
);

CREATE OR REPLACE FUNCTION world_base.assert_region_demographic_profile_complete(
  target_profile_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  legacy_option_id TEXT;
  profile_status TEXT;
  missing_facets TEXT[];
BEGIN
  SELECT demographic_option_id, status
  INTO legacy_option_id, profile_status
  FROM world_base.region_demographic_profiles
  WHERE id = target_profile_id;

  IF NOT FOUND OR profile_status <> 'approved' THEN
    RETURN;
  END IF;

  IF legacy_option_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM world_base.region_demographic_profile_entries AS entry
      WHERE entry.demographic_profile_id = target_profile_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'approved demographic profile mixes legacy and normalized formats',
        DETAIL = format('profile_id=%s', target_profile_id);
    END IF;
    RETURN;
  END IF;

  SELECT array_agg(required.facet ORDER BY required.facet)
  INTO missing_facets
  FROM (VALUES ('sex_category'), ('age_category')) AS required(facet)
  WHERE NOT EXISTS (
    SELECT 1
    FROM world_base.region_demographic_profile_entries AS entry
    WHERE entry.demographic_profile_id = target_profile_id
      AND entry.facet = required.facet
      AND entry.status = 'approved'
  );

  IF COALESCE(cardinality(missing_facets), 0) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'approved normalized demographic profile is incomplete',
      DETAIL = format('profile_id=%s missing_facets=%s',
        target_profile_id, array_to_string(missing_facets, ','));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION world_base.assert_region_appearance_profile_complete(
  target_profile_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  legacy_option_id TEXT;
  profile_status TEXT;
  missing_facets TEXT[];
BEGIN
  SELECT appearance_option_id, status
  INTO legacy_option_id, profile_status
  FROM world_base.region_appearance_profiles
  WHERE id = target_profile_id;

  IF NOT FOUND OR profile_status <> 'approved' THEN
    RETURN;
  END IF;

  IF legacy_option_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM world_base.region_appearance_profile_entries AS entry
      WHERE entry.appearance_profile_id = target_profile_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'approved appearance profile mixes legacy and normalized formats',
        DETAIL = format('profile_id=%s', target_profile_id);
    END IF;
    RETURN;
  END IF;

  SELECT array_agg(required.facet ORDER BY required.facet)
  INTO missing_facets
  FROM (VALUES
    ('build'), ('skin_tone'), ('face_shape'), ('hair_color'),
    ('hair_length'), ('hair_style'), ('facial_hair'), ('eye_color')
  ) AS required(facet)
  WHERE NOT EXISTS (
    SELECT 1
    FROM world_base.region_appearance_profile_entries AS entry
    WHERE entry.appearance_profile_id = target_profile_id
      AND entry.facet = required.facet
      AND entry.status = 'approved'
  );

  IF COALESCE(cardinality(missing_facets), 0) > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'approved normalized appearance profile is incomplete',
      DETAIL = format('profile_id=%s missing_facets=%s',
        target_profile_id, array_to_string(missing_facets, ','));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION world_base.enforce_region_demographic_profile_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_profile_id TEXT;
  new_profile_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'region_demographic_profiles' THEN
    IF TG_OP <> 'DELETE' THEN new_profile_id := NEW.id; END IF;
    IF TG_OP <> 'INSERT' THEN old_profile_id := OLD.id; END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN new_profile_id := NEW.demographic_profile_id; END IF;
    IF TG_OP <> 'INSERT' THEN old_profile_id := OLD.demographic_profile_id; END IF;
  END IF;

  IF new_profile_id IS NOT NULL THEN
    PERFORM world_base.assert_region_demographic_profile_complete(new_profile_id);
  END IF;
  IF old_profile_id IS NOT NULL AND old_profile_id IS DISTINCT FROM new_profile_id THEN
    PERFORM world_base.assert_region_demographic_profile_complete(old_profile_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION world_base.enforce_region_appearance_profile_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  old_profile_id TEXT;
  new_profile_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'region_appearance_profiles' THEN
    IF TG_OP <> 'DELETE' THEN new_profile_id := NEW.id; END IF;
    IF TG_OP <> 'INSERT' THEN old_profile_id := OLD.id; END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN new_profile_id := NEW.appearance_profile_id; END IF;
    IF TG_OP <> 'INSERT' THEN old_profile_id := OLD.appearance_profile_id; END IF;
  END IF;

  IF new_profile_id IS NOT NULL THEN
    PERFORM world_base.assert_region_appearance_profile_complete(new_profile_id);
  END IF;
  IF old_profile_id IS NOT NULL AND old_profile_id IS DISTINCT FROM new_profile_id THEN
    PERFORM world_base.assert_region_appearance_profile_complete(old_profile_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER region_demographic_profile_complete_parent
AFTER INSERT OR UPDATE OR DELETE
ON world_base.region_demographic_profiles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION world_base.enforce_region_demographic_profile_complete();

CREATE CONSTRAINT TRIGGER region_demographic_profile_complete_entries
AFTER INSERT OR UPDATE OR DELETE
ON world_base.region_demographic_profile_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION world_base.enforce_region_demographic_profile_complete();

CREATE CONSTRAINT TRIGGER region_appearance_profile_complete_parent
AFTER INSERT OR UPDATE OR DELETE
ON world_base.region_appearance_profiles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION world_base.enforce_region_appearance_profile_complete();

CREATE CONSTRAINT TRIGGER region_appearance_profile_complete_entries
AFTER INSERT OR UPDATE OR DELETE
ON world_base.region_appearance_profile_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION world_base.enforce_region_appearance_profile_complete();

ALTER TABLE world_base.item_template_category_bindings
  DROP CONSTRAINT IF EXISTS item_template_category_bindings_binding_kind_check;

ALTER TABLE world_base.item_template_category_bindings
  ADD CONSTRAINT item_template_category_bindings_binding_kind_check CHECK (
    binding_kind IN (
      'object_type','primary_function','secondary_function','material',
      'manufacturing_technique','component_type','physical_form','condition',
      'quality_band','size_band','mass_band','use_context',
      'garment_kind','equipment_slot','neckline','sleeve_form','outer_form',
      'visible_fabric','trim','main_visible_color','secondary_visible_color',
      'headwear_kind'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS item_template_one_active_visual_binding
  ON world_base.item_template_category_bindings (item_template_id, binding_kind)
  WHERE binding_kind IN (
    'garment_kind','equipment_slot','neckline','sleeve_form','outer_form',
    'visible_fabric','trim','main_visible_color','secondary_visible_color',
    'headwear_kind'
  ) AND status = 'approved';

GRANT SELECT ON
  world_base.region_demographic_profile_entries,
  world_base.region_appearance_profile_entries
TO world_reader;
