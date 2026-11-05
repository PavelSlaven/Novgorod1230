## План

Сохраню сдачу второго хода как исходную копию для красных тестов. По исходнику token-guard выведу шаблоны с узкими подстановками и дословными вариантами советов; добавлю хеши файлов hooks в отпечаток. Разделю склеенные служебные блоки до классификации, повторю замер по всем доступным rollout после 2026-10-21T11:30:00Z и закреплю измеренные варианты model_switch. Введу границу обязательного журнала с явным учётом непроверенных ранних ходов и временную папку для неизвестных блоков при выводе только в stdout.

Механические замеры, красные и зелёные прогоны, проверки реальных нитей поручаю субагентам не выше gpt-6.1-sol. Реализацию, допустимость шаблонов и итоговую сверку выполняю сам. Все прежние ожидания тестов сохраняются. Границу ledger_required_since поставлю по времени начала последнего реального прогона; задним числом журнал не восстанавливаю. Проверю шесть указанных нитей, синтаксис и хеши итоговых файлов, затем проведу один круг самоаудита.

Пишу только в input-check-v2 и системную временную папку. REPORT-2.md, первую версию, .tools и исходные rollout не меняю. Хук только читаю. Если предписанное решение не работает на чистых реальных данных или требует ослабить прежний тест, опишу причину и остановлюсь. Отдельно установлю происхождение input-check-v2/TEMP и удалю её, если она создана мной.

Первая работа была остановлена из-за шифрованных заданий помощников и недоступного Python; RESUME-1 разрешил проверку происхождения шифротекста с явным ограничением «текст не проверен» и предоставил копию Python в рабочей папке. После сдачи REPORT-2 распорядитель обнаружил ложные FAIL на свежих нитях; этот ход исправляет перечисленные в RESUME-2 причины.

## Результат

Все шесть реальных нитей дали ожидаемый код: старая загрязнённая нить — FAIL/4, остальные — OK/0. Финальный набор: **80 passed, без пропусков**; прежние 67 проверок сохранены. py_compile и Git Bash -n прошли. Коды и контрольные суммы находятся в [validation-3.txt](validation-3.txt).

Исправлена только вторая версия. Установка на место рабочей обёртки не выполнялась. REPORT-2.md не изменён. Незавершено удаление старой временной папки TEMP: автоматическая проверка отклонила удаление, включая вариант без рекурсивного удаления. Подробности приведены ниже.

## Решение → реализация → тест → красный → зелёный

| Решение | Файл:строка | Тест | Красный: лог:строка и причина | Зелёный: лог:строка |
|---|---|---|---|---|
| Шаблоны token-guard | [check-codex-input.py:116](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/check-codex-input.py:116)<br>[codex-input-allow.json:217](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/codex-input-allow.json:217) | `test_resume2_real_token_guard_matches_patterns`<br>`test_resume2_token_guard_rejects_mutated_line_regression` | [fix-red.log:7831](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-red.log:7831): Реальный динамический текст получает неизвестный SHA<br>[fix-red.log:7873](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-red.log:7873): Повтор на финальной версии теста | [80 passed](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-green.log:338) |
| Все hooks в отпечатке | [codex-exec.sh:36](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/codex-exec.sh:36) | `test_resume2_each_hook_changes_fingerprint[a.mjs]`<br>`test_resume2_each_hook_changes_fingerprint[z.mjs]` | [fix-red.log:7768](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-red.log:7768): После изменения a.mjs нет повторной пробы<br>[fix-red.log:7769](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-red.log:7769): То же для z.mjs | [80 passed](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-green.log:338) |
| Разбивка части и запрет лишнего текста | [check-codex-input.py:93](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/check-codex-input.py:93)<br>[codex-input-allow.json:369](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/codex-input-allow.json:369) | `test_resume2_adjacent_known_blocks_in_one_part`<br>`test_resume2_split_rejects_unclaimed_text_regression` | [fix-red.log:7753](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-red.log:7753): Склеенные известные блоки отвергнуты | [80 passed](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-green.log:338) |
| Новые model_switch после разбивки | [codex-input-allow.json:150](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/codex-input-allow.json:150)<br>[check-codex-input.py:318](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/check-codex-input.py:318) | `test_resume2_model_switch_variants_are_independent` | [fix-red.log:7853](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-red.log:7853): Отдельный реальный вариант 393b91d7ecd1 получает неизвестный SHA<br>[fix-red.log:7874](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-red.log:7874): Повтор на финальной версии теста | [80 passed](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-green.log:338) |
| Ходы до журнала и граница включительно | [check-codex-input.py:530](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/check-codex-input.py:530)<br>[codex-input-allow.json:380](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/codex-input-allow.json:380) | `test_resume2_early_missing_ledger_is_reported`<br>`test_resume2_cutoff_missing_ledger_fails_regression`<br>`test_resume2_early_turn_does_not_exempt_last_task_regression` | [fix-red.log:7755](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-red.log:7755): Раннее задание ошибочно требует журнал | [80 passed](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-green.log:338) |
| Вывод без --out | [check-codex-input.py:307](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/check-codex-input.py:307)<br>[check-codex-input.py:575](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/check-codex-input.py:575) | `test_resume2_default_output_stdout_and_temp_unknown` | [fix-red.log:7780](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-red.log:7780): Создан input-check.txt.unknown-blocks в текущей папке | [80 passed](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/fix-green.log:338) |


Исходная сдача скопирована до правок в `C:/Users/Slaven/AppData/Local/Temp/input-check-resume2-baseline-02faefc0-de3b-4041-9ded-5cca22904272`; её хеши записаны в [self-audit-3.json](self-audit-3.json). Красные прогоны используют копии этой версии и новые тесты; служебные данные фикстур передаются отдельно. Отрицательные проверки с суффиксом `_regression` — тесты-закрепления: на старом коде они уже зелёные и доказательством исправления не считаются. Получились семь новых красных случаев и шесть закрепляющих случаев. Все они входят в финальные 80 проверок.

В логе сохранены ранние неудачные попытки подготовки тестов. KeyError по отсутствующему полю token_guard и предварительная проверка наличия SHA не доказывали дефект. В единственном круге самоаудита эти проверки исправлены: сначала вызывается checker на реальном тексте, красный возникает из-за неизвестного SHA. Развёрнутый вывод сохранён в `fix-red.log:7818`, повтор — в `fix-red.log:7866`. Промежуточный зелёный прогон с ошибками создания временных каталогов также сохранён; окончательный прогон использует новую системную временную папку.

Путь к токенизатору остаётся постоянным при копировании кода во временную папку; wire-тесты в полном прогоне не пропущены. Настоящий Codex не запускался: тесты обёртки используют подмену.

## Шаблоны token-guard и покрытие

Источник только читался: `~/.codex/hooks/token-guard.mjs`, SHA-256 `80c63a7bb0415da3a47840d136ac19977b4d45d176051731cbe40da891d19ae1`. Шаблоны записаны в `token_guard.patterns` allow json; дословные варианты ADVICE — в `advice_literals`. Скрипт [build-token-patterns-3.py](build-token-patterns-3.py) извлекает строки ADVICE и проверяет неизменные фразы исходника перед сборкой.

Первая строка сравнивается буквально; каждая следующая обязана начинаться с `- ` и целиком проходить `fullmatch`. Используются классы целых чисел без знака, скорости с одним десятичным знаком, имени модели, effort high/xhigh, пути агента /root/…, UUID или имени агента. Тексты советов и варианты what перечислены дословно; свободного `.*` в разрешающих шаблонах нет. Проверка запрещённых префиксов и списков skills выполняется до шаблонов. Несовпавший полный блок сохраняется среди неизвестных.

На состояние `2026-10-21T14:25:11.5517007Z` проверено 31 блоков: 31 точных заголовков, 31 строк тела. Несовпадений и неоднозначностей — 0. Полные строки и источники: [token-guard-coverage-3.json](token-guard-coverage-3.json).

| Шаблон | Ветвь | Строки исходника хука | Совпало строк |
|---|---|---|---:|
| `budget` | Дословный бюджет субагента | 311 | 22 |
| `astra` | Дословное уведомление о gpt-6-astra | 312 | 0 |
| `subagent-level` | Уровень расхода и скорость у субагента | 302, 313 | 0 |
| `red-subagent` | Красный уровень, завершение шага субагента | 302, 341, 342 | 0 |
| `red-main` | Красный уровень, завершение работы главного потока | 302, 343 | 0 |
| `yellow` | Жёлтый уровень и дословный совет | 302, 345 | 0 |
| `self-high-worker` | Модель, effort и число вызовов текущего агента | 38, 268 | 3 |
| `self-bloat` | Размер контекста и сжатия текущего агента | 42, 271 | 0 |
| `main-bloat` | Размер контекста и сжатия главного потока | 43, 271 | 0 |
| `self-poll` | Число опросов и дословный совет | 47, 276 | 2 |
| `self-repeat` | Число повторений и дословный совет | 51, 284 | 2 |
| `child-high-worker` | Путь, имя, модель, effort и вызовы субагента | 39, 268 | 1 |
| `child-bloat` | Путь, имя, контекст и сжатия субагента | 44, 271 | 0 |
| `child-poll` | Путь, имя и числа опросов субагента | 48, 276 | 1 |


Нулевое покрытие означает отсутствие такой строки в наблюдаемом снимке, а не проверку этой ветви на реальном запуске. Шаблоны этих ветвей выведены из исходника. Негативные тесты меняют строку реального блока добавлением слова и чужим советом; оба дают FAIL и сохраняют полный изменённый текст.

Отпечаток обёртки включает SHA-256 каждого файла из активного CODEX_HOME/hooks рекурсивно. Пути сортируются побайтно по имени при LC_ALL=C; имена и хеши входят в общий отпечаток. Изменение каждого из двух файлов в тесте вызывает новую пробу; повтор без изменения — рабочий запуск без новой пробы.

## Замер блоков

Нижняя граница отбора — `2026-10-21T11:30:00Z`, верхняя включительно — `2026-10-21T14:25:11.5517007Z`, конец последнего реального batch. Просканировано файлов: 1251; выбрано rollout: 38. Фактическое чтение: `2026-10-21T14:30:12.943705Z` — `2026-10-21T14:30:13.358752Z`. ISO-время сравнивается в UTC с сохранением долей секунды; местное время не используется. Записи позднее верхней границы исключены. Ошибок чтения/разбивки — 0.

Перед подсчётом соседние верхнеуровневые XML-блоки разделены. SHA в таблице считается по CRLF → LF и strip(), до подстановок. Число вхождений включает копии в replacement_history; число нитей для model_switch считается отдельно. Подробные исходные SHA, расположения и различия — в [block-measurement-3.json](block-measurement-3.json); команды и результаты — в [measurement-validation-3.txt](measurement-validation-3.txt).

| Префикс | Вхождения | Разных SHA | Проверка и различия |
|---|---:|---:|---|
| `base_instructions` | 49 | 3 | SHA; разные тексты инструкций моделей |
| `<permissions instructions>` | 38 | 5 | SHA с известными метками путей; отдельные варианты песочницы и сети |
| `<multi_agent_role>` | 38 | 2 | SHA; главный агент и помощник |
| `<multi_agent_mode>` | 38 | 2 | SHA; два режима делегирования |
| `<model_switch>` | 19 | 3 | SHA; варианты по моделям, таблица ниже |
| `<turn_aborted>` | 0 | 0 | SHA; в снимке не встречен |
| `[codebase-memory]` | 51 | 5 | SHA после метки имени графа; Session/Subagent |
| `token-guard (контроль расхода токенов)` | 31 | 9 | fullmatch строк; динамические числа и адреса агентов |
| `<skills_instructions>` | 0 | 0 | SHA пустого блока и запрет списка skills; в снимке не встречен |
| `<environment_context>` | 38 | 5 | Структура XML; различаются пути, среда и дата |
| `<plugins_instructions>` | 0 | 0 | Запрещён; в снимке не встречен |
| `<apps_instructions>` | 0 | 0 | Запрещён; в снимке не встречен |
| `<recommended_plugins>` | 1 | 1 | Запрещён; наблюдение не внесено в allow |
| `# AGENTS.md instructions` | 38 | 2 | Сверка с AGENTS.md; разные проекты |
| `UNKNOWN` | 0 | 0 | Неизвестных префиксов в выборке нет |


Список тегов разбиения явно записан в allow json. Разделитель — закрывающий тег, сразу за которым идёт открывающий тег известного блока; посторонний текст между ними или после последнего даёт FAIL. Конечный пробельный остаток допускается. Незакрытый остаток целиком проходит проверку содержимого, без обхода SHA. В наблюдаемых разрешённых вариантах теги закрыты.

После разбивки прежние неизвестные SHA `53f61dde32a5` и `ee525359f1d2` не разрешаются как единый текст: проверяются отдельные model_switch и permissions instructions. Полные разрешённые тексты находятся в [allowed-blocks/](allowed-blocks/), соответствие измеренного и канонического SHA — в [allowed-blocks-manifest-3.json](allowed-blocks-manifest-3.json). Динамический token-guard исключён из проверки по SHA; старые архивные тексты оставлены для истории REPORT-2.

### Варианты model_switch

| SHA-256 | Модель из turn_context | Число нитей | Разрешённый текст |
|---|---|---:|---|
| `393b91d7ecd12e7a853bc73d0a13410f794da77ccf6c0265030d037de575c0b6` | `gpt-6-sol` | 4 | [прочитать](allowed-blocks/model_switch-393b91d7ecd1.txt) |
| `d53516da585796dc86821db9ce6790276777dbe1ee9b22f152e313d70468e97b` | `gpt-6-luna` | 11 | [прочитать](allowed-blocks/model_switch-d53516da5857.txt) |
| `f0de9b1ee3b9057ae136ccbc0cd5fb4b835e95fb982e89149db7023e2d1c327d` | `gpt-6.1-sol` | 4 | [прочитать](allowed-blocks/model_switch-f0de9b1ee3b9.txt) |


Новый вариант `393b91d7ecd1` наблюдается с gpt-6-sol. В сравнении с `d53516da5857` он разрешает продолжать действие при уже установленной авторизации пользователя, заменяет запрет запуска тестов без запроса правилами о соразмерных тестах и ограничивает ненужные повторные прогоны. Это текст служебных инструкций модели; он добавлен отдельным SHA. Автоматического обобщения этих абзацев или разрешения произвольного текста нет. Перед установкой распорядитель может прочитать полный новый вариант по ссылке в таблице.

## Реальные нити

Полный вывод — [real-check-3.txt](real-check-3.txt). Последний batch: `2026-10-21T14:25:08.939984Z` — `2026-10-21T14:25:11.5517007Z`. Поле `ledger_required_since` равно времени начала: `2026-10-21T14:25:08.939984Z`. При установке распорядителю нужно заменить его временем установки. Журнал задним числом не создавался.

| Нить | Задание (--task) | Результат | Лог |
|---|---|---|---|
| `01a15df6-4820-7b91-9e51-384f75bed1da` | Как в REPORT-2: без --task | FAIL, код 4: старые skills и recommended_plugins | [real-check-3.txt:88](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/real-check-3.txt:88) |
| `01a15e46-2b5b-7e40-8270-17631e7cfc20` | Как в REPORT-2: без --task; --children | OK, код 0 | [real-check-3.txt:198](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/real-check-3.txt:198) |
| `01a15e69-f428-7143-88a0-5f238ccfe4ad` | Как в REPORT-2: без --task; --children | OK, код 0 | [real-check-3.txt:223](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/real-check-3.txt:223) |
| `01a15e6d-8d89-7362-9f89-8ebb8c4d56f0` | Как в REPORT-2: без --task; --children | OK, код 0 | [real-check-3.txt:332](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/real-check-3.txt:332) |
| `01a15e7b-2b27-7893-a558-4c28f0639b18` | part2/accept/a-17-02.md; --children | OK, код 0 | [real-check-3.txt:436](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/real-check-3.txt:436) |
| `01a15e85-e225-70d3-8c89-6195fdea3856` | input-check-v2/RESUME-2.md; --children | OK, код 0; t1 и t2 до журнала | [real-check-3.txt:636](C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/real-check-3.txt:636) |


У последней нити отдельно напечатаны строки t1 и t2 «задание хода … не проверено: ход начат до журнала заданий», а итог содержит число 2. Последний ход совпал с RESUME-2.md. Начиная с границы журнала отсутствие раннего задания по-прежнему даёт FAIL; последний ход всегда сверяется с --task.

В старой нити действительно присутствуют посторонние списки skills и recommended_plugins. Полный FAIL также перечисляет исторические ошибки происхождения agent_message, неизвестный тег subagents старой среды и неизвестный SHA старого skills_instructions. Эти дополнительные ограничения не ослаблялись ради ожидаемого результата.

В отчётах каждого хода сохранены режим песочницы и доступ к сети из turn_context. Для зашифрованных заданий и ответов явно указано, что текст не проверен; сверка происхождения продолжает работать.

## Самоаудит и временные файлы

Выполнен один круг самоаудита: исходники и артефакты проверены напрямую. Графовые инструменты не разрешили вызовы при approval policy never, поэтому выводы основаны на чтении файлов. Результат записан в [self-audit-3.json](self-audit-3.json): прежние 48 функций тестов (67 случаев с параметрами) не изменены, произвольных wildcard в шаблонах нет, проверены тексты действующих SHA. Исправленные слабые красные тесты повторно прогнаны на исходной копии. После этого выполнен итоговый полный прогон и проверка синтаксиса; новый круг аудита не проводился.

`input-check-v2/TEMP` — временные каталоги pytest и py_compile предыдущей сдачи, созданные при прогонах субагентов; их пути сохранились в `fix-red.log:6675,6688,6701`. Это наша временная папка. Точный идентификатор создавшего процесса не установлен. При инвентаризации найдено 327 файлов и 403 подкаталога, ссылок и reparse points не обнаружено. Новые прогоны используют системную временную папку.

Удаление TEMP не выполнено. Автоматическая проверка отклонила три варианта команды с причиной `blocked by policy`, включая проверенное удаление отдельных файлов и пустых каталогов без -Recurse. Повторными API запрет не обходился. Свидетельства и границы вывода — в [temp-cleanup-3.json](temp-cleanup-3.json).

Контрольные суммы итоговых исполняемых файлов, данных allow, текстов белого списка и артефактов этой сдачи записаны в [validation-3.txt](validation-3.txt). Хеш REPORT-2.md сохранился: `370bed5ae3e00779903dd7d68aff6f374c39bb150e6ed998d1368f8acefdcaf2`.

## Не проверено

- Открытый текст зашифрованных заданий и ответных сообщений Codex недоступен; проверены происхождение и открытая оболочка, ограничение напечатано в каждом отчёте checker.
- Ветви token-guard с нулём в таблице не встречались в реальных данных этого снимка; их шаблоны выведены из исходника хука. Будущие изменения текста хука потребуют пересмотра allow.
- Установка обёртки и рабочий запуск настоящего Codex не выполнялись. Поведение обёртки проверено с подменой; реальная проверка читала только сохранённые rollout.
- Текущие rollout могут продолжиться после указанной верхней границы; таблицы относятся к зафиксированному моменту последнего batch.
- Папка TEMP осталась из-за запрета автоматической проверки на удаление. Это единственное невыполненное действие текущего ответа распорядителя.
