# Статус миграции Rus_modules 0.23.0

Дата: 2026-07-12
Релиз: `0.23.0-migration.23`
Исходный архив: `Rus_modules-migration-0.22.0.zip`

## Выполнено в фазе knowledge-source

- Проведена полная рекурсивная инвентаризация `legacy/DOCUMENTS`: 29 файлов, unknown = 0.
- Выполнена unique-file review: каждому объекту назначено решение о canonical copy или provenance snapshot.
- Утверждены и скопированы byte-for-byte 19 canonical sources.
- Созданы corpus manifest, aliases, append-only import history и сохранённая inventory provenance.
- Создан production-модуль `@rus/knowledge-source` с immutable API, explicit storage port и typed failures.
- Graph материализуется из approved semantic snapshot только после source-location validation против нового corpus.
- RAG chunks пересобираются из нового corpus; approved embeddings присоединяются только при полном совпадении порядка, ID, текста, строк и размеров.
- Production composition передаёт `ports.knowledgeSource` runtime bindings.
- Production startup блокируется при повреждённом corpus, graph или RAG.
- Production fallback в `legacy/DOCUMENTS` отсутствует.
- `knowledge:generate`, `knowledge:check`, `docs:check`, architecture checks и production integration работают без доступного legacy corpus.

## Результат

- Corpus documents: 19/19.
- Byte/SHA-256 parity: passed.
- Legacy inventory: 29/29 classified; unknown = 0.
- Graph parity: accepted; nodes 1295, links 3602, hyperedges 11, semantic changes = 0.
- RAG parity: accepted; chunks 813/813, dimensions 1024.
- Knowledge-source automated tests: 9/9 passed.
- Full regression: 310/310 passed.
- Documentation check: passed.
- Architecture check: passed.
- Clean-tree release hygiene: passed.
- Clean-tree regression: 310/310 passed.
- ZIP integrity and clean archive restore: passed; restored regression 310/310.
- Critic audit: `PASS WITH NOTES`; no functional or architectural findings remain.

## Ручные блокирующие действия

1. Проверить live production deployment configuration оператором.
2. Создать внешний read-only архив старой папки.
3. Получить явное одобрение владельца на ручное удаление legacy.

Unique-file review завершён. Legacy deletion allowed: false.
