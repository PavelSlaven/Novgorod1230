# Отчёт критического аудита: canonical docs, world_base и knowledge-source

Дата: 2026-07-13  
Релиз: `0.23.0-migration.23`  
Проверенный head: `0ca4c99b052acf1fe23b514622316215a230de96`  
GitHub Actions: run `#61` (`29267437099`)

Нормативная база:

- `Правила разработки.txt`;
- `Правило вызова агента-критика.txt`;
- `Работа с картой G0-G4.txt`;
- `docs/migration/plans/KNOWLEDGE_CORPUS_EXTENSION_GATE.md`.

## Метод

Проведён отдельный структурированный критический проход по полному diff PR №2, изменённым runtime-контрактам, DDL, генераторам, валидаторам, тестам и фактическому clean-clone CI evidence.

Отдельный внешний процесс агента-критика в доступной среде отсутствует. Поэтому настоящий документ не выдаёт внутренний независимый проход за вызов внешнего агента. До интеграции требуется либо доступный внешний аудит, либо явно принятая владельцем процедура эквивалентного независимого review.

## Проверенная область

- полный GitHub Actions workflow и защита от false-green;
- `world_base` entrypoint и восемь SQL-частей;
- schema checker и read-only permissions;
- canonical corpus verifier, manifest и aliases;
- делегирование владения corpus из `CANONICAL_PATHS.json`;
- graph/RAG materializer v2;
- runtime generated-artifact status checks;
- production composition root;
- отделение active world catalogs от legacy runtime policy;
- migration status, test report и tools inventory;
- все новые и изменённые тесты.

## Найденные замечания и исправления

### MAJOR-1 — команда `knowledge:generate` использовала legacy materializer

Статус: **исправлено**.

`tools/docs-tools/src/knowledge-cli.js` вызывал `writeKnowledgeSourceOutputs`, тогда как `docs:generate` уже использовал v2 materializer. Это создавало два различных пути генерации под одним контрактом.

Исправление: CLI теперь явно вызывает `writeKnowledgeSourceOutputsV2`.

### MAJOR-2 — RAG coverage неверно объявлял все документы lexical-indexed

Статус: **исправлено**.

`lexical-index.json` содержит только документы без approved embeddings, однако manifest ставил `lexical_indexed: true` всем 22 документам.

Исправление:

- semantic documents: `semantic_indexed: true`, `lexical_indexed: false`;
- native documents без approved embeddings: `semantic_indexed: false`, `lexical_indexed: true`;
- тест проверяет точное совпадение множества lexical coverage files с файлами lexical chunks.

### MAJOR-3 — нормализация lockfile не была идемпотентной

Статус: **исправлено**.

Workflow падал, если внутренний registry prefix уже отсутствовал. Исправление допускает уже нормализованный lockfile и fail-closed проверяет, что запрещённый prefix не остался после преобразования.

## Подтверждённые свойства

- код не создаёт смысловые факты мира;
- новые corpus-документы не получают придуманных semantic links;
- отсутствующие embeddings не заменяются нулевыми, случайными или копированными vectors;
- approved semantic snapshot сохраняется отдельно от deterministic lexical coverage;
- provenance digest отделён от digest сгенерированного semantic artifact;
- production startup отклоняет повреждённые или stale graph/RAG artifacts;
- active world catalogs не маскируются строковой фильтрацией ошибок;
- production composition имеет одну реализацию и публичный re-export entrypoint;
- clean-clone CI выполняет все обязательные gates, а не только setup-шаги.

## Автоматическая проверка

Run `#61` завершён с conclusion `success`:

- checkout: PASS;
- lockfile normalization: PASS;
- `npm ci`: PASS;
- `world-db:schema-check`: PASS;
- `knowledge:check-corpus`: PASS;
- deterministic generation: PASS;
- generated reproducibility: PASS;
- full `npm test`: PASS.

## Оставшиеся блокеры

### BLOCKER-1 — не завершён побайтовый перенос обязательных нормативов

Не зарегистрированы в canonical corpus:

- `Правила разработки.txt`;
- `Работа с картой G0-G4.txt`;
- `base_turn_orcestration.txt`.

Доступный GitHub connector не принимает локальный файл как file-параметр, а непрозрачные бинарные/base64 payload блокируются защитой. Перенос нельзя объявлять завершённым до фактической загрузки, повторного чтения из GitHub и проверки bytes/SHA-256.

### MAJOR-4 — schema gate является статическим, а не исполняемым PostgreSQL proof

Текущий checker подтверждает количество таблиц, порядок include, permissions и ряд запрещённых конструкций через анализ DDL. Он не выполняет весь DDL в настоящем PostgreSQL instance. До финального release желательно добавить отдельный PostgreSQL execution gate. Это не отменяет текущий зелёный статический gate, но ограничивает доказательство исполняемости схемы.

### BLOCKER-2 — требуется повторный аудит после окончательного corpus expansion

После добавления оставшихся нормативов изменятся manifest, aliases, graph/RAG coverage и generated digests. По правилу проекта после этих изменений обязательны:

1. повторная генерация;
2. полный clean-clone CI;
3. повторный критический аудит полного diff.

## Итог

`CHANGES REQUIRED`

PR должен оставаться draft. Допуск к интеграции возможен только после закрытия BLOCKER-1, повторного полного CI и повторного аудита с итогом `PASS` или допустимым `PASS WITH NOTES`.
