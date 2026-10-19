# Задание 03 — шаги 0–1 и СТОП перед кодом

Дата: 2026-10-19. Draft PR [#770](https://github.com/PavelSlaven/Novgorod1230/pull/770). Исходный HEAD `6623132fc`; merge-коммит `dfd248ea282159520230add0d3818ae410a59e58` отправлен в origin. Шаги 2–7, интерактивная dev-проба и Qwen bench **не начаты**: ожидается OK распорядителя на [план исполнителя](TASK03-PLAN.md).

## Шаг 0 — main влит механически

`origin/main` при fetch — `8702d5d28`, PR #775. Карта #778 ещё не вошла; использована внешняя карта из задания. `git merge --no-commit origin/main`, затем обычный merge commit без rebase. Конфликты только `CHANGELOG.md` и `generated/generated-manifest.json`: обе записи changelog сохранены, прежний неверный P4 PASS не восстановлен; generated manifest создан `npm run docs:generate`.

Защищённые AGENTS/CONTRACT_INDEX и связанные knowledge-generated изменения импортированы из утверждённого main без ручной правки. `docs:generate`, `docs:check`, `knowledge:check`, staged diff-check — exit 0 до merge commit. Логи — [merge checks](evidence/task03-checks/). Первый fetch вызвал ошибки автоматической очистки stale shared git worktree registrations (`Permission denied`); повтор выполнен с `gc.auto=0`, `maintenance.auto=false`, `--no-auto-maintenance`. Ручная очистка shared git metadata не выполнялась.

## Шаг 1 — ext4, штатный native cache

Root измерения `/home/slaven/cataclysm-recovery/task03-ext4-20261019-m3/`; `data`, `gfx`, `userdir`, binary, cache и temp физически на ext4 (`findmnt`: `/dev/sdd`, mount `/`). `data/gfx` — обычные файлы внутри runtime, не ссылки на `/mnt/c`. Это специальный ext4 scope, прямо заданный M3; остальные записи — в worktree.

Тот же diagnostic binary, SHA-256 `2e665836e5ff7656b8b5338e382cfcfc60eadfa7e700113d956665c8da0c46ff`; сборка/игровой код не менялись. Для замера использована копия measure.py только с путями и списком `cold-read + 3 warm-read`; старый tracked measure.py неизменён. Fixture save скопирован, создание мира в замер не входит. `active_mod_order`: `dda`, `test_data`, без изменений.

Cold: новый процесс, `data/cache` и `userdir/cache` отсутствовали. Warm: новые процессы с cache первого запуска. После четырёх reads `data/cache`: 3464 файла, 42 МиБ. Системный page cache не сбрасывался; копирование могло его прогреть. Это не p95 и не измерение после отключения питания.

| Фаза, секунды | Cold | Warm 1 | Warm 2 | Warm 3 |
| --- | ---: | ---: | ---: | ---: |
| Полный процесс | **20,028** | 15,305 | 14,756 | 15,404 |
| setup, включая моды | 19,231 | 13,599 | 14,130 | 13,606 |
| load_world_modfiles | 19,211 | 13,594 | 14,117 | 13,602 |
| ↳ load_packs | 7,080 | 1,444 | 1,816 | 1,359 |
| ↳ finalize | 12,131 | 12,150 | 12,301 | 12,243 |
| ↳ ↳ consistency | 4,444 | 5,498 | 4,509 | 5,439 |
| Загрузка native save после setup | 0,314 | 0,912 | 0,301 | 1,005 |

Вложенные строки не складываются с родителями. Все четыре exit 0; phase/count/nesting assertions PASS. **Cold превышает ≤20 с на 0,028 с**; округлением или warm результатами это не превращается в PASS. Старые 64,9–68,8 с на `/mnt/c` не выдаются за результат D216 на ext4.

[Полная методика, команды и сырые измерения](evidence/task03-ext4/REPORT.md). `TESTING DATA` pack отдельно занял cold 0,086 с, warm 0,047–0,053 с. Поэтому исключение только его pack не даёт доказанного запаса; возможное уменьшение finalize требует отдельного замера.

После OK предлагается ветка M3 в шаге 2: новый игровой профиль core + необходимые моды, проверка зависимости сцены от test_data; затем повторное измерение и разбор finalize/consistency. Не менять набор модов старого save молча. Сейчас оптимизации, свой cache, warm host, изменение модов/проверок не выполнялись.

## План и вопросы для OK

[TASK03-PLAN.md](TASK03-PLAN.md) содержит дословные M1–M3 и обязательный охват, таблицу файлов/проверок шагов 2–7, M1 «проверено и отклонено», source inventory. Рекомендуется родной action registry + `string_input_popup`, один resident Node semantic coordinator по AF_UNIX; CDDA единственный writer userdir. Это **предложенный новый transport при выявленном gap**, не готовый CDDA API и не уже реализованный игровой путь.

Для речи найден native event `character_finished_activity` с canceled: отдельный scheduler ради уведомления конца не нужен. Связку ACT_WAIT → event/EOC → точная реплика, cancel/save/reload и частичную речь требуется проверить после OK. Не подменять это немедленным `npc::say`.

M2 нуждается в уточнении счётчиков: буквальное равенство всех входов save и попыток приёма соседствует с hook только после успеха и ранними dirty/false. Предложение: успешные native записи = попытки приёма; dirty/false учитываются отдельно в тесте, без принятия/изменения current. Дословная норма сохранена в плане, трактовка не реализована.

#771: прочитан разбор распорядителя; alias/backend одной модели будет разрешён узко в wire check после OK. #773: fake LLM сначала, ровно 2 вызова при двух плохих ответах; затем общий максимум 30 реальных вызовов по заданию 03, включая repairs. Сейчас модельных/внешних API вызовов нет. Sealed, Docker, слияния PR в main, CR к нормам, minor cleanup не выполнялись.

Автоматическая проверка отклонила удаление диагностического `__pycache__` с причиной `blocked by policy`; он оставлен вне коммита, обхода не было. Измерительный ext4 root сохранён для воспроизведения и следующего согласованного шага; это не userdir владельца.
