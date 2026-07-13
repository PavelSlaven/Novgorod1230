# План миграции MapMaker и инструментов

## Цель

Перенести редакторские и служебные инструменты в автономный `tools/` слой без runtime-зависимости от игры и без смешивания визуальных координат с игровыми сущностями графа.

## Работы

1. Создать `tools/map-maker` с публичным graph import contract.
2. Разделить `rus.game_graph.v1` и `rus.map_layout.v1`.
3. Добавить детерминированную квадратную раскладку и SVG preview.
4. Запретить MapMaker писать в `apps/`, `packages/`, `legacy/`, `data/` и `schemas/`.
5. Создать `tools/db-tools` для manifest/dry-run/approval gates без SQL executor.
6. Создать `tools/docs-tools` для document graph и RAG verification через explicit embedding port.
7. Создать `tools/audit-tools` для safe release/audit manifests.
8. Добавить tool-specific unit tests и architecture gates.
9. Обновить migration status, manifests и release archive.

## Критерии завершения

- MapMaker не импортирует new-game/turn/runtime приложения.
- Layout coordinates физически отделены от game graph.
- DB tools не исполняют SQL.
- Docs tools не импортируют provider SDK.
- Audit tools блокируют secrets/runtime artifacts/nested ZIP.
- Все тесты и release gates проходят.
