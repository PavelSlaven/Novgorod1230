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

## Фактические показатели

- Corpus documents: 22.
- Legacy documents with provenance: 19.
- Native project documents: 3.
- Approved semantic documents: 19.
- Structural-only graph documents: 3.
- Lexical-only RAG documents: 3.
- Approved semantic chunks: 813.
- `world_base` tables: 62.

## Последняя автоматическая проверка

GitHub Actions run `#53` (`29266053035`) на commit `1169090878d28a3e661a25ba67532570096d1a8f`:

- clean checkout: PASS;
- dependency install: PASS;
- world_base schema gate: PASS;
- canonical corpus gate: PASS;
- deterministic generation: PASS;
- generated reproducibility: PASS;
- full `npm test`: PASS.

## В работе

1. Побайтовый перенос и регистрация оставшихся нормативных документов:
   - `Правила разработки.txt`;
   - `Работа с картой G0-G4.txt`;
   - `base_turn_orcestration.txt`.
2. Определение канонического владения архитектурными документами:
   - `read_only_database_and_graph_architecture.md`;
   - `world_base_schema_reference.md`.
   Они не должны одновременно существовать как независимый narrative corpus и как инфраструктурный источник истины.
3. Финальная regeneration graph/RAG после расширения corpus.
4. Синхронизация migration reports и PR description после окончательного состава файлов.
5. Обязательный независимый critic audit по полному diff и clean-clone evidence.

## Блокирующие условия

PR нельзя переводить из draft и объединять, пока одновременно не выполнены:

- завершён полный перенос утверждённых нормативов;
- после последнего corpus-изменения повторно прошёл полный clean-clone CI;
- generated tree воспроизводим и не имеет незакоммиченного diff;
- агент критики вернул `PASS` или допустимый `PASS WITH NOTES`;
- после `CHANGES REQUIRED` или `REJECT` выполнены исправления, повторные тесты и повторный аудит.

Текущий итоговый статус: `automation_green_migration_incomplete_critic_pending`.
Legacy deletion allowed: false.
