## План

Основание — принятый [PLAN-4.md](PLAN-4.md), раздел `PLAN-RESUME-3-delta`, и [PLAN-OK-RESUME-3.md](PLAN-OK-RESUME-3.md). Q-09 и Q-10 разрешены ответами распорядителя. После Q-10 добавлены проверяемая межагентская переписка, общий check_agents для составного world_state и подсчёт сообщений среды по parse_user. Рабочая обёртка в корне не менялась; установка остаётся за распорядителем.

После PLAN-OK выполнены чистый рефакторинг user, согласованные дополнения прежних фикстур, новые тесты, закрытая классификация строк, правила среды/world_state/retained_context и исправление измерителя. Дополнительно установлен отдельный дефект происхождения ответов без `--children`: источник теперь читается из rollout помощника без его полного аудита. Для этого добавлен тест.

Предыдущая остановка Q-09 снята ответом распорядителя: фикстура wrapper при `INPUT_CHECK_PRECREATE_LEDGER=1` заранее создаёт пустую папку журнала. Проба существующего абсолютного каталога дала `existing_absolute_rc=1`; в [codex-exec.sh:53](codex-exec.sh#L53) добавлена только разрешённая проверка существования перед mkdir. Доказательство — [refactor-mkdir-4.json](refactor-mkdir-4.json). Ветки записи журнала, new/resume, отпечатка и tee остаются на обёртке.

Все прежние тесты после чистого рефакторинга прошли: [refactor-user-4-green.log](refactor-user-4-green.log). В функциональных красных и зелёных секциях записаны команда, SHA тестов, INPUT_CHECK_SOURCE_DIR и INPUT_CHECK_PRECREATE_LEDGER. Финальный SHA тестового файла: `6736b20bd0155f347fba762ee53d21b6730ca820ce56d0610ae815e04ed89320`.

## Проверки и граница результата

- Финальный красный на копии REPORT-3 с одной разрешённой правкой среды wrapper: 61 failed, 107 passed in 48.96s, [fix-red.log:12722](fix-red.log#L12722).
- Финальный зелёный: RESULT: 168 passed in 45.93s, [fix-green.log:390](fix-green.log#L390).
- Мутант второго закрытого блока: 3 failed, 1 passed, 164 deselected in 2.10s, [fix-red.log:11161](fix-red.log#L11161). Это закрепление реальной склейки одной и двух частей; прежний тест тоже падает.
- Паритет измерителя с production parser: данные [measure-4/q10-measure/parity-final-4.json](measure-4/q10-measure/parity-final-4.json).

Ранние секции логов с другими SHA не являются доказательствами таблиц ниже. В повторе тест паритета специально изолирован от ошибки --out: он краснеет на различии ошибок разбивки, а отдельный тест --out — на прежнем FileNotFoundError. Ошибки импорта или фикстур не засчитывались.

## Решение → реализация → тест → красный → зелёный

| Решение | Файл:строка | Тест | Красный / мутант | Зелёный |
|---|---|---|---|---|
| 1: части user и проверенная история | [check-codex-input.py:911](check-codex-input.py#L911) | `test_resume3_user_parts_are_text_only`<br>`test_resume3_compacted_user_requires_verified_history` | [fix-red.log:12661](fix-red.log#L12661)<br>[fix-red.log:12665](fix-red.log#L12665) | [fix-green.log:390](fix-green.log#L390) |
| 2: subagents, источник, старый mtime | [check-codex-input.py:422](check-codex-input.py#L422) | `test_resume3_subagent_name_requires_provenance_without_children`<br>`test_resume3_subagent_created_before_since_is_still_known_regression` | [fix-red.log:12666](fix-red.log#L12666)<br>[fix-red.log:12668](fix-red.log#L12668) | [fix-green.log:390](fix-green.log#L390) |
| 3: значения среды и число сообщений | [check-codex-input.py:255](check-codex-input.py#L255) | `test_resume3_environment_leaf_values_are_closed`<br>`test_resume3_environment_cwd_matches_own_turn`<br>`test_resume3_duplicate_environment_messages_fail` | [fix-red.log:12669](fix-red.log#L12669)<br>[fix-red.log:12672](fix-red.log#L12672)<br>[fix-red.log:12673](fix-red.log#L12673) | [fix-green.log:390](fix-green.log#L390) |
| 4: подстановки token-guard | [check-codex-input.py:132](check-codex-input.py#L132) | `test_resume3_token_guard_path_requires_provenance`<br>`test_resume3_token_guard_nickname_matches_own_agent`<br>`test_resume3_token_guard_attack_with_other_descendants` | [fix-red.log:12674](fix-red.log#L12674)<br>[fix-red.log:12677](fix-red.log#L12677)<br>[fix-red.log:12702](fix-red.log#L12702) | [fix-green.log:390](fix-green.log#L390) |
| 5: каждый task_started имеет пояс | [check-codex-input.py:36](check-codex-input.py#L36) | `test_resume3_naive_last_turn_timestamp_fails_without_since` | [fix-red.log:12678](fix-red.log#L12678) | [fix-green.log:390](fix-green.log#L390) |
| 7: два закрытых блока | [check-codex-input.py:109](check-codex-input.py#L109) | `test_resume3_closed_service_blocks_regression` | [fix-red.log:11161](fix-red.log#L11161) | [fix-green.log:390](fix-green.log#L390) |
| 9: общий сырой разбор в замере | [measure-blocks-3.py:158](measure-blocks-3.py#L158) | `test_resume3_measurement_preserves_raw_message_parity` | [fix-red.log:12679](fix-red.log#L12679) | [fix-green.log:390](fix-green.log#L390) |
| 10: SHA model_switch / модель хода | [check-codex-input.py:880](check-codex-input.py#L880) | `test_resume3_model_switch_matches_turn_model` | [fix-red.log:12682](fix-red.log#L12682) | [fix-green.log:390](fix-green.log#L390) |
| 11: SHA самого измерителя | [measure-blocks-3.py:272](measure-blocks-3.py#L272) | `test_resume3_measurement_hashes_script_at_its_source` | [fix-red.log:12681](fix-red.log#L12681) | [fix-green.log:390](fix-green.log#L390) |
| 12: закрытые пары rollout | [check-codex-input.py:799](check-codex-input.py#L799) | `test_unknown_rollout_pair_fails`<br>`test_additional_tool_definition_is_allowlisted` | [fix-red.log:12691](fix-red.log#L12691)<br>[fix-red.log:12701](fix-red.log#L12701) | [fix-green.log:390](fix-green.log#L390) |
| Происхождение ответа без полного аудита детей | [check-codex-input.py:323](check-codex-input.py#L323) | `test_resume3_reply_provenance_without_children_regression` | [fix-red.log:12704](fix-red.log#L12704) | [fix-green.log:390](fix-green.log#L390) |
| 6: hooks-ссылки | [codex-exec.sh:37](codex-exec.sh#L37) | Тест не добавлен: ОС отказала в создании ссылки | [symlink-probe-4.json](symlink-probe-4.json), WinError 1314 | Не проверено; исключение RESUME-3 |
| 8: финальная ревизия тестов | [fix-red.log:11636](fix-red.log#L11636); [fix-green.log:385](fix-green.log#L385) | Теста нет, правило процесса | В обеих секциях SHA `6736b20bd0155f347fba762ee53d21b6730ca820ce56d0610ae815e04ed89320` | [fix-green.log:390](fix-green.log#L390) |

После ответа Q-10 оба дефекта исправлены отдельными различающими тестами. Красный Q-10 выполнен на сохранённом коде предыдущей остановки; общий красный REPORT-3 и мутант повторены финальной ревизией тестов.

## Q-04…08: реализация

| Правило | Файл:строка | Тест | Красный | Зелёный |
|---|---|---|---|---|
| Q-04: digest, command prefixes, происхождение subagents; общий check_agents | [check-codex-input.py:672](check-codex-input.py#L672) | `test_world_state_digest_rejects_text`<br>`test_world_state_prefix_rejects_sentence`<br>`test_world_state_subagent_requires_provenance`<br>`test_world_state_agents_matches_verified_block` | [fix-red.log:12687](fix-red.log#L12687)<br>[fix-red.log:12688](fix-red.log#L12688)<br>[fix-red.log:12689](fix-red.log#L12689)<br>[fix-red.log:12686](fix-red.log#L12686) | [fix-green.log:390](fix-green.log#L390) |
| Q-05: retained: точный источник или единственный маркер усечения | [check-codex-input.py:614](check-codex-input.py#L614) | `test_retained_user_foreign_middle_fails`<br>`test_retained_verified_answers_must_be_empty`<br>`test_retained_assistant_must_match_history` | [fix-red.log:12692](fix-red.log#L12692)<br>[fix-red.log:12693](fix-red.log#L12693)<br>[fix-red.log:12694](fix-red.log#L12694) | [fix-green.log:390](fix-green.log#L390) |
| Q-06: пустой production-реестр additional_tools | [check-codex-input.py:783](check-codex-input.py#L783) | `test_additional_tool_definition_is_allowlisted` | [fix-red.log:12701](fix-red.log#L12701) | [fix-green.log:390](fix-green.log#L390) |
| Q-07: role и item.type — закрытые дискриминаторы | [check-codex-input.py:723](check-codex-input.py#L723) | `test_item_completed_unknown_type_fails`<br>`test_item_user_message_must_duplicate_turn_user`<br>`test_subagent_activity_forbidden_model_fails` | [fix-red.log:12697](fix-red.log#L12697)<br>[fix-red.log:12698](fix-red.log#L12698)<br>[fix-red.log:12699](fix-red.log#L12699) | [fix-green.log:390](fix-green.log#L390) |
| Q-08: исключение только для авторизованного message/user | [check-codex-input.py:888](check-codex-input.py#L888) | `test_resume3_authorized_user_can_quote_forbidden`<br>`test_agent_checks_forbidden`<br>`test_grandchild_task_is_checked` | закрепление; на REPORT-3 проходит<br>закрепление; на REPORT-3 проходит<br>закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |

## Все новые тесты и закрепления

| Тест:строка | Красный на финальной ревизии REPORT-3 / закрепление | Зелёный |
|---|---|---|
| [test_input_check.py:990](test_input_check.py#L990) `test_resume3_user_parts_are_text_only` | [fix-red.log:12661](fix-red.log#L12661) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:999](test_input_check.py#L999) `test_resume3_compacted_user_requires_verified_history` | [fix-red.log:12665](fix-red.log#L12665) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1005](test_input_check.py#L1005) `test_resume3_real_compaction_user_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1013](test_input_check.py#L1013) `test_resume3_inherited_compaction_with_prior_parent_tasks_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1031](test_input_check.py#L1031) `test_resume3_authorized_user_can_quote_forbidden` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1043](test_input_check.py#L1043) `test_resume3_subagent_name_requires_provenance_without_children` | [fix-red.log:12666](fix-red.log#L12666) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1050](test_input_check.py#L1050) `test_resume3_inherited_subagents_can_name_verified_sibling_regression` | [fix-red.log:12667](fix-red.log#L12667) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1070](test_input_check.py#L1070) `test_resume3_subagent_created_before_since_is_still_known_regression` | [fix-red.log:12668](fix-red.log#L12668) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1086](test_input_check.py#L1086) `test_resume3_environment_leaf_values_are_closed` | [fix-red.log:12669](fix-red.log#L12669) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1092](test_input_check.py#L1092) `test_resume3_environment_cwd_matches_own_turn` | [fix-red.log:12672](fix-red.log#L12672) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1098](test_input_check.py#L1098) `test_resume3_environment_extra_runtime_root_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1111](test_input_check.py#L1111) `test_resume3_environment_paths_without_writable_roots_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1123](test_input_check.py#L1123) `test_resume3_environment_known_date_shell_timezone_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1129](test_input_check.py#L1129) `test_resume3_duplicate_environment_messages_fail` | [fix-red.log:12673](fix-red.log#L12673) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1135](test_input_check.py#L1135) `test_resume3_token_guard_path_requires_provenance` | [fix-red.log:12674](fix-red.log#L12674) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1144](test_input_check.py#L1144) `test_resume3_real_token_guard_requires_copied_provenance` | [fix-red.log:12675](fix-red.log#L12675) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1158](test_input_check.py#L1158) `test_resume3_token_guard_nickname_matches_own_agent` | [fix-red.log:12677](fix-red.log#L12677) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1167](test_input_check.py#L1167) `test_resume3_naive_last_turn_timestamp_fails_without_since` | [fix-red.log:12678](fix-red.log#L12678) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1173](test_input_check.py#L1173) `test_resume3_utc_last_turn_timestamp_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1180](test_input_check.py#L1180) `test_resume3_closed_service_blocks_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1188](test_input_check.py#L1188) `test_resume3_closed_service_blocks_reject_unclaimed_tail` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1220](test_input_check.py#L1220) `test_resume3_measurement_preserves_raw_message_parity` | [fix-red.log:12679](fix-red.log#L12679) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1231](test_input_check.py#L1231) `test_resume3_measurement_hashes_script_at_its_source` | [fix-red.log:12681](fix-red.log#L12681) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1238](test_input_check.py#L1238) `test_resume3_model_switch_matches_turn_model` | [fix-red.log:12682](fix-red.log#L12682) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1244](test_input_check.py#L1244) `test_resume3_model_switch_before_context_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1251](test_input_check.py#L1251) `test_resume3_turn_context_conflicts_fail` | [fix-red.log:12683](fix-red.log#L12683) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1259](test_input_check.py#L1259) `test_world_state_rejects_unknown_key` | [fix-red.log:12685](fix-red.log#L12685) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1265](test_input_check.py#L1265) `test_world_state_agents_matches_verified_block` | [fix-red.log:12686](fix-red.log#L12686) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1274](test_input_check.py#L1274) `test_world_state_digest_rejects_text` | [fix-red.log:12687](fix-red.log#L12687) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1280](test_input_check.py#L1280) `test_world_state_prefix_rejects_sentence` | [fix-red.log:12688](fix-red.log#L12688) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1287](test_input_check.py#L1287) `test_world_state_subagent_requires_provenance` | [fix-red.log:12689](fix-red.log#L12689) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1293](test_input_check.py#L1293) `test_world_state_real_current_form_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1309](test_input_check.py#L1309) `test_exec_rejects_verified_answer` | [fix-red.log:12690](fix-red.log#L12690) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1315](test_input_check.py#L1315) `test_unknown_rollout_pair_fails` | [fix-red.log:12691](fix-red.log#L12691) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1321](test_input_check.py#L1321) `test_retained_user_truncated_from_source_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1329](test_input_check.py#L1329) `test_retained_user_foreign_middle_fails` | [fix-red.log:12692](fix-red.log#L12692) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1337](test_input_check.py#L1337) `test_retained_verified_answers_must_be_empty` | [fix-red.log:12693](fix-red.log#L12693) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1343](test_input_check.py#L1343) `test_retained_assistant_must_match_history` | [fix-red.log:12694](fix-red.log#L12694) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1349](test_input_check.py#L1349) `test_retained_assistant_from_prior_model_work_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1358](test_input_check.py#L1358) `test_retained_schema_rejects_unknown_fields` | [fix-red.log:12695](fix-red.log#L12695) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1369](test_input_check.py#L1369) `test_item_completed_unknown_type_fails` | [fix-red.log:12697](fix-red.log#L12697) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1375](test_input_check.py#L1375) `test_item_user_message_must_duplicate_turn_user` | [fix-red.log:12698](fix-red.log#L12698) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1381](test_input_check.py#L1381) `test_item_user_message_duplicates_accepted_turn_part_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1387](test_input_check.py#L1387) `test_subagent_activity_forbidden_model_fails` | [fix-red.log:12699](fix-red.log#L12699) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1394](test_input_check.py#L1394) `test_subagent_activity_current_kinds_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1401](test_input_check.py#L1401) `test_item_agent_message_current_delivery_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1407](test_input_check.py#L1407) `test_item_agent_message_unknown_delivery_fails` | [fix-red.log:12700](fix-red.log#L12700) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1413](test_input_check.py#L1413) `test_additional_tool_definition_is_allowlisted` | [fix-red.log:12701](fix-red.log#L12701) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1421](test_input_check.py#L1421) `test_additional_tool_synthetic_registry_regression` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1436](test_input_check.py#L1436) `test_resume3_token_guard_attack_with_other_descendants` | [fix-red.log:12702](fix-red.log#L12702) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1452](test_input_check.py#L1452) `test_resume3_reply_provenance_without_children_regression` | [fix-red.log:12704](fix-red.log#L12704) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1519](test_input_check.py#L1519) `test_sibling_message_exact_copy_ok` | [fix-red.log:12705](fix-red.log#L12705) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1525](test_input_check.py#L1525) `test_sibling_message_payload_byte_diff_fails` | [fix-red.log:12708](fix-red.log#L12708) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1531](test_input_check.py#L1531) `test_sibling_message_unverified_sender_fails` | [fix-red.log:12709](fix-red.log#L12709) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1537](test_input_check.py#L1537) `test_sibling_message_wrong_target_fails` | [fix-red.log:12710](fix-red.log#L12710) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1547](test_input_check.py#L1547) `test_sibling_message_before_call_fails` | [fix-red.log:12711](fix-red.log#L12711) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1553](test_input_check.py#L1553) `test_sibling_message_double_delivery_fails` | [fix-red.log:12713](fix-red.log#L12713) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1559](test_input_check.py#L1559) `test_q10_multiple_matching_calls_fail` | [fix-red.log:12714](fix-red.log#L12714) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1565](test_input_check.py#L1565) `test_sibling_message_header_mismatch_fails` | [fix-red.log:12715](fix-red.log#L12715) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1572](test_input_check.py#L1572) `test_sibling_message_is_not_assignment` | [fix-red.log:12716](fix-red.log#L12716) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1580](test_input_check.py#L1580) `test_q10_sibling_message_encrypted_content_explicit` | [fix-red.log:12717](fix-red.log#L12717) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1587](test_input_check.py#L1587) `test_q10_sibling_message_sender_at_different_depth` | [fix-red.log:12718](fix-red.log#L12718) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1614](test_input_check.py#L1614) `test_q10_world_state_combined_agents` | [fix-red.log:12719](fix-red.log#L12719) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1637](test_input_check.py#L1637) `test_q10_user_quote_and_real_environment_ok` | закрепление; на REPORT-3 проходит | [fix-green.log:390](fix-green.log#L390) |

## Дополнения прежних входов

Ожидания и причины прежних тестов не менялись. Полная разрешённая таблица — [measure-4/test-input-plan.md](measure-4/test-input-plan.md); фактический перечень изменённых прежних функций — [test-input-changes-4.md](test-input-changes-4.md). Общий turn/child получил согласованный turn_context; синтетический MODEL — собственную SHA-модель. Входы среды согласованы с cwd/корнями. В тесте контекста m заменена на gpt-6-sol. Тест одной части использует два закрытых production-блока; tail — закрытый permissions. Настоящие строки token-guard сохранены, добавлены копии источников. Проверка сохранности всех прежних assert — [self-audit-4.json](self-audit-4.json).

## Замеры до кода: версии и user-история

Исходный снимок и ошибки чтения — [measure-4/manifest.json](measure-4/manifest.json) и [history-results.json](measure-4/history-results.json). Период отбора начинается 2026-10-16T00:00:00Z; физические файлы не схлопывались по вложенным session_meta. Полные таблицы и примеры — принятый delta PLAN-4.

| CLI | Физических файлов |
|---|---:|
| 0.163.0-alpha.10.2 | 1155 |
| 0.163.0-alpha.11 | 107 |

| CLI | История | Вид user | Число | Пример |
|---|---|---|---:|---|
| 0.163.0-alpha.10.2 | ordinary_compaction | own_task | 1118 | `C:\Users\Slaven\.codex\sessions\2026\10\16\rollout-2026-10-16T07-41-02-01a14303-7547-7413-9055-04d80ec63f30.jsonl:488/replacement_history[2]` |
| 0.163.0-alpha.10.2 | ordinary_compaction | ancestor_task | 47 | `C:\Users\Slaven\.codex\sessions\2026\10\17\rollout-2026-10-17T23-05-38-01a14b78-50cd-7380-9f46-3a15e1d5f119.jsonl:749/replacement_history[2]` |
| 0.163.0-alpha.10.2 | ordinary_compaction | AGENTS.md | 153 | `C:\Users\Slaven\.codex\sessions\2026\10\16\rollout-2026-10-16T07-41-02-01a14303-7547-7413-9055-04d80ec63f30.jsonl:488/replacement_history[6]` |
| 0.163.0-alpha.10.2 | inherited_prefix | ancestor_task | 179 | `C:\Users\Slaven\.codex\sessions\2026\10\17\rollout-2026-10-17T16-32-44-01a14a10-99b1-7b92-82f9-f35af45342b8.jsonl:3/replacement_history[2]` |
| 0.163.0-alpha.10.2 | inherited_prefix | AGENTS.md | 8 | `C:\Users\Slaven\.codex\sessions\2026\10\17\rollout-2026-10-17T16-32-44-01a14a10-99b1-7b92-82f9-f35af45342b8.jsonl:3/replacement_history[24]` |
| 0.163.0-alpha.11 | ordinary_compaction | own_task | 15 | `C:\Users\Slaven\.codex\sessions\2026\10\21\rollout-2026-10-21T11-17-38-01a15d89-8e67-7c10-bed1-9293fc1d7341.jsonl:1176/replacement_history[0]` |
| 0.163.0-alpha.11 | ordinary_compaction | AGENTS.md | 5 | `C:\Users\Slaven\.codex\sessions\2026\10\21\rollout-2026-10-21T11-17-38-01a15d89-8e67-7c10-bed1-9293fc1d7341.jsonl:1176/replacement_history[5]` |

### Прежние сообщения AGENTS.md по частям

| CLI | Сообщений | AGENTS прошли | Среда прошла | Обе части прошли |
|---|---:|---:|---:|---:|
| 0.163.0-alpha.10.2 | 103 | 4 | 13 | 4 |
| 0.163.0-alpha.11 | 5 | 5 | 5 | 5 |

Исторические отказы не расширяют текущий allow. Примеры и причины — [history-components-by-version.json](measure-4/history-components-by-version.json).

### Среда и происхождение subagents

| CLI | Блоков среды | Обычных | В истории | Имен | Подтверждённых regex | Потомков | Соседей |
|---|---:|---:|---:|---:|---:|---:|---:|
| 0.163.0-alpha.10.2 | 1323 | 1162 | 161 | 800 | 800 | 736 | 64 |
| 0.163.0-alpha.11 | 112 | 107 | 5 | 38 | 38 | 38 | 0 |

Полные cwd/root/path и источники каждого имени — [environment-report.md](measure-4/environment-report.md), [subagents-provenance.json](measure-4/subagents-provenance.json). Текущее поле shell — powershell, timezone — Europe/Moscow; списки конечны. Все случаи дополнительного корня и отсутствующего writable_roots учтены в принятом замере.

### token-guard: путь, ник, модель

| Срез до кода | Блоков |
|---|---:|
| old | 2258 |
| current | 102 |

Точные источники ников и путей — [token-guard-report.md](measure-4/token-guard-report.md), [token-guard-copyable-provenance.json](measure-4/token-guard-copyable-provenance.json). В production разрешены только gpt-6-sol, gpt-6.1-sol, gpt-6-luna и literal null в token-guard. Ник связан с метаданными того же агента, а не с общим списком имён.

## Повтор замера: общий сырой parser

Сравнение — [comparison-final-4.json](measure-4/comparison-final-4.json), команды и SHA — [measure-final-4.log](measure-4/measure-final-4.log). Нижняя граница: `2026-10-21T11:30:00Z`. Старый и повторный as-of имеют верхнюю границу `2026-10-21T14:25:11.5517007Z`; новый живой срез — `2026-10-21T17:17:36.7915270Z`.

| Срез | Выбрано файлов | Ошибок | CLI → число нитей |
|---|---:|---:|---|
| old_root | 38 | 0 | `{"0.163.0-alpha.11": 38}` |
| final_asof | 38 | 1 | `{"0.163.0-alpha.11": 38}` |
| final_live | 68 | 1 | `{"0.163.0-alpha.11": 68}` |

Количества и SHA всех префиксов при прежнем cutoff совпали; изменилось выявление ошибки неизвестного служебного префикса: `01a15e3c-2e59-71d1-ab55-c3332f7755d0:3`, SHA `262279657115b3d6ef51a285b87292e77e1e448d0db7e365127858f5ed541a7a`. Это запрещённый recommended_plugins, допуск под него не расширялся.

| Префикс | Старый: вхождения / SHA | Повтор as-of | Живой срез |
|---|---:|---:|---:|
| `base_instructions` | 49 / 3 | 49 / 3 | 79 / 3 |
| `<permissions instructions>` | 38 / 5 | 38 / 5 | 73 / 5 |
| `<multi_agent_role>` | 38 / 2 | 38 / 2 | 72 / 2 |
| `<multi_agent_mode>` | 38 / 2 | 38 / 2 | 72 / 2 |
| `<model_switch>` | 19 / 3 | 19 / 3 | 40 / 3 |
| `<turn_aborted>` | 0 / 0 | 0 / 0 | 0 / 0 |
| `[codebase-memory]` | 51 / 5 | 51 / 5 | 93 / 5 |
| `token-guard (контроль расхода токенов)` | 31 / 9 | 31 / 9 | 69 / 14 |
| `<skills_instructions>` | 0 / 0 | 0 / 0 | 0 / 0 |
| `<environment_context>` | 38 / 5 | 38 / 5 | 72 / 9 |
| `<plugins_instructions>` | 0 / 0 | 0 / 0 | 0 / 0 |
| `<apps_instructions>` | 0 / 0 | 0 / 0 | 0 / 0 |
| `<recommended_plugins>` | 1 / 1 | 1 / 1 | 1 / 1 |
| `# AGENTS.md instructions` | 38 / 2 | 38 / 2 | 72 / 2 |
| `UNKNOWN` | 0 / 0 | 0 / 0 | 0 / 0 |

### model_switch: SHA → модель → число нитей

| SHA | Модель allow | Нитей as-of | Нитей живого среза |
|---|---|---|
| `393b91d7ecd12e7a853bc73d0a13410f794da77ccf6c0265030d037de575c0b6` | gpt-6-sol | `{'gpt-6-sol': 4}` | `{'gpt-6-sol': 8}` |
| `d53516da585796dc86821db9ce6790276777dbe1ee9b22f152e313d70468e97b` | gpt-6-luna | `{'gpt-6-luna': 11}` | `{'gpt-6-luna': 11}` |
| `f0de9b1ee3b9057ae136ccbc0cd5fb4b835e95fb982e89149db7023e2d1c327d` | gpt-6.1-sol | `{'gpt-6.1-sol': 4}` | `{'gpt-6.1-sol': 21}` |

Исторические SHA прежнего клиента не включены в allow. Полная историческая матрица — [models-report.md](measure-4/models-report.md). Неизвестных моделей model_switch в финальных срезах нет.

### Покрытие шаблонов token-guard

| Шаблон | As-of | Живой срез |
|---|---:|---:|
| budget | 22 | 51 |
| astra | 0 | 0 |
| subagent-level | 0 | 0 |
| red-subagent | 0 | 0 |
| red-main | 0 | 0 |
| yellow | 0 | 0 |
| self-high-worker | 3 | 6 |
| self-bloat | 0 | 0 |
| main-bloat | 0 | 0 |
| self-poll | 2 | 4 |
| self-repeat | 2 | 4 |
| child-high-worker | 1 | 3 |
| child-bloat | 0 | 0 |
| child-poll | 1 | 1 |

final_asof: блоков 31, точных заголовков 31, строк тела 31, несовпадений 0.

final_live: блоков 69, точных заголовков 69, строк тела 69, несовпадений 0.

Нулевое покрытие означает отсутствие ветви в этом срезе; оно не объявляется выполненным положительным тестом. Разрешённые реальные варианты и отрицательные подстановки отдельно проверяются тестами.

Финальный повтор после Q-10 — [comparison-q10.json](measure-4/q10-measure/comparison-q10.json), команды и SHA — [measure-q10.log](measure-4/q10-measure/measure-q10.log). Повторены обе границы замера полными sessions только на чтение. Набор выбранных нитей, вхождения и SHA блоков, привязки моделей и покрытие шаблонов совпали с таблицами выше. Сохранённые префиксы файлов сверены с манифестами; новые строки до cutoff не появились. Паритет текущего checker и замера: 19/19; AST split_service_blocks и parse_user не изменился.

## Решение 12: виды строк и world_state

Полные таблицы по версиям, полям и инструментам — [rows-report.md](measure-4/rows-report.md), [rows-schema-classes.json](measure-4/rows-schema-classes.json), [tool-definitions-report.md](measure-4/tool-definitions-report.md), [world-state-report.md](measure-4/world-state-report.md). Схема production собрана из текущей .11; определения additional_tools старой .10.2 не перенесены. В production-реестре инструментов нет определений, синтетический положительный реестр проверен тестом.

В world_state приняты закрытые поля и типы, hex40, конечные модели/режимы и токены команд. agents_value передаёт тело тому же check_agents, что проверяет обычное сообщение: глобальная и проектная части проверяются одним правилом. Чистая составная форма проходит; изменения любой части и посторонняя третья часть отвергаются.

## Реальные нити

Полный stdout и FAIL — [real-check-4.txt](real-check-4.txt). Для прежнего --until runner сохраняет физические строки до границы времени, затем checker читает только этот снимок. Дополнительно выполнен живой снимок. Оригинальные sessions читались без записи; manifest содержит SHA префиксов и точные соответствия исходных строк.

| Нить | As-of: код / FAIL | Живой: код / FAIL | Оценка |
|---|---|---|---|
| `01a15df6-4820-7b91-9e51-384f75bed1da` | 4 / 20 | 4 / 20 | Ожидаемый настоящий FAIL: старые skills и recommended_plugins |
| `01a15e46-2b5b-7e40-8270-17631e7cfc20` | 0 / 0 | 0 / 0 | OK |
| `01a15e69-f428-7143-88a0-5f238ccfe4ad` | 0 / 0 | 0 / 0 | OK |
| `01a15e6d-8d89-7362-9f89-8ebb8c4d56f0` | 0 / 0 | 0 / 0 | OK |
| `01a15e7b-2b27-7893-a558-4c28f0639b18` | 0 / 0 | 4 / 3 | Ожидаемый FAIL: только задания отсутствуют в журнале |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | 0 / 0 | 4 / 3 | Ожидаемый FAIL: только задания отсутствуют в журнале |

### Последние задания живого снимка

Путь и SHA извлечены из rollout. Если точного актуального файла с такими байтами не найдено, runner сохраняет отдельный файл текста снимка и явно отмечает это; независимое совпадение с исходным файлом в этом случае не заявляется. Полные заявленные пути, SHA проверенных текущих файлов и координаты — source_task в [live-results.json](measure-4/q10-recheck/live-results.json).

| Нить | Rollout:строка | Файл --task | SHA-256 | Совпадение с текущим исходным файлом |
|---|---|---|---|---|
| `01a15df6-4820-7b91-9e51-384f75bed1da` | `rollout-2026-10-21T13-16-24-01a15df6-4820-7b91-9e51-384f75bed1da.jsonl:2645` | `C:\Users\Slaven\.claude\projects\C--Users-Slaven-Documents-Novgorod\codex-direct\input-check-v2\measure-4\real-live-sessions\capture-20261021T171722801778Z\tasks\01a15df6-4820-7b91-9e51-384f75bed1da.snapshottext.taskfile` | `77d1afd64255978e56be02e62a3859c44a9eb06814e651ab8c37cdd83ac4dd54` | Нет; сохранён текст снимка |
| `01a15e46-2b5b-7e40-8270-17631e7cfc20` | `rollout-2026-10-21T14-43-39-01a15e46-2b5b-7e40-8270-17631e7cfc20.jsonl:11` | `C:\Users\Slaven\.claude\projects\C--Users-Slaven-Documents-Novgorod\codex-direct\input-check-v2\measure-4\real-live-sessions\capture-20261021T171722801778Z\tasks\01a15e46-2b5b-7e40-8270-17631e7cfc20.snapshottext.taskfile` | `dde79b89efc6482aab07690c99900abe744bba892818d7e5b9bcfc784a0cedfc` | Нет; сохранён текст снимка |
| `01a15e69-f428-7143-88a0-5f238ccfe4ad` | `rollout-2026-10-21T15-22-44-01a15e69-f428-7143-88a0-5f238ccfe4ad.jsonl:11` | `C:\Users\Slaven\.claude\projects\C--Users-Slaven-Documents-Novgorod\codex-direct\input-check-v2\measure-4\real-live-sessions\capture-20261021T171722801778Z\tasks\01a15e69-f428-7143-88a0-5f238ccfe4ad.snapshottext.taskfile` | `b8058df75ac4822703a20fb719bd2d669bc15247cc766d661bb82192049e5b4c` | Нет; сохранён текст снимка |
| `01a15e6d-8d89-7362-9f89-8ebb8c4d56f0` | `rollout-2026-10-21T15-26-40-01a15e6d-8d89-7362-9f89-8ebb8c4d56f0.jsonl:11` | `C:\Users\Slaven\.claude\projects\C--Users-Slaven-Documents-Novgorod\codex-direct\input-check-v2\measure-4\real-live-sessions\capture-20261021T171722801778Z\tasks\01a15e6d-8d89-7362-9f89-8ebb8c4d56f0.snapshottext.taskfile` | `c6912bf5d89d08694e4f9315b369d46e4bf23836eba096a526855e30bbb29d72` | Нет; сохранён текст снимка |
| `01a15e7b-2b27-7893-a558-4c28f0639b18` | `rollout-2026-10-21T15-41-32-01a15e7b-2b27-7893-a558-4c28f0639b18.jsonl:2444` | `C:\Users\Slaven\.claude\projects\C--Users-Slaven-Documents-Novgorod\codex-direct\input-check-v2\measure-4\real-live-sessions\capture-20261021T171722801778Z\tasks\01a15e7b-2b27-7893-a558-4c28f0639b18.snapshottext.taskfile` | `70987db81a225c4a188b17bf3e298dfc7f4ffd0e4b930a94ced9cc6d9872c28a` | Нет; сохранён текст снимка |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T15-53-14-01a15e85-e225-70d3-8c89-6195fdea3856.jsonl:2168` | `C:\Users\Slaven\.claude\projects\C--Users-Slaven-Documents-Novgorod\codex-direct\input-check-v2\A-RESUME-3-09.md` | `14065e0ced740cce79cad0fffd979cca416e124d60417a6f5a852ed73bd7caaa` | Да |

### Все FAIL двух живых целей, построчно

В таблице приведён каждый FAIL двух живых целей. Все они связаны только с отсутствием задания в журнале; граница ledger_required_since не переносилась, записи задним числом не создавались.

| Цель | Полный FAIL | Только отсутствие журнала |
|---|---|---|
| `01a15e7b-2b27-7893-a558-4c28f0639b18` | `rollout-2026-10-21T15-41-32-01a15e7b-2b27-7893-a558-4c28f0639b18.jsonl: задание хода t2 нет в журнале` | Да |
| `01a15e7b-2b27-7893-a558-4c28f0639b18` | `rollout-2026-10-21T15-41-32-01a15e7b-2b27-7893-a558-4c28f0639b18.jsonl: задание хода t3 нет в журнале` | Да |
| `01a15e7b-2b27-7893-a558-4c28f0639b18` | `rollout-2026-10-21T15-41-32-01a15e7b-2b27-7893-a558-4c28f0639b18.jsonl: задание хода t4 нет в журнале` | Да |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T15-53-14-01a15e85-e225-70d3-8c89-6195fdea3856.jsonl: задание хода t4 нет в журнале` | Да |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T15-53-14-01a15e85-e225-70d3-8c89-6195fdea3856.jsonl: задание хода t5 нет в журнале` | Да |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T15-53-14-01a15e85-e225-70d3-8c89-6195fdea3856.jsonl: задание хода t6 нет в журнале` | Да |

### Разбор реальных расхождений

Полная сверка каждого прежнего отказа и двух недочётов — [q10-recheck](measure-4/q10-recheck/). Происхождение переписки теперь подтверждается деревом spawn/output/metadata, точной шапкой, единственным вызовом collaboration/send_message, его адресатом и временем. Один вызов принимается только для одной доставки; переписка не заменяет задание от родителя.

Число настоящих agent_message, нарушающих forbidden, приведено для каждой цели в итоговых JSON. Оно равно нулю в обоих срезах; правило не ослаблялось. Шифротекст не расшифровывается и не публикуется.

## Q-10: реализация и различающие тесты

Основание — ответ распорядителя на Q-RESUME-3-10. Копия кода до правок и её SHA сохранены в [q10-baseline.json](q10-baseline.json). До добавления тестов контроль этой копии прошёл: [q10-control.log](q10-control.log). Финальный красный перед изменением checker: 19 failed, 149 deselected in 1.89s. Для отрицательных случаев assert требует новую конкретную причину; прежний общий отказ происхождения не засчитывается.

| Правило | Реализация |
|---|---|
| Подтверждённое дерево, адресат и alias/id/path | [check-codex-input.py:486](check-codex-input.py#L486); [check-codex-input.py:508](check-codex-input.py#L508) |
| Точная копия единственного send_message; время и однократность | [check-codex-input.py:534](check-codex-input.py#L534); [check-codex-input.py:45](check-codex-input.py#L45) |
| Точная шапка и отдельный счётчик переписки без задания | [check-codex-input.py:957](check-codex-input.py#L957) |
| Составной world_state AGENTS тем же check_agents | [check-codex-input.py:1185](check-codex-input.py#L1185) |
| Число сообщений среды после parse_user | [check-codex-input.py:937](check-codex-input.py#L937) |

| Тест:строка | Красный до кода | Зелёный |
|---|---|---|
| [test_input_check.py:1519](test_input_check.py#L1519) `test_sibling_message_exact_copy_ok` | [q10-red.log:1540](q10-red.log#L1540) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1525](test_input_check.py#L1525) `test_sibling_message_payload_byte_diff_fails` | [q10-red.log:1543](q10-red.log#L1543) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1531](test_input_check.py#L1531) `test_sibling_message_unverified_sender_fails` | [q10-red.log:1544](q10-red.log#L1544) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1537](test_input_check.py#L1537) `test_sibling_message_wrong_target_fails` | [q10-red.log:1545](q10-red.log#L1545) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1547](test_input_check.py#L1547) `test_sibling_message_before_call_fails` | [q10-red.log:1546](q10-red.log#L1546) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1553](test_input_check.py#L1553) `test_sibling_message_double_delivery_fails` | [q10-red.log:1548](q10-red.log#L1548) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1559](test_input_check.py#L1559) `test_q10_multiple_matching_calls_fail` | [q10-red.log:1549](q10-red.log#L1549) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1565](test_input_check.py#L1565) `test_sibling_message_header_mismatch_fails` | [q10-red.log:1550](q10-red.log#L1550) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1572](test_input_check.py#L1572) `test_sibling_message_is_not_assignment` | [q10-red.log:1551](q10-red.log#L1551) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1580](test_input_check.py#L1580) `test_q10_sibling_message_encrypted_content_explicit` | [q10-red.log:1552](q10-red.log#L1552) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1587](test_input_check.py#L1587) `test_q10_sibling_message_sender_at_different_depth` | [q10-red.log:1553](q10-red.log#L1553) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1614](test_input_check.py#L1614) `test_q10_world_state_combined_agents` | [q10-red.log:1554](q10-red.log#L1554) | [fix-green.log:390](fix-green.log#L390) |
| [test_input_check.py:1637](test_input_check.py#L1637) `test_q10_user_quote_and_real_environment_ok` | [q10-red.log:1558](q10-red.log#L1558) | [fix-green.log:390](fix-green.log#L390) |

Проверки времени включают отличие в седьмом знаке дробной секунды. Штампы сравниваются без округления через float. Сопоставление переписки не увеличивает число заданий помощников; отсутствие задания родителя остаётся FAIL.

## Q-10: каждый прежний отказ на реальных данных

Использованы те же физические снимки, файлы --task и обе отсечки, что при остановке. Цепочки происхождения загружаются для доказательства доставки; --children по-прежнему определяет полный аудит потомков. Полные доказательства — [comparison.json](measure-4/q10-recheck/comparison.json).

| Цель | Прежняя доставка rollout:строка | Было | Теперь / правило | Вызов |
|---|---|---|---|---|
| `01a15e7b-2b27-7893-a558-4c28f0639b18` | `rollout-2026-10-21T17-46-01-01a15eed-2047-7b83-ad47-cd327e2db5ea.jsonl:142` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_d5557fd22c484860ad8ffcf979ddea2d` |
| `01a15e7b-2b27-7893-a558-4c28f0639b18` | `rollout-2026-10-21T17-46-10-01a15eed-4707-79d1-a9eb-ba271ab9f9ac.jsonl:162` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_61cc9287ff534f66bfb72776e41fdf4e` |
| `01a15e7b-2b27-7893-a558-4c28f0639b18` | `rollout-2026-10-21T17-46-10-01a15eed-4707-79d1-a9eb-ba271ab9f9ac.jsonl:207` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_9e64be5cd47046d98adbae50e18aaab3` |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T18-33-24-01a15f18-8456-7382-82a6-c7dcaa2e8e16.jsonl:118` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_48963f8f2ba54d218707472bc0b9c141` |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T18-33-24-01a15f18-8456-7382-82a6-c7dcaa2e8e16.jsonl:180` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_af3628d5ada2468c835c3fe10bb6c2e8` |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T18-33-42-01a15f18-c91f-79a2-ba8f-19edf2ca8b14.jsonl:85` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_e6d52b8ef9024b909e7780fcbfa21c19` |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T18-33-42-01a15f18-c91f-79a2-ba8f-19edf2ca8b14.jsonl:125` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_488f3208e7024e06b24bea5ae9974ac6` |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T18-33-42-01a15f18-c91f-79a2-ba8f-19edf2ca8b14.jsonl:150` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_6e6a6789966a42fba26cf6549af75539` |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T19-42-36-01a15f57-dea6-7b41-93f4-a0f19d47904b.jsonl:257` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_5ed75a512c7c480482c98b92a66816a1` |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T19-42-36-01a15f57-dea6-7b41-93f4-a0f19d47904b.jsonl:287` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_a87a6f15e5604270ae8fc1ddf3247995` |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T19-42-49-01a15f58-10c5-75f0-893c-c4708c419370.jsonl:215` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_1c0c2371a05e4614864114e540277f70` |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T19-54-48-01a15f63-096f-7ee3-98c1-023fcd6a0791.jsonl:76` | Происхождение не установлено | OK: проверенная переписка одного дерева | `call_21b7f7d2a6624c5faa2978bd1c254a7b` |
| `01a15e69-f428-7143-88a0-5f238ccfe4ad` | `rollout-2026-10-21T15-22-44-01a15e69-f428-7143-88a0-5f238ccfe4ad.jsonl:7` | Составной world_state AGENTS отвергнут | OK: agents_value → check_agents, глобальная и проектная части | — |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | `rollout-2026-10-21T15-53-14-01a15e85-e225-70d3-8c89-6195fdea3856.jsonl:6,11` | Цитата посчитана второй средой | OK: parse_user, одна среда и одно задание | — |

Координаты и новый вывод двух последних случаев находятся в targeted_evidence [live-results.json](measure-4/q10-recheck/live-results.json); те же случаи проходят в asof. Остаточные отказы двух живых целей перечислены выше полностью и относятся только к журналу. У заражённой старой цели df6 сохранены также прежние отказы происхождения: ожидаемый FAIL обоснован обнаруженными skills и recommended_plugins, полного доказательства происхождения её переписки эта сдача не заявляет.

## Самоаудит

Один круг итоговой сверки — [self-audit-4.json](self-audit-4.json). Сверены прежние assert, хеши защищённых файлов, принятого префикса PLAN-4, синтаксис, состав моделей/схем, финальная ревизия логов, точность времени переписки и все прежние отказы на сохранённых снимках. Проверка не устанавливалась на место рабочей обёртки. Исходный baseline сохранён; его копия для красных отличается только разрешённой подготовкой среды wrapper.

## Не проверено

- Тесты обёртки в песочнице шли с заранее созданной папкой журнала при INPUT_CHECK_PRECREATE_LEDGER=1. Ветку «папки журнала нет» проверит ведущий вне песочницы без этой переменной.
- Создание hooks-ссылки запрещено ОС (WinError 1314); тест не добавлен. Правка find -L внесена, её работа на ссылке не проверена.
- Связь digest-полей с исходником: проверяется форма hex40, не происхождение дайджеста.
- Определения инструментов, которые клиент передаёт модели вне rollout: checker их не видит.
- Содержимое результатов запрошенных моделью инструментов: работа модели, по смыслу не проверяется.
- Содержимое зашифрованных заданий, ответов и переписки: видны происхождение, открытая оболочка и побайтная копия вызова отправителя; смысл шифротекста не проверяется.
- Будущие поля, виды строк и версии клиента: текущий закрытый допуск их не подтверждает.
- Для задач со снимком текста не доказано независимое совпадение с текущим исходным файлом; paths/SHA источников и fallback сохранены явно.
- Графовые инструменты coverage/discovery отклонялись политикой approval never; выводы основаны на прямом чтении исходников.
- .pytest-r4* и .r4-mkdir-check сохранены, в validation-4.txt не входят. TEMP, hostile-r3, lead-check-r3, REPORT-2.md, REPORT-3.md и brief-review-resume3.md не менялись.
