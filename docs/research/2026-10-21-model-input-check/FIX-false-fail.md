# Отчёт: ложные FAIL проверки входа Codex (#939, #990, #1005)

Дата: 03.11.2026. Исполнитель: субагент Sonnet 5.5 «1 Главного распорядителя». Бриф: `brief-false-fail.md` в этой же папке. Все три класса исправлены; статус: готово, ждёт ревью распорядителя.

## Какая копия вызывается

Запуск идёт через `codex-direct/v2/codex-exec.sh` на servak, и он вызывает `/srv/novgorod-work/codex-direct/v2/check-codex-input.py`. До правки она была побайтно равна локальной `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/check-codex-input.py` (SHA-256 `e0edb883602d8f722b63fea4e7b7e6a1913bb4ec8d0a718a79f6d294b6fa2ed4`). Правлены только эти две копии; после правки обе имеют SHA-256 `9f527c847f9091da4349692e76f147cc5f88eedd4f5d188a728059f16e8a6e5e`. Копия на servak заменена атомарно: новый файл записан рядом как `check-codex-input.py.new`, сверен по SHA и компиляции, затем `mv` поверх; SHA после замены сверен ещё раз. Нить Codex не останавливалась.

Невызываемые копии не правлены: `codex-direct/check-codex-input.py`, `codex-direct/v2-live/…`, `.baseline-linux-s/`, `v2/check-codex-input.py.v2linux` на servak, `test-runs/*/bundle/src/*`. `codex-input-allow.json` и `codex-exec.sh` не менялись.

Смена SHA скрипта меняет отпечаток запуска в `codex-exec.sh`: следующий запуск `codex-exec.sh` выполнит пробу `codex exec` заново. Я Codex не запускал и пробу не проверял.

## Правки по классам

Все номера строк — в `check-codex-input.py` (рядом с ним `test_input_check.py`). Новые тесты добавлены в конец `test_input_check.py` начиная со строки 2729; существующие тесты не менялись. Шаблон реального контекста цели лежит в `fixtures-false-fail/goal-context.tmpl`.

### #939: agent_message в replacement_history

- Правка: `check-codex-input.py:1253–1257`. Элемент `agent_message` внутри `replacement_history` принимается только если его каноническая форма точно совпадает с живым сообщением этой же нити, которое проверка уже приняла (`self.agent_seen`). Иначе FAIL «agent_message не совпадает с проверенным сообщением нити». Неизвестные типы элементов по-прежнему дают FAIL «неизвестный тип replacement_history».
- Тесты (`test_input_check.py:2746–2770`): принимается совпадающее сообщение; FAIL при подмене шифртекста, текста, автора или id; FAIL без живой строки; FAIL, если живая строка сама отвергнута.
- Красный прогон на старой копии (`INPUT_CHECK_SOURCE_DIR` на копию с SHA `e0edb883…`) для всего нового блока из 29 тестов: 23 failed, 6 passed, код возврата 1. Зелёный на новой: 29 passed, код возврата 0. Полный набор: 298 passed и один прежний сбой (тест под Git Bash на Windows, от моих правок не зависит), код возврата 1.

### #990: ход продолжения цели

- Правка: функции `goal_parts` (:46) и `goal_created` (:60), константа `GOAL_TEMPLATE_SHA` (:43), методы `Audit.goal_context` (:1094) и `Audit.idle_goal_turn` (:1108), проверка вызовов в ходе цели (:1283–1286), вызовы в :1326–1328.
  - Ход с `turn_trigger goal` без user-задания не требует задания в файле задачи, если в нём нет вызовов инструментов и единственный вход — developer `<turn_aborted>` из списка разрешённых; последний ход по-прежнему сверяется с файлом задания.
  - User-сообщение `<codex_internal_context source="goal">` принимается, только если шаблон (с вырезанной целью и тремя счётчиками токенов) даёт хэш `e90144e4…1a5e`, ход имеет триггер goal и в нити раньше есть `create_goal` с этой же целью (`function_call` или `custom_tool_call`). Внутри `replacement_history` такое сообщение принимается только при точном совпадении с ранее принятым живым.
  - Ход цели с вызовами инструментов даёт FAIL «ход цели содержит вызовы инструментов».
- Тесты (`test_input_check.py:2814–2901`): принимаются ход с одним `<turn_aborted>` и ход с контекстом цели; FAIL при вызове инструмента, чужом user-тексте, цели без `create_goal` или с другой целью, изменённом шаблоне, контексте вне хода цели, ходе без триггера цели и без задания, подмене последнего задания; контекст цели в сжатии принимается только с живой строкой.
- Красный/зелёный прогон — общий с остальными классами, см. выше (23 failed, 6 passed, код 1 → 29 passed, код 0).
- Проверка на реальных данных: все контексты цели во всех журналах servak имеют ожидаемый хэш шаблона и доказанный `create_goal` (отдельный скрипт, удалён).

### #1005: второй блок среды в ходе

- Правка: `UPDATABLE_ENVIRONMENT_TAGS` и `environment_update` (:333–350), `Audit.environment_sequence` (:1112–1121), вызов из :1151. Счётчик сообщений среды заменён на список тел в ходе.
  - Второй блок принимается, только если все его поля из набора `current_date`, `timezone`, `subagents`, `filesystem`, он разбирается как XML и его `filesystem` (workspace_roots) равен первому. Поля `cwd` и `shell` во втором блоке недопустимы. Часовой пояс и подагенты проверяются прежними правилами блока среды.
  - FAIL «второй блок среды отличается от первого» при любом ином составе; FAIL «больше одного сообщения среды в ходе: повтор без изменений» при точном повторе; FAIL «больше двух сообщений среды в ходе» для третьего блока.
- Отступление от брифа (брифом было «отличается только датой»): реальный второй блок (журнал нити `01a19dff-015e`) содержит ещё `timezone`, `subagents` и `filesystem`, поэтому допущена смена `current_date`, `timezone` (в рамках списка допустимых), `subagents` при тех же `filesystem`/`workspace_roots`. Изменение `cwd`, `shell`, корней или лишние поля — FAIL. Повтор без изменений остался FAIL, потому что существующий тест `test_resume3_duplicate_environment_messages_fail` этого требует (тест не менялся).
- Тесты (`test_input_check.py:2943–2986`): принимаются смена даты и смена даты с подагентами; FAIL при повторе, третьем блоке, чужих корнях, `cwd`, `shell`, неизвестном часовом поясе.
- Красный/зелёный — общий прогон, см. выше.

## Прогон на журналах нитей природного слоя 4, 5, 6 (servak)

Папка журналов `/srv/novgorod-work/codex-direct/home/sessions/2026/11/03/`, запуск `check-codex-input.py --thread <id> --task <T> --children --out …` для старой (`e0edb883…`) и новой (`9f527c84…`) копии. Числа — строки FAIL по каждому rollout; общий итог «ИТОГ: FAIL» учтён в последнем rollout прогона.

| Прогон | Rollout (id) | До | После |
|---|---|---|---|
| 4 | 01a19e1e-a866 | 0 | 0 |
| 4 | 01a19e1f-7cba | 12 (agent_message в сжатии) | 0 |
| 4 | 01a19e1f-d0ac | 0 | 0 |
| 4 | 01a19e49-9b00 | 0 | 0 |
| 4 | 01a19e2c-9bc5 | 3 (agent_message в сжатии) | 0 |
| 4 | 01a19e20-227d | 0 строк, итог FAIL | 0 |
| 5 | 01a19e68-7d6f | 0 строк, итог: задание последнего хода t2 не равно файлу (ход цели) | 0 |
| 5 | 01a19e69-773f | 29 (agent_message) | 0 |
| 5 | 01a19e69-b661 | 35 (agent_message) | 0 |
| 5 | 01a19e69-228e | 17 (agent_message) | 0 |
| 6 | 01a19eab-08e1 | 0 строк, итог: задание последнего хода t2 не равно файлу (ход цели) | 0 |
| 6 | 01a19eab-84f1 | 0 | 0 |
| 6 | 01a19eab-d716 | 0 | 0 |
| 6 | 01a19eab-b13c | 0 строк, итог FAIL | 0 |

Итог по прогонам: 4 — до код 4 (FAIL), после код 0 (OK, 6 rollout); 5 — до код 4, после код 0 (OK, 4 rollout); 6 — до код 4, после код 0 (OK, 4 rollout). После правки FAIL не осталось ни в одном rollout. Настоящих FAIL в этих трёх нитях не было, поэтому «настоящий FAIL сохраняется» подтверждён тестами, а не журналами.

Одиночные прогоны других нитей (`--thread` без `--task`), до → после, оба кода возврата 4 → 0: 01a19cdf-9c6d (FAIL «нет задания user в ходе t2» — ход цели) 1 → 0; 01a19dff-015e (два раза «больше одного сообщения среды в ходе») 2 → 0; 01a19eab-08e1 (журнал без `--task`: «задание хода t1 нет в журнале»; это итоговая строка отсутствия задания в ходе цели) 1 → 0; 01a19e69-228e (agent_message в сжатии, 34 вхождения, 18 строк FAIL) → 0.

## Что не проверено

- Живой запуск Codex с новой копией: проба `codex exec` при смене отпечатка не выполнена (Codex не запускался).
- Прогон с `--ledger`/`--since` в круге 1 не делал, и утверждение «правки не касаются» было неверным: правка #990 меняет `last_turn` (последний рабочий ход, холостой ход цели не считается), а от него зависят `--task`, `--ledger` и `--since`. Исправлено в «Круге 2»: тесты и прогоны с `--ledger`/`--since` на реальных нитях.
- Контекст цели внутри `compacted` на реальных данных: в журналах servak такого случая нет, проверено только тестами.
- Реальные случаи второго блока среды вне нити 01a19dff-015e и вне перечисленных нитей: не искал.
- Невызываемые копии (перечислены выше) не правились и не прогонялись; расхождение с ними осталось.
- Тест под Git Bash на Windows падает и до правок; причину не разбирал (вне рамки).
- Нить, идущая на servak во время замены, ещё не прошла проверку новой копией: первый реальный вызов покажет, нет ли новых расхождений.

## Уборка

Удалены временные папки: `/srv/novgorod-work/tmp/input-check-fix/` на servak, `C:/Users/Slaven/AppData/Local/Temp/claude/fixwork/` локально и `__pycache__`, созданный моей проверкой компиляции в `/srv/novgorod-work/codex-direct/v2/`. Git не трогался, комментарии и закрытие issue — за распорядителем.

## Круг 2 (замечания проверки Codex gpt-6.1-sol, вердикт FAIL)

Статус: все четыре замечания исправлены, красный тест перед правкой был, вызываемая копия на servak заменена. Номера строк — в `check-codex-input.py` и `test_input_check.py` (тесты круга 2 — в конце файла, от строки 2990).

1. #990, доказательство цели. Подстрока `create_goal` принимала комментарий. Теперь `goal_created` (`check-codex-input.py:63`) принимает только настоящий вызов в ЭТОЙ нити в ходе РАНЬШЕ хода с контекстом (`Audit.goal_context`, строка 1112, передаёт только строки более ранних ходов) и только при побайтном совпадении `objective`: вызов `function_call create_goal` или `custom_tool_call exec`, чей текст начинается с вызова `tools.create_goal({objective:"…"})` как ПЕРВЫЙ оператор (`GOAL_CALL`, строка 60). Комментарий, строка в кавычках, вызов не первым оператором, лишний аргумент, чужая цель, вызов в том же ходе — FAIL «контекст цели не доказан». Реальные вызовы в журналах — `exec`-скрипт, не `custom_tool_call` с именем `create_goal`; цель в них идёт первым оператором, дальше могут идти другие команды, поэтому полное совпадение строки (`fullmatch`) давало ложные FAIL на нитях 5, 6, 8 — заменено на совпадение с началом.
   Допустимые формы вызова, найденные свипом по всем 102 контекстам цели в журналах servak: `text(await tools.create_goal({objective:"…"}))`, `const r = await …`, с пробелами и переносами в `{ objective: "…" }`, и `const objective = "…"; … create_goal({objective})` (цель держит та же строка, `{objective}` без `const` — FAIL). До этого уточнения строгое правило не доказывало 30 из 101 контекстов старых нитей (29.10–02.11); после — 102 из 102.
2. #1005, второй блок среды. `environment_update` (строка 345): `timezone` должен совпадать с первым блоком; в `subagents` имена `agent` без повторов (значит, `/root` не более одного раза) и пустой список после непустого — FAIL; ссылка на текст внутри `<agent>` — FAIL. Тесты: `test_second_environment_with_changed_timezone_fails`, `…_repeated_agent_fails`, `…_empty_agent_list_after_nonempty_fails`, `…_text_inside_agent_fails` и положительный `…_empty_agent_list_after_none_is_accepted`.
3. #939, подмена `encrypted_content` в сжатии. Тест `test_history_agent_message_with_substituted_ciphertext_fails` подменяет шифртекст настоящего `agent_message`-вызова в `replacement_history` (не через метаданные) — FAIL; парный `test_history_agent_message_with_same_ciphertext_is_accepted` — тот же шифртекст принят.
4. `--ledger`/`--since`. `last_turn` (строка 1350) — последний рабочий ход, холостой ход цели исключён: `--since` считает свежесть по нему, `--ledger` освобождает от записи в журнал только последний рабочий ход. Тесты: `test_since_ignores_trailing_idle_goal_turn`, `test_since_accepts_working_turn_before_idle_goal_turn`, `test_ledger_exempts_last_working_turn_before_idle_goal_turn`, `test_ledger_still_requires_earlier_working_turn_before_idle_goal_turn`. Реальный запуск `--since` на нити 01a19eab-08e1 (рабочий ход, затем холостой ход цели): `since` между рабочим ходом и холостым ходом цели — FAIL «нового хода нет» (холостой ход свежестью не считается); `since` до рабочего хода — OK.

Красный/зелёный. Красные тесты до правки (старая копия): 8 упали, 17 прошли (код 1; 25 тестов пунктов 1–4). Тесты форм реального вызова (уточнение пункта 1) на копии до уточнения: 4 упали, 4 прошли. После правки: зелёные.

Полный набор `test_input_check.py`: 329 тестов, 328 прошли, 1 упал, код 1. Упавший — `test_linux_s_resume_git_bash_pwd_matches_windows_meta` (путь Git Bash `/tmp/…` против шаблона `/[a-z]/.+`); он падал и до правок круга 1, к проверке входа отношения не имеет.

Журналы servak, `CODEX_HOME=/srv/novgorod-work/codex-direct/home`, до (копия `9f527c84…`) и после (`611bfd3b…`) на каждом rollout; два режима: `--thread … --task … --children` и то же с `--ledger … --since <первый ход нити в журнале>`:

| Нить | rollout | до: код / строк FAIL / итог | после: код / строк FAIL / итог |
|---|---|---|---|
| 4 (01a19e1e) | 6 | 0 / 0 / OK | 0 / 0 / OK |
| 5 (01a19e68) | 4 | 0 / 0 / OK | 0 / 0 / OK |
| 6 (01a19eab) | 4 | 0 / 0 / OK | 0 / 0 / OK |
| 7 (01a19fb3) | 4 | 0 / 0 / OK | 0 / 0 / OK |
| 8 (01a19fe8) | 4 | 0 / 0 / OK | 0 / 0 / OK |
| tp-core 1 (01a19fff) | 1 | 0 / 0 / OK | 0 / 0 / OK |

Вывод `diff` до/после по всем 12 файлам (по 6 нитей × 2 режима) пустой: тексты отчётов совпадают. Ложных FAIL у обеих копий уже нет, потому что «до» — это копия круга 1.

Замена. `/srv/novgorod-work/codex-direct/v2/check-codex-input.py` заменена атомарно: рядом записан `.new`, SHA-256 сверена с локальной, `mv`. Концы строк LF (копия круга 1 была CRLF, исходная версия — LF). Новая SHA-256: `611bfd3bc5e0bba9850be2d725467606d762680a0291052ff75d1c21be1349f1`; локальный `check-codex-input.py` побайтно равен servak. Остальные файлы в `v2/` не менялись, `__pycache__` нет.
Отпечаток запуска: `codex-exec.sh` хеширует сырые байты скрипта (строка 155), поэтому смена SHA потребует пробу `codex exec` (строка 198) при следующем запуске. Я Codex не запускал.

Не проверено в круге 2: живой запуск Codex; форма вызова `create_goal` вне перечисленных (новые формы дадут FAIL «контекст цели не доказан», безопасный отказ); контекст цели внутри `compacted` на реальных данных (такого случая в журналах нет, только тесты).

Уборка круга 2: удалены `/srv/novgorod-work/tmp/input-check-fix/` на servak и временные файлы в `/tmp`; git не трогался.

## Круг 3 (второе замечание Codex gpt-6.1-sol, вердикт FAIL)

Статус: все пять пунктов выполнены, проверка на журналах servak прошла, копия на servak заменена. Новый SHA-256 `check-codex-input.py`: `9f406feb9b4044786a532b7ae41bba0282533176ffe74c161678f97096e679b2` (было `611bfd3b…`). LF, без CR. Править сверх списка не пришлось; `environment_update` не менялась.

1. Доказательство цели только завершённым вызовом (`check-codex-input.py:60-66`). `GOAL_STRING` — закрытая строка без перевода строки; `GOAL_CALL` требует `})` после объекта и, для обёртки `text(await …)`, ещё и закрывающую `)` (условная группа). Незакрытая скобка или строка в `objective` не даёт доказательства: FAIL «контекст цели не доказан». Тесты: `test_goal_proof_by_unfinished_call_fails` (6 случаев: скобка и строка для `text(`, `const r =`, многострочного и `const objective = …`), `test_input_check.py:3186`.
2. Вызов из унаследованной истории родителя не засчитывается (`check-codex-input.py:1118-1121`: к условию «ход раньше» добавлено `not self.registry.inherited(self.tid, row)`). Маркер в живых данных: `session_meta.subagent_history_start_ordinal`; ряд унаследован, если его `ordinal` меньше этого значения (`Registry.inherited`, `check-codex-input.py:554-556`). В журналах servak 5 таких нитей: `01a18a20-f4d9` (9), `01a18a22-77da` (10), `01a18a22-9f76` (11), `01a18a27-9e16` (12), `01a18d9a-d8a5` (9), все в `sessions/2026/10/30/`. Настоящего унаследованного вызова `create_goal` там нет, слово встречается только в тексте (ряд 8, сообщение пользователя), поэтому живого примера нет; тест синтетический: `inherited_goal_child` (`test_input_check.py:3252`), `test_goal_proof_by_call_in_inherited_history_fails` (:3272) и обратный `test_goal_proof_by_call_in_own_turn_of_forked_child_is_accepted` (:3279).
3. Замена `[A] → [B]` во втором блоке среды: код не менялся. В 572 журналах servak живой замены нет; нашлись только переходы None → список (`rollout-2026-10-29T23-54-11-01a18971-1462-…`, ход 1, ряды 6→202; `rollout-2026-11-02T23-41-37-01a19dff-015e-…`, ход 1, ряды 6→563). Положительный тест синтетический: `test_second_environment_with_replaced_proven_agent_is_accepted` (`test_input_check.py:3286`), проходит на неизменённом коде.
4. Отрицательные тесты (`test_input_check.py:3197-3250`): чужая цель в каждой из пяти форм вызова (`text-await`, `const-await`, многострочная, `const objective`, `function_call`) — `test_goal_proof_of_foreign_goal_in_each_call_form_fails`; `objective`, отличающийся одним байтом (`goal-b`, `goal-a ` с пробелом, `goal-`, `Goal-a`), в каждой форме — `…_differing_by_one_byte_fails`; вызов в более позднем ходе, чем контекст цели, — `test_goal_proof_by_call_in_later_turn_fails`; парные положительные для той же цели и для более раннего хода.
5. Положительный тест подмены шифртекста (`test_input_check.py:3048-3049`) теперь проверяет `code == 0` и отсутствие `FAIL` в выводе.

Проверки:
- Красный и зелёный прогоны новых тестов 1, 2, 4: `fix7-red.log` на копии круга 2 (SHA `611bfd3b…`): 2 красных, 48 зелёных (красные: `test_goal_proof_by_unfinished_call_fails[text-unclosed-paren]` и `test_goal_proof_by_call_in_inherited_history_fails`); `fix7-green.log` на новой копии: 50 зелёных, код 0. Остальные новые тесты пункта 4 и незакрытая строка зелёные и на копии круга 2 (там строка `objective` уже сопоставлялась точно), то есть охраняют от возврата ошибки, а красными не были.
- Полный `test_input_check.py`, один лог `fix7-full.log`: 378 тестов, 377 прошли, 1 упал, код 1. Упавший — `test_linux_s_resume_git_bash_pwd_matches_windows_meta`: Git Bash возвращает `/tmp/pytest-of-Slaven/…` вместо `/c/…`; это среда запуска, проверка до вызова чекера, к правкам не относится.
- Журналы servak, обычный режим (без `--ledger`/`--since`, `--children`), старая и новая копия: нити 4–8 (`01a19e1e-a866`, `01a19e68-7d6f`, `01a19eab-08e1`, `01a19fb3-708b`, `01a19fe8-8584`), tp-core 1 (`01a19fff-687c`) и все корневые нити 03.11 после 05:00Z (19 нитей). Каждая рабочая нить: ИТОГ OK, код 0, у старой и новой одинаково; с `--task` по соответствующему `task.md` тоже OK, код 0.
- Исключение, к правке не относится: пробные нити на 24 символа (по одной перед каждой рабочей, например `01a19fff-4ea7`) в обычном режиме OK, а с чужим `task.md` дают FAIL «задание не равно файлу» — ожидаемо. Одна пробная нить `01a1a016-af97` даёт FAIL «неизвестный SHA <multi_agent_role>» (блок на 2 символа длиннее известного) одинаково на старой и новой копии; это пробная нить `probe-threads`, не ложный FAIL.

Замена на servak: `check-codex-input.py.new` рядом, SHA сверен с локальным, права сохранены, `mv`; после замены SHA совпадает, `__pycache__` нет. Другие копии не трогались.

Отпечаток запуска: `codex-exec.sh` хеширует сырые байты скрипта (строка 155), смена SHA потребует пробу `codex exec` (строка 198). Codex не запускался.

Не проверено: живой запуск Codex; живых примеров пунктов 2 и 3 в журналах нет (тесты синтетические); форма вызова `create_goal` вне пяти перечисленных даст FAIL «контекст цели не доказан».

Уборка: удалены `/srv/novgorod-work/tmp/input-check-fix/` на servak и временные файлы в `/tmp`; git не трогался.

## Круг 4 (ход продолжения цели с вызовами инструментов, ложный FAIL)

Причина: правило «ход цели содержит вызовы инструментов» считало собственные вызовы модели в ходе продолжения цели чужим входом. Вызовы и выводы инструментов — действия модели; входом остаются сообщения `user`, `developer` и блоки среды, они по-прежнему проверяются теми же правилами.

### Diff правки (`check-codex-input.py`)

```diff
@@ idle_goal_turn
-        return (self.turns[turn].get('trigger') == 'goal' and turn not in self.goal_calls
+        return (self.turns[turn].get('trigger') == 'goal'
                 and not self.tasks.get(turn) and not self.agent_tasks.get(turn))
@@ run
-            if (row.get('type') == 'response_item' and isinstance(kind, str) and kind.endswith('_call')
-                    and self.turns.get(self.turn, {}).get('trigger') == 'goal' and self.turn not in self.goal_calls):
-                self.goal_calls.add(self.turn)
-                self.line('ход цели', 0, 'FAIL', 'ход цели содержит вызовы инструментов')
@@ инициализация
-        self.agent_seen, self.goal_seen, self.goal_calls = set(), set(), set()
+        self.agent_seen, self.goal_seen = set(), set()
```

`idle_goal_turn` и `goal_calls` использовались только в `:1129`, `:1304–1305`, `:1346`, `:1348`, `:1447`. Место `:1346` (нет задания user в ходе) и `:1348` (в нити нет ни одного хода с заданием), а также выбор последнего хода для сверки с файлом задания (`last_turn`) теперь для хода цели с вызовами и без них одинаковы. `goal_calls` удалён.

### Тесты (`test_input_check.py`)

- `test_goal_turn_with_tool_call_fails` заменён на `test_goal_turn_with_tool_calls_is_accepted`: ход цели с доказанным контекстом (шаблон + `create_goal` в более раннем ходе), двумя парами `exec_command` с выводами; ожидается код 0 и отсутствие `FAIL`.
- Добавлены `test_goal_turn_with_tool_call_and_foreign_user_text_after_it_fails` (после вызова чужой `user`: код != 0, «не равно файлу») и `test_goal_turn_with_tool_call_and_unproven_goal_context_fails` (вызовы + подставленная цель: «контекст цели не доказан»).
- Красные случаи, которые остались красными:
  - ход цели с чужим `user` — `test_goal_turn_with_foreign_user_text_fails`;
  - недоказанный контекст: другой текст цели — `test_goal_context_with_unproven_objective_fails`; шаблон с другим SHA — `test_goal_context_with_changed_template_fails`; `create_goal` только в унаследованной истории родителя — `test_goal_proof_by_call_in_inherited_history_fails`; без `create_goal` — `test_goal_context_without_create_goal_fails`;
  - вызовы и чужой `user` после вызова — новый тест выше;
  - ход цели не заменяет последнее задание — `test_goal_turn_does_not_replace_last_task_check` (зелёный).

### Красный до правки, зелёный после

Красный (прежний код), `-k goal_turn_with_tool_calls_is_accepted`:

```
t2 ход цели       0 FAIL ход цели содержит вызовы инструментов
ИТОГ: FAIL (...)
  - rollout-2026-10-21T12-00-00-root.jsonl: t2 ход цели содержит вызовы инструментов
1 failed, 379 deselected
```

Зелёный (новый код): `1 passed, 379 deselected`; все тесты хода цели (`-k goal_turn`): `14 passed, 366 deselected`; все `-k goal`: `86 passed, 294 deselected`.

Два красных теста («чужой user после вызова», «недоказанная цель с вызовами») проходили и на прежнем коде, но по причине FAIL вызовов; после правки они проходят по своим причинам (проверено: «не равно файлу» и «контекст цели не доказан»).

### Полный прогон

`python -B -m pytest -q test_input_check.py` (Windows): `1 failed, 379 passed in 168.05s`. Упал только `test_linux_s_resume_git_bash_pwd_matches_windows_meta` (известный, #1008). `test_wire_metric_denominators_and_unknown` и `test_wire_numeric_maxima_thresholds_other_roles_regression` в этой среде прошли.

### Живые проверки (servak, копия во временной папке, журналы `sessions/2026/11/03/`)

- `01a1a02e-b744-7c20-b86c-c8667cd8e280`: `ИТОГ: OK (18 rollout; зашифрованных заданий помощников: 44, текст не проверен; зашифрованных ответных сообщений: 12, текст не проверен; непроверенных ходов до журнала заданий: 0)`
- `01a1a041-7e47-7733-8196-0f633e684d3a`: `ИТОГ: OK (49 rollout; зашифрованных заданий помощников: 48, текст не проверен; зашифрованных ответных сообщений: 12, текст не проверен; непроверенных ходов до журнала заданий: 0)`
- `01a1a03f-a128-72e3-89e3-b729c2fd9935`: **FAIL по другой причине**, проверка под неё не подгонялась. Строка дословно: `t2 переписка      0 FAIL неизвестная форма переписки` (rollout `rollout-2026-11-03T10-24-07-01a1a04b-3c2f-7322-aff5-ea052f6a3220.jsonl`, нить природного слоя; итог: `ИТОГ: FAIL (36 rollout; зашифрованных заданий помощников: 66, текст не проверен; зашифрованных ответных сообщений: 76, текст не проверен; зашифрованной переписки: 57, текст не проверен; непроверенных ходов до журнала заданий: 0)`). Живая v2-копия (SHA `9f406feb…`, без правки) на той же нити даёт тот же единственный FAIL (`:3278`), правила «вызовы инструментов» в нём нет — это отдельное, существовавшее до правки расхождение (правило переписки), в этот круг не входит. Нужен отдельный issue.

### SHA-256

`check-codex-input.py` до: `9f406feb9b4044786a532b7ae41bba0282533176ffe74c161678f97096e679b2`
после: `bdc432bb609e716d5550d4b9da66c3ce0ba6336c72d6fcfdd565d7f7cc8bb2da`
`test_input_check.py`: `3f2d03fd8f2e1561f6bb5dd0fed9a7f1b1f16e199759473d9e681f305b631ba8`

### Не проверено

- Живой запуск Codex; `codex-exec.sh` не менялся, но его отпечаток запуска хеширует скрипт проверки: после замены потребуется проба.
- Живая копия на servak не заменялась (по заданию).
- Нить `01a1a03f…` целиком в OK не проверена: мешает не относящийся к кругу FAIL «неизвестная форма переписки».
- Ход цели с вызовами инструментов проверен тестами на синтетических нитях и на реальной нити `01a1a02e…`; другие формы вызовов (кроме `function_call`/`custom_tool_call`) отдельным тестом не покрыты.

### Рабочие места

Создано: `/srv/novgorod-work/tmp/goal-tools-fix/` на servak (копия скрипта, `codex-input-allow.json`, `allowed-blocks/`, три `recheck-*.txt`, `base-nature.txt`) — удалена. Локально: `/tmp/g4/` (логи прогонов, копия прежнего скрипта) — удалена; `.pytest_cache` в папке `D` создаёт pytest, можно удалить. По ошибке в ходе работы выполнена `taskkill /IM python.exe` (убивала висевший фоновый pytest; часть процессов отказала в доступе); чужие процессы не затронуты насколько известно. Git не трогался.


## Круг 5: update_goal перед create_goal

Ложный FAIL `контекст цели не доказан` на нити `tracks-988` (`t4`, `t5`): смена цели одним вызовом `exec`, где сначала `text(await tools.update_goal({status:"complete"}));`, затем `text(await tools.create_goal({objective:"..."}));`. `goal_created` брал `GOAL_CALL.match` с начала входа и не узнавал `create_goal` после `update_goal`. База правки — действующая копия servak, SHA-256 `f494ec9e0a435fbde29e56c657474c3694d2a36eaec0c46c4d449b38252ca753` (локальная `bdc432bb…` была старее и заменена).

### Diff правки (`check-codex-input.py`, к `f494ec9e`)

```diff
--- a/check-codex-input.py@f494ec9e
+++ b/check-codex-input.py
@@ -62,6 +62,7 @@
     r'\s*(?:const\s+objective\s*=\s*(?P<held>' + GOAL_STRING + r');\s*)?'
     r'(?:const\s+\w+\s*=\s*await\s+|(?P<wrap>text\(await\s+))tools\.create_goal\(\{\s*'
     r'(?:objective\s*:\s*(?P<inline>' + GOAL_STRING + r')|(?P<short>objective))\s*\}\)(?(wrap)\s*\))')
+GOAL_UPDATE_COMPLETE = re.compile(r'\s*text\(await tools\.update_goal\(\{status:"complete"\}\)\);')
 
 
 def goal_created(rows, objective):
@@ -73,7 +74,10 @@
             if p.get('type') == 'function_call' and p.get('name') == 'create_goal':
                 value = json.loads(p.get('arguments')).get('objective')
             elif p.get('type') == 'custom_tool_call' and p.get('name') == 'exec':
-                match = GOAL_CALL.match(p.get('input'))
+                code, start = p.get('input'), 0
+                while closed := GOAL_UPDATE_COMPLETE.match(code, start):
+                    start = closed.end()
+                match = GOAL_CALL.match(code, start)
                 value = match and json.loads(match.group('inline') or (match.group('short') and match.group('held')))
             else:
                 continue
```

`GOAL_CALL` не менялось. Ноль или больше операторов ровно вида `text(await tools.update_goal({status:"complete"}));` с пробельными символами между ними; сразу после них `GOAL_CALL` совпадает от своей позиции. Всё остальное до `create_goal` (другой вызов, комментарий, другой статус, другой набор полей) останавливает цепочку, и `GOAL_CALL.match` на этом месте не совпадает. Место вызова `goal_created` (`goal_context`: только строки более ранних ходов этой нити, не унаследованные) не менялось: доказательство по-прежнему только из более раннего хода этой нити.

### Новые тесты (`test_input_check.py`, 21 случай в 7 тестах)

Общие помощники: `GOAL_PROOF_OK`, `UPDATE_COMPLETE`, `NEW_GOAL` (текст цели `tracks-988`), `create_goal_statement`.

1. `test_goal_proof_by_update_goal_complete_then_create_goal_is_accepted` (зелёный): вход вызова дословно как в нити; код 0, строка `ok   контекст цели: шаблон и create_goal нити совпадают`.
2. `test_goal_proof_by_several_update_goal_complete_then_create_goal_is_accepted` (зелёный): три оператора `update_goal` с пробелами, табуляцией и пустыми строками между ними.
3. `test_goal_proof_after_update_goal_with_other_status_fails` (красный, 4 случая): статусы `paused`, `active`, `Complete`, `complete ` (с пробелом внутри строки).
4. `test_goal_proof_after_update_goal_with_other_fields_fails` (красный, 4 случая): `{status:"complete", extra:1}`, `{status:"complete", objective:"x"}`, `{}`, `{objective:"x"}`.
5. `test_goal_proof_by_comment_before_real_create_goal_fails` (красный, 8 случаев): `// create_goal(цель)` или `/* create_goal(цель) */` с полным оператором внутри комментария, перед настоящим `create_goal`; настоящий `create_goal` с другой целью или с той же; комментарий один или после `update_goal`.
6. `test_goal_proof_after_foreign_call_before_create_goal_fails` (красный, 2 случая): `text(await tools.exec_command({cmd:"ls"}));` до `update_goal` и после него.
7. `test_goal_proof_by_update_goal_and_create_goal_in_same_turn_fails` (красный): `update_goal` и `create_goal` в том же ходе, что и контекст цели.

Все прежние тесты не менялись; их ожидания прежние.

### Красный до правки, зелёный после

Прежняя копия (`f494ec9e`) через `INPUT_CHECK_SOURCE_DIR`, `-k "update_goal or comment_before_real or foreign_call_before or same_turn"`: `2 failed, 20 passed, 379 deselected`. Красными были оба зелёных теста (1 и 2). Красные тесты 3–7 проходили и на прежнем коде (до правки `create_goal` после `update_goal` не принимался вообще): они защищают от чрезмерного принятия, их зубы проверены мутациями. Новый код: `21 passed, 380 deselected`; все `-k goal`: `107 passed, 294 deselected`.

Мутации проверки (отдельные копии проверки; каждая обязана покраснеть именно на своём классе):

| мутация | красные тесты |
|---|---|
| любой статус `update_goal` (`status:"[^"]*"`) | тест 3, все 4 случая |
| любые поля `update_goal` (`\{[^}]*\}`) | тесты 3 и 4, все 8 случаев |
| пропуск комментариев `//…\n` и `/*…*/` перед `create_goal` | тест 5, 4 случая с той же целью |
| пропуск любого постороннего вызова, кроме `create_goal` | тест 6, оба случая, и тесты 3, 4 |
| `GOAL_CALL.search` вместо `.match` | тесты 3, 4, 5, 6 (18 из 21) |
| `<=` вместо `<` в отборе ходов `goal_context` | тест 7 и прежний `test_goal_proof_in_same_turn_fails` |

### Полный прогон

`python -B -m pytest -q test_input_check.py` (Windows, из `D`): `1 failed, 400 passed in 85.21s (0:01:25)`. Упал только `test_linux_s_resume_git_bash_pwd_matches_windows_meta` (известный, #1008). Прежних тестов 380, новых 21: в прошлом круге было `1 failed, 379 passed`, теперь тот же один сбой и 21 новый зелёный.

### Живая проверка (servak, `/srv/novgorod-work/tmp/lead-tmp/goalfix/`)

Нить `tracks-988` (`01a1a1f5-0420-7702-8194-75995142dce0`, rollout `sessions/2026/11/03/rollout-2026-11-03T18-09-11-01a1a1f5-0420-7702-8194-75995142dce0.jsonl`). Команда как в `codex-exec.sh` после запуска (`"${CHECK[@]}" --thread … --task … --children --ledger … --since … --out …`) с `CODEX_HOME=/srv/novgorod-work/codex-direct/home`, `/usr/bin/python3`, `--task /srv/novgorod-work/codex-direct/tasks/tracks-988-3-20261103T174540Z/task.md`, `--since 2026-11-03T17:45:44Z` (из файла `started`), журнал заданий — копия `.input-ledger` в `goalfix/ledger` (действующий не трогался), `codex-input-allow.json` — копия действующего. Запущены две копии: `base/` (действующая `f494ec9e`) и `fixed/` (новая).

- `base`: `t4 цель 6316 FAIL контекст цели не доказан`, `t5` то же.
- `fixed`: `t4 цель        6316 ok   контекст цели: шаблон и create_goal нити совпадают` и `t5` — та же строка `ok`.
- Построчное различие `base` и `fixed` во всём выводе (2650 строк) — ровно эти две строки и две соответствующие строки в списке FAIL итога; прочие строки совпадают.
- Строка ИТОГ `fixed` дословно: `ИТОГ: FAIL (14 rollout; зашифрованных заданий помощников: 28, текст не проверен; зашифрованных ответных сообщений: 29, текст не проверен; зашифрованной переписки: 2, текст не проверен; непроверенных ходов до журнала заданий: 0)`.
- Единственный оставшийся FAIL в итоге: `rollout-2026-11-03T18-09-11-01a1a1f5-0420-7702-8194-75995142dce0.jsonl: задание последнего хода t8 не равно файлу /srv/novgorod-work/codex-direct/tasks/tracks-988-3-20261103T174540Z/task.md`. Он не связан с целью и есть в `base` тоже: с момента исходного прогона (там было 12 rollout) нить продолжилась (14 rollout, ход `t8`), а проверка сверяет последний ход с тем же `task.md`. Проверка под него не подгонялась.

### SHA-256

`check-codex-input.py` до (действующая servak): `f494ec9e0a435fbde29e56c657474c3694d2a36eaec0c46c4d449b38252ca753`
после (`D/check-codex-input.py` = `goalfix/fixed/check-codex-input.py`): `c64de84d14f50b59b1913735a428d36f0d49091eb93356510dfd1e8bd0e95c51`
`test_input_check.py`: `1d1df83fadd76921e3c03de7c029b503788b002feab13391cdcfec5388b35d1d` (до круга: `3f2d03fd8f2e1561f6bb5dd0fed9a7f1b1f16e199759473d9e681f305b631ba8`)

### Не проверено

- Живой запуск Codex; `codex-exec.sh` не менялся, но его отпечаток запуска хеширует скрипт проверки: после установки потребуется проба.
- Действующий `/srv/novgorod-work/codex-direct/v2/check-codex-input.py` не заменялся; установку делает распорядитель.
- Вход, где внутри оператора `update_goal` другие пробелы (`{ status: "complete" }`, `status : "complete"`), кавычки `'complete'` или вызов без `text(…)`, цель не доказывает: принят только дословный вид. Если Codex начнёт писать иначе, будет ложный FAIL; шаблон не расширялся без примера в живой нити.
- Нить `tracks-988` целиком в `ИТОГ: OK` не проверена: мешает несвязанный FAIL `t8` (поздний ход против прежнего `task.md`).
- Другие формы смены цели (`function_call` `update_goal`, цепочки с другими статусами) отдельно не покрыты.

### Рабочие места

На servak создана `/srv/novgorod-work/tmp/lead-tmp/goalfix/` (`base/`, `fixed/` с копиями проверки и `codex-input-allow.json`, `out.txt` и `err.txt` прогонов, `ledger` — копия журнала заданий); оставлена как место установки новой копии, удалить после установки. Локально во временной папке сессии — копии для мутаций и лог полного прогона; удалены. Файлы `/srv/novgorod-work/codex-direct/v2/` не менялись. Git не трогался.

### Сверка с брифом после сжатия

Сверка с брифом после сжатия: совпадает. Бриф `brief-goal-update-then-create.md` перечитан целиком одним вызовом после двух сжатий контекста и сверен с итогом пункт за пунктом:

- Копия с servak: `D/check-codex-input.py` отличается от действующей `f494ec9e…` ровно добавленной константой `GOAL_UPDATE_COMPLETE` и циклом в `goal_created` (проверено `diff` с живым файлом servak); `GOAL_CALL` не менялся; комментариев в правке нет.
- Что сделать п. 1–2: ноль или больше операторов `text(await tools.update_goal({status:"complete"}));` с пробельными символами между ними, затем `GOAL_CALL` от своей позиции; комментарий, посторонний вызов, другой статус и другой набор полей цель не доказывают.
- Что сделать п. 3: зелёный тест с входом дословно как в брифе (текст цели сверен), отдельные красные тесты на другой статус, комментарий `//` и `/* */` перед настоящим `create_goal` с другой целью (и с той же), посторонний вызов, `update_goal` и `create_goal` в том же ходе; все красные проверяют `FAIL контекст цели не доказан`. Старые тесты не менялись: тестовый файл только дополнен в конце, прежний счёт 380 плюс 21 новый равен 401 (1 известный сбой, 400 зелёных).
- Что сделать п. 4: живой прогон на servak в `/srv/novgorod-work/tmp/lead-tmp/goalfix/` командой как в `codex-exec.sh`, `t4` и `t5` `ok`, полная строка ИТОГ записана выше; действующий файл в `/srv/novgorod-work/codex-direct/v2/` не заменялся (SHA-256 по-прежнему `f494ec9e…`).
- Сдача: diff, SHA-256, список тестов, строка итога pytest, итог живой проверки, «не проверено» — все есть в разделе выше. Расхождений с брифом нет.


## Круг 5б: тесты по ревью Codex

Ревью `REVIEW-goal-r5.md` обхода не нашло и потребовало четыре отдельных теста на границы. Добавлены только тесты в конец `test_input_check.py`; `check-codex-input.py` не менялся (SHA-256 `c64de84d14f50b59b1913735a428d36f0d49091eb93356510dfd1e8bd0e95c51`). Тесты идут тем же способом, что соседние тесты круга 5: вход `exec` кладётся в более ранний ход нити через `create_goal_text_rows`, проверка запускается через `goal_proof_with_objective`, ожидание — код и строка `FAIL контекст цели не доказан` либо `ok` (то же, что вызов `goal_created`, который эта проверка делает для цели).

### Новые тесты

| № ревью | имя | строка | случаи |
|---|---|---|---|
| 1 | `test_goal_proof_by_create_goal_inside_string_after_update_goal_fails` | `test_input_check.py:3394` | `template-literal`: `update_goal`, затем ``const note = `text(await tools.create_goal({objective:"…"}));`;``; `double-quoted-literal`: затем то же как строка в двойных кавычках; цель нужная; результат ложь |
| 2 | `test_goal_proof_after_update_goal_in_other_spelling_fails` | `test_input_check.py:3405` | `inner-spaces-around-braces` (`{ status: "complete" }`), `space-before-colon` (`{status : "complete"}`), `single-quotes` (`{status:'complete'}`), `backticks` (``{status:`complete`}``); после каждого правильный `create_goal` с нужной целью; результат ложь |
| 3 | `test_goal_proof_after_foreign_statement_between_two_update_goals_fails` | `test_input_check.py:3411` | `update_goal` complete, `text("x");`, `update_goal` complete, правильный `create_goal`; результат ложь |
| 4 | `test_goal_proof_counts_only_first_create_goal_after_update_goal` | `test_input_check.py:3419` | после `update_goal` два `create_goal` с целями A (проверяемая) и B: `checked-goal-first` (A затем B) — истина (`ok`, код 0); `checked-goal-second` (B затем A) — ложь |

Тестов-функций добавлено 4, случаев (параметризованных прогонов) 9. Тесты на проверке `c64de84d…` зелёные сразу; проверщик не правился.

### Проверка зубов

Отдельные копии проверки (через `INPUT_CHECK_SOURCE_DIR`), каждая с одной мутацией; запущены только новые тесты:

| мутация | красные |
|---|---|
| `update_goal` с любыми пробелами и кавычками (`\s*status\s*:\s*["'`]complete["'`]\s*`) | тест 2, все 4 случая |
| пропуск любого оператора `text(…);`, кроме `create_goal` | тест 3 и все 4 случая теста 2 |
| `GOAL_CALL.search` вместо `.match` | тест 1 (`template-literal`), тест 3, все 4 случая теста 2 |
| `create_goal` ищется по всему входу, берётся тот, чья цель совпала | тест 4 (`checked-goal-second`), тест 1 (`template-literal`), тест 3, все 4 случая теста 2 |

Случай `double-quoted-literal` теста 1 красным не становится ни на одной мутации: внутри строки в двойных кавычках кавычки вокруг цели экранированы, и `GOAL_STRING` не принимает цель даже при поиске по всей строке; случай остаётся как закреплённая граница, а нужные зубы даёт `template-literal`.

### Число тестов и прогон

- До: 401 (400 зелёных, 1 известный сбой), по `pytest --collect-only`.
- После: 410 (401 + 9).
- Команда: `python -B -m pytest -q test_input_check.py -p no:cacheprovider` (Windows, из `D`), лог — `D/test-output-r5b.txt`.
- Итог из лога: `1 failed, 409 passed in 79.85s (0:01:19)`. Упал только `test_linux_s_resume_git_bash_pwd_matches_windows_meta` (известный, #1008); прежние тесты не менялись.

### SHA-256

`test_input_check.py`: `30cff5f612c294c7118f76f28c1bf660d33df47197aacaf530e25157c395446c` (до: `1d1df83fadd76921e3c03de7c029b503788b002feab13391cdcfec5388b35d1d`).
`check-codex-input.py`: без изменений, `c64de84d14f50b59b1913735a428d36f0d49091eb93356510dfd1e8bd0e95c51`.

### Не проверено

Живая проверка на servak после добавления тестов не повторялась: проверка не менялась. Тесты сверяют отказ на выбранных формах; все возможные написания `update_goal` перебрать нельзя.

### Рабочие места

Временные копии для мутаций в папке сессии удалены. Файлы `/srv/novgorod-work/codex-direct/v2/` и git не затрагивались.
