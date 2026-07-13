-- party_database_schema_v1.sql
-- Mutable party-state schema for RUS13 text RPG.
-- The read-only world_base remains the canonical reference. This schema stores only one party's mutable state.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS party;

CREATE OR REPLACE FUNCTION party.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS party.party_state (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  save_slot TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'paused', 'completed', 'abandoned', 'error', 'archived')),
  world_base_version TEXT,
  start_year INTEGER NOT NULL CHECK (start_year BETWEEN 1230 AND 1250),
  current_year INTEGER NOT NULL,
  current_season TEXT,
  current_day_index INTEGER NOT NULL CHECK (current_day_index >= 0),
  current_minute_of_day INTEGER NOT NULL CHECK (current_minute_of_day BETWEEN 0 AND 1439),
  current_region_id TEXT NOT NULL,
  player_character_id TEXT,
  visible_summary TEXT,
  memory_summary TEXT,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  audit_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS party.party_player_characters (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  display_name TEXT,
  social_role_id TEXT,
  occupation_id TEXT,
  social_class_id TEXT,
  social_position_archetype_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'dead', 'destroyed', 'missing', 'resolved', 'needs_review')),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  skills JSONB NOT NULL DEFAULT '{}'::jsonb,
  body_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  inventory_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  knowledge_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  memory_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  visible_description TEXT,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_llm_step TEXT,
  created_at_game_time TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_graph_nodes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canonical_node_id TEXT,
  slug TEXT,
  title TEXT,
  node_type TEXT NOT NULL CHECK (node_type IN ('world_region', 'region_cell', 'cell_subgraph', 'map_corridor', 'geographic_landmark', 'historical_landmark', 'subregion', 'place', 'location', 'minilocation', 'scene_anchor', 'route_junction', 'river_junction', 'ford', 'ferry', 'gate', 'road_segment', 'water_segment', 'border_crossing', 'sea_crossing', 'mountain_pass', 'desert_oasis', 'steppe_camp')),
  scale_level TEXT NOT NULL CHECK (scale_level IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5')),
  parent_node_id TEXT,
  region_id TEXT NOT NULL,
  place_id TEXT,
  is_materialized BOOLEAN NOT NULL DEFAULT false,
  is_known_to_character BOOLEAN NOT NULL DEFAULT false,
  is_known_to_player BOOLEAN NOT NULL DEFAULT false,
  visible_name TEXT,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_llm_step TEXT,
  created_at_game_time TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_graph_edges (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canonical_edge_id TEXT,
  from_party_node_id TEXT NOT NULL,
  to_party_node_id TEXT NOT NULL,
  reverse_party_edge_id TEXT,
  scale_level TEXT NOT NULL CHECK (scale_level IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5')),
  edge_type TEXT NOT NULL CHECK (edge_type IN ('road', 'path', 'river', 'lake_route', 'sea_route', 'winter_road', 'ford', 'ferry', 'bridge', 'gate', 'street', 'door', 'yard_passage', 'forest_track', 'offroad_crossing', 'mountain_pass', 'desert_route', 'steppe_route', 'border_transition', 'corridor_segment', 'portage')),
  base_gu NUMERIC,
  current_time_minutes NUMERIC,
  current_time_hours NUMERIC,
  current_access TEXT,
  current_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_risk TEXT,
  current_seasonal_state TEXT,
  is_known_to_character BOOLEAN NOT NULL DEFAULT false,
  is_known_to_player BOOLEAN NOT NULL DEFAULT false,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  block_reason TEXT,
  last_used_at_game_time TEXT,
  created_by_llm_step TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_places (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canonical_place_id TEXT,
  canonical_node_id TEXT,
  region_id TEXT NOT NULL,
  template_id TEXT,
  title TEXT,
  place_type TEXT,
  historical_status TEXT,
  materialized_from_node_id TEXT,
  visible_description TEXT,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_controller_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_llm_step TEXT,
  created_at_game_time TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_locations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  place_id TEXT NOT NULL,
  canonical_location_id TEXT,
  title TEXT,
  location_type TEXT,
  visible_description TEXT,
  access_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_llm_step TEXT,
  created_at_game_time TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_minilocations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  place_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  canonical_minilocation_id TEXT,
  title TEXT,
  minilocation_type TEXT,
  visible_description TEXT,
  position_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_llm_step TEXT,
  created_at_game_time TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_scene_anchors (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  place_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  minilocation_id TEXT NOT NULL,
  canonical_anchor_id TEXT,
  title TEXT,
  anchor_type TEXT,
  visible_description TEXT,
  physical_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ownership_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_llm_step TEXT,
  created_at_game_time TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_current_position (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  character_id TEXT NOT NULL,
  region_id TEXT NOT NULL,
  place_id TEXT,
  location_id TEXT,
  minilocation_id TEXT,
  anchor_id TEXT,
  current_node_id TEXT,
  last_route_id TEXT,
  position_visible_text TEXT,
  updated_by_turn_id TEXT,
  game_day_index INTEGER NOT NULL CHECK (game_day_index >= 0),
  game_minute_of_day INTEGER NOT NULL CHECK (game_minute_of_day BETWEEN 0 AND 1439)
);

CREATE TABLE IF NOT EXISTS party.party_map_knowledge (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  character_id TEXT NOT NULL,
  node_id TEXT,
  edge_id TEXT,
  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('known_exact', 'known_rough', 'heard_rumor', 'seen_from_distance', 'inferred', 'unknown', 'false_belief')),
  knowledge_accuracy TEXT NOT NULL CHECK (knowledge_accuracy IN ('accurate', 'approximate', 'outdated', 'distorted', 'false', 'unknown')),
  source_of_knowledge TEXT,
  first_learned_at TEXT,
  last_confirmed_at TEXT,
  visible_description TEXT,
  false_or_outdated_notes TEXT
);

CREATE TABLE IF NOT EXISTS party.party_route_journal (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  character_id TEXT NOT NULL,
  from_node_id TEXT,
  to_node_id TEXT,
  edge_id TEXT,
  started_at_game_time TEXT NOT NULL,
  ended_at_game_time TEXT,
  travel_time_minutes NUMERIC,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_cost JSONB NOT NULL DEFAULT '{}'::jsonb,
  visible_result TEXT,
  hidden_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS party.party_npcs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canonical_npc_id TEXT,
  profile_type TEXT NOT NULL CHECK (profile_type IN ('background', 'scene', 'key', 'group')),
  region_id TEXT NOT NULL,
  current_node_id TEXT,
  current_place_id TEXT,
  current_location_id TEXT,
  visible_label TEXT,
  known_name TEXT,
  social_role_id TEXT,
  occupation_id TEXT,
  social_class_id TEXT,
  social_position_archetype_id TEXT,
  skills JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('active', 'inactive', 'dead', 'destroyed', 'missing', 'resolved', 'needs_review')),
  body_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  relationship_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  knowledge_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_known_to_character BOOLEAN NOT NULL DEFAULT false,
  is_visible_in_scene BOOLEAN NOT NULL DEFAULT false,
  created_by_llm_step TEXT,
  created_at_game_time TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canonical_item_template_id TEXT,
  item_type TEXT,
  title TEXT,
  is_container BOOLEAN NOT NULL DEFAULT false,
  container_item_id TEXT,
  owner_type TEXT,
  owner_id TEXT,
  holder_type TEXT,
  holder_id TEXT,
  place_id TEXT,
  location_id TEXT,
  minilocation_id TEXT,
  anchor_id TEXT,
  materialization_reason TEXT NOT NULL,
  visibility_state TEXT NOT NULL CHECK (visibility_state IN ('visible', 'partly_visible', 'hidden', 'known', 'suspected', 'unknown')),
  physical_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ownership_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  access_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_llm_step TEXT,
  created_at_game_time TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_inventory_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  item_id TEXT NOT NULL,
  holder_type TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  location_on_holder TEXT,
  quick_access TEXT,
  is_equipped BOOLEAN NOT NULL DEFAULT false,
  visible_to_character BOOLEAN NOT NULL DEFAULT false,
  started_at_game_time TEXT,
  ended_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canonical_event_id TEXT,
  event_type TEXT,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'active', 'resolved', 'cancelled', 'hidden', 'needs_review')),
  visibility_state TEXT NOT NULL CHECK (visibility_state IN ('visible', 'partly_visible', 'hidden', 'known', 'suspected', 'unknown')),
  title TEXT,
  cause TEXT NOT NULL,
  trigger_condition TEXT,
  scheduled_game_day INTEGER,
  scheduled_minute_of_day INTEGER CHECK (scheduled_minute_of_day BETWEEN 0 AND 1439),
  current_phase TEXT,
  visible_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  hidden_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected_entities JSONB NOT NULL DEFAULT '{}'::jsonb,
  consequences_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_llm_step TEXT,
  created_at_game_time TEXT,
  updated_at_game_time TEXT
);

CREATE TABLE IF NOT EXISTS party.party_turns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  turn_index INTEGER NOT NULL CHECK (turn_index >= 0),
  player_input TEXT NOT NULL,
  intent_summary TEXT,
  started_at_game_time TEXT NOT NULL,
  ended_at_game_time TEXT,
  elapsed_minutes NUMERIC,
  resolution_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  visible_result TEXT,
  hidden_updates JSONB NOT NULL DEFAULT '{}'::jsonb,
  llm_step_id TEXT,
  audit_status TEXT
);

CREATE TABLE IF NOT EXISTS party.party_journal_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  turn_id TEXT,
  character_id TEXT,
  entry_type TEXT NOT NULL,
  visibility_state TEXT NOT NULL CHECK (visibility_state IN ('visible', 'partly_visible', 'hidden', 'known', 'suspected', 'unknown')),
  truth_status TEXT,
  title TEXT,
  body TEXT NOT NULL,
  linked_entities JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at_game_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS party.party_llm_steps (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'accepted', 'rejected', 'needs_repair', 'repaired', 'failed')),
  input_hash TEXT,
  output_hash TEXT,
  safe_visible_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  structured_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  parent_step_id TEXT,
  created_at_game_time TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS party.party_validation_issues (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  party_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  llm_step_id TEXT,
  turn_id TEXT,
  severity TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  message TEXT NOT NULL,
  affected_table TEXT,
  affected_row_id TEXT,
  repair_instruction TEXT,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);

DO $$ BEGIN
  ALTER TABLE party.party_player_characters ADD CONSTRAINT fk_party_player_characters_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_graph_nodes ADD CONSTRAINT fk_party_graph_nodes_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_graph_nodes ADD CONSTRAINT fk_party_graph_nodes_parent_node_id_party_graph_nodes_id FOREIGN KEY (parent_node_id) REFERENCES party.party_graph_nodes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_graph_edges ADD CONSTRAINT fk_party_graph_edges_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_graph_edges ADD CONSTRAINT fk_party_graph_edges_from_party_node_id_party_graph_nodes_id FOREIGN KEY (from_party_node_id) REFERENCES party.party_graph_nodes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_graph_edges ADD CONSTRAINT fk_party_graph_edges_to_party_node_id_party_graph_nodes_id FOREIGN KEY (to_party_node_id) REFERENCES party.party_graph_nodes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_graph_edges ADD CONSTRAINT fk_party_graph_edges_reverse_party_edge_id_party_graph_edges FOREIGN KEY (reverse_party_edge_id) REFERENCES party.party_graph_edges(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_places ADD CONSTRAINT fk_party_places_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_places ADD CONSTRAINT fk_party_places_materialized_from_node_id_party_graph_nodes_ FOREIGN KEY (materialized_from_node_id) REFERENCES party.party_graph_nodes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_locations ADD CONSTRAINT fk_party_locations_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_minilocations ADD CONSTRAINT fk_party_minilocations_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_scene_anchors ADD CONSTRAINT fk_party_scene_anchors_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_locations ADD CONSTRAINT fk_party_locations_place_id_party_places_id FOREIGN KEY (place_id) REFERENCES party.party_places(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_minilocations ADD CONSTRAINT fk_party_minilocations_place_id_party_places_id FOREIGN KEY (place_id) REFERENCES party.party_places(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_minilocations ADD CONSTRAINT fk_party_minilocations_location_id_party_locations_id FOREIGN KEY (location_id) REFERENCES party.party_locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_scene_anchors ADD CONSTRAINT fk_party_scene_anchors_place_id_party_places_id FOREIGN KEY (place_id) REFERENCES party.party_places(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_scene_anchors ADD CONSTRAINT fk_party_scene_anchors_location_id_party_locations_id FOREIGN KEY (location_id) REFERENCES party.party_locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_scene_anchors ADD CONSTRAINT fk_party_scene_anchors_minilocation_id_party_minilocations_i FOREIGN KEY (minilocation_id) REFERENCES party.party_minilocations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_current_position ADD CONSTRAINT fk_party_current_position_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_current_position ADD CONSTRAINT fk_party_current_position_character_id_party_player_characte FOREIGN KEY (character_id) REFERENCES party.party_player_characters(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_current_position ADD CONSTRAINT fk_party_current_position_place_id_party_places_id FOREIGN KEY (place_id) REFERENCES party.party_places(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_current_position ADD CONSTRAINT fk_party_current_position_location_id_party_locations_id FOREIGN KEY (location_id) REFERENCES party.party_locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_current_position ADD CONSTRAINT fk_party_current_position_minilocation_id_party_minilocation FOREIGN KEY (minilocation_id) REFERENCES party.party_minilocations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_current_position ADD CONSTRAINT fk_party_current_position_anchor_id_party_scene_anchors_id FOREIGN KEY (anchor_id) REFERENCES party.party_scene_anchors(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_current_position ADD CONSTRAINT fk_party_current_position_current_node_id_party_graph_nodes_ FOREIGN KEY (current_node_id) REFERENCES party.party_graph_nodes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_current_position ADD CONSTRAINT fk_party_current_position_last_route_id_party_graph_edges_id FOREIGN KEY (last_route_id) REFERENCES party.party_graph_edges(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_map_knowledge ADD CONSTRAINT fk_party_map_knowledge_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_map_knowledge ADD CONSTRAINT fk_party_map_knowledge_character_id_party_player_characters_ FOREIGN KEY (character_id) REFERENCES party.party_player_characters(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_map_knowledge ADD CONSTRAINT fk_party_map_knowledge_node_id_party_graph_nodes_id FOREIGN KEY (node_id) REFERENCES party.party_graph_nodes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_map_knowledge ADD CONSTRAINT fk_party_map_knowledge_edge_id_party_graph_edges_id FOREIGN KEY (edge_id) REFERENCES party.party_graph_edges(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_route_journal ADD CONSTRAINT fk_party_route_journal_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_route_journal ADD CONSTRAINT fk_party_route_journal_character_id_party_player_characters_ FOREIGN KEY (character_id) REFERENCES party.party_player_characters(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_route_journal ADD CONSTRAINT fk_party_route_journal_from_node_id_party_graph_nodes_id FOREIGN KEY (from_node_id) REFERENCES party.party_graph_nodes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_route_journal ADD CONSTRAINT fk_party_route_journal_to_node_id_party_graph_nodes_id FOREIGN KEY (to_node_id) REFERENCES party.party_graph_nodes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_route_journal ADD CONSTRAINT fk_party_route_journal_edge_id_party_graph_edges_id FOREIGN KEY (edge_id) REFERENCES party.party_graph_edges(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_npcs ADD CONSTRAINT fk_party_npcs_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_npcs ADD CONSTRAINT fk_party_npcs_current_node_id_party_graph_nodes_id FOREIGN KEY (current_node_id) REFERENCES party.party_graph_nodes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_npcs ADD CONSTRAINT fk_party_npcs_current_place_id_party_places_id FOREIGN KEY (current_place_id) REFERENCES party.party_places(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_npcs ADD CONSTRAINT fk_party_npcs_current_location_id_party_locations_id FOREIGN KEY (current_location_id) REFERENCES party.party_locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_items ADD CONSTRAINT fk_party_items_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_items ADD CONSTRAINT fk_party_items_container_item_id_party_items_id FOREIGN KEY (container_item_id) REFERENCES party.party_items(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_items ADD CONSTRAINT fk_party_items_place_id_party_places_id FOREIGN KEY (place_id) REFERENCES party.party_places(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_items ADD CONSTRAINT fk_party_items_location_id_party_locations_id FOREIGN KEY (location_id) REFERENCES party.party_locations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_items ADD CONSTRAINT fk_party_items_minilocation_id_party_minilocations_id FOREIGN KEY (minilocation_id) REFERENCES party.party_minilocations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_items ADD CONSTRAINT fk_party_items_anchor_id_party_scene_anchors_id FOREIGN KEY (anchor_id) REFERENCES party.party_scene_anchors(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_inventory_entries ADD CONSTRAINT fk_party_inventory_entries_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_inventory_entries ADD CONSTRAINT fk_party_inventory_entries_item_id_party_items_id FOREIGN KEY (item_id) REFERENCES party.party_items(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_events ADD CONSTRAINT fk_party_events_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_turns ADD CONSTRAINT fk_party_turns_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_journal_entries ADD CONSTRAINT fk_party_journal_entries_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_journal_entries ADD CONSTRAINT fk_party_journal_entries_turn_id_party_turns_id FOREIGN KEY (turn_id) REFERENCES party.party_turns(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_journal_entries ADD CONSTRAINT fk_party_journal_entries_character_id_party_player_character FOREIGN KEY (character_id) REFERENCES party.party_player_characters(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_llm_steps ADD CONSTRAINT fk_party_llm_steps_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_llm_steps ADD CONSTRAINT fk_party_llm_steps_parent_step_id_party_llm_steps_id FOREIGN KEY (parent_step_id) REFERENCES party.party_llm_steps(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_validation_issues ADD CONSTRAINT fk_party_validation_issues_party_id_party_state_id FOREIGN KEY (party_id) REFERENCES party.party_state(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_validation_issues ADD CONSTRAINT fk_party_validation_issues_llm_step_id_party_llm_steps_id FOREIGN KEY (llm_step_id) REFERENCES party.party_llm_steps(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE party.party_validation_issues ADD CONSTRAINT fk_party_validation_issues_turn_id_party_turns_id FOREIGN KEY (turn_id) REFERENCES party.party_turns(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_party_state_save_slot ON party.party_state(save_slot);
CREATE UNIQUE INDEX IF NOT EXISTS ux_party_current_position_party_character ON party.party_current_position(party_id, character_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_party_turn_index ON party.party_turns(party_id, turn_index);
CREATE INDEX IF NOT EXISTS ix_party_graph_nodes_party_scale ON party.party_graph_nodes(party_id, scale_level, node_type);
CREATE INDEX IF NOT EXISTS ix_party_graph_edges_party_nodes ON party.party_graph_edges(party_id, from_party_node_id, to_party_node_id);
CREATE INDEX IF NOT EXISTS ix_party_map_knowledge_party_character ON party.party_map_knowledge(party_id, character_id, knowledge_type);
CREATE INDEX IF NOT EXISTS ix_party_npcs_party_place ON party.party_npcs(party_id, current_place_id, profile_type);
CREATE INDEX IF NOT EXISTS ix_party_items_party_holder ON party.party_items(party_id, holder_type, holder_id);
CREATE INDEX IF NOT EXISTS ix_party_events_party_status_time ON party.party_events(party_id, status, scheduled_game_day, scheduled_minute_of_day);

DROP TRIGGER IF EXISTS trg_party_state_updated_at ON party.party_state;
CREATE TRIGGER trg_party_state_updated_at BEFORE UPDATE ON party.party_state FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_player_characters_updated_at ON party.party_player_characters;
CREATE TRIGGER trg_party_player_characters_updated_at BEFORE UPDATE ON party.party_player_characters FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_graph_nodes_updated_at ON party.party_graph_nodes;
CREATE TRIGGER trg_party_graph_nodes_updated_at BEFORE UPDATE ON party.party_graph_nodes FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_graph_edges_updated_at ON party.party_graph_edges;
CREATE TRIGGER trg_party_graph_edges_updated_at BEFORE UPDATE ON party.party_graph_edges FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_places_updated_at ON party.party_places;
CREATE TRIGGER trg_party_places_updated_at BEFORE UPDATE ON party.party_places FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_locations_updated_at ON party.party_locations;
CREATE TRIGGER trg_party_locations_updated_at BEFORE UPDATE ON party.party_locations FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_minilocations_updated_at ON party.party_minilocations;
CREATE TRIGGER trg_party_minilocations_updated_at BEFORE UPDATE ON party.party_minilocations FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_scene_anchors_updated_at ON party.party_scene_anchors;
CREATE TRIGGER trg_party_scene_anchors_updated_at BEFORE UPDATE ON party.party_scene_anchors FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_current_position_updated_at ON party.party_current_position;
CREATE TRIGGER trg_party_current_position_updated_at BEFORE UPDATE ON party.party_current_position FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_map_knowledge_updated_at ON party.party_map_knowledge;
CREATE TRIGGER trg_party_map_knowledge_updated_at BEFORE UPDATE ON party.party_map_knowledge FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_route_journal_updated_at ON party.party_route_journal;
CREATE TRIGGER trg_party_route_journal_updated_at BEFORE UPDATE ON party.party_route_journal FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_npcs_updated_at ON party.party_npcs;
CREATE TRIGGER trg_party_npcs_updated_at BEFORE UPDATE ON party.party_npcs FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_items_updated_at ON party.party_items;
CREATE TRIGGER trg_party_items_updated_at BEFORE UPDATE ON party.party_items FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_inventory_entries_updated_at ON party.party_inventory_entries;
CREATE TRIGGER trg_party_inventory_entries_updated_at BEFORE UPDATE ON party.party_inventory_entries FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_events_updated_at ON party.party_events;
CREATE TRIGGER trg_party_events_updated_at BEFORE UPDATE ON party.party_events FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_turns_updated_at ON party.party_turns;
CREATE TRIGGER trg_party_turns_updated_at BEFORE UPDATE ON party.party_turns FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_journal_entries_updated_at ON party.party_journal_entries;
CREATE TRIGGER trg_party_journal_entries_updated_at BEFORE UPDATE ON party.party_journal_entries FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_llm_steps_updated_at ON party.party_llm_steps;
CREATE TRIGGER trg_party_llm_steps_updated_at BEFORE UPDATE ON party.party_llm_steps FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
DROP TRIGGER IF EXISTS trg_party_validation_issues_updated_at ON party.party_validation_issues;
CREATE TRIGGER trg_party_validation_issues_updated_at BEFORE UPDATE ON party.party_validation_issues FOR EACH ROW EXECUTE FUNCTION party.touch_updated_at();
