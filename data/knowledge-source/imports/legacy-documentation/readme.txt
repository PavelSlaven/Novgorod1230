# RUS13 Documentation Knowledge Graph

This folder contains the source-faithful knowledge graph for the RUS13 documentation corpus.

## What changed in this rebuild

1. `npc_generation_profiles.txt` was split into explicit field-level schemas for Background NPC, Scene NPC, and Key NPC profiles.
2. Documented JSON structures in LLM prompt templates were split into `schema_field` nodes, including nested JSON fields where the source explicitly names them. Placeholder JSON blocks without actual keys were skipped.
3. Formula nodes from `formulas.md` were linked to subsystems only where the formula section heading explicitly names that subsystem: combat, equipment, inventory/items, NPC, movement/route, state, time, and world/turn processing.
4. Region links were strengthened only with explicit source structures: active-region required fields, neighbor-region outline fields, current-region reference, and regional-transition checks. No adjacency/topology was invented.
5. Generic source-backed descriptions on key nodes were replaced with concise snippets from the cited source lines.
6. Index/catalog edges are now marked with `is_index_edge=true`, `edge_role=index`, and `semantic_weight=0.1`, so they do not have to be counted as full semantic connectivity.
7. The report now distinguishes raw graph degree from semantic degree with index/catalog edges excluded.
8. All nodes and edges retain `source_location` with file, section, and line range.

## Metrics

| Metric | Value |
|---|---:|
| Source files | 19 |
| Nodes | 1295 |
| Edges | 3602 |
| Hyperedges | 11 |
| EXTRACTED edges | 3592 |
| INFERRED_SECONDARY edges | 10 |
| Index/catalog edges | 1448 |
| Isolated nodes, raw graph | 0 |
| Non-document degree-1 nodes, raw graph | 0 |
| Non-document semantic degree ≤ 1, excluding index/catalog and semantic_supports | 525 |
| Non-document semantic isolated, excluding index/catalog and semantic_supports | 0 |
| Communities | 16 |

## Outputs

| File | Purpose |
|---|---|
| `graphify-out/graph.json` | Primary machine-readable graph for agents. |
| `graphify-out/graph.html` | Local browser overview of the expanded graph. |
| `graphify-out/GRAPH_REPORT.md` | Human-readable audit report for this rebuild. |
| `corpus/DOCUMENTS/` | English-filename corpus copy used by the graph. |

## Edge semantics

- Use `EXTRACTED` edges with their `source_location` for documentation-backed reasoning.
- Use `INFERRED_SECONDARY` edges as navigation hints only.
- Do not treat edges marked `is_index_edge=true` as full semantic support; they are catalog/source traversal links such as `indexes_*` and `contains_*`.

## Agent workflow

1. Start from `graphify-out/graph.json` for cross-system navigation.
2. Locate the relevant concept, schema field, formula, workflow step, or region node.
3. Follow non-index `EXTRACTED` edges for rule-level reasoning.
4. Use `INFERRED_SECONDARY` and index edges only to discover adjacent topics or source locations.
5. Open the cited source file and line range before changing code, prompts, or rule-sensitive content.
6. If the graph has no matching node, fall back to full-text search in `corpus/DOCUMENTS/`.

Patch 3.2 notes (2026-06-25):
- all 379 RUS13 region nodes now have equal may_instantiate_as links from world_region_entity;
- formulas.md section 15 / world_regions.txt is typed as reference_note, not formula;
- multi-source hyperedges carry member_source_files and verification_bundle metadata;
- formula/reference children are linked to their Markdown sections with source-backed semantic hierarchy edges;
- node_type_policy explicitly separates formula, constraint, state, schema, and reference_note.

