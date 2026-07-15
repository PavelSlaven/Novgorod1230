# Карта владения доменными данными

| Пакет | Владеет | Не владеет |
|---|---|---|
| `@rus/actors` | identity, biography fields, social/skill bindings, actor state shape и actor invariants | тело, предметы, маршруты, время, persistence |
| `@rus/body-state` | здоровье, сытость, бодрость, активные состояния, части тела, применение утверждённых изменений | выбор причины изменения, бой, лечение как смысловое решение |
| `@rus/items-property` | item identity/profile binding, containers, ownership, normalized inventory topology, mass/load/hands/access, stack signature и pure transfer plan | материализация предмета, цены мира, persistence, исторические template facts |
| `@rus/space-map` | G0–G5 types, position chain, graph node/edge shape, current position, scene anchors, structural graph validation | выбор маршрута, время пути, знания персонажа |
| `@rus/movement-routes` | route availability, route knowledge envelope, GU/time cost, access requirements, traversal contracts | создание дорог, смысловой выбор курса, RNG implementation |
| `@rus/travel` | сохранённый journey/journey leg, node/edge-progress position, actual/perceived navigation state, lifecycle и version-bound change proposal | хранение графа, выбор route/course candidates, формулы времени/тела/груза, RNG, persistence, UI и narration |
| `@rus/environment-landmarks` | deterministic party landmarks, cues, traces, lifecycle and objective observation candidates | G0–G4 graph changes, source invention, perception/knowledge decisions, persistence |
| `@rus/time-events-history` | clock, duration, timers, delayed event records, historical phases, time-update requests | создание исторических событий и их смысловых последствий |
| `@rus/checks-rng` | dice requests, `RandomSource`, characteristic bonus, check formula и result envelope | решение о необходимости проверки, narrative consequence |
| `@rus/combat-health` | combat state contracts, attack/defense requests, quality bands, harm packages, wound application | решение NPC атаковать, выбор цели/оружия, narration |
| `@rus/social-law` | role/occupation references, supplied rights/restrictions, authority, legal/social risk packages | создание права региона, вынесение смыслового приговора |
| `@rus/visibility-knowledge-memory` | visible projection, hidden boundary, knowledge map, memory facts, leak detection, safe narrator package | prose generation, hidden-state mutation, DB reads |

## Канонические владельцы формул

- `attributeBonus` и итог проверки — `@rus/checks-rng`;
- изменение шкал тела — `@rus/body-state`;
- GU и итоговое время пути — `@rus/movement-routes`;
- качество попадания и расчёт вреда — `@rus/combat-health`;
- нагрузка и вес инвентаря — `@rus/items-property`;
- продвижение часов и выбор уже утверждённых due timers — `@rus/time-events-history`.

`@rus/travel` получает готовые route/course candidates, duration, check и consequence requests от оркестратора. Он не выбирает кандидаты из мира и не продвигает часы: его результат — только валидация перехода и change proposal, который ещё не является записью.

## Общая граница

Domain package может валидировать, нормализовать и рассчитывать только по явно переданным данным. Отсутствующий факт не выводится процедурно. Новая сущность партии, причина, связь или последствие появляется только из approved данных и формального code/workflow result; LLM не расширяет candidate set и не создаёт state.
