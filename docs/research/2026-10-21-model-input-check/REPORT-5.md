## План

**STOP: критерий решения 10 не достигнут. Установка не разрешена.** Вопрос Q-RESUME-4-03 — в конце [RESUME-4.md](RESUME-4.md). Исходный план PLAN-5 и ответы PLAN-OK сохранены; файл PLAN-OK не изменён.

Исправлены выбор бинаря, проверка подстановок по контексту, сравнение путей, directory и закрытые командные префиксы, клиентская ошибка ребёнка и обязательное задание по нити. Проведена отдельная чистка. Добавлены согласованные канонические permissions и рамка клиентской ошибки; другие служебные варианты не добавлялись.

## Проверки

- Исходный набор: [fix5/control.log](fix5/control.log) — 168 passed; checker 938fa50f… сохранён в fix5/baseline.
- Финальный красный: 23 failed, 19 passed, 168 deselected, 1 warning in 5.73s; [fix5-red.log:1063](fix5-red.log#L1063).
- Полный перед чисткой: 210 passed in 55.84s.
- Полный после чистки: 210 passed in 55.14s; [fix5-green.log:8945](fix5-green.log#L8945). Внешний PYTHONIOENCODING снят, включён -W error; предупреждений нет.
- Скрипт sweep после добавления обязательной остановки на пустом ребёнке: [fix5-green.log:8949](fix5-green.log#L8949) — родительский pytest, 3 passed.

Все pytest запускались родителем последовательно через .tools/py313/python.exe -B и Git Bash, с INPUT_CHECK_PRECREATE_LEDGER=1 и собственной .pytest-r5. В секциях записаны команда, SHA четырёх файлов, окружение, начало/конец UTC и код. Ранние секции с промежуточными версиями не являются финальным доказательством.

Первый дополнительный -W error обнаружил прежние незакрытые файлы Registry. Оба чтения обёрнуты в with; финальный строгий прогон прошёл. AST всех прежних функций test_* совпадает с исходной ревизией; разрешённые изменения — только env measurement и подготовка wrapper/FAKE_CODEX. В положительной фикстуре world_state directory отсутствует: проверка обязательна для каждого присутствующего directory, включая глобальный AGENTS; null и чужая строка отвергаются.

## Фактическое время тестовых прогонов

| Прогон | Начало UTC | Конец UTC |
|---|---|---|
| Красный финальной ревизии | 2026-10-21T19:13:51.763494+00:00 | 2026-10-21T19:13:58.335041+00:00 |
| Полный до чистки | 2026-10-21T19:14:21.291954+00:00 | 2026-10-21T19:15:17.920236+00:00 |
| Полный после чистки | 2026-10-21T19:18:48.740428+00:00 | 2026-10-21T19:19:44.614692+00:00 |

## Находка → правка → тест → доказательство

| Находка | Файл:строка | Тест | Красный / закрепление | Зелёный |
|---|---|---|---|---|
| Н1: бинарь и версия | [codex-exec.sh:4](codex-exec.sh#L4) | `test_fix5_explicit_codex_bin_beats_path_decoy`<br>`test_fix5_desktop_newest_binary_beats_path_decoy`<br>`test_fix5_missing_desktop_binary_stops_before_probe` | [fix5-red.log:957](fix5-red.log#L957)<br>[fix5-red.log:966](fix5-red.log#L966)<br>[fix5-red.log:975](fix5-red.log#L975) | [fix5-green.log:8945](fix5-green.log#L8945) |
| Н2: permissions/CBM | [check-codex-input.py:109](check-codex-input.py#L109) | `test_fix5_production_service_context_accepts_new_paths`<br>`test_fix5_known_literal_needs_matching_context`<br>`test_fix5_permissions_requires_all_contexts_to_agree`<br>`test_fix5_raw_normalization_markers_are_not_authorized` | [fix5-red.log:704](fix5-red.log#L704)<br>[fix5-red.log:721](fix5-red.log#L721)<br>[fix5-red.log:738](fix5-red.log#L738)<br>[fix5-red.log:984](fix5-red.log#L984)<br>[fix5-red.log:997](fix5-red.log#L997)<br>[fix5-red.log:1027](fix5-red.log#L1027)<br>[fix5-red.log:841](fix5-red.log#L841)<br>[fix5-red.log:854](fix5-red.log#L854) | [fix5-green.log:8945](fix5-green.log#L8945) |
| Н3: пути и world_state | [check-codex-input.py:70](check-codex-input.py#L70) | `test_fix5_rejects_path_and_world_state_attacks`<br>`test_fix5_rejects_agents_header_dotdot_without_git`<br>`test_fix5_plain_foreign_cwd_remains_rejected`<br>`test_fix5_known_approved_prefix_from_real_world_state` | [fix5-red.log:754](fix5-red.log#L754)<br>[fix5-red.log:768](fix5-red.log#L768)<br>[fix5-red.log:782](fix5-red.log#L782)<br>[fix5-red.log:797](fix5-red.log#L797)<br>[fix5-red.log:812](fix5-red.log#L812)<br>[fix5-red.log:827](fix5-red.log#L827)<br>закрепление на исходной ревизии<br>закрепление на исходной ревизии | [fix5-green.log:8945](fix5-green.log#L8945) |
| Н4: ошибка ребёнка | [check-codex-input.py:499](check-codex-input.py#L499) | `test_fix5_real_child_error_delivery`<br>`test_fix5_error_from_another_child_is_rejected` | [fix5-red.log:867](fix5-red.log#L867)<br>закрепление на исходной ревизии | [fix5-green.log:8945](fix5-green.log#L8945) |
| 6: задание по нити | [check-codex-input.py:1192](check-codex-input.py#L1192) | `test_fix5_correspondence_only_turn_uses_thread_assignment` | [fix5-red.log:890](fix5-red.log#L890) | [fix5-green.log:8945](fix5-green.log#L8945) |
| Н6: UTF-8 ребёнка | [test_input_check.py:546](test_input_check.py#L546) | `test_fix5_measurement_child_uses_utf8_without_outer_encoding` | [fix5-red.log:919](fix5-red.log#L919) | [fix5-green.log:8945](fix5-green.log#L8945) |
| Н7: единое точное время | [check-codex-input.py:36](check-codex-input.py#L36) | `test_fix5_since_uses_full_fractional_second`<br>`test_fix5_ledger_cutoff_uses_full_fractional_second` | [fix5-red.log:927](fix5-red.log#L927)<br>[fix5-red.log:940](fix5-red.log#L940) | [fix5-green.log:8945](fix5-green.log#L8945) |
| Н7: мёртвые blocks/ветка/пара и повторный parent path | checker + allow; [self-audit.json](fix5/self-audit.json) | Полный набор до и после; закрепление | Новый функциональный красный не заявляется | [fix5-green.log:8945](fix5-green.log#L8945) |
| Н8/9: граница журнала и приоритет кода 4 | ledger_required_since без изменения; run_checked сохраняет политику | Прежние wrapper-тесты; закрепление | Не функциональное изменение | [fix5-green.log:8945](fix5-green.log#L8945) |

## Мутанты Н5

| Мутант | Упавший тест | Красный лог |
|---|---|---|
| recipient | `test_fix5_correspondence_rejects_foreign_recipient` | [fix5-mutants.log:14](fix5-mutants.log#L14) |
| self_sender | `test_fix5_correspondence_rejects_self_sender` | [fix5-mutants.log:57](fix5-mutants.log#L57) |
| header | `test_fix5_correspondence_requires_message_header` | [fix5-mutants.log:100](fix5-mutants.log#L100) |

Каждый мутант дал один упавший assert своего теста; штатный checker проходит эти же тесты. Копии не меняют production-файлы.

## Замер подстановок

Полные источники и частоты — [MEASURE-5.md](fix5/measure/MEASURE-5.md), его [manifest.json](fix5/measure/manifest.json). Graph project: **выведено по примерам**, все 1474 блока и 28 cwd совпали. Исходник CBM в workspace не найден; hooks под ~/.codex не читались. Конечное правило — [:\/] → -, затем схлопнуть дефисы, с точным сравнением производного имени.

Permissions: три канонических SHA; полные тексты в allowed-blocks. Отсутствующий необязательный writable_roots трактуется как отсутствие дополнительных корней: допустим только cwd; отсутствующий/неверный cwd либо sandbox_policy не получает подстановки. Все контексты хода должны подтвердить одну и ту же подстановку. Буквальные метки не проходят контекстный guard. Для approved_command_prefixes измерена одна последовательность uv/tool/uninstall/graphifyy, добавленная в закрытый список. Рамка ошибки b02a11ed… и её источники находятся в [error-evidence.json](fix5/measure/error-evidence.json).

## Живой sweep — не сошёлся

Начало 2026-10-21T19:20:46.992053+00:00; последняя граница 2026-10-21T19:25:12.395095+00:00; длительность 265.400 с; проходов 4. Проверены 42 корня; последний manifest содержит 1349 физических файлов sessions. Новые файлы во время проверки включались в последующие проходы. Полный отчёт — [live-sweep-5.txt](live-sweep-5.txt), [summary.json](fix5/live-sweep/summary.json).

| Класс | Число причин |
|---|---:|
| а | 248 |
| б | 17 |
| в | 2 |

Класс в содержит неизвестный SHA Skills update и диагностическую ошибку согласованности снимка. На последнем проходе изменились 11 файлов; согласованный снимок не получен. Ни этот результат, ни шесть строк ниже не объявляются окончательным доказательством сходимости.

| Цель | Итог последнего прохода | Причины |
|---|---|---|
| `01a15f7c-8713-7231-ad2c-290d2d2d2c49` | OK | Нет FAIL |
| `01a15f7c-d84f-7630-bb84-741cdd65cd1c` | OK | Нет FAIL |
| `01a15f85-f8cd-7fe0-9f2e-e1ab4dbf781f` | FAIL | задание хода t1 нет в журнале; задание хода t2 нет в журнале; задание хода t3 нет в журнале |
| `01a15f99-0fd5-79c1-8d41-ea8d27803de6` | FAIL | задание хода t1 нет в журнале |
| `01a15fa1-750d-71e1-9d3e-6283e784fa2a` | FAIL | задание хода t1 нет в журнале |
| `01a15fab-b5e8-7570-98e0-e5e97e45a47a` | OK | Нет FAIL |

В этих шести целях нет отказов permissions, codebase-memory и FINAL_ANSWER. Отказы журнала отнесены к б с явным --all-direct: рабочая v2 не установлена, реальные запуски v2 в этой работе не выполнялись.

### Исключённые по UTC корни

| Файл | session_meta UTC |
|---|---|
| `2026/10/21/rollout-2026-10-21T01-43-12-01a15b7b-a400-7063-9229-777bc959fe62.jsonl` | 2026-10-20T22:43:12.005000+00:00 |
| `2026/10/21/rollout-2026-10-21T02-40-44-01a15bb0-53a8-72b3-975a-650ffca48bd2.jsonl` | 2026-10-20T23:40:44.847000+00:00 |
| `2026/10/21/rollout-2026-10-21T02-41-24-01a15bb0-edb6-7521-a8e1-d45ff4302bdc.jsonl` | 2026-10-20T23:41:24.281000+00:00 |

### Содержательный блокирующий отказ

`rollout-2026-10-21T13-16-24-01a15df6-4820-7b91-9e51-384f75bed1da.jsonl:2378`, t6: SHA `976dfeb2d0acae776111fe7be38167ae8cee82d399ca3b121821886f31b78e48`. Полный небольшой текст и вопрос — Q-RESUME-4-03; исходные байты и соседние SHA — [blocking-evidence.json](fix5/blocking-evidence.json). Этот SHA не внесён в allow и не переклассифицирован в а для получения нуля.

## SHA-256 четырёх файлов

| Файл | SHA-256 |
|---|---|
| [check-codex-input.py](check-codex-input.py) | `b1a97411cf96c41af4e4dd440d98728d22412f9e533af36e216520c54022ea3e` |
| [codex-exec.sh](codex-exec.sh) | `e6cf34a1da3ecff42eac3b6b3b630df8cbf01bb2f6993c05becd6151d1fcf01f` |
| [codex-input-allow.json](codex-input-allow.json) | `1a3072bf8f19be2439a618ee2f482056e96a883da49d573573798b614060ebb0` |
| [test_input_check.py](test_input_check.py) | `ba27329990d5e304fa9888b3207b64ae6322d630390232711f1d778a1247629b` |

## Самоаудит и отклонения

Один круг — [self-audit.json](fix5/self-audit.json). Проверены сохранность baseline, всех прежних test-функций, рабочих файлов и защищённых документов; неизменность границы журнала/forbidden/моделей, закрытые подстановки и удаление мёртвого кода. Известное незавершение решения 10 записано отдельно; готовность не заявляется.

Помощник sweep самостоятельно выполнил синтетические assert-вызовы без pytest; это отклонение от порядка, такие результаты не засчитывались. Все приведённые pytest и реальные checker-прогоны выполнены родителем; синтетика sweep повторена родительским pytest. Графовые инструменты отвергнуты approval=never, использовано прямое чтение.

## Не проверено

- Критерий нулевого класса в и согласованный последний sweep: блокируется Q-RESUME-4-03.
- Разрешение нового Skills update: требуется решение владельца; допуск не расширен.
- Настоящие Codex Desktop, версия бинаря, new/resume, установка и servak: реальные запуски запрещены; wrapper проверен fake Codex.
- Создание отсутствующей папки журнала вне песочницы: wrapper-тесты использовали INPUT_CHECK_PRECREATE_LEDGER=1. Hooks-ссылки с недоступными правами не проверялись заново.
- Смысл зашифрованных заданий/переписки, содержимое результатов инструментов, связь digest с исходником и определения инструментов вне rollout — прежние ограничения.
- Будущие поля, префиксы, версии клиента и строки после последней границы наблюдения не подтверждены.
- Рабочая обёртка и проверка в корне не устанавливались. TEMP и прежние защищённые отчёты не менялись.
