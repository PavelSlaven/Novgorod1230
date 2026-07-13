# @rus/map-maker

## Назначение

Автономный редакторский инструмент для импорта, проверки, раскладки и экспорта игровых графов G0-G5. Инструмент не участвует в new-game/turn runtime и не изменяет каноническую БД.

## Владеет

- адаптацией поддерживаемых JSON-форматов в `rus.game_graph.v1`;
- отделением визуальных координат в `rus.map_layout.v1`;
- детерминированной квадратной раскладкой без наложения узлов;
- render projection и SVG preview;
- безопасным file export в явно указанный каталог.

## Не делает

- не создаёт места, маршруты, причины, игровые эффекты или исторические факты;
- не решает, какие связи допустимы по смыслу;
- не импортирует `@rus/new-game`, `@rus/turn`, приложения или legacy runtime;
- не пишет в PostgreSQL/NocoDB;
- не хранит layout coordinates внутри игровых graph nodes.

## Public API

- `importGraphDocument`
- `validateGameGraph`
- `createSquareLayout`
- `validateLayoutSidecar`
- `projectRenderableGraph`
- `renderGraphSvg`

## Контракты

Игровой граф и layout sidecar являются разными документами. `game_graph` содержит только утверждённые игровые сущности. `layout_sidecar` содержит только технические координаты и digest графа. Missing semantic fields не заполняются догадками.

## Зависимости и ограничения

Разрешены только публичные API `@rus/kernel` и `@rus/space-map`, а также `node:*` для CLI. Запрещены DB/provider SDK, runtime workflows, `node_modules`, `dist` и релизные ZIP внутри каталога инструмента.

## Тесты

`test/map-maker.test.js` проверяет импорт, отделение координат, квадратную раскладку, digest-bound layout, SVG projection и запрет небезопасного export path.
