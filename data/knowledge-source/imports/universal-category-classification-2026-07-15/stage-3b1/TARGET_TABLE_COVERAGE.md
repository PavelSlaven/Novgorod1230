# Stage 3B-1 — покрытие целевых таблиц

`yes` в строке означает, что слой существует и проверяется; это не означает готовность к promotion. Bundle намеренно содержит только `draft` records.

| table | DDL | JSON Schema | importer registry | FK order | cross-reference | readiness | positive/negative test | dataset | blocking gap |
|---|---|---|---|---|---|---|---|---|---|
| source_records | yes | yes | supplemental | yes | yes | promotion | yes | yes, 1 project policy | historical records retained in parent bundle |
| record_sources | yes | yes | supplemental | yes | yes | promotion | yes | yes, 15 background links | 105 templates need individual evidence |
| world_revisions | yes | yes | supplemental | yes | yes | promotion | yes | yes, 1 draft | approved parent is external dependency |
| universal_categories | yes | yes | supplemental | yes | yes | promotion | yes | yes, 146 draft | material/category review |
| universal_category_relations | yes | existing | not needed by this bundle | n/a | existing | promotion | existing | no | no relation asserted without evidence |
| universal_parameter_definitions | yes | existing | not needed by this bundle | n/a | existing | promotion | existing | no | parameter definitions not required by current draft fields |
| category_labels | yes | yes | supplemental | yes | yes | promotion | yes | yes, 146 | historical alternatives not asserted |
| region_category_options | yes | yes | supplemental | yes | yes | promotion | yes | yes, 146 draft | neutral technical weights only |
| item_templates | yes | yes | supplemental | yes | yes | promotion | yes | yes, 102 draft | 87 individual source links missing |
| item_template_category_bindings | yes | yes | supplemental | yes | yes | promotion | yes | yes, 306 | materials intentionally unresolved |
| item_template_inventory_profiles | yes | yes | supplemental | yes | yes | promotion | yes | yes, 102 draft | physical review |
| item_template_source_bindings | yes | yes | supplemental | yes | yes | promotion hard-block | yes | yes, 15 draft/needs_review | 87 item templates still need individual historical source records; the 15 bindings do not permit promotion |
| quantity_unit_definitions | yes | yes | supplemental | yes | yes | promotion | yes | yes, 1 draft mass unit | editorial unit review |
| item_template_quantity_profiles | yes | yes | supplemental | yes | yes | promotion | yes | yes, 12 draft bulk profiles | quantity profile review |
| container_templates | yes | yes | supplemental | yes | yes | promotion | yes | yes, 18 draft | individual source links missing |
| container_template_facet_bindings | yes | yes | supplemental | yes | yes | promotion | yes | yes, 18 | material/closure evidence unresolved |
| container_template_inventory_profiles | yes | yes | supplemental | yes | yes | promotion | yes | yes, 18 draft | physical review |
| container_template_source_bindings | yes | yes | supplemental | yes | yes | promotion hard-block | yes | yes, 0 | all 18 containers need individual historical source records |
| container_content_profiles | yes | yes | supplemental | yes | yes | promotion | yes | yes, 18 | general compatibility deliberately coarse |
| container_content_profile_entries | yes | yes | supplemental | yes | yes | promotion | yes | yes, 4 specialized | no broad inferred permissions |
| container_content_category_relations | yes | existing | not needed by this bundle | n/a | existing | promotion | existing | no | no category-wide compatibility asserted |
| item_profile_sets | yes | yes | supplemental | yes | yes | promotion | yes | yes, 16 draft | context/profile basis review |
| item_profile_entries | yes | yes | supplemental | yes | yes | promotion | yes | yes, 16 draft | required candidate sets intentionally absent |
| property_profiles | yes | yes | supplemental | yes | yes | promotion | yes | yes, 10 draft | editorial/legal review |
| property_profile_rules | yes | yes | supplemental | yes | yes | promotion | yes | yes, 10 draft | no instance owner/holder created |
| region_equipment_profiles | yes | yes | supplemental | yes | yes | promotion | yes | yes, 1 draft | only verified role ID used |
| region_equipment_profile_entries | yes | yes | supplemental | yes | yes | promotion | yes | yes, 1 draft | equipment profile review |
| item_classification_migration_inventory | yes | yes | supplemental | yes | yes | promotion | yes | empty by design | canonical legacy export unavailable |

The public supplemental validator rejects unknown tables, unknown manifest provenance source IDs, dangling typed template-source bindings, party tables, digest mismatches and invalid dependency ordering. `record_sources` remains an audit ledger; `*_template_source_bindings` are FK-normalized, claim-scoped promotion gates. This is an authoring boundary, not a runtime loader.
