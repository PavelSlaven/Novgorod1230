# Статус миграции Rus_modules 0.23.0

Дата: 2026-07-13
Релиз: `0.23.0-migration.23`
Ветка: `agent/restore-canonical-docs-generated-ci`
Статус PR: draft

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

## Фактические показатели

- Corpus documents: 26.
- Legacy documents with provenance: 19.
- Native project documents: 7.
- Approved semantic documents: 19.
- Structural-only graph documents: 7.
- Lexical-only RAG documents: 7.
- Approved semantic chunks: 813.
- Lexical-only chunks: 346.
- `world_base` tables: 62.

## Последняя автоматическая проверка

Последний подтверждённый clean-clone GitHub Actions run: `#63` (`29271952334`) на commit `63600d93b76312ccd95305dea78281dd9874d6b0`:

- clean checkout: PASS;
- dependency install: PASS;
- static world_base schema gate: PASS;
- deterministic schema-reference gate: PASS;
- real PostgreSQL 16 DDL execution (62 tables, `world_reader`, read-only grants): PASS;
- canonical corpus gate: PASS;
- deterministic generation: PASS;
- generated reproducibility: PASS;
- full `npm test`: PASS.

## В работе

1. Повторный clean-clone run после исправления public writer, найденного независимым critic audit.
2. Синхронизация PR description с итоговым commit/run evidence.
3. Повторный независимый critic audit после нового зелёного CI.
4. Решение владельца по byte-конфликту critic rule: handoff-файл имеет 9109 bytes/CRLF и SHA-256 `b3049ee06f6462081641bffdc0d12dc2596905ba401560e740f1c98c3192ec96`, существующий canonical файл — 8960 bytes/LF и SHA-256 `7a0d690a18f39e264cd39eca3b83eae5c943de97e4219b3f8034b98da9289165`; нормализованный текст совпадает, автоматическая замена запрещена.

## Блокирующие условия

PR нельзя переводить из draft и объединять, пока одновременно не выполнены:

- завершён полный перенос утверждённых нормативов;
- после последнего corpus-изменения повторно прошёл полный clean-clone CI;
- реальный PostgreSQL 16 gate прошёл на финальном head;
- generated tree воспроизводим и не имеет незакоммиченного diff;
- агент критики вернул `PASS` или допустимый `PASS WITH NOTES`;
- после `CHANGES REQUIRED` или `REJECT` выполнены исправления, повторные тесты и повторный аудит.

Текущий итоговый статус: `clean_clone_green_critic_changes_required_fix_in_progress`.
Legacy deletion allowed: false.
