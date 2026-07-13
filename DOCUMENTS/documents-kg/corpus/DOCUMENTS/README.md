# XIII Century World Sim — Documentation

This folder contains the design documentation for a text-first historical RPG simulation set in the 13th century. The project is built around a persistent world model, free-text player input, and LLM-assisted narration. The code stores and validates state; the LLM generates meaning, checks plausibility, and writes player-facing prose only from allowed context.

## Current purpose

This is not a finished game. It is a foundation for a historical text RPG where the player acts through natural language and the system maintains a consistent world: time, place, NPCs, items, risks, hidden processes, visible information, and consequences.

The project documents define how the LLM should generate, interpret, and update the game world without inventing unsupported mechanics. When documents conflict, use `llm_documentation_navigation.md` and the source-priority rules there.

## Main project files

| File | Purpose |
|---|---|
| `llm_documentation_navigation.md` | LLM navigation, source priority, reading order, cross-document bundles. |
| `world_generation_and_turns.txt` | World materialization, start pipeline, turn processing, visible/hidden facts. |
| `player_character_generation.txt` | Player character creation pipeline and output contract. |
| `character_parameters.txt` | Attributes, skills, body states, active conditions, checks, modifiers. |
| `npc_generation_profiles.txt` | Background, scene, and key NPC profiles and transitions. |
| `combat_system.md` | Combat processing, checks, harm, defense, NPC reactions, consequences. |
| `weapons_and_armor.txt` | Weapons, armor, shields, helmets, equipment constraints, social risk. |
| `items_and_property.txt` | Item materialization, item schema, ownership, value, visibility, property. |
| `character_inventory_equipment.txt` | Character inventory, encumbrance, access, equipment in checks. |
| `npc_inventory_item_marks.txt` | NPC inventory, item marks, recognition, hidden items, theft consequences. |
| `movement_locations_regions.txt` | Position hierarchy, routes, maps, path risk, long-distance movement. |
| `time_system.txt` | Time levels, turn duration, time-driven updates, timers. |
| `historical_events_and_figures.txt` | Historical layer, event phases, figures, visibility, no future knowledge. |
| `world_regions.txt` | Allowed RUS13 regional grid. |
| `interface_ux.md` | UI layers, player input, journal, map, diagnostics, hidden-information rules. |
| `information_sources_llm_prompts.md` | Knowledge-base workflow, information sources, prompt boundaries, agent types. |
| `llm_agent_prompt_templates.md` | Prompt templates for the LLM agent pipeline. |
| `party_character_knowledge_layer.md` | Canonical Stage 18 knowledge output, normalized party runtime tables, immutable snapshots, projection and commit invariants. |
| `formulas.md` | Central formula reference; does not override the profile documents. |

## Knowledge graph

The rebuilt knowledge graph lives in `documents-kg/graphify-out/`.

- `graph.json` is the machine-readable graph for agents.
- `graph.html` is a local browser view.
- `GRAPH_REPORT.md` is the audit summary.
- `documents-kg/corpus/DOCUMENTS/` contains a renamed English-file corpus copy used by the graph.

The graph was rebuilt as a detailed documentation map. It now includes formulas, schemas, body states, item schemas, NPC schemas, routes, combat structure, source priority, character generation, item marks, and LLM agents. Nodes and edges include `source_location` with file, section, and line range.

## Recommended reading order for LLM work

1. `README.md`
2. `llm_documentation_navigation.md`
3. `world_generation_and_turns.txt`
4. The profile document for the subsystem being changed.
5. `formulas.md` only as a cross-reference.
6. `documents-kg/graphify-out/graph.json` for cross-system navigation.

## Rules for future changes

1. Do not add a mechanic in code unless it is described in the documentation or added to a profile document first.
2. Do not let UI, diagnostics, or prose reveal hidden world state, hidden NPC motives, future events, raw prompts, or internal reasoning.
3. Keep filename references in English snake_case.
4. When a document changes, update the graph node/edge source locations and the graph report.
5. Treat `EXTRACTED` graph edges as source-backed. Treat `INFERRED_SECONDARY` edges as navigation hints that still require document verification.
