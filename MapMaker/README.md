# MapMaker 0.2.0

Безопасный framework-agnostic модуль браузерной карты G1–G4 для проекта «Русь XIII век».

## Архитектурная граница

MapMaker не придумывает места, маршруты, названия, исторические отношения или знания персонажа. Он:

1. получает локальный канонический подграф на сервере;
2. накладывает состояние партии;
3. применяет отдельную player-facing проекцию знаний персонажа;
4. материализует известные boundary exits;
5. объединяет обратные направления в одну визуальную связь;
6. присоединяет только утверждённую раскладку;
7. проверяет отсутствие скрытых данных;
8. передаёт браузеру безопасный `MapViewDTO`.

Канонические чанки никогда не размещаются в public/static root. В браузер передаётся только DTO без канонических ID, скрытых endpoint, истинности слухов и объективного положения приблизительно известных объектов.

## Установка

```bash
npm install
npm test
```

Полная матрица `npm test`:

- 15 unit/integration tests;
- 2 security tests;
- 1 browser e2e test на Chromium.

## Компиляция Новгорода

В `source_tsv/` должны находиться:

```text
novgorod_graph_nodes_g1_g4_full_v6.tsv
novgorod_graph_edges_g1_g4_full_v6.tsv
novgorod_graph_node_layout_metadata_v1.tsv
```

Команда:

```bash
npm run compile:novgorod
```

Результат записывается в закрытый каталог:

```text
private-generated/server/
  manifest.json
  AUDIT_REPORT.json
  G1/
  G2/
  G3/
  G4/
```

Итог сборки v2:

```text
11 359 узлов
30 248 направленных физических рёбер
1 141 локальная карта
1 141 approved
58 boundary exits
0 layouts с overlap
0 invalid layouts
```

G1 использует поля `grid_x/grid_y` из отдельного layout metadata source. ID узла не разбирается как координата.

## Запуск demo

```bash
npm run demo
```

Demo раздаёт только:

```text
examples/
dist/
```

`private-generated/server` читается только серверным dev API. Прямые, закодированные и двойно закодированные попытки path traversal проверяются тестами.

Demo не заменяет статус раскладки. В заголовке показывается реальный `approved`, `needs_semantic_review` или иной статус.

## Knowledge projection

Канонический узел и видимый узел — разные структуры.

Для `known_roughly`, `rumored`, `doubtful` и `false_belief` вызывающая система обязана передать:

- `publicId`;
- player-facing `displayTitle`;
- player-facing `displayIconKey`;
- отдельную `displayPosition`;
- `knownChildMapAvailable`.

MapMaker не подставляет каноническое название, тип, координату или наличие дочернего графа.

`false_belief` существует только во внутреннем контракте. В DTO передаётся обычное presentation state, поэтому игрок не может определить ложность знания через Network/DevTools.

## Изолированный pipeline

```text
ValidateMapRequest
→ LoadLocalCanonicalGraph
→ ApplyPartyOverlay
→ ApplyCharacterKnowledge
→ MaterializeBoundaryExits
→ CollapseVisualEdges
→ AttachApprovedLayout
→ AttachVisualStyles
→ BuildMapViewDTO
→ ValidateNoHiddenLeaks
```

Каждая стадия экспортируется и имеет unit test.

## Production API

Экспортируется `createProductionMapViewHandler()`.

Маршрут:

```text
GET /api/parties/:partyId/map-view?level=G4&parentNodeId=...
```

Handler обязательно:

- аутентифицирует запрос;
- сверяет `partyId` маршрута с identity;
- проверяет доступ identity к `characterId`;
- только после этого загружает input конвейера.

## Браузер

```ts
import { HttpMapDataSource, MapMaker } from "@rus13/map-maker";
import "@rus13/map-maker/styles.css";

const map = new MapMaker(document.querySelector("#map")!, {
  dataSource: new HttpMapDataSource("/api/"),
  mode: "full"
});

await map.open("known-public-parent-id", "G4");
```

Поддерживаются:

- относительный и абсолютный base URL;
- устойчивые preset coordinates;
- bend points;
- SVG marker layer для bridge/gate/door/ford/ferry;
- визуальные состояния знания и доступности;
- ResizeObserver;
- защита от race condition при нескольких `open()`;
- текстовая клавиатурная навигация по узлам и рёбрам.

## Семантическое утверждение

`config/novgorod-semantic-review-v1.json` является внешним утверждённым решением, а не процедурной догадкой компилятора. Оно разрешает раскладки только при выполнении условий:

- используются только существующие узлы и рёбра;
- G1 основан на `grid_x/grid_y`;
- physical cross-parent edges сохранены;
- водные типы не изменены и отображаются маркерами;
- quality gate сообщает 0 overlap и 0 invalid coordinate.

При нарушении условий компилятор не создаёт успешную сборку.

## SQL

Схема визуального слоя находится в:

```text
sql/001-map-layouts.sql
```

Она добавляет layouts, positions, edge geometry, constraints, reviews и визуальные каталоги отдельно от канонического графа и party state.
