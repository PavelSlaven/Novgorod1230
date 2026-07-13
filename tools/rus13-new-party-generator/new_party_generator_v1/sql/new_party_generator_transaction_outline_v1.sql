-- new_party_generator_transaction_outline_v1.sql
-- Назначение: порядок атомарной фиксации утверждённого старта партии.
-- Код не создаёт смысловые сущности мира. Все semantic JSON ниже должны быть LLM-approved.

BEGIN;

-- 01 party_state: историческая рамка, активный регион, сезон, текущее время.
-- INSERT INTO party_state (...);

-- 02 party_graph_nodes / party_graph_edges: копии/ссылки на канонические G1-G4 и стартовые party-created узлы, если LLM их утвердила.
-- INSERT INTO party_graph_nodes (...);
-- INSERT INTO party_graph_edges (...);

-- 03 party_places / party_locations / party_minilocations / party_scene_anchors.
-- INSERT INTO party_places (...);
-- INSERT INTO party_locations (...);
-- INSERT INTO party_minilocations (...);
-- INSERT INTO party_scene_anchors (...);

-- 04 party_current_position: обязательно полная иерархия позиции.
-- INSERT INTO party_current_position (party_id, region_id, place_id, location_id, minilocation_id, anchor_id, last_route_id, updated_at) VALUES (...);

-- 05 party_player_characters, inventory and knowledge.
-- INSERT INTO party_player_characters (...);
-- INSERT INTO party_items (...);
-- INSERT INTO party_inventory_entries (...);
-- INSERT INTO party_map_knowledge (...);

-- 06 NPC, item/property layer, events and journal.
-- INSERT INTO party_npcs (...);
-- INSERT INTO party_events (...);
-- INSERT INTO party_journal_entries (...);

-- 07 first visible turn/prose, after hidden/visible split.
-- INSERT INTO party_turns (...);
-- INSERT INTO party_llm_steps (...);

COMMIT;
