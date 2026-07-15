# Stage 3B-1 — покрытие целевых таблиц

| table | DDL | JSON Schema | importer registry | FK order | cross-reference | readiness | positive/negative test | dataset | gap |
|---|---|---|---|---|---|---|---|---|---|
| source_records, world_revisions | yes | yes | supplemental | yes | yes | promotion | yes | yes | approved parent external |
| universal_categories, category_labels, region_category_options | yes | partial | supplemental | yes | yes | promotion | yes | yes | draft only |
| item_templates, item_template_category_bindings, item_template_inventory_profiles | yes | yes | supplemental | yes | yes | promotion | yes | yes | material and quantity review |
| container_templates, facet/inventory/content tables | yes | partial | supplemental | yes | yes | promotion | yes | yes | compatibility review |
| item_profile_sets, item_profile_entries | yes | yes | supplemental | yes | yes | promotion | yes | yes | profile basis review |
| property_profiles, property_profile_rules | yes | yes | supplemental | yes | yes | promotion | yes | yes | category review |
| region_equipment_profiles, entries | yes | yes | supplemental | yes | yes | promotion | yes | yes | only verified role refs |
| item_classification_migration_inventory | yes | yes | supplemental | yes | yes | promotion | yes | empty | legacy export unavailable |

`partial` не означает import-ready: до promotion требуются PostgreSQL import path, reviewed provenance и readiness. Supplemental validator намеренно разрешает только draft authoring и не является runtime loader.
