-- World Base Schema v2: 61 reference tables for NocoDB manual fill (layered map ontology + universal social layer)
-- status: workflow; confidence: epistemic certainty
DROP SCHEMA IF EXISTS world_base CASCADE;
CREATE SCHEMA world_base;

CREATE OR REPLACE FUNCTION world_base.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ponytail: one trigger fn for primary FK + JSONB secondary template ids on graph_nodes/edges
CREATE OR REPLACE FUNCTION world_base.validate_template_region_link()
RETURNS TRIGGER AS $$
DECLARE
  rid TEXT;
  elem TEXT;
BEGIN
  IF TG_TABLE_NAME = 'graph_nodes' THEN
    rid := NEW.region_id;

    IF NEW.primary_landscape_template_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM world_base.region_landscape_templates rlt
        WHERE rlt.region_id = rid
          AND rlt.landscape_template_id = NEW.primary_landscape_template_id
          AND rlt.is_allowed = true
          AND rlt.status NOT IN ('rejected', 'conflict')
      ) THEN
        RAISE EXCEPTION 'primary_landscape_template_id % not allowed for region %',
          NEW.primary_landscape_template_id, rid;
      END IF;
    END IF;

    FOR elem IN SELECT jsonb_array_elements_text(COALESCE(NEW.secondary_landscape_template_ids, '[]'::jsonb))
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM world_base.region_landscape_templates rlt
        WHERE rlt.region_id = rid
          AND rlt.landscape_template_id = elem
          AND rlt.is_allowed = true
          AND rlt.status NOT IN ('rejected', 'conflict')
      ) THEN
        RAISE EXCEPTION 'secondary landscape_template_id % not allowed for region %', elem, rid;
      END IF;
    END LOOP;

    IF NEW.primary_water_body_template_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM world_base.region_water_body_templates rwbt
        WHERE rwbt.region_id = rid
          AND rwbt.water_body_template_id = NEW.primary_water_body_template_id
          AND rwbt.is_allowed = true
          AND rwbt.status NOT IN ('rejected', 'conflict')
      ) THEN
        RAISE EXCEPTION 'primary_water_body_template_id % not allowed for region %',
          NEW.primary_water_body_template_id, rid;
      END IF;
    END IF;

    FOR elem IN SELECT jsonb_array_elements_text(COALESCE(NEW.secondary_water_body_template_ids, '[]'::jsonb))
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM world_base.region_water_body_templates rwbt
        WHERE rwbt.region_id = rid
          AND rwbt.water_body_template_id = elem
          AND rwbt.is_allowed = true
          AND rwbt.status NOT IN ('rejected', 'conflict')
      ) THEN
        RAISE EXCEPTION 'secondary water_body_template_id % not allowed for region %', elem, rid;
      END IF;
    END LOOP;

    FOR elem IN SELECT jsonb_array_elements_text(COALESCE(NEW.land_use_template_ids, '[]'::jsonb))
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM world_base.region_land_use_templates rlut
        WHERE rlut.region_id = rid
          AND rlut.land_use_template_id = elem
          AND rlut.is_allowed = true
          AND rlut.status NOT IN ('rejected', 'conflict')
      ) THEN
        RAISE EXCEPTION 'land_use_template_id % not allowed for region %', elem, rid;
      END IF;
    END LOOP;

    IF NEW.place_template_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM world_base.region_place_templates rpt
        WHERE rpt.region_id = rid
          AND rpt.place_template_id = NEW.place_template_id
          AND rpt.is_allowed = true
          AND rpt.status NOT IN ('rejected', 'conflict')
      ) THEN
        RAISE EXCEPTION 'place_template_id % not allowed for region %', NEW.place_template_id, rid;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'graph_edges' THEN
    IF NEW.landscape_template_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM world_base.region_landscape_templates rlt
        JOIN world_base.graph_nodes gn ON gn.id = NEW.from_node_id
        WHERE rlt.region_id = gn.region_id
          AND rlt.landscape_template_id = NEW.landscape_template_id
          AND rlt.is_allowed = true
          AND rlt.status NOT IN ('rejected', 'conflict')
      ) THEN
        RAISE EXCEPTION 'landscape_template_id % not allowed for from_node region',
          NEW.landscape_template_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE world_base.graph_scale_rules (
  id TEXT PRIMARY KEY,
  scale_level TEXT NOT NULL CHECK (scale_level IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5')),
  title TEXT,
  unit TEXT,
  typical_edge_min NUMERIC,
  typical_edge_max NUMERIC,
  time_unit TEXT,
  uses_gu BOOLEAN NOT NULL DEFAULT false,
  uses_minutes BOOLEAN NOT NULL DEFAULT false,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.graph_edge_modifiers (
  id TEXT PRIMARY KEY,
  title TEXT,
  modifier_type TEXT CHECK (modifier_type IS NULL OR modifier_type IN (
    'terrain','season','weather','load','access','visibility','stealth','injury','transport','risk'
  )),
  applies_to_edge_type TEXT,
  applies_to_terrain_type TEXT,
  applies_to_season TEXT,
  multiplier NUMERIC,
  summary TEXT,
  example TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.landscape_templates (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  parent_landscape_template_id TEXT REFERENCES world_base.landscape_templates(id) ON DELETE SET NULL,
  landscape_group TEXT CHECK (landscape_group IS NULL OR landscape_group IN (
    'forest','swamp','meadow','floodplain','hill','ravine',
    'steppe','marsh','bog','mountain','desert',
    'coast','riverbank','lake_shore'
  )),
  base_environment TEXT NOT NULL,
  dominant_vegetation TEXT,
  forest_type TEXT,
  moisture_level TEXT,
  relief_type TEXT,
  soil_ground_type TEXT,
  openness TEXT,
  seasonal_stability TEXT,
  summary TEXT,
  base_movement_multiplier NUMERIC,
  default_orientation_difficulty TEXT CHECK (default_orientation_difficulty IS NULL OR default_orientation_difficulty IN (
    'none', 'easy', 'ordinary', 'hard', 'dangerous', 'extreme'
  )),
  base_risk_level TEXT CHECK (base_risk_level IS NULL OR base_risk_level IN (
    'none', 'low', 'medium', 'high', 'extreme'
  )),
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.water_body_templates (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  water_body_type TEXT NOT NULL,
  salinity TEXT NOT NULL,
  flow_type TEXT,
  typical_depth TEXT,
  typical_width TEXT,
  drinkable_default TEXT,
  supports_boat BOOLEAN NOT NULL DEFAULT false,
  supports_fishing BOOLEAN NOT NULL DEFAULT false,
  supports_ford BOOLEAN NOT NULL DEFAULT false,
  supports_ferry BOOLEAN NOT NULL DEFAULT false,
  supports_bridge BOOLEAN NOT NULL DEFAULT false,
  supports_winter_crossing BOOLEAN NOT NULL DEFAULT false,
  freeze_pattern TEXT,
  flood_risk TEXT,
  base_crossing_risk TEXT,
  navigation_use TEXT,
  water_hazard_notes TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.route_templates (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  route_kind TEXT NOT NULL,
  default_edge_type TEXT,
  surface_type TEXT,
  requires_landscape_template BOOLEAN NOT NULL DEFAULT true,
  requires_water_body_template BOOLEAN NOT NULL DEFAULT false,
  supports_pedestrian BOOLEAN NOT NULL DEFAULT true,
  supports_horse BOOLEAN NOT NULL DEFAULT false,
  supports_cart BOOLEAN NOT NULL DEFAULT false,
  supports_sled BOOLEAN NOT NULL DEFAULT false,
  supports_boat BOOLEAN NOT NULL DEFAULT false,
  seasonal_availability TEXT,
  default_access_rule TEXT,
  default_orientation_difficulty TEXT CHECK (default_orientation_difficulty IS NULL OR default_orientation_difficulty IN (
    'none', 'easy', 'ordinary', 'hard', 'dangerous', 'extreme'
  )),
  default_risk_level TEXT CHECK (default_risk_level IS NULL OR default_risk_level IN (
    'none', 'low', 'medium', 'high', 'extreme'
  )),
  default_movement_multiplier NUMERIC,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.land_use_templates (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  land_use_kind TEXT NOT NULL,
  requires_settlement_nearby BOOLEAN NOT NULL DEFAULT false,
  requires_water_nearby BOOLEAN NOT NULL DEFAULT false,
  requires_specific_landscape BOOLEAN NOT NULL DEFAULT false,
  compatible_landscape_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  compatible_water_body_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  seasonal_pattern TEXT,
  labor_intensity TEXT,
  economic_use TEXT,
  visibility_effect TEXT,
  movement_effect TEXT,
  risk_effect TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.place_templates (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  place_kind TEXT NOT NULL,
  default_node_type TEXT,
  can_exist_inside_landscape BOOLEAN NOT NULL DEFAULT true,
  requires_water_nearby BOOLEAN NOT NULL DEFAULT false,
  requires_route_nearby BOOLEAN NOT NULL DEFAULT false,
  requires_land_use BOOLEAN NOT NULL DEFAULT false,
  compatible_landscape_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  compatible_water_body_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  compatible_route_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  compatible_land_use_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_scale_level TEXT,
  settlement_density_effect TEXT,
  access_logic TEXT,
  social_logic TEXT,
  economic_logic TEXT,
  defense_logic TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE world_base.graph_edge_modifiers
  ADD COLUMN landscape_template_id TEXT REFERENCES world_base.landscape_templates(id) ON DELETE SET NULL;

CREATE TABLE world_base.source_records (
  id TEXT PRIMARY KEY,
  title TEXT,
  slug TEXT,
  source_type TEXT CHECK (source_type IS NULL OR source_type IN (
    'book','article','chronicle','academic_database','museum','map','archaeology','web','project_note','llm_draft','manual_entry'
  )),
  author TEXT,
  publication_year INTEGER,
  period_covered TEXT,
  region_covered TEXT,
  url TEXT,
  file_reference TEXT,
  page_or_section TEXT,
  quote_short TEXT,
  summary TEXT,
  reliability_level TEXT,
  bias_notes TEXT,
  usefulness TEXT,
  limitations TEXT,
  checked_by TEXT,
  checked_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.regions (
  id TEXT PRIMARY KEY,
  slug TEXT,
  canonical_name TEXT,
  display_name TEXT,
  alt_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  region_type TEXT,
  parent_region_id TEXT REFERENCES world_base.regions(id) ON DELETE SET NULL,
  period_start_year INTEGER,
  period_end_year INTEGER,
  summary TEXT,
  geographic_scope TEXT,
  natural_landscape TEXT,
  climate_summary TEXT,
  seasonal_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  waterways_summary TEXT,
  roads_summary TEXT,
  settlement_logic_summary TEXT,
  political_summary TEXT,
  ruling_power TEXT,
  administrative_structure TEXT,
  law_summary TEXT,
  custom_summary TEXT,
  religion_summary TEXT,
  social_order_summary TEXT,
  economy_summary TEXT,
  military_pressure_summary TEXT,
  historical_context_summary TEXT,
  neighbor_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  external_pressure_summary TEXT,
  common_risks_summary TEXT,
  npc_common_knowledge_summary TEXT,
  llm_generation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_forbidden_assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_context_summary TEXT,
  validation_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_landscape_templates (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  landscape_template_id TEXT NOT NULL REFERENCES world_base.landscape_templates(id) ON DELETE CASCADE,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  is_common BOOLEAN NOT NULL DEFAULT false,
  is_dominant BOOLEAN NOT NULL DEFAULT false,
  is_rare BOOLEAN NOT NULL DEFAULT false,
  generation_weight NUMERIC NOT NULL DEFAULT 0 CHECK (generation_weight >= 0),
  allowed_scale_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_node_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  regional_limits TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, landscape_template_id)
);

CREATE TABLE world_base.region_water_body_templates (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  water_body_template_id TEXT NOT NULL REFERENCES world_base.water_body_templates(id) ON DELETE CASCADE,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  is_common BOOLEAN NOT NULL DEFAULT false,
  is_dominant BOOLEAN NOT NULL DEFAULT false,
  is_rare BOOLEAN NOT NULL DEFAULT false,
  generation_weight NUMERIC NOT NULL DEFAULT 0 CHECK (generation_weight >= 0),
  allowed_scale_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_node_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  regional_limits TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, water_body_template_id)
);

CREATE TABLE world_base.region_land_use_templates (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  land_use_template_id TEXT NOT NULL REFERENCES world_base.land_use_templates(id) ON DELETE CASCADE,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  is_common BOOLEAN NOT NULL DEFAULT false,
  is_rare BOOLEAN NOT NULL DEFAULT false,
  generation_weight NUMERIC NOT NULL DEFAULT 0 CHECK (generation_weight >= 0),
  allowed_scale_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_node_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  regional_limits TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, land_use_template_id)
);

CREATE TABLE world_base.region_place_templates (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  place_template_id TEXT NOT NULL REFERENCES world_base.place_templates(id) ON DELETE CASCADE,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  is_common BOOLEAN NOT NULL DEFAULT false,
  is_rare BOOLEAN NOT NULL DEFAULT false,
  generation_weight NUMERIC NOT NULL DEFAULT 0 CHECK (generation_weight >= 0),
  allowed_scale_levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_node_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  regional_limits TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, place_template_id)
);

CREATE TABLE world_base.region_neighbors (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  neighbor_region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  direction TEXT,
  border_type TEXT,
  connection_type TEXT,
  trade_connection TEXT,
  military_pressure TEXT,
  political_relation TEXT,
  cultural_relation TEXT,
  religious_relation TEXT,
  route_connection_summary TEXT,
  known_to_commoners TEXT,
  known_to_traders TEXT,
  known_to_elites TEXT,
  known_to_clergy TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_laws (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  law_type TEXT CHECK (law_type IS NULL OR law_type IN (
    'property','violence','weapon','travel','hospitality','debt','trade','religious','status','punishment','court','tax','custom'
  )),
  applies_to_statuses JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  period_start_year INTEGER,
  period_end_year INTEGER,
  summary TEXT,
  rule_text TEXT,
  custom_basis TEXT,
  authority_enforcing TEXT,
  punishment_or_consequence TEXT,
  dispute_resolution TEXT,
  property_effect TEXT,
  violence_effect TEXT,
  weapon_effect TEXT,
  travel_effect TEXT,
  trade_effect TEXT,
  religious_effect TEXT,
  who_knows_this TEXT,
  npc_behavior_effect TEXT,
  player_risk TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_economy (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  economy_type TEXT CHECK (economy_type IS NULL OR economy_type IN (
    'farming','fishing','hunting','fur','beekeeping','logging','charcoal','tar','iron','salt','livestock','craft','trade','transport','monastery_economy','military_supply'
  )),
  resource_or_activity TEXT,
  production_method TEXT,
  seasonality TEXT,
  required_landscape TEXT,
  required_settlement_type TEXT,
  required_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  labor_intensity TEXT,
  wealth_level TEXT,
  risk_level TEXT,
  goods_produced JSONB NOT NULL DEFAULT '[]'::jsonb,
  goods_consumed JSONB NOT NULL DEFAULT '[]'::jsonb,
  goods_imported JSONB NOT NULL DEFAULT '[]'::jsonb,
  goods_exported JSONB NOT NULL DEFAULT '[]'::jsonb,
  trade_graph_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  market_access TEXT,
  storage_requirements TEXT,
  spoilage_or_loss_risk TEXT,
  who_controls_it TEXT,
  tax_or_duty TEXT,
  social_status_link TEXT,
  conflict_potential TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Universal social archetype layer (canonical positions before regional terms)

CREATE TABLE world_base.social_classes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.social_role_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.legal_status_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.dependency_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.mobility_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.social_position_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  social_class_id TEXT NOT NULL REFERENCES world_base.social_classes(id) ON DELETE RESTRICT,
  role_archetype_id TEXT NOT NULL REFERENCES world_base.social_role_archetypes(id) ON DELETE RESTRICT,
  legal_status_archetype_id TEXT NOT NULL REFERENCES world_base.legal_status_archetypes(id) ON DELETE RESTRICT,
  dependency_archetype_id TEXT NOT NULL REFERENCES world_base.dependency_archetypes(id) ON DELETE RESTRICT,
  mobility_archetype_id TEXT NOT NULL REFERENCES world_base.mobility_archetypes(id) ON DELETE RESTRICT,
  property_rights_model TEXT,
  weapon_rights_model TEXT,
  court_voice_model TEXT,
  typical_power_over_others TEXT,
  typical_power_over_them TEXT,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.class_role_rules (
  social_class_id TEXT NOT NULL REFERENCES world_base.social_classes(id) ON DELETE CASCADE,
  role_archetype_id TEXT NOT NULL REFERENCES world_base.social_role_archetypes(id) ON DELETE CASCADE,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (social_class_id, role_archetype_id)
);

CREATE TABLE world_base.occupation_archetypes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.skill_catalog (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.occupation_skill_defaults (
  occupation_archetype_id TEXT PRIMARY KEY REFERENCES world_base.occupation_archetypes(id) ON DELETE CASCADE,
  primary_skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  secondary_skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  gate_skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_level_logic TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.role_occupation_rules (
  role_archetype_id TEXT NOT NULL REFERENCES world_base.social_role_archetypes(id) ON DELETE CASCADE,
  occupation_archetype_id TEXT NOT NULL REFERENCES world_base.occupation_archetypes(id) ON DELETE CASCADE,
  is_allowed BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_archetype_id, occupation_archetype_id)
);

CREATE TABLE world_base.universal_archetype_proposals (
  id TEXT PRIMARY KEY,
  source_region_id TEXT REFERENCES world_base.regions(id) ON DELETE SET NULL,
  proposal_type TEXT CHECK (proposal_type IS NULL OR proposal_type IN ('social_position', 'occupation', 'skill', 'other')),
  local_term TEXT,
  why_existing_archetypes_not_enough TEXT,
  proposed_archetype_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  review_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_social_roles (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  role_group TEXT CHECK (role_group IS NULL OR role_group IN (
    'elite','clergy','warrior','merchant','craftsman','peasant','dependent','slave','servant','outsider','marginal','official'
  )),
  social_position_archetype_id TEXT REFERENCES world_base.social_position_archetypes(id) ON DELETE RESTRICT,
  social_class_id TEXT REFERENCES world_base.social_classes(id) ON DELETE RESTRICT,
  role_archetype_id TEXT REFERENCES world_base.social_role_archetypes(id) ON DELETE RESTRICT,
  legal_status_archetype_id TEXT REFERENCES world_base.legal_status_archetypes(id) ON DELETE SET NULL,
  dependency_archetype_id TEXT REFERENCES world_base.dependency_archetypes(id) ON DELETE SET NULL,
  mobility_archetype_id TEXT REFERENCES world_base.mobility_archetypes(id) ON DELETE SET NULL,
  mapping_review_status TEXT CHECK (mapping_review_status IS NULL OR mapping_review_status IN ('pending', 'approved', 'accepted_with_caution', 'rejected')),
  mapping_confidence TEXT,
  mapping_notes TEXT,
  status_level TEXT,
  free_status TEXT,
  dependency_type TEXT,
  wealth_level TEXT,
  legal_capacity TEXT,
  mobility_level TEXT,
  social_respect TEXT,
  vulnerability_level TEXT,
  allowed_occupations JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_occupations JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_weapons JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_weapons JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  restricted_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  property_rights TEXT,
  travel_rights TEXT,
  trade_rights TEXT,
  court_rights TEXT,
  tax_obligations TEXT,
  service_obligations TEXT,
  typical_clothing TEXT,
  typical_equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_speech_register TEXT,
  typical_fears JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_goals JSONB NOT NULL DEFAULT '[]'::jsonb,
  who_commands_them TEXT,
  who_protects_them TEXT,
  who_can_punish_them TEXT,
  relation_to_church TEXT,
  relation_to_power TEXT,
  npc_generation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  player_character_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_occupations (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  occupation_group TEXT CHECK (occupation_group IS NULL OR occupation_group IN (
    'agriculture','fishing','forest','craft','trade','transport','military','religious','service','administration','criminal','healing','hospitality'
  )),
  occupation_archetype_id TEXT REFERENCES world_base.occupation_archetypes(id) ON DELETE RESTRICT,
  mapping_review_status TEXT CHECK (mapping_review_status IS NULL OR mapping_review_status IN ('pending', 'approved', 'accepted_with_caution', 'rejected')),
  mapping_confidence TEXT,
  mapping_notes TEXT,
  summary TEXT,
  allowed_social_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_social_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_status TEXT,
  typical_wealth TEXT,
  typical_gender_age_rules TEXT,
  required_location_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_economy_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_materials JSONB NOT NULL DEFAULT '[]'::jsonb,
  produced_goods JSONB NOT NULL DEFAULT '[]'::jsonb,
  services_provided JSONB NOT NULL DEFAULT '[]'::jsonb,
  seasonality TEXT,
  work_rhythm TEXT,
  income_logic TEXT,
  typical_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_attributes JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_clothing TEXT,
  typical_equipment JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_contacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  settlement_generation_weight TEXT,
  npc_generation_weight TEXT,
  rarity TEXT,
  is_historical_fact BOOLEAN NOT NULL DEFAULT false,
  is_generated_allowed BOOLEAN NOT NULL DEFAULT false,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_place_generation_rules (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  template_type TEXT CHECK (template_type IS NULL OR template_type IN (
    'village','fishing_village','forest_camp','charcoal_burner_camp','logging_camp','winter_hut','pogost','ferry','ford','roadside_inn','market_site','monastery_dependency','watch_post','hunting_camp','beekeeping_site'
  )),
  summary TEXT,
  generation_allowed BOOLEAN NOT NULL DEFAULT false,
  max_instances_per_region INTEGER,
  min_distance_from_major_place TEXT,
  required_landscape TEXT,
  required_economy TEXT,
  required_route_access TEXT,
  required_water_access TEXT,
  seasonal_availability TEXT,
  typical_population_band TEXT,
  typical_household_count TEXT,
  typical_wealth_level TEXT,
  typical_authority TEXT,
  typical_social_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_occupations JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_buildings JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_animals JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_goods JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_food_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
  layout_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  naming_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  access_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  law_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  religion_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  trade_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  defense_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  npc_generation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  item_generation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  route_generation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  historical_plausibility_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_material_culture (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  material_category TEXT CHECK (material_category IS NULL OR material_category IN (
    'clothing','tool','weapon','armor','food','livestock','container','transport','religious_item','trade_good','household_item','craft_material','luxury','document_or_mark'
  )),
  summary TEXT,
  commonness TEXT,
  status_level TEXT,
  allowed_social_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  restricted_social_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_owners JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_holders JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_materials JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_condition TEXT,
  typical_quality TEXT,
  typical_value_band TEXT,
  typical_marks JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_status TEXT,
  social_risk TEXT,
  theft_risk TEXT,
  trade_risk TEXT,
  seasonality TEXT,
  economic_source TEXT,
  import_or_local TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_risks (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  risk_type TEXT CHECK (risk_type IS NULL OR risk_type IN (
    'road','weather','law','violence','theft','hunger','disease','wild_animals','social','religious','economic','war','fire','water','cold'
  )),
  summary TEXT,
  applies_to_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to_graph_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to_occupations JSONB NOT NULL DEFAULT '[]'::jsonb,
  seasonality TEXT,
  trigger_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  visible_signs JSONB NOT NULL DEFAULT '[]'::jsonb,
  hidden_causes JSONB NOT NULL DEFAULT '[]'::jsonb,
  possible_consequences JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_level TEXT,
  frequency TEXT,
  avoidance_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
  mitigation_methods JSONB NOT NULL DEFAULT '[]'::jsonb,
  npc_reactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  law_consequences TEXT,
  economic_consequences TEXT,
  body_state_consequences TEXT,
  item_consequences TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.conflict_templates (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  conflict_type TEXT CHECK (conflict_type IS NULL OR conflict_type IN (
    'debt','property','trade','family','labor','status','religious','road','theft','violence','tax','duty','stranger','resource'
  )),
  summary TEXT,
  applies_to_place_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to_occupations JSONB NOT NULL DEFAULT '[]'::jsonb,
  trigger_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  stakes JSONB NOT NULL DEFAULT '[]'::jsonb,
  visible_signs JSONB NOT NULL DEFAULT '[]'::jsonb,
  hidden_layers JSONB NOT NULL DEFAULT '[]'::jsonb,
  possible_escalation JSONB NOT NULL DEFAULT '[]'::jsonb,
  possible_resolution JSONB NOT NULL DEFAULT '[]'::jsonb,
  law_involvement TEXT,
  authority_involvement TEXT,
  rumor_effect TEXT,
  relationship_effect TEXT,
  economic_effect TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.rumor_templates (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  rumor_type TEXT,
  summary TEXT,
  source_role TEXT,
  spread_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  spread_graph_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_event_id TEXT,
  linked_place_id TEXT,
  linked_risk_id TEXT,
  truth_status TEXT CHECK (truth_status IS NULL OR truth_status IN ('true','false','distorted','unknown','mixed')),
  distortion_level TEXT,
  what_is_visible TEXT,
  what_is_hidden TEXT,
  who_believes_it JSONB NOT NULL DEFAULT '[]'::jsonb,
  who_denies_it JSONB NOT NULL DEFAULT '[]'::jsonb,
  danger_of_repeating TEXT,
  possible_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  expiration_or_update_rule TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.price_bands (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  item_or_service_type TEXT,
  value_band TEXT,
  normal_price_description TEXT,
  cheap_condition TEXT,
  expensive_condition TEXT,
  scarcity_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
  seasonal_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  war_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  road_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  trade_place_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  who_can_afford JSONB NOT NULL DEFAULT '[]'::jsonb,
  who_can_sell JSONB NOT NULL DEFAULT '[]'::jsonb,
  who_controls_supply TEXT,
  barter_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  tax_or_duty TEXT,
  risk_of_fraud TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.seasonal_rules (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  season TEXT CHECK (season IS NULL OR season IN (
    'winter','spring','summer','autumn','rasputitsa','early_winter','late_winter'
  )),
  title TEXT,
  slug TEXT,
  weather_profile TEXT,
  daylight_profile TEXT,
  road_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  river_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  forest_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  food_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  work_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  trade_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  war_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  disease_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  clothing_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  shelter_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  available_occupations JSONB NOT NULL DEFAULT '[]'::jsonb,
  restricted_occupations JSONB NOT NULL DEFAULT '[]'::jsonb,
  available_graph_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  restricted_graph_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_scenes JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.religious_context (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  religion_type TEXT,
  summary TEXT,
  dominant_religion TEXT,
  minority_religions JSONB NOT NULL DEFAULT '[]'::jsonb,
  religious_authority TEXT,
  sacred_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  monastery_presence TEXT,
  church_presence TEXT,
  ritual_calendar JSONB NOT NULL DEFAULT '[]'::jsonb,
  taboos JSONB NOT NULL DEFAULT '[]'::jsonb,
  oath_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  burial_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  hospitality_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  charity_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  conflict_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  role_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  law_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  npc_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  player_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_npc_knowledge (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  social_role_id TEXT REFERENCES world_base.region_social_roles(id) ON DELETE SET NULL,
  occupation_id TEXT REFERENCES world_base.region_occupations(id) ON DELETE SET NULL,
  knowledge_type TEXT CHECK (knowledge_type IS NULL OR knowledge_type IN (
    'common','role_based','occupation_based','elite','clergy','trader','outsider','local','rumor','false_belief'
  )),
  title TEXT,
  summary TEXT,
  knows_as_fact JSONB NOT NULL DEFAULT '[]'::jsonb,
  knows_as_rumor JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_mistakes JSONB NOT NULL DEFAULT '[]'::jsonb,
  cannot_know JSONB NOT NULL DEFAULT '[]'::jsonb,
  taboo_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  dangerous_to_say JSONB NOT NULL DEFAULT '[]'::jsonb,
  who_they_trust JSONB NOT NULL DEFAULT '[]'::jsonb,
  who_they_fear JSONB NOT NULL DEFAULT '[]'::jsonb,
  regional_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  local_place_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  law_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  economy_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  religion_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  historical_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  route_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_order_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_knowledge JSONB NOT NULL DEFAULT '[]'::jsonb,
  speech_style_notes TEXT,
  behavior_effect TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_npc_generation_rules (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  npc_profile_type TEXT CHECK (npc_profile_type IS NULL OR npc_profile_type IN ('background','scene','key','group')),
  applies_to_place_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  applies_to_location_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_social_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowed_occupations JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  rarity_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  name_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  age_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  gender_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  wealth_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  clothing_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  equipment_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  speech_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  knowledge_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  fear_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  goal_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  authority_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  reaction_to_strangers TEXT,
  reaction_to_violence TEXT,
  reaction_to_theft TEXT,
  reaction_to_trade TEXT,
  reaction_to_law TEXT,
  background_npc_minimum INTEGER,
  scene_npc_minimum INTEGER,
  key_npc_minimum INTEGER,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.place_generation_limits (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  place_template_id TEXT REFERENCES world_base.region_place_generation_rules(id) ON DELETE SET NULL,
  max_total INTEGER,
  max_per_subregion INTEGER,
  min_total_if_region_active INTEGER,
  economic_basis_required BOOLEAN NOT NULL DEFAULT false,
  route_basis_required BOOLEAN NOT NULL DEFAULT false,
  water_basis_required BOOLEAN NOT NULL DEFAULT false,
  authority_basis_required BOOLEAN NOT NULL DEFAULT false,
  historical_anchor_basis_required BOOLEAN NOT NULL DEFAULT false,
  allowed_near_place_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_near_place_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  minimum_distance_band TEXT,
  maximum_distance_band TEXT,
  density_logic TEXT,
  naming_policy TEXT,
  duplication_policy TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.llm_context_packs (
  id TEXT PRIMARY KEY,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE SET NULL,
  title TEXT,
  slug TEXT,
  context_type TEXT CHECK (context_type IS NULL OR context_type IN (
    'region_start','new_place_generation','npc_generation','route_generation','historical_check','scene_context','repair_context'
  )),
  summary TEXT,
  included_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  included_record_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_text TEXT,
  hard_constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_assumptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  known_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  use_when TEXT,
  do_not_use_when TEXT,
  max_tokens_estimate INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.llm_validation_rules (
  id TEXT PRIMARY KEY,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE SET NULL,
  title TEXT,
  slug TEXT,
  validation_type TEXT,
  rule_text TEXT,
  applies_to_table TEXT,
  applies_to_generation_step TEXT,
  severity TEXT CHECK (severity IS NULL OR severity IN ('warning','error','hard_block')),
  failure_message TEXT,
  repair_instruction TEXT,
  examples_valid JSONB NOT NULL DEFAULT '[]'::jsonb,
  examples_invalid JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.region_gaps (
  id TEXT PRIMARY KEY,
  region_id TEXT REFERENCES world_base.regions(id) ON DELETE SET NULL,
  title TEXT,
  slug TEXT,
  gap_type TEXT,
  summary TEXT,
  why_needed TEXT,
  affected_tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  priority TEXT,
  risk_if_missing TEXT,
  suggested_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_research_query TEXT,
  current_workaround TEXT,
  blocked_generation_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.places (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES world_base.region_place_generation_rules(id) ON DELETE SET NULL,
  slug TEXT,
  canonical_name TEXT,
  display_name TEXT,
  alt_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  place_type TEXT CHECK (place_type IS NULL OR place_type IN (
    'city','posad','village','selo','pogost','monastery','fortress','yard','inn','ferry','ford','pier','market','road_segment','forest_camp','winter_hut','watch_post','border_zone'
  )),
  historical_status TEXT,
  is_fixed_historical_place BOOLEAN NOT NULL DEFAULT false,
  is_generated_place BOOLEAN NOT NULL DEFAULT false,
  generation_source TEXT,
  period_start_year INTEGER,
  period_end_year INTEGER,
  summary TEXT,
  function_in_region TEXT,
  economic_basis TEXT,
  political_control TEXT,
  religious_control TEXT,
  legal_status TEXT,
  owner_or_holder TEXT,
  population_band TEXT,
  wealth_level TEXT,
  landscape TEXT,
  water_access TEXT,
  road_access TEXT,
  defense_level TEXT,
  market_level TEXT,
  craft_level TEXT,
  food_supply_level TEXT,
  risk_level TEXT,
  known_to_commoners TEXT,
  known_to_traders TEXT,
  known_to_elites TEXT,
  known_to_clergy TEXT,
  known_to_outsiders TEXT,
  visible_description TEXT,
  hidden_notes TEXT,
  map_notes TEXT,
  llm_generation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_forbidden_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.graph_nodes (
  id TEXT PRIMARY KEY,
  slug TEXT,
  title TEXT,
  node_type TEXT CHECK (node_type IS NULL OR node_type IN (
    'world_region','subregion','place','location','minilocation','scene_anchor',
    'route_junction','river_junction','ford','ferry','gate','road_segment',
    'water_segment','border_crossing','sea_crossing','mountain_pass','desert_oasis','steppe_camp',
    'region_cell','cell_subgraph','map_corridor','geographic_landmark','historical_landmark'
  )),
  scale_level TEXT CHECK (scale_level IS NULL OR scale_level IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5')),
  parent_node_id TEXT REFERENCES world_base.graph_nodes(id) ON DELETE SET NULL,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  place_id TEXT REFERENCES world_base.places(id) ON DELETE SET NULL,
  grid_x INTEGER,
  grid_y INTEGER,
  grid_z INTEGER NOT NULL DEFAULT 0,
  region_cell_code TEXT,
  cell_shape TEXT CHECK (cell_shape IS NULL OR cell_shape IN (
    'square', 'partial', 'irregular', 'water', 'border'
  )),
  region_cell_status TEXT CHECK (region_cell_status IS NULL OR region_cell_status IN (
    'active', 'partial', 'border', 'outside_region', 'water_only'
  )),
  cell_size_km NUMERIC,
  crossing_base_gu NUMERIC,
  crossing_base_time_hours NUMERIC,
  primary_landscape_template_id TEXT REFERENCES world_base.landscape_templates(id) ON DELETE SET NULL,
  secondary_landscape_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  landscape_mix_notes TEXT,
  primary_water_body_template_id TEXT REFERENCES world_base.water_body_templates(id) ON DELETE SET NULL,
  secondary_water_body_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  hydrology_notes TEXT,
  land_use_template_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  place_template_id TEXT REFERENCES world_base.place_templates(id) ON DELETE SET NULL,
  terrain_profile TEXT,
  water_profile TEXT,
  road_profile TEXT,
  settlement_density TEXT,
  dominant_content TEXT,
  known_landmarks JSONB NOT NULL DEFAULT '[]'::jsonb,
  canonical_corridors JSONB NOT NULL DEFAULT '[]'::jsonb,
  neighbor_node_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  historical_status TEXT,
  is_known_to_player_default BOOLEAN NOT NULL DEFAULT false,
  is_known_to_character_default BOOLEAN NOT NULL DEFAULT false,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    NOT (scale_level = 'G1' AND node_type = 'region_cell')
    OR (
      grid_x IS NOT NULL AND grid_y IS NOT NULL AND grid_z IS NOT NULL
      AND cell_size_km IS NOT NULL AND crossing_base_gu IS NOT NULL
      AND crossing_base_time_hours IS NOT NULL AND region_cell_status IS NOT NULL
      AND primary_landscape_template_id IS NOT NULL
    )
  ),
  FOREIGN KEY (region_id, primary_landscape_template_id)
    REFERENCES world_base.region_landscape_templates(region_id, landscape_template_id)
);

CREATE TABLE world_base.graph_edges (
  id TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL REFERENCES world_base.graph_nodes(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES world_base.graph_nodes(id) ON DELETE CASCADE,
  reverse_edge_id TEXT REFERENCES world_base.graph_edges(id) ON DELETE SET NULL,
  scale_level TEXT CHECK (scale_level IS NULL OR scale_level IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5')),
  edge_type TEXT CHECK (edge_type IS NULL OR edge_type IN (
    'road','path','river','lake_route','sea_route','winter_road','ford','ferry','bridge',
    'gate','street','door','yard_passage','forest_track','offroad_crossing','mountain_pass','desert_route',
    'steppe_route','border_transition','corridor_segment','portage'
  )),
  base_gu NUMERIC,
  base_distance_km NUMERIC,
  base_time_minutes NUMERIC,
  base_time_hours NUMERIC,
  base_time_days NUMERIC,
  route_template_id TEXT REFERENCES world_base.route_templates(id) ON DELETE SET NULL,
  landscape_template_id TEXT REFERENCES world_base.landscape_templates(id) ON DELETE SET NULL,
  water_body_template_id TEXT REFERENCES world_base.water_body_templates(id) ON DELETE SET NULL,
  terrain_type TEXT,
  route_surface TEXT,
  seasonal_rule TEXT,
  access_rule TEXT,
  risk_level TEXT,
  known_to_commoners TEXT,
  known_to_traders TEXT,
  known_to_elites TEXT,
  known_to_clergy TEXT,
  known_to_character_default TEXT,
  requires_guide BOOLEAN NOT NULL DEFAULT false,
  requires_boat BOOLEAN NOT NULL DEFAULT false,
  requires_horse BOOLEAN NOT NULL DEFAULT false,
  requires_sled BOOLEAN NOT NULL DEFAULT false,
  requires_permission BOOLEAN NOT NULL DEFAULT false,
  requires_orientation_check BOOLEAN NOT NULL DEFAULT false,
  orientation_difficulty TEXT CHECK (orientation_difficulty IS NULL OR orientation_difficulty IN (
    'none', 'easy', 'ordinary', 'hard', 'dangerous', 'extreme'
  )),
  movement_risk_profile JSONB NOT NULL DEFAULT '[]'::jsonb,
  failure_consequences JSONB NOT NULL DEFAULT '[]'::jsonb,
  historical_status TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    NOT (edge_type = 'offroad_crossing') OR landscape_template_id IS NOT NULL
  ),
  CHECK (
    edge_type IS NULL
    OR edge_type NOT IN ('river', 'lake_route', 'sea_route', 'ford', 'ferry', 'bridge')
    OR water_body_template_id IS NOT NULL
  ),
  CHECK (
    edge_type IS NULL
    OR edge_type NOT IN ('road', 'path', 'forest_track', 'winter_road', 'portage', 'corridor_segment')
    OR route_template_id IS NOT NULL
  )
);

CREATE TABLE world_base.historical_anchors (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  place_id TEXT REFERENCES world_base.places(id) ON DELETE SET NULL,
  slug TEXT,
  canonical_name TEXT,
  display_name TEXT,
  anchor_type TEXT CHECK (anchor_type IS NULL OR anchor_type IN (
    'city','fortress','monastery','market','river','ford','ferry','road','winter_road','border','battle_site','princely_court','bishopric'
  )),
  summary TEXT,
  historical_status TEXT,
  period_start_year INTEGER,
  period_end_year INTEGER,
  approximate_bearing TEXT,
  distance_band TEXT,
  zone_of_influence TEXT,
  access_graph_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  visible_signs JSONB NOT NULL DEFAULT '[]'::jsonb,
  economic_influence TEXT,
  political_influence TEXT,
  religious_influence TEXT,
  military_influence TEXT,
  trade_influence TEXT,
  character_knowledge_common TEXT,
  character_knowledge_trader TEXT,
  character_knowledge_elite TEXT,
  character_knowledge_clergy TEXT,
  character_knowledge_outsider TEXT,
  discovery_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_use_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  llm_forbidden_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.historical_events (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  event_type TEXT,
  period_start_year INTEGER,
  period_end_year INTEGER,
  approximate_date TEXT,
  date_confidence TEXT,
  historical_status TEXT,
  summary TEXT,
  cause TEXT,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_regions JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_phase TEXT,
  phase_logic JSONB NOT NULL DEFAULT '[]'::jsonb,
  local_signs JSONB NOT NULL DEFAULT '[]'::jsonb,
  economic_effect TEXT,
  road_effect TEXT,
  law_effect TEXT,
  social_effect TEXT,
  military_effect TEXT,
  religious_effect TEXT,
  npc_knowledge_effect TEXT,
  rumor_effect TEXT,
  what_commoners_know TEXT,
  what_traders_know TEXT,
  what_elites_know TEXT,
  what_clergy_know TEXT,
  what_outsiders_know TEXT,
  hidden_truth_policy TEXT,
  future_knowledge_forbidden JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.historical_figures (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  title TEXT,
  slug TEXT,
  canonical_name TEXT,
  alt_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  figure_type TEXT,
  social_status TEXT,
  political_role TEXT,
  religious_role TEXT,
  military_role TEXT,
  social_class_id TEXT,
  role_archetype_id TEXT,
  social_position_archetype_id TEXT,
  period_start_year INTEGER,
  period_end_year INTEGER,
  summary TEXT,
  region_of_influence TEXT,
  linked_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_location_policy TEXT,
  direct_encounter_policy TEXT,
  influence_method TEXT,
  orders_or_effects JSONB NOT NULL DEFAULT '[]'::jsonb,
  reputation TEXT,
  what_commoners_know TEXT,
  what_traders_know TEXT,
  what_elites_know TEXT,
  what_clergy_know TEXT,
  what_outsiders_know TEXT,
  can_appear_directly BOOLEAN NOT NULL DEFAULT false,
  appearance_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  forbidden_uses JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.place_locations (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES world_base.places(id) ON DELETE CASCADE,
  slug TEXT,
  title TEXT,
  location_type TEXT CHECK (location_type IS NULL OR location_type IN (
    'gate','street','market','yard','churchyard','riverbank','pier','house','hall','barn','stable','workshop','storehouse','forest_edge','road_approach','monastery_yard','fortification_wall'
  )),
  summary TEXT,
  function TEXT,
  access_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  who_controls_access TEXT,
  typical_npc_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_buildings JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_sounds JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_smells JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  social_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  law_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  connected_location_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  closed_zones JSONB NOT NULL DEFAULT '[]'::jsonb,
  public_private_level TEXT,
  crowd_level TEXT,
  light_level TEXT,
  weather_exposure TEXT,
  llm_generation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  item_generation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  npc_generation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.place_minilocations (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES world_base.places(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES world_base.place_locations(id) ON DELETE CASCADE,
  slug TEXT,
  title TEXT,
  minilocation_type TEXT CHECK (minilocation_type IS NULL OR minilocation_type IN (
    'near_door','near_hearth','under_shed','behind_cart','near_gate','near_table','near_chest','near_boat','near_well','at_threshold','in_shadow','beside_fire'
  )),
  summary TEXT,
  position_description TEXT,
  access_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility TEXT,
  cover_or_hiding TEXT,
  noise_level TEXT,
  light_level TEXT,
  weather_exposure TEXT,
  nearby_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  nearby_npc_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  possible_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  movement_cost TEXT,
  risk_notes TEXT,
  connected_minilocation_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  anchor_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.scene_anchors (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES world_base.places(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES world_base.place_locations(id) ON DELETE SET NULL,
  minilocation_id TEXT REFERENCES world_base.place_minilocations(id) ON DELETE SET NULL,
  slug TEXT,
  title TEXT,
  anchor_type TEXT,
  summary TEXT,
  physical_description TEXT,
  is_fixed BOOLEAN NOT NULL DEFAULT false,
  is_movable BOOLEAN NOT NULL DEFAULT false,
  is_container BOOLEAN NOT NULL DEFAULT false,
  is_passage BOOLEAN NOT NULL DEFAULT false,
  is_obstacle BOOLEAN NOT NULL DEFAULT false,
  is_light_source BOOLEAN NOT NULL DEFAULT false,
  is_cover BOOLEAN NOT NULL DEFAULT false,
  is_dangerous BOOLEAN NOT NULL DEFAULT false,
  access_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  ownership_status TEXT,
  controller TEXT,
  condition TEXT,
  interaction_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_notes TEXT,
  linked_item_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  linked_graph_edge_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.place_buildings (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES world_base.places(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES world_base.place_locations(id) ON DELETE SET NULL,
  slug TEXT,
  title TEXT,
  building_type TEXT CHECK (building_type IS NULL OR building_type IN (
    'house','hut','barn','stable','storehouse','workshop','church','monastery_cell','gatehouse','tower','wall','bathhouse','mill','inn','warehouse','boathouse','smithy'
  )),
  summary TEXT,
  function TEXT,
  owner_or_holder TEXT,
  controller TEXT,
  public_private_level TEXT,
  access_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  legal_status TEXT,
  religious_status TEXT,
  wealth_level TEXT,
  condition TEXT,
  materials JSONB NOT NULL DEFAULT '[]'::jsonb,
  size_band TEXT,
  floors_or_sections TEXT,
  typical_rooms JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_npc_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  storage_logic TEXT,
  locked_areas JSONB NOT NULL DEFAULT '[]'::jsonb,
  hidden_area_policy TEXT,
  fire_risk TEXT,
  theft_risk TEXT,
  social_risk TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.historical_event_phases (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES world_base.historical_events(id) ON DELETE CASCADE,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  phase_name TEXT CHECK (phase_name IS NULL OR phase_name IN ('background','omens','escalation','impact','aftermath')),
  phase_order INTEGER,
  date_start TEXT,
  date_end TEXT,
  date_confidence TEXT,
  trigger_condition TEXT,
  summary TEXT,
  visible_signs JSONB NOT NULL DEFAULT '[]'::jsonb,
  hidden_processes JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_places JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_graph_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_goods JSONB NOT NULL DEFAULT '[]'::jsonb,
  npc_behavior_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  price_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  security_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  law_changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  rumor_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  delayed_event_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  what_character_can_know TEXT,
  what_character_cannot_know TEXT,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE world_base.item_templates (
  id TEXT PRIMARY KEY,
  region_id TEXT NOT NULL REFERENCES world_base.regions(id) ON DELETE CASCADE,
  material_culture_id TEXT REFERENCES world_base.region_material_culture(id) ON DELETE SET NULL,
  title TEXT,
  slug TEXT,
  item_type TEXT,
  summary TEXT,
  function TEXT,
  typical_material TEXT,
  weight_band TEXT,
  size_band TEXT,
  durability TEXT,
  quality_band TEXT,
  value_band TEXT,
  rarity TEXT,
  legal_status TEXT,
  social_status_signal TEXT,
  typical_owner_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_holder_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  typical_containers JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility_default TEXT,
  access_default TEXT,
  marking_default TEXT,
  risk_default TEXT,
  skill_use JSONB NOT NULL DEFAULT '[]'::jsonb,
  attribute_use JSONB NOT NULL DEFAULT '[]'::jsonb,
  possible_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  failure_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  damage_or_wear_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  game_use TEXT,
  limits TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected')),
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  audit_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE TRIGGER tr_graph_scale_rules_updated_at
  BEFORE UPDATE ON world_base.graph_scale_rules
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_graph_edge_modifiers_updated_at
  BEFORE UPDATE ON world_base.graph_edge_modifiers
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_landscape_templates_updated_at
  BEFORE UPDATE ON world_base.landscape_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_landscape_templates_updated_at
  BEFORE UPDATE ON world_base.region_landscape_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_source_records_updated_at
  BEFORE UPDATE ON world_base.source_records
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_regions_updated_at
  BEFORE UPDATE ON world_base.regions
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_neighbors_updated_at
  BEFORE UPDATE ON world_base.region_neighbors
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_laws_updated_at
  BEFORE UPDATE ON world_base.region_laws
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_economy_updated_at
  BEFORE UPDATE ON world_base.region_economy
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_social_classes_updated_at
  BEFORE UPDATE ON world_base.social_classes
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_social_role_archetypes_updated_at
  BEFORE UPDATE ON world_base.social_role_archetypes
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_legal_status_archetypes_updated_at
  BEFORE UPDATE ON world_base.legal_status_archetypes
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_dependency_archetypes_updated_at
  BEFORE UPDATE ON world_base.dependency_archetypes
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_mobility_archetypes_updated_at
  BEFORE UPDATE ON world_base.mobility_archetypes
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_social_position_archetypes_updated_at
  BEFORE UPDATE ON world_base.social_position_archetypes
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_class_role_rules_updated_at
  BEFORE UPDATE ON world_base.class_role_rules
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_occupation_archetypes_updated_at
  BEFORE UPDATE ON world_base.occupation_archetypes
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_skill_catalog_updated_at
  BEFORE UPDATE ON world_base.skill_catalog
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_occupation_skill_defaults_updated_at
  BEFORE UPDATE ON world_base.occupation_skill_defaults
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_role_occupation_rules_updated_at
  BEFORE UPDATE ON world_base.role_occupation_rules
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_universal_archetype_proposals_updated_at
  BEFORE UPDATE ON world_base.universal_archetype_proposals
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_social_roles_updated_at
  BEFORE UPDATE ON world_base.region_social_roles
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_occupations_updated_at
  BEFORE UPDATE ON world_base.region_occupations
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_water_body_templates_updated_at
  BEFORE UPDATE ON world_base.water_body_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_route_templates_updated_at
  BEFORE UPDATE ON world_base.route_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_land_use_templates_updated_at
  BEFORE UPDATE ON world_base.land_use_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_place_templates_updated_at
  BEFORE UPDATE ON world_base.place_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_water_body_templates_updated_at
  BEFORE UPDATE ON world_base.region_water_body_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_land_use_templates_updated_at
  BEFORE UPDATE ON world_base.region_land_use_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_place_templates_updated_at
  BEFORE UPDATE ON world_base.region_place_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_place_generation_rules_updated_at
  BEFORE UPDATE ON world_base.region_place_generation_rules
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_material_culture_updated_at
  BEFORE UPDATE ON world_base.region_material_culture
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_risks_updated_at
  BEFORE UPDATE ON world_base.region_risks
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_conflict_templates_updated_at
  BEFORE UPDATE ON world_base.conflict_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_rumor_templates_updated_at
  BEFORE UPDATE ON world_base.rumor_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_price_bands_updated_at
  BEFORE UPDATE ON world_base.price_bands
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_seasonal_rules_updated_at
  BEFORE UPDATE ON world_base.seasonal_rules
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_religious_context_updated_at
  BEFORE UPDATE ON world_base.religious_context
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_npc_knowledge_updated_at
  BEFORE UPDATE ON world_base.region_npc_knowledge
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_npc_generation_rules_updated_at
  BEFORE UPDATE ON world_base.region_npc_generation_rules
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_place_generation_limits_updated_at
  BEFORE UPDATE ON world_base.place_generation_limits
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_llm_context_packs_updated_at
  BEFORE UPDATE ON world_base.llm_context_packs
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_llm_validation_rules_updated_at
  BEFORE UPDATE ON world_base.llm_validation_rules
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_region_gaps_updated_at
  BEFORE UPDATE ON world_base.region_gaps
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_places_updated_at
  BEFORE UPDATE ON world_base.places
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_graph_nodes_updated_at
  BEFORE UPDATE ON world_base.graph_nodes
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_graph_nodes_template_region_link
  BEFORE INSERT OR UPDATE ON world_base.graph_nodes
  FOR EACH ROW EXECUTE PROCEDURE world_base.validate_template_region_link();

CREATE TRIGGER tr_graph_edges_updated_at
  BEFORE UPDATE ON world_base.graph_edges
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_graph_edges_template_region_link
  BEFORE INSERT OR UPDATE ON world_base.graph_edges
  FOR EACH ROW EXECUTE PROCEDURE world_base.validate_template_region_link();

CREATE TRIGGER tr_historical_anchors_updated_at
  BEFORE UPDATE ON world_base.historical_anchors
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_historical_events_updated_at
  BEFORE UPDATE ON world_base.historical_events
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_historical_figures_updated_at
  BEFORE UPDATE ON world_base.historical_figures
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_place_locations_updated_at
  BEFORE UPDATE ON world_base.place_locations
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_place_minilocations_updated_at
  BEFORE UPDATE ON world_base.place_minilocations
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_scene_anchors_updated_at
  BEFORE UPDATE ON world_base.scene_anchors
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_place_buildings_updated_at
  BEFORE UPDATE ON world_base.place_buildings
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_historical_event_phases_updated_at
  BEFORE UPDATE ON world_base.historical_event_phases
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_item_templates_updated_at
  BEFORE UPDATE ON world_base.item_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_building_templates_updated_at
  BEFORE UPDATE ON world_base.building_templates
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_location_object_rules_updated_at
  BEFORE UPDATE ON world_base.location_object_rules
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_weather_profiles_updated_at
  BEFORE UPDATE ON world_base.weather_profiles
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_graph_edge_knowledge_rules_updated_at
  BEFORE UPDATE ON world_base.graph_edge_knowledge_rules
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_record_sources_updated_at
  BEFORE UPDATE ON world_base.record_sources
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();

CREATE TRIGGER tr_audit_log_updated_at
  BEFORE UPDATE ON world_base.audit_log
  FOR EACH ROW EXECUTE PROCEDURE world_base.touch_updated_at();


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

