# Запуск родных native probes CDDA (CI783)
> Движок: CDDA.
> Даты: 2026-10-22 — 2026-10-22.
> Источник отчёта: codex-direct/part1/ci783/REPORT-PROBES.md

## Вопрос

Как запускать специальные native probes CDDA и чем их запуск отличается от обычных тестов с тегами?

## Метод

Отчёты описывают рецепт запусков по исходному коду CDDA и результаты нескольких уже выполненных сборок и тестовых команд на servak. Материал включает разбор протокола для semantic, persistence и RNG probes, отдельный замер сборки, журнал запуска live-тестов, попытку найти связанные issue и выписку исходников. Основной отчёт о probes прямо указывает, что он содержит рецепт, а не новый прогон; новых запусков в рамках этой сводки не проводилось ([source-report.md](source-report.md):3; [source-report-servak.md](source-report-servak.md):5; [source-report-measure.md](source-report-measure.md):3).

## Ход

Сначала источники зафиксировали подготовку чистого upstream-дерева, оверлеев и test sources, затем запуск сборки и обычных тегов на сервере. Отдельный отчёт собрал точные режимы и файлы для protocol probes; другие отчёты описали независимый замер холодной и тёплой сборки, падения live-тестов и ограничения проверки issue через GitHub ([source-report-source.md](source-report-source.md):7; [source-report-servak.md](source-report-servak.md):3; [source-report-measure.md](source-report-measure.md):3; [source-report-issues.md](source-report-issues.md):3).

## Результаты

Semantic probe помечен обычным тегом, но нуждается в двухэтапном сценарии: сначала режим `create` создаёт fixture и observation, затем в том же userdir готовят файл запроса и запускают режим `apply`; для чтения результата используется точное имя теста. При отсутствии request-файла тест не проходит, а запуск только широкого тега попадает в ветку применения с пустым режимом ([source-report.md](source-report.md):7).

Persistence probe скрыт обычным запуском тегов. Его протокол проходит через `init`, `apply` и `read` с тем же userdir; для проверки отказов предусмотрен отдельный `suite`. RNG-state probe содержит случаи, которые без специальных переменных окружения завершаются успешно, не проверяя отказ; ветви загрузки требуют отдельных копий подготовленного сохранения, поскольку меняют или удаляют sidecar-файл ([source-report.md](source-report.md):8; [source-report.md](source-report.md):9). Отчёт рекомендует отделять эти протокольные пробы от обычного списка CI и отдельно измерить полный suite с реальными прерываниями, повторной загрузкой и `/dev/full` ([source-report.md](source-report.md):11).

В серверном отчёте указана успешная сборка `native-head` за 272,34 с при максимальной RSS 1 932 444 КБ ([source-report-servak.md](source-report-servak.md):5). При запуске тега `[novgorod_live]` зафиксировали 27 случаев: 19 прошли, 8 упали; проверка сообщила 1977/1996 утверждений ([source-report-servak.md](source-report-servak.md):16). Теги `[novgorod_slice]` и `[novgorod_item_uid]` завершились успешно ([source-report-servak.md](source-report-servak.md):13; [source-report-servak.md](source-report-servak.md):14). Успешно завершились также `[novgorod_rng_state]`, `[novgorod_delivery]` и оба варианта autosave ([source-report-servak.md](source-report-servak.md):19; [source-report-servak.md](source-report-servak.md):20; [source-report-servak.md](source-report-servak.md):21; [source-report-servak.md](source-report-servak.md):22). Semantic и persistence-теги без подготовки ожидаемого режима или request завершились ошибкой ([source-report-servak.md](source-report-servak.md):15; [source-report-servak.md](source-report-servak.md):18). Обычный autosave-тег, включавший два медленных случая, занял 335,96 с; отдельный slow-фильтр — 336,23 с ([source-report-servak.md](source-report-servak.md):17; [source-report-servak.md](source-report-servak.md):22). Отдельный JUnit-запуск `[novgorod_live]` занял 60,48 с и сообщил 1996 тестов, 10 failures и 9 errors; в XML было 11 строк testcase с ошибками из-за SECTION при восьми именах упавших случаев ([source-report-servak.md](source-report-servak.md):24).

Отдельный замер холодной сборки был прерван извне примерно через 19 мин 35 с. Продолжение без очистки завершилось за 106,61 с с кодом 0; тёплый повтор занял 1,14 с и не перестраивал тесты. Суммарное время активных частей холодной сборки оценено примерно в 21 мин 22 с с указанной в источнике погрешностью ([source-report-measure.md](source-report-measure.md):11; [source-report-measure.md](source-report-measure.md):12; [source-report-measure.md](source-report-measure.md):13; [source-report-measure.md](source-report-measure.md):14). После сборки дерево занимало 725 491 068 байт, а 785 объектных файлов — 221 988 848 байт; `ccache` отсутствовал, поэтому размер его кэша и повторная сборка с попаданиями не измерялись ([source-report-measure.md](source-report-measure.md):16).

Отчёт о поиске issue описывает отдельный запуск: 25 случаев, 17 успешных, 8 упавших и 19 неуспешных проверок. Запросы к GitHub завершились ответом HTTP 401, поэтому наличие или отсутствие соответствующих issue осталось непроверенным; issue не создавались и не комментировались ([source-report-issues.md](source-report-issues.md):3; [source-report-issues.md](source-report-issues.md):24). Эти числа относятся к отдельному журналу и не объединяются с серверной серией, где зафиксированы 27 случаев ([source-report-issues.md](source-report-issues.md):3; [source-report-servak.md](source-report-servak.md):16).

В выписке исходников указано, что обычный рецепт копирования test sources не включает `novgorod_autosave_test.cpp`, хотя дополнительный файл упомянут в отчёте FIX-04d. Она также отмечает, что README сам по себе не подтверждает успех GCC/make-сборки и что включение тестов `[slow]` требует отдельного замера ([source-report-source.md](source-report-source.md):7; [source-report-source.md](source-report-source.md):9; [source-report-source.md](source-report-source.md):10).

## Выводы

Отчёты указывают, что для semantic, persistence и RNG probes недостаточно выбрать широкий тег: им нужны согласованные режимы, входные файлы, сохранённое состояние и отдельные каталоги. Поэтому protocol probes следует запускать отдельно от обычного списка CI, а решение о включении более длинного suite принимать после замера ([source-report.md](source-report.md):7; [source-report.md](source-report.md):8; [source-report.md](source-report.md):9; [source-report.md](source-report.md):11).

## Решения владельца

Выписка исходников ссылается на решения о сохранении и тестовом preload; отдельного решения владельца по итогам CI783 в материалах не зафиксировано.

- D215: владелец выбрал тёплый preload host A+B в штатном режиме, с распределением запуска таймеров на 11,8 секунды и временем запуска и восстановления не более 20 секунд. В продакшене сохранение выполняется по запросу игрока и автоматически каждый игровой час; сохранение каждого хода оставлено только для отладки. План среза следовало затем исправить по указанным основным пунктам (`C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md:62`).
- D216: владелец решил заморозить тёплый host, не развивать его дальше, снять ограничение бюджета в пять секунд на операцию и оставить этот код только ускорителем тестового стенда; это заменило вариант A+B из D215. При аварии следует восстановить последнее целое сохранение, не более чем на час игры назад, и сообщить игроку момент восстановления. Сохранение каждого хода нужно только для отладки (`C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md:61`).
- D219: владелец оставил родное автосохранение CDDA: `AUTOSAVE=true`, игровой интервал 3600 ходов и не чаще одного раза за пять реальных минут, без отдельного часового триггера. Диапазон параметра игрового часа требовалось расширить; поколение принимается в конце `game::save()`, через который проходят ручное сохранение, quicksave и autosave (`C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md:58).

## Ограничения

Показатели относятся к разным каталогам, версиям дерева и запускам. В отчёте поиска issue отдельно сказано, что GitHub не подтвердил наличие или отсутствие issue; серверный отчёт фиксирует иные тестовые результаты. Первый холодный замер был прерван извне, поэтому его итоговая длительность является оценкой, а тёплый повтор не измеряет полную сборку ([source-report-issues.md](source-report-issues.md):3; [source-report-issues.md](source-report-issues.md):24; [source-report-measure.md](source-report-measure.md):11; [source-report-measure.md](source-report-measure.md):13; [source-report-measure.md](source-report-measure.md):14). Рецепты probes основаны на указанном в исходном отчёте снимке кода и не подтверждают запуск нового прогона ([source-report.md](source-report.md):3).

## Материалы

| путь | размер в байтах | SHA-256 | что это |
|---|---:|---|---|
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/part1/ci783/REPORT-PROBES.md` | 5430 | f59300911c76b74a17eaad3def7d053e679dae7357cef92b8d461b9bc79c00ac | Основной рецепт probes; копия сохранена как `source-report.md`. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/part1/ci783/REPORT-MEASURE.md` | 3162 | 193b736baa977faf08cddb108f1dfe6a1298c03d1da442bbc2fd6d1ef02324f2 | Сводка сборки и замеров на servak. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/part1/ci783/REPORT-ISSUES.md` | 2572 | e7ec520a4b0ef9e0a62fdf9a8fdf346f009266b48a35cd9ecb5dd01f8916bf75 | Результат поиска issue и его ограничение. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/part1/ci783/REPORT-SERVAK.md` | 5480 | 62e1c60cb26a2f0a5e98c79e2be41c6bc99d24cdfa93a13390ce4e3ad1e63be9 | Сборка и тестовые запуски на servak. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/part1/ci783/REPORT-SOURCE.md` | 7825 | aab165c74b6c28f5703d28de4bbe060d15acedb4ab5f93d04b726aa1637f36a5 | Выписка исходников и границ рецепта. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md` | 158935 | 9a59e78410f86d25fbab77233f6fc78553b71944a9079d06c07772647cb2715e | Текущий индекс решений D215, D216 и D219; файл больше допустимого размера копии. |
| `/srv/novgorod-work/scratch/fix04e-ci783` | 8045740409 | каталог | Каталог материалов и журналов CI783; файлов: 133762. |
