# npc_runtime_profiles — not produced in this pass (gap)

**Статус.** Домен не заполнен. Ниже — что проверено и почему остановлено, чтобы следующий проход не повторял разведку.

## Что проверено

- `pr98:m2c-npc/candidate.json` и `runtime-bindings.json` (9 профилей/8 занятий, 32 композиции, 5 regional-context) — указаны в брифе как read-only источник в PR#98 worktree (`C:/Users/Slaven/Documents/Novgorod-runtime`), но этот коллектор не читал их напрямую в этом проходе (бюджет), и они НЕ входят в `sources_copied` этой группы — значит для домена нужно либо (а) координатору скопировать актуальный снимок в `sources/`, либо (б) следующему коллектору читать их напрямую из PR#98 worktree (read-only, только чтение, без правок его 2 dirty test-файлов).
- `rus13tpl npc_archetypes` (`place_population_profiles` 25, `occupation_presence_rules` 3) — не найден в скопированных `sources/*`; тот же статус, что и `occupation_item_profiles` 68 в carried_inventories.

## Почему не закрыт в этом проходе

Домен требует: (1) прочитать реальный снимок 9 существующих профилей/8 занятий из PR#98, чтобы не задвоить и соблюсти формат `spatial_v3_npc_runtime_profiles`; (2) для каждого из 18 новых occupation-строк (`occupations_additions.csv`, этот же коллектор) и части из 37 уже approved занятий написать `profile_kind` (npc_binding, body, activity, routine, clothing, item_inventory, item_visual, observable_activity) с русскими текстами по 4 сезонам × времени дня — это большой объём содержательного авторства (оценочно 8 занятий × 4 сезона × несколько дневных отрезков уже дают ~9 существующих профилей; расширение на 55 занятий кратно больше), который не укладывается в отведённый бюджет этой сессии.

## Рекомендация для следующего прохода

1. Скриптом сравнить список occupation_id из pinned TSV (37 approved) + `occupations_additions.csv` (18 новых, этот коллектор) с 8 occupation, у которых уже есть профиль в PR#98 `candidate.json` — получить точный список из 55 занятий без профиля.
2. Начать с занятий, покрывающих 32 существующих G4 (весовой приоритет — какие занятия физически материализуются в стартовой территории v17, преимущественно речной/пристанской, см. `critic_problems` брифа).
3. Писать `observable_activity` текстами, ссылаясь на `typical_*` и `daily_schedule_*` полей уже существующих occupation-строк (включая `occupations_additions.csv`), а не выдумывая заново.
