-- CR #158 / R-1 wave: place families, presence rules, D-3…D-5 authoring tables.
-- No per-row canonical_digest (REVIEW-064c C12). Soft refs to pf_id / nodes.

CREATE TABLE IF NOT EXISTS world_base.place_families (
  id TEXT NOT NULL CHECK (id ~ '^pf_'),
  version INTEGER NOT NULL CHECK (version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  display_name_ru TEXT,
  pf_kind TEXT,
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  directness TEXT NOT NULL DEFAULT 'authoring' CHECK (length(btrim(directness)) > 0),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (id, version),
  UNIQUE (id, version, world_revision_id)
);

CREATE TABLE IF NOT EXISTS world_base.spatial_node_place_family_bindings (
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  node_id TEXT NOT NULL,
  node_version INTEGER NOT NULL CHECK (node_version > 0),
  place_family_id TEXT NOT NULL,
  place_family_version INTEGER NOT NULL CHECK (place_family_version > 0),
  binding_role TEXT NOT NULL CHECK (binding_role IN ('primary', 'secondary')),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  PRIMARY KEY (world_revision_id, node_id, node_version, place_family_id, binding_role),
  FOREIGN KEY (place_family_id, place_family_version, world_revision_id)
    REFERENCES world_base.place_families(id, version, world_revision_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS spatial_node_place_family_primary_uq
  ON world_base.spatial_node_place_family_bindings (
    world_revision_id, node_id, node_version
  ) WHERE binding_role = 'primary';

CREATE TABLE IF NOT EXISTS world_base.presence_rules (
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL CHECK (rule_version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('place_family', 'container_template')),
  scope_ref TEXT NOT NULL CHECK (length(btrim(scope_ref)) > 0),
  region_id TEXT,
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('category', 'social_role', 'occupation')),
  subject_ref TEXT NOT NULL CHECK (length(btrim(subject_ref)) > 0),
  category_id TEXT,
  presence_probability_ppm INTEGER NOT NULL
    CHECK (presence_probability_ppm >= 0 AND presence_probability_ppm <= 1000000),
  count_limit INTEGER NOT NULL CHECK (count_limit >= 0),
  allowed_seasons TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  allowed_times TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  guards TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  entry_visible_if TEXT,
  search_only_if TEXT,
  entry_exposed_weight INTEGER CHECK (entry_exposed_weight IS NULL OR entry_exposed_weight >= 0),
  search_concealed_weight INTEGER CHECK (search_concealed_weight IS NULL OR search_concealed_weight >= 0),
  wild_arrival_cause TEXT,
  refresh_class TEXT NOT NULL DEFAULT 'none'
    CHECK (refresh_class IN ('none', 'by_year_season')),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  authoring_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(authoring_payload) = 'object'),
  PRIMARY KEY (rule_id, rule_version),
  CHECK (
    (subject_kind = 'category' AND category_id IS NOT NULL)
    OR (subject_kind IN ('social_role', 'occupation') AND category_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS presence_rules_scope_idx
  ON world_base.presence_rules (world_revision_id, scope_kind, scope_ref);
CREATE INDEX IF NOT EXISTS presence_rules_subject_idx
  ON world_base.presence_rules (subject_kind, subject_ref);

CREATE TABLE IF NOT EXISTS world_base.npc_relationship_materialization_rules (
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL CHECK (rule_version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL,
  scope_ref TEXT NOT NULL,
  subject_role_ref TEXT,
  object_role_ref TEXT,
  relationship_kind TEXT NOT NULL,
  direction TEXT,
  materialization_guard TEXT,
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (rule_id, rule_version)
);

CREATE TABLE IF NOT EXISTS world_base.speech_address_forms (
  form_id TEXT NOT NULL,
  form_version INTEGER NOT NULL CHECK (form_version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  channel TEXT,
  relationship_kind TEXT,
  speaker_role_ref TEXT,
  addressee_role_ref TEXT,
  register_ref TEXT,
  form_ru TEXT NOT NULL,
  situation TEXT,
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (form_id, form_version)
);

CREATE TABLE IF NOT EXISTS world_base.household_composition_profiles (
  profile_id TEXT NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  household_type TEXT,
  wealth_band TEXT,
  place_family_id TEXT,
  members_estimate_min INTEGER CHECK (members_estimate_min IS NULL OR members_estimate_min >= 0),
  members_estimate_max INTEGER CHECK (
    members_estimate_max IS NULL
    OR members_estimate_min IS NULL
    OR members_estimate_max >= members_estimate_min
  ),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (profile_id, profile_version)
);

CREATE TABLE IF NOT EXISTS world_base.slot_instance_variants (
  variant_id TEXT NOT NULL,
  variant_version INTEGER NOT NULL CHECK (variant_version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  slot_id TEXT NOT NULL,
  weight INTEGER NOT NULL CHECK (weight > 0),
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(applicability) = 'object'),
  facets JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(facets) = 'object'),
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  confidence TEXT NOT NULL DEFAULT 'unknown'
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (variant_id, variant_version)
);

CREATE TABLE IF NOT EXISTS world_base.water_body_presence_facets (
  facet_id TEXT NOT NULL,
  facet_version INTEGER NOT NULL CHECK (facet_version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL,
  scope_ref TEXT NOT NULL,
  place_family_id TEXT,
  season TEXT,
  facet TEXT NOT NULL,
  variant_id TEXT,
  weight INTEGER CHECK (weight IS NULL OR weight >= 0),
  value_ru TEXT,
  value_num DOUBLE PRECISION,
  unit TEXT,
  no_source BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (facet_id, facet_version)
);

CREATE TABLE IF NOT EXISTS world_base.fauna_phase_activity_rules (
  rule_id TEXT NOT NULL,
  rule_version INTEGER NOT NULL CHECK (rule_version > 0),
  world_revision_id TEXT NOT NULL
    REFERENCES world_base.spatial_v3_world_revisions(id) ON DELETE RESTRICT,
  fauna_ref TEXT NOT NULL,
  season TEXT,
  phase TEXT NOT NULL,
  visibility_state TEXT,
  voice_state TEXT,
  voice_text_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('approved', 'deprecated', 'retired')),
  confidence TEXT NOT NULL
    CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  provenance_ref TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  PRIMARY KEY (rule_id, rule_version)
);
