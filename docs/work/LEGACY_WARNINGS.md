# Legacy warnings

> Реестр известных костылей и legacy-ловушек. Рабочий файл, норм не создаёт: при конфликте действует AGENTS.md, CONTRACT_INDEX и профильные контракты. Проверено: 2026-09-22, commit c5501419.

## Как пользоваться

1. **До правки** найди записи по затрагиваемым путям: `rg -n "<путь или имя файла>" docs/work/LEGACY_WARNINGS.md`.
2. **С известным костылём живи** по колонке «Как жить»: без попутного рефакторинга и без «заодно почищу».
3. **Если костыль блокирует задачу** — заведи issue по форме `tech_debt` (`.github/ISSUE_TEMPLATE/tech_debt.yml`) и остановись на решении владельца.
4. **Новый костыль** — новая запись со следующим номером; строка в CHANGELOG `## Unreleased` с отметкой `LW-### added`. Закрытие — удалить запись в PR, который устранил причину, и отметить `LW-### closed`.

Статусов здесь нет: запись существует, пока проблема есть. Каждой записи со временем ставится ссылка на issue.

## Индекс

| LW | Пути | Суть |
|---|---|---|
| 001 | `src/` | корневой legacy runtime вне workspaces |
| 002 | `test/` | корневые тесты рядом с тестами пакетов |
| 003 | `DOCUMENTS/`, `legacy/` | legacy-корпус и исходная система |
| 004 | `corpus/DOCUMENTS/weapons_and_armor.txt`, `world_regions.txt` | legacy_mirror: байты неизменны |
| 005 | `corpus-manifest.json`, `retrieval-policy.json`, `generated/knowledge-source/` | хеш-цепочка корпуса |
| 006 | `retrieval-policy.json`, `KNOWLEDGE_SOURCE_POLICY.md` | `baseline_gap` против KSP «required_before_merge» |
| 007 | `llm_documentation_navigation.md`, `development_rules.txt`, `map_g0_g4_workflow.txt` | ловушки в именах и статусах |
| 008 | `CONTRACT_INDEX.md`, `retrieval-policy.json`, шапки документов | три системы статусов |
| 009 | `CONTRACT_INDEX.md` §6, §10 | нормы внутри индекса |
| 010 | `docs/work/temporal-world-v4/`, `docs/implementation/`, `docs/migration/` | evidence-пути, которые читают tools и тесты |
| 011 | файлы с закреплённым digest | байты закреплены хешами |
| 012 | `tools/spatial-v3/*`, `tools/docs-tools/test/*` | закрепления фраз в документах |
| 013 | `check-boundaries.mjs`, `tools/docs-tools/src/documentation.js` | двойной allowlist корневых .md |
| 014 | `generated/generated-manifest.json` | `input_digest` меняется от любой зарегистрированной правки |
| 015 | `package.json` | 212 npm-скриптов и висячие `npm run` |
| 016 | `DOCUMENTS/`, `spatial_architecture_standard_g0_g6.md`, `docs/implementation/` | упоминания Graphify и `.github/AGENTS.md` |
| 017 | `docs/domain/OWNERSHIP_MAP.md`, `docs/pipelines/temporal-advance.md` | v9-факты в текущих документах |
| 018 | `**/MODULE.md` | разнобой формата MODULE.md |
| 019 | `infra/world-base/SCHEMA_REFERENCE.md`, `schemas/party-db/` | документация БД |
| 020 | `tools/local-play/`, `packages/llm-runtime/src/provider-config.js` | LLM по умолчанию |
| 021 | `.cursorrules.txt`, `legacy/.cursor/rules/project.mdc`, `.github/*.txt` | противоречивые правила агентов |
| 022 | `MapMaker/`, `docker-compose.yml`, `.github/workflows/bootstrap.yml` | инфра-гигиена |
| 023 | `packages/knowledge-source/src/cli.js` | `knowledge:read` отдаёт документ целиком |
| 024 | PR #98 | статус Runtime живёт в описании PR |
| 025 | `.tmp.driveupload/` | синхронизация Google Drive в рабочей копии |

## Записи

### LW-001 — корневой `src/`
- **Что.** `src/` (env, ui-server, ui, world) — вторая копия до-модульного runtime вне npm workspaces (`apps/* packages/* tools/*`), отличающаяся от `legacy/src`. Её импортируют корневые `test/*.test.js`; `DOCUMENTS/` и `prompts/` читает только `src/world/corpus-loader.js`.
- **Как жить.** Новый код туда не класть; владельцы — пакеты из `MODULE_INDEX.md`. Правка `src/` — только если задача прямо про него.

### LW-002 — корневые тесты `test/`
- **Что.** `test/` (acceptance, cutover, spatial-v3, integration, отдельные `*.test.js`) живёт рядом с тестами пакетов. Корневые `test/*.test.js` (большинство импортирует `src/`) не запускает ни один `test:*` скрипт; подкаталоги запускаются выборочно (например `test/spatial-v3/p04-catalog-sync.test.js` в `test:tools`).
- **Как жить.** Тест для пакета класть в `<пакет>/test/`; раскладку см. `docs/context/TESTING.md`.

### LW-003 — `DOCUMENTS/` и `legacy/`
- **Что.** `DOCUMENTS/documents-kg/` и `legacy/` — исходная система и её корпус; `legacy/DOCUMENTS/documents-kg/corpus/DOCUMENTS/` — зеркало для `canonicalized_from_legacy`.
- **Как жить.** Production-код обращается к legacy только через `packages/new-game/src/legacy-adapter.js`; нормы читать из `data/knowledge-source/corpus/DOCUMENTS/`, не из legacy-копий.

### LW-004 — legacy_mirror
- **Что.** 2 документа корпуса с `provenance_mode: legacy_mirror` (`weapons_and_armor.txt`, `world_regions.txt`) и файлы с `-whitespace` в `.gitattributes` байтово неизменны.
- **Как жить.** Не править, не нормализовать переводы строк и пробелы.

### LW-005 — хеш-цепочка корпуса
- **Что.** Правка документа → sha256/bytes в `corpus-manifest.json` → `baseline_manifest_sha256` в `retrieval-policy.json` → `docs:generate`.
- **Как жить.** Только по `docs/process/CORPUS_EDIT.md`; generated вручную не править и не сливать.

### LW-006 — `baseline_gap` и KSP
- **Что.** `docs/architecture/KNOWLEDGE_SOURCE_POLICY.md` (раздел «RAG-готовность») требует `required_before_merge` для изменённого active-документа без нового embedding. Практика (PR #97) сохраняет `baseline_gap`: код правило не проверяет, а `required_before_merge` блокирует RAG readiness и роняет тест «no unacknowledged blocker».
- **Как жить.** Следовать практике PR #97; расхождение не узаконено и ждёт решения владельца (вариант — выровнять текст KSP в DOC-02, #100).

### LW-007 — ловушки в именах и статусах
- **Что.** `llm_documentation_navigation.md` — SUPERSEDED redirect; `development_rules.txt` — REFERENCE; `map_g0_g4_workflow.txt` и `read_only_database_and_graph_architecture.md` — MIGRATION / ROLLBACK, хотя имена выглядят как основные. Обратная ловушка: `spatial_v3_target_*` — ACTIVE, несмотря на «target» в имени (CONTRACT_INDEX, таблица исключений).
- **Как жить.** Статус брать только из `CONTRACT_INDEX.md`, не из имени файла.

### LW-008 — три системы статусов
- **Что.** Метки CONTRACT_INDEX §2, статусы `active/proposed/deprecated` в `retrieval-policy.json` и строки «Status:» в шапках документов.
- **Как жить.** Нормативный статус — CONTRACT_INDEX; retrieval-статус влияет только на RAG-выдачу.

### LW-009 — нормы в §6/§10 CONTRACT_INDEX
- **Что.** Индекс содержит нормы (World Knowledge, direct speech, правила изменения статусов), а не только навигацию; строки WK в scope matrix §8.1 нет.
- **Как жить.** Для WK и direct speech читать §5, §6 и §10 индекса. Перенос норм к владельцам — backlog.

### LW-010 — evidence, которое читают tools
- **Что.** `docs/work/temporal-world-v4/`, `docs/implementation/*`, `docs/migration/*` читаются тестами и скриптами (`test/spatial-v3/*`, `tools/spatial-v3/check-production-activation-boundary.mjs`, `generate-temporal-normative-freeze.mjs`, `scripts/*pr17*`, `packages/knowledge-source/test/rag-policy-repository.test.js`).
- **Как жить.** Не переносить и не переименовывать эти файлы без правки читателей; перед переносом — `git grep` по пути.

### LW-011 — байты, закреплённые digest
- **Что.** Часть файлов закреплена sha256 в manifests, freeze-файлах и цепочках миграций (например `SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST`).
- **Как жить.** Перед правкой: `git grep` по имени файла в `tools/`, `test/`, `*.json`; существующие миграции не править.

### LW-012 — закрепления фраз
- **Что.** Проверки ищут точные фразы в документах (`tools/docs-tools/test/documentation-generation.test.js`, `tools/spatial-v3/check-*.mjs`, токены ADR-001 в `check-p25.mjs`, точный термин «versioned production activation cutover» в `check-production-activation-boundary.mjs`; sha256-пины ADR-001 и 17 документов корпуса — `docs/migration/spatial-v3/normative-freeze.json` и `data/contracts/spatial-v3/p05-reviewed-baseline.json`). Уже падают вне merge gate: `temporal-v4:check-docs` (2 конфликта в `llm_documentation_navigation.md`) и `spatial-v3:check-p04` («world: target/active boundary missing»).
- **Как жить.** Перед правкой текста — `rg` фразы по `tools/` и `test/`. Для non-gate проверок сравнивать с этим baseline.

### LW-013 — двойной allowlist корневых .md
- **Что.** Разрешённые корневые .md заданы дважды: `tools/architecture/check-boundaries.mjs` (`allowedRootMarkdown`) и `tools/docs-tools/src/documentation.js`.
- **Как жить.** Новые корневые .md не создавать; при изменении списка править оба места.

### LW-014 — `input_digest`
- **Что.** `generated/generated-manifest.json` содержит `input_digest` по путям из `docs/migration/CANONICAL_PATHS.json`, всем `MODULE.md` и `package.json` в apps/packages/tools, `schemas/**` и файлам с экспортом `*SCHEMA` (`collectGeneratorInputs` в `tools/docs-tools/src/documentation.js`); любая их правка требует `docs:generate`, иначе падает `docs:check`, и даёт механический конфликт в параллельных ветках.
- **Как жить.** Часто меняемые документы в CANONICAL_PATHS не регистрировать; при конфликте — `npm run docs:generate`, не ручное слияние.

### LW-015 — npm-скрипты
- **Что.** 212 скриптов в `package.json`; в документах и скриптах 37 висячих `npm run` (например `start:cli`, `repo-intel:*`, `release:*`, `world-db:seed-*`).
- **Как жить.** Команды брать из `package.json` и `docs/context/TESTING.md`; упоминание скрипта в документе не доказывает его существование.

### LW-016 — Graphify и `.github/AGENTS.md`
- **Что.** Graphify и repo-intel удалены, `.github/AGENTS.md` не существует, но упоминания остались в `DOCUMENTS/`, `MapMaker/scripts/compile-novgorod.mjs`, `spatial_architecture_standard_g0_g6.md` и `docs/implementation/*/README.md`.
- **Как жить.** Не восстанавливать и не следовать этим инструкциям; навигация — codebase-memory-mcp и `rg`.

### LW-017 — v9-факты
- **Что.** `docs/domain/OWNERSHIP_MAP.md`, `docs/pipelines/temporal-advance.md`, `apps/game-server/MODULE.md` и планы lower-dvina содержат факты прежних версий (v9).
- **Как жить.** Текущее поведение сверять с кодом и активными контрактами.

### LW-018 — разнобой MODULE.md
- **Что.** MODULE.md пакетов различаются по структуре и объёму: от ~30 строк (`packages/contracts`) до 525 (`packages/turn`) и 679 (`apps/game-server`), где ответственность перемешана с историей target/activation.
- **Как жить.** Брать из MODULE.md ответственность и public contract; журнал не считать контрактом.

### LW-019 — документация БД
- **Что.** `infra/world-base/SCHEMA_REFERENCE.md` (~559 КБ) описывает только world_base; единого справочника party_runtime нет; `infra/world-base/README.md` устарел («186 таблиц», «17 частей» при фактических 201 и 21).
- **Как жить.** См. `docs/context/DB_SCHEMA.md`; по SCHEMA_REFERENCE искать `rg '^## '`.

### LW-020 — LLM по умолчанию
- **Что.** Два разных «default»: `packages/llm-runtime/src/provider-config.js` — role defaults уровня окружения; gameplay-default `play:local` (managed Gemma) — `tools/local-play/*` и его MODULE.md. PR #98 меняет gameplay-default (vLLM endpoint), `provider-config.js` не трогает.
- **Как жить.** В документах ссылаться на владельца, не на значение.

### LW-021 — противоречивые правила агентов
- **Что.** `legacy/.cursor/rules/project.mdc` (`alwaysApply: true` для `legacy/`) утверждает «код не сочиняет мир», что противоречит AGENTS.md §7/§10; `.cursorrules.txt`, `legacy/.cursorrules.txt`, `.github/Правила разработки.txt`, `.github/Работа с картой G0-G4.txt` требуют полного чтения REFERENCE/ROLLBACK-документов.
- **Как жить.** Действует AGENTS.md. Перенос в архив — DOC-03 (#101).

### LW-022 — инфра-гигиена
- **Что.** esbuild нужен только `MapMaker/` (не workspace); `docker-compose.yml` тянет `nocodb/nocodb:latest`; `.github/workflows/bootstrap.yml` — одноразовый импорт с `contents: write`.
- **Как жить.** Не опираться на них в CI и runtime; чистка — отдельный issue.

### LW-023 — `knowledge:read` целиком
- **Что.** `npm run knowledge:read` отдаёт документ целиком, а KSP («Рабочий процесс агента разработки») требует полного чтения.
- **Как жить.** Искать `knowledge:query`, затем читать найденные разделы; целиком — только редактируемый документ.

### LW-024 — статус Runtime в описании PR
- **Что.** Runtime_Plan M0–M8 живёт только в Draft PR #98; сводный статус — в описании PR (Runtime_Plan §7.2), этап явно не указан.
- **Как жить.** Этап подтверждает владелец; см. `docs/work/CURRENT_SPRINT.md`.

### LW-025 — `.tmp.driveupload/`
- **Что.** Рабочую копию синхронизирует Google Drive; `.tmp.driveupload/` (~6,8 ГБ) — его временная папка.
- **Как жить.** Папка в `.gitignore`; не трогать и не удалять из агента. Лучше исключить репозиторий из синхронизации.
