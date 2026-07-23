# Карта владения доменными данными

| Пакет | Владеет | Не владеет |
|---|---|---|
| `@rus/actors` | identity, biography fields, social/skill bindings, actor state shape и actor invariants | тело, предметы, маршруты, время, persistence |
| `@rus/body-state` | здоровье, сытость, бодрость, активные состояния, части тела, применение утверждённых изменений | выбор причины изменения, бой, лечение как смысловое решение |
| `@rus/items-property` | item identity/profile binding, containers, ownership, normalized inventory topology, mass/load/hands/access, stack signature и pure transfer plan | материализация предмета, цены мира, persistence, исторические template facts |
| `@rus/space-map` | G0–G5 types, position chain, graph node/edge shape, current position, scene anchors, structural graph validation | выбор маршрута, время пути, знания персонажа |
| `@rus/movement-routes` | route availability, route knowledge envelope, GU/time cost, access requirements, traversal contracts | создание дорог, смысловой выбор курса, RNG implementation |
| `@rus/time-events-history` | clock, duration, timers, delayed event records, historical phases, time-update requests | создание исторических событий и их смысловых последствий |
| `@rus/checks-rng` | dice requests, `RandomSource`, characteristic bonus, check formula и result envelope | решение о необходимости проверки, narrative consequence |
| `@rus/combat-health` | combat state contracts, attack/defense requests, quality bands, harm packages, wound application | решение NPC атаковать, выбор цели/оружия, narration |
| `@rus/social-law` | role/occupation references, supplied rights/restrictions, authority, legal/social risk packages | создание права региона, вынесение смыслового приговора |
| `@rus/visibility-knowledge-memory` | visible projection, hidden boundary, knowledge map, memory facts, leak detection, safe narrator package | prose generation, hidden-state mutation, DB reads |
| `@rus/runtime-catalog` | read-only active/historical domain pin loading, exact import reconstruction, world-pin compatibility и applicable item/container projection | authoring, import/activation writes, party persistence, materialization |

## Spatial v3 target ownership (P08)

These records are target-only until P28. They do not reroute production v2, permit dual write, mixed reads or compatibility fallback.

| Owner | Sole target responsibility | Explicit boundary |
|---|---|---|
| `@rus/space-map` | typed spatial refs, containment, route topology, contexts and endpoint contracts | no route selection, persistence or player knowledge |
| `@rus/movement-routes` | path queries, immutable plans, method/time resolution, progress and navigation outcomes | no topology authoring or commit |
| `@rus/materialization` | deterministic stable-topology materialization and traces | no database access or commit |
| `@rus/time-events-history` | exact clock, timers and historical update requests | no topology or route ownership |
| `@rus/party-store` | party-scoped repository and combined write-plan commit boundary | no logical plan construction |
| `@rus/turn` | command order, locks, idempotency and combined write-plan construction | no repository implementation |
| `@rus/contracts` | shared discriminated DTOs, controlled vocabularies and typed errors | no domain execution or adapters |
| presentation/knowledge | player-safe projection only | never factual topology creation |
| `@rus/game-server` | production composition after the P28 gate | no duplicate spatial/movement/materialization logic |

The target public ports are deliberately typed-failure stubs until their individual implementation phases. A caller must surface the error or stop; it must not try v2, choose a substitute record or write a partial result.

## Канонические владельцы формул

- `attributeBonus` и итог проверки — `@rus/checks-rng`;
- изменение шкал тела — `@rus/body-state`;
- GU и итоговое время пути — `@rus/movement-routes`;
- качество попадания и расчёт вреда — `@rus/combat-health`;
- нагрузка и вес инвентаря — `@rus/items-property`;
- продвижение часов и выбор уже утверждённых due timers — `@rus/time-events-history`.

## Общая граница

Domain package может валидировать, нормализовать и рассчитывать только по явно переданным данным. Отсутствующий факт не выводится процедурно. Новая сущность мира, причина, связь или последствие появляется только как утверждённый результат LLM/workflow.
