-- Perception v1: approved sensory profiles and normalized materialization bindings.
CREATE TABLE world_base.sensory_signal_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE CASCADE,
  modality TEXT NOT NULL CHECK (modality IN ('sound','visual')),
  semantic_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  base_strength_units INTEGER NOT NULL CHECK (base_strength_units >= 0),
  duration_class TEXT NOT NULL,
  directionality TEXT NOT NULL,
  repetition_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  speech_capability BOOLEAN NOT NULL DEFAULT false,
  source_size_band TEXT,
  motion_exposure_units INTEGER NOT NULL DEFAULT 0 CHECK (motion_exposure_units >= 0),
  light_emission_units INTEGER NOT NULL DEFAULT 0 CHECK (light_emission_units >= 0),
  period JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  valid_from DATE,
  valid_to DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to)
);
CREATE TABLE world_base.sensory_signal_action_bindings (
  sensory_signal_profile_id TEXT NOT NULL REFERENCES world_base.sensory_signal_profiles(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL REFERENCES world_base.decision_command_catalog(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  PRIMARY KEY (sensory_signal_profile_id, command_id)
);
CREATE TABLE world_base.sensory_signal_item_template_bindings (
  sensory_signal_profile_id TEXT NOT NULL REFERENCES world_base.sensory_signal_profiles(id) ON DELETE CASCADE,
  item_template_id TEXT NOT NULL REFERENCES world_base.item_templates(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  PRIMARY KEY (sensory_signal_profile_id, item_template_id)
);
CREATE TABLE world_base.sensory_signal_surface_category_bindings (
  sensory_signal_profile_id TEXT NOT NULL REFERENCES world_base.sensory_signal_profiles(id) ON DELETE CASCADE,
  surface_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  PRIMARY KEY (sensory_signal_profile_id, surface_category_id)
);
CREATE TABLE world_base.sensory_transition_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  material_category_id TEXT REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  sound_loss_units INTEGER NOT NULL CHECK (sound_loss_units >= 0),
  sound_blocked BOOLEAN NOT NULL DEFAULT false,
  vision_transmission TEXT NOT NULL CHECK (vision_transmission IN ('blocked','slit','partial','open')),
  vision_loss_units INTEGER NOT NULL CHECK (vision_loss_units >= 0),
  speech_loss_units INTEGER NOT NULL CHECK (speech_loss_units >= 0),
  state_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  weather_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  valid_from DATE,
  valid_to DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to)
);
CREATE TABLE world_base.ambient_sound_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE CASCADE,
  ambient_noise_floor_units INTEGER NOT NULL CHECK (ambient_noise_floor_units >= 0),
  masking_policy JSONB NOT NULL,
  routine_policy JSONB NOT NULL,
  time_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  weather_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  activity_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  valid_from DATE,
  valid_to DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to)
);
CREATE TABLE world_base.light_visibility_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  light_state_category_id TEXT NOT NULL REFERENCES world_base.universal_categories(id) ON DELETE RESTRICT,
  visibility_loss_units INTEGER NOT NULL CHECK (visibility_loss_units >= 0),
  weather_modifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  valid_from DATE,
  valid_to DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to)
);
CREATE TABLE world_base.actor_perception_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  hearing_threshold_units INTEGER NOT NULL CHECK (hearing_threshold_units >= 0),
  localization_margin_units INTEGER NOT NULL CHECK (localization_margin_units >= 0),
  classification_margin_units INTEGER NOT NULL CHECK (classification_margin_units >= 0),
  identification_margin_units INTEGER NOT NULL CHECK (identification_margin_units >= 0),
  speech_margin_units INTEGER NOT NULL CHECK (speech_margin_units >= 0),
  visual_threshold_units INTEGER NOT NULL CHECK (visual_threshold_units >= 0),
  visual_classification_margin_units INTEGER NOT NULL CHECK (visual_classification_margin_units >= 0),
  visual_identification_margin_units INTEGER NOT NULL CHECK (visual_identification_margin_units >= 0),
  attention_profile JSONB NOT NULL,
  impairment_bindings JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_modifier_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id TEXT REFERENCES world_base.source_records(id) ON DELETE RESTRICT,
  valid_from DATE,
  valid_to DATE,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to)
);
CREATE TABLE world_base.routine_sound_profiles (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  perception_profile_id TEXT NOT NULL REFERENCES world_base.actor_perception_profiles(id) ON DELETE RESTRICT,
  matching_policy JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (world_revision_id, perception_profile_id)
);
CREATE TABLE world_base.npc_reaction_policies (
  id TEXT PRIMARY KEY,
  world_revision_id TEXT NOT NULL REFERENCES world_base.world_revisions(id) ON DELETE RESTRICT,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE CASCADE,
  awareness_transitions JSONB NOT NULL,
  significance_policy JSONB NOT NULL,
  cooldown_policy JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.npc_reaction_policy_options (
  id TEXT PRIMARY KEY,
  reaction_policy_id TEXT NOT NULL REFERENCES world_base.npc_reaction_policies(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL REFERENCES world_base.decision_command_catalog(id) ON DELETE RESTRICT,
  option_order INTEGER NOT NULL CHECK (option_order >= 0),
  preconditions JSONB NOT NULL,
  expected_cost JSONB NOT NULL,
  risk_metadata JSONB NOT NULL,
  reason_visible_to_actor TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated')),
  UNIQUE (reaction_policy_id, command_id),
  UNIQUE (reaction_policy_id, option_order)
);
CREATE TABLE world_base.g5_edge_sensory_transition_bindings (
  g5_edge_template_id TEXT PRIMARY KEY REFERENCES world_base.g5_edge_templates(id) ON DELETE CASCADE,
  sensory_transition_profile_id TEXT NOT NULL REFERENCES world_base.sensory_transition_profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
CREATE TABLE world_base.region_npc_perception_profile_bindings (
  npc_profile_set_id TEXT PRIMARY KEY REFERENCES world_base.region_npc_profile_sets(id) ON DELETE CASCADE,
  perception_profile_id TEXT NOT NULL REFERENCES world_base.actor_perception_profiles(id) ON DELETE RESTRICT,
  routine_sound_profile_id TEXT NOT NULL REFERENCES world_base.routine_sound_profiles(id) ON DELETE RESTRICT,
  reaction_policy_id TEXT NOT NULL REFERENCES world_base.npc_reaction_policies(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','deprecated'))
);
