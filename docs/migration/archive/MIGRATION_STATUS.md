# Архивный статус миграции Rus_modules 0.23.0

> Исторический снимок. После составления этого отчёта финальный PR был объединён 13 июля 2026 года. Архитектурная миграция завершена; содержащиеся ниже формулировки «в работе» и «блокирующие условия» сохранены только как evidence процесса.

Дата снимка: 2026-07-13  
Релиз снимка: `0.23.0-migration.23`  
Ветка: `agent/restore-canonical-docs-generated-ci`

## Выполнено

- Восстановлен полный clean-clone GitHub Actions workflow с обязательными schema, corpus, generation, reproducibility и full-test gates.
- Добавлен регрессионный контракт, запрещающий false-green workflow без обязательных шагов.
- Восстановлен исполняемый `world_base` DDL: entrypoint, восемь упорядоченных SQL-частей, 62 таблицы и read-only permissions.
- Добавлен независимый canonical corpus verifier с проверкой файлов, bytes, SHA-256, alias targets и path safety.
- `CANONICAL_PATHS.json` зарегистрировал единственный corpus manifest; отдельный validator запрещает дублировать corpus-файлы во втором реестре.
- Сохранены 19 legacy canonical documents с provenance.
- Добавлены 7 native project documents:
  - `code_critic_invocation_rule.txt`;
  - `development_rules.txt`;
  - `g1_g5_generation_rules.txt`;
  - `map_g0_g4_workflow.txt`;
  - `base_turn_orchestration.txt`;
  - `new_game_start_pipeline.txt`;
  - `read_only_database_and_graph_architecture.md`.
- Graph/RAG materializer v2 сохраняет approved semantic snapshots и не создаёт фиктивные embeddings.
- Новые документы получают structural graph nodes и deterministic lexical coverage с явным `semantic_indexed: false`.
- Runtime reader проверяет corpus hash, generation mode, semantic artifact digest и lexical artifact digest раздельно.
- Активный `data/world-catalogs` отделён от legacy runtime policy без строковой фильтрации ошибок.
- Production composition имеет одну реализацию в `apps/game-server/src/composition/production.js`; верхний entrypoint содержит только публичные re-export.
- Побайтово импортированы `development_rules.txt`, `map_g0_g4_workflow.txt`, `base_turn_orchestration.txt` и `read_only_database_and_graph_architecture.md`.
- Восстановлен DDL-driven генератор `infra/world-base/SCHEMA_REFERENCE.md`; отсутствующие описания остаются явно отсутствующими.
- Workflow contract требует реального исполнения DDL в PostgreSQL 16 и проверки роли/read-only grants.
- Публичный `@rus/docs-tools.writeKnowledgeSourceOutputs` направлен на тот же v2 materializer, что `knowledge:generate` и `docs:generate`; добавлен регрессионный тест публичного API.
- Approved semantic embeddings принимаются только после совпадения semantic corpus hash и exact ordered chunk parity; provenance каждого graph node/link/hyperedge требует согласованных source-полей, безопасного canonical path и диапазона в пределах логического EOF.
- Graph semantic source set обязан точно совпадать с approved embedding document set; semantic relations к structural-only nodes запрещены.
- Legacy re-import полностью валидирует план, включая native collisions, до первой записи.
- Повторный `knowledge:import` сохраняет native records, aliases и файлы, импортируя только legacy-owned записи.

## Фактические показатели снимка

- Corpus documents: 26.
- Legacy documents with provenance: 19.
- Native project documents: 7.
- Approved semantic documents: 19.
- Structural-only graph documents: 7.
- Lexical-only RAG documents: 7.
- Approved semantic chunks: 813.
- Lexical-only chunks: 346.
- `world_base` tables: 62.

## Последняя автоматическая проверка снимка

Подтверждённый clean-clone implementation run: `#74` (`29282256574`), job `86926064785`, commit `cfb98442aeda85495da42af7071af05fe18d6dac`:

- clean checkout: PASS;
- dependency install: PASS;
- static world_base schema gate: PASS;
- deterministic schema-reference gate: PASS;
- real PostgreSQL 16 DDL execution: PASS;
- canonical corpus gate: PASS;
- deterministic generation: PASS;
- generated reproducibility: PASS;
- full `npm test`: PASS.

## Финальный результат

PR `#2` объединён в `main` коммитом `0507dd7d3922ac5ed55961ea3face89ba7d2b09a`. Последний аудит вернул допустимый `PASS WITH NOTES`; блокирующих замечаний не осталось. Modular runtime стал основной реализацией, а исторический legacy-контур сохранён только для rollback и evidence.
