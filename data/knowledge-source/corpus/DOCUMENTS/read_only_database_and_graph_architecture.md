# Read-only world base и графовая архитектура

Статус: migration-source спецификация materialization v2
Дата ревизии: 2026-07-14

## Production/target routing

The completed `versioned production activation cutover` made `spatial_v3_target_read_only_database_and_graph_architecture.md` together with `spatial_architecture_standard_g0_g6.md` the sole production database/graph owner. This v2 document is retained only for explicit migration/rollback interpretation.

The approved P12 authoring projection is rooted at `data/world-catalogs/novgorod/spatial-v3/manifest.json`: it has 37 SHA-256-pinned datasets and `data_gaps: []`. Release `spatial-v3-production-v1`, not historical P28 evidence alone, activates its production use.

Физические таблицы и колонки определяются [`infra/world-base/schema.sql`](../../../../infra/world-base/schema.sql) и автоматически созданным [`infra/world-base/SCHEMA_REFERENCE.md`](../../../../infra/world-base/SCHEMA_REFERENCE.md). Назначение, наполнение и readiness таблиц задаёт `world_base_materialization_table_requirements.md`.

## 0. Главное правило

```text
world_base = read-only канонические G0–G4 + categories/templates/profiles/rules;
party database = конкретные G5 и изменяемые instances партии.
```

Код не придумывает категорию, исторический факт или отсутствующий вариант. Он вправе материализовать конкретный instance из активного конечного candidate set и обязан сохранить seed, source refs, catalog digest и trace. LLM не создаёт runtime G5/NPC/items и не пишет состояние.

## 1. Два слоя хранения

### 1.1. `world_base`

Read-only runtime слой содержит:

- регионы и канонический граф G0–G4;
- исторические anchors/events/figures и provenance;
- universal categories и специализированные справочники;
- региональные разрешения, templates и component profiles;
- G4→G5 layout/materialization profiles;
- NPC/item/container/property rules;
- bounded decision commands и policies;
- gaps, validation и audit metadata.

Он не содержит текущую позицию NPC, открытые игроком маршруты, конкретный party G5, инвентарь экземпляра, скрытое состояние или последствия действий.

### 1.2. `party_runtime`

Изменяемый слой хранит:

- version pins партии;
- персонажа, часы, позицию и knowledge map;
- материализованные G5 nodes/edges/anchors;
- NPC, traits, relations, knowledge и schedules;
- items, containers, inventory и ownership;
- decisions, change sets, autonomous updates и events;
- materialization runs/choices и validation traces;
- public-screen read models и delivery state.

Party database может обслуживать несколько партий, но каждая доменная запись изолирована `party_id`; внутренние ссылки защищены FK. Ссылки в отдельную `world_base` проверяются по ID, revision и digest на commit gate.

## 2. Графовые уровни

```text
G0 → G1 → G2 → G3 → G4 | world_base
                         ↓
                        G5 | party_runtime
```

### G0 — регион

Крупная историко-географическая рамка и связи регионов. Размер региона не является единицей пути.

### G1 — дневная ячейка

Базовая территориальная сетка региона. Для принятой карты одна ячейка имеет размер 32×32 км и базовое пересечение около восьми GU, но фактическое движение определяется рёбрами и средой.

### G2 — подграф ячейки

Зоны, коридоры, русла, лесные массивы, хозяйственные участки и маршруты внутри G1.

### G3 — конкретное место

Устойчивое место или часть крупного места: поселение, монастырь, пристань, дорога, промысловый участок, городской конец.

### G4 — игровая локация

Минимальный заранее устойчивый пространственный уровень канонической карты: двор, берег, мастерская, улица, зал, подход, зона высадки.

### G5 — сценический граф

Конкретные minilocations, anchors и passages сцены. G5 создаётся кодом при старте или первом входе в G4 и затем читается из party state. Повторный вход не запускает выбор заново.

## 3. GU и движение

GU — универсальная мера стоимости пути по ребру, а не размер региона.

```text
1 GU = локальный участок или примерно час нормального пути;
8 GU = базовое пересечение G1;
G3–G5 используют главным образом минуты и локальные действия.
```

Фактическое время учитывает route template, landscape/water layers, сезон, транспорт, доступ, состояние персонажа и сохранённое состояние ребра.

## 4. Слоистая карта

Природная среда, вода, инфраструктура, места и хозяйственное использование являются разными слоями:

```text
landscape_templates + region_landscape_templates
water_body_templates + region_water_body_templates
route_templates + graph_edges
place_templates + region_place_templates
land_use_templates + region_land_use_templates
```

`mixed`, `water`, `road`, `settlement`, `urban` и `field` не подменяют базовый landscape. Комбинации задаются ссылками на отдельные layers.

## 5. Канонический граф G0–G4

`graph_nodes` и `graph_edges` являются источником канонических world instances только для G0–G4. Для них обязательны:

- стабильные IDs и parent chain;
- scale/type compatibility;
- valid region/template refs;
- reverse-edge consistency там, где связь двусторонняя;
- period/status/source metadata;
- отсутствие конкретных party-only значений.

`graph_scale_rules` может описывать G5 как масштаб и правила шаблонов, но это не разрешает записывать party G5 в `graph_nodes`.

## 6. G4 materialization bundle

Runtime получает не произвольный набор строк, а versioned bundle:

```text
world revision и historical frame
G1→G4 chain
G4 materialization binding/profile
layout templates и slots
G5 minilocation/anchor/edge templates
NPC rules и profile sets
item/container/property rules
season/time/weather/access state
catalog digest и readiness report
```

Bundle считается готовым только при разрешённых FK/cross-refs, отсутствии hard gaps и однозначном active binding. Иначе materialization блокируется до редакторского исправления.

## 7. Party G5 и экземпляры

Materializer сначала проверяет committed baseline для `(party_id, g4_id)`. При наличии он возвращается без изменения.

Новый run:

1. фиксирует version pins и seed context;
2. создаёт required layout nodes;
3. выбирает optional nodes из отсортированного candidate set;
4. строит связные edges и anchors;
5. создаёт NPC/items/containers из совместимых slots;
6. проверяет capacity, access, visibility, ownership и causal basis;
7. формирует trace и proposed write set;
8. атомарно записывает всё на commit gate.

Уникальные ограничения и serializable commit защищают от параллельной двойной материализации.

## 8. Knowledge map и public boundary

Фактический party graph, знания персонажа и показанное игроку состояние различаются.

- Fact state содержит истинное текущее состояние партии.
- Character knowledge хранит exact/rough/rumor/inferred/false belief и source.
- Visible projection содержит только доступное через position, visibility, light, access и knowledge.
- Narrator получает только approved visible context и не добавляет факты.

## 9. Запрещённые смешения

Запрещено:

- хранить конкретный G5 в `world_base.graph_nodes/graph_edges`;
- хранить конкретного NPC или предмет партии в authoring profiles;
- считать universal category региональным подтверждением;
- хранить queryable relations только в JSONB;
- создавать новый G3/G4 при неизвестном направлении движения;
- рематериализовать G5 после reload/repeat-entry;
- позволять LLM сформировать SQL или party write plan.

## 10. Runtime activation boundary

Runtime role имеет только `SELECT` к `world_base`. Baseline registration,
import, activation и любые другие writes выполняет только явное operator
tooling после merge и вне игрового runtime.

Последний append-only `runtime_catalog_activation_events` является read-only
pointer для создания новой партии. После сохранения party domain pin reload и
turn читают exact historical import, а не active pointer. Operator approval,
attestation и rollout evidence доказывают готовность, но не являются
обязательной сетевой или файловой runtime-зависимостью.

Item/container activation не изменяет `graph_nodes` и `graph_edges`. Scoped G4
dependency assertion только сверяет exact canonical base row в пределах
утверждённого materialization scope. Несовпадение snapshot блокирует
materialization.

Физические FK из party database в `world_base` не создаются. Приложение через
два независимых read ports проверяет full world pin, domain pin, compatible
world tuple, exact import membership и runtime contract до materialization и
до commit party state.

## 11. Источники истины

| Вопрос | Источник |
|---|---|
| Граница код/LLM и materialization | `code_driven_world_materialization_architecture.md` после active promotion |
| Физические таблицы и constraints | `infra/world-base/schema.sql`, `schema/*.sql` |
| Фактические колонки | генерируемый `infra/world-base/SCHEMA_REFERENCE.md` |
| Назначение и readiness таблиц | `world_base_materialization_table_requirements.md` |
| Map authoring G0–G4 | `map_g0_g4_workflow.txt` |
| Конкретное состояние партии | committed normalized `party_runtime` rows |
