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
| 074 | `lower-dvina-trace-phase-2.js` (`liveWorldTurnBundle`), `lower-dvina-trace-post-applied-actor-step.js` | post-action perception: реплики игрока, same-position listeners; без G6 propagation и reaction boundary — волна 2 (#225) | — |
| 075 | `spatial-v3-current-visibility-provider.js`, `spatial-v3-proposed-visible-sources.js` | runtime читает `m2c-local-edge-labels`/`m2c-exit-labels`/`m2c-pass-target-labels` файлами напрямую, мимо `world_base` | [#160](https://github.com/PavelSlaven/Novgorod1230/issues/160) |
| 076 | `tools/spatial-v3/p12-authoring-importer.mjs`, `m2c-npc-wave-bundle-validation.mjs`, `infra/world-base/schema/28.sql`, `packages/runtime-catalog/src/m2c-npc-wave-readers.js` | m2c-npc-wave: readback обязателен; D-1/D-2 в 28.sql; bootstrap импортирует волну этапом (D27) | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 077 | `packages/materialization/src/presence-rules-first-arrival.js`, `packages/runtime-catalog/src/m2c-npc-wave-readers.js`, PG-тесты presence | R-2a presence consumer: discovery weights, subcategory, subregion, legacy region id в данных | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 078 | `lower-dvina-trace-public-start.js`, `lower-dvina-trace-phase-1b.js` (`provisionInitialOrdinary`) | стартовый presence-provisioning — отдельная транзакция после commit new_game; при сбое между ними стартовое место остаётся без решённого присутствия, повтора при загрузке нет | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 079 | narration-конвейер (`gameplay_narrator*`) | двойной отказ narration-аудита после committed-хода оставляет игрока без прозы (owner #158 R-3) | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 080 | `lower-dvina-trace-phase-2-services.js` (`turnStepBlockPlan`), `spatial-v3-expansion-runtime.js` | отказ по занятости только на шаге 1; путь подхода после первого шага — по сырым рёбрам без видимости | [#185](https://github.com/PavelSlaven/Novgorod1230/issues/185) |
| 081 | `packages/llm-runtime/src/combat-role-defaults.js` (`combat_weapon_classification`) | `expectedSchema` и `json_object_with_schema` описывают старый выход роли; рантайм их не проверяет | [#188](https://github.com/PavelSlaven/Novgorod1230/issues/188) |
| 082 | `llm-turn-budget.js`, `lower-dvina-trace-phase-2-presentation-resolve.js`, `apps/game-web/src/api/client.js` | худший submitTurn до ~360 с при клиенте без fetch-timeout | — |
| 083 | `lower-dvina-trace-phase-2-presentation-replay.js`, `packages/turn/src/stages/narration.js` (`spatialResult`) | replay-подача рассказчику без исходов проверок и оценки: `check_outcomes`/`qualitative_assessment` есть на первом проходе, нет на повторе (owner #158 R-3) | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 084 | `scripts/generate-m2c-npc-wave-datasets.mjs`, `data/world-catalogs/novgorod/game-base-v1/places-binding/presence/presence_rules.csv` | environment presence rules game-base (lw-env, #176): 1236 строк `subject_kind='environment'` не импортируются в v17 — нет вида в §3A.1 / DDL 27.sql / движке R-2a | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 085 | `data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/presence_rules.json`, `approval.json` (`limits_note`) | 9 правил ладожской нерпы (`ladoga_ringed_seal`) потеряли региональное сужение к Ладоге и попадают в штатный старт | [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158) |
| 092 | `test/spatial-v3/generated-expansion-adapter.test.js` (`terminal=1`), `test/spatial-v3/m2c-expansion-import-postgres.test.js` | два теста красные и на базе d9bb04e9: устаревшие ожидания (first_entry терминала; capacity-one после open-capacity v2) | — |
| 093 | `data/world-catalogs/novgorod/m2c-local-edge-labels/candidate.json`, `m2c-canonical-connection-labels/candidate.json` | подписи проходов «Проход N» не несут направления: «назад/дальше» планировщик путает | — |
| 094 | `apps/game-server/src/infrastructure/postgres/spatial-v3-movement-availability-policy.js`, `live-world-runtime-v17/movement-availability-policy.v1.json` | политика доступности читается файлом мимо `world_base.spatial_v3_traversal_availability_policies` | — |
| 095 | `movement-routes/src/spatial-v3.js`, `spatial-v3-current-movement-capability.js`, `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | три формата метода движения: `movement.foot@1`, `movement.foot`, `movement_method.walk` | — |
| 096 | `spatial-v3-world-base-reader.js`, `spatial-v3-generated-scene.js`, `spatial-v3-local-scene-movement.js`, `spatial-v3-local-movement-eligibility.js` | гейты «непустой ref условий доступности = непригодно» вне вычислителя | — |
| 097 | `apps/game-server/src/runtime/spatial-v3-site-traversal-runtime.js`, `spatial-v3-current-visibility.js`, `lower-dvina-trace-public-start.js`, `prepareCanonicalConnection`, `data/world-catalogs/novgorod/m2c-local-edge-labels`, `m2c-exit-labels`, `m2c-pass-target-labels`, `m2c-canonical-connection-labels`, `world_base` DDL и данные | v17 расходится с Spatial 4.7.0 по линиям, времени перехода, раскрытию и подготовке канонической связи; остаются фазы (а)–(г) | [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133) |
| 098 | `lower-dvina-trace-scene-presence.js` (прокси G6); `phase-9-conversation.js`, `phase-4-admission.js`, `phase-8-accusation-command.js`, `m2-conversation-player.js`/`-phase4.js`, `player-safe-entities.js` (`sceneNpcIsVisible`) | присутствие NPC в сцене — временный прокси «тот же G6» без соответствия позиция→G6 в состоянии хода; авторские фазы и видимость игроку на голом `anchor_id` | — |
| 099 | `scene-npcs-readback.js`, `lower-dvina-trace-phase-2.js` (`loadPhase2State`), писатели снимка | NPC текущего сайта читаются в состояние хода отдельным читателем (дубль формы `hydratedNpcs`, чтение в каждом вызове, только placement `scene_position`, без тела NPC) | — |
| 100 | `apps/game-server/src/infrastructure/postgres/action-produced-authority-loader.js`, `action-produced-atomic-write-plan-pins.js`, `action-produced-physical-keys.js`, `action-produced-persistence-context.js`, `action-produced-persistence.js` | A1: назначение результата без `g5_anchor` (любое место после перехода ходьбой) — пин на позиции сцены; остаток: сгенерированные G5 без PG-теста | — |
| 101 | `packages/turn/src/ordinary-materialization-discovery-identity.js`, `ordinary-materialization-aggregate` (`max_resolution_records`), шаг 2 планировщика | повторное «взять» того же материала: replay по (запрос, количество), потолок записей агрегата, неоднозначность двух предметов с одним именем | — |
| 102 | `data/world-catalogs/novgorod/m2c-items/candidate.json` (`tool_and_action_precondition`) | инструмент для `cut_reeds` / `cut_standing_wood` — только проза, кодом не проверяется | — |
| 103 | планировщик A1 (`lower-dvina-trace-turn-step-planner-instructions.js`), `packages/turn/src/turn-step-plan-repair.js`, `turn-step-contracts/action-production-operation.js`, `lower-dvina-trace-turn-step-grounding-audit.js` | форма A1-плана живой Qwen: правило промпта и один ремонт `physical_form` (форма закрыта); остаток — стохастика планировщика (буквальный отказ, лишний `description`) и аудитор grounding | — |
| 104 | `data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-approved.json` (`applicability`) | список применимости закреплён на шаблонах @1, а сгенерированные сайты v17 — @2 (общий массив с N1) | — |
| 105 | `data/world-catalogs/novgorod/m2c-items/README.md`, `packages/items-property` | `M2C_FINITE_FIXED_MASS_OWNER_VALIDATION_REQUIRED`: владелец предмета не проверяет `mass_grams = quantity × 50` | — |
| 106 | `apps/game-server/src/runtime/releases/lower-dvina-trace-a1-pre-attempt.js`, `apps/game-server/src/infrastructure/postgres/action-produced-mass-conservation.js` | значения по умолчанию для v5-профиля (`packing_slot_cost=0`, `quantity=null`, `container=null`) заданы в game-server, вне владельца items-property | — |
| 107 | `data/world-catalogs/novgorod/npc-identity-v17/v1/context-bindings.json`, `packages/materialization/src/npc-identity.js` | NPC гостевых и путевых контекстов (Готланд, немецкие города, Корела, Ижора) без имени: иноземные пулы — отдельная задача данных (D51), их строки `draft` | — |
| 108 | `packages/materialization/src/npc-identity.js`, `packages/materialization/src/generated-npc-bindings.js` | имена двух NPC одной сцены выбираются независимо и могут совпасть | — |
| 109 | `packages/runtime-catalog/src/procedural-scene-records.js` (`readNpcIdentityCatalog`), `packages/materialization/src/npc-identity.js` | `semantic_state.character` пишется только при полных данных занятия; срок действия пула (`valid_from`/`valid_to`) не проверяется | — |
| 110 | `apps/game-server/src/infrastructure/postgres/generated-npc-first-entry.js` (`nameProfileSnapshot`) | вторая проекция снимка имени рядом с `projectNameProfileSnapshot` stage 24 (лимит API 8) | — |
| 111 | `infra/world-base/schema/29.sql` (`occupation_character_items`, `npc_regional_context_name_bindings`) | нет FK на реестр занятий (33 занятия, 165 строк вне реестра); привязка контекста без версии | — |
| 113 | `apps/game-server/src/runtime/releases/lower-dvina-trace-n1-production.js` (`resolveNpcOrdinarySemanticParticipant`), `apps/game-server/src/internal/target-runtime-profiles.js` | N1-применимость по G4-составам не охватывает людей канонических мест из D-2/PF; при осмотре остаётся код-описание внешности | — |
| 114 | `data/world-catalogs/novgorod/game-base-v1/places-binding/presence/people_composition_authoring.json`, `packages/materialization/src/place-people-first-arrival.js` | поле `sex` субъекта D-2 не исполняется; пол идёт из демографического профиля или seed | — |
| 115 | `packages/materialization/src/presence-rules-first-arrival.js`, `apps/game-server/src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js`, `ordinary-materialization-first-entry-provisioning.js` | агрегат содержит исходы occupation/social_role там, где first-entry не создаёт людей | — |
| 116 | `apps/game-server/src/infrastructure/postgres/target-place-people-first-entry.js` (`isDataGap`), коды `PROCEDURAL_NPC_APPROVED_RECORD_DATA_GAP` и `PROCEDURAL_NPC_…_TEMPORAL_DATA_GAP` | общий суффикс `_DATA_GAP` делает мягкими и отсутствие записи, и неоднозначную утверждённую ссылку | — |
| 117 | `apps/game-server/src/infrastructure/postgres/target-generated-first-entry.js`, `finiteFirstEntryProfile.technical_limits.max_resolution_records` | без лимита профиля агрегат для людских исходов не строится; правила не читаются, в trace typed gap | — |
| 118 | `apps/game-server/src/infrastructure/postgres/action-produced-authority-loader.js`, `action-produced-atomic-write-plan-pins.js`, narration | результат A1 лежит на позиции сцены, рассказчик пишет «в руках» (расхождение narration и committed state); ёмкость позиции ограничивает число полос | — |
| 119 | `data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_g4_npc_composition_bindings.json`, `data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/place_population_composition_rules.json`, `presence_rules.json` | строки G4 v2 и волны v1 D49 изменены на месте под тем же `{id, version, revision}`; существующие пары v17 надо пересобрать | — |
| 120 | `tools/spatial-v3/m2c-npc-wave-approval.mjs`, `data/world-catalogs/novgorod/m2c-npc-wave/v1/approval.json` | закрыто D131 #306: validator отклоняет `resign_required: true` | — |
| 121 | `data/novgorod-region/novgorod_occupations_v1_enriched.tsv`, `data/world-catalogs/novgorod/game-base-v1/occupations-activities/occupations/occupation_term_status.csv`, `game-base-v1/items-weapons-armour/military/security.csv` | недоказанный термин «сторож брода» и его занятие/снаряжение остаются; term-status помечен not_attested | — |
| 122 | `packages/items-property` A1 admission; `apps/game-server` A1 planner/wiring | A1 не сверяет вид материала и работоспособность результата | — |
| 125 | `apps/game-server/src/infrastructure/postgres/target-place-people-first-entry.js`, `packages/npc-runtime`, `apps/game-server/src/runtime/npc-routine-temporal.js` | typed gap при first-entry может потерять D-1 schedule context и не получить следующую календарную переоценку | [#227](https://github.com/PavelSlaven/Novgorod1230/issues/227) |
| 126 | `packages/time-events-history/src/calendar.js`, `packages/npc-runtime/src/routine-schedule.js` | month-boundary D-1 applicability остаётся отложенной; leap-day учёт в календаре исправлен | [#227](https://github.com/PavelSlaven/Novgorod1230/issues/227) |
| 127 | `apps/game-server/src/runtime/npc-routine-temporal.js`, D-1 `movement_handoff` profiles | два перемещения одного NPC в одном temporal window могут дать конфликт evolving CAS версии `entity_placements`; в текущих 161 утверждённых D-1 правилах handoff нет | [#227](https://github.com/PavelSlaven/Novgorod1230/issues/227) |
| 128 | `packages/turn/src/turn-step-admission.js:57–67`, `test/spatial-v3/prepared-destination-light-seam-postgres.test.js` | approved route operation отсутствует в проверенном continuation после ожидания; точный menu regression ждёт exit-one-action | [#227](https://github.com/PavelSlaven/Novgorod1230/issues/227) |
| 129 | `lower-dvina-trace-conversation-llm.js`, conversation prompt builders | разговорные роли получают канонический DTO, нарушение D72/D78; проекция P отклонена судьями 2026-10-05 | — |
| 130 | `apps/game-server/src/runtime/lower-dvina-trace-visible-item-label.js`, Lower Dvina phase-5 placed item templates | шесть видимых шаблонов не имеют утверждённой player-safe подписи; runtime обязан сохранять typed gap | — |
| 131 | `apps/game-server/src/runtime/lower-dvina-trace-turn-step-model-projection.js` | item/inventory rows с typed label gap временно скрыты от planner вопреки §7.2 | [#236](https://github.com/PavelSlaven/Novgorod1230/issues/236) |
| 132 | `apps/game-server` turn-step planner input projection | P-проекция группы 3 для intent_router и turn_step_planner не сделана; D72 service ids/version/counts остаются во входе | отдельная задача со своим стендом |
| 135 | `data/world-catalogs/novgorod/live-world-runtime-v17/capacity-v2-start-successors/*.start.json` | семь `player_inputs` задают роль, занятие и имя «Микула», вопреки D111; долг реализации #109 | [#109](https://github.com/PavelSlaven/Novgorod1230/issues/109) |
| 136 | `npc_family_household_contract.md`, `packages/actors/MODULE.md`, household data/import | нет утверждённых и импортированных данных дворов, необходимых для полноты мира | [#259](https://github.com/PavelSlaven/Novgorod1230/issues/259), [#338](https://github.com/PavelSlaven/Novgorod1230/issues/338) |
| 137 | `combat-min-data-v1/typed-gaps.json` (`G-RETREAT-MOVEMENT`), меню выбора NPC в бою | метрика D65 body-effect некорректна в сценах с пересекающимися предпочтениями; реального отхода в меню нет | [#426](https://github.com/PavelSlaven/Novgorod1230/issues/426) |

### Сводка LW-069…073 (CR #158 M2c)

| LW | Суть | Блокер релиза? |
|---|---|---|
| 069 | fresh-schema attestation: закрыто — действует v4 с digest текущего request; amendment v3 закоммичен | нет |
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
- **Что.** Deployment role defaults и local-play settings используют exact `qwen3.8-27b-uncensored-w4a16-tp2`. Gameplay требует настроенный OpenAI-compatible endpoint; пустая конфигурация остаётся `unconfigured` и завершается fail-closed, без provider/model fallback. Environment keys — `LLM_BASE_URL`, optional `LLM_API_KEY`, optional `LLM_MODEL` и `LLM_REQUEST_TIMEOUT_MS`.
- **Как жить.** Менять deployment provider config у `@rus/llm-runtime`, пользовательские settings и readiness — у game-server/game-web/local-play owners; не добавлять implicit fallback.

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
- **Что.** Старт v17 читает `world_base.temporal_authoring_records`; `bootstrap-live-world-v17.mjs` импортирует утверждённый temporal-v4 с readback (`collectApprovedTemporalBundle` / `buildApprovedTemporalImportSql`). Волну m2c NPC импортирует штатный bootstrap этапом `m2c_npc_wave_import` (D27, `scripts/v17-m2c-npc-wave-stage.mjs`); тестовое обогащение фикстуры (`withTestWaveEnrichment`) удалено.
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
- **Как жить.** WK не несёт день и месяц. Claim о событии внутри года закрывать условием события. При импорте истории завести `novgorod_famine_1230` (с 14.09.1230 по D19/D22), `novgorod_upheaval_december_1230` и поздние события голода отдельными id. Декабрьское событие пока ждёт утверждённой даты. Добавить скриптовую проверку, что event id из WK существует.
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

### LW-069 — fresh-schema attestation снято до нового прохода — **closed D27**
- **Где.** `data/world-catalogs/novgorod/live-world-runtime-v17/fresh-schema-request.json` + approval/execution attestations; Gate1 request v2.
- **Закрыто.** Действующая attestation `fresh-schema-approval-attestation-v4.json` совпадает с `request_digest` текущего `fresh-schema-request.json` (`ba989f53…`), Gate1 activation-amendment-v3 закоммичен; `checkV17BootstrapInputs` проверяет оба на каждом bootstrap.
- **Как жить (исторически).** После DONE-065/065b файл запроса пересобран (217 таблиц / 37 party migrations); прежний `request_digest`/утверждение Sol high больше не действует (WR §21.1). Не выполнять D27 bootstrap по старым attestation. Новый независимый проход утверждения (fresh-schema + Gate1 amendment v3) — до D27. Пин Gate1 amendment v2 на старый restart-test sha — исторический; Gate1 owner-data не перегенерируется (C11). Утверждение amendment v2 снято до v3.
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
- **Что.** Любой бандл с таблицами из `M2C_NPC_WAVE_TABLE_SET` (11 таблиц, включая `npc_schedule_routine_rules` и `place_population_composition_rules`) проходит wave-валидацию и при настоящем импорте требует `manifest.status === 'approved'`, подписанный approval (`authored_by` — `… (executor)`, `checked_by` — `… (owner|reviewer)`, личности после нормализации различаются; `manifest_path` сверяется с импортируемым manifest) и обёртку import+readback в одной транзакции. У людей `allowed_times` импортируется пустым `[]` (§8.1, LW-067). На том же PF приоритет состава над `presence_rules` для совпадающих `subject_ref`: при `presence_probability_ppm > 0` нужен `authoring_payload.creation_owner === 'composition'` (C006c2). Bootstrap импортирует волну этапом `m2c_npc_wave_import` (D27): `manifest.status` в репозитории остаётся `draft`, временная копия с `approved` собирается **до** аттестации (нужна, чтобы построить и сверить SQL), после аттестации идёт только commit. Решение «волна утверждена» держат `approval.json` и независимая аттестация request, а `manifest.status` — производный флаг копии. Поле `sql_builder.sha256` в утверждённых `request.json` фиксирует сборщик на момент утверждения запроса; байты SQL держит тест «v17 bootstrap bundle SQL stays byte-stable», а не живой пересчёт sha в request.
- **Как жить.** Не импортировать волновые таблицы без readback-обёртки и без approved manifest + reviewer approval. Repo `manifest.json` волны остаётся `draft`: его открывает только этап bootstrap. Чтение D-1/D-2 — только через `@rus/runtime-catalog` после spatial pin и runtime-catalog activation; production presence first arrival — consumer R-2a. `validateNpcRoutineProfile` пока не проверяет `location_ref`, `presence_state`, `absence_reason_ru` в фазах — расширение профиля в R-2.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-077 — R-2a presence consumer: discovery weights, subcategory, subregion, legacy region id в данных
- **Где.** `packages/materialization/src/presence-rules-first-arrival.js` (`choosePresenceDiscoveryMode`, `resolve_presence_rule` → `subcategory_ref: null`); `pickRegionalPresenceRule` / `loadG0RegionIdForSpatialNode` (`packages/runtime-catalog/src/m2c-npc-wave-readers.js`); PG wave slice: `test/spatial-v3/presence-rules-first-arrival-postgres.test.js` (`setupWorldPool`, UPDATE после import), `test/spatial-v3/presence-rules-composition-postgres.test.js` (`setupWorldPool`, тот же UPDATE); счётчик `tools/spatial-v3/count-presence-rules-roll-sites.mjs` (регион `region_novgorod_land`).
- **N8 / discovery.** Для item-producing правил (`item_ref` или непустые `variants`) оба допустимых режима с пустыми `entry_exposed_weight` / `search_concealed_weight` дают weighted draw 1:1 по ACTIVE §8.1:234; нулевые оба веса или отсутствующие режимы — typed gap/fail-closed. Не-item правила (без `item_ref` и `variants`) не задают discovery-поля и фиксируют `discovery_mode=exposed` без chooser/RNG. Отдельный committed шаг «скрытое наличие» / concealed discovery по-прежнему не реализован вне сохранённого режима броска.
- **§3A.4 `subcategory_ref`.** В `applyPresenceRulesFirstArrival` в aggregate всегда пишется `subcategory_ref: null`; сужение по подкатегории из правила не матчится.
- **Подрегион.** Движок сравнивает только **G0 `region_id`** места со `presence_rules.region_id`. Колонка/поле `subregion_scope` в данных (планируется задачей `region-ids`) в R-2a не читается.
- **Данные волны — закрыто D27.** Датасет волны пересобран на пине game-base 27bd6134: легаси-региона `novgorod_land` в нём нет (тест `m2c-npc-wave-v17-bootstrap-postgres.test.js`). Старые PG-тесты со своими копиями волны ещё содержат `UPDATE … novgorod_land → region_novgorod_land` — теперь без эффекта.
- **§3A.2/3A.3 сезонное обновление.** Повторное прибытие в **новом сезоне** в уже созданное G5-место (пересчёт `by_year_season` без нового scope) в R-2a **не** подключено; отложено отдельным шагом CR #158 (решение ревьюера REVIEW-R2a-6 F6). Unit на `encodePresenceRulePeriodNumber` остаётся.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-074 — post-action perception profile требует отдельного approval
- **Где.** `apps/game-server/src/runtime/lower-dvina-trace-phase-2.js` (`liveWorldTurnBundle` получает только отдельно утверждённый target profile); `apps/game-server/src/internal/target-runtime-profiles.js` (читает `post-action-perception-profile.json` только с approval); `apps/game-server/src/runtime/lower-dvina-trace-post-applied-actor-step.js` (перцепция и knowledge после фактического события).
- **Что.** Кандидат переносит M22-механику и ждёт независимого approval; пока его нет, production key остаётся `null`. Текущий production-путь формирует события только для реплики игрока. Слушатели проверяются только на той же позиции; распространения по G6 нет. В этой волне сохраняются perception, knowledge и `pending_npc_decision_refs`, но нет formal boundary, реакции NPC и отметки signal как обработанного. Погода не добавляет acoustic loss.
- **Как жить.** До profile approval не считать, что NPC live world уже восприняли действие. После подключения учитывать только persisted perception и knowledge; решение NPC и последствия принадлежат волне 2.
- **Issue.** #225

### LW-078 — R-2a: стартовое присутствие не повторяется при загрузке, если provisioning не выполнился
- **Где.** `apps/game-server/src/runtime/lower-dvina-trace-public-start.js` (вызов `provisionInitialOrdinary` после commit new_game); `apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js` (`provisionInitialOrdinary`, отдельная транзакция); путь загрузки партии (`getPartyScreen`) вызова не имеет.
- **Что.** Присутствие на стартовом месте решается второй транзакцией после commit new_game. Если процесс упал между ними, при загрузке партия останется без записанного присутствия стартового места: пустое присутствие ничего не хранит (typed gap только в диагностике resolver/provisioner), поэтому «не выполнилось» и «решено пустым» в БД неотличимы. Повтор на загрузке возможен только как идемпотентный перезапуск.
- **Открытый вопрос владельцу.** «Первое прибытие» для стартового места — момент старта (календарь `readInitialEnvironment`, состояние 0) или момент обработки (`readCurrentEnvironment` при `state_version > 0`)? От ответа зависят сезон и номер периода в ключе броска (§3A.1) при повторе после первого хода.
- **Как жить.** Окно сбоя узкое. Не добавлять хук в путь загрузки и не писать маркер «решено» без решения владельца и отдельного шага (граница game-server + insert-only контракт таблиц ordinary).
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-075 — runtime читает editorial-label файлы мимо `world_base` (CR #160)
- **Где.** `apps/game-server/src/infrastructure/postgres/spatial-v3-current-visibility-provider.js`, `spatial-v3-proposed-visible-sources.js` и общий `spatial-v3-exit-label-policy.js`; прямые каталоги: `m2c-local-edge-labels`, `m2c-exit-labels`, `m2c-pass-target-labels`, `m2c-canonical-connection-labels` и новый `m2c-exit-line-labels` (`approved-labels.mjs`, построчная Opus-attestation).
- **Что.** Текущая F3-последовательность для каждого уже допущенного выхода: уникальная в текущем месте утверждённая цель прохода → строка `approved_rows` нового каталога; если её подпись содержит только `выход N`, а прежняя утверждённая подпись `m2c-exit-labels` содержит цель, временно выбирается прежняя подпись → иначе прежняя подпись → typed gap `approved_exit_label_required` с местом и id выхода. У нового каталога APPROVE_WITH_LIMITS: 70/86 строк активны; остальные не используются, пока не появится новая attestation. Pass-target-файл по-прежнему читается без runtime-проверки хеша (AI §17: связь «файл = утверждённое содержимое» проверяет CI-тест `test/spatial-v3/m2c-pass-target-labels-attestation.test.js`).
- **Ответы AI §17 по каждому прямому каталогу.** (1) Attacker: отдельного attacker нет; владелец, меняющий собственный файл, не входит в threat model. (2) Trust boundary: между кодом и каталогами внутри одного репозитория границы доверия нет. (3) Ущерб без проверки: игрок может увидеть редакционную правку, не прошедшую утверждение; это дрейф текста, не компрометация механики или безопасности. (4) Почему недостаточно transaction/constraints/version/idempotency: эти средства защищают persisted rows и конкурентные/retry операции, а связь редакционного файла с решением Opus не хранится в `world_base`; для неё применяются имеющиеся проверки attestation, где они предусмотрены, без нового общего integrity слоя. `m2c-pass-target-labels` проверяется CI SHA-тестом без runtime digest; новый `m2c-exit-line-labels` сверяет SHA/ref и выбирает `approved_rows` своим существующим reader-ом. Не переносить одно поведение на все каталоги.
- **Остаток F3.** На шаге старой подписи остаются 8 выходов без утверждённой pass-target/line подписи: `cross_g4_14` forward (`old_channel_pool_hidden_link`); `vikhtuy_local_area_1` forward/reverse (`vikhtuy_locality_river_approach`, `vikhtuy_river_approach_water_approach`); `vikhtuy_local_area_2` forward/reverse (`vikhtuy_river_approach_water_approach`, `vikhtuy_resource_edge_river_edge`); `zaostrovye_archaeological_area_cycle` forward/reverse (`zaostrovye_landing_river_approach`, `zaostrovye_settlement_center_river_approach`); `cross_g4_16` reverse (`zaostrovye_settlement_center_river_approach`). Ещё 4 удержанных выхода имеют повторный pass-target; их прежние подписи с целью временно сохраняются вместо менее полезного ordinal: `cross_g4_14` reverse и `small_stream_network_1` forward (`tributary_mouth_main_river_approach`), `cross_g4_16` forward (`sheltered_landing_terrace_flood_edge`), `central_main_channel_1` forward (`central_navigation_reach_upstream_approach`). Редакции v4 четырёх линий (`cross_g4_14`, `small_stream_network_1`, `central_main_channel_1`, `cross_g4_16`) в runtime не действуют: соответствующие строки `m2c-exit-line-labels` остаются среди 16 withheld до отдельного Opus-утверждения; `south_main_channel_1` не меняется, обе его цели уникальны. **Опечатка в записи о происхождении:** `m2c-line-names/approval-attestation.json` → `composed_from[0].candidate_sha256` записан как `…2954f2f52a…`, верное значение по самому утверждению `ap-line-names-rev` — `…2954f2b52a…`. Файл утверждения закреплён SHA в `m2c-exit-line-labels/candidate.json:22`, поэтому не правится; на runtime опечатка не влияет (ca-final-slice-r4b-bugs, 2026-10-05).
- **Line-name data gaps.** `vikhtuy_local_area_1` (locality river approach ↔ water approach), `vikhtuy_local_area_2` (water approach ↔ resource-edge river edge) и `zaostrovye_archaeological_area_cycle` (Zaostrovye landing ↔ settlement-center river approach) не имеют утверждённого признака, связанного с участком линии. Их route/segment kind и environment совпадают; отличия natural/presentation у конечных G4 не доказывают свойство промежуточной трассы. Эти три пары остаются на шаге 3 старой утверждённой подписи и учитываются как редакционный data gap, а не как runtime `SPATIAL_V3_VISIBLE_CONTEXT_DATA_GAP`: fallback доступен, выходы не подавляются. Не выводить названия из endpoint-деталей; дальнейшее закрытие требует утверждённых route-correlated line data.
- **Как жить.** Пять каталогов выше — ограниченный набор текущего решения, а не образец для нового общего label-runtime; перенос в `world_base` — отдельная задача (CR #160, issue #160 «Решения владельца»). Для `m2c-exit-line-labels` разрешён только текущий reader из `approved_rows`; новую редакцию `candidate.json` подключать лишь по соответствующей точной attestation. Изменение любого из остальных каталогов требует его собственного прохода утверждения.
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

### LW-084 — environment presence rules game-base (lw-env, #176) не импортируются в v17
- **Где.** `scripts/generate-m2c-npc-wave-datasets.mjs` (`excludedEnvironmentPresenceRules`, `M2C_WAVE_PRESENCE_SUBJECT_KIND_UNSUPPORTED`); `data/world-catalogs/novgorod/game-base-v1/places-binding/presence/presence_rules.csv` (`subject_kind='environment'`, 1236 строк на пине 27bd6134); `infra/world-base/schema/27.sql:53` (CHECK на `subject_kind`).
- **Что.** lw-env добавил «спутники окружения» с новым видом правила `environment`. Его нет в §3A.1 (`category | social_role | occupation`), в DDL `world_base.presence_rules` и в движке R-2a, поэтому генератор волны их отсеивает и считает. Данные не потеряны: они существуют в game-base, но не активированы в runtime.
- **Как жить.** Не убирать отсев и не расширять CHECK попутно. Подключение — отдельный CR: §3A.1 + DDL 27.sql + engine/reader (Contract Auditor, по D32 одна правка DDL за раз).
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

### LW-085 — ладожская нерпа: 9 правил без регионального сужения попадают в штатный старт (D27)
- **Где.** `data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/presence_rules.json` (9 правил `fauna.mammal.marine_mammal.ladoga_ringed_seal` на `pf_hunting_ground` 4, `pf_lake_shore` 4, `pf_winter_ice_crossing` 1); `approval.json` → `limits_note`.
- **Что.** До game-base #189 (коммит 88555d24) эти правила имели регион `ladoga_lake`; единый G0-id оставил только `region_novgorod_land`. Теперь с D27 они импортируются в штатный bootstrap и могут выпасть на любом месте с этими place family в Новгородской земле — специфика озера держится только видом (`subject_ref`) и типом места.
- **Как жить.** Не считать нерпу привязанной к Ладоге. Возврат сужения — данные game-base (подрегион `subregion_scope` / отдельный регион озера) и их перегенерация волны отдельным шагом.
- **Issue.** [#158](https://github.com/PavelSlaven/Novgorod1230/issues/158)

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

### LW-094 — политика доступности читается файлом мимо `world_base`
- **Где.** `apps/game-server/src/infrastructure/postgres/spatial-v3-movement-availability-policy.js`; `data/world-catalogs/novgorod/live-world-runtime-v17/movement-availability-policy.v1.json` (+ attestation); таблица `world_base.spatial_v3_traversal_availability_policies` (`infra/world-base/schema/20.sql`).
- **Что.** Решение владельца «пять наборов условий открыты, свет и видимость линию не закрывают» лежит файлом. Таблица `spatial_v3_traversal_availability_policies` его не выражает: у неё `daylight_required`, `season_mode`, `unsupported_state_behavior = hard_block`, `fallback_behavior = forbidden` (гейт Lower Dvina), то есть противоположный смысл. Это не паттерн LW-075 (те файлы — редакторские подписи).
- **Ответы AI §17.** (1) Attacker: нет. (2) Trust boundary: нет, файл и код в одном репозитории. (3) Ущерб без проверки: правка файла без утверждения незаметно меняет доступность линий; ловит тест `movement-availability-policy.test.js` (sha256 файла против attestation, покрытие всех наборов из данных). (4) Constraints/version не годятся: таблицы под это решение нет.
- **Как жить.** Не добавлять runtime-хеш и не читать таблицу Lower Dvina для этого. Перенос в `world_base` с DDL, читающим `availability_state_not_evaluable` — этап 3 (сезоны), когда политика получит вычислимое состояние.
- **Issue.** —

### LW-095 — три формата метода движения
- **Где.** `packages/movement-routes/src/spatial-v3.js` (сравнение `allowed_movement_methods.includes(selected_movement_method_id)`); `apps/game-server/src/infrastructure/postgres/spatial-v3-current-movement-capability.js` (`movement.foot@1`); сегменты маршрутов в данных (`baseline_movement_method_id` = `movement.foot`); закрытый словарь v1 (`movement_method.walk`).
- **Что.** Планировщик сравнивает строки как есть; в возможностях игрока `movement.foot@1`, в сегментах `movement.foot`, в словаре `movement_method.*`. Сегодня timed-топологии v17 никто не строит; когда появится загрузчик маршрутов, все пешие опции станут blocked.
- **Как жить.** Не подгонять строку в планировщике. До загрузчика маршрутов со временем привести все три к `controlled_movement_method`.
- **Issue.** —

### LW-096 — гейты доступности вне вычислителя
- **Где.** `apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js` (`readApprovedCanonicalG5Connections`, ~:889-890), `packages/materialization/src/spatial-v3-generated-scene.js` (~:187 и :58), `apps/game-server/src/infrastructure/postgres/spatial-v3-local-scene-movement.js` (~:76, :86), `spatial-v3-local-movement-eligibility.js` (~:94).
- **Что.** Пять мест считают непустой `availability_condition_set_ref` непригодным без обращения к `evaluateConditionSet`. Сегодня недостижимо: во всех используемых профилях и рёбрах ref = NULL.
- **Как жить.** Единственный вычислитель — `assessAvailability` (`evaluateConditionSet`). Когда в данных, которыми пользуется рантайм, появится непустой ref, эти гейты нужно провести через него, а не добавлять ещё один.
- **Issue.** —

### LW-097 — v17 расходится с нормой линий Spatial 4.7.0
- **Где.** `apps/game-server/src/runtime/spatial-v3-site-traversal-runtime.js:33,155` (переход между местами только `cost_kind=action`, `duration: 0`; владелец — game-server + `@rus/movement-routes`); `apps/game-server/src/runtime/spatial-v3-current-visibility.js:29–34` (фильтр `visibility === 'none'` — закрыто фазой 0 rt-lines: линии при плохой видимости предлагаются, см. «Прогресс»); `lower-dvina-trace-public-start.js` (~:150–170) через `readCurrentConnectionDisclosure` показывает на первом экране только канонические связи, локальные рёбра и выходы на первом экране не раскрываются; подготовка канонической связи в fleet/rt-walk — `prepareCanonicalConnection` (`b77663a3`): отдельный P16-коммит `resolve_frontier:canconn:<party>:<binding>`, нет члена `preparation_snapshot`, trigger `frontier_resolution`; по норме — член `PrepareTargetSnapshot` с trigger `canonical_connection` (владелец — `@rus/materialization` + game-server; `spatial-v3-generated-expansion-adapter.js` в этом дереве относится только к generated expansion); подписи переходов «Проход N», «— выход N» (каталоги `m2c-local-edge-labels`, `m2c-exit-labels`, rt-walk `m2c-canonical-connection-labels`; владелец — `@rus/presentation`); world_base DDL и данные без полей линии, без `line_kind_profile` и минут перехода (владелец — `@rus/world-base`).
- **Что.** Стандарт 4.7.0 (Приложение F, machine contracts `4.7.0-target.1`) вводит линию, обязательное время перехода между местами, ближний порог видимости, каноническую связь G5–G5 с trigger `canonical_connection` и разворот на точке маршрута. Runtime v17 этого ещё не делает.
- **Как жить.** Норму не читать как proposed (она `ACTIVE` в своём scope; §0.9 стандарта), частичную активацию не делать (§0.4). Расхождения закрывать в CR реализации; до этого не строить новый код на action-cost переходе и на порядковых подписях.
- **Прогресс (rt-lines, фаза 0).** Закрыто: (1) `visibleCurrentTargets` больше не убирает линии при `none` (§7.1.1: только concealment; `local_edge`, `site_connection`, `directional_exit`; линия возвращается с `visibility: 'none'`), поэтому в тумане панель первого экрана и хода не пуста; (2) экран локального хода показывал проходы прежней позиции («Проход 2» без операции): `prepareLocalMovement` кладёт проходы места прибытия в `visible_seed.destination_movement_objects` (без статуса `occupied`: занятость проверяется при попытке); (3) проходы не попадают в прозу: источник утечки «В поле зрения — Проход N» — `lowerDvinaTraceObservedSceneChanges` (`580a25a2`), плюс вход рассказчика (`narrationWire`).
- **Фаза (а), шаг a1 (rt-lines).** Кандидат данных `spatial-v3/candidates/m2c-lines-v1` (binding@3 × 454 с полями линии, профили видов, альтернативные способы; имена — утверждённый каталог line-names) и генератор `tools/spatial-v3/build-line-wave.mjs` с отчётом; не утверждено, не импортировано, DDL нет. D56: потолка длины нет, 14 линий 31–48 мин — в волне, нарезаются политикой recheck вида (срез ≤ 30 мин — правило мира в валидаторе, поля `max_segment_minutes` в профиле нет). DDL (a3.2): `infra/world-base/schema/30.sql` — таблицы `spatial_v3_line_kind_profiles`, `spatial_v3_line_kind_alternative_methods`, nullable-колонки линии у привязок и сегментов маршрутов; `hazard_rule_ref` — текстовая ссылка без записей (как `risk_profile_ref`, `capacity_semantics_ref`: записей hazard нет). Импорт (a4): манифест `m2c-lines-v1-import-manifest.json` (dependency closure, draft, insert-only), пин `LINES_WAVE_MANIFEST` в bootstrap объявлен, но bootstrap волну не импортирует до cutover (б1: читатель берёт наивысшую версию binding).
- **Остаётся (после фазы 0).** Время перехода, линия и подписи, каноническая связь как член `PrepareTargetSnapshot`, данные и DDL — фазы (а), (б1), (б2), (в), (г). Из §7.1.1: (i) второй пункт (в тумане линия описывается по слуху и на ощупь, дальние ориентиры пропадают) не выполнен: выход в тумане показывает описание цели («в лес», `provider.js` `passTargetDisclosureForExit`) — фаза (в); (ii) `knowledge_visibility=hidden` не реализован: источника нет, `readCurrentTargetConditions` всегда отдаёт `concealment: 'clear'` (`spatial-v3-current-visibility-inputs.js:55–56`), так что скрыть линию сегодня нечем; (iii) устаревшие описания видимости сняты правкой корпуса (Spatial §0.9, `CONTRACT_INDEX.md`) и разделом «Где» этого LW; та же правка корпуса (D3, D56): потолок сегмента 30 мин и поле `max_segment_minutes` убраны (срезы recheck, `line_recheck_slicing_missing`), `availability_condition_set_ref` binding необязателен, разворот посреди segment (`returned_to_departure`), `dynamic_recheck_policy.fixed_time_interval` в норме; код и партийный DDL этого разворота — б1.
- **Issue.** [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133)

### LW-098 — присутствие NPC в сцене: временный прокси; авторские фазы и видимость на голом anchor
- **Где.** Прокси: `apps/game-server/src/runtime/lower-dvina-trace-scene-presence.js`. Голый `anchor_id` остался в `lower-dvina-trace-phase-9-conversation.js`, `lower-dvina-trace-m2-conversation-player.js` (`prepareTracePhase4PlayerConversationPlan`), `lower-dvina-trace-m2-conversation-phase4.js` (`contracts.anchors.shed`), `lower-dvina-trace-phase-4-admission.js`, `lower-dvina-trace-phase-8-accusation-command.js` (`accusationAvailable`), `lower-dvina-trace-phase-3-effects.js` (`visible_npc` по `destination.g5_anchor_id`), `lower-dvina-trace-player-safe-entities.js` (`sceneNpcIsVisible`), `lower-dvina-trace-m2-conversation-working-state.js` (`anchor_id` из `current ?? actor`, `position_id` от `actor`).
- **Что.** Команды разговора и слух/зрение слушателя (`liveWorldConversationCommands`, допуск фазы 3, capability, `audience`, `nonverbal`, `supporting-perception`, `exchange`) решают «в одной ли сцене» по правилу «тот же G6» (G6 акустически однороден, `default_clear` даёт видимость между позициями: `spatial_architecture_standard_g0_g6.md` §7.1–7.2, `scene_position_node` — единица ниже G6, §2.8). Порядок: текущая позиция NPC (`npc_schedule_runtime.current_position_node_id ?? npc.position_id`) и позиция игрока; та же позиция — да; иначе G6 обеих позиций (карта `state.scene_position_g6` текущего сайта и G6 игрока `position.g6_instance_id`), если оба известны; если G6 неизвестен (авторские сцены без `site_id`) — сравнение по g5 anchor; без anchor неизвестный G6 — не совместное присутствие; null никогда не равен null. Это прокси, он должен со временем делегировать владельцам видимости и акустики Spatial v3. Команды разговора предлагаются по совместному нахождению, а не по видимости (`sceneNpcIsVisible` знает только location/anchor/zone и остаётся вторым владельцем «виден игроку»). Реальная v17-позиция не имеет `location_ref`: разговор берёт `sceneLocationRef` (location_ref, иначе site_id).
- **Устаревший anchor при рутине.** Где G6 неизвестен (авторские сцены без карты; в v17 не срабатывает) присутствие решает anchor, а рутина anchor не обновляет: ушедший рутиной NPC авторской сцены продолжает слышать и адресоваться (тест `LW-098 known limit` в `lower-dvina-trace-generated-npc-conversation.test.js` фиксирует это как известное ограничение).
- **Как жить.** Не переносить авторские фазы 4/8/9 на сгенерированные сцены без перевода перечисленных мест на `npcSharesPlayerScene`. При появлении людей на канонических местах Вихтуя сверить `sceneNpcIsVisible` с адресуемостью.
- **Issue.** —

### LW-099 — NPC текущего сайта читаются в состояние хода отдельным читателем (rt-talk)
- **Где.** `apps/game-server/src/infrastructure/postgres/scene-npcs-readback.js` (`withSceneNpcs`; реэкспорт `withoutSceneNpcs`), `withoutSceneNpcs`/`withoutSceneRead`/`containsSceneNpc` определены в `apps/game-server/src/runtime/lower-dvina-trace-scene-presence.js`, вызов в `loadPhase2State` (`lower-dvina-trace-phase-2.js`), срез в писателях снимка (`state_payload:` в `lower-dvina-trace-phase-2/3/4…10-writes`, `combat-writes`, `turn-step-commit`; guard-тест в `scene-npcs-readback.test.js`).
- **Что.** Состояние хода несёт только NPC, запечатанных при старте партии; NPC, созданные при первом входе (сгенерированные и канонические места), лежат только в `party_npcs` + `entity_placements`. Читатель подмешивает NPC сайта игрока (`position.site_id`) с `position_id`, `g6_instance_id`, `runtime_source` и карту `scene_position_g6`; в снимок они не пишутся. Ограничения: (1) форма записи собрана в app-слое и дублирует `hydratedNpcs` из `packages/party-store` (нет `schedule_records`, `knowledge_records`, `check_body_state`, `relationships: []`); (2) читается в каждом вызове `loadPhase2State` (два запроса), включая replay/presentation/validateSession, где NPC не нужны; (3) берутся только placement `scene_position` (NPC на лодке и «внутри сущности» не читаются) и только с binding в `party_actor_profile_bindings`; (4) тело NPC (`check_body_state`) отсутствует, событие тела для него fail closed; (5) панель people строится из сохранённого payload без этих NPC.
- **Прогресс (#224, D65; частично).** Боевой readback дополнительно читает `party_actor_body_states` для NPC текущей сцены; `@rus/body-state` и combat working-state требуют версионированный approved initialization profile, а первый боевой P16 атомарно вставляет тело участника и последующие изменения обновляет с проверкой версии. Числа тела остаются во внутреннем состоянии и не копируются в LLM DTO или legacy `machine_state.body_condition.health`. `fleet/combat-data` commit `63b5ee1c` утвердил только scoped полосы и девять описаний собственного тела NPC; active v17 binding намеренно не передаёт профиль, поэтому метрики остаются typed gaps до authoritative actor scope и отдельного versioned cutover. Остальные ограничения LW-099 не закрыты.
- **Ещё.** (а) `withoutSceneNpcs` молча отбрасывает изменения записи NPC сцены в `next.npcs`: сохраняется только то, что пишется строкой в `party_npcs` (пути: `lower-dvina-trace-turn-step-prepared-state-projection.js:106`, `lower-dvina-trace-combat-state.js:34` — сейчас авторские). (б) Загрузчик выбирает NPC по `entity_placements`, а присутствие — по строке распорядка; рутина `entity_placements` не обновляет, поэтому NPC, приведённый рутиной на сайт, не загружается (ошибка в безопасную сторону; задача владельцу связки «рутина → размещение»). (в) `participant_slot_ref` undefined даёт ключ `"undefined"` в `actorMap` (`phase-6-carry-support.js:12`) и `actorRefs` (`combat-item-owner.js:79`). (г) Стартовый сайт до первого перехода: NPC, созданные при первом входе на канонические места, читаются только после того, как `position.site_id` есть в состоянии (пометка для rt-people); ссылка `location` для `site_id` не проверялась; идемпотентный повтор хода-разговора доказан PG-тестом (digest конверта считается от конверта без NPC сцены: они вырезаются из `semantic_exchange` в `consequence` команды разговора, `lower-dvina-trace-phase-3-conversation-command.js`, до `buildTurnStepCommitEnvelope`); экран replay сверялся только на наличие записи, не побайтно; `exchange.js` сохранил запасную ветку по локации для авторских фаз.
- **Инвариант.** Команда, чей consequence несёт копию состояния (рабочее состояние обмена, `world_state.npcs`, карта `scene_position_g6`), вырезает NPC сцены **до** конверта хода: конверт и его digest-ы идемпотентности считаются от вырезанного объекта (сейчас это делает команда разговора фазы 3 через `withoutSceneRead`). Фильтр писателей снимка (`withoutSceneNpcs`) — только страховка снимка. `bindLowerDvinaTraceTurnStepIdempotency` (одна точка всех 9 путей коммита) падает `TRACE_TURN_STEP_SCENE_NPC_IN_ENVELOPE`, если запись сцены осталась в конверте. Латентные пути без вырезания (сейчас недостижимы: авторские контракты без `site_id`): `phase-4-semantic-command.js:223`, `turn-10-command.js:79`, `npc-actor-step-mode-handoffs.js:199` (→ `consequence.state_changes`), `combat-command.js:70`; при переводе на сайты v17 они получат громкую ошибку, вырезание нужно добавить в команду.
- **Как жить.** Не считать `state.npcs` полным списком NPC места вне `loadPhase2State`. Новые писатели снимка обязаны вызывать `withoutSceneNpcs` (guard-тест это проверяет). Владельцу загрузки состояния — перенести чтение в общий читатель формы NPC и добавить флаг «без NPC» для replay/validation.

### LW-100 — A1: назначение результата без `g5_anchor` (rt-items, rt-make)
- **Где.** `apps/game-server/src/infrastructure/postgres/action-produced-authority-loader.js` (`loadActionProducedOutputDestination`), `action-produced-atomic-write-plan-pins.js` (`validateActionProducedDestinationPin`, `actionProducedOutputPlacement`), `action-produced-physical-keys.js`, `action-produced-persistence-context.js`, `action-produced-persistence.js` (`insertResult`).
- **Что.** После перехода ходьбой у `party_positions` `g5_node_id` и `g5_anchor_id` пусты (стандарт Spatial §8.1: позиция — только `party_journey_location`; якорь — легаси), не только у сгенерированных G5, но и у канонических мест (`water_access`, `meeting_area`). Раньше пин назначения не строился, проверка применимости искала `undefined` (`M2C_TARGET_A1_APPLICABILITY_DATA_GAP`), результату некуда было встать. Исправлено (rt-make): пин `party_current_scene_position` с `anchor_id: null`, результат пишется в `party_item_placements.scene_position_id`; на стартовом месте (якорь есть) путь прежний. Проверено PG-тестом на старте, `water_access` и `meeting_area` (слот позиции тест не проверяет).
- **Как жить.** Ветка с якорем остаётся для стартового места; не удалять, пока старт не потеряет якорь. Не проверено PG-тестом: сгенерированные (capacity-v2) G5; при проверке убедиться, что пин строится и там.
- **Issue.** —

### LW-101 — повторное «взять» того же материала (rt-items)
- **Где.** `packages/turn/src/ordinary-materialization-discovery-identity.js` (`candidateForDiscovery`), `apps/game-server/src/internal/lower-dvina-trace-ordinary-materialization-profile.js` (`max_resolution_records === 4`), планировщик шаг 2.
- **Что.** Идентичность O1 = цель + нормализованный запрос + количество, поэтому повторное «взять» из того же источника с теми же значениями отдаёт уже сохранённое решение без нового предмета (следствие правила D1: запрос = подпись источника); агрегат хранит не больше 4 записей на место (вместе с записями presence); живой прогон: первая порция берётся, «ещё» — нет, а «три палки» создаёт предметы на месте, но второй шаг планировщика повторяет discovery вместо `move_entity` из-за уже удерживаемого предмета с тем же именем.
- **Как жить.** Не считать многократный сбор решённым: PG-тест берёт разные количества. Правка — решение владельца: идентичность взятия конечного источника по ходу, потолок записей, различимые имена/ссылки на шаге 2.
- **Issue.** —

### LW-102 — инструмент для тростника и живого дерева не проверяется кодом (rt-items)
- **Где.** `data/world-catalogs/novgorod/m2c-items/candidate.json` (`extraction.tool_and_action_precondition` у `cut_reeds` и `cut_standing_wood`), `data/world-catalogs/novgorod/live-world-runtime-v17/m2c-finite-source-capability-candidate.json`.
- **Что.** «Режущий инструмент» — текст данных; у предметов нет таксономии инструментов, код ничего не проверяет. Валежник и плавник инструмента не требуют.
- **Как жить.** Не добавлять проверку без таксономии инструментов (данные + утверждение). На срезе брать валежник и плавник.
- **Issue.** —

### LW-103 — живой Qwen и форма A1-плана (rt-items, rt-make)
- **Где.** `apps/game-server/src/runtime/lower-dvina-trace-turn-step-planner-instructions.js` (правила `action_production`), `packages/turn/src/turn-step-plan-repair.js` (`requiresSemanticRepair`), `packages/turn/src/turn-step-contracts/action-production-operation.js`, `apps/game-server/src/runtime/lower-dvina-trace-turn-step-grounding-audit.js`.
- **Что.** Три разных источника отказа «сделать», не путать:
  1. **Форма плана (исправлено).** Модель ставила `result_class: ordinary_physical_result` вместе с `source_fact_delta` и `material_extent: minor` и писала `source_fact_delta.physical_form: "none"`. Правило промпта теперь называет `partial_transformation` и `allowed_physical_forms`; одиночный `enum` на `physical_form` получает один LLM-ремонт (норма `turn_step_llm_contract.md:1369–1389`: ремонт допустим для ошибки, требующей нового семантического выбора). Стенд `benches/rt-make-a1` (реальная Qwen, water_access): без правки принято 15 из 28; с правилом 16 из 17 на общей партии; на свежей партии на фразу (26 ходов без ремонта, 22 с ремонтом): отказов по форме 3 → 0, принято 15/26 → 18/22 (p=0.12 по Fisher: улучшение направленное, не доказанное).
  2. **Код `ordinaryDenial` и «direct semantic activity» (не шум аудитора).** Планировщик сам выбирает буквальный отказ (`resolution: direct`, `not_achieved`) или расходящуюся активность; код отвергает («Literal physical denial must use the available grounded owner», `grounding-audit.js:66-70`; «Direct semantic activity is not grounded by the current intent»). На стенде это 8 из 26 и 4 из 22 ходов (0 до правки промпта на общей партии), в живом rtmake2 — ход 22.
  3. **Аудитор `pass:false`.** 11 из 62 вызовов аудитора (аудит rt-make); чаще всего он снимает ремонт, а не рвёт валидный план.
  4. **Контрактный no-op и путь description (gate2).** A1 `request_item_use` с `action_production` теряет лишний `description` до общей strict/semantic validation. Комбинация `direct` + пустые `operations` + `reality_limited` + `achieved` распознаётся до semantic audit, получает один обычный semantic repair и при повторе нормализуется в `not_achieved` с trace `canonicalizations`; прочие ошибки после repair остаются typed fail. D41 нейтрален: сочетание — 0/33 в обоих плечах A и C.
- **Как жить.** Не подгонять валидатор под иные ошибки модели: repair остаётся один и разрешён только для semantic mismatch. Точная no-op комбинация из active-контракта и лишний A1 `description` имеют закрытые нормализации; повтор пунктов 2–3 — отдельная задача на планировщик/аудитора со стендом.
- **Issue.** —

### LW-104 — применимость профилей v17 закреплена на шаблонах @1 (rt-items)
- **Где.** `data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-approved.json` (`applicability`: 32 generated-шаблона @1 и один канонический G5), `apps/game-server/src/internal/target-runtime-profiles.js`.
- **Что.** У сгенерированных сайтов v17 `generated_template_ref.authoring_version = "2"` (capacity-v2), список — @1, поэтому ни одно generated-место не совпадает. Для A1 введено классовое правило `a1-applicability-class.json` (ждёт утверждения); тот же массив питает N1 и остаётся несовместимым.
- **Как жить.** Не править утверждённый файл. Для N1 — вывод @2 из утверждённых @1 по правилу capacity-v2 (`deriveApprovedGeneratedSceneV2Bindings`) или классовое правило владельца N1.
- **Issue.** —

### LW-105 — масса порции конечного источника не проверяется владельцем предмета (rt-items)
- **Где.** `data/world-catalogs/novgorod/m2c-items/README.md` (`M2C_FINITE_FIXED_MASS_OWNER_VALIDATION_REQUIRED`), `packages/items-property`.
- **Что.** Профиль задаёт 50 г на порцию, проверка `mass_grams = quantity × 50` есть в `packages/turn` (presence) и phase-6 commit, но владелец предмета (`@rus/items-property`) её не выводит и не проверяет.
- **Как жить.** Не считать массу порции гарантированной владельцем предмета; закрывается отдельной правкой items-property.
- **Issue.** —

### LW-107 — NPC гостевых и путевых контекстов остаются без имени (rt-names)
- **Где.** `data/world-catalogs/novgorod/npc-identity-v17/v1/context-bindings.json` (привязаны только два контекста «Новгородская земля»), `packages/materialization/src/npc-identity.js` (`pickNpcName`), `scripts/v17-npc-identity-stage.mjs` (approved по паре «пул + народ»).
- **Что.** Для контекстов Готланд, «Немецкие города Балтийского торгового круга», Корела, Ижора нет ни строки привязки, ни достаточного пула: в `name_pool_entries.csv` у `pp_fg001`, `pp_fg005`, `pp_izhora` по одной ordinary-строке, у `pp_fg002` 16 мужских и ни одной женской, `pp_korela` нет вовсе. Эти 19 ordinary-строк иноземных народов импортируются `draft` и не выбираются. Такой NPC получает `identity_state.canonical_name = null` и `name_provenance.reason = 'no_pool_binding'`; разговор идёт без самопредставления по имени.
- **Как жить.** Решение владельца D51: у иноземных народов будут отдельные пулы (потом это новые регионы), запасной вариант с русским пулом не делаем. Авторинг этих пулов — отдельная задача данных; после неё — строки привязки, статус `approved` по паре «пул + народ» и переутверждение запроса стадии `npc_identity_import`.
- **Issue.** —

### LW-108 — имена двух NPC одной сцены могут совпасть (rt-names)
- **Где.** `packages/materialization/src/npc-identity.js` (`pickNpcName`), `packages/materialization/src/generated-npc-bindings.js`.
- **Что.** Имя выбирается по seed каждого NPC отдельно, материализатор не знает других NPC сцены. Пул Новгорода: 204 мужских и 62 женских ordinary-строки, вероятность совпадения пары порядка 1/200 (мужские) и 1/60 (женские).
- **Как жить.** Не считать имя уникальным ключом сцены. Исключение уже выбранных имён — в задаче rt-people, где создаются группы людей на месте (передать занятые имена в `compileGeneratedNpcBindings`).
- **Issue.** —

### LW-109 — характер только при полных данных занятия; срок пула не проверяется (rt-names)
- **Где.** `packages/materialization/src/npc-identity.js` (`pickNpcCharacter`), `packages/runtime-catalog/src/procedural-scene-records.js` (`readNpcIdentityCatalog`), `infra/world-base/schema/29.sql`.
- **Что.** `semantic_state.character` пишется целиком или не пишется: у занятия без цели или без страха (например `nov_occ_court_clerk_service`, `nov_occ_healer_herbal_helper` без страхов) поля нет, и разговор идёт без `npc_behavior`. Читатель не сверяет `valid_from`/`valid_to` пула и дату старта.
- **Как жить.** Не заполнять недостающее в коде: добить данные занятий в game-base. Проверку срока пула добавлять вместе с сезоном/датой старта в загрузчик, если появится пул с другим периодом.
- **Issue.** —

### LW-110 — вторая проекция `name_profile_snapshot` в generated first-entry (rt-names)
- **Где.** `apps/game-server/src/infrastructure/postgres/generated-npc-first-entry.js` (`nameProfileSnapshot`), владелец — `projectNameProfileSnapshot` в `packages/new-game/src/stages/stage-24-party-db-write-plan/code/lower-dvina-trace-persisted-projection.js`.
- **Что.** Канонический старт получает снимок имени из stage 24, generated first-entry строит его своей функцией на те же ключи `canonical_name`/`name_provenance`. Публичный API stage 24 ограничен 8 экспортами (`architecture:check`), поэтому общий экспорт не добавлен.
- **Как жить.** Не добавлять третью проекцию. Когда у stage 24 освободится слот API или проекция уйдёт в общего владельца, заменить локальную функцию вызовом владельца.
- **Issue.** —

### LW-111 — цели и страхи не привязаны к реестру занятий, контекст без версии (rt-names)
- **Где.** `infra/world-base/schema/29.sql` (`occupation_character_items`, `npc_regional_context_name_bindings`).
- **Что.** У `occupation_id` нет FK: 33 занятия из 97 (165 строк из 423) не входят в 68 занятий реестра `region_occupations`. Привязка контекста к пулу хранит `regional_context_id` без версии, поэтому одна строка покрывает все версии контекста (@1 и @2 в датасетах).
- **Как жить.** Не считать строки целей и страхов доказательством, что занятие есть в реестре; читатель берёт только занятия бандла. Если появится версионирование контекстов с разными народами — добавить версию в ключ привязки.
### LW-113 — фоновое описание N1 не покрывает людей канонических мест (rt-people)
- **Где.** `apps/game-server/src/runtime/releases/lower-dvina-trace-n1-production.js` (`resolveNpcOrdinarySemanticParticipant`), `apps/game-server/src/internal/target-runtime-profiles.js` (применимость N1 по `npc_composition_ref`).
- **Что.** Человек канонического места создаётся из D-2 состава place family или правила присутствия; в его `source_binding` нет `npc_composition_ref` (есть `place_population_composition_ref` / `presence_rule_ref`), а применимость N1 строится по G4-составам. По чтению кода осмотр такого человека не получит N1-описание (остаётся код-описание внешности); не проверено запуском.
- **Как жить.** Не расширять применимость N1 молча; отдельное решение владельца N1 (применимость по PF-составу или по профилю).
### LW-114 — поле `sex` субъекта D-2 состава не исполняется (rt-people)
- **Где.** `data/world-catalogs/novgorod/game-base-v1/places-binding/presence/people_composition_authoring.json` (`weighted_subjects[].sex`), `packages/materialization/src/place-people-first-arrival.js`.
- **Что.** Для pf_outbuildings состав задаёт мужчину-слугу (уверенность C); резолвер людей пол не читает, пол берёт материализатор из демографического профиля.
- **Как жить.** Пол человека задаётся профилем: `payload.actor_applicability.sex_category` с одним значением исполняется материализатором (A-rt-people-06); у профилей без поля и у двух значений пол по-прежнему по seed, поле `sex` субъекта D-2 не читается. Не считать пол слуги на месте гарантированным, пока профиль не задаёт его.
### LW-115 — исходы людских правил лежат в агрегате и там, где людей никто не создаёт (rt-people)
- **Где.** Движок `packages/materialization/src/presence-rules-first-arrival.js`; агрегат строят `apps/game-server/src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js` (place families G4 сгенерированного G5) и `ordinary-materialization-first-entry-provisioning.js` (стартовое provisioning).
- **Что.** Движок пишет исходы правил `occupation`/`social_role` в каждый агрегат, который строит (§3A.1), а людей по ним создаёт только first-entry канонического места. В committed-агрегате сгенерированного G5 или старта может лежать «охотник ×1» без человека.
- **Как жить.** Не читать людские записи агрегата как присутствующих людей вне канонического first-entry. Будущий реализатор людей на других местах дедуплицирует их с G4-составом так же, как `owned` в `wantPlacePeople`.
### LW-116 — `/_DATA_GAP$/` мягко захватывает и неоднозначность (rt-people)
- **Где.** `apps/game-server/src/infrastructure/postgres/target-place-people-first-entry.js` (`isDataGap`), коды материализатора `PROCEDURAL_NPC_APPROVED_RECORD_DATA_GAP`, `PROCEDURAL_NPC_…_TEMPORAL_DATA_GAP`.
- **Что.** Те же коды поднимаются и при отсутствии записи, и при `matches.length !== 1` (неоднозначная утверждённая ссылка). Для людей канонических мест оба случая мягкие (нет человека, gap в trace), хотя неоднозначность должна быть hard block (read-only DB §3).
- **Как жить.** Не расширять список мягких кодов. Follow-up: разделить missing и ambiguous в материализаторе отдельными кодами.
### LW-117 — природная ветка канонического first-entry не пишет свой агрегат из профиля (rt-people)
- **Где.** `apps/game-server/src/infrastructure/postgres/target-generated-first-entry.js` (агрегат в памяти для людей), `finiteFirstEntryProfile.technical_limits.max_resolution_records`.
- **Что.** В ветке commons с конечными источниками агрегат присутствия пишет natural-владелец, а людские исходы читаются из копии агрегата в памяти. Без `max_resolution_records` копию не построить: людские правила не читаются, в trace лежит typed gap `people_presence_aggregate_unavailable`.
- **Как жить.** Профиль v17 `max_resolution_records` задаёт; не полагаться на людей по правилам при неполном профиле.
### LW-119 — строки G4 v2 и волны v1 D49 изменены на месте под тем же {id, version, revision} (people-data)
- **Где.** `data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_g4_npc_composition_bindings.json` (`…vikhtuy_locality`, версия 2), `data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/place_population_composition_rules.json` и `presence_rules.json` (D-2, волна v1).
- **Что.** Пороги D49 поменяли содержимое строк без новой версии: G4 v2 `min_count 0 → 1`, три D-2 состава и −3 правила присутствия. Допустимо только потому, что пара v17 пересоздаётся заново, без обратной совместимости (`people-d49/approval.json`, `approval_note`).
- **Как жить.** Все существующие пары v17 пересобирать (bootstrap заново). Не полагаться на неизменность этих строк в старой базе; будущие правки этих данных — новой версией или новой волной.
### LW-120 — валидатор approval волны не знает `resign_required` (people-data) — **closed D131 #306**
- **Где.** `tools/spatial-v3/m2c-npc-wave-approval.mjs`, `data/world-catalogs/novgorod/m2c-npc-wave/v1/approval.json`.
- **Что.** Валидатор требует непустые `checked_by`/`checked_at` и не читает `resign_required`: подпись под старым пином машинно валидна. От неподписанных данных защищает только несовпадение аттестации запроса (`request_digest`).
- **Исправлено.** Валидатор отклоняет `resign_required: true` с `M2C_WAVE_APPROVAL_RESIGN_REQUIRED`; тест проверяет отказ и принимает запись без маркера или с `false`.
### LW-118 — результат A1 лежит на сцене, а рассказчик пишет «в руках» (rt-make)
- **Где.** `apps/game-server/src/infrastructure/postgres/action-produced-authority-loader.js`, `action-produced-atomic-write-plan-pins.js` (`actionProducedOwnerOutputDestination`: `placement_kind ∈ {anchor, scene_position}`), `packages/items-property/src/action-produced-transition-entities.js`; рассказчик — `apps/game-server` narration (проекция committed-изменений).
- **Что.** Независимый выход A1 попадает на позицию сцены (на старте — на якорь). Игрок «оторвал полосу» — вещь лежит под ногами, а рассказчик пишет «В твоих руках лежит отрезанный кусок». Это расхождение narration и committed state; владелец — narration (рассказчик не должен утверждать место, которого нет в committed). Сцена занята вещью: ёмкость позиции ограничена (7), при большом числе полос ход отвергается `ACTION_PRODUCED_DESTINATION_CAPACITY`.
- **Как жить.** Не подменять место в обход владельца. Смена контракта («в руки» для частичного отделения от несомой вещи, `holder_ref` в owner-destination) — отдельное решение владельца items-property. Пока — правка narration: не называть руки, если результат на сцене.
- **Issue.** —
### LW-121 — термин «сторож брода» придуман каталогом, а занятие и снаряжение сторожа остаются (ferry-guard)
- **Где.** `data/novgorod-region/novgorod_occupations_v1_enriched.tsv:7` (`nov_occ_crossing_guard`, `historical_term` «сторож брода»; sha зашит в 32 файлах: authored start, first-playable, релиз v17, `actor-base-attributes`), `game-base-v1/occupations-activities/occupations/occupation_term_status.csv`, `game-base-v1/items-weapons-armour/military/security.csv` (`ms_post_ferry_crossing`, `equipment_profile_ref eq_crossing_guard`).
- **Что.** Решение владельца D53: сторожа на перевозе нет в источниках (в индексе книг точные фразы «сторож брода/переправы/перевоза» — 0 попаданий). Из данных убраны группа состава D-2, расписания и производные пары на `pf_ferry_landing` и `pf_winter_ice_crossing`; пост переформулирован («перевозчик у переправы в тревогу»). Само занятие (D38), его снаряжение, инструменты, одежда, страхи и профиль актёра остаются. Термин в TSV не исправлен: правка меняет sha, зашитый в authored start и релиз v17. Строки волны v1 и пака v2 изменены на месте (как LW-119): пару v17 пересобирать. Ссылка поста перевозчика на `eq_crossing_guard` (нож, топор, посох, копьё) висит без производных строк: в `role_tier_pf_crosswalk` её 0, у перевозчика `equipment_entry_ids` пуст, копьё к нему не попадает; снять ссылку ничего не стоит — вопрос к владельцу вместе с `bridge_crossing` в `pf_ids` поста.
- **Как жить.** Не использовать «сторож брода» как источник и в тексте игроку; помета `not_attested` в `occupation_term_status.csv` протухнет сама (проверка `validate.py`), когда TSV поправят. Термин исправить при ближайшем перепине TSV. Снаряжение поста перевозчика — отдельная правка.

### LW-122 — A1 не проверяет вид материала и работоспособность результата (a1-physics)
- **Где.** A1 physical admission в `packages/items-property` и planner/wiring в `apps/game-server`.
- **Что.** A1 проверяет массу, доступ, количество, класс выхода, требование инструмента и режим идентичности, но не сохраняет и не проверяет вид материала и не устанавливает, может ли результат работать по своему назначению. Если модель предложит такой план, «прялка из рубахи» или «меч из рубахи» могут пройти A1. Снятие `needs_check` с действий игрока в D59 не создаёт этот пробел, но делает его видимым и для имён из прежнего списка.
- **Как жить.** Не считать положительный A1 admission доказательством подходящего материала или работоспособности. Отдельная задача `a1-physics` должна использовать знания мира о технологии и сохранять/проверять вид материала.
- **Issue.** —

### LW-125 — first-entry location gap может потерять календарный D-1 контекст (npc-season)
- **Где.** `apps/game-server/src/infrastructure/postgres/target-place-people-first-entry.js` (обработка typed selection gap), `packages/npc-runtime` (schedule context и следующая boundary), интеграция в `apps/game-server/src/runtime/npc-routine-temporal.js`.
- **Что.** Если будущий утверждённый стартовый D-1 bundle одновременно даёт `location_gap` и не позволяет выбрать ровно одно правило, first-entry сохраняет typed gap, но после сборки runtime может не сохранить schedule context для повторного выбора на календарной границе. Для текущих утверждённых стартов issue #227 это условие недостижимо; проверено по доступным правилам, не отдельным live-сценарием.
- **Как жить.** Не подставлять generic routine или выдуманное место. Если появится утверждённый случай с таким gap, владелец `@rus/npc-runtime` решает сохранение/переоценку контекста, а game-server только интегрирует; сначала покрыть first-entry и календарную границу тестом.
- **Issue.** [#227](https://github.com/PavelSlaven/Novgorod1230/issues/227)

### LW-126 — month-boundary D-1 applicability остаётся отложенной (npc-season)
- **Где.** `packages/time-events-history/src/calendar.js` (`dayOfYear`), вызывается month-boundary applicability в `packages/npc-runtime/src/routine-schedule.js`.
- **Что.** Календарный owner `@rus/time-events-history` исправил учёт дополнительного дня юлианского високосного года в `dayOfYear` (c01dc6fe). При этом month-boundary applicability D-1 в `@rus/npc-runtime` остаётся отдельной отложенной работой и текущими данными не включена: применимость расписаний задана по сезонам.
- **Как жить.** Не включать month-boundary переоценку D-1 без отдельной задачи владельца `@rus/npc-runtime`; перед включением покрыть границу месяца и повторный выбор правила тестом. Календарная leap-day зависимость исправлена владельцем календаря.
- **Issue.** [#227](https://github.com/PavelSlaven/Novgorod1230/issues/227)

### LW-127 — несколько D-1 перемещений могут конфликтовать по placement CAS (npc-season)
- **Где.** `apps/game-server/src/runtime/npc-routine-temporal.js` (`routinePlacementWrites` и `npcRoutineTemporalRegistration.resolve`), утверждённые D-1 `movement_handoff` profiles.
- **Что.** Если когда-либо утверждённый набор расписаний даст одному NPC два завершённых `movement_handoff` в одном temporal window, адаптер берёт placement CAS из evolving `row.npc_placement.state_version`: фрагменты ожидают версии `[1, 2]`, хотя в БД до коммита есть только версия `1`. Общая temporal integration отвергнет такой план. В проверенных 161 утверждённых D-1 правилах `movement_handoff` нет; это отложенный риск, не текущий путь данных.
- **Как жить.** Не включать такой набор расписаний без регрессии двух смен позиции в одном окне. Перед включением привязать все placement CAS фрагменты к исходному persisted `entity_placements` snapshot того же temporal window и сохранить одну итоговую запись версии.
- **Issue.** [#227](https://github.com/PavelSlaven/Novgorod1230/issues/227)

### LW-128 — маршрутное меню continuation ждёт владельца exit-one-action (npc-season)
- **Где.** `packages/turn/src/turn-step-admission.js:57–67`; production PG regression `test/spatial-v3/prepared-destination-light-seam-postgres.test.js`.
- **Что.** В проверенном PG continuation после ожидания имел правильную позицию `forest_path/departure` и видимый approved connection ref, но `available_domain_operations` и `local_world_process.allowed` были пусты. Список исходных domain operations переиспользуется на continuation. Это наблюдение относится к проверенному переходу, не доказывает потерю операций во всех continuation; пересчёт передан владельцу exit-one-action.
- **Как жить.** Не синтезировать маршрут, не обходить меню и не ослаблять exact `target_ref`/`route_ref` assertion. PG seam regression остаётся явно pending до обновления continuation menu владельцем; затем снять skip и повторить проверку clock, destination package и restart.
- **Issue.** [#227](https://github.com/PavelSlaven/Novgorod1230/issues/227)

### LW-129 — разговорные роли передают модели канонический DTO (npc-conversation)
- **Где.** `apps/game-server/src/runtime/lower-dvina-trace-conversation-llm.js` и builders разговора с NPC.
- **Что.** Вход разговорных ролей — канонический DTO, нарушение D72/D78; проекция P отклонена судьями 2026-10-05 (опора 1,58 → 1,28); условие закрытия — проекция, прошедшая стенд.
- **Как жить.** Не добавлять непроверенную проекцию в production; модель продолжает получать pre-P DTO. Закрывать долг только после отдельного стенда с принятым качеством опоры.
- **Issue.** —

### LW-137 — D65 body-effect не измеряет влияние тела на выбор во всех сценах (combat-min)
- **Где.** `data/world-catalogs/novgorod/live-world-runtime-v17/combat-min-data-v1/typed-gaps.json` (`G-RETREAT-MOVEMENT`); меню выбора NPC в бою `apps/game-server/src/runtime/lower-dvina-trace-combat-llm.js`. Стенды D65 (RESULT ids ниже) — артефакты моста флота, не в репозитории.
- **Что.** Baseline `RESULT 20261005T014614.534569Z-1` и one-sentence follow-up `RESULT 20261005T063228.683049Z-1` оба дали 0/4 сцен по метрике. В сценах 2–4 здоровый уже набирает 2/2: классы допустимых предпочтений пересекаются и требуют больше hit rate, чем потолок, поэтому сравнение `wounded/exhausted > healthy` там некорректно. Сцена 1 остаётся содержательной: NPC ранен/измотан при угрозе на расстоянии удара, но меню не даёт физически выполнимого отхода; сдача или прекращение враждебности при продолжающейся угрозе не задают очевидно лучшего выбора. Судьи v4 отдельно отметили причины без упоминания тела. Результаты не доказывают отсутствия влияния тела; body-фраза эффекта не показала и в production prompt не принята.
- **Как жить.** Не трактовать 0/4 как общий вывод о влиянии тела и не менять постоянные цели профиля или проекцию. Повторить проверку после появления реального варианта отхода; сравнивать выбор между действиями одного и того же класса предпочтений при разных телесных состояниях.
- **Issue.** —

### LW-130 — безымянные шаблоны Lower Dvina ждут утверждённых подписей (prompt-rev-turn)
- **Где.** `data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-5-content/item-container-set.json` (`placement_slot_ref`), resolver `apps/game-server/src/runtime/lower-dvina-trace-visible-item-label.js`, current-visible/WK/narrator/screen projections.
- **Что.** `trace_ld_v1_item_blue_wool_fragment`, `trace_ld_v1_item_cut_bag_fastening`, `trace_ld_v1_item_persistent_debris`, `trace_ld_v1_item_broken_oar`, `trace_ld_v1_item_side_collision_trace`, `trace_ld_v1_item_hidden_trunk_trace`, `trace_ld_v1_item_carry_poles` и `trace_ld_v1_container_road_bag` пока не имеют утверждённой подписи для всех путей показа. Сценовые наблюдения не являются стабильными подписями вещей.
- **Как жить.** Не придумывать имя или категорию: сохранять typed `player_safe_item_label_required` gap для проекции модели и убирать саму строку из публичного видимого пакета с записью счётчика диагностики. Закрыть запись после утверждения подписей владельцем данных и снятия соответствующих исключений. Два acceptance-теста старого прохождения Phase-11 пропущены с причиной D97; по D101 их нельзя удалять до переноса сюжета в старт v17 и полного прогона.
- **Issue.** [#236](https://github.com/PavelSlaven/Novgorod1230/issues/236) (D92: у каждой вещи есть имя — утверждённое или название общей категории).

### LW-131 — typed-gap вещи временно исключены из turn-step model inventory (prompt-rev-turn)
- **Где.** `apps/game-server/src/runtime/lower-dvina-trace-turn-step-model-projection.js` проецирует `items` и `inventory.items` в planner/auditor payload.
- **Что.** Item rows, связанные с точным typed `player_safe_item_label_required`, не доходят до планировщика, вопреки требованию полного player-safe набора в `turn_step_llm_contract.md` §7.2. Это временное отступление A-05-02, принятое из-за решений владельца D92 и D97: вещь без имени не должна существовать, а безымянная вещь должна получать закрытый отказ. В Lower Dvina остаются пробелы подписи у `trace_ld_v1_item_carry_poles` и `trace_ld_v1_container_road_bag`.
- **Как жить.** Fail closed: не подставлять категорию или выдуманное имя; вещь с gap не передавать модели или игроку, связанный недоступный выбор отклонять, named и остальные item rows и факты сохранять. Снять исключение и эту запись после того, как item-generic-names (#236) даст каждой вещи проверенное имя по цепочке D92; затем повторно проверить полный inventory и удалить LW-131. Два Phase-11 acceptance-теста пропущены по D97 и остаются в файле до переноса сюжета в старт v17 и полного прогона по D101.
- **Issue.** [#236](https://github.com/PavelSlaven/Novgorod1230/issues/236), [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133); принято ведущим A-prompt-rev-turn-04 как временное исключение A-05-02.

### LW-132 — P-проекция групп 3 отложена до отдельного стенда (prompt-rev-turn)
- **Где.** `intent_router` и `turn_step_planner` player-facing LLM inputs в `apps/game-server`.
- **Что.** На финальном проходе `ca-final-prompt-rev-turn` (2026-10-06, finding 10) подтверждено, что user payload маршрутизатора и планировщика сохраняет служебные id, версии и счётчики, вопреки D72. Переход на P не оценивался стендом и в этой задаче не выполняется.
- **Как жить.** Не менять эти проекции без отдельного BENCH-PLAN/BENCH-OK на пары L против L+P, с одинаковыми model-visible входами у модели и судей и явным перечнем допустимых смысловых полей. Закрыть запись после принятой P-проекции.
- **Issue.** Отдельную задачу создаёт ведущий; основание — финальный проход `ca-final-prompt-rev-turn` finding 10.
### LW-135 — старт v17 задаёт героя вместо места (player-start-norm)
- **Где.** Семь файлов `data/world-catalogs/novgorod/live-world-runtime-v17/capacity-v2-start-successors/*.start.json`, поле `player_inputs`.
- **Что.** Их стартовые заявки фиксируют игроку роль, занятие и имя «Микула». Это расходится с ACTIVE-нормой «Персонаж игрока и место старта» (D108, D110, D111): место и сезон задают обстоятельства, а героя — заявка игрока. Текущий runtime остаётся долгом отдельной задачи #109.
- **Как жить.** Не использовать эти поля как норму и не переносить их ограничения в новую генерацию. Закрыть после реализации #109 и проверки свободной заявки на стартах.
- **Issue.** [#109](https://github.com/PavelSlaven/Novgorod1230/issues/109)

### LW-136 — исходные данные дворов не утверждены и не импортированы (npc-family-norm-apply)
- **Где.** `npc_family_household_contract.md`, `packages/actors/MODULE.md` и отдельные наборы исходных данных дворов и связей.
- **Что.** ACTIVE-норма требует для каждого человека двор либо явно указанную иную форму жизни и полный состав каждого двора на выбранную дату начала игры. Данные дворов для этого состава ещё не утверждены и не импортированы (#259, #338).
- **Как жить.** Считать полноту обязательным требованием нормы, а не подтверждённым свойством текущих данных или runtime. Не объявлять исходный мир полным до отдельного утверждения и импорта данных дворов с проверкой состава и связей.
- **Issue.** [#259](https://github.com/PavelSlaven/Novgorod1230/issues/259), [#338](https://github.com/PavelSlaven/Novgorod1230/issues/338)
