# 4. Криминалистика Codex (сессия 01a14fce): субагенты, авторство слоя сохранения, родное сохранение, токены

Только чтение. Главный лог: `C:/Users/Slaven/.codex/sessions/2026/10/18/rollout-2026-10-18T19-18-35-01a14fce-cdcf-7760-b8a3-8060b305a956.jsonl` (8882 записи; далее MAIN, «стр. N» = номер строки). Время в логе UTC, MSK = UTC+3. Скрипты python читали лог выжимками, временные файлы удалены.

## Главный вывод (5 пунктов)
1. Постановка не размыта: владелец (стр. 16, 16:21Z) сказал «смотри pr754, проведи аудит, перепроверь план и выполняй». Но правило reuse-first не дошло до MAIN как инструкция: в AGENTS.md проекта его нет (стр. 8), `Reuse_Strategy` MAIN сам не открывал (нет exec с этим именем), читал его только субагент Boyle (стр. 226 его лога).
2. Per-op durability требовал План (строки 18, 27, 40, 155 плана). Ни MAIN, ни один аудитор не оспорили требование; все аудиторы только ужесточали, MAIN усилил P4-сценарии (стр. 265–267).
3. Код слоя писали luna-исполнители (78 из 79 сессий субагентов на luna medium), но проект и приёмку вёл MAIN (astra ultra): утверждал, писал CR P4, сделал 6 патчей `generations.py`. Дело не в «Luna вместо Astra», а в том, что на верхнем уровне никто не сверил слой с правилом reuse.
4. Родное сохранение (`game::save`) Codex зовёт, не переписывает; дублирование — поколения на операцию, журнал operation ID, процесс на операцию (слой вокруг записи). Явного анализа «autosave/quicksave родные?» с выводом не найдено.
5. Токены: 834M всего (98% кэш), из них 17 агентов слоя сохранения/P4 около 205M (25%).

## 1. Субагенты

- В MAIN 80 вызовов `spawn_agent` (tools: exec 555, spawn_agent 80, followup_task 123, send_message 116, wait_agent 145, interrupt_agent 16). Найдено 79 сессий субагентов (`agent_path` из `session_meta.source.subagent.thread_spawn`).
- Модели по `turn_context`: 78 на `gpt-6-luna` medium, 1 (Godel `/root/freeze_native_source`) на `gpt-6.1-sol` high.
- Причина: `model` в `spawn_agent` не задавалась; harness-сообщение `multi_agent_role` (стр. 6) запрещает задавать model/effort без явной просьбы владельца, AGENTS.md или skill, поэтому сработал config `default_subagent_model="gpt-6-luna"`, effort medium. Стр. 7 `multi_agent_mode` велит делегировать проактивно. AGENTS.md проекта (стр. 8) политики моделей для субагентов не содержит.
- Тексты заданий spawn_agent и reasoning в логе зашифрованы: первые 400 символов заданий прочитать нельзя. Читаются `task_name`/`agent_path` и результаты (FINAL_ANSWER). Роли: plan_review (Boyle), contract_audit (Mendel), persistence_seam (Locke), p4_feasibility (Wegener), p4_generation_coordinator (James), p4_native_probe (Laplace), recovery_preload_v2 (Harvey), recovery_native_integrate (McClintock), p3_p4_join_implementation (Epicurus), recovery_coordinator (Banach), p4_final_audit (Kepler).
- Параллелизм до 4 (config `max_concurrent_threads_per_session=4`).

## 2. Кто спроектировал и написал слой сохранения

Файлы (`C:/Users/Slaven/.codex/worktrees/cataclysm-recovery/Novgorod/tools/cataclysm-prototype/`): `generations.py` 1634 строки, `test_generations.py` 481, `novgorod_preload_probe.cpp` 435, `native-preload.patch` 152, также `novgorod_persistence_test.cpp`, `native-persistence.patch` (game.cpp, game.h, game_io.cpp), `JOURNAL.md` 14 строк (P3), `MODULE.md` («P4 coordinator — единственный владелец принятия общего поколения»).

Авторство по apply_patch в логах (`*** Add/Update File:`):
- `generations.py`, `test_generations.py`: luna-агенты p4_generation_coordinator (James), recovery_coordinator (Banach), p3_p4_join_implementation (Epicurus) и MAIN (6 патчей).
- `novgorod_preload_probe.cpp`, `native-preload.patch`: recovery_preload_v2 (Harvey, luna), recovery_native_integrate (McClintock, luna).
- `novgorod_persistence_test.cpp`: p4_native_probe (Laplace, luna) и MAIN.
- `JOURNAL.md`: MAIN.
- Проект: идею «изолированные полные поколения» предложили luna-explorer-ы Locke (его лог, стр. 188) и Wegener (стр. 91, 112, 163) по запросу MAIN; MAIN утвердил и записал CR P4 (стр. 1801, 17:54Z).
- Вывод: пишет слой в основном luna; проектное решение и утверждение — astra (MAIN).
- `git log` по `tools/cataclysm-prototype` в worktree: после компакта цифры коммитов не воспроизводил, в сохранённых данных их нет — не найдено.

## 3. Рассматривал ли Codex родное сохранение; оспаривал ли требование

- План: строки 18 («согласованное durable поколение с operation identity»), 27, 40 (`game::save` + «Atomic общее сохранение»), 155 («Гипотеза… изолированные полные поколения»), 162–163, 169 (STOP: не подменять PostgreSQL-физикой, 2PC, ledger или маркером), 250–253. Правила «максимально использовать CDDA» в плане нет, только ссылка на Reuse_Strategy (строка 318). Коммиты плана: 0d5c2c7b1 (19:15 MSK), 1a4bb30bf (19:29 MSK); во втором добавлены сценарии отказа записи, заполнения диска, незавершённых временных файлов, сохранения текущего и предыдущего поколения; убраны новые hashes/fingerprints.
- Reuse_Strategy (коммит 77743459f, 2026-10-18 14:01) сам требует ранний P4-gate: общие поколения, operation identity, повтор операций (строки 63, 74), и признаёт «не доказан общий durable checkpoint» (строка 50). То есть источник per-op слоя есть и в самой Reuse_Strategy.
- Boyle (plan_review, стр. 226 его лога) читал 12 PR-документов, включая Reuse; вывод — ужесточить план (стр. 265 MAIN, «План усилен» 16:28Z).
- Locke (persistence_seam, стр. 188): родное сохранение рассмотрено как «нельзя полагаться», предложены поколения. Autosave упомянут только в rg/git grep (стр. 50, 106: `src/autosave.cpp`), вывода про autosave не найдено. Искал слова autosave, AUTOSAVE, quicksave, game::save, Reuse_Strategy, 754, «родн», native save в логах MAIN, Boyle, Locke, Wegener.
- Возражений против per-op durability не найдено ни в одном логе: исполнял и усиливал. Владелец вмешивался три раза: 16:21Z (задание), 23:40Z (публикация отчёта в PR, стр. 7031), 00:36Z (стр. 7767, новый режим, стоп). Остальное время работала автоматическая goal-continuation (стр. 449 thread_goal 16:34Z; стр. 3027–3030 инъекция после 20:03:44Z).
- Независимая проверка: `codex-direct/save-mechanism-verdict.md` подтверждает, что родное сохранение есть (game_io.cpp:734, 891, 941; do_turn.cpp:607-612) и что слой строился по требованию Плана.

## 4. Токены (дедуп по response_id; MAIN отдельно от субагентов)

Сверка: последний кумулятивный `thread_token_usage` MAIN = 123 082 378 против суммы 122 987 863 (расхождение 0.08%). Поле «Tokens used: 2943683» из goal-инъекции (стр. 3030) с суммами не сошлось, смысл поля не установлен.

| Часть | вызовов | input | cached | output | reasoning | total |
|---|---|---|---|---|---|---|
| MAIN (astra ultra) | 1072 | 122.5M | 119.7M | 0.50M | 0.21M | 123.0M |
| 79 субагентов | 6862 | 708.0M | 696.3M | 3.02M | 1.46M | 711.0M |
| Всего | 7934 | 830.4M | 816.0M | 3.52M | 1.67M | 834.0M |

Новый (некэшированный) input всего 14.5M.

По фазам (UTC; total, M):

| Фаза | MAIN | субагенты | всего |
|---|---|---|---|
| 16:21–18:30 (аудит, план, P3) | 34.7 | 122.8 | 157.5 |
| 18:30–20:03:44 (компакт, P4 негатив, конец хода 1) | 11.5 | 30.0 | 41.5 |
| 20:03:44–23:40 (goal-continuation, без владельца) | 52.7 | 400.0 | 452.7 |
| 23:40–00:36 (отчёт в PR) | 9.9 | 74.6 | 84.5 |
| 00:36–01:27 (новый режим) | 2.0 | 2.6 | 4.6 |
| 01:27–конец (задание 01) | 12.2 | 81.0 | 93.2 |

По датам: 18.10 UTC 677.7M, 19.10 UTC 156.2M. 54% (452.7M) ушло в окне 20:03–23:40Z, когда владелец не вмешивался.

Слой сохранения/P4 (узкий набор, 17 агентов: p4_*, recovery_preload*, persistence_seam, recovery_native_integrate, recovery_coordinator, p3_p4_join_*): 205.4M, 25% от общего и 29% от субагентов. Крупнейшие: McClintock (native_integrate) 57.5M, James (p4_generation_coordinator) 33.6M, Epicurus (p3_p4_join_implementation) 31.1M, Laplace (p4_native_probe) 22.9M, Harvey (preload_v2) 14.2M, Banach (recovery_coordinator) 10.4M. Широкий набор (26 агентов, добавлены recovery_uid/rng/identity и др.): 288.4M, 35%. Доля MAIN в слое по темам не разнесена. Остальные 53 агента (p3, task01): 422.6M; крупнейшие Hilbert p3_native_build_preflight 46.6M, Mencius task01_native_smoke 31.1M.

## Не найдено
- Тексты заданий субагентам (зашифрованы).
- Рассуждения MAIN о выборе поколений против родного save (reasoning зашифрован, видимых commentary с таким выбором нет).
- Счёт коммитов git log по `tools/cataclysm-prototype`.
- Смысл «Tokens used: 2943683».
