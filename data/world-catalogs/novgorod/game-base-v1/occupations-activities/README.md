# occupations-activities — кандидатные данные C001

Четыре артефакта: 33 занятия, 20 наблюдаемых действий, 42 основы
NPC-профиля (9 исходных M2c и 33 новых), 33 компетенции с 12
родительскими навыками. Все имеют статус `candidate`; генераторы не меняют
active runtime, pinned TSV, STATUS и вердикты.

14 архивных кандидатов и 43 активных варианта заданы в
`occupations/archive-professions.authoring.json`; builder разрешает их по
закреплённой копии master archive. Ещё 15 pinned-target mappings лежат в
`deferred_variants` как типизированный authoring backlog, так как эти цели
нельзя безопасно сериализовать в текущий runtime; PRO0104 и PRO0071 связаны с
`profile:m2c_npc_forest_worker_v1`. Семантические ID владельцев заданы явной
таблицей `semantic_ids`; PRO0210 — отдельный `occ_household_stove_maker` с
`context_only_not_mass_default`.

Общие archive templates не считаются индивидуальными свойствами занятия:
seasonal schedules, NPC routine, workflow materialization и
`common_relationships` сериализуются как typed `no_source`. Archive owners
получают `region_novgorod_land`; archetypes заданы reviewer mappings, а музыкальные
занятия используют закрытый `performance_entertainment`. Variant context-only
policy хранится в provenance token; owner-level policy берётся из отдельного
списка authoring. Связь трёх музыкальных owners с
`nov_role_skomorokh` хранится как `related_role` и не объединяет их ID.
Кандидатные данные не дают runtime approval. Дополнительные runtime roles,
places и skills без основания остаются `no_source`.
Архивные кандидаты не получают одиночный
activity cue автоматически: новые действия добавляются только как отдельные
обоснованные контекстные цепочки.

Запускать из корня репозитория:

```text
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/occupations/scripts/build_occupations_additions.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/activities_observable/scripts/build_activities_for_new_occupations.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/npc_runtime_profiles/build.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/skills_competences/build.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/occupations/scripts/check_occupations_additions.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/validate.py
```

NPC-генератор читает закреплённый срез PR98 из
`npc_runtime_profiles/pr98_extract.json`; он входит в этот checkout вместе с
готовым JSON. `no_source` обозначает отсутствие основания для
конкретного поля, не исторический факт. Факты NPC и владение вещами определяет
код; LLM описывает только выбранное состояние.

## Правки C002

`npc_runtime_profiles` содержит кандидатные взвешенные наборы вариантов
внешности, одежды и снаряжения для каждой пары роль/занятие × региональный
контекст. Источники и пробелы указаны у вариантов; равные веса означают
игровой выбор, не историческую частоту. Сборка не выбирает факты актёра и
не активирует профили. Подробности — в `npc_runtime_profiles/README.md`.
