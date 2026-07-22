# Read-only world base и графовая архитектура

**Статус:** target technical normative; production runtime остаётся v2 до P28.
**Источник физических деталей:** будущие v3 DDL и сгенерированный из них `infra/world-base/SCHEMA_REFERENCE.md`; этот документ не подменяет DDL.

## 1. Single-source matrix

| Вопрос | Единственный источник истины v3 |
|---|---|
| Canonical G0–G5, routes, templates/profiles | version-pinned `world_base` |
| Party-generated G5, G6, positions и dynamic state | committed `party_runtime` rows |
| Физическое движение | explicit directed route/site/scene relation |
| Visibility/acoustics | отдельные perception relations |
| Coordinates/layout | optional visual projection, не topology |
| Исторические/authoring зависимости | provenance + exact versioned refs |

`world_base` runtime-read-only. `party_runtime` не изменяет canonical authoring rows. Между databases запрещены bare IDs: каждая ссылочная запись несёт compatible revision/version/digest pin и проходит application validation.

## 2. Spatial and graph boundary

```text
world_base: G0 → G1 → G2 → G3 → G4 → canonical G5
party_runtime: finite generated G5 → G6 → scene_position_node
```

G5 — локальная canonical локация/комплекс в G4; finite generated G5 создаётся party-scoped только из approved expansion profile. G6 and position не являются G-level. Parent/containment, co-location и visual proximity не создают traversable edge. Каждая physical relation имеет explicit endpoints, kind, direction, ownership and version pins.

Route topology включает directional exits, route segments/points, side context and exact endpoint snapshots. Physical segment имеет одного factual owner. Layout-derived topology, implied diagonal crossing и fallback destination запрещены.

## 3. Read/write discipline

Resolvers/materializers read pinned authoring records and produce proposals. Один commit owner применяет approved normalized party write set atomically under declared lock order. Factual state, knowledge и visible projection раздельны; player-facing map and narrator consume approved projection only.

Save/load использует pinned records, immutable plans/executions and append-only history; mutable latest catalog не может переопределять active journey. Missing/ambiguous reference, endpoint, route contract или candidate set — typed hard block, не semantic fallback.

## 4. Coexistence and activation

До P28 v3 разрешён только для fixtures, migration and shadow composition. Storage coexistence допустимо, однако один request выбирает ровно один schema/runtime path; dual write, mixed authoritative reads и in-turn fallback запрещены. Финальный cutover выполняется атомарно после P27.

## 5. Migration history

V2 хранил canonical G0–G4 в `world_base` и materialized G5 в party. Это описание migration source, а не target semantics и не разрешение на смешение путей.
