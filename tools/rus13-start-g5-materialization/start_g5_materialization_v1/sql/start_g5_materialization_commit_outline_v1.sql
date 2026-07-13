-- start_g5_materialization_commit_outline_v1.sql
-- Purpose: atomic commit of accepted G5 start scene materialization into party DB.
-- Semantic content must come from accepted LLM contracts. Code does not invent missing values.

BEGIN;

-- 01 Record accepted LLM step chain.
-- INSERT INTO party.party_llm_steps (...);

-- 02 Insert G5 party graph nodes for minilocations and scene anchors.
-- INSERT INTO party.party_graph_nodes
--   (party_id, canonical_node_id, slug, title, node_type, scale_level, parent_node_id, region_id, place_id,
--    is_materialized, is_known_to_character, is_known_to_player, visible_name, current_state, hidden_state, created_by_llm_step,
--    created_at_game_time, updated_at_game_time)
-- VALUES (...);

-- 03 Insert party_minilocations.
-- INSERT INTO party.party_minilocations
--   (party_id, place_id, location_id, canonical_minilocation_id, title, minilocation_type,
--    visible_description, position_state, current_state, hidden_state, created_by_llm_step,
--    created_at_game_time, updated_at_game_time)
-- VALUES (...);

-- 04 Insert party_scene_anchors.
-- INSERT INTO party.party_scene_anchors
--   (party_id, place_id, location_id, minilocation_id, canonical_anchor_id, title, anchor_type,
--    visible_description, physical_state, access_state, ownership_state, current_state, hidden_state,
--    created_by_llm_step, created_at_game_time, updated_at_game_time)
-- VALUES (...);

-- 05 Insert G5 movement edges.
-- INSERT INTO party.party_graph_edges
--   (party_id, canonical_edge_id, from_party_node_id, to_party_node_id, reverse_party_edge_id,
--    scale_level, edge_type, current_time_minutes, current_access, current_conditions, current_risk,
--    is_known_to_character, is_known_to_player, is_blocked, block_reason, created_by_llm_step,
--    updated_at_game_time)
-- VALUES (...);

-- 06 Insert/update bound items and NPCs only if approved by G5ObjectNpcBinding.
-- INSERT INTO party.party_items (...);
-- INSERT INTO party.party_npcs (...);

-- 07 Update/insert current position only after anchor and current_node exist.
-- INSERT INTO party.party_current_position
--   (party_id, character_id, region_id, place_id, location_id, minilocation_id, anchor_id,
--    current_node_id, last_route_id, position_visible_text, game_day_index, game_minute_of_day)
-- VALUES (...);

-- 08 Store visible start facts if needed.
-- INSERT INTO party.party_journal_entries (...);

COMMIT;
