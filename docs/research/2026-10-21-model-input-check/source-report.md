# Отчёт: вторая версия проверки входа моделей

Автор — субагент Claude Sonnet. Записать файл он не смог, поэтому текст сохранил распорядитель из его итогового сообщения, без правок по существу.

## Что изменено по пунктам брифа

### check-codex-input.py

| Пункт | Где | Что |
|---|---|---|
| 1. Вся нить | `Audit.run` (150), `main` (239) | Строки rollout не пропускаются. `--since` только отбирает файлы помощников (263). Нить `01a15df6…` со старыми списками skills даёт FAIL. |
| 2. `compacted` | `Audit.compacted` (186) | Элементы `replacement_history` типа `message` проходят через тот же `message`/`part`, с меткой `сжатие/`. Прочие элементы (`compaction`) выводятся строкой «не классифицируется». |
| 3. Части без `text` | `Audit.part` (118) | В developer/system — FAIL «неизвестная часть <type>». В user — строка в отчёте без FAIL. |
| 4. Потолки | `limited` (84), `classify_service` (93), `codex-input-allow.json` | У каждого префикса `{"prefix","max_chars"}`. То же для `base_instructions` и `<environment_context>`. Превышение — FAIL «<префикс> больше потолка: N > M». `SKILL_LIST` (26) — FAIL в любом блоке. |
| 5. Задания | `Audit.run` (176–181), `check_task` (195) | Больше одного user-задания в ходе — FAIL «лишнее сообщение user в ходе tN». `--task` сверяется с заданием последнего хода. Нет ходов — FAIL. |
| 6. Помощники до конца | `with_descendants` (219) | Обход по `parent_thread_id`, пока находятся новые нити. |
| 7. Привязка | `main` (251–258) | `--thread` требует ровно один rollout, иначе FAIL с перечнем. `--new-in` удалён. |

Сверх брифа: переменная `CODEX_SESSIONS_DIR` (24), чтобы тест не трогал `~/.codex`.

У помощников задание приходит через `agent_message`, поэтому user-заданий в ходе может быть 0. Для помощника это не FAIL, для основной нити — FAIL (`Audit.run`, 180–181). В 103 ходах основных exec-нитей всегда ровно одно задание.

### codex-exec.sh

| Пункт | Где | Что |
|---|---|---|
| 1. Проверка по id | `run_checked` | Вывод идёт через `tee "$O.run.log"`. Id берётся из `session id: …`, для `resume` он известен заранее. Нет id — FAIL. Проверка: `--thread id --task T --children --since`. |
| 2. Коды | `run_checked` | Код Codex дописывается строкой в `$O.input-check.txt`. FAIL — всегда `exit 4`, без FAIL — код Codex. |
| 3. Проба | `probe` | Код пробы и наличие id проверяются явно. При ошибке `return 1`, отпечаток не записывается. |
| 4. Отпечаток | `fingerprint`, шапка | Добавлены `CODEX_HOME`, `CODEX_MODEL`, `CODEX_EFFORT` и доп. флаги рабочего запуска. В шапке одна фраза о дешёвом фильтре на `gpt-6-luna`. |
| 5. Не менять | — | `BASE`, модели и команды `new/resume/probe/flags` не менялись. Вывод `flags` совпал с оригиналом. |

### wire-audit.py

| Пункт | Где | Что |
|---|---|---|
| 1. id по значениям | `is_machine_id`, `strings` | Берутся значения разобранного JSON, ключи не считаются. Правило — из брифа. В отчёте до 5 примеров id на роль. |
| 2. Префикс в токенах | цикл по вызовам в `main` | Каждое сообщение кодируется как `роль\n` + текст. Префикс считается по токенам сообщений подряд. |
| 3. Все сообщения | `main` | Учитываются все сообщения запроса. Неопознанная роль — WARN «роль не опознана: <начало system>». |
| 4. `key_starts` | `key_starts` | Только для JSON. Иначе обрыв помечается «user (не JSON)». |
| 5. Максимум по вызову | `LIMITS`, строка «максимум по вызову» | Вход, id, время, дубли и мс — максимум с `seq`. Пороги проверяются по каждому вызову. WARN — число вызовов выше порога и самый тяжёлый. |
| 6. Дубли | словарь `seen` в `main` | Считаются по экземплярам, повтор в массиве — дубль. |
| 7. Название метрики | — | «избыточность записи JSON в ответе». |

## Таблица потолков

Потолок = наибольшее значение по rollout после `2026-10-21T11:30:00Z` × 1,3 с округлением вверх.

| Префикс | Наибольшее | Потолок | Rollout |
|---|---|---|---|
| base_instructions | 18769 | 24400 | 01a15e46-2b5b-7e40-8270-17631e7cfc20 |
| `<permissions instructions>` | 597 | 777 | 01a15e4e-0ece-72f1-80ab-7ef7f7ae980d |
| `<multi_agent_role>` | 2453 | 3189 | 01a15e46-62eb-7a50-bb8c-acb11281ac8c |
| `<multi_agent_mode>` | 520 | 676 | 01a15e46-2b5b-7e40-8270-17631e7cfc20 |
| `<environment_context>` | 1769 | 2300 | 01a15e4e-0ece-72f1-80ab-7ef7f7ae980d |
| `[codebase-memory]` | 804 | 1046 | 01a15e3c-2e59-71d1-ab55-c3332f7755d0 |
| `<model_switch>` | 21701 | 28212 | 01a15e4e-0ece-72f1-80ab-7ef7f7ae980d |
| `token-guard (контроль расхода токенов)` | 415 | 540 | 01a15e46-62eb-7a50-bb8c-acb11281ac8c |
| `<turn_aborted>` | 221 | 288 | 01a14316-4f4b-7e50-8866-0871e948a87e (по всем rollout) |
| `<skills_instructions>` без списка | 181 | 236 | 01a15df6-4820-7b91-9e51-384f75bed1da (по всем rollout) |

`<recommended_plugins>` остаётся в `forbidden_developer_prefixes`, как и в первой версии.

## Результаты проверок

| Команда | Итог | Файл вывода |
|---|---|---|
| `py_compile` трёх .py, `bash -n codex-exec.sh` | без ошибок | — |
| `pytest test_input_check.py -v` | 16 passed | `test-output.txt` |
| checker `--thread 01a15df6-4820-7b91-9e51-384f75bed1da` | FAIL, код 1: список skills в `<skills_instructions>` и `<recommended_plugins>` в t1, t4, t5 | `real-check.txt` |
| checker `--thread 01a15e46-2b5b-7e40-8270-17631e7cfc20 --children` | OK, код 0, 4 rollout | `real-check.txt` |
| `wire-audit.py … capture.jsonl --roles … --out wire-audit-v2.txt` | 50 вызовов, 4 роли, WARN по всем ролям | `wire-audit-v2.txt` |
| `codex-exec.sh probe <codex-direct>`, один раз на `gpt-6-luna` | OK: 1 rollout, задание равно файлу пробы | `probe-output.txt` |

Тесты:
- checker — девять случаев из брифа, а также часть без текста, несовпадение `--task` и `--thread` без файлов;
- wire-audit — id в значении и в ключе, `conversation-memory:2:0`, дубль в массиве, не-JSON user, неопознанная роль, формат id;
- обёртка — `new` с подменённым Codex:
  - чистый запуск → 0;
  - Codex вернул 7, FAIL нет → 7;
  - FAIL при коде Codex 0 → 4;
  - FAIL при коде Codex 9 → 4;
  - нет `session id` → 4.

## Не сделано / не проверено

- `new` и `resume` с настоящим Codex не запускались, как требовал бриф. Коды `new` проверены только с подменённым Codex. `resume` и его отпечаток не проверялись.
- Для `<turn_aborted>` и `<skills_instructions>` после 11:30Z выборки нет. Потолки взяты по всем rollout.
- Тест обёртки работает через Git Bash (`C:/Program Files/Git/bin/bash.exe` или `GIT_BASH`). С системным bash Windows (WSL) тест пропускается.
- Пороги WARN в wire-audit взяты из старой версии. На реальном захвате WARN срабатывает по каждой роли, смысл порогов стоит обсудить отдельно.

## Сверка распорядителя (12:2xZ)

- `pytest` повторён: 16 passed.
- Нить `01a15df6…` — код 1.
- Нить `01a15e46-2b5b…` с `--children` — OK, 4 rollout.
