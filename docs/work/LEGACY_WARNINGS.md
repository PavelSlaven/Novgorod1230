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
| 042 | `code_driven_world_materialization_architecture.md`, `items_and_property.txt`, `turn_step_llm_contract.md` (+ гайд `npc_generation_profiles.txt`) | ACTIVE-нормы main против PC §9.1 до #146 | [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146) |
| 043 | `scripts/m2c-capacity-successor.mjs`, `spatial_architecture_standard_g0_g6.md` | pin sha spatial_architecture после шага 3 #146 | [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146) |
| 044 | `temporal_world…`, CONTRACT_INDEX v17 note | погода D7: next-state в turn + inertia profile | [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146) |
| 045 | `turn_step`/`items`/`npc` D9/D14 + финальные числа | D9/D14 и финальные числа от кода — долг кода v17 | [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146) |
| 046 | `packages/world-knowledge` Core resolve | `lexical_ms` внутри Core без return-канала | [#152](https://github.com/PavelSlaven/Novgorod1230/issues/152) |
| 047 | default-query / `resolveTurnStepWorldKnowledge` | SUFFICIENT = лексика, не относимость; калибровка #153 | [#152](https://github.com/PavelSlaven/Novgorod1230/issues/152) → [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153) |
| 048 | `npc-safe-request-projector` / `state.historical_context` | norms/customs пусты в v17 — отсутствие данных | [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153) |
| 049 | `frozen-role-requests` / `turn-step-generic-owners` / `temporal-world-v1` | pre-#152 app/domain fails вне WK diff | [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153) |
| 050 | NPC `knowledge_snapshot` / memory/rumors | actor-visible knowledge — `@rus/visibility-knowledge-memory` / npc-runtime, не #154 WK | [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153) |
| 051 | `authored-opening-narration` | opening narration без WK вовсе — owner рассказчика | [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153) |
| 052 | turn-step `player_utterance` / `intent_paraphrase` | WK может впитаться в речь — вне Part B guard | [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153) |
| 053 | `bge-reranker-v2-m3` / D17 wiring | D21 гейт не пройден — production rerank OFF | [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153) |
| 054 | `wk-sufficiency:giga-cosine:v1` | `sufficient_enabled=false`; per-hint relevance pending | [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153) |
| 055 | `activation-amendment` / `item-compatibility-request` | pin sha restart-теста в утверждаемом запросе; item-compat ещё на старом sha | — |
| 060 | `world-knowledge/production-v2` claims `domain_internal_only` | знание эпохи скрыто из-за формулировки (служебные обороты, историография, наука) — нужна переписка языком 1230 года и повторное утверждение | [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154) |
| 061 | `audits/production-v2/step4-*-coverage.json`, `category-cartography.json` | пробелы аудита WK не закрыты: 37 must отклонены на утверждении, 22 без источника; `missing_families` (шаг 4.8) не делались | [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154) |
| 062 | WK `applicability.conditions.started_historical_events`, история событий | события с датой внутри года — только через условие события; события `novgorod_famine_1230` (фазы), `novgorod_upheaval_december_1230` и поздние события голода должны быть заведены при импорте истории; компилятор не проверяет существование event id | [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154) |
| 063 | `knowledge_access` `role_bound` | роли NPC v17 покрывают малую часть `role_bound`; `nov_role_craftsman_master` покрывает все ремёсла — перевести в `occupation_bound`, когда запросы NPC понесут `occupation_ref` | [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154) |
| 064 | `search_aliases` production-v2, `benchmarks/retrieval-v1.json` | промахи поиска аудита закрыты 3/91 (синонимы отклонены на утверждении); лексический hard-constraint кейс судной грамоты вне top-10 | [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154) |
| 065 | `applicability.time` production-v2 | 65 claims с диапазоном 500+ лет не сужены (источники точнее не дают) | [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154) |
| 066 | `spatial_node_place_family_bindings`, presence/routines/water/slots | до утверждения `pf_secondary` — только primary | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 067 | `presence_rules.guards` | guards хранятся, не исполняются | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 068 | `presence_rules` discovery weights; Stage 16 `no_source` | пустые веса = 1/1; пробел Stage 16 не закрывать выдумкой | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 072 | `tools/local-play/local-play.js`, acceptance `local-play-postgres` | `LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE` / `startLlm` в acceptance — см. запись | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 073 | acceptance `revision 35 survives production restart` | лимит test1 450s — headroom от базы ~266s (`162a86b9`) | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 074 | `lower-dvina-trace-phase-2.js` (`liveWorldTurnBundle`), `lower-dvina-trace-post-applied-actor-step.js` | восприятие NPC вне разговора в live world выключено (`post_action_perception_profile: null`) — подключение в M4 | — |
| 075 | `spatial-v3-current-visibility-provider.js`, `spatial-v3-proposed-visible-sources.js` | runtime читает `m2c-local-edge-labels`/`m2c-exit-labels`/`m2c-pass-target-labels` файлами напрямую, мимо `world_base` | [#160](https://github.com/PavelSlaven/Novgorod1230/issues/160) |
| 076 | `tools/spatial-v3/p12-authoring-importer.mjs`, `m2c-npc-wave-bundle-validation.mjs`, `infra/world-base/schema/28.sql`, `packages/runtime-catalog/src/m2c-npc-wave-readers.js` | m2c-npc-wave: readback обязателен; D-1/D-2 в 28.sql; activate отдельно (D27) | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 077 | `packages/materialization/src/presence-rules-first-arrival.js`, `packages/runtime-catalog/src/m2c-npc-wave-readers.js`, PG-тесты presence | R-2a presence consumer: discovery weights, subcategory, subregion, legacy region id в данных | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 078 | `lower-dvina-trace-public-start.js`, `lower-dvina-trace-phase-1b.js` (`provisionInitialOrdinary`) | стартовый presence-provisioning — отдельная транзакция после commit new_game; при сбое между ними стартовое место остаётся без решённого присутствия, повтора при загрузке нет | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 079 | narration-конвейер (`gameplay_narrator*`) | двойной отказ narration-аудита после committed-хода оставляет игрока без прозы (owner #158 R-3) | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 080 | `lower-dvina-trace-phase-2-services.js` (`turnStepBlockPlan`), `spatial-v3-expansion-runtime.js` | отказ по занятости только на шаге 1; путь подхода после первого шага — по сырым рёбрам без видимости | [#185](https://github.com/PavelSlaven/Novgorod1230/issues/185) |
| 081 | `packages/llm-runtime/src/combat-role-defaults.js` (`combat_weapon_classification`) | `expectedSchema` и `json_object_with_schema` описывают старый выход роли; рантайм их не проверяет | [#188](https://github.com/PavelSlaven/Novgorod1230/issues/188) |
| 082 | `llm-turn-budget.js`, `lower-dvina-trace-phase-2-presentation-resolve.js`, `apps/game-web/src/api/client.js` | худший submitTurn до ~360 с при клиенте без fetch-timeout | — |
| 083 | `lower-dvina-trace-phase-2-presentation-replay.js`, `packages/turn/src/stages/narration.js` (`spatialResult`) | replay-подача рассказчику без исходов проверок и оценки: `check_outcomes`/`qualitative_assessment` есть на первом проходе, нет на повторе (owner #158 R-3) | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 092 | `test/spatial-v3/generated-expansion-adapter.test.js` (`terminal=1`), `test/spatial-v3/m2c-expansion-import-postgres.test.js` | два теста красные и на базе d9bb04e9: устаревшие ожидания (first_entry терминала; capacity-one после open-capacity v2) | — |
| 093 | `data/world-catalogs/novgorod/m2c-local-edge-labels/candidate.json`, `m2c-canonical-connection-labels/candidate.json` | подписи проходов «Проход N» не несут направления: «назад/дальше» планировщик путает | — |

### Сводка LW-069…073 (CR #158 M2c)

| LW | Суть | Блокер релиза? |
|---|---|---|
| 069 | fresh-schema attestation v2 историчен; действует только attestation с `request_digest` текущего `fresh-schema-request.json` | D27 до v3 от ревьюера |
| 070 | party restart skip по chain ledger; полный DDL только без строки digest | game-server prod party DB |
| 071 | «предок решён — потомки не бросаются» — owner R-2, не foundation | R-2 |
| 072 | git provenance worktree + acceptance `startLlm` | нет |
| 073 | acceptance revision 35 timeout 300s | нет |

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
- **Что.** Метки CONTRACT_INDEX §2, поле `status` / `priority_tier` записей `data/knowledge-source/corpus-manifest.json` (фильтр RAG — `default_statuses` только в `retrieval-policy.json`; `priority_tier` для ранжирования — только из manifest; оба пишет `knowledge:repin` из CONTRACT_INDEX, #144) и строки «Status:» в шапках документов корпуса и ADR. Retrieval-статусы: `active`, `proposed`, `reference`, `deprecated`.
- **Ловушки.** (1) Шапки документов и ADR по-прежнему могут расходиться с индексом — статус для RAG брать из manifest после repin, нормативную роль — только из CONTRACT_INDEX. (2) `universal_category_classification_policy.md` с #146 / PR #98 — `ACTIVE` (видна в default `results`); `semantic_world_actions_…` остаётся `PROPOSED` и по умолчанию не видна. (3) ACTIVE-документы называют себя «целевыми», версии вида `4.4.0-target.1` — идентификаторы, а не статус. (4) UNDECLARED / REFERENCE guide → `reference` (в `reference_results` по умолчанию); REFERENCE/LEGACY, REDIRECT, SUPERSEDED, MIGRATION → `deprecated` (не в default search).
- **Как жить.** Нормативный статус — только CONTRACT_INDEX; `knowledge:repin` выводит retrieval-статус и priority_tier в manifest и канонический `default_statuses`; `knowledge:check` ловит расхождение с индексом, неизвестную метку, дубли строк с разными метками, ручную правку `priority_tier`/`default_statuses` в policy и отсутствие строки индекса. Поиск корпуса лексический: нормы в `results`, справочники в `reference_results`. Для proposed — `npm run knowledge:query -- --statuses active,proposed --query "…"`, затем чтение исходника.
- **Issue.** [#112](https://github.com/PavelSlaven/Novgorod1230/issues/112), [#144](https://github.com/PavelSlaven/Novgorod1230/issues/144)

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
- **Что.** Нормы корпуса (#146 шаги 1–4) закрыли классовый запрет: находка через presence, изготовление через A1; `authority_required` — только вещи по authority-записи. Код ещё держит блок: `packages/turn/src/ordinary-materialization-presence.js` (RESTRICTED: `weapon_or_armament`, `currency_or_precious`, `document_like`, …) и `apps/game-server/src/runtime/context-bound-ordinary-policy.js`; eval-фикстуры Stage B закрепляют «меча нет».
- **Как жить.** Нормы на ветке закрыты. Блок новыми тестами не закреплять; снятие в коде — CR реализации M2c. При конфликте норма > код до cutover.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133), [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146)

### LW-029 — ordinary-профили v17 выключены (ветка PR #98)
- **Что.** Нормы (#146 шаги 1–4) описывают O1/O2b/S1/A1 как active. Код: `apps/game-server/src/internal/target-runtime-profiles.js` задаёт `null` для `ordinaryMaterializationProfile` (O1 и O2a ambient), `ordinaryContainerContentsProfile` (O2b), `localFireProfile` (F1) и `ordinary_profiles.s1` (S1). У v17 загружены только профиль конечных природных источников при первом входе (`finite_first_entry`), A1 (`actionProductionProfile`) и N1 (`ordinary_profiles.n1`); профили на пути v16 / Lower Dvina Trace.
- **Как жить.** Нормы на ветке закрыты. Не «подключать существующий профиль» к v17 и не подгонять тесты под фикстуры v16. Обобщение профилей на все классы — CR реализации M2c.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133), [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146)

### LW-030 — typed gap показывается как «ничего не нашли» (ветка PR #98)
- **Что.** `apps/game-server/src/runtime/lower-dvina-trace-turn-step-current-scene.js` выводит `authority_required` и отсутствие профиля так же, как законный пустой поиск. AI §10.1 запрещает выдавать дефект реализации как отсутствие вещи в мире.
- **Как жить.** Не писать тесты, закрепляющие такой вывод; по тексту плейтеста дефект не отличить от исхода мира, смотреть диагностику хода.
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

### LW-035 — bootstrap v17 без календаря (ветка PR #98) — **closed R-2a**
- **Что.** Старт v17 читает `world_base.temporal_authoring_records`; `bootstrap-live-world-v17.mjs` импортирует утверждённый temporal-v4 с readback (`collectApprovedTemporalBundle` / `buildApprovedTemporalImportSql`). PG presence-тесты с волной используют **тестовое обогащение** фикстуры (`withTestWaveEnrichment`, approved-копия draft m2c-npc-wave), не штатный bootstrap без D27.
- **Как жить.** Локальные пары v17 пересобирать после изменения temporal или wave; календарь старта — только из БД на свежем bootstrap.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-036 — тесты M2c вне гейта и заглушки планировщика (ветка PR #98)
- **Что.** `scripts/*.test.mjs`, `data/**/*.test.mjs` и часть `test/spatial-v3` не входят ни в один `test:*`. Гейтовая приёмка старта использует заготовленный planner, который сам выбирает операцию. Около 80 `skip` срабатывают без PostgreSQL или Docker, и прогон остаётся зелёным.
- **Как жить.** Зелёный `npm test` не доказывает M2c. Для приёмки нужны тесты через production composition на записанных ответах модели; число пропусков — в отчёте (WR §24.2).
- **M2c-B6 шаг 1 (0-LLM baseline) закрыт этой записью.** `test/spatial-v3/target-canonical-start-postgres-acceptance.js` (`assertTargetCanonicalStartPostgres`) — реальный v17 путь (`createSpatialV3ProductionCompositionRoot`, `builtin:spatial-v3-production-v17`, реальный PostgreSQL); R-2a F2 вызывает его из `tools/runtime-catalog-activation/test/target-v17-bootstrap-canonical-acceptance-postgres.test.js` (отдельный dual-DB контейнер), ранее также из `target-catalog-successor-postgres.test.js` и **уже был в гейте** через `test:tools` (`package.json:79`, глоб `tools/*/test/*.test.js`), только без измеренного счётчика: `generative_materialization_calls: 0` был литералом. CR #165 B6 шаг 1 заменил литерал реальным подсчётом ролей по всем ответам фикстуры-провайдера и добавил `assert.equal(materializationCalls.length, 0, …)` по каждому из 7 канонических стартов и их первому ходу («Осматриваюсь…») — тест теперь падает, если материализационная роль (`ordinary_materialization`, `spatial_semantic_descriptor`, `npc_ordinary_semantic_remainder[_auditor]`) реально вызвана, а не только когда меняется захардкоженный отчёт. Неизвестная (нераспознанная) роль в фикстуре тоже роняет тест с явным сообщением, а не тихо проваливает последний `assert.ok`.
- **Известный пробел (закрывает B6 шаг 3, плейтесты).** Этот гейтовый прогон проверяет только открытие всех 7 стартов и один ход «Осматриваюсь вокруг, оставаясь на месте.» (без перемещения) в каждой партии — то есть G0–G4 baseline и первый взгляд, но не первый вход в **generated G5** через переход («Проход N» / выход). Такой переход в этом файле не воспроизведён: комментарий в `test/spatial-v3/target-http-browser-smoke.js:152` описывает достижение generated G5 как ручной многошаговый UI-путь через реальный браузер, а известный баг движения (`TURN_STEP_PLAN_INVALID`/`domain_owner_unavailable`, зафиксирован в `docs/playtests/2026-09-25_m2c-v17-five-families-ui-blocked_56440.md`) — предмет отдельного блока B1 (#160), не этого шага. 0-LLM baseline для первого входа именно в generated G5 остаётся неизмеренным детерминированным тестом до playtests шага 3 этого CR.
- **Остаток LW-036.** Общий skip-count по ~80 пропускам вне `npm test`-гейта (`scripts/*.test.mjs`, `data/**/*.test.mjs`) этим шагом не закрыт — он в объёме блока B6 целиком (шаги 2–4), не шага 1.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133), [#165](https://github.com/PavelSlaven/Novgorod1230/issues/165)

### LW-037 — утверждения данных разбросаны (ветка PR #98)
- **Что.** Около 94 файлов approval/attest без индекса; у многих кандидатов в поле стоит `approved:false` или `pending`, хотя их точный sha утверждён в отдельном файле. `data/world-catalogs/novgorod/m2c-natural/nature-successor-*` изменены после утверждения и сверяются через `git show ae212e78`.
- **Как жить.** Статус кандидата брать из файлов утверждения, а не из поля кандидата. Производные поля в утверждённый файл не дописывать (WR §21.1). Данные, изменённые после утверждения (`nature-successor-*`), считаются неутверждёнными до нового прохода (WR §21.1).
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-038 — `tools/world-catalog-workflow` в runtime
- **Что.** Стадии 7, 8, 13 и 16 `packages/new-game` импортируют `tools/world-catalog-workflow`, хотя `docs/architecture/DEPENDENCY_RULES.md` утверждает, что production runtime не импортирует tools; `check-boundaries.mjs` это не проверяет. `docs/context/ARCHITECTURE.md` и `TOOLS_INVENTORY` фиксируют исключение LW-038; расхождение остаётся с DEPENDENCY_RULES.
- **Как жить.** Правка этого tool меняет new-game: кандидаты NPC и предметов, шаблоны G5, упаковку снаряжения. Гонять `test:domain` и профильные тесты стадий 7, 8, 13, 16.

### LW-039 — обрезанные документы корпуса
- **Что.** В `universal_category_classification_policy.md` разделы 10–11.4 восстановлены (#146 шаг 1). Архивные приложения v2 с маркерами «…tokens truncated…» вынесены из корпуса (#146 шаг 4) у `formulas.md`, `base_turn_orchestration.txt`, `movement_locations_regions.txt`, `world_generation_and_turns.txt`, `interface_ux.md`, `time_system.txt`. После #146 зеркала canonicalized-документов совпадают с корпусом; исходный legacy-текст v2 есть только в истории git (≤ `97644bae`). `source_basis` схемы party DB v1 (`infra/party-db/party_database_tables_v1.csv:10`, `party_database_validation_rules_v1.csv:4`, `schema/party_database_schema_v1.json:74, 5048`) и source map rus13 (`tools/rus13-start-g5-materialization/…source_map_v1.csv:3`, `tools/rus13-new-party-generator/…source_map_v1.csv:2-3`) ещё ссылаются на удалённые разделы v2. REFERENCE-документы (`interface_ux.md:8`, `time_system.txt:63`, `movement_locations_regions.txt:88`) ещё содержат устаревшее «active production остаётся materialization v2». `docs/work/temporal-world-v4/README.md:71` упоминает маркеры обрезки, которые уже сняты (исторический отчёт).
- **Как жить.** Нормы корпуса: закрыто на ветке PR #98. Политику категорий читать из корпуса (ACTIVE). Не восстанавливать архивные приложения v2 в корпус. Ссылки source_basis/source map и REFERENCE-фразы про v2 — исправить при чистке #127 или в CR реализации M2c; temporal README не править как исторический отчёт.
- **Issue.** [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146)

### LW-040 — README world_base пишет 201 таблиц (ветка PR #98)
- **Что.** `infra/world-base/README.md` всё ещё говорит «201 таблиц»; фактические `EXPECTED_TABLE_COUNT`, CI `table_count` и `SCHEMA_REFERENCE` — **208** (`01.sql`–`26.sql`).
- **Как жить.** Счёт брать из `scripts/check-world-base-schema.mjs` / DB_SCHEMA / CI, не из README. Правка README — вместе с docs-sync схемы.
- **Issue.** [#145](https://github.com/PavelSlaven/Novgorod1230/issues/145)

### LW-041 — стейл-тест длины миграций party (ветка PR #98)
- **Что.** `test/spatial-v3/first-playable-party-migration.test.js` ожидает `SPATIAL_V3_TARGET_MIGRATIONS.length === 35`, тогда как манифест и диск — **36** (до `036_party_runtime_visibility_modifiers.sql`).
- **Как жить.** Не чинить в docs-задаче карт; починить в CR реализации M2c вместе с обновлением ожидания теста.
- **Issue.** [#145](https://github.com/PavelSlaven/Novgorod1230/issues/145)

### LW-042 — ACTIVE-нормы main против PC §9.1 до CR норм M2c
- **Что.** На ветке PR #98 шаги 1–3 #146 закрыли расхождение норм с PC §9.1 / D1–D10 / D14 (presence §3A, O1/O2b, классовый запрет, D-005/D8, опознавательный текст, промпты→схема+владелец кода, погода D7). Классовый запрет в §20 `turn_step` / §25 `npc_autonomous` на ветке снят шагом 3. На main до merge #98 ACTIVE-корпус ещё старый: D-005, `items_and_property.txt:10`, гайд `npc_generation_profiles.txt:7`, старые «канонические промпты». `knowledge:query` на main выдаёт старые формулировки.
- **Как жить.** При конфликте — PC §9.1 и #133; на ветке #98 — корпус после шагов #146. Старые формулировки main не закреплять новыми тестами. Запись держится до merge #98 в main.
- **Issue.** [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146)

### LW-043 — pin `spatial_architecture_standard` в `m2c-capacity-successor.mjs`
- **Что.** `scripts/m2c-capacity-successor.mjs:14` закрепляет sha256 `data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md`. После шага 3 #146 («целевой»→«действующий» в §0.1) pin расходится; проверка не gate. Перепинивать в docs-задаче нельзя (повторное утверждение данных).
- **Как жить.** Не чинить в #146; обновить pin в CR данных/реализации M2c вместе с утверждением по WR §21.1.
- **Issue.** [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146)

### LW-044 — погода D7: выбор следующего состояния и инерция профиля
- **Что.** Норма D7 ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154)): следующее состояние погоды выбирает `@rus/turn` детерминированным RandomSource (seed партии, G0-зона, 6-часовой интервал) из утверждённого профиля v2 с инерцией; `@rus/environment-state` применяет. Код v17 ещё не делает выбор следующего состояния и инерцию.
- **Как жить.** Не имитировать живую смену погоды в тестах/доках как текущее поведение; реализация — CR M2c.
- **Issue.** [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146)

### LW-045 — D9/D14 и финальные числа от кода (долг кода v17)
- **Что.** Нормы D9/D14 ACTIVE в корпусе (#146 шаг 2–3), но код v17 ещё расходится: `action-produced-output-semantics.js` принимает любой `inscription_text`; узнавания владельцем при восприятии нет. Отдельно: финальные числа пишет код (`mass_grams` и пр.), а `plan-schema.js` всё ещё требует `mass_grams` от модели.
- **Как жить.** В нормах помечать «действующая норма; код v17 — долг CR реализации M2c (LW-045)»; не ослаблять норму под текущий код.
- **Issue.** [#146](https://github.com/PavelSlaven/Novgorod1230/issues/146)


### LW-046 — `lexical_ms` внутри Core resolveWorldKnowledge
- **Что.** §85 требует lexical latency в telemetry. Сейчас lexical scoring идёт внутри `packages/world-knowledge` `resolveWorldKnowledge` без отдельного return-канала; public signature `(query, { vectorScores })` не отдаёт `lexical_ms`. Diagnostic ставит `lexical_ms: null`, `lexical_status: included_in_core_resolution`.
- **Как жить.** Не менять публичную сигнатуру Core в #152; добавить отдельный timing channel в CR Core/telemetry, затем убрать LW.
- **Issue.** [#152](https://github.com/PavelSlaven/Novgorod1230/issues/152)

### LW-047 — SUFFICIENT = лексическое попадание, не относимость; калибровка в #153
- **Что.** `search_hint_hits` / `strongest > 0` проверяет лексическое совпадение hint с допущенным claim, а не topical relevance. Default-запрос §50 поэтому никогда не получает `SUFFICIENT_KNOWLEDGE` (максимум `PARTIAL`). `resolveTurnStepWorldKnowledge` в `@rus/turn` не дублирует default-query (owner — game-server grounder); у helper нет production-вызова — кандидат на удаление при чистке #127.
- **Как жить.** Не поднимать default-query slice до SUFFICIENT. Часть C (#153) добавила `search_hint_relevance` + профиль `wk-sufficiency:giga-cosine:v1` (`min_hint_relevance` 0.28, `sufficient_enabled=false`); SUFFICIENT в production выключен до per-hint relevance — LW-054.
- **Issue.** [#152](https://github.com/PavelSlaven/Novgorod1230/issues/152) → [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153)

### LW-048 — `historical_context.applicable_norms` / `known_local_customs` пусты в v17
- **Где.** `npc-safe-request-projector` читает `state.historical_context`; v17 не заполняет norms/customs.
- **Как жить.** Сейчас закрыто отсутствием данных (не механизмом фильтра). Пересмотреть при CR данных/реализации M2c или #154, когда контекст начнёт нести нормы; до того не трактовать пустоту как «норм нет в мире».
- **Issue.** [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153)

### LW-049 — pre-#152 app/domain test failures: frozen-role, generic-owners, temporal-world
- **Где.** `apps/game-server/test/frozen-role-requests.test.js`, `apps/game-server/test/lower-dvina-trace-turn-step-generic-owners.test.js`, `packages/contracts/test/temporal-world-v1.test.js` (`Factual visible envelope:` / line ~94).
- **Как жить.** Падают уже на `73a69dda` (до #152) и на `c40c18b3`; diff части A (#153) их не трогает. `test:apps` baseline 2 fail; `test:domain` baseline 1 fail. Не чинить попутно в WK-задачах; owner — turn/NPC routine / frozen role / temporal contracts (отдельный CR). В REVIEW-042 перегенерированы 3 player-conversation fixture (`intent-paraphrase`, `format-repair`, `verbatim-allowed-refs`) под F5 prompt; тест frozen теперь собирает все несовпадения за один прогон — остальные narration auditor mismatches остаются baseline LW-049.
- **Issue.** [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153) (зафиксировано при A-04 / N-6)

### LW-050 — NPC knowledge_snapshot / memory/rumors вне WK date-gate #153
- **Где.** NPC `knowledge_snapshot` (known_facts/beliefs/hypotheses), memory/rumors; owners — `@rus/visibility-knowledge-memory` / npc-runtime. #154 прямо исключает социальные группы и слухи из текущего этапа.
- **Как жить.** Не маршрутизировать в #154 WK actor-visible filter. Пересмотреть, когда visibility/npc-runtime CR явно подключит date-gated historical events к actor knowledge.
- **Issue.** [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153)

### LW-051 — opening narration без WK вовсе
- **Где.** `authored-opening-narration.js` / narration owner. Opening path не вызывает production World Knowledge grounder (ни date-gate, ни actor-visible slice).
- **Как жить.** Не закрывать «narration owner» без issue; отдельный CR владельца рассказчика, если opening должен получать WK / started historical events.
- **Issue.** [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153)

### LW-052 — intent_paraphrase может впитать WK в речь (остаточный риск)
- **Где.** Player conversation `intent_paraphrase` (`rejectIntentParaphraseWorldKnowledgeLeak`) и turn-step `player_utterance` (`@rus/turn` / lower-dvina turn-step planner).
- **Как жить.** Player conversation guard (#153 REVIEW-042 N5) ловит точную/пунктуационно-изменённую и ё/е копию `runtime_text`, но **не закрыт**: частичный пересказ, синонимы и перестановка слов проходят. Найденная точная утечка сейчас рвёт ход (`PLAYER_CONVERSATION_WK_UTTERANCE_LEAK` → model failed), а не уходит в format repair. Turn-step speech по-прежнему без guard — отдельный CR. Не объявлять «WK utterance leak закрыт».
- **Issue.** [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153)

### LW-053 — D17 reranker за гейтом D21 (production OFF)
- **Что.** Core принимает `rerankScores` (all-or-nothing + min-max) и отдаёт `admittedCandidateRefs` для скоринга admitted до ранжирования; pin `wk-reranker:bge-v2-m3:v1` (revision sha + file digests), `provisionReranker` и production loader читают профиль, но `production_enabled=false`. Бенчмарк 2026-09-17 (REPORT.md T1): B1 Giga cosine recall@10 0.9825 / MRR 0.9579 не хуже bge (0.9795 / 0.9512). Owner-server p95 2026-09-27 (`p95.json`): GPU ≈ 59.6 мс ≤ 150 мс; CPU ≈ 925 мс > 150 мс. После REVIEW-049 (скоринг admitted, не vector top-k): `r5-compare.json` — `rerank_applied` 120/120, порядок claim_refs сменился в 119/120; retrieval_miss_like_rate 0.502→0.531 и mean_noise_ratio 0.897→0.904 — **оба хуже**, не лучше.
- **Как жить.** Не включать rerank в production path, пока D21 не выполнен целиком (меньше retrieval_miss **и** шума на audit set **и** p95 ≤ 150 мс на пути обслуживания). При будущем enable — только локальный snapshot (`HF_HUB_OFFLINE`), деградация к гибриду с telemetry-событием на каждый отказ; grounder обязан скорить `admittedCandidateRefs`, не vector top-k.
- **Issue.** [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153)

### LW-054 — SUFFICIENT relevance threshold provisional
- **Что.** Профиль `wk-sufficiency:giga-cosine:v1` (`status: provisional`, `sufficient_enabled: false`) хранит `min_hint_relevance=0.28` как параметр будущего включения. Сигнал — Giga cosine claim ко всему search-query (hints joined); в 188/360 live-записей у всех подсказок одно значение — порог почти не отделяет верные SUFFICIENT. Калибровка REVIEW-049 по `judgments.json`: live×3 при 0.28 → SUFFICIENT 158, из них 127 (0.80) без must-need; лучшее — 0.76 при пороге 0.45 (38 SUFFICIENT); порога с долей ≤0.10 нет. Plan (120): 0.10 только при 0.52 и SUFFICIENT=1. Поэтому production не выдаёт `SUFFICIENT_KNOWLEDGE` (макс. `PARTIAL_KNOWLEDGE`).
- **Как жить.** Путь дальше — релевантность по каждой подсказке (отдельный эмбеддинг hint) и повторная калибровка; до того не ставить `sufficient_enabled: true`. Не сравнивать bge logits с cosine-порогом.
- **Issue.** [#153](https://github.com/PavelSlaven/Novgorod1230/issues/153)

### LW-055 — pin sha restart-теста в утверждаемом Gate1-запросе
- **Что.** `completed_import_readback.restart_verification` в `activation-amendment-v1/request.json` и в `spatial-v3-target-v1/item-compatibility-request.json` закрепляет sha256 `test/integration/gate1-owner-data-import-postgres.test.js`. Любая правка этого теста ломает reproduce-exact / attestation pin. Текущий pending amendment — v3 (`activation-amendment-v3/request.json`); v1/v2 request + их attestations — история. Утверждение amendment v2 снято до независимого прохода v3. `item-compatibility-request.json` всё ещё указывает старый sha `698dcbeb…` — отдельный запрос, в этом шаге не трогали.
- **Как жить.** Не regenerate in-place утверждённый request; новый digest → новый amendment/package + независимое утверждение. item-compat — отдельный CR/пакет, когда его тест реально упадёт или понадобится activation-совместимость.
- **Issue.** —

### LW-060 — знание эпохи скрыто из-за формулировки
- **Где.** `data/world-catalogs/novgorod/world-knowledge/production-v2` — claims класса `domain_internal_only` с суть-знанием 1230 года (около 800 после #154: служебные хвосты «не устанавливает…», «в описанном…», научные термины).
- **Как жить.** В речь NPC и рассказчику не открывать без переписки. Переписка — отдельная ревизия: текст языком эпохи, повторное утверждение WR §21.1 по каждому claim.
- **Issue.** [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154)

### LW-061 — пробелы аудита WK после production-v2
- **Где.** `audits/production-v2/step4-*-coverage.json` (`final_status`), `category-cartography.json`.
- **Как жить.** Must-потребности со статусом `rejected_at_approval`/`no_source` — очередь следующей ревизии: целевой поиск по книжному индексу, авторинг, утверждение. `missing_families` (14, BOUNDED P2) — решение владельца по объёму.
- **Issue.** [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154)

### LW-062 — событийная точность WK только через условия событий
- **Где.** `applicability.conditions.started_historical_events` в WK; события — `@rus/time-events-history` / импорт истории.
- **Как жить.** WK не несёт день и месяц. Claim о событии внутри года закрывать условием события. При импорте истории завести `novgorod_famine_1230` (с 14.09.1230 по D19/D22), `novgorod_upheaval_december_1230` и поздние события голода отдельными id. Добавить скриптовую проверку, что event id из WK существует.
- **Issue.** [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154)

### LW-063 — role_bound почти недостижим
- **Где.** `knowledge_access.class: role_bound` в production-v2.
- **Как жить.** NPC v17 используют 9 ролей; рассказчику нужен `role_ref` игрока (#153 часть B). Ремёсла под `nov_role_craftsman_master` перевести в `occupation_bound`, когда запросы NPC понесут `occupation_ref`.
- **Issue.** [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154)

### LW-064 — поиск по синонимам не доработан
- **Где.** `search_aliases` production-v2; `benchmarks/retrieval-v1.json` кейс `social_later_charter_hard_exclusion_ru`.
- **Как жить.** Синонимы добавлять только с утверждением; кейс судной грамоты держится гибридным поиском. Если появится чисто лексический путь — проверить этот кейс.
- **Issue.** [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154)

### LW-065 — широкие диапазоны времени
- **Где.** `applicability.time` production-v2 (65 claims с диапазоном 500+ лет, максимум 700).
- **Как жить.** Не сужены: источники не дают большей точности. Сужать только по новому источнику.
- **Issue.** [#154](https://github.com/PavelSlaven/Novgorod1230/issues/154)

### LW-066 — place_family secondary ещё не утверждены
- **Где.** `world_base.spatial_node_place_family_bindings`; lookup presence/routines/water/slots.
- **Как жить.** До решения Codex по смыслу `pf_secondary` и проверки 227 узлов импортировать только `binding_role='primary'`. Один путь кода `resolveNodePlaceFamilies` = primary ∪ утверждённые secondary; флагов нет. Тест (будет): `pf_river_wharf` вне secondary не даёт правил пристани.
- **Ещё.** `validatePrimarySecondaryPresenceSubjects` (`packages/materialization/src/presence-rule-conflicts.js`) уже приведён к норме — ключ по субъекту без `region`, — но вызывать его пока некому: импортёр R-1 и secondary-привязки не появились. Подключить в валидаторе импорта вместе с `pf_secondary`. Авторский валидатор игровой базы — инструмент Codex, второго владельца правила в нём не держать.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-067 — presence guards не исполняются
- **Где.** `world_base.presence_rules.guards` (text[]); импорт §8.1.
- **Как жить.** Хранить для provenance. Не строить evaluator и не гейтить бросок по guards. `allowed_times` людей не импортировать; `wild_arrival_cause` не гейтит бросок.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-068 — пустые веса discovery = 1/1; пробел Stage 16 (no_source)
- **Где.** `presence_rules.entry_exposed_weight` / `search_concealed_weight` при обоих режимах; Stage 16 / `no_source` gaps в presence authoring.
- **Как жить.** Редакционное правило: NULL+NULL при обоих режимах → вес 1 и 1. Одна сторона пустая → только другая. Строки без режимов не проходят draw. Пробел Stage 16 (`no_source`) не закрывать выдуманными весами/правилами — только явным источником или отдельным CR.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-069 — fresh-schema attestation снято до нового прохода
- **Где.** `data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-request.json` + approval/execution attestations; Gate1 request v2.
- **Как жить.** После DONE-065/065b файл запроса пересобран (217 таблиц / 37 party migrations); прежний `request_digest`/утверждение Sol high больше не действует (WR §21.1). Не выполнять D27 bootstrap по старым attestation. Новый независимый проход утверждения (fresh-schema + Gate1 amendment v3) — до D27. Пин Gate1 amendment v2 на старый restart-test sha — исторический; Gate1 owner-data не перегенерируется (C11). Утверждение amendment v2 снято до v3.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-070 — party restart: полный DDL только без chain-ledger строки текущего digest
- **Где.** `runSpatialV3TargetMigrationsForProductionRestart`; `spatial-v3-target-chain-ledger.js`; runner `runSpatialV3TargetMigrations` (хеширован в fresh-schema v3, не править).
- **Как жить.** Первый старт или несовпадение `target_schema_fingerprint` / отсутствие строки `spatial_v3_target_chain_<digest>` → полный прогон раннера и append-only запись в `party_runtime.schema_migrations` в той же транзакции, что readiness. Повторный in-process restart при совпадении digest и отпечатка **не** повторяет CREATE/ALTER/DROP 012–037 (PG DDL-wrapper test). Конфликт persisted ledger с release → `SPATIAL_V3_MIGRATION_LEDGER_MISMATCH`. In-place правки уже применённых SQL-файлов 012–037 по-прежнему требуют пересоздания локальных БД со старым отпечатком. D27 rename/bootstrap — отдельный шаг.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-071 — правило «предок уже решён — потомки не бросаются» — **closed R-2a**
- **Где.** `applyPresenceRulesFirstArrival` / `isCategoryPresenceBlockedByAncestor` (`packages/materialization/src/presence-rules-first-arrival.js`); PG slice `presence-rules-first-arrival-postgres.test.js`.
- **Как жить.** Потомки category не бросаются, если предок уже имеет `resolve_presence_rule` в том же `scope_instance_ref`. Новые consumer-пути должны вызывать тот же helper, не дублировать логику.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-072 — local-play git provenance в worktree
- **Где.** `tools/local-play/local-play.js:126` (`readGit` → `LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE`); `:140` — `provisionRuntime({ repositoryRoot, env, fetchImpl, log })` **без** `startLlm`; acceptance `test/acceptance/local-play-postgres.test.js:65-66` (stub `provisionRuntime` не передаёт `startLlm === false`).
- **Доказательство.** На `162a86b9` и `a8aa11c4`: `node --test test/acceptance/local-play-postgres.test.js` — «local play persists a free turn» падает `startLlm` assertion; detached worktree без gh PR даёт `LOCAL_PLAY_GIT_PROVENANCE_UNAVAILABLE` на `:126`, не регресс datasets CR #158.
- **Как жить.** `readGit`/gh PR head mismatch — окружение worktree. Падение «persists a free turn» из‑за `startLlm` — **дефект acceptance-теста**, не блокер M2c importer.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-073 — acceptance revision 35 timeout headroom
- **Где.** `test/acceptance/lower-dvina-trace-phase-11-restart-postgres.test.js` (450s/600s); `test/acceptance/lower-dvina-trace-s1-first-entry-postgres.test.js` (300s).
- **Доказательство.** На базе `162a86b9` тест 1 phase-11 ~266 s при лимите 300 s (89%). После 070d/070d2 — свежие пулы на restart, skip DDL по chain ledger; лимит теста 1 поднят до 450 s с комментарием о базовом wall time, не как маска регресса CR.
- **Как жить.** Таймаут test 1 — headroom от базового прогона; test 2 остаётся 600 s. «Pool after end» — следствие shared pools/encoder до 070d2, не фон root.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-076 — m2c-npc-wave: readback обязателен; D-1/D-2 в 28.sql; activate отдельно
- **Где.** `tools/spatial-v3/p12-authoring-importer.mjs` (`P12_WAVE_IMPORT_REQUIRES_APPROVED`, `P12_WAVE_IMPORT_REQUIRES_READBACK`, `buildImportWithReadbackSql`); `tools/spatial-v3/m2c-npc-wave-bundle-validation.mjs` (`manifestIncludesWaveTables`, `M2C_NPC_WAVE_TABLE_SET`, `M2C_WAVE_COMPOSITION_PRESENCE_CONFLICT`, `M2C_WAVE_COMPOSITION_GROUP_INVALID`, `M2C_WAVE_SCHEDULE_SUBJECT_SEASON_CONFLICT`); `infra/world-base/schema/28.sql`; `packages/runtime-catalog/src/m2c-npc-wave-readers.js` и `world-catalog-gate.js`; `m2c-npc-wave/v1/approval.json` (WR §21.1, D24).
- **Что.** Любой бандл с таблицами из `M2C_NPC_WAVE_TABLE_SET` (11 таблиц, включая `npc_schedule_routine_rules` и `place_population_composition_rules`) проходит wave-валидацию и при настоящем импорте требует `manifest.status === 'approved'`, подписанный approval (`authored_by` — `… (executor)`, `checked_by` — `… (owner|reviewer)`, личности после нормализации различаются; `manifest_path` сверяется с импортируемым manifest) и обёртку import+readback в одной транзакции. У людей `allowed_times` импортируется пустым `[]` (§8.1, LW-067). На том же PF приоритет состава над `presence_rules` для совпадающих `subject_ref`: при `presence_probability_ppm > 0` нужен `authoring_payload.creation_owner === 'composition'` (C006c2). Bootstrap approved import волны — только **R-1b-activate / D27** по команде ревьюера. Поле `sql_builder.sha256` в утверждённых `request.json` фиксирует сборщик на момент утверждения запроса; байты SQL держит тест «v17 bootstrap bundle SQL stays byte-stable», а не живой пересчёт sha в request.
- **Как жить.** Не импортировать волновые таблицы без readback-обёртки и без approved manifest + reviewer approval. Repo `manifest.json` волны остаётся `draft` до R-1b-activate/D27. Чтение D-1/D-2 — только через `@rus/runtime-catalog` после spatial pin и runtime-catalog activation; production presence first arrival — consumer R-2a. `validateNpcRoutineProfile` пока не проверяет `location_ref`, `presence_state`, `absence_reason_ru` в фазах — расширение профиля в R-2.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-077 — R-2a presence consumer: discovery weights, subcategory, subregion, legacy region id в данных
- **Где.** `packages/materialization/src/presence-rules-first-arrival.js` (`choosePresenceDiscoveryMode`, `resolve_presence_rule` → `subcategory_ref: null`); `pickRegionalPresenceRule` / `loadG0RegionIdForSpatialNode` (`packages/runtime-catalog/src/m2c-npc-wave-readers.js`); PG wave slice: `test/spatial-v3/presence-rules-first-arrival-postgres.test.js` (`setupWorldPool`, UPDATE после import), `test/spatial-v3/presence-rules-composition-postgres.test.js` (`setupWorldPool`, тот же UPDATE); счётчик `tools/spatial-v3/count-presence-rules-roll-sites.mjs` (регион `region_novgorod_land`).
- **N8 / discovery.** Пустые `entry_exposed_weight` / `search_concealed_weight` при обоих режимах трактуются как **exposed** (null → 1 в draw, см. LW-068). Отдельный committed шаг «скрытое наличие» / concealed discovery не реализован в R-2a path — только явный `discovery_mode` в записи броска.
- **§3A.4 `subcategory_ref`.** В `applyPresenceRulesFirstArrival` в aggregate всегда пишется `subcategory_ref: null`; сужение по подкатегории из правила не матчится.
- **Подрегион.** Движок сравнивает только **G0 `region_id`** места со `presence_rules.region_id`. Колонка/поле `subregion_scope` в данных (планируется задачей `region-ids`) в R-2a не читается.
- **Данные волны.** До подъёма пина game-base и задачи `region-ids` тысячи правил несут legacy `novgorod_land` вместо G0 `region_novgorod_land`. Движок старый id не нормализует; PG-тесты на срезе волны делают `UPDATE … novgorod_land → region_novgorod_land` с комментарием `region-ids` (см. пути выше).
- **§3A.2/3A.3 сезонное обновление.** Повторное прибытие в **новом сезоне** в уже созданное G5-место (пересчёт `by_year_season` без нового scope) в R-2a **не** подключено; отложено отдельным шагом CR #158 (решение ревьюера REVIEW-R2a-6 F6). Unit на `encodePresenceRulePeriodNumber` остаётся.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-074 — восприятие NPC в live world выключено
- **Где.** `apps/game-server/src/runtime/lower-dvina-trace-phase-2.js` (`liveWorldTurnBundle`: `post_action_perception_profile: null`); `apps/game-server/src/runtime/lower-dvina-trace-post-applied-actor-step.js` (`perceptionListeners` без профиля возвращает `[]`); профиль есть только в `apps/game-server/src/internal/lower-dvina-trace-revision-34-bundle.js`.
- **Что.** Код цепочки есть (`proposeNpcPerception` → perception-reaction cycle → boundary participant), но в v17 NPC не замечают событий вне разговора. LLM для NPC вызывается только в разговоре и в командах фазы 7.
- **Как жить.** Не считать, что NPC видели действие игрока или другого NPC. Не писать второй путь восприятия и не включать профиль ревизии 34 в live world. Подключение — Runtime_Plan M4, «Восприятие NPC».
- **Issue.** —

### LW-078 — R-2a: стартовое присутствие не повторяется при загрузке, если provisioning не выполнился
- **Где.** `apps/game-server/src/runtime/lower-dvina-trace-public-start.js` (вызов `provisionInitialOrdinary` после commit new_game); `apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js` (`provisionInitialOrdinary`, отдельная транзакция); путь загрузки партии (`getPartyScreen`) вызова не имеет.
- **Что.** Присутствие на стартовом месте решается второй транзакцией после commit new_game. Если процесс упал между ними, при загрузке партия останется без записанного присутствия стартового места: пустое присутствие ничего не хранит (typed gap только в диагностике resolver/provisioner), поэтому «не выполнилось» и «решено пустым» в БД неотличимы. Повтор на загрузке возможен только как идемпотентный перезапуск.
- **Открытый вопрос владельцу.** «Первое прибытие» для стартового места — момент старта (календарь `readInitialEnvironment`, состояние 0) или момент обработки (`readCurrentEnvironment` при `state_version > 0`)? От ответа зависят сезон и номер периода в ключе броска (§3A.1) при повторе после первого хода.
- **Как жить.** Окно сбоя узкое. Не добавлять хук в путь загрузки и не писать маркер «решено» без решения владельца и отдельного шага (граница game-server + insert-only контракт таблиц ordinary).
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-075 — runtime читает editorial-label файлы мимо `world_base` (CR #160)
- **Где.** `apps/game-server/src/infrastructure/postgres/spatial-v3-current-visibility-provider.js` и `spatial-v3-proposed-visible-sources.js` (`loadApprovedLocalEdgeLabels` из `m2c-local-edge-labels/approved-labels.mjs`; `readFileSync` + `JSON.parse` `m2c-exit-labels/candidate.json` + `approval-attestation.json`); четвёртый каталог (rt-walk, по слову владельца в PLAN-OK-rt-walk D1: нейтральные «Проход N» вместо авторского текста) — `data/world-catalogs/novgorod/m2c-canonical-connection-labels/approved-labels.mjs`; читается тем же прямым способом без runtime-гейта, связь «файл = утверждённое» проверяет `candidate.test.mjs` (в `test:tools`); третий каталог — `data/world-catalogs/novgorod/m2c-pass-target-labels/approved-labels.mjs` (`candidate.json`: метки целей прохода и `passage_phrases`), его читают `apps/game-server/src/runtime/spatial-v3-pass-target-disclosure.js`, `local-edge-occupancy.js` и оба провайдера выше.
- **Что.** Три уже утверждённых (WR §21.1, `APPROVE_DATA_ONLY`) каталога editorial-текстов прохода читаются рантаймом напрямую с диска, а не через `world_base` importer/readback, как остальные approved-данные этой линии (LW-038 — похожий, но другой путь). Первые два (`m2c-local-edge-labels`, `m2c-exit-labels`) проверяются по `candidate_sha256`/`candidate_ref` при загрузке модуля. Третий (`m2c-pass-target-labels`) читается **без** runtime-проверки хеша (AI §17: существующие хеши не прецедент); связь «файл = утверждённое содержимое» проверяет только репозиторный CI-тест `test/spatial-v3/m2c-pass-target-labels-attestation.test.js` (sha256 файла = `candidate_sha256` в `approval-attestation.json`).
- **Ответы AI §17 для третьего каталога.** (1) Attacker: нет — это не защита от злоумышленника; владелец проекта, меняющий собственный файл, не threat model. (2) Trust boundary: нет, файл и код в одном репозитории. (3) Ущерб без проверки: неутверждённая правка текста после approval незаметно доходит до игрока — это редакционный дрейф содержимого, не безопасность. (4) Почему недостаточно существующего: импорта в `world_base` (транзакция/readback/constraints) для этого каталога пока нет — это и есть LW-075; поэтому только тест в CI, без runtime-слоя, без хранения хешей в данных сверх существующей attestation.
- **Как жить.** Четыре каталога — предел этого паттерна: не считать его временным решением, которое можно тихо расширить новыми label-каталогами; не добавлять runtime-гейты хеша новым каталогам. Перенос в `world_base` — отдельная задача (в CR #160 сознательно не входит, см. issue #160 «Решения владельца»). Изменение `candidate.json` третьего каталога требует нового прохода утверждения и обновления attestation, иначе CI-тест красный.
- **Issue.** [#160](https://github.com/PavelSlaven/Novgorod1230/issues/160)

### LW-079 — narration-аудит может дважды отклонить прозу после committed-хода, игрок остаётся без текста
- **Где.** Код: `apps/game-server/src/runtime/lower-dvina-trace-phase-2-llm.js` (`createLowerDvinaTraceNarrationService`: роли `gameplay_narrator` → `gameplay_narrator_auditor` → `gameplay_narrator_semantic_repair` → повторный аудит); отказ бросается в `apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation.js` (`TRACE_PHASE_2_NARRATION_REJECTED`, строки ~96 и ~134); диагностика причины — `apps/game-server/src/runtime/llm-diagnostics-failures.js` (`final_audit_failed`, `audit_attempts`). Повторение в живом прогоне: `docs/playtests/2026-09-29_M2c-B1_26d38cb2_step7d-closing-live-run.md` (ход 3, «рассказчик не прошёл аудит») и `docs/playtests/2026-09-28_M2c-B1_e2df4cd3_step7-visibility-threshold-and-departure-probes.md` (2 из 5 попыток 7б).
- **Трасса.** Сырая трасса аудита (`audit_attempts`: попытка 1 — `failed_checks: [policy, artistic, technical]`, попытка 2 после repair — `failed_checks: [policy]`) лежит вне репозитория, в рабочем мосте исполнителя (файлы `step7-report.json` и `final-live-report.json`); в отчёты репозитория она не переносилась (private provider traces не публикуются, `docs/playtests/README.md`).
- **Что.** Домен-слой при этом уже полностью зафиксирован (все 17 turn-step стадий `stage_approved`, `owner_commit_completed`, `owner_readback_completed` — состояние партии реально изменилось), но обе попытки рассказчика получить связную прозу отклонены аудитом. Игрок получает `HTTP 200`, ход зачтён, но `main_prose: undefined` — без объяснения, что произошло.
- **Родственное (владелец — #158 R-3, подача рассказчику).** Код причины отказа движения (`movement_blocked_reason_code`) пишет только код: `turnStepBlockPlan` → `loop_result` → consequence. `destination_occupied` — только для занятости, которую актёр воспринимает; полный отказ владельца движения (`attemptRefusal`) по невоспринимаемым занявшим идёт без кода; `actor_movement_blocked` — из committed combat state. Промпт рассказчика про поле отложен до rt-harness, проза отказа по-прежнему может быть общей.
- **Как жить.** Не считать это блокером spatial/movement кода (CR #160 к этому не относится, домен здесь работает штатно). Не чинить точечно под B1. Владелец — подача рассказчику, CR #158 R-3. После fleet/rt-narr в том же HTTP-запросе рассказчик делает не более двух проходов (проход хода + один повтор replay); повтор делит с первым проходом единственный semantic repair запроса (`claimRepair` по `request_identity`) и не начинается, если до дедлайна остаётся не больше `GAMEPLAY_LLM_CALL_TIMEOUT_MS`. Если оба прохода отклонены — ход остаётся `committed_presentation_pending`, восстановление — следующим запросом. Terminal factual delivery без изменения контракта (§2.1 situational_prose).
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-080 — занятость: отказ только на шаге 1; подход строит путь по сырым рёбрам (CR #160)
- **Где.** `apps/game-server/src/runtime/lower-dvina-trace-phase-2-services.js` (`turnStepBlockPlan`, проверка `request.step_index !== 1`); `apps/game-server/src/runtime/spatial-v3-expansion-runtime.js` (`findReachableDeparturePosition`) и `apps/game-server/src/infrastructure/postgres/spatial-v3-expansion-context.js` (сырой SQL `scene.movement_edges`); `apps/game-server/MODULE.md` (разделы про занятость и подход).
- **Что.** (1) Рассказанный отказ по занятому ребру срабатывает только на шаге 1 хода; на шаге ≥2 занятое ребро даёт типизированный 409 `SPATIAL_V3_LOCAL_EDGE_OCCUPIED` (тест это закрепляет). (2) После первого шага (он берётся только из `listLocalOptions`) поиск пути подхода идёт по сырым active-рёбрам без видимости и eligibility: возможны подсказка скрытой топологии и тупик на промежуточной позиции. Риск сейчас низкий — все шаблоны сцен `default_clear`.
- **Как жить.** Не считать шаг ≥2 обработанным: многошаговость — [#185](https://github.com/PavelSlaven/Novgorod1230/issues/185). При появлении явной видимости рёбер подход обязан брать путь только по допущенным рёбрам.
- **Issue.** [#160](https://github.com/PavelSlaven/Novgorod1230/issues/160), [#185](https://github.com/PavelSlaven/Novgorod1230/issues/185)

### LW-083 — replay подаёт рассказчику исход без `check_outcomes` и `qualitative_assessment`
- **Где.** `apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-2-presentation-replay.js:24` вызывает `spatialResult({ consequence: replay.state.last_turn.consequence })` без `checks` и `modeResolution`; первый проход — `packages/turn/src/stages/narration.js:17` (`spatialResult({ consequence, checks, modeResolution, retrievedState })`), где `check_outcomes` собираются из `checks.results` (`:68-83`), а `qualitative_assessment` — из `modeResolution.decision_trace` (`:60-66`).
- **Что.** Если рассказчик отработал не в запросе хода, а на повторе (in-request retry, recovery, рестарт), его вход не содержит исходов проверок и оценки, хотя на первом проходе они есть; `movement_blocked`/`movement_blocked_reason_code` одинаковы (берутся из consequence). Так было и на базе d9bb04e9; fleet/rt-narr эту разницу не вносил и не чинил. После rt-narr повтор в том же запросе чаще, чем раньше.
- **Как жить.** Не чинить точечно: нужны закоммиченные исходы проверок в источнике replay (`last_turn`), владелец — подача рассказчику, CR #158 R-3. Проза на повторе может опускать результат броска.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-082 — in-request presentation replay: до ~360 с ответа, game-web без fetch-timeout
- **Где.** `apps/game-server/src/runtime/llm-turn-budget.js` (`GAMEPLAY_TURN_DEADLINE_MS` 360_000, `GAMEPLAY_LLM_CALL_TIMEOUT_MS` 120_000); `apps/game-server/src/runtime/lower-dvina-trace-phase-2-presentation-resolve.js` (`SAME_REQUEST_PRESENTATION_ATTEMPTS` = 1); `apps/game-web/src/api/client.js` (`fetch` без `signal`/таймаута).
- **Что.** После fleet/rt-narr рассказчик в одном `submitTurn` делает не более двух проходов (проход workflow + один повтор replay); на первом экране — не более двух попыток (`OPENING_AUDIT_OUTER_ATTEMPTS`) с одним semantic repair на запрос. Всё под одним дедлайном 360 с: повтор не начинается, если остаётся не больше 120 с. При исчерпании бюджета ход остаётся `committed_presentation_pending`, а не 500. Браузерный клиент не обрывает запрос сам — игрок может ждать до обрыва прокси/вкладки или до серверного deadline.
- **Как жить.** Не считать это регрессией UX для обычных ходов; отдельный таймаут клиента и/или индикация ожидания — отдельная задача. Повтор в запросе не может потратить второй semantic repair (тот же `request_identity`); политика repair не менялась.

### LW-081 — `combat_weapon_classification`: expectedSchema описывает старый формат
- **Где.** `packages/llm-runtime/src/combat-role-defaults.js` (`expectedSchema: 'rus.combat.action_produced_weapon_classification.v1'`, `outputContractMode: json_object_with_schema`); `data/model-evals/llm-runtime-baselines/lower-dvina-trace-v13-role-defaults-v1.json`.
- **Что.** С фиксом #188 модель возвращает только `qualitative_class`, а `schema` и `request_id` ставит код (`actionProducedWeaponClassificationFromModelOutput`). Поле `expectedSchema` рантайм не проверяет: оно входит только в хэш конфига. Снимок baseline никем не импортируется.
- **Как жить.** Не считать `expectedSchema` контрактом выхода модели. Не менять его попутно: смена сдвигает хэш конфига. Привести к фактическому выходу (`expectedSchema: null`, режим `json_object`, снимок baseline, тест `combat-roles.test.js`) — отдельной задачей.
- **Issue.** [#188](https://github.com/PavelSlaven/Novgorod1230/issues/188)

### LW-092 — два теста падают на базе d9bb04e9 (`generated-expansion-adapter.test.js` `terminal=1`, `m2c-expansion-import-postgres.test.js`)
- **Где.** `test/spatial-v3/generated-expansion-adapter.test.js`, ~строка 277 (`traces[1].trace.first_entry`); `test/spatial-v3/m2c-expansion-import-postgres.test.js` (`assertLocalMovementEligibilityPostgres`: «NPC at capacity-one focus blocks arrival movement» — после open-capacity v2 ребро не занято).
- **Что.** Тест ожидает, что трасса терминала не содержит `first_entry`, но созданный канонический терминал теперь проходит first entry (R-2a); падает и на d9bb04e9 без изменений rt-walk.
- **Как жить.** Не считать красным от изменений топологии; привести ожидание к first entry терминала отдельной правкой владельца R-2a.
- **Issue.** —

### LW-093 — подписи проходов не несут направления
- **Где.** `data/world-catalogs/novgorod/m2c-local-edge-labels/candidate.json`, `m2c-canonical-connection-labels/candidate.json`; стенд `/srv/novgorod-work/benches/rt-walk-planner/` (baseline: «назад/дальше» инвертированы уже на утверждённых локальных «Проход 1/2»).
- **Что.** Планировщик выбирает проход по названному порядковому номеру верно, но «вернусь назад» / «иду дальше» — вслепую: номера направления не несут.
- **Как жить.** Не лечить текстом из кода. Структурный признак «откуда пришёл» у ребра/связи в видимом контексте и подписи по классу цели — отдельные задачи; кнопки движения снимают проблему для клика.
- **Issue.** —
