# Отчёт фазы: Knowledge Source and Documentation Corpus Migration

Дата: 2026-07-12  
Релиз: `0.23.0-migration.23`

## Выполнено

- Проведена рекурсивная инвентаризация 29 файлов legacy DOCUMENTS.
- Классифицированы 19 canonical sources, 6 graph artifacts, 2 RAG artifacts и 2 provenance documents; unknown = 0.
- 19 документов скопированы byte-for-byte в `data/knowledge-source/corpus/DOCUMENTS`.
- Созданы corpus manifest, aliases, append-only import history и сохранённая legacy inventory.
- Создан модуль `@rus/knowledge-source` с explicit storage port, immutable outputs и typed failures.
- Graph materializer проверяет 1295 nodes, 3602 links и 11 hyperedges против нового corpus.
- RAG materializer пересобирает 813 chunks из нового corpus и присоединяет только точно совпавшие approved vectors.
- Production composition передаёт `ports.knowledgeSource` в runtime bindings.
- Legacy fallback отсутствует в production source.
- Runtime проверяет SHA-256 corpus, graph и RAG artifacts и останавливает startup при отклонении.
- Generated verification и документация воспроизводятся без доступного legacy corpus.

## Инварианты

- Код не создаёт смысл документов, graph relations или отсутствующие факты.
- Generated data не является source of truth.
- Повреждение corpus или stale generated artifacts блокирует production startup.
- Legacy не удалён и остаётся только rollback/read-only материалом.

## Проверки

- Knowledge-source tests: 9/9 passed.
- Full regression: 310/310 passed.
- Documentation check: passed.
- Architecture boundaries: passed.
- Clean-tree release hygiene: passed.
- Clean-tree full regression: 310/310 passed.
- ZIP integrity, file checksum verification and clean archive restore: passed; restored regression 310/310.
- Critic re-audit: `PASS WITH NOTES`, блокирующих замечаний нет.

## Решение

Фаза knowledge-source технически завершена. Удаление legacy остаётся запрещённым до отдельных операторских и владельческих подтверждений.
