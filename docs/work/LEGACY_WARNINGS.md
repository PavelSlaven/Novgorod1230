# Legacy warnings

> Реестр известных костылей и legacy-ловушек. Рабочий файл, норм не создаёт: при конфликте действует AGENTS.md, CONTRACT_INDEX и профильные контракты. Проверено: 2026-09-25, commit 21bd0938 (main); записи с пометкой «ветка PR #98» сверены с ca704b65.

## Как пользоваться

1. **До правки** найди записи по затрагиваемым путям: `rg -n "<путь или имя файла>" docs/work/LEGACY_WARNINGS.md`.
2. **С известным костылём живи** по колонке «Как жить»: без попутного рефакторинга и без «заодно почищу».
3. **Если костыль блокирует задачу** — заведи issue по форме `tech_debt` (`.github/ISSUE_TEMPLATE/tech_debt.yml`) и остановись на решении владельца.
4. **Новый костыль** — новая запись со следующим номером; строка в CHANGELOG `## Unreleased` с отметкой `LW-### added`. Закрытие — удалить запись в PR, который устранил причину, и отметить `LW-### closed`.

Статусов здесь нет: запись существует, пока проблема есть. Каждой записи со временем ставится ссылка на issue.

## Индекс

| LW | Пути | Суть | Issue |
|---|---|---|---|
| 001 | `src/` | корневой legacy runtime вне workspaces | [#127](https://github.com/PavelSlaven/Novgorod1230/issues/127) |
| 002 | `test/` | корневые тесты рядом с тестами пакетов | [#127](https://github.com/PavelSlaven/Novgorod1230/issues/127) |
| 003 | `DOCUMENTS/`, `legacy/` | legacy-корпус и исходная система | [#127](https://github.com/PavelSlaven/Novgorod1230/issues/127) |
| 004 | `corpus/DOCUMENTS/weapons_and_armor.txt`, `world_regions.txt` | legacy_mirror: байты неизменны | — |
| 007 | `llm_documentation_navigation.md`, `development_rules.txt`, `map_g0_g4_workflow.txt` | ловушки в именах и статусах | [#112](https://github.com/PavelSlaven/Novgorod1230/issues/112) |
| 008 | `CONTRACT_INDEX.md`, `corpus-manifest.json`, шапки документов | три системы статусов | [#112](https://github.com/PavelSlaven/Novgorod1230/issues/112) |
| 010 | `docs/work/temporal-world-v4/`, `docs/implementation/`, `docs/migration/` | evidence-пути, которые читают tools и тесты | — |
| 011 | файлы с закреплённым digest | байты закреплены хешами | — |
| 012 | `tools/spatial-v3/*`, `tools/docs-tools/test/*` | закрепления фраз в документах | [#126](https://github.com/PavelSlaven/Novgorod1230/issues/126) |
| 014 | `generated/generated-manifest.json` | `input_digest` меняется от любой зарегистрированной правки | — |
| 016 | `DOCUMENTS/`, `spatial_architecture_standard_g0_g6.md`, `docs/implementation/` | упоминания Graphify и `.github/AGENTS.md` | [#114](https://github.com/PavelSlaven/Novgorod1230/issues/114) |
| 018 | `**/MODULE.md` | разнобой формата MODULE.md | [#121](https://github.com/PavelSlaven/Novgorod1230/issues/121) |
| 020 | `tools/local-play/`, `packages/llm-runtime/src/provider-config.js` | LLM по умолчанию | — |
| 024 | PR #98 | статус Runtime живёт в описании PR | — |
| 025 | `.tmp.driveupload/` | синхронизация Google Drive в рабочей копии | — |
| 026 | `apps/game-server/src/runtime/lower-dvina-trace-*` | сценарный стек — фактически общий runtime v17 | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 027 | `lower-dvina-trace-turn-step-operation-choices.js` | закрытый список операций планировщика | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 028 | `ordinary-materialization-presence.js`, `context-bound-ordinary-policy.js` | классовый блок оружия, денег и документов | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 029 | `target-runtime-profiles.js` | ordinary-профили v17 выключены | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 030 | `lower-dvina-trace-turn-step-current-scene.js` | typed gap показывается как «ничего не нашли» | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 031 | `lower-dvina-trace-expansion-commands.js`, `spatial-v3-local-scene-movement.js` | непрозрачные ошибки расширения, тихие фильтры | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 032 | `apps/game-server/src`, `bootstrap-live-world-v17.mjs` | digest-пины в runtime | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 033 | `load-spatial-v3-bindings.js`, `production-spatial-v3.js` | два пути composition: v16 и v17 | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 034 | `lower-dvina-trace-visible-scene-items.js`, `lower-dvina-trace-conversation-llm.js` | код пишет прозу и реплики NPC | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 035 | `scripts/bootstrap-live-world-v17.mjs` | bootstrap v17 без календаря | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 036 | `scripts/*.test.mjs`, `test/spatial-v3/` | тесты M2c вне гейта, заглушки планировщика | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 037 | `data/world-catalogs/novgorod/` | утверждения данных разбросаны | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 038 | `tools/world-catalog-workflow/` | tool импортируется runtime | — |
| 039 | `universal_category_classification_policy.md` и ещё 3 | обрезанные документы корпуса | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 040 | `infra/world-base/README.md` | README пишет 201 таблиц при 208 в схеме | [#145](https://github.com/PavelSlaven/Novgorod1230/issues/145) |
| 041 | `first-playable-party-migration.test.js` | тест ожидает 35 миграций при 36 | [#145](https://github.com/PavelSlaven/Novgorod1230/issues/145) |

## Записи

### LW-001 — корневой `src/`
- **Что.** `src/` (env, ui-server, ui, world) — вторая копия до-модульного runtime вне npm workspaces (`apps/* packages/* tools/*`), отличающаяся от `legacy/src`. Читатели (на 21bd0938): корневые `test/*.test.js`, `test/party-turn-test-helpers.js`, `test/fixtures/new-game-pipeline-stage{3..7}.js`, gate-тест `test/modules/party-runtime-preflight-v2.test.js` (`src/world/new-game-prerequisites.js`) и операторские `scripts/*.js` (`src/env.js`; из `package.json` — `seed-world-base`, `seed-party-db`, `run-world-base-importer`, `import-novgorod-regional-templates` и др.). По сравнению с `legacy/src` 45 файлов различаются и 45 есть только в `src/` (40 из них — `*.test.js`); в `src/` лежит более старая полная версия стадий new-game. Production не импортирует ни `src/`, ни `legacy/src` (см. LW-003). `prompts/` читает только `src/world/corpus-loader.js`.
- **Как жить.** Новый код туда не класть; владельцы — пакеты из `MODULE_INDEX.md`. Правка `src/` — только если задача прямо про него: первая полная реализация стадии, найденная поиском, часто лежит здесь и мертва. Удаление — после переноса читателей выше.
- **Issue.** [#127](https://github.com/PavelSlaven/Novgorod1230/issues/127)

### LW-002 — корневые тесты `test/`
- **Что.** `test/` (acceptance, cutover, spatial-v3, integration, отдельные `*.test.js`) живёт рядом с тестами пакетов. Корневые `test/*.test.js` (большинство импортирует `src/`) не запускает ни один `test:*` скрипт; подкаталоги запускаются выборочно (например `test/spatial-v3/p04-catalog-sync.test.js` в `test:tools`). Никогда не запускаются 40 `src/world/new-game-pipeline/*.test.js`; 33 `legacy/test/*.test.js` запускаются только вручную `npm run test:legacy`, вне `npm test`.
- **Как жить.** Тест для пакета класть в `<пакет>/test/`; раскладку см. `docs/context/TESTING.md`. Незапускаемые тесты не считать спецификацией и не «чинить».
- **Issue.** [#127](https://github.com/PavelSlaven/Novgorod1230/issues/127)

### LW-003 — `DOCUMENTS/` и `legacy/`
- **Что.** `DOCUMENTS/documents-kg/` и `legacy/` — исходная система и её корпус; `legacy/DOCUMENTS/documents-kg/corpus/DOCUMENTS/` — зеркало для `canonicalized_from_legacy`. Production не достигает `legacy/src`: `packages/new-game/src/legacy-adapter.js` импортируют только `stages/stage-{3..7}-*/compat.js`, а эти subpath-экспорты не импортирует ни один модуль `apps/` и `packages/`; legacy runtime заблокирован (`apps/game-server/src/config.js`, «Legacy runtime is not selectable»). Их используют немодульный pipeline, тесты и `legacy/src`. Корневой `DOCUMENTS/` читают через `process.cwd()` `legacy/src/world/{corpus-loader,region-catalog}.js` и `turn-runtime/runbook.js`, gate-тест `test/modules/stage23-security.test.js` (31 файл `new_game_start/*` лежит только здесь), `src/world/corpus-loader.js` и `scripts/generate-schema-reference.js`. Три дерева корпуса носят одинаковые имена файлов: у 19 из 44 документов нормативного корпуса есть расходящиеся одноимённые копии в `DOCUMENTS/` и `legacy/DOCUMENTS/` (всего 37 файлов).
- **Как жить.** Нормы читать только из `data/knowledge-source/corpus/DOCUMENTS/`; найденная поиском одноимённая копия в `DOCUMENTS/` или `legacy/DOCUMENTS/` — не норма. Поведение production не чинить в `legacy/src`.
- **Issue.** [#127](https://github.com/PavelSlaven/Novgorod1230/issues/127)

### LW-004 — legacy_mirror
- **Что.** 2 документа корпуса с `provenance_mode: legacy_mirror` (`weapons_and_armor.txt`, `world_regions.txt`) и файлы с `-whitespace` в `.gitattributes` байтово неизменны.
- **Как жить.** Не править, не нормализовать переводы строк и пробелы.

### LW-007 — ловушки в именах и статусах
- **Что.** `llm_documentation_navigation.md` — SUPERSEDED redirect; `development_rules.txt` — REFERENCE; `map_g0_g4_workflow.txt` и `read_only_database_and_graph_architecture.md` — MIGRATION / ROLLBACK, хотя имена выглядят как основные. Обратная ловушка: `spatial_v3_target_*` — ACTIVE, несмотря на «target» в имени (CONTRACT_INDEX, таблица исключений).
- **Как жить.** Статус брать только из `CONTRACT_INDEX.md`, не из имени файла.
- **Issue.** [#112](https://github.com/PavelSlaven/Novgorod1230/issues/112)

### LW-008 — три системы статусов
- **Что.** Метки CONTRACT_INDEX §2, поле `status` (`active/proposed/deprecated`) записей `data/knowledge-source/corpus-manifest.json` (фильтр RAG — `default_statuses` в `retrieval-policy.json`) и строки «Status:» в шапках документов корпуса и ADR.
- **Ловушки.** (1) `corpus-manifest.json` даёт `active` 14 UNDECLARED-гайдам, 3 redirect-заглушкам и 5 REFERENCE-документам, поэтому `npm run knowledge:query` по умолчанию показывает их как действующие и может ставить выше ACTIVE-контрактов. (2) Обратное: `universal_category_classification_policy.md` и `semantic_world_actions_materialization_and_processes_contract.md` — PROPOSED, хотя их механизмы работают в коде; запрос по умолчанию их не видит. (3) ACTIVE-документы называют себя «целевыми», версии вида `4.4.0-target.1` — идентификаторы, а не статус.
- **Как жить.** Нормативный статус — только CONTRACT_INDEX; retrieval-статус влияет только на выдачу RAG. Для proposed-документов — `npm run knowledge:query -- --statuses active,proposed --query "…"`, затем чтение исходника.
- **Issue.** [#112](https://github.com/PavelSlaven/Novgorod1230/issues/112)

### LW-010 — evidence, которое читают tools
- **Что.** `docs/work/temporal-world-v4/`, `docs/implementation/*`, `docs/migration/*` читаются тестами и скриптами (`test/spatial-v3/*`, `tools/spatial-v3/check-production-activation-boundary.mjs`, `generate-temporal-normative-freeze.mjs`, `scripts/*pr17*`, `packages/knowledge-source/test/rag-policy-repository.test.js`).
- **Как жить.** Не переносить и не переименовывать эти файлы без правки читателей; перед переносом — `git grep` по пути.

### LW-011 — байты, закреплённые digest
- **Что.** Часть файлов закреплена sha256 в manifests, freeze-файлах и цепочках миграций (например `SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST`).
- **Как жить.** Перед правкой: `git grep` по имени файла в `tools/`, `test/`, `*.json`; существующие миграции не править.

### LW-012 — закрепления фраз
- **Что.** Проверки ищут точные фразы в документах (`tools/docs-tools/test/documentation-generation.test.js`, `tools/spatial-v3/check-*.mjs`, токены ADR-001 в `check-p25.mjs`, точный термин «versioned production activation cutover» в `check-production-activation-boundary.mjs`; sha256-пины ADR-001 и 17 документов корпуса — `docs/migration/spatial-v3/normative-freeze.json` и `data/contracts/spatial-v3/p05-reviewed-baseline.json`). На Windows `tar` теперь явно вызывается как System32 bsdtar (#126). `data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1` закрепляет sha256 `spatial_architecture_standard_g0_g6.md` на версии до `d3c442e9`; скрипты `spatial-v3:test-p12*` зелёные и файлы не меняют, но `test/spatial-v3/p12-dependency-closure-data.test.js` (только в `spatial-v3:red`) проходит, перегенерируя 7 отслеживаемых файлов этого пакета (после прогона — `git restore -- <каталог пакета>`). Перегенерация — изменение утверждённого data-пакета (утверждение старшей моделью). Вне merge gate на 21bd0938 падает `spatial-v3:check-p02` («architecture: active owner does not route to its target supplement»).
- **Как жить.** Перед правкой текста — `rg` фразы по `tools/` и `test/`. Для non-gate проверок сравнивать с этим baseline.
- **Issue.** [#126](https://github.com/PavelSlaven/Novgorod1230/issues/126)

### LW-014 — `input_digest`
- **Что.** `generated/generated-manifest.json` содержит `input_digest` по путям из `docs/migration/CANONICAL_PATHS.json`, всем `MODULE.md` и `package.json` в apps/packages/tools, `schemas/**` и файлам с экспортом `*SCHEMA` (`collectGeneratorInputs` в `tools/docs-tools/src/documentation.js`); любая их правка требует `docs:generate`, иначе падает `docs:check`, и даёт механический конфликт в параллельных ветках.
- **Как жить.** Часто меняемые документы в CANONICAL_PATHS не регистрировать; при конфликте — `npm run docs:generate`, не ручное слияние.

### LW-016 — Graphify и `.github/AGENTS.md`
- **Что.** Graphify и repo-intel удалены, `.github/AGENTS.md` не существует, но упоминания остались в `DOCUMENTS/`, `MapMaker/scripts/compile-novgorod.mjs`, `spatial_architecture_standard_g0_g6.md` и `docs/implementation/*/README.md`. Сам вывод Graphify (~154 МБ в `DOCUMENTS/**/graphify-out/` и `legacy/DOCUMENTS/**/graphify-out/`) по-прежнему в git и засоряет `rg`, CBM и индексацию редакторов.
- **Как жить.** Не восстанавливать и не следовать этим инструкциям; навигация — codebase-memory-mcp и `rg`.
- **Issue.** [#114](https://github.com/PavelSlaven/Novgorod1230/issues/114)

### LW-018 — разнобой MODULE.md
- **Что.** MODULE.md пакетов различаются по структуре и объёму: от ~30 строк (`packages/contracts`) до 525 (`packages/turn`) и 679 (`apps/game-server`), где ответственность перемешана с историей target/activation; на ветке PR #98 — 540 и 904 строки, а `MODULE_INDEX.md` берёт назначение game-server из абзаца про NPC first-entry.
- **Как жить.** Брать из MODULE.md ответственность и public contract; журнал не считать контрактом.
- **Issue.** [#121](https://github.com/PavelSlaven/Novgorod1230/issues/121)

### LW-020 — LLM по умолчанию
- **Что.** Три разных «default»: role defaults уровня окружения в `packages/llm-runtime/src/provider-config.js` (`deepseek-v4-flash`); gameplay-default `play:local` на main — managed Gemma (`tools/local-play/*`); на ветке PR #98 gameplay идёт через qwen (`apps/game-server/src/runtime/llm-settings.js`, vLLM endpoint пользователя), а `provider-config.js` не менялся. На ветке PR #98 промпты и бюджеты надо рассчитывать на qwen ~27B, а не на DeepSeek.
- **Как жить.** В документах ссылаться на владельца, не на значение.

### LW-024 — статус Runtime в описании PR
- **Что.** Runtime_Plan M0–M8 живёт только в Draft PR #98; сводный статус — в описании PR (Runtime_Plan §7.2). Текущий этап — M2c, перезапущенный 2026-09-25 с проектирования; решения владельца — в [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133).
- **Как жить.** Этап подтверждает владелец; см. `docs/work/CURRENT_SPRINT.md`.

### LW-025 — `.tmp.driveupload/`
- **Что.** Рабочую копию синхронизирует Google Drive; `.tmp.driveupload/` (~6,8 ГБ) — его временная папка.
- **Как жить.** Папка в `.gitignore`; не трогать и не удалять из агента. Лучше исключить репозиторий из синхронизации.

### LW-026 — `lower-dvina-trace-*` — фактически общий runtime v17 (ветка PR #98)
- **Что.** Ход v17, NPC-модели и видимая сцена идут через модули `apps/game-server/src/runtime/lower-dvina-trace-*` (238 из 274 файлов верхнего уровня `runtime/`, ~83 тыс. строк не-тестового кода в `apps/` и `packages/`). Обобщённый провижининг контейнеров `apps/game-server/src/infrastructure/postgres/ordinary-container-first-entry-provisioning.js` принимает только `profile_id` `lower_dvina_trace_o2b_existing_container_profile_v2`. В `runtime/releases/` лежат 16 привязок `spatial-v3-production-v{2..17}`, загрузчик принимает только v16 и v17.
- **Как жить.** Префикс не означает «только сценарий». Сценарные ветки, id и ревизии в эти модули не добавлять; новое общее поведение — к владельцу в `packages/`. Вынос общего кода — отдельная задача после пересборки v17.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-027 — закрытый список операций планировщика (ветка PR #98)
- **Что.** `apps/game-server/src/runtime/lower-dvina-trace-turn-step-operation-choices.js` даёт планировщику только `request.available_domain_operations` и `local_world_process.allowed`; инструкции планировщика требуют точную переданную операцию, иначе — reality-limited no-op. Это «парсер команд», который отвергают PC §4 и AI §28.9.
- **Как жить.** Не расширять список новыми авторскими вариантами под провал плейтеста. Открытый ввод для действий материализации — задача M2c.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-028 — классовый блок оружия, денег и документов (ветка PR #98)
- **Что.** `packages/turn/src/ordinary-materialization-presence.js` (набор RESTRICTED: `weapon_or_armament`, `currency_or_precious`, `document_like`, `specialized_or_valuable`, `other_restricted`) и `apps/game-server/src/runtime/context-bound-ordinary-policy.js` пропускают эти классы только при авторском scope-профиле, иначе `absent` или `authority_required`; eval-фикстуры Stage B закрепляют «меча нет». Решение владельца 2026-09-25: найти (малая вероятность) и изготовить (ресурсы, инструмент, навык) можно; typed gap — только уникальные и квестовые вещи.
- **Как жить.** Блок новыми тестами не закреплять; снятие — через CR норм M2c.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-029 — ordinary-профили v17 выключены (ветка PR #98)
- **Что.** `apps/game-server/src/internal/target-runtime-profiles.js` задаёт `null` для `ordinaryMaterializationProfile` (O1 и O2a ambient), `ordinaryContainerContentsProfile` (O2b), `localFireProfile` (F1) и `ordinary_profiles.s1` (S1). У v17 есть только отдельный профиль конечных природных источников при первом входе (`finite_first_entry`). `items_and_property.txt` и `code_driven_world_materialization_architecture.md` описывают эти профили как active: они действуют только на пути v16 / Lower Dvina Trace.
- **Как жить.** Не «подключать существующий профиль» к v17 и не подгонять тесты под фикстуры v16. Обобщение профилей на все классы — M2c.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-030 — typed gap показывается как «ничего не нашли» (ветка PR #98)
- **Что.** `apps/game-server/src/runtime/lower-dvina-trace-turn-step-current-scene.js` выводит `authority_required` и отсутствие профиля так же, как законный пустой поиск. AI §10.1 запрещает выдавать дефект реализации как отсутствие вещи в мире.
- **Как жить.** Не писать тесты, закрепляющие такой вывод; по тексту плейтеста дефект не отличить от исхода мира, смотреть диагностику хода.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-031 — непрозрачные ошибки расширения и тихие фильтры (ветка PR #98)
- **Что.** `apps/game-server/src/runtime/lower-dvina-trace-expansion-commands.js` сводит около 20 причин к одному `LIVE_WORLD_EXPANSION_PREPARATION_FAILED`; `apps/game-server/src/infrastructure/postgres/spatial-v3-local-scene-movement.js` молча отбрасывает локальное ребро при заполненной вместимости, и UI показывает выход, который планировщик не может выбрать.
- **Как жить.** При отладке смотреть `diagnostics` в `spatial-v3-generated-expansion-adapter.js`. Исправление — типизированная причина и ребро со статусом «занято», а не новый частный обход.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-032 — digest-пины в runtime (ветка PR #98)
- **Что.** В `apps/game-server/src` около 359 литералов sha256 в 50 файлах; bootstrap v17 и его тест сверяют digest производных записей и перепинивались под новый вывод (`scripts/bootstrap-live-world-v17.mjs`, `test/integration/bootstrap-live-world-v17-postgres.test.js`). AI §17 запрещает новую integrity-машинерию без названного атакующего.
- **Как жить.** Новых пинов не добавлять. Перепин — не исправление: допустим только вместе с утверждённым изменением данных (WR §24.2).
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-033 — два пути composition: v16 и v17 (ветка PR #98)
- **Что.** По умолчанию сервер берёт `builtin:spatial-v3-production-v16` (`apps/game-server/src/runtime/load-spatial-v3-bindings.js`); v17 включается через `RUS_SPATIAL_V3_BINDINGS_MODULE`. `play:local` выбирает v17, если существуют обе БД v17; если нет ни одной — молча v16; если есть только одна — ошибка `LOCAL_POSTGRES_V17_PAIR_INCOMPLETE`. `production-spatial-v3.js` ветвится между путями около 17 раз. Решение владельца 2026-09-25: v17 по умолчанию при пересборке, v16 и привязки v2–v15 удалить после приёмки M2c.
- **Как жить.** Путь v16 не развивать; если тест v16 зелёный, а v17 падает, чинить v17.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-034 — код пишет прозу и реплики NPC (ветка PR #98)
- **Что.** `lower-dvina-trace-visible-scene-items.js` и `lower-dvina-trace-turn-step-current-scene.js` собирают русские фразы для игрока из шаблонов; при сбое grounding `lower-dvina-trace-conversation-llm.js` подставляет реплику NPC, собранную кодом, и она коммитится как речь NPC.
- **Как жить.** Новых шаблонных фраз не добавлять. Код отдаёт структурные факты, прозу пишет рассказчик, речь NPC — модель NPC или типизированный отказ.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-035 — bootstrap v17 без календаря (ветка PR #98)
- **Что.** Старт v17 читает `world_base.temporal_authoring_records` (`apps/game-server/src/infrastructure/postgres/target-authored-start-runtime.js`), а `scripts/bootstrap-live-world-v17.mjs` не импортирует temporal-v4. Тесты старта читают JSON-фикстуру напрямую и остаются зелёными.
- **Как жить.** При пересборке пары v17 добавить импорт утверждённых temporal-v4 и readback календаря старта; хотя бы один тест старта должен читать календарь через БД.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-036 — тесты M2c вне гейта и заглушки планировщика (ветка PR #98)
- **Что.** `scripts/*.test.mjs`, `data/**/*.test.mjs` и часть `test/spatial-v3` не входят ни в один `test:*`. Гейтовая приёмка старта использует заготовленный planner, который сам выбирает операцию. Около 80 `skip` срабатывают без PostgreSQL или Docker, и прогон остаётся зелёным.
- **Как жить.** Зелёный `npm test` не доказывает M2c. Для приёмки нужны тесты через production composition на записанных ответах модели; число пропусков — в отчёте (WR §24.2).
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-037 — утверждения данных разбросаны (ветка PR #98)
- **Что.** Около 94 файлов approval/attest без индекса; у многих кандидатов в поле стоит `approved:false` или `pending`, хотя их точный sha утверждён в отдельном файле. `data/world-catalogs/novgorod/m2c-natural/nature-successor-*` изменены после утверждения и сверяются через `git show ae212e78`.
- **Как жить.** Статус кандидата брать из файлов утверждения, а не из поля кандидата. Производные поля в утверждённый файл не дописывать (WR §21.1).
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-038 — `tools/world-catalog-workflow` в runtime
- **Что.** Стадии 7, 8, 13 и 16 `packages/new-game` импортируют `tools/world-catalog-workflow`, хотя `docs/architecture/DEPENDENCY_RULES.md` утверждает, что production runtime не импортирует tools; `check-boundaries.mjs` это не проверяет. `docs/context/ARCHITECTURE.md` и `TOOLS_INVENTORY` фиксируют исключение LW-038; расхождение остаётся с DEPENDENCY_RULES.
- **Как жить.** Правка этого tool меняет new-game: кандидаты NPC и предметов, шаблоны G5, упаковку снаряжения. Гонять `test:domain` и профильные тесты стадий 7, 8, 13, 16.

### LW-039 — обрезанные документы корпуса
- **Что.** 4 документа нормативного корпуса содержат буквальный маркер «…tokens truncated…»: в `universal_category_classification_policy.md` потеряны разделы 10–11.4 (ландшафт, вода, землепользование, животные); в `formulas.md`, `base_turn_orchestration.txt` и `movement_locations_regions.txt` повреждены архивные приложения v2. Целая копия политики — `data/knowledge-source/imports/universal-category-classification-2026-07-15/`.
- **Как жить.** До восстановления разделы 10–11.4 политики читать из импорта только как справку: не как норму и не как вход materializer. Восстановление — CR норм M2c через CORPUS_EDIT.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-040 — README world_base пишет 201 таблиц (ветка PR #98)
- **Что.** `infra/world-base/README.md` всё ещё говорит «201 таблиц»; фактические `EXPECTED_TABLE_COUNT`, CI `table_count` и `SCHEMA_REFERENCE` — **208** (`01.sql`–`26.sql`).
- **Как жить.** Счёт брать из `scripts/check-world-base-schema.mjs` / DB_SCHEMA / CI, не из README. Правка README — вместе с docs-sync схемы.
- **Issue.** [#145](https://github.com/PavelSlaven/Novgorod1230/issues/145)

### LW-041 — стейл-тест длины миграций party (ветка PR #98)
- **Что.** `test/spatial-v3/first-playable-party-migration.test.js` ожидает `SPATIAL_V3_TARGET_MIGRATIONS.length === 35`, тогда как манифест и диск — **36** (до `036_party_runtime_visibility_modifiers.sql`).
- **Как жить.** Не чинить в docs-задаче карт; починить в CR реализации M2c вместе с обновлением ожидания теста.
- **Issue.** [#145](https://github.com/PavelSlaven/Novgorod1230/issues/145)
