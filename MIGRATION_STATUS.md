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
- Добавлены 3 native project documents:
  - `code_critic_invocation_rule.txt`;
  - `g1_g5_generation_rules.txt`;
  - `new_game_start_pipeline.txt`.
- Graph/RAG materializer v2 сохраняет approved semantic snapshots и не создаёт фиктивные embeddings.
- Новые документы получают structural graph nodes и deterministic lexical coverage с явным `semantic_indexed: false`.
- Runtime reader проверяет corpus hash, generation mode, semantic artifact digest и lexical artifact digest раздельно.
- Активный `data/world-catalogs` отделён от legacy runtime policy без строковой фильтрации ошибок.
- Production composition имеет одну реализацию в `apps/game-server/src/composition/production.js`; верхний entrypoint содержит только публичные re-export.
- Побайтово импортированы `development_rules.txt`, `map_g0_g4_workflow.txt`, `base_turn_orchestration.txt` и `read_only_database_and_graph_architecture.md`.
- Восстановлен DDL-driven генератор `infra/world-base/SCHEMA_REFERENCE.md`; отсутствующие описания остаются явно отсутствующими.
- Workflow contract требует реального исполнения DDL в PostgreSQL 16 и проверки роли/read-only grants.

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

Последний подтверждённый baseline GitHub Actions до текущих изменений: run `#62` (`29267544106`) на commit `eb88619c4304849515a22428e1c05f6e3c32d7de`:

- clean checkout: PASS;
- dependency install: PASS;
- world_base schema gate: PASS;
- canonical corpus gate: PASS;
- deterministic generation: PASS;
- generated reproducibility: PASS;
- full `npm test`: PASS.

## В работе

1. Первый clean-clone run с новым PostgreSQL execution gate.
2. Синхронизация PR description с итоговым commit/run evidence.
3. Обязательный независимый critic audit по полному diff и последнему зелёному CI.
4. Решение владельца по byte-конфликту critic rule: handoff-файл имеет CRLF и SHA-256 `b3049e...`, существующий canonical файл — LF и SHA-256 `7a0d69...`; нормализованный текст совпадает, автоматическая замена запрещена.

## Блокирующие условия

PR нельзя переводить из draft и объединять, пока одновременно не выполнены:

- завершён полный перенос утверждённых нормативов;
- после последнего corpus-изменения повторно прошёл полный clean-clone CI;
- реальный PostgreSQL 16 gate прошёл на финальном head;
- generated tree воспроизводим и не имеет незакоммиченного diff;
- агент критики вернул `PASS` или допустимый `PASS WITH NOTES`;
- после `CHANGES REQUIRED` или `REJECT` выполнены исправления, повторные тесты и повторный аудит.

Текущий итоговый статус: `local_gates_green_clean_clone_and_critic_pending`.
Legacy deletion allowed: false.
