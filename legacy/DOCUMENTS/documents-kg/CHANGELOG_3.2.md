# documents-kg patch 3.2

Applied requested KG corrections on 2026-06-25.

## Changes

- Added missing region semantic links: **301**.
- Expanded `expanded_region_grid_bundle` to include all **379** region nodes and clarified that it is a reference grid, not adjacency/topology.
- Reclassified `formula_detail_2591_world_regions_txt` and section 15 as `reference_note` / `not_a_formula`.
- Retagged formula-notice index edges: **4**.
- Added formula Markdown hierarchy links: **169**.
- Replaced inferred `semantic_supports` shortcuts with specific source-backed subsystem links: **51**.
- Added additional conservative source-backed subsystem membership links for remaining isolated profile nodes: **18**.
- Weakened/annotated multi-source hyperedges: **5**.

## Validation after patch

- Nodes: **1295**
- Edges: **3602**
- Missing endpoints: **0**
- Region instantiation links: **379/379**
- Non-document semantic isolated nodes excluding index/catalog and `semantic_supports`: **0**
- Non-document semantic degree <= 1 excluding index/catalog and `semantic_supports`: **525**
