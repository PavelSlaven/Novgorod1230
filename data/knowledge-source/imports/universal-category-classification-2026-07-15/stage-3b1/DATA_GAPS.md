# Stage 3B-1 — data gaps

- `CANONICAL_LEGACY_ROWS_UNAVAILABLE`: tracked canonical bundle не содержит legacy item/container rows; migration inventory пуст и external/local export отложен.
- `QUANTITY_PROFILE_REVIEW_REQUIRED`: 12 bulk templates имеют технические draft profiles с явной единицей `g` и `explicit_only` policy; историческая мера, диапазон и promotion review не выполнены.
- `SOURCE_RECORD_REQUIRED`: 105 из 120 templates не имеют individual historical source binding. Для 15 agriculture/fishing item templates созданы FK-normalized `item_template_source_bindings` на существующие source IDs base bundle, но все они `draft/needs_review` и не закрывают promotion gate.
- `MATERIAL_EVIDENCE_REQUIRED`: required, optional и component materials не прошли individual historical review.
- `PHYSICAL_PARAMETER_REVIEW_REQUIRED`: все игровые physical estimates требуют review перед promotion.
- `CONTAINER_COMPATIBILITY_TOO_COARSE`: неспециализированные контейнеры не получают implicit allowed liquid/hot/sharp/bulky content.
- `HISTORICAL_PRESENCE_EVIDENCE_REQUIRED` и `NARROW_TYPOLOGY_EVIDENCE_REQUIRED`: source family и `draft/needs_review` binding не заменяют проверенную individual bibliography.
- `COMMONNESS_NOT_ESTABLISHED`: weight в regional/profile rows нейтрален и не является частотностью.
