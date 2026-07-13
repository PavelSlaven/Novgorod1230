Live PostgreSQL snapshot — world_db
Created: 2026-07-10 (local docker: world-base-postgres-1, postgres:16)

FILES
-----
world_base.dump  — schema world_base only (pg_dump custom format -Fc)
party.dump       — schema party only (pg_dump custom format -Fc)

CONTENTS (approximate live DB sizes at dump time)
-------------------------------------------------
world_base: 62 tables, ~83 MB on disk (dump file ~2.0 MB compressed)
party:      19 tables, ~376 kB on disk (dump file ~78 kB)

NOT INCLUDED
------------
- .env / credentials (never store in archives)
- public schema (NocoDB metadata, ~129 tables)
- NocoDB internal schemas (p1d80cxu51jealx, ppzwkwh6sfyvp2c, pvgr7ydp6vdgz8n)

world_base tables (reference world data):
audit_log, building_templates, class_role_rules, conflict_templates,
dependency_archetypes, graph_*, historical_*, item_templates, land_use_*,
landscape_templates, legal_status_archetypes, llm_*, location_object_rules,
mobility_archetypes, occupation_*, place_*, places, price_bands, record_sources,
region_*, regions, religious_context, role_occupation_rules, route_templates,
rumor_templates, scene_anchors, seasonal_rules, skill_catalog, social_*,
source_records, universal_archetype_proposals, water_body_templates, weather_profiles

party tables (mutable party state):
party_current_position, party_events, party_graph_edges, party_graph_nodes,
party_inventory_entries, party_items, party_journal_entries, party_llm_steps,
party_locations, party_map_knowledge, party_minilocations, party_npcs,
party_places, party_player_characters, party_route_journal, party_scene_anchors,
party_state, party_turns, party_validation_issues

RESTORE (Docker Compose postgres service)
-----------------------------------------
1. Ensure postgres is up: docker compose up -d postgres
2. Copy dumps into container:
   docker cp world_base.dump world-base-postgres-1:/tmp/world_base.dump
   docker cp party.dump world-base-postgres-1:/tmp/party.dump
3. Restore (drops/replaces objects in each schema; test on a copy first):
   docker exec world-base-postgres-1 pg_restore -U world_admin -d world_db --no-owner --no-acl --clean --if-exists /tmp/world_base.dump
   docker exec world-base-postgres-1 pg_restore -U world_admin -d world_db --no-owner --no-acl --clean --if-exists /tmp/party.dump

RESTORE (local pg_restore, port from POSTGRES_PORT / default 5432)
------------------------------------------------------------------
set PGPASSWORD=<your POSTGRES_PASSWORD from .env>
pg_restore -h 127.0.0.1 -p 5432 -U world_admin -d world_db --no-owner --no-acl --clean --if-exists world_base.dump
pg_restore -h 127.0.0.1 -p 5432 -U world_admin -d world_db --no-owner --no-acl --clean --if-exists party.dump

DUMP COMMANDS USED (for reproducibility)
----------------------------------------
docker exec world-base-postgres-1 pg_dump -U world_admin -d world_db -n world_base --no-owner --no-acl -Fc -f /tmp/world_base.dump
docker exec world-base-postgres-1 pg_dump -U world_admin -d world_db -n party --no-owner --no-acl -Fc -f /tmp/party.dump
