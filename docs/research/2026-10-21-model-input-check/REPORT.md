# Вторая версия проверки входа моделей
> Движок: не относится.
> Даты: 2026-10-21 — 2026-11-03.
> Источник отчёта: codex-direct/input-check-v2/REPORT.md, с последующими REPORT-2…6 и REPORT-LINUX*, FIX-false-fail.md, REVIEW-false-fail-codex*.md, REVIEW-goal-r5.md, A-RESUME-4-03.md и JOURNAL.md.

## Вопрос

Ловит ли вторая версия проверки входа искажения пакета модели, в том числе неверные задания, служебные блоки, поля среды и сообщения помощников, и сохраняет ли ожидаемые различия между корректными и повреждёнными входами?

## Метод

Исходный отчёт описывает checker для rollout Codex, оболочку codex-exec.sh и отдельный wire-audit.py. Проверка сопоставляла содержимое сообщений и блоков со схемами и разрешёнными текстами, проверяла задания, историю, происхождение сообщений помощников и журнал запусков. Следующие этапы добавляли красные и зелёные тесты, сравнение сохранённых rollout, замер служебных блоков и отдельные проверки на ПК и servak. Поскольку зашифрованные задания помощников не раскрывались, проверялись открытая оболочка и происхождение, а не сам текст шифротекста. ([source-report.md](source-report.md):7-17,23-31,33-43; [REPORT-2](REPORT-2.md):7,15,37,111-116; [REPORT-LINUX](REPORT-LINUX.md):1,5)

## Ход

Первый отчёт описал расширение checker по rollout, структуре сообщений, потолкам служебных блоков, числу заданий, дереву помощников и выбору rollout. В нём сообщалось о 16 успешных тестах, одной старой нити с ожидаемым FAIL и одной проверенной нити с --children без FAIL (4 rollout); wire-аудит обработал 50 вызовов и выдал WARN для каждой роли. Проверка настоящими new и resume в этот этап не входила. ([source-report.md](source-report.md):7-16,64-79,87-96)

REPORT-2 расширил допуски точными текстами и SHA, проверками структурированной среды, журнала заданий, наследования истории, отпечатка и показателей wire-аудита; он также отделил зашифрованные задания от открытых сообщений. Итоговый набор составил 67 успешных тестов, но настоящие new/resume не запускались. ([REPORT-2](REPORT-2.md):9-11,73-91,111-116)

REPORT-3 добавил шаблоны для динамических строк token-guard, учёт hooks в отпечатке, разбор соседних блоков и границу обязательного журнала. На сохранённых rollout все шесть проверенных нитей дали ожидаемый код; в наборе было 80 успешных тестов. Задания помощников оставались непроверенными по содержимому, а установка и рабочий запуск настоящего Codex не выполнялись. ([REPORT-3](REPORT-3.md):3-13,119-139)

REPORT-4 исправил ещё ряд ложных отказов вокруг истории user, подагентов, environment, world_state, retained_context и происхождения ответов. Его зелёный набор составил 168 тестов. В живом снимке две новые цели получили FAIL только из-за отсутствующего задания в журнале: они были запущены до установки v2. ([REPORT-4](REPORT-4.md):1-15,242-282)

REPORT-5 дал 210 успешных тестов, но его живой sweep не сошёлся: зафиксированы 248 причин класса «а», 17 класса «б» и 2 класса «в»; в последнем проходе изменились 11 файлов, поэтому снимок не считался согласованным. Неразрешённый SHA Skills update оставался блокирующим отказом, а установка не была разрешена. ([REPORT-5](REPORT-5.md):11-12,57-78,88-90,107-112)

После разрешения владельца принять только точный SHA Skills update REPORT-6 получил 215 успешных тестов. В одном проходе sweep классифицировал 248 причин как старые запрещённые Skills-блоки, 20 — как отсутствие записи задания в журнале при запусках вне установленной v2, 0 — как прочее; корней было 21 OK и 23 FAIL. В этой версии установка всё ещё не была выполнена. ([A-RESUME-4-03](A-RESUME-4-03.md):5-22; [REPORT-6](REPORT-6.md):18,44-57)

Малый Linux-круг разрешил отдельные реальные отказы для /tmp и resume, поправил проверку cwd и кодировку TOML. Он сообщил о 270 успешных тестах на ПК и о 269 успешных плюс одном пропущенном тесте на servak; реальный Codex и модель в этом круге не запускались. ([REPORT-LINUX-S](REPORT-LINUX-S.md):1-5,16,30)

Следующий Linux-отчёт зафиксировал предварительную установку в v2 на servak: по 253 успешных теста на ПК и servak, успешные живые probe/new/resume и ожидаемый FAIL для дополнительного developer-текста с неизвестным SHA. Первая попытка resume завершилась кодом 4, поскольку CLI не поддерживал переданный флаг -s; повтор без него прошёл. Первый sweep PC-rollout дал 46 причин класса «б», но после учёта фактического журнала их число стало 1; итоговая разбивка была 248/1/0 по классам а/б/в. ([REPORT-LINUX](REPORT-LINUX.md):5,57-68)

3 ноября владелец разрешил отдельную задачу по трём классам ложных FAIL: #939, #990 и #1005. Отчёт FIX-false-fail.md описывает изменения для сообщения agent_message в replacement_history, контекста продолжения цели и второго блока среды. Первые два промежуточных ревью вернули FAIL, в частности из-за возможности подложить create_goal комментарием и неполного покрытия проверок; последующие круги добавили проверки этих случаев. (C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md:233; [FIX-false-fail.md](FIX-false-fail.md):1-4,19-20,33-39,81-89; [REVIEW-false-fail-codex.md](REVIEW-false-fail-codex.md):1-22; [REVIEW-false-fail-codex-2.md](REVIEW-false-fail-codex-2.md):1-29)

## Результаты

После разрешённых доработок ложный отказ для проверенной живой цели tracks-988 исчез на двух ходах, но итоговая проверка нити всё ещё была FAIL из-за несоответствия последнего хода t8 исходному файлу задания. Проверка целиком в OK после этого исправления не выполнена, а установленная копия v2 не была заменена этой последней версией. ([FIX-false-fail.md](FIX-false-fail.md):281-302,313-317)

В круге исправления инструментальных вызовов два живых потока завершились OK, но третий остался с другим, не относящимся к этому кругу FAIL — «неизвестная форма переписки». Отчёт назвал его отдельным issue; сама переписка помощников оставалась зашифрованной и проверялась по происхождению, не по смыслу. ([FIX-false-fail.md](FIX-false-fail.md):191-208)

Последний описанный прогон тестов содержал 409 успешных случаев и один известный сбой Git Bash на Windows; живую проверку после добавления этих тестов не повторяли. ([FIX-false-fail.md](FIX-false-fail.md):348-362)

## Выводы

REPORT-6 сообщает, что рабочая v2 тогда не была установлена, а REPORT-LINUX позднее описывает установку на servak как предварительную. В последнем круге FIX-false-fail.md указано, что действующая копия v2 не заменялась исправлением для tracks-988, а живая проверка после добавления последних тестов не повторялась. ([REPORT-6](REPORT-6.md):57; [REPORT-LINUX](REPORT-LINUX.md):3-5; [FIX-false-fail.md](FIX-false-fail.md):300-302,360-362)

## Решения владельца

D395: владелец разрешил отдельную задачу по трём классам ложных FAIL проверки входа; исполнитель — Sonnet 5.5, сдача ждёт ревью распорядителя. (C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md:233; [FIX-false-fail.md](FIX-false-fail.md):1-3)

## Ограничения

Зашифрованные задания, ответные сообщения и переписка помощников не раскрывались; отчёты проверяют их происхождение и открытую оболочку. Начальные версии не проверяли настоящий Codex через new/resume, а Linux-этапы делали живые вызовы, но фиксировали только предварительную установку. Последний найденный отчёт говорит, что установленная копия не заменена финальной правкой, а live-проверка после последнего тестового дополнения не повторялась. ([source-report.md](source-report.md):87-92; [REPORT-2](REPORT-2.md):111-116; [REPORT-4](REPORT-4.md):344-351; [REPORT-LINUX](REPORT-LINUX.md):3-5,79-82; [FIX-false-fail.md](FIX-false-fail.md):300-303,360-362)

## Материалы

| путь | размер в байтах | SHA-256 | что это |
|---|---:|---|---|
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2 | 56243002745 | каталог | Основная папка материалов, по описи: 19883 файла. Содержимое полностью не копировалось. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REPORT.md | 9247 | c0f31ed43e538280d0cff5d639f2bfe54be2402d2b6f518b6279327223d22904 | Первый отчёт; скопирован без изменений как source-report.md. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REPORT-2.md | 34885 | 370bed5ae3e00779903dd7d68aff6f374c39bb150e6ed998d1368f8acefdcaf2 | Второй отчёт; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REPORT-3.md | 29534 | af2ba71bd27ca3cbb172d24a073f7aa1606ded07ecd019a149033b1e9e8064da | Третий отчёт; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REPORT-4.md | 55014 | 12fdcd36fe485c3d4a429aba5f7aac11df154b605a10b08e9136f7c4847735fd | Четвёртый отчёт; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REPORT-5.md | 15737 | afb366087d88b7fd74e3af99f8a6d183a160626deb2d84ceba57bfeb74c35efa | Пятый отчёт; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REPORT-6.md | 9889 | 7a9d1f61763590c0ae5685a158b9601b2aca27ffdcdb7c490cc0a51f12831360 | Шестой отчёт; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REPORT-LINUX-S.md | 8394 | b7782a13a655f4a2649369a1d909d6ca017cdfe22c613b06aeeb036d4577de84 | Отчёт малого Linux-круга; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REPORT-LINUX.md | 19373 | cf1ebebcba28aa1e85b36de7d4d838758b6585421fd32aa1e008b18bcdd47d06 | Отчёт о проверке на servak; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/FIX-false-fail.md | 57466 | 00a605f9812a8cfdd8941d673e9993ed25f8737dbe6ef180886f08a4809d4cf3 | Отчёт исправлений ложных FAIL после D395; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REVIEW-false-fail-codex.md | 5684 | 8a78ad2cbc57153f45dc1bef481fa533f8d5ae21faa72f19584a807afa119267 | Первое промежуточное ревью; скопировано без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REVIEW-false-fail-codex-2.md | 6377 | 9013681e62f6732949bd5a6c0bcf77fea9d53bc36ac0d3b59e8ee14107a1e77a | Второе промежуточное ревью; скопировано без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/REVIEW-goal-r5.md | 6482 | 654a16bed351432ad30b34d0dae701789cb729c5871ef7a219fbb267b920ca1c | Ревью тестовых границ, отражено в FIX-false-fail.md; скопировано без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/JOURNAL.md | 1660 | 33f750308cf9e882a65f63e6029aa5ea9067bd4d7c05b1f5c673c163a7f035c0 | Журнал последовательности промежуточных ревью; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/input-check-v2/A-RESUME-4-03.md | 5346 | e3d4b66cda3f56310895ebe2e9255c63dcefa498ccda26cff986a347bc389eb0 | Ответ владельца о точном SHA Skills update и формате sweep; скопирован без изменений. |
| C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md | 158935 | 9a59e78410f86d25fbab77233f6fc78553b71944a9079d06c07772647cb2715e | Реестр D395; размер превышает лимит малого артефакта и не копировался. |
