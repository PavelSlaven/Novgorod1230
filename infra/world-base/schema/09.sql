-- Materialization v2: revisions, universal categories and regional NPC profiles.
CREATE TABLE world_base.world_revisions (
  id TEXT PRIMARY KEY,
  parent_revision_id TEXT REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  effective_from DATE,
  effective_to DATE,
  catalog_digest TEXT NOT NULL CHECK (catalog_digest ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('draft','approved','deprecated')),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.universal_categories (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  parent_category_id TEXT REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  stable_code TEXT NOT NULL UNIQUE,
  facet TEXT NOT NULL,
  preferred_label TEXT NOT NULL,
  definition TEXT NOT NULL,
  scope_note TEXT NOT NULL,
  inclusion_rules TEXT NOT NULL,
  exclusion_rules TEXT NOT NULL,
  replaced_by_category_id TEXT REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (domain, facet, preferred_label),
  CHECK (length(trim(stable_code)) > 0),
  CHECK (length(trim(domain)) > 0),
  CHECK (length(trim(facet)) > 0),
  CHECK (length(trim(preferred_label)) > 0),
  CHECK (length(trim(definition)) > 0),
  CHECK (length(trim(scope_note)) > 0),
  CHECK (length(trim(inclusion_rules)) > 0),
  CHECK (length(trim(exclusion_rules)) > 0)
);
CREATE TABLE world_base.universal_category_relations (
  id TEXT PRIMARY KEY,
  from_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE CASCADE,
  to_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('broader','narrower','related','compatible','requires','excludes','equivalent_with_scope')),
  CHECK (from_category_id <> to_category_id),
  UNIQUE (from_category_id, to_category_id, relation_type)
);
CREATE TABLE world_base.classification_schemes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authority TEXT NOT NULL,
  scheme_version TEXT NOT NULL,
  release_date DATE,
  canonical_reference TEXT NOT NULL,
  license_or_usage_note TEXT NOT NULL,
  snapshot_digest TEXT NOT NULL CHECK (snapshot_digest ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.category_labels (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  label TEXT NOT NULL,
  label_type TEXT NOT NULL CHECK (label_type IN ('preferred','alternative','historical','deprecated')),
  valid_from DATE,
  valid_to DATE,
  source_id TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to),
  UNIQUE (category_id, language, label)
);
CREATE UNIQUE INDEX category_labels_one_preferred_per_language
  ON world_base.category_labels (category_id, language)
  WHERE label_type = 'preferred';
CREATE TABLE world_base.category_scheme_mappings (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE CASCADE,
  classification_scheme_id TEXT NOT NULL REFERENCES world_base.classification_schemes(id) ON DELETE RESTRICT,
  external_concept_id TEXT NOT NULL,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('exact','close','broad','narrow','related')),
  mapping_evidence TEXT NOT NULL,
  source_id TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  review_status TEXT NOT NULL CHECK (review_status IN ('draft','approved','rejected')),
  UNIQUE (category_id, classification_scheme_id, external_concept_id)
);

CREATE OR REPLACE FUNCTION world_base.prevent_category_parent_cycle()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_category_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE hierarchy_edges(child_id, parent_id) AS (
      SELECT category.id, category.parent_category_id
      FROM world_base.universal_categories category
      WHERE category.parent_category_id IS NOT NULL
      UNION ALL
      SELECT CASE WHEN relation.relation_type = 'broader' THEN relation.to_category_id ELSE relation.from_category_id END,
        CASE WHEN relation.relation_type = 'broader' THEN relation.from_category_id ELSE relation.to_category_id END
      FROM world_base.universal_category_relations relation
      WHERE relation.relation_type IN ('broader', 'narrower')
    ), ancestors(id) AS (
      SELECT NEW.parent_category_id
      UNION
      SELECT edge.parent_id
      FROM hierarchy_edges edge
      JOIN ancestors ON edge.child_id = ancestors.id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION 'universal category parent hierarchy cycle for %', NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION world_base.prevent_category_relation_hierarchy_cycle()
RETURNS TRIGGER AS $$
DECLARE
  child_id TEXT;
  parent_id TEXT;
BEGIN
  IF NEW.relation_type NOT IN ('broader', 'narrower') THEN RETURN NEW; END IF;
  child_id := CASE WHEN NEW.relation_type = 'broader' THEN NEW.to_category_id ELSE NEW.from_category_id END;
  parent_id := CASE WHEN NEW.relation_type = 'broader' THEN NEW.from_category_id ELSE NEW.to_category_id END;
  IF EXISTS (
    WITH RECURSIVE hierarchy_edges(child_id, parent_id) AS (
      SELECT category.id, category.parent_category_id
      FROM world_base.universal_categories category
      WHERE category.parent_category_id IS NOT NULL
      UNION ALL
      SELECT CASE WHEN relation.relation_type = 'broader' THEN relation.to_category_id ELSE relation.from_category_id END,
        CASE WHEN relation.relation_type = 'broader' THEN relation.from_category_id ELSE relation.to_category_id END
      FROM world_base.universal_category_relations relation
      WHERE relation.relation_type IN ('broader', 'narrower') AND relation.id <> NEW.id
    ), ancestors(id) AS (
      SELECT parent_id
      UNION
      SELECT edge.parent_id
      FROM hierarchy_edges edge
      JOIN ancestors ON edge.child_id = ancestors.id
    )
    SELECT 1 FROM ancestors WHERE id = child_id
  ) THEN
    RAISE EXCEPTION 'universal category hierarchy cycle for relation %', NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER universal_categories_parent_cycle_guard
  BEFORE INSERT OR UPDATE OF parent_category_id ON world_base.universal_categories
  FOR EACH ROW EXECUTE FUNCTION world_base.prevent_category_parent_cycle();
CREATE TRIGGER universal_category_relations_cycle_guard
  BEFORE INSERT OR UPDATE OF from_category_id, to_category_id, relation_type ON world_base.universal_category_relations
  FOR EACH ROW EXECUTE FUNCTION world_base.prevent_category_relation_hierarchy_cycle();
CREATE TABLE world_base.universal_parameter_definitions (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE CASCADE,
  parameter_key TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('boolean','integer','number','text','enum')),
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (category_id, parameter_key)
);
CREATE TABLE world_base.region_category_options (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  valid_from DATE,
  valid_to DATE,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (world_revision_id, region_id, category_id, valid_from, valid_to)
);

CREATE TABLE world_base.decision_command_catalog (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  handler_id TEXT NOT NULL,
  input_schema_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (domain, handler_id)
);
CREATE TABLE world_base.decision_policy_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE CASCADE,
  context_domain TEXT NOT NULL,
  state_schema_version INTEGER NOT NULL CHECK (state_schema_version >= 2),
  applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.decision_policy_options (
  id TEXT PRIMARY KEY,
  policy_profile_id TEXT NOT NULL REFERENCES world_base.decision_policy_profiles(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL REFERENCES world_base.decision_command_catalog(id) ON DELETE RESTRICT,
  option_order INTEGER NOT NULL,
  preconditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  costs JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (policy_profile_id, option_order),
  UNIQUE (policy_profile_id, command_id)
);

CREATE TABLE world_base.region_npc_archetypes (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  social_role_id TEXT NOT NULL REFERENCES world_base.region_social_roles(id) ON DELETE RESTRICT,
  occupation_id TEXT REFERENCES world_base.region_occupations(id) ON DELETE RESTRICT,
  legal_status_id TEXT REFERENCES world_base.legal_status_archetypes(id) ON DELETE RESTRICT,
  mobility_id TEXT REFERENCES world_base.mobility_archetypes(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_demographic_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  demographic_option_id TEXT NOT NULL REFERENCES world_base.region_category_options(id) ON DELETE RESTRICT,
  minimum_age INTEGER CHECK (minimum_age >= 0),
  maximum_age INTEGER CHECK (maximum_age IS NULL OR maximum_age >= minimum_age),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_name_pools (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  valid_from DATE,
  valid_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_name_pool_entries (
  id TEXT PRIMARY KEY,
  name_pool_id TEXT NOT NULL REFERENCES world_base.region_name_pools(id) ON DELETE CASCADE,
  name_form TEXT NOT NULL,
  name_category_id TEXT REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  UNIQUE (name_pool_id, name_form)
);
CREATE TABLE world_base.region_appearance_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  appearance_option_id TEXT NOT NULL REFERENCES world_base.region_category_options(id) ON DELETE RESTRICT,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_clothing_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  garment_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  slot_key TEXT NOT NULL,
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_equipment_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  social_role_id TEXT REFERENCES world_base.region_social_roles(id) ON DELETE RESTRICT,
  occupation_id TEXT REFERENCES world_base.region_occupations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_equipment_profile_entries (
  id TEXT PRIMARY KEY,
  equipment_profile_id TEXT NOT NULL REFERENCES world_base.region_equipment_profiles(id) ON DELETE CASCADE,
  item_template_id TEXT REFERENCES world_base.item_templates(id) ON DELETE RESTRICT,
  item_category_id TEXT REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  slot_key TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT false,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  CHECK ((item_template_id IS NULL) <> (item_category_id IS NULL))
);
CREATE TABLE world_base.region_knowledge_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  knowledge_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  fact_table TEXT,
  fact_record_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_behavior_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  behavior_option_id TEXT NOT NULL REFERENCES world_base.region_category_options(id) ON DELETE RESTRICT,
  decision_policy_id TEXT REFERENCES world_base.decision_policy_profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_relationship_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  relationship_option_id TEXT NOT NULL REFERENCES world_base.region_category_options(id) ON DELETE RESTRICT,
  constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_activity_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  activity_option_id TEXT NOT NULL REFERENCES world_base.region_category_options(id) ON DELETE RESTRICT,
  presence_reason TEXT NOT NULL,
  graph_node_id TEXT REFERENCES world_base.graph_nodes(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_schedule_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  activity_profile_id TEXT NOT NULL REFERENCES world_base.region_activity_profiles(id) ON DELETE RESTRICT,
  time_band TEXT NOT NULL,
  place_id TEXT REFERENCES world_base.places(id) ON DELETE RESTRICT,
  route_template_id TEXT REFERENCES world_base.route_templates(id) ON DELETE RESTRICT,
  fallback_activity_profile_id TEXT REFERENCES world_base.region_activity_profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_npc_profile_sets (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  archetype_id TEXT NOT NULL REFERENCES world_base.region_npc_archetypes(id) ON DELETE RESTRICT,
  demographic_profile_id TEXT NOT NULL REFERENCES world_base.region_demographic_profiles(id) ON DELETE RESTRICT,
  name_pool_id TEXT REFERENCES world_base.region_name_pools(id) ON DELETE RESTRICT,
  appearance_profile_id TEXT NOT NULL REFERENCES world_base.region_appearance_profiles(id) ON DELETE RESTRICT,
  clothing_profile_id TEXT REFERENCES world_base.region_clothing_profiles(id) ON DELETE RESTRICT,
  equipment_profile_id TEXT REFERENCES world_base.region_equipment_profiles(id) ON DELETE RESTRICT,
  knowledge_profile_id TEXT REFERENCES world_base.region_knowledge_profiles(id) ON DELETE RESTRICT,
  behavior_profile_id TEXT NOT NULL REFERENCES world_base.region_behavior_profiles(id) ON DELETE RESTRICT,
  relationship_profile_id TEXT REFERENCES world_base.region_relationship_profiles(id) ON DELETE RESTRICT,
  activity_profile_id TEXT NOT NULL REFERENCES world_base.region_activity_profiles(id) ON DELETE RESTRICT,
  schedule_profile_id TEXT REFERENCES world_base.region_schedule_profiles(id) ON DELETE RESTRICT,
  profile_level TEXT NOT NULL CHECK (profile_level IN ('background','scene','key')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
