# Отчёт агента-критика: knowledge-source migration

Дата: 2026-07-12  
Релиз: `0.23.0-migration.23`  
Нормативная база: `Правила разработки.txt`, `Правило вызова агента-критика.txt`, `KNOWLEDGE_SOURCE_CORPUS_MIGRATION_PLAN.md`.

## Область аудита

Проверены полный diff фазы, новый production-модуль `@rus/knowledge-source`, storage port, runtime composition, corpus manifests, import history, graph/RAG materializers, docs-tools, схемы, архитектурные gates и тесты.

## Первый проход

Результат: `CHANGES REQUIRED`.

1. **MAJOR — автономность проверки.** `docs:check` и knowledge-source verification повторно читали `legacy/DOCUMENTS`, поэтому новый release не мог доказать самостоятельность без старой папки.
2. **MAJOR — неполная stale-проверка.** Runtime сравнивал corpus hash в generated manifest, но не сверял SHA-256 фактических `graph.json` и `index.json`.

## Исправления

- Полная классифицированная инвентаризация сохранена в `data/knowledge-source/imports/legacy-inventory.json`.
- `knowledge:generate`, `knowledge:check` и `docs:check` работают только от нового corpus и сохранённых provenance snapshots; доступность legacy не требуется.
- Import history сделана append-only и отклоняет конфликт повторного импорта.
- Runtime теперь сверяет corpus manifest hash и SHA-256 фактического graph/RAG artifact.
- Добавлены регрессионные тесты автономной проверки при физически скрытом `legacy/DOCUMENTS` и определения повреждённого generated artifact.

## Повторный аудит

Проверено:

- production source не содержит ссылок или fallback на `legacy/DOCUMENTS`;
- все внешние зависимости knowledge-source переданы явно через storage port и composition root;
- модуль не вызывает LLM, БД, provider, время или случайность;
- поиск является буквальным source-backed full-text и не создаёт смысловые факты;
- повреждённый corpus, manifest, graph или RAG обрабатывается fail-closed;
- 29 legacy-файлов классифицированы, unknown = 0;
- 19 canonical sources совпадают по байтам и SHA-256;
- graph: 1295 nodes, 3602 links, 11 hyperedges, semantic changes = 0;
- RAG: 813 chunks, exact ordered chunk/text/line/vector parity;
- verification, docs generation, architecture checks и production integration проходят без доступного legacy corpus;
- clean-tree release hygiene проходит;
- clean-tree полный regression: 310/310.

## Итог

`PASS WITH NOTES`

Оставшаяся запись уровня NOTE: критический проход выполнен как изолированная роль аудита в доступной среде этой сессии; отдельный внешний процесс агента не был доступен. Функциональных, архитектурных или информационных рисков по проверенному изменению не осталось.
