# Отчёт фазы MapMaker и инструменты

Дата: 2026-07-12  
Релиз: `0.17.0-migration.17`

## Выполнено

- Создан автономный `@rus/map-maker`.
- Добавлен import adapter для native `nodes/edges`, NetworkX-like `nodes/links` и `elements` JSON shapes при наличии полного game graph contract.
- Игровой граф `rus.game_graph.v1` и layout sidecar `rus.map_layout.v1` разделены.
- Layout sidecar связан с canonical graph через SHA-256 digest.
- Добавлены deterministic square layout, render projection и SVG preview.
- CLI экспортирует `game-graph.json`, `layout.json` и `preview.svg` только в явно указанный безопасный каталог.
- Созданы `@rus/db-tools`, `@rus/docs-tools`, `@rus/audit-tools`.
- DB write-like manifests требуют dry-run и approval; SQL execution отсутствует.
- RAG build использует explicit embedding port; provider SDK отсутствует.
- Audit manifest блокирует secrets, runtime data, nested ZIP, `node_modules` и `dist`.
- Добавлены tool-specific architecture boundaries.
- Исправлены проверки Stage 9–12, которые требовали отсутствующий и запрещённый `legacy/dist` release copy.

## Проверки

- Tool tests: 12/12.
- Module tests: 217/217.
- Package/domain tests: 30/30.
- Application tests: 11/11.
- Всего: 270/270.
- Architecture boundaries: passed.
- Release hygiene: passed.
- ZIP integrity: passed.

## Не выполнялось

- Запись в production world_base/party DB.
- Live embedding/provider calls.
- Перенос полноценного legacy MapMaker UI: такого приложения не было в исходном release.
- Настоящий browser E2E.
- Production shadow run и cutover.
