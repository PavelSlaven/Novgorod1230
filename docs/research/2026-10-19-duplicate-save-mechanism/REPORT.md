# Почему Codex построил второй механизм сохранения
> Движок: старый (v17, integ-98).
> Даты: 2026-10-19 — 2026-10-19.
> Источник отчёта: codex-direct/why-dup/why-duplicate-mechanisms.md

## Вопрос

Почему при работе над CDDA-срезом появился второй механизм сохранения поверх родного и почему ревью и приёмка не остановили его раньше владельца?

## Метод

Итоговая сводка объединяет этапы анализа происхождения плана, применимости норм старого движка, исходного задания, логов Codex, критериев наших проверок и скептической перепроверки. Авторы изучали документы и сохранённые логи, сопоставляли формулировки Плана, Стратегии reuse и аудита; новых прогонов и изменений кода не выполняли ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):3, [2-norms-origin.md](2-norms-origin.md):1, [4-codex-forensics.md](4-codex-forensics.md):1).

## Ход

Аудит сформулировал гипотезу общего сохранения с поколениями и списком исполненных операций ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):28). Затем появились Стратегия reuse и план вертикального среза ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):29, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):31), после чего исполнитель уточнил план и начал P4 ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):33, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):35). Самостоятельная проверка Claude и приёмка состоялись после слияния реализации ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):36, [5-our-checks.md](5-our-checks.md):31). Позднее вопрос владельца привёл к фиксации правила reuse и решения о заморозке тёплого host ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):37).

## Результаты

Итоговая сводка сообщает, что 78 из 79 помощников работали на luna medium, но направление с поколениями и operation ID уже находилось в плане до их работы; решение о реализации и P4 утвердил основной исполнитель astra ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):7). В последующей перепроверке исправлено противоречивое утверждение раннего этапа: stage 1 сначала писал, что основной исполнитель прочитал Стратегию reuse ([1-plan-provenance.md](1-plan-provenance.md):31), тогда как stage 4 и stage 7 не нашли следов её открытия и отметили прежнюю формулировку как опровергнутую ([4-codex-forensics.md](4-codex-forensics.md):6, [7-skeptic.md](7-skeptic.md):58).

План задал идею согласованного полного поколения и сверки `operation_id` после аварии, но не задавал сохранение отдельного поколения после каждого действия, процесс на действие или тёплый host ([1-plan-provenance.md](1-plan-provenance.md):10, [1-plan-provenance.md](1-plan-provenance.md):70). Поздняя скептическая перепроверка уточняет, что план допускал трактовку «после каждой операции», но прямо её не требовал ([7-skeptic.md](7-skeptic.md):30, [7-skeptic.md](7-skeptic.md):31). Итоговая сводка исправляет прежний категоричный пересказ, согласно которому Codex выполнил план в точности ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):39).

Разбор норм заключает, что действующие принципы требовали не переписывать принятый мир и не повторять эффект при save/load/retry, но не требовали записи на диск после каждого хода ([2-norms-origin.md](2-norms-origin.md):7, [2-norms-origin.md](2-norms-origin.md):8, [2-norms-origin.md](2-norms-origin.md):64). Транзакционный commit на корневой ход и публикация прозы после сохранённого пакета относились к старому стеку с PostgreSQL и не переносились буквально на CDDA; именно механика старого стека прошла через аудит и документы плана ([2-norms-origin.md](2-norms-origin.md):9, [2-norms-origin.md](2-norms-origin.md):84).

Проверяющие сверяли реализацию с планом и гейтами P4, а не сам план с правилом владельца ([5-our-checks.md](5-our-checks.md):5). В брифе приёмки не было требования найти родной механизм той же ответственности; отсутствие анализа `game::save()` и autosave заметили как дополнение к матрице, а не как повод остановить дублирующий слой ([5-our-checks.md](5-our-checks.md):16, [5-our-checks.md](5-our-checks.md):22). Независимая проверка плана до начала работ в сохранённых материалах не найдена ([5-our-checks.md](5-our-checks.md):31, [5-our-checks.md](5-our-checks.md):38).

В отчёте указано **834M** токенов за сессию; около **205M** отнесено к узкому слою P4, а широкий подсчёт даёт **288M** ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):43, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):44). Авторы оценили расход на отладочную или замороженную работу в диапазоне от **~70M до ~200M из 834M**, или 9–25%; точнее распределить токены по полезному и лишнему коду они не смогли ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):47). Оценка ответственности в той же сводке распределена примерно так: план и Стратегия — 35%, основной исполнитель — 35%, Luna — 10%, распорядитель и приёмка — 20%; авторы прямо называют это оценкой, а не измерением ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):53, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):54, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):55, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):56).

## Выводы

Итог источников: дубль возник из сочетания рамки плана, не превратившего reuse-first в проверяемый критерий, пропуска проверки родного save до проектирования, самопроверки внутри одного корня и выбора исполнителя развить поколение на каждое действие. Luna увеличила объём реализации, но не задала исходное направление ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):53, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):54, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):55, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):56). Суммирующая сводка рекомендует проверять план до исполнения, требовать объяснения, почему родной механизм не подходит, не принимать самовведённые бюджеты и останавливать работу при конфликте плана с правилом владельца ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):65, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):67, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):69, [7-skeptic.md](7-skeptic.md):78).

## Решения владельца

D215: сохранение в производственной игре — по запросу игрока и автоматически раз в игровой час; запись после каждого хода избыточна и нужна только для отладки. Первоначально владелец также принял вариант «А+Б» для тёплого host. Путь к крупному внешнему индексу решения: `memory/owner-decisions-index.md:62`.

D216: тёплый host заморозить, не развивать как production-механизм и оставить только ускорителем тестового стенда; после аварии принимать откат к последнему целому сохранению и показывать игроку, на какой момент восстановлен мир. Эта запись заменила вариант «А+Б» из D215. Путь к крупному внешнему индексу решения: `memory/owner-decisions-index.md:61`.

## Ограничения

Тексты заданий помощников и часть рассуждений Codex были зашифрованы, а отдельный файл `6-history.md` отсутствовал ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):3, [7-skeptic.md](7-skeptic.md):66). Авторы не смогли точно распределить токены по темам, часть чисел по помощникам не перепроверялась, а доли ответственности и диапазон лишнего расхода являются оценками ([why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):47, [why-duplicate-mechanisms.md](why-duplicate-mechanisms.md):60). Ранние документы расходятся в том, открывал ли основной исполнитель Стратегию reuse; stage 7 позднее отверг прежнее утверждение об открытии ([7-skeptic.md](7-skeptic.md):58, [7-skeptic.md](7-skeptic.md):60).

## Материалы

| путь | размер в байтах | SHA-256 | что это |
|---|---|---|---|
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/why-dup/why-duplicate-mechanisms.md` | 21552 | 630aaf86f255c9ed2ff4d80d5e7cf6fcf4710f6f8b7657657d0035303ecf4391 | Итоговая сводка по причинам, хронологии, расходу, ограничениям и предложениям. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/why-dup` | 124672 | каталог | файлов: 7; итоговая сводка и этапы 1–5, 7. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/why-dup/1-plan-provenance.md` | 24944 | cc5df03ec8aef7bb7582f8b5444280f77804a1779b17dbaebf0a5cf495e6b3a0 | Происхождение требований плана и разбор поздней поправки к трактовке. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/why-dup/2-norms-origin.md` | 21167 | 2ecbed172bd8aa1ad3a3decaf6f626056d9c2c6b9f912cc547b9518b457af4ac | Применимость норм и происхождение механики сохранения. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/why-dup/3-tasks-given.md` | 18329 | 7c088f0400813d0dd2a78fb1a435d78e3dfe3bcecb20a51d2f742506d7811a9e | Что именно получил исполнитель и что отсутствовало в задании. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/why-dup/4-codex-forensics.md` | 11475 | 99a6872dbc21c8cf69d27cd8c7298a0a277707f0542df4896965f7a14b208d18 | Роли помощников, авторство слоя, логи и расход токенов. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/why-dup/5-our-checks.md` | 11697 | 140f1d6d29c5b661ae8f4c7de3ed7d381eba5c5bad1638a265d1096866873db6 | Почему проверки не выявили дубль раньше владельца. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/why-dup/6-history.md` | копии на servak нет | копии на servak нет | Не сохранился; источник указывает, что файла нет. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/why-dup/7-skeptic.md` | 15508 | a9804f140d53886165fb5c93598297c2785753ac30c734eb84f3c504c188d7bb | Скептическая перепроверка версий и поправки к ранним утверждениям. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md` | 158935 | 9a59e78410f86d25fbab77233f6fc78553b71944a9079d06c07772647cb2715e | Большой внешний индекс; решения D215 и D216, файл не копировался. |
