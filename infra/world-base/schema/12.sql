-- PR8: approved authoring records for deterministic environment features.
CREATE TABLE world_base.environment_landmark_templates (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  public_label_key TEXT NOT NULL,
  icon_key TEXT NOT NULL,
  navigation_value TEXT NOT NULL,
  distinctiveness TEXT NOT NULL,
  recognition_difficulty TEXT NOT NULL,
  morphology_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from DATE,
  valid_to DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.environment_landmark_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  profile_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from DATE,
  valid_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.environment_landmark_profile_entries (
  profile_id TEXT NOT NULL REFERENCES world_base.environment_landmark_profiles(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL REFERENCES world_base.environment_landmark_templates(id) ON DELETE RESTRICT,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  required BOOLEAN NOT NULL DEFAULT false,
  exclusivity_group TEXT,
  PRIMARY KEY (profile_id, template_id)
);
CREATE TABLE world_base.environment_landmark_rules (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  profile_id TEXT NOT NULL REFERENCES world_base.environment_landmark_profiles(id) ON DELETE RESTRICT,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  min_count INTEGER NOT NULL DEFAULT 0 CHECK (min_count >= 0),
  max_count INTEGER NOT NULL CHECK (max_count >= min_count),
  required BOOLEAN NOT NULL DEFAULT false,
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  exclusivity_group TEXT,
  valid_from DATE,
  valid_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.environment_landmark_rule_g1_classes (
  rule_id TEXT NOT NULL REFERENCES world_base.environment_landmark_rules(id) ON DELETE CASCADE,
  g1_class TEXT NOT NULL,
  PRIMARY KEY (rule_id, g1_class)
);
CREATE TABLE world_base.environment_landmark_rule_node_types (
  rule_id TEXT NOT NULL REFERENCES world_base.environment_landmark_rules(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  PRIMARY KEY (rule_id, node_type)
);
CREATE TABLE world_base.environment_landmark_rule_landscapes (
  rule_id TEXT NOT NULL REFERENCES world_base.environment_landmark_rules(id) ON DELETE CASCADE,
  landscape_template_id TEXT NOT NULL REFERENCES world_base.landscape_templates(id) ON DELETE RESTRICT,
  PRIMARY KEY (rule_id, landscape_template_id)
);
CREATE TABLE world_base.environment_landmark_rule_hydrology (
  rule_id TEXT NOT NULL REFERENCES world_base.environment_landmark_rules(id) ON DELETE CASCADE,
  water_body_template_id TEXT NOT NULL REFERENCES world_base.water_body_templates(id) ON DELETE RESTRICT,
  PRIMARY KEY (rule_id, water_body_template_id)
);
CREATE TABLE world_base.environment_landmark_rule_land_use (
  rule_id TEXT NOT NULL REFERENCES world_base.environment_landmark_rules(id) ON DELETE CASCADE,
  land_use_template_id TEXT NOT NULL REFERENCES world_base.land_use_templates(id) ON DELETE RESTRICT,
  PRIMARY KEY (rule_id, land_use_template_id)
);
CREATE TABLE world_base.environment_landmark_rule_routes (
  rule_id TEXT NOT NULL REFERENCES world_base.environment_landmark_rules(id) ON DELETE CASCADE,
  route_template_id TEXT NOT NULL REFERENCES world_base.route_templates(id) ON DELETE RESTRICT,
  PRIMARY KEY (rule_id, route_template_id)
);

CREATE TABLE world_base.environment_cue_templates (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  public_label_key TEXT NOT NULL,
  icon_key TEXT NOT NULL,
  sense TEXT NOT NULL CHECK (sense IN ('sight','sound','smell')),
  fading_duration_minutes INTEGER NOT NULL CHECK (fading_duration_minutes >= 0),
  expiry_duration_minutes INTEGER NOT NULL CHECK (expiry_duration_minutes >= fading_duration_minutes),
  propagation_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from DATE,
  valid_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.environment_emission_rules (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  cue_template_id TEXT NOT NULL REFERENCES world_base.environment_cue_templates(id) ON DELETE RESTRICT,
  emitter_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  season TEXT,
  weather_applicability JSONB NOT NULL DEFAULT '{}'::jsonb,
  emission_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from DATE,
  valid_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);

CREATE TABLE world_base.environment_trace_templates (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  public_label_key TEXT NOT NULL,
  icon_key TEXT NOT NULL,
  recognition_difficulty TEXT NOT NULL,
  valid_from DATE,
  valid_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.environment_decay_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  decay_policy JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.environment_trace_creation_rules (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  trace_template_id TEXT NOT NULL REFERENCES world_base.environment_trace_templates(id) ON DELETE RESTRICT,
  decay_profile_id TEXT NOT NULL REFERENCES world_base.environment_decay_profiles(id) ON DELETE RESTRICT,
  source_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  source_kind TEXT NOT NULL,
  movement_mode TEXT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE RESTRICT,
  season TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  creation_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  valid_from DATE,
  valid_to DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.environment_trace_rule_landscapes (
  rule_id TEXT NOT NULL REFERENCES world_base.environment_trace_creation_rules(id) ON DELETE CASCADE,
  landscape_template_id TEXT NOT NULL REFERENCES world_base.landscape_templates(id) ON DELETE RESTRICT,
  PRIMARY KEY (rule_id, landscape_template_id)
);
CREATE TABLE world_base.environment_trace_rule_hydrology (
  rule_id TEXT NOT NULL REFERENCES world_base.environment_trace_creation_rules(id) ON DELETE CASCADE,
  water_body_template_id TEXT NOT NULL REFERENCES world_base.water_body_templates(id) ON DELETE RESTRICT,
  PRIMARY KEY (rule_id, water_body_template_id)
);

CREATE UNIQUE INDEX environment_landmark_rule_approved_scope
  ON world_base.environment_landmark_rules (world_revision_id, region_id, profile_id, COALESCE(exclusivity_group, ''))
  WHERE status = 'approved';
GRANT SELECT ON ALL TABLES IN SCHEMA world_base TO world_reader;
