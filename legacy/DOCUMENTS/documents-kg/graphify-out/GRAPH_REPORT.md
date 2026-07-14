# RUS13 Documentation Knowledge Graph — GRAPH REPORT

Version: `3.2-source-faithful-region-formula-typed`  
Generated/updated: 2026-06-25

## Summary

- Nodes: **1295**
- Edges: **3602**
- Hyperedges: **11**
- Source files: **19**
- EXTRACTED edges: **3592**
- INFERRED_SECONDARY edges: **10**

## Patch 3.2 changes

1. **Regional links aligned:** all **379** `region` nodes now have `world_region_entity --may_instantiate_as--> region` semantic links. Missing links added in this patch: **301**.
2. **`world_regions.txt` in formulas.md fixed:** `formula_detail_2591_world_regions_txt` is now `node_type=reference_note`, `formula_kind=not_a_formula`; its index edges are `indexes_reference_note` / `contains_reference_note`.
3. **Multi-source hyperedges clarified:** multi-source formula/schema bundles are marked as `multi_source_bundle=true`, `edge_role=verification_bundle`, with `member_source_files`. They are no longer strong single-source semantic proof.
4. **Isolated formula/reference nodes reduced through real structure:** source-backed `part_of_formula_section`, `part_of_reference_note_section`, and application-order links use the Markdown hierarchy and section text instead of artificial `semantic_supports` shortcuts.
5. **Artificial `semantic_supports` reduced:** inferred shortcuts were replaced with explicit source-backed subsystem membership relations where the source document directly provides the subsystem context; remaining old-style hints were weakened.
6. **Type policy added:** `formula`, `constraint`, `state`, `schema`, and `reference_note` now have explicit `node_type_policy` metadata.

## Validation

- Missing link endpoints: **0**
- Region instantiation links: **379/379**
- `world_regions.txt` formula notice type: **reference_note**
- Non-document semantic isolated nodes, excluding index/catalog and `semantic_supports`: **0**
- Non-document semantic degree ≤ 1, excluding index/catalog and `semantic_supports`: **525**

## Node types

- `agent`: 19
- `attribute`: 6
- `checklist`: 4
- `consequence`: 1
- `constraint`: 10
- `diagnostic`: 1
- `document`: 19
- `event`: 3
- `formula`: 195
- `formula_group`: 15
- `information_layer`: 4
- `interface`: 9
- `map`: 1
- `modifier`: 8
- `output`: 1
- `prompt_section`: 68
- `reference_list`: 1
- `reference_note`: 3
- `region`: 379
- `risk`: 1
- `route`: 3
- `rule`: 67
- `scale`: 1
- `schema`: 100
- `schema_field`: 277
- `state`: 9
- `state_update`: 5
- `taxonomy`: 1
- `template`: 2
- `ui_layer`: 4
- `workflow`: 41
- `workflow_step`: 37

## Top relations

- `indexes_region`: 379
- `contains_region`: 379
- `may_instantiate_as`: 379
- `defines`: 345
- `indexes_schema_field`: 264
- `has_required_field`: 262
- `part_of_formula_section`: 168
- `indexes_formula`: 167
- `contains_formula`: 167
- `feeds`: 136
- `has_prompt_section`: 68
- `implements_prompt_schema_field`: 41
- `uses`: 41
- `applies_to_combat_subsystem`: 40
- `indexes_workflow_step`: 37
- `has_step`: 37
- `next_step`: 35
- `implements`: 32
- `has_nested_field`: 32
- `part_of_internal_prompt_rules`: 29
- `includes`: 28
- `applies_to_inventory_item_subsystem`: 28
- `applies_to_movement_route_subsystem`: 27
- `semantic_supports`: 22
- `applies_to_world_turn_subsystem`: 20
- `mirrors`: 19
- `step`: 19
- `feeds_combat_calculation`: 18
- `applies_to_time_and_world_update`: 18
- `lists_project_file`: 18
- `contains_short_formula`: 18
- `contains_formula_group`: 15
- `describes_region_aspect`: 12
- `supports`: 12
- `updates`: 10

## Notes

- Index/catalog edges remain marked with `is_index_edge=true`, `edge_role=index`, and low `semantic_weight` where applicable.
- Multi-source bundles should be used as navigation/verification bundles, not as single-citation proof for every member.
- `reference_note` nodes are explicit non-formula notes and should not be included in formula-only reasoning.
