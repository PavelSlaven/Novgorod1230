# Проба одновременной работы помощников
> Движок: не относится.
> Даты: 2026-11-03 — 2026-11-03.
> Источник отчёта: codex-direct/probe-threads/reply-probe.md; codex-direct/probe-threads/reply-probe-48.md

## Вопрос
Сколько помощников среда позволяет запустить одновременно; материалы содержат отдельные задания на 16 и 48 помощников ([task-probe.md](task-probe.md):1, [task-probe-48.md](task-probe-48.md):1).

## Метод
В обоих заданиях предписано одним шагом запустить всех помощников, не дожидаясь первых ответов, а затем дождаться ответов всех; для каждого задан одинаковый короткий запрос с передачей времени до и после ожидания ([task-probe.md](task-probe.md):7, [task-probe-48.md](task-probe-48.md):7). В задании на 16 указаны модель `gpt-6-luna`, режим `xhigh` и `fork_turns: "none"` ([task-probe.md](task-probe.md):14); итог второго отчёта также записывает эти параметры ([reply-probe-48.md](reply-probe-48.md):3).

## Ход
Журнал сообщает, что обёртка `servak-codex.sh` не пропускала настройку `agents.max_threads` через белый список, поэтому для проб использовали настройку в `codex-exec.sh` ([JOURNAL.md](JOURNAL.md):1). В другой записи журнал отмечает отказ проверки входа на неизвестный SHA после изменения числа доступных мест с «4» на «18»; затем предел исправили на 16 мест помощников, добавили варианты входного блока и запустили следующую пробу ([JOURNAL.md](JOURNAL.md):2). В заключительной записи указано, что проба 3 завершилась с успешной проверкой входа, а скрипт по rollout сообщил `max_parallel 16` ([JOURNAL.md](JOURNAL.md):3).

## Результаты
В пробе на 16 ответили все 16 запущенных помощников; все 16 одновременно работали с 06:29:39 до 06:30:19 UTC ([reply-probe.md](reply-probe.md):22). Среда не отказала ни в одном запуске ([reply-probe.md](reply-probe.md):23).

В отчёте второй пробы записано: запущены 48 помощников, получены 48 ответов, отказов среды не было ([reply-probe-48.md](reply-probe-48.md):2). Для всех указаны параметры `gpt-6-luna`, `xhigh`, `fork_turns: "none"` ([reply-probe-48.md](reply-probe-48.md):3). Условие одновременности в этой пробе не выполнено: запуск шёл последовательно и занял больше 90 секунд ([reply-probe-48.md](reply-probe-48.md):4).

## Выводы
В журнале по завершении пробы на 16 зафиксирован вывод скрипта по rollout `max_parallel 16` и сообщается, что предел 16 помощников включили в обёртку для новых нитей servak ([JOURNAL.md](JOURNAL.md):3). Это запись о состоянии на момент журнала; сам журнал также отмечает, что локальная копия файла входных разрешений расходилась с servak, а локальная копия запускающего скрипта была старой ([JOURNAL.md](JOURNAL.md):3).

## Решения владельца
D398: владелец согласился провести пробу на 16 помощниках luna одновременно. В тексте решения указано, что при успешной пробе предел `agents.max_threads=17` применяется ко всем запускам Codex Novgorod, а задания рассчитаны на 16 и более параллельных дорожек (C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md:236).

## Ограничения
Проба на 48 не выполнила условие одновременного запуска, поскольку запуск шёл последовательно дольше 90 секунд; её отчёт не содержит измерения одновременной работы 48 помощников ([reply-probe-48.md](reply-probe-48.md):4). Журнал указывает, что локальные копии двух файлов настройки и запуска не совпадали с состоянием servak на момент записи ([JOURNAL.md](JOURNAL.md):3).

## Материалы
| путь | размер в байтах | SHA-256 | что это |
|---|---:|---|---|
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/probe-threads/reply-probe.md` | 768 | 3c5b134c9a8723459cc25459bfaabe500f01719240b68e1154ec668f4d340a9c | Итог пробы на 16 помощников. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/probe-threads/reply-probe-48.md` | 1942 | bb0acd9dc22302e7f56a862974d086525c120f2eaa751fc98072770c2ca90456 | Итог пробы на 48 помощников. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/probe-threads/task-probe.md` | 1926 | 7c3db74da3fa8833d6f981ffe816226567d03b629ffe97f2d55a386423c23842 | Задание пробы на 16 помощников. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/probe-threads/task-probe-48.md` | 1926 | ba5fbdcbe2122adf62f6f31c0d5945d73fbc27cc7ddd02b2baab4fb07fd3ae8f | Задание пробы на 48 помощников. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/probe-threads/JOURNAL.md` | 1429 | 488a51bd305f66a983c447b8ca794bd68bb5547200b0e985556076af04851f90 | Журнал подготовки, запуска и состояния настройки. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md` | 158935 | 9a59e78410f86d25fbab77233f6fc78553b71944a9079d06c07772647cb2715e | Внешний источник решения D398; не скопирован, поскольку превышает допустимый размер малого артефакта. |
