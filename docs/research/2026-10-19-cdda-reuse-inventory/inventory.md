# Опись механизмов CDDA-среза (P0-P4, P3 в ветке)

Только факты, без оценки. Источник: origin/main и codex/cataclysm-p3-semantic (5883a62fd).

## cpp-test-action-queue (P0, C++ (patch), loc 45)
Очередь тестовых действий вместо клавиатуры. game::set_test_action_queue + подмена ввода в get_player_input: действия берутся из очереди, при исчерпании бросается NOVGOROD_TEST_INPUT_EXHAUSTED.
- tools/cataclysm-prototype/native-input.patch:24-36
- tools/cataclysm-prototype/native-input.patch:69-80
- tools/cataclysm-prototype/native-input.patch:90-102

## cpp-test-input-observer (P1, C++ (patch), loc 12)
Read-only наблюдатель границы ввода. novgorod_test_input_observer вызывается в handle_action на границе ввода и фиксирует состояние, не исполняя эффектов.
- tools/cataclysm-prototype/native-input.patch:56-67

## cpp-test-cache-prep (P0, C++ (patch), loc 4)
Подготовка map/visibility cache в test-режиме. do_turn вызывает build_map_cache и update_visibility_cache, когда включена test_action_queue.
- tools/cataclysm-prototype/native-input.patch:9-12

## cpp-rng-engine-serialization (P4, C++ (patch), loc 55)
Сериализация состояния RNG-движка. rng_serialize_engine / rng_unserialize_engine в rng.h/rng.cpp.
- tools/cataclysm-prototype/native-rng-state.patch:1-55

## cpp-rng-sidecar-save-load (P4, C++ (patch), loc 35)
Файл novgorod_rng_state рядом с сохранением. game_io.cpp: чтение novgorod_rng_state при load (результат g->load проверяется), запись при save; сохранение отклоняется, если запись sidecar не удалась.
- tools/cataclysm-prototype/native-rng-state.patch:72-74
- tools/cataclysm-prototype/native-rng-state.patch:82-91
- tools/cataclysm-prototype/native-rng-state.patch:99-105

## cpp-catch-seed-no-reset (P4, C++ (patch), loc 17)
Catch-seed не сбрасывает RNG вне create-режимов. tests/test_main.cpp: сид Catch не перетирает загруженное состояние RNG, когда режим не create.
- tools/cataclysm-prototype/native-rng-state.patch:113-129

## cpp-load-core-data-timing (P4, C++ (patch), loc 20)
Тайминг load_core_data. game.cpp: правка измерения/момента load_core_data для метрик bootstrap.
- tools/cataclysm-prototype/native-persistence.patch:9-28

## cpp-p4-strict-load-friend (P4, C++ (patch), loc 3)
friend novgorod_p4_strict_load. game.h даёт тестовой функции доступ для строгой загрузки мира.
- tools/cataclysm-prototype/native-persistence.patch:40

## cpp-mid-save-failpoint (P4, C++ (patch), loc 30)
Failpoint mid_save в game_io. game_io.cpp: точка отказа посреди native save (env NOVGOROD_P4_FAILPOINT).
- tools/cataclysm-prototype/native-persistence.patch:80-98
- tools/cataclysm-prototype/native-persistence.patch:107-109

## cpp-test-main-p4-modes (P4, C++ (patch), loc 117)
Режимы create/apply/read в tests/test_main.cpp. NOVGOROD_P4_MODE/WORLD/OPERATION; строгий поиск и загрузка мира, имя мира, мир не удаляется, нет newline в выводе, таймеры bootstrap/load.
- tools/cataclysm-prototype/native-persistence.patch:121-237

## cpp-preload-path-cache-reset (P4, C++ (patch), loc 60)
Сброс path-кэшей flexbuffer/json_loader после fork. flexbuffer_cache::reset_paths и json_loader::reset_path_caches_for_fork_test: ребёнок перенастраивает user-dir и кэши.
- tools/cataclysm-prototype/native-preload.patch:1-33
- tools/cataclysm-prototype/native-preload.patch:48-83

## cpp-preload-mode-game (P4, C++ (patch), loc 13)
Режим preload в game.cpp. game.cpp: режим preload (immutable definitions без загрузки мира).
- tools/cataclysm-prototype/native-preload.patch:35-47

## cpp-preload-test-main (P4, C++ (patch), loc 71)
Preload-сервер в test_main. novgorod_p4_configure_user_paths, novgorod_p4_serve_preload, метрики static_data/metadata.
- tools/cataclysm-prototype/native-preload.patch:87-157

## cpp-item-identity-contents (P4, C++ (patch), loc 140)
Сохранение item UID в item_contents. read_mods_preserving_identity, combine_preserving_identity, insert_item_preserving_identity, add_pocket_preserving_identity; debugmsg/DebugLog убраны из combine.
- tools/cataclysm-prototype/native-item-identity.patch:9-35
- tools/cataclysm-prototype/native-item-identity.patch:49-59
- tools/cataclysm-prototype/native-item-identity.patch:67-167
- tools/cataclysm-prototype/native-item-identity.patch:176-215

## cpp-item-identity-pocket (P4, C++ (patch), loc 22)
item_pocket::insert_item_preserving_identity. Вставка предмета в карман без выдачи нового UID.
- tools/cataclysm-prototype/native-item-identity.patch:263-284

## cpp-item-deserialize-identity (P4, C++ (patch), loc 9)
item::deserialize через *_preserving_identity. savegame_json.cpp: десериализация предмета переключена на функции, сохраняющие UID.
- tools/cataclysm-prototype/native-item-identity.patch:306-314

## cpp-semantic-adjacent-selection (P3, C++ (patch, ветка), loc 70)
Тестовый выбор соседней клетки (choose_direction). action.cpp/h: set/require/clear_novgorod_test_adjacent_selection и подстановка в choose_direction.
- tools/cataclysm-prototype/native-semantic-input.patch:17-83
- tools/cataclysm-prototype/native-semantic-input.patch:93-96

## cpp-semantic-pickup-by-uid (P3, C++ (patch, ветка), loc 45)
Подбор предмета по UID. game.cpp/h, handle_action.cpp: test_pickup_uid, set_test_pickup_uid; из условия тайминга убран режим preload.
- tools/cataclysm-prototype/native-semantic-input.patch:107-111
- tools/cataclysm-prototype/native-semantic-input.patch:119-140
- tools/cataclysm-prototype/native-semantic-input.patch:151-168
- tools/cataclysm-prototype/native-semantic-input.patch:177-193

## cpp-semantic-use-item-by-uid (P3, C++ (patch, ветка), loc 30)
ACTION_USE по UID и способу использования. handle_action.cpp: ACTION_USE выбирает предмет по UID и use method из тестовой подстановки (set_test_item_use).
- tools/cataclysm-prototype/native-semantic-input.patch:203-232

## cpp-semantic-transfer-identity (P3, C++ (patch, ветка), loc 50)
item::transfer_identity_from. Перенос UID и дерева идентичностей между предметами; json.h: RLE-сжатие учитывает UID.
- tools/cataclysm-prototype/native-semantic-input.patch:244-290
- tools/cataclysm-prototype/native-semantic-input.patch:303-304
- tools/cataclysm-prototype/native-semantic-input.patch:318

## cpp-semantic-pickup-uid-transfer (P3, C++ (patch, ветка), loc 20)
Перенос UID при подборе целого предмета. pickup.cpp: при подборе целого предмета UID переносится transfer_identity_from.
- tools/cataclysm-prototype/native-semantic-input.patch:496-516

## cpp-semantic-npc-intent-fields (P3, C++ (patch, ветка), loc 35)
Native-хранение намерения NPC. npc.h: поля novgorod_assignment_id/payload/target/progress/status/interrupt_cause, set_novgorod_semantic_intent, геттеры.
- tools/cataclysm-prototype/native-semantic-input.patch:322-356

## cpp-semantic-npc-move-branch (P3, C++ (patch, ветка), loc 105)
Ветка npc::move: один шаг по намерению с прерываниями. npcmove.cpp: NPC делает шаг на одну клетку; прерывания native_dangerous_field, explosive, danger_assessment, movement_refused, not_applied.
- tools/cataclysm-prototype/native-semantic-input.patch:373-476

## cpp-semantic-npc-intent-persistence (P3, C++ (patch, ветка), loc 46)
Сохранение/загрузка намерения NPC. savegame_json.cpp: npc::load/store полей намерения с валидацией.
- tools/cataclysm-prototype/native-semantic-input.patch:521-566

## cpp-slice-helpers (P1, C++, loc 95)
Хелперы и readback среза P1-P2. reset_input_observer, carried_uid, player_json, ground_count, emit_transition, actions, reset_scene, run_actions; TEST_CASE о правдивом readback сущностей.
- tools/cataclysm-prototype/novgorod_slice_test.cpp:139-228

## cpp-slice-scenarios-t01-t05 (P2, C++, loc 240)
Сценарии T01-T05. east, unseen_northeast, wall, pickup_rock, unseen_pickup_stick, hacksaw_activity_and_npc, safe_mode_interrupt; явное исчерпание ввода; метрики tick/action budgets.
- tools/cataclysm-prototype/novgorod_slice_test.cpp:230-399
- tools/cataclysm-prototype/novgorod_slice_test.cpp:400-472

## cpp-p4-snapshot (P4, C++, loc 53)
Снимок состояния P4 (в т.ч. rng_state). p4_snapshot строит полный native-снимок; p4_emit_stdout печатает его.
- tools/cataclysm-prototype/novgorod_persistence_test.cpp:82-152

## cpp-p4-disk-uid-scan (P4, C++, loc 46)
Чтение UID из сохранения на диске. p4_disk_type_uids разбирает сохранённые файлы и собирает UID по типам.
- tools/cataclysm-prototype/novgorod_persistence_test.cpp:154-199

## cpp-p4-fixture-and-operations (P4, C++, loc 125)
Фикстура и операции P4. p4_create_fixture; операции pickup_rock, pickup_stick, partial_hacksaw, move_east; p4_failpoint; p4_count_item; p4_run_operation.
- tools/cataclysm-prototype/novgorod_persistence_test.cpp:71-80
- tools/cataclysm-prototype/novgorod_persistence_test.cpp:210-338

## cpp-p4-persistence-probe-testcase (P4, C++, loc 44)
TEST_CASE native save and resume probe. Точка входа [novgorod_persistence], режимы по env.
- tools/cataclysm-prototype/novgorod_persistence_test.cpp:340-383

## cpp-preload-guards (P4, C++, loc 100)
Проверки preload: один поток и нет открытых save-fd. preload_single_thread (ровно 1 поток), preload_has_open_save_file (скан /proc/self/fd), preload_preflight, path_is_under.
- tools/cataclysm-prototype/novgorod_preload_probe.cpp:62-167

## cpp-preload-request-protocol (P4, C++, loc 60)
Построчный протокол preload-хоста. parse_request; валидаторы profile_key (64 hex), operation, failpoint; emit_frame NOVGOROD_PRELOAD_*, hex_encode.
- tools/cataclysm-prototype/novgorod_preload_probe.cpp:170-230

## cpp-preload-fork-child (P4, C++, loc 115)
Fork-ребёнок на запрос (serve_one). Валидация, REJECT-кадры, fork; ребёнок: PR_SET_PDEATHSIG, pipe, stdin /dev/null, новые пути, строгая загрузка (exit 124/122); родитель пересылает CHILD/OUTPUT(hex)/DONE.
- tools/cataclysm-prototype/novgorod_preload_probe.cpp:232-347

## cpp-preload-serve-loop (P4, C++, loc 84)
Цикл preload-сервера и READY. READY JSON, цикл по stdin, QUIT, лимит запроса 8192 байта; TEST_CASE preload save descriptor guard.
- tools/cataclysm-prototype/novgorod_preload_probe.cpp:351-433

## cpp-user-path-config (P4, C++, loc 12)
Настройка пользовательских путей. novgorod_p4_configure_user_paths.
- tools/cataclysm-prototype/novgorod_preload_probe.cpp:47-58

## cpp-rng-state-tests (P4, C++, loc 137)
Тесты RNG sidecar. Round trip без advance; сбой записи sidecar ломает save; битый sidecar отклоняется; legacy save без sidecar.
- tools/cataclysm-prototype/novgorod_rng_state_test.cpp:30
- tools/cataclysm-prototype/novgorod_rng_state_test.cpp:74
- tools/cataclysm-prototype/novgorod_rng_state_test.cpp:94
- tools/cataclysm-prototype/novgorod_rng_state_test.cpp:118

## cpp-item-uid-tests (P4, C++, loc 185)
Тесты сохранения item UID. Вложенные UID переживают JSON-roundtrip; legacy mod/added pocket; charges разделены; migration fallback сохраняет uid/charges/order.
- tools/cataclysm-prototype/novgorod_item_uid_test.cpp:26
- tools/cataclysm-prototype/novgorod_item_uid_test.cpp:63
- tools/cataclysm-prototype/novgorod_item_uid_test.cpp:112
- tools/cataclysm-prototype/novgorod_item_uid_test.cpp:153

## cpp-semantic-fixture-observation (P3, C++ (ветка), loc 260)
Фикстура P3 и native observation. reset_p3_fixture; пути request/readback/observation; write_p3_observation; write_npc_physical_projections; p3_target_ref; snapshot (take/write/current).
- tools/cataclysm-prototype/novgorod_semantic_test.cpp:41-135
- tools/cataclysm-prototype/novgorod_semantic_test.cpp:143-300
- tools/cataclysm-prototype/novgorod_semantic_test.cpp:304-440

## cpp-semantic-request-executor (P3, C++ (ветка), loc 310)
Исполнитель semantic-запроса к native avatar. move_action, request_direction и TEST_CASE 'semantic request uses native avatar primitives': читает файл запроса, исполняет примитивы, пишет readback.
- tools/cataclysm-prototype/novgorod_semantic_test.cpp:602-911

## cpp-semantic-item-identity-tests (P3, C++ (ветка), loc 245)
Тесты UID при ACTION_USE, RLE и pickup. ACTION_USE сохраняет вложенное положение; RLE различает UID; целый/частичный/слитый pickup сохраняет UID; отклонённый перенос не меняет деревья; проверка формы карманов; вложенные UID в разных типах карманов.
- tools/cataclysm-prototype/novgorod_semantic_test.cpp:912-1155

## py-profile-key (P4, Python, loc 50)
Ключ профиля definitions. _profile_key, _profile_base: ключ зависит от опций/путей; custom definition symlink отвергается.
- tools/cataclysm-prototype/generations.py@main:37-87

## py-native-host (P4, Python, loc 160)
NativeHost: тёплый preload-процесс. Запуск preload-хоста, handshake READY (profile_key, parent_pid), request/close.
- tools/cataclysm-prototype/generations.py@main:88-247

## py-fs-durability-helpers (P4, Python, loc 115)
fsync и копирование деревьев. UncertainState, _fsync_file/_fsync_dir/_sync_tree, _size_and_files, _first_difference, _nearest_rank, _make_writable, _remove_writable_tree, _copy_tree, _kill_self.
- tools/cataclysm-prototype/generations.py@main:248-364

## py-coordinator-lock-pointer (P4, Python, loc 80)
Блокировка и указатель current.json. flock .coordinator.lock; _pointer_value; _generation_path; _publish (tmp, fsync, os.replace, fsync dir).
- tools/cataclysm-prototype/generations.py@main:365-396
- tools/cataclysm-prototype/generations.py@main:481-500
- tools/cataclysm-prototype/generations.py@main:539-549

## py-generation-validate-write (P4, Python, loc 190)
Валидация и запись неизменяемого поколения. _validate_generation, _copy_generation_userdir, _write_candidate, _remove_unaccepted_generation, _cleanup_work, _read_generation.
- tools/cataclysm-prototype/generations.py@main:508-537
- tools/cataclysm-prototype/generations.py@main:551-678

## py-coordinator-init-apply-read (P4, Python, loc 150)
Coordinator init / read / apply. Единственный владелец принятия поколения; apply по operation_id.
- tools/cataclysm-prototype/generations.py@main:679-834

## py-native-invocation (P4, Python, loc 85)
Вызов native через cata_test. Coordinator._native собирает env NOVGOROD_P4_* и запускает фильтр [novgorod_persistence].
- tools/cataclysm-prototype/generations.py@main:396-480

## py-p3-request-validation (P3, Python (ветка), loc 32)
Проверка P3-запроса и digest. _request_digest; _validate_p3_request: схема p3_p4_semantic_request_v1, только примитив speak.
- tools/cataclysm-prototype/generations.py@branch:320-350

## py-p3-stage-adapter (P3, Python (ветка), loc 55)
P3StageAdapter: вызов JS-границы из координатора. Вызывает p3-runner.js --coordinator-create/read/apply через node.
- tools/cataclysm-prototype/generations.py@branch:397-446

## py-p3-coordinator-branches (P3, Python (ветка), loc 250)
P3-ветки Coordinator.init/apply и перезагрузка кандидата. p3_adapter в Coordinator; чтение P3-поколения; init; apply с хранением семантических записей.
- tools/cataclysm-prototype/generations.py@branch:447-480
- tools/cataclysm-prototype/generations.py@branch:775-787
- tools/cataclysm-prototype/generations.py@branch:800-1033

## py-fault-suite (P4, Python, loc 280)
Матрица отказов (suite). run_fault_suite: 10 сценариев с реальным SIGKILL, ENOSPC через /dev/full, missing/malformed файлы.
- tools/cataclysm-prototype/generations.py@main:890-1168

## py-metrics (P4, Python, loc 190)
Метрики (20 замеров). _run_preload_metrics, run_metrics: 20 samples после warmup, nearest-rank p95, бюджет 5 с, лимит поколения 512 MiB.
- tools/cataclysm-prototype/generations.py@main:1169-1352

## py-cli (P4, Python, loc 75)
CLI координатора. _run_child, _run_cli, _parse_args, main; init/read/apply/deliver-failure/cleanup/suite/metrics; exit 2 при проваленном gate.
- tools/cataclysm-prototype/generations.py@main:835-889
- tools/cataclysm-prototype/generations.py@main:1353-1426

## py-generation-tests (P3, Python, loc 481)
Unit-тесты координатора. GenerationInvariantTests: сравнение снимков, p95, ключ профиля, JSON-протокол preload, замена указателя, fail-closed неизвестное поколение, cleanup, P3 replay/reload/failpoints.
- tools/cataclysm-prototype/test_generations.py:19-481

## js-p3-attempt-budget (P3, JavaScript, loc 50)
Общий бюджет попыток LLM (72). createP3AttemptBudget оборачивает roleRunner, считает попытки, onAttempt до/после, ошибка P3_GLOBAL_ATTEMPT_BUDGET_EXHAUSTED; кейсы T06-T10; лимиты по 6 ролям.
- tools/cataclysm-prototype/p3-boundary.js:22-71

## js-p3-llm-config (P3, JavaScript, loc 130)
Закреплённая LLM-конфигурация P3. resolveP3EffectiveConfig (qwen3.8-27b-uncensored-w4a16-tp2, temperature 0, окно 65536, max_tokens 20000/1000), validateP3RoleConfigs, loadP3QwenSettingsOwner (RUS_LLM_SETTINGS_PATH), isPrivateLanHost, sanitizeP3RoleConfigs.
- tools/cataclysm-prototype/p3-boundary.js:73-100
- tools/cataclysm-prototype/p3-boundary.js:451-457
- tools/cataclysm-prototype/p3-boundary.js:673-730

## js-p3-role-runtime (P3, JavaScript, loc 30)
Провод к существующему LLM runner. createP3RoleRuntime: createProductionLlmRoleRunner + бюджет; модели turn step / NPC autonomous / NPC conversation.
- tools/cataclysm-prototype/p3-boundary.js:423-449

## js-p3-turn-plan-wrappers (P3, JavaScript, loc 20)
Обёртки turn plan и NPC decision. requestP3TurnPlan -> requestTurnStepPlanWithRepair; requestP3NpcDecision.
- tools/cataclysm-prototype/p3-boundary.js:102-115

## js-p3-turn-step-mapping (P3, JavaScript, loc 115)
Отображение шагов хода в native-примитивы. buildP3TurnOperations; mapP3TurnOperationToNative: operation turn plan -> pickup/move/use_item/open/wait/speak.
- tools/cataclysm-prototype/p3-boundary.js:459-573

## js-p3-turn-step-run (P3, JavaScript, loc 97)
runP3TurnStep. runTurnStepLoop с executionRegistry и projectPlayerSafeState; player_utterance преобразуется в speech.
- tools/cataclysm-prototype/p3-boundary.js:575-671

## js-p3-native-envelope (P3, JavaScript, loc 125)
Конверт native-операции и readback (файловый протокол). assertSafeNativeArgs; createP3OperationEnvelope (p3_native_operation_request_v1); writeP3OperationRequest (novgorod-p3-operation.json, wx); validateP3Readback (p3_native_operation_readback_v1); projectP3NativeReadback; requireP3NativeSeam.
- tools/cataclysm-prototype/p3-boundary.js:747-871

## js-p3-native-observation (P3, JavaScript, loc 27)
Чтение native observation. readP3NativeObservation: novgorod-p3-observation.json, схема p3_native_observation_v1.
- tools/cataclysm-prototype/p3-boundary.js:923-949

## js-p3-native-adapters (P3, JavaScript, loc 90)
Адаптеры native: файловый и процессный. createP3NativeFileAdapter; createP3NativeProcessAdapter (execFile, на Windows через wsl.exe, --rng-seed 17); preflight/execute/refreshObservation.
- tools/cataclysm-prototype/p3-boundary.js:951-1035

## js-p3-npc-boundary (P3, JavaScript, loc 30)
Граница NPC с replay. runP3NpcBoundary: replay по checkpointId/fingerprint, ошибка P3_NPC_REPLAY_IDENTITY_MISMATCH; buildP3NpcRequest.
- tools/cataclysm-prototype/p3-boundary.js:116-140
- tools/cataclysm-prototype/p3-boundary.js:279-284

## js-p3-native-npc-flow (P3, JavaScript, loc 140)
Native NPC flow: проекция - решение - npc_move. buildP3NativeNpcDecisionInput; executeP3NativeNpcBoundary (request_movement на соседнюю клетку, примитив npc_move); runP3NativeNpcFlow; selectP3NativeNpcFixture.
- tools/cataclysm-prototype/p3-boundary.js:285-421

## js-p3-native-speech (P3, JavaScript, loc 140)
Native речь + conversation owner. applyP3NativeSpeech; createP3NativeSpeechOwnerFixture; applyP3CoordinatorSpeech: аудитория берётся из native hearing, deep-equal снимков.
- tools/cataclysm-prototype/p3-boundary.js:142-277
- tools/cataclysm-prototype/p3-boundary.js:881-921

## js-p3-evidence (P3, JavaScript, loc 25)
Evidence run и санитайзер. sanitizeP3Evidence, createP3EvidenceRun (run.jsonl).
- tools/cataclysm-prototype/p3-boundary.js:1037-1059

## js-p3-sealed-package (P3, JavaScript, loc 180)
Запечатанный пакет кейсов T06-T10. validateP3SealedCasePack (p3_sealed_case_pack_v1, 3 reset на кейс); runP3SealedPackage (p3_sealed_package_result_v1, acceptance not_evaluated).
- tools/cataclysm-prototype/p3-boundary.js:1061-1240

## js-p3-runner-cli (P3, JavaScript, loc 172)
CLI p3-runner.js. --dry-run, --validate-config, --native-preflight, --coordinator-create/read/apply, --run, --run-npc, --run-sealed, --write-request, --validate-readback.
- tools/cataclysm-prototype/p3-runner.js:1-172

## js-p3-wire-smoke (P3, JavaScript, loc 401)
Диагностический провод к LLM (wire smoke). --dry-capture, --metadata-only (GET /models), --live: сохранённые запросы сверяются с реальным body, лимит 5 вызовов, остановка при несовпадении модели ответа.
- tools/cataclysm-prototype/p3-wire-smoke.mjs:78-192
- tools/cataclysm-prototype/p3-wire-smoke.mjs:194-216
- tools/cataclysm-prototype/p3-wire-smoke.mjs:218-372

## js-p3-boundary-tests (P3, JavaScript, loc 1049)
Node-тесты границы P3. Около 36 тестов: бюджет, envelope, readback, адаптеры, turn-step, речь, NPC T09, sealed, coordinator speech, config, evidence.
- tools/cataclysm-prototype/p3-boundary.test.js:32-1043

## js-conversation-audience-owner (P3, JavaScript, loc 226)
projectPlayerStatementAudience и валидатор аудитории. В существующий модуль conversation-statements добавлены projectPlayerStatementAudience и validatePlayerStatementAudience (схема conversation_audience_projection_v1); тест +111 строк.
- apps/game-server/src/runtime/lower-dvina-trace-m2-conversation-statements.js@branch (+115)
- apps/game-server/src/runtime/lower-dvina-trace-m2-player-audience-owner.test.js@branch (+111)

## js-turn-export-repair (P3, JavaScript, loc 1)
Экспорт requestTurnStepPlanWithRepair из @rus/turn. packages/turn/src/index.js экспортирует requestTurnStepPlanWithRepair; MODULE.md обновлён.
- packages/turn/src/index.js@branch
- packages/turn/MODULE.md@branch

## ci-architecture-boundaries (P3, JavaScript, loc 11)
Архитектурная проверка прототипа. check-boundaries.mjs: tools/cataclysm-prototype в sourceRoots; запрет относительного импорта мимо exports пакетов; лимит экспортов turn 12 -> 13.
- tools/architecture/check-boundaries.mjs@branch

## ci-p3-python-runner (P3, JavaScript, loc 17)
Запуск Python-тестов P3 (WSL). run-p3-python-tests.mjs: unittest discover; на Windows через wsl.exe; npm-скрипт test:cataclysm-p3 включён в npm test.
- tools/architecture/run-p3-python-tests.mjs:1-17
- package.json@branch

## script-native-build-smoke (P0, shell (в README), loc 140)
Сборка и smoke-команды native (в README). Пин SHA 0d8843f1, cmake clang-19, upstream smoke [activity],[npc], применение патчей и копирование тестов, запуск suite/metrics. Отдельных .sh в tools/cataclysm-prototype нет.
- tools/cataclysm-prototype/README.md:1-212

## evidence-p4-main (P4, JSON/XML/MD, loc -)
Evidence P0-P4 в main. p4-commands, p4-fault-suite, p4-metrics, p4-native-files, p4-native-uid, recovery-* (fault suite, metrics, composition, focused xml, rng xml, contract audit, profile check), recovery-baseline.md, seed-17.jsonl, seed-23.jsonl.
- tools/cataclysm-prototype/evidence/

## evidence-p3-wire (P3, JSON, loc -)
Evidence диагностического провода. 9 файлов: attempts, live-attempt-events, live-attempts, live-summary, model-metadata, native-observation-clean, requests, scenario-errors, structured-summary.
- tools/cataclysm-prototype/evidence/task01-wire/@branch

## docs-and-journal (P3, Markdown, loc -)
Документы, журнал, MODULE. experiment/results docs P0-P2, P4, recovery; P3 experiment (ветка, матрица T06-T10); README, MODULE, JOURNAL P3 (ветка).
- docs/implementation/cataclysm-p0-p2-experiment.md
- docs/implementation/cataclysm-p0-p2-results.md
- docs/implementation/cataclysm-p4-experiment.md
- docs/implementation/cataclysm-p4-results.md
- docs/implementation/cataclysm-p4-recovery-results.md
- docs/implementation/cataclysm-p3-experiment.md@branch
- tools/cataclysm-prototype/MODULE.md
- tools/cataclysm-prototype/JOURNAL.md@branch

## Notes
Опись фактов, без оценки. Прочитано целиком: 5 патчей, novgorod_slice_test/persistence/preload_probe/rng_state/item_uid (.cpp), generations.py (main) и дельта ветки, p3-boundary.js, p3-runner.js, p3-wire-smoke.mjs, JOURNAL.md, MODULE.md, diff conversation-statements, packages/turn, tools/architecture, package.json. Проверено: в upstream 0d8843f1 уже есть item_uid (src/item.h:38, 246; item.cpp:178). НЕ проверено: тела novgorod_semantic_test.cpp (только имена функций и TEST_CASE; диапазоны даны по границам определений); тела run_fault_suite после списка сценариев и run_metrics; test_generations.py и p3-boundary.test.js (только названия тестов); содержимое docs/implementation/*.md (заголовки) и evidence JSON/XML (имена); test/op10-p3-ui.test.js, legacy/test/op10-p3-ui.test.js (связь не установлена); не сверено, что +90 строк tests/test_main.cpp в WSL-checkout совпадают с патчами persistence/preload; граф codebase-memory-mcp не использовался; save-check - отдельная проверка, глубоко не дублировался. Номера строк патчей - внутри .patch; generations.py '@main' - файл в origin/main, '@branch' - codex/cataclysm-p3-semantic (5883a62fd). loc - размер диапазона или оценка, не точный подсчёт. Запуски тестов не выполнялись.
