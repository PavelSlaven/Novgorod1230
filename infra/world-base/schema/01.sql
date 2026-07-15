-- World Base Schema v2 foundation (the complete ordered DDL currently creates 147 tables).
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

-- One trigger fn for primary FK + JSONB secondary template ids on graph_nodes/edges.
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
