# Разведка родных механизмов CDDA для частей 3–5 пилота
> Движок: CDDA.
> Даты: 2026-11-03 — 2026-11-03.
> Источник отчёта: итогового отчёта нет, собран по материалам.

## Вопрос

Какие родные механизмы CDDA подходят для гумна и овина, сенокоса и выгона, а также опушки у деревни; где требуется отдельный объект или размещение.

## Метод

Сопоставлены сохранённые задания частей 3, 4 и 5, встроенные в них таблицы разведки, ссылки на исходники CDDA и текущие файлы мода; противоречия сверены с ответами распорядителя по частям. Новых запусков игры, моделей, проб или замеров не проводили.

## Ход

В разведке пилот разбили на три независимые части и для каждого объекта проверяли родной тип, механизм размещения, сезонное состояние и наличие в текущем моде. Сохранённые задания собрали источники и результаты разведки, а ответ распорядителя закрепил решения по спорным объектам: следам у овина, пастуху, изгороди, стогу и многолетнему состоянию лядины. Самостоятельного общего итогового отчёта в доступных материалах нет.

## Результаты

Для части «Гумно и овин» сохранённая опись содержит 33 объекта и 272 условных последствия; в пилоте требовались земляной ток, сухая площадка, овин с топочной ямой, колосниками и снопами. Каталог привязывал гумно к C1832, овин к C2665, а снопы к C1571 (`/srv/novgorod-work/worktrees/draft-parts/out/task-part3.md:69`). Здания предлагается собирать родной вложенной генерацией M09/M10 и мебелью M12. Для дыма указаны родные `fd_fire` и `fd_smoke`, `emissions` мебели и ключ `fields` карты; колосники и топочную яму предлагалось делать через `copy-from` ближайших родных объектов. Не меньше 4 новых примет на первой сцене гумна — критерий последующей проверки, не подтверждённый этим исследовательским итогом (`/srv/novgorod-work/worktrees/draft-parts/out/task-part3.md:66`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part3.md:67`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part3.md:68`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part3.md:70`). Объём описи и последствия указаны в задании части 3 (`/srv/novgorod-work/worktrees/draft-parts/out/task-part3.md:475`).

Для сенокоса и выгона разведка зафиксировала 10 объектов: шесть «как есть», три на основе `copy-from` и один «новый». Для покошенного луга и выгона уже имелись карты с родным `t_grass`; скот размещался через родной `place_monsters` с ID коровы, овцы и лошади; стог опирался на родную мебель `f_hay`, а сено — на `straw_pile`. В каталоге это стог C2901, сено C2135, корова C0064, овца C0081, лошадь C0073 и спорный пастух C0294 (`/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:58`). Результаты описывают поверхность и сезонное состояние, но сами по себе не доказывают гарантированное появление объектов на нужном участке (`/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:56`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:57`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:67`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:71`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:73`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:74`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:75`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:76`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:77`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md:78`).

Для опушки реестр включает 17 объектов: 10 «как есть», пять через `copy-from`, два новых. Родные кандидаты включают `mx_clearcut`, пни `t_stump`, стволы `t_trunk`, ягодные extras, лесные тропы, штабели брёвен и предметы `log` и `firewood`. Два объекта без родной готовой записи — подсека C3442 и зарастающая лядина C3438; готового представления для них в проверенных данных не нашли; в первоначальном разведочном предложении для них указывалась отдельная карта mapgen (`/srv/novgorod-work/worktrees/draft-parts/out/task-part5.md:64`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part5.md:65`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part5.md:66`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part5.md:75`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part5.md:91`; `/srv/novgorod-work/worktrees/draft-parts/out/task-part5.md:92`).

Поздний ответ распорядителя уточнил, что лядина в пилоте показывает состояние на 20 августа 1230 года, без многолетней смены и `transforms_into`: участок ставится как зарастающая вырубка с родным подростом и травами. Тот же ответ оставляет следы у овина за пределами части до отдельного решения, исключает пастуха из части, связывает изгородь поля и выгона с уже создаваемым объектом, а для стога предписывает сначала сверить родное имя и описание `f_hay` ([draft-parts-answers-1.md](draft-parts-answers-1.md):2; [draft-parts-answers-1.md](draft-parts-answers-1.md):3; [draft-parts-answers-1.md](draft-parts-answers-1.md):4; [draft-parts-answers-1.md](draft-parts-answers-1.md):5; [draft-parts-answers-1.md](draft-parts-answers-1.md):6). Критерий не менее 4 новых примет на первой сцене опушки также остался требованием будущей проверки, а не подтверждённым результатом (`/srv/novgorod-work/worktrees/draft-parts/out/task-part5.md:67`).

## Выводы

Материалы находят родные механизмы для большинства повторяющихся объектов и способов размещения: mapgen, мебель, террейны, существа, полевые предметы и ягодные extras. Для отдельных исторических объектов — гумна, овина, части сушильной установки, подсеки и лядины — готового точного представления не обнаружили; задания предлагают описывать их через родные механизмы CDDA, а не вводить новый механизм движка. Поздние решения распорядителя ограничили состав частей и уточнили статичное состояние лядины.

## Решения владельца

- D38: записи включаются по существованию и не удаляются лишь потому, что объект сложно поставить; найдено в [owner-decisions-d51.md](owner-decisions-d51.md):17.
- D39: Мастер-архив Novgorod1230_MASTER_ARCHIVE_v1 разрешено использовать как черновой источник для обоснования logical_necessity; цены из него следует считать модельными. Источник: `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/inclusion-by-existence-not-usefulness.md:18`.
- D40: Включать в игру всё, что существует в мире или должно существовать по логике реальности; предполагаемая полезность не является основанием для исключения. Исключать можно анахронизмы, физически невозможное и дубликаты; противоречия следует исправлять, а не удалять, и чужеземные вещи не исключать, поскольку их могли привезти. Источник: `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/inclusion-by-existence-not-usefulness.md:11-14`.
- D385: список природы r2 был принят, после чего владелец поручил подготовить карточку пилота (`in/local/memory/owner-decisions-index.md:223`).
- D296: животное должно быть отдельным существом CDDA; «стайка» допустима только как экранное представление (`in/local/memory/owner-decisions-index.md:133`).
- D372: признаки жизни и работы нужны, но следы зверей и людей вынесены в отдельное решение и до него не входят в часть (`in/local/memory/owner-decisions-index.md:210`).
- D389: сначала детализируется текущий двор, а соседние дворы откладываются (`in/local/memory/owner-decisions-index.md:227`).
- D390: порядок пилота — природный слой, поле, гумно и овин, сенокос и выгон, опушка, затем проза и диалоги (`in/local/memory/owner-decisions-index.md:228`).
- D392: для работы по Novgorod предусмотрено распределение независимых задач между исполнителями с промежуточным и итоговым чтением (`in/local/memory/owner-decisions-index.md:230`).
- D393: окончательную приёмку выполняет распорядитель, автор себя не утверждает (`in/local/memory/owner-decisions-index.md:231`).
- D411: независимые задачи запускаются параллельно, задачи разбиваются между Codex и Cursor, а ресурсы servak используются для ускорения работы (`in/local/memory/owner-decisions-index.md:246`).

## Ограничения

Единого итогового отчёта по трём частям нет. Задания содержат результат разведки и планируемые критерии, но не подтверждают окончательную сборку пилота. В частности, для гумна и опушки требование о четырёх новых приметах не представлено как проверенный результат; статус частей после этих сохранённых заданий не устанавливался. Три файла task-part превышают лимит копирования малых артефактов, поэтому в репозиторий они не перенесены; их точные пути, размеры и SHA-256 находятся в таблице материалов.

## Материалы

| путь | размер в байтах | SHA-256 | что это |
|---|---|---|---|
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct/land1230/draft-parts/draft-parts-answers-1.md` | 2928 | 46a0a658a2369a3a7f90b1c524bb8c15634c5a46023e107e2c4845bad68d1f8c | Сохранённые решения распорядителя по спорным объектам; копия без изменений. |
| `/srv/novgorod-work/worktrees/draft-parts/out/task-part3.md` | 237217 | 69dc16ade69ad1a286fe945f8a60baf32fae08d44bdff97df3ccb6d361513a5d | Сохранённое задание и материалы разведки части 3; превышает лимит копирования. |
| `/srv/novgorod-work/worktrees/draft-parts/out/task-part4.md` | 188644 | 1ec391fdc7b3664e2235272b78505a2ee02ca28c3afe6a74948c6c6b86f331b1 | Сохранённое задание и материалы разведки части 4; превышает лимит копирования. |
| `/srv/novgorod-work/worktrees/draft-parts/out/task-part5.md` | 710569 | a7dfe6f290e818fd7233408c49f8ea0be466dbdb67b2b309b6989df7cc0499f8 | Сохранённое задание и материалы разведки части 5; превышает лимит копирования. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-index.md` | 158935 | 9a59e78410f86d25fbab77233f6fc78553b71944a9079d06c07772647cb2715e | Индекс решений владельца; превышает лимит копирования, приведены ссылки на строки. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/owner-decisions-d51.md` | 4272 | 41871203b850ad4a9365b3567a1965675439e018e4d79ef92ed67b043b28520d | Запись решения D38; копия без изменений. |
| `C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/memory/inclusion-by-existence-not-usefulness.md` | 2873 | 9888fbfb43be7d6b10ee63381355dd03f9a913e969ac84b34c30584cb8d9a1a8 | Текст решения владельца; неизменённая копия — inclusion-by-existence-not-usefulness.md. |
