# Проверка входа v2 на servak

## Итог

Один исходник v2 работает на ПК и servak без ослабления сверки входа. Предварительная установка находится в `/srv/novgorod-work/codex-direct/v2/`; рабочую `v2-live/` на ПК я не менял. Финальные прогоны дали **253 passed на ПК** и **253 passed на servak**. Живые `probe`, `new` и `resume` на servak дали `ИТОГ: OK`; реальный дополнительный developer-текст дал код 4 и `ИТОГ: FAIL`. Свежий снимок PC-rollout дал классы **а=248, б=1, в=0** после сверки с действующим журналом. Использованы все **12 из 12** консервативно учтённых обращений к модели. Проверка `linux-work/final-verification.json` подтвердила совпадение SHA 32 установленных файлов, четыре выходных файла для каждого рабочего запуска и отсутствие работающих собственных unit.

## Изменения и тесты

| Пункт | Правка | Различающий тест | Красный на прежнем коде | Зелёный |
|---|---|---|---|---|
| Linux-бинарь, Python, интерфейс и журнал | `codex-exec.sh:4,16–42,170–216` | `test_input_check.py:2539–2566`, `test_wrapper_usage_describes_resume_and_writable_roots` | `linux-red.log:44,77,101` | `linux-green-pc.log:472`, `linux-green-servak.log:363` |
| POSIX-пути, проверка cwd и корней без Windows-casefold на Linux; поведение ПК сохранено | `check-codex-input.py:14,71–96,114–154` и проверки контекста хода | `test_input_check.py:2428–2498` | `linux-red.log:166` | `linux-green-pc.log:472`, `linux-green-servak.log:363` |
| MCP-флаги только для имён, объявленных в разобранном TOML; битый файл даёт код 3 до Codex | `codex-exec.sh:37–84` | `test_input_check.py:716–763` | `linux-red.log:268` | `linux-green-pc.log:472`, `linux-green-servak.log:363` |
| Встроенные блоки Linux, включая закрывающий тег, процитированный внутри `collaboration_mode` | `check-codex-input.py:156–185`; `codex-input-allow.json:153–170,392–403` | `test_input_check.py:1470–1510` | `linux-red.log:748` | `linux-green-pc.log:472`, `linux-green-servak.log:363` |
| `shell=bash` и закрытая схема `world_state.collaboration_mode`: три обязательных строковых поля, разрешённый режим и модель хода, `hex40` | `codex-input-allow.json:123–126,1014–1025,1135–1137`; `check-codex-input.py:761–784` | `test_input_check.py:1512–1554` | `linux-red.log:748` | `linux-green-pc.log:472`, `linux-green-servak.log:363` |
| Отсутствующий `config.toml` — отдельная невозможная для `sha256sum` метка; существующий файл остаётся на прежнем месте в потоке | `codex-exec.sh:89–128` | `test_input_check.py:846–917`; сравнение с прежней обёрткой при трёх серверах — закрепление | `linux-red.log:804`; закрепление поймало мутант `config_order` в `linux-mutants.log:650` | `linux-green-pc.log:472`, `linux-green-servak.log:363` |
| Первая служебная `token_count` допускает `info:null`; строка и список по-прежнему отвергаются | `codex-input-allow.json:836–839` | `test_input_check.py:1558–1568` | `linux-red.log:804` | `linux-green-pc.log:472`, `linux-green-servak.log:363` |
| Приёмка r5: время ошибки помощника и регистр путей | проверка в `check-codex-input.py`, тесты `test_input_check.py:2486,2499` | `err_time`, `pathkey_case` | мутанты `linux-mutants.log:282,310` | `linux-green-pc.log:472`, `linux-green-servak.log:363` |

При наличии `config.toml` тест сравнил побайтно поток отпечатка старой и новой обёрток после первой строки с SHA самой обёртки. Эта первая строка неизбежно меняется при изменении файла скрипта; остальные строки, включая SHA конфига и их порядок, совпали. Отсутствие и пустой файл дали разные отпечатки, а появление файла после успешного запуска вызвало новую пробу. Старое ожидание кода 3 для отсутствующего `AGENTS.md` осталось неизменным. Функциональные тесты новых допусков краснели на сохранённой ревизии; тесты сохранения уже правильного поведения обозначены как закрепление.

Финальный полный прогон ПК: **2026-10-21T22:45:51–22:47:09Z**, `linux-green-pc.log:457–473`. Servak: **22:47:32–22:47:57Z**, `linux-green-servak.log:348–364`. На servak `tokenizers==0.23.1` установлен только в собственный `test-runs/v2l-linux-20261021T214228Z/pydeps` и подключён к pytest через `PYTHONPATH`; в `v2/` его нет.

## A-LINUX-03

По решению ведущего добавлены только два точных SHA встроенных блоков Codex и закрытые значения `shell` и `world_state.collaboration_mode`. Реальный `collaboration_mode` цитирует свой закрывающий тег внутри текста; разборщик ищет границу верхнего уровня, после чего весь блок всё равно обязан совпасть по SHA. Положительные случаи были красными на предыдущей ревизии (`linux-red.log:576–748`), затем 15 случаев прошли точечно (`linux-green-pc.log:390–402`); полные прогоны приведены выше.

## A-LINUX-04

Отсутствующий `config.toml` теперь даёт метку `!CONFIG_TOML_ABSENT` в отпечатке, существующий файл — прежнюю строку `sha256sum` между теми же соседними строками. Появление файла принудительно вызывает пробу, а отсутствие `AGENTS.md` всё ещё даёт код 3. В учёте токенов допустимо только новое значение `info:null`; строка и список остаются FAIL. Красный прогон — `linux-red.log:752–804`, зелёный точечный — `linux-green-pc.log:441–453`, полный — `:457–472` и `linux-green-servak.log:348–363`. Мутант с хешем пустого файла вместо метки упал (`linux-mutants.log:629`).

## Точные блоки и поля allow

| Блок или поле | Источник | Допуск и основание |
|---|---|---|
| `<collaboration_mode>` | Собственная нить `01a1608a-a1e7-7c43-b1fe-a16b9c8e911c`, `rollout-2026-10-22T01-17-42-01a1608a-a1e7-7c43-b1fe-a16b9c8e911c.jsonl:3`, `content[1]` | Только SHA-256 `7f45d7d6986a761101d46d185824ce65c321ca0f02cea7497fc46d60ffae417b`; полный текст — `allowed-blocks/collaboration_mode-7f45d7d6986a.txt`. Ведущий подтвердил стандартный режим Default и отсутствие пользовательских инструкций режима (`thread_settings…developer_instructions=null`). |
| `<multi_agent_role>` с четырьмя слотами | Та же нить, rollout `:4`, `content[0]` | Только SHA-256 `3edd51083129388f52e881435e93e4b981e00c5ee3d62ab5d32e22c428fd504b`; полный текст — `allowed-blocks/multi_agent_role-3edd51083129.txt`. Предыдущие SHA сохранены; ведущий проверил отличие числа слотов и перевода строки. |
| `environment_context.shell=bash` | Та же нить, rollout `:6` | Описание среды добавлено как одно значение рядом с `powershell`; `zsh` остаётся FAIL. |
| `world_state.state.collaboration_mode` | Та же нить, rollout `:7` | Закрытые ключи `mode`, `model`, `instructions`; `mode=default`, модель совпадает с `turn_context`, digest — `hex40`. Связь digest с текстом блока не утверждается. |
| `event_msg/token_count.payload.info=null` | PC-нить `01a16094-4ec0-76b0-9644-45c6eacb2a1b`, `rollout-2026-10-22T01-28-14-01a16094-4ec0-76b0-9644-45c6eacb2a1b.jsonl:16` | Только дополнительный тип `NoneType` для `row.payload.info`; вложенная схема объекта не менялась. Проверка сохранённой нити не дала новых ошибок схемы по этому rollout (`linux-work/pc-a4-token-readonly.txt`). |

Нового SHA глобальных `AGENTS.md`, skills, MCP или иных инструкций в allow не внесено. Linux-блок `<permissions instructions>` прошёл прежнюю сверку контекста без нового SHA. Для первых двух блоков отрицательные варианты текста дали FAIL. Схема `collaboration_mode` отвергла `plan`, лишний или пропущенный ключ, чужую модель, неверный тип и digest вне `hex40`.

## Мутанты

Все итоговые мутации упали на assert своего теста. Координаты результата: `err_time` — `linux-mutants.log:282`, `pathkey_case` — `:310`; Linux-ветки `linux_rule_by_flavor`, `linux_casefold`, `linux_slash`, `linux_context_cwd`, `linux_meta_cwd`, `linux_sandbox_root`, `linux_meta_root` — `:329,348,367,392,417,442,467`; обёртка `linux_uname`, `linux_default_bin`, `linux_default_python`, `linux_task_path`, `linux_usage` — `:487,507,529,558,576`; `mcp_unconditional` — `:598`; `config_absent_as_empty` — `:629`; `config_order` — `:650`. Для двух последних финальная форма мутанта была уточнена после пробного прогона, так что зачёт дают только строки `:629` и `:650`.

## Живые проверки servak

Пути команд: `V=/srv/novgorod-work/codex-direct/v2/codex-exec.sh`, `W=/srv/novgorod-work/worktrees/v2l-probe`, `R=/srv/novgorod-work/codex-direct/test-runs/v2l-linux-20261021T214228Z`. Все unit-вызовы шли через принятый `codex-run` с `CODEX_BIN` CLI `0.163.0-alpha.11`, `CODEX_PYTHON=/usr/bin/python3`, `CODEX_HOME` servak, `CODEX_MODEL=gpt-6-luna`, `CODEX_EFFORT=low`. Точные команды и UTC для каждого unit — `linux-live.log:1–161`; бюджет — `linux-work/model-budget.json`.

| Unit / команда обёртки | Обращения; id нити | Код и итог |
|---|---|---|
| Две подготовительные Windows-проверки CLI вне unit | 2; session id не создан | Приняты ведущим в бюджет. После исправления фикстур тесты вызывают только подставной Codex. |
| `v2l-measure-20261021T215049Z`, `V probe W` | 1; id нет | Код 3 до rollout: старые безусловные MCP-флаги создали неполную запись сервера. |
| `v2l-probe-20261021T221739Z`, `V probe W` | 1; `01a1608a-a1e7-7c43-b1fe-a16b9c8e911c` | Код 3; checker FAIL по ещё не разрешённым встроенным блокам, `shell` и `world_state`. Эти точные случаи утверждены A-LINUX-03. |
| `v2l-probe-20261021T223558Z`, `V probe W` | 1; `01a1609b-637f-7bf2-afe9-aef537ff5ce2` | Код 0; `ИТОГ: OK`. |
| `v2l-new-20261021T223640Z`, `V new W R/task-new.txt R/v2l-new-20261021T223640Z.reply.md --skip-git-repo-check -s read-only` | 0; id нет | Код 3 до модели: прежний отпечаток требовал отсутствующий `config.toml`; A-LINUX-04 устранило этот отказ. |
| `v2l-new-20261021T224812Z`, та же форма `new` с одноимённым `O` | 2; автопроба `01a160a6-9798-7cc2-a9f2-9fa329163e21`, рабочая нить `01a160a6-b5c3-7061-889c-17340756e725` | Код 0; оба `ИТОГ: OK`, sandbox `read-only`. |
| `v2l-resume-20261021T224835Z`, `V resume 01a160a6-b5c3-7061-889c-17340756e725 R/task-resume.txt O --skip-git-repo-check -s read-only` | 1 консервативно; нового id нет | Код 4: CLI `exec resume` не поддерживает `-s` (`linux-work/own-rollouts/live-resume-unsupported-flag.run.log`). Модель не получила задание; запись попытки журнала сохранилась. |
| `v2l-resume-20261021T225216Z`, та же форма без неподдерживаемого `-s`, из `W` | 2; автопроба `01a160aa-5299-7540-9e0a-e391fc445df7`, продолжена нить `01a160a6-b5c3-7061-889c-17340756e725` | Код 0; оба `ИТОГ: OK`. В ходе t2 модель `gpt-6-luna` low, sandbox `read-only`, сеть «неизвестно» (`linux-work/own-rollouts/live-resume-input-check.txt`). Смена набора аргументов вызвала новую пробу (`linux-work/unit-resume-225216.log`). |
| `v2l-negative-20261021T225241Z`, `V new W R/task-negative.txt O --skip-git-repo-check -s read-only -c 'developer_instructions="Answer with the word CHECK"'` | 2; автопроба `01a160aa-b3f5-71b1-a8af-6fb6afa03d8e`, рабочая нить `01a160aa-cd3a-79b2-bc58-8f1dde61f116` | Проба OK, затем код 4: Codex завершил работу кодом 0, checker дал `ИТОГ: FAIL` за неизвестный SHA developer-текста. Новое значение `EXTRA` сменило отпечаток и вызвало пробу (`linux-work/unit-negative-225241.log`; `linux-live.log:175–178`). |

Отдельно две копии собственного rollout рабочей нити `01a160a6-b5c3-7061-889c-17340756e725` проверены **без модели**. В первой изменён текст проектного AGENTS при прежнем файле: код 4, «AGENTS.md во входе не равен файлам» (`linux-live.log:165–168`). Во второй добавлен developer-блок: код 4, «неизвестный SHA» (`linux-live.log:169–171`). Тексты копий и отчёты — в `linux-work/own-rollouts/negative-*`; настоящий проектный `AGENTS.md` остаётся источником истины. Для `new`, успешного `resume` и живого отрицательного запуска существуют все четыре файла `O`, `O.run.log`, `O.input-check.txt`, `O.input-check.err` (`linux-work/final-verification.json`).

## PC-rollout и установка

Свежий префиксный снимок PC sessions: **T0 2026-10-21T22:54:07.068783Z**, 2017 файлов, SHA-256 манифеста `53ba755999f940bda0474299a2e433571fa6f69d6aa1bc095c6041b62118decf`; 52 корня, 50 исключённых по времени, один файл после T0, ноль нарушений целостности. Первый проход со всеми корнями как прямыми дал а=248, б=46, в=0 (`linux-live-pc-a4-initial.txt`). Пересчёт того же снимка с фактическим журналом `v2-live` и его временем установки дал **а=248, б=1, в=0** (`linux-live-pc-a4-ledger.txt`, **22:56:40–22:57:13Z**). Единственный класс б — t5 нити `01a15f85-f8cd…`, запуск до перехода на v2-live, подтверждённый ведущим. Новых расхождений схемы не найдено. `v2-live/` использована только для чтения границы журнала и записей.

| Файл | SHA-256 на ПК и в `v2/` servak |
|---|---|
| `codex-exec.sh` | `b8e3cd66f714ea21d7ef32a1ef481ce95d45e2fd4e00f0d606661fcbccabfb7c` |
| `check-codex-input.py` | `fa08d4966101d88013e95bf067855f163cffe6fea07fa4af33cbdec7f9b5988e` |
| `codex-input-allow.json` | `397d0a1bd2080a4172686ecb84ac71d160d4966c0e4d889a7fbe8ccfabdadba5` |
| `test_input_check.py` | `63d452e60d1b0f2cda0910141122d9009ca1526eeec8f312662f1f7befd2cfc9` на ПК и в тестовом bundle servak; в `v2/` тесты не ставились. |

Установка сверена **2026-10-21T22:48:04Z** (`linux-work/install.json`): три исполняемых файла и 29 текстов `allowed-blocks/`, всего 32 файла, SHA совпадают. `v2/` также содержит собственные `.input-ledger/` и `.codex-input-ok`. Итоговый один круг самоаудита **23:00:01Z** подтвердил те же SHA, отсутствие работающих `codex-v2l-*` unit и бюджет 12/12 (`linux-work/final-verification.json`). Сообщение о принятой установке запускателю оставлено ведущему.

## Не проверено

Содержимое зашифрованных заданий и переписки помощников остаётся недоступным: проверяется их происхождение и открытая оболочка. Содержимое результатов инструментов, запрошенных моделью, а также определения инструментов вне rollout checker не видит. Связь digest-полей `world_state`, включая `collaboration_mode.instructions`, с исходным текстом не доказана. Будущие версии CLI, новые виды строк и новые значения схемы потребуют отдельного замера. Не проверен запуск через параллельно готовящийся запускатель с ПК; его интерфейс сохранён, но установка считается предварительной до приёмки ведущего. Каталог `CODEX_HOME` servak, `auth.json`, значения конфигурации и секреты моими командами не открывались и не печатались.
