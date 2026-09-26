# occupations-activities — кандидатные данные C001

Четыре артефакта: 19 занятий, 20 наблюдаемых действий, 28 основ
NPC-профилей (9 исходных M2c и 19 новых), 19 компетенций с 12
родительскими навыками. Все имеют статус `candidate`; генераторы не меняют
active runtime, pinned TSV, STATUS и вердикты.

Запускать из корня репозитория:

```text
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/occupations/scripts/build_occupations_additions.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/activities_observable/scripts/build_activities_for_new_occupations.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/npc_runtime_profiles/build.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/skills_competences/build.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/occupations/scripts/check_occupations_additions.py
python data/world-catalogs/novgorod/game-base-v1/occupations-activities/validate.py
```

NPC-генератор читает candidate.json и runtime-bindings.json из
C:/Users/Slaven/Documents/Novgorod-runtime/data/world-catalogs/novgorod/m2c-npc/
только для чтения. Эти входы требуются для повторной сборки; готовый JSON
зафиксирован в этой группе. `no_source` обозначает отсутствие основания для
конкретного поля, не исторический факт. Факты NPC и владение вещами определяет
код; LLM описывает только выбранное состояние.
