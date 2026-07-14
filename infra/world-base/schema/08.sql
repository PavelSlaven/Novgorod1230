CREATE TABLE world_base.building_templates (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  building_type TEXT CHECK (building_type IS NULL OR building_type IN (
    'house','hut','barn','stable','storehouse','workshop','church','monastery_cell','gatehouse','tower','wall','bathhouse','mill','inn','warehouse','boathouse','smithy'
  )),
  summary TEXT,
  allowed_place_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_location_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_economy TEXT,
  required_social_order TEXT,
  typical_owner TEXT,
  typical_controller TEXT,
  typical_users JSONB NOT NULL DEFAULT '[]'::jsonb,
  materials JSONB NOT NULL DEFAULT '[]'::jsonb,
  size_band TEXT,
  wealth_level TEXT,
  condition_band TEXT,
  layout_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  room_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  storage_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  locked_area_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  hidden_area_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  fire_risk TEXT,
  theft_risk TEXT,
  social_risk TEXT,
  typical_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_npc_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.location_object_rules (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  place_template_id TEXT REFERENCES world_base.region_place_generation_rules(id) ON DELETE SET NULL,
  place_id TEXT REFERENCES world_base.places(id) ON DELETE SET NULL,
  location_type TEXT,
  building_type TEXT,
  object_category TEXT,
  item_template_id TEXT REFERENCES world_base.item_templates(id) ON DELETE SET NULL,
  probability_band TEXT,
  required_reason TEXT,
  required_owner TEXT,
  required_holder TEXT,
  visibility_default TEXT,
  access_default TEXT,
  legal_risk TEXT,
  social_risk TEXT,
  economic_justification TEXT,
  can_be_generated BOOLEAN NOT NULL DEFAULT false,
  must_be_pregenerated BOOLEAN NOT NULL DEFAULT false,
  forbidden_without_reason BOOLEAN NOT NULL DEFAULT false,
  container_policy TEXT,
  hidden_policy TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.weather_profiles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  seasonal_rule_id TEXT REFERENCES world_base.seasonal_rules(id) ON DELETE SET NULL,
  title TEXT,
  slug TEXT,
  weather_type TEXT,
  summary TEXT,
  temperature_band TEXT,
  precipitation TEXT,
  wind TEXT,
  visibility TEXT,
  ground_condition TEXT,
  water_condition TEXT,
  road_modifier TEXT,
  movement_modifier TEXT,
  body_state_risk TEXT,
  npc_activity_effect TEXT,
  trade_effect TEXT,
  combat_effect TEXT,
  stealth_effect TEXT,
  fire_effect TEXT,
  visible_description TEXT,
  sound_description TEXT,
  smell_description TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.graph_edge_knowledge_rules (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  graph_edge_id TEXT NOT NULL REFERENCES world_base.graph_edges(id) ON DELETE CASCADE,
  social_role_id TEXT REFERENCES world_base.region_social_roles(id) ON DELETE SET NULL,
  occupation_id TEXT REFERENCES world_base.region_occupations(id) ON DELETE SET NULL,
  knowledge_level TEXT CHECK (knowledge_level IS NULL OR knowledge_level IN (
    'knows_exact','knows_roughly','heard_rumor','does_not_know','false_belief'
  )),
  knowledge_source TEXT,
  accuracy TEXT,
  common_mistakes JSONB NOT NULL DEFAULT '[]'::jsonb,
  seasonal_limitations JSONB NOT NULL DEFAULT '[]'::jsonb,
  danger_awareness TEXT,
  landmarks_known JSONB NOT NULL DEFAULT '[]'::jsonb,
  places_known_on_graph_edge JSONB NOT NULL DEFAULT '[]'::jsonb,
  can_guide_others BOOLEAN NOT NULL DEFAULT false,
  will_share_for_free BOOLEAN NOT NULL DEFAULT false,
  will_share_for_payment BOOLEAN NOT NULL DEFAULT false,
  will_hide_or_lie BOOLEAN NOT NULL DEFAULT false,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.record_sources (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES world_base.source_records(id) ON DELETE CASCADE,
  target_table TEXT NOT NULL,
  target_record_id TEXT NOT NULL,
  support_type TEXT CHECK (support_type IS NULL OR support_type IN ('supports','contradicts','partial','background','uncertain')),
  summary TEXT,
  page_or_section TEXT,
  confidence TEXT CHECK (confidence IS NULL OR confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  contradiction_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.audit_log (
  id TEXT PRIMARY KEY,
  target_table TEXT NOT NULL,
  target_record_id TEXT NOT NULL,
  action_type TEXT CHECK (action_type IS NULL OR action_type IN (
    'created','updated','approved','rejected','marked_conflict','merged','split','needs_review'
  )),
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_status TEXT,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS graph_nodes_region_grid_unique
  ON world_base.graph_nodes (region_id, grid_x, grid_y, grid_z)
  WHERE scale_level = 'G1' AND node_type = 'region_cell';

CREATE TRIGGER tr_graph_scale_rules_updated_at BEFORE UPDATE ON world_base.graph_scale_rules FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_graph_edge_modifiers_updated_at BEFORE UPDATE ON world_base.graph_edge_modifiers FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_landscape_templates_updated_at BEFORE UPDATE ON world_base.landscape_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_landscape_templates_updated_at BEFORE UPDATE ON world_base.region_landscape_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_source_records_updated_at BEFORE UPDATE ON world_base.source_records FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_regions_updated_at BEFORE UPDATE ON world_base.regions FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_neighbors_updated_at BEFORE UPDATE ON world_base.region_neighbors FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_laws_updated_at BEFORE UPDATE ON world_base.region_laws FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_economy_updated_at BEFORE UPDATE ON world_base.region_economy FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_social_classes_updated_at BEFORE UPDATE ON world_base.social_classes FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_social_role_archetypes_updated_at BEFORE UPDATE ON world_base.social_role_archetypes FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_legal_status_archetypes_updated_at BEFORE UPDATE ON world_base.legal_status_archetypes FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_dependency_archetypes_updated_at BEFORE UPDATE ON world_base.dependency_archetypes FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_mobility_archetypes_updated_at BEFORE UPDATE ON world_base.mobility_archetypes FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_social_position_archetypes_updated_at BEFORE UPDATE ON world_base.social_position_archetypes FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_class_role_rules_updated_at BEFORE UPDATE ON world_base.class_role_rules FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_occupation_archetypes_updated_at BEFORE UPDATE ON world_base.occupation_archetypes FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_skill_catalog_updated_at BEFORE UPDATE ON world_base.skill_catalog FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_occupation_skill_defaults_updated_at BEFORE UPDATE ON world_base.occupation_skill_defaults FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_role_occupation_rules_updated_at BEFORE UPDATE ON world_base.role_occupation_rules FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_universal_archetype_proposals_updated_at BEFORE UPDATE ON world_base.universal_archetype_proposals FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_social_roles_updated_at BEFORE UPDATE ON world_base.region_social_roles FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_occupations_updated_at BEFORE UPDATE ON world_base.region_occupations FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_water_body_templates_updated_at BEFORE UPDATE ON world_base.water_body_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_route_templates_updated_at BEFORE UPDATE ON world_base.route_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_land_use_templates_updated_at BEFORE UPDATE ON world_base.land_use_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_place_templates_updated_at BEFORE UPDATE ON world_base.place_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_water_body_templates_updated_at BEFORE UPDATE ON world_base.region_water_body_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_land_use_templates_updated_at BEFORE UPDATE ON world_base.region_land_use_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_place_templates_updated_at BEFORE UPDATE ON world_base.region_place_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_place_generation_rules_updated_at BEFORE UPDATE ON world_base.region_place_generation_rules FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_material_culture_updated_at BEFORE UPDATE ON world_base.region_material_culture FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_risks_updated_at BEFORE UPDATE ON world_base.region_risks FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_conflict_templates_updated_at BEFORE UPDATE ON world_base.conflict_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_rumor_templates_updated_at BEFORE UPDATE ON world_base.rumor_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_price_bands_updated_at BEFORE UPDATE ON world_base.price_bands FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_seasonal_rules_updated_at BEFORE UPDATE ON world_base.seasonal_rules FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_religious_context_updated_at BEFORE UPDATE ON world_base.religious_context FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_npc_knowledge_updated_at BEFORE UPDATE ON world_base.region_npc_knowledge FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_npc_generation_rules_updated_at BEFORE UPDATE ON world_base.region_npc_generation_rules FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_place_generation_limits_updated_at BEFORE UPDATE ON world_base.place_generation_limits FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_llm_context_packs_updated_at BEFORE UPDATE ON world_base.llm_context_packs FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_llm_validation_rules_updated_at BEFORE UPDATE ON world_base.llm_validation_rules FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_region_gaps_updated_at BEFORE UPDATE ON world_base.region_gaps FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_places_updated_at BEFORE UPDATE ON world_base.places FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_graph_nodes_updated_at BEFORE UPDATE ON world_base.graph_nodes FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_graph_nodes_template_region_link BEFORE INSERT OR UPDATE ON world_base.graph_nodes FOR EACH ROW EXECUTE PROCEDURE world_base.validate_template_region_link();
CREATE TRIGGER tr_graph_edges_updated_at BEFORE UPDATE ON world_base.graph_edges FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_graph_edges_template_region_link BEFORE INSERT OR UPDATE ON world_base.graph_edges FOR EACH ROW EXECUTE PROCEDURE world_base.validate_template_region_link();
CREATE TRIGGER tr_historical_anchors_updated_at BEFORE UPDATE ON world_base.historical_anchors FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_historical_events_updated_at BEFORE UPDATE ON world_base.historical_events FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_historical_figures_updated_at BEFORE UPDATE ON world_base.historical_figures FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_place_locations_updated_at BEFORE UPDATE ON world_base.place_locations FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_place_minilocations_updated_at BEFORE UPDATE ON world_base.place_minilocations FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_scene_anchors_updated_at BEFORE UPDATE ON world_base.scene_anchors FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_place_buildings_updated_at BEFORE UPDATE ON world_base.place_buildings FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_historical_event_phases_updated_at BEFORE UPDATE ON world_base.historical_event_phases FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_item_templates_updated_at BEFORE UPDATE ON world_base.item_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_building_templates_updated_at BEFORE UPDATE ON world_base.building_templates FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_location_object_rules_updated_at BEFORE UPDATE ON world_base.location_object_rules FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_weather_profiles_updated_at BEFORE UPDATE ON world_base.weather_profiles FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_graph_edge_knowledge_rules_updated_at BEFORE UPDATE ON world_base.graph_edge_knowledge_rules FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_record_sources_updated_at BEFORE UPDATE ON world_base.record_sources FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();
CREATE TRIGGER tr_audit_log_updated_at BEFORE UPDATE ON world_base.audit_log FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'world_reader') THEN
    CREATE ROLE world_reader LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA world_base TO world_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA world_base TO world_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA world_base GRANT SELECT ON TABLES TO world_reader;
