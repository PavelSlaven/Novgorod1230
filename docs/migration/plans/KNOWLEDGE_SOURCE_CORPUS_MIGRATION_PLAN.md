# План фазы: Knowledge Source and Documentation Corpus Migration

Дата: 2026-07-12  
Целевой релиз: `0.23.0-migration.23`  
Источник: `0.22.0-migration.22`

## Цель

Скопировать полный нормативный corpus из legacy в автономный новый проект, создать `@rus/knowledge-source`, исключить production fallback в legacy и сделать graph/RAG проверяемыми и воспроизводимыми.

## Этапы

1. Зафиксировать baseline и полный regression 0.22.0.
2. Рекурсивно инвентаризировать `legacy/DOCUMENTS` и классифицировать все файлы.
3. Выполнить unique-file review.
4. Утвердить 19 canonical sources.
5. Скопировать corpus byte-for-byte и проверить SHA-256.
6. Создать corpus manifest, aliases и append-only import history.
7. Создать read-only модуль `@rus/knowledge-source` с typed failures.
8. Импортировать approved graph/embedding snapshots как provenance, а не source of truth.
9. Материализовать graph из snapshot только после проверки всех source locations против нового корпуса.
10. Пересобрать RAG chunks из нового корпуса и присоединить imported embeddings только при полном совпадении последовательности, текста и метаданных.
11. Передать `KnowledgeSourceReader` в production runtime bindings через composition root.
12. Запретить legacy paths в production source и проверить startup без legacy-доступа.
13. Обновить schemas, docs, status, manifest и checksums.
14. Запустить unit, contract, integration, architecture, docs, parity, regression и clean archive restore.
15. Передать полный diff агенту-критику; при замечаниях повторить цикл.

## Стоп-условия

Фаза блокируется при unknown-файлах, несовпадении байтов, потерянном graph source location, несовпадении RAG chunk sequence, stale generated data, production legacy fallback, failed tests или результате критика `CHANGES REQUIRED`/`REJECT`.
