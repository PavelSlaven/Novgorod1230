# world_base FK audit v1

Mode: `staged`

## Summary

- Tables audited: 19
- Rows audited: 42393
- Errors: 0
- Warnings: 0

## Table counts

| Table | Rows |
|---|---:|
| `graph_edge_modifiers` | 49 |
| `graph_edges` | 30248 |
| `graph_nodes` | 11359 |
| `graph_scale_rules` | 6 |
| `historical_anchors` | 28 |
| `land_use_templates` | 45 |
| `landscape_templates` | 70 |
| `place_templates` | 64 |
| `region_land_use_templates` | 31 |
| `region_landscape_templates` | 34 |
| `region_neighbors` | 6 |
| `region_occupations` | 68 |
| `region_place_templates` | 39 |
| `region_social_roles` | 71 |
| `region_water_body_templates` | 24 |
| `regions` | 7 |
| `route_templates` | 21 |
| `source_records` | 182 |
| `water_body_templates` | 41 |

## Rule summary

No FK, JSON reference, source reference, or conditional edge-rule violations were found.

## Audit scope

- Direct FK rules: 25
- JSON reference rules: 5
- Source references: checked for all non-source tables with `sources` arrays.
- Conditional graph edge rules: checked for route, water, and offroad edge requirements.
- G1 `region_cell` required fields: checked.
