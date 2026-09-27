# VERIFICATION — flora-trees-shrubs (game-base-v1)

- **Кто:** независимый verifier-агент (старший проход, не автор), метка `verify-flora-trees-shrubs`.
- **Когда:** 2026-09-26.
- **Что:** `data/world-catalogs/novgorod/game-base-v1/flora-trees-shrubs/` — `flora/*.csv`, `README.md`, `scripts/build.mjs`, `scripts/validate.mjs`, `scripts/src/*`.
- **Данные не правились.** Этот файл — единственное, что записал verifier.

## Итог

| Файл | Строк (скрипт) | README | Вердикт |
|---|---:|---:|---|
| `flora/trees_shrubs.csv` | 37 | 37 | approve_with_limits |
| `flora/tree_habitat_presence.csv` | 840 | 840 | **rework** (точечно: overlay-правило и флаг снега у ели) |
| `flora/wood_use_kolchin1968.csv` | 27 | 27 | approve |
| `flora/woody_denylist.csv` | 20 | 20 | approve |
| `flora/woody_categories.csv` | 42 | 42 | approve |
| `flora/landscape_template_woody_check.csv` | 34 | 34 | approve |
| `flora/sources.csv` | 62 | 62 | approve_with_limits |

**Общий вердикт — rework.** Переделка узкая: нужно поправить в `scripts/build.mjs` правило overlay и regex снега, затем пересобрать. Остальные файлы можно принимать уже сейчас.

## Детерминированные проверки (выполнены)

- `node scripts/validate.mjs`: все 9 проверок PASS, 1435 ссылок резолвятся.
- `node scripts/build.mjs` пересобирает `flora/` байт-в-байт так же, как в коллекторском выводе (`diff -r` пуст). Сборка воспроизводима.
- Счёт строк скриптом совпадает с README по всем 7 CSV. Счётчики confidence совпадают:
  - таксоны: A 2 / B 20 / C 15;
  - присутствие: A 52 / B 416 / C 372;
  - классы 8/4/2/1 → ppm 1e6/5e5/2.5e5/1.25e5, согласно `places-binding/presence/frequency_rule.json`.
- Пустых `source_refs` или `confidence` нет ни в одном файле. Дублей `presence_id` нет. Везде `region_id = region_novgorod_land`.
- WK: все 40 уникальных claim-ссылок есть в `runtime-bundle.json` со статусом `approved`. Тексты прочитаны, по смыслу они соответствуют месту использования.
- MASTER: все 13 ссылок (ING0067/0072/0074, OMI00033/36/110/140/141/144/150/151/156/160) найдены, содержание соответствует.
- world_db (read-only psql): 34 шаблона из `region_landscape_templates` для `region_novgorod_land` совпадают со снимком `world_db_landscape_templates_snapshot.tsv` по id, `dominant_vegetation`, `moisture_level` и `status`.
- Пересечений таксонов с соседними доменами flora нет (скрипт по латинским именам). Породы встречаются только как материалы в crafts / food / natural_materials — это ссылки, не дубли.

## Выборочная сверка с источниками (всего 108 строк)

| Файл | Проверено | Против чего |
|---|---:|---|
| `wood_use_kolchin1968.csv` | 27 из 27 | Скан Колчина 1968, табл. I, с. 12 (PDF idx 13), строка «Итого». Совпали все 27 чисел и сумма 909. Список 19 местных и 8 привозных пород сверен с с. 11. |
| `woody_denylist.csv` | 9 из 20 | 8 привозных — по Колчину, с. 11. Бузина красная — цитата ru.wikipedia об адвентивности подтверждена. |
| `trees_shrubs.csv` | 18 из 37 | См. ниже. |
| `tree_habitat_presence.csv` | 20 | Основания и ссылки сверены с Колчиным, valdaypark, nbcrs, ru.wikipedia и WK. |
| `landscape_template_woody_check.csv` | 34 из 34 | Живая world_db. |

**trees_shrubs.csv, 18 таксонов:**
- сверено с ru.wikipedia (API wikitext или WebFetch), Колчиным и WK: Pinus, Picea, Tilia, Quercus, Malus, Euonymus, Salix alba, Rhododendron, Calluna, Lonicera, Frangula, Daphne, Andromeda, Chamaedaphne, Betula pendula;
- по народным названиям: Salix caprea, S. viminalis, S. rosmarinifolia.

Подтверждено:
- сосна: шишки XI–XII, семена II–IV, «сухие пески и болота», зимний корм лося, кондовая и мяндовая;
- ель: пыление в мае, шишки в октябре, семена I–III, ветровал, дубление;
- липа: цветёт с начала июля 10–15 дней, плоды VIII–IX;
- яблоня лесная: граница «Карельский перешеек — Вологда — Пермь», цветёт IV–V;
- бересклет: ареал «от Пскова до Предуралья», мышиный запах, плоды VIII–IX, поделки, ядовитость;
- багульник: цветёт V–VII, плоды VII–VIII, 4 народных названия;
- хамедафна: цветёт V–VII;
- подбел, ивы, волчеягодник, крушина, жимолость, берёза: народные названия.

Фабрикации в выборке не найдено.

## Замечания по файлам

### tree_habitat_presence.csv — rework

1. **Правило overlay (max по семействам) даёт гарантированное присутствие (1 000 000 ppm) растений, которые растут только в одном типе леса.** Происходит это в каждом `pf_forest_track` и `pf_hunting_ground`:
   - липа и лещина получают 8 из `pf_broadleaf_woodland`, хотя широколиственный лес, по Колчину, растёт только на юге;
   - **багульник получает 8 в каждом `pf_hunting_ground` из `pf_bog`**.

   Всего 11 комбинаций × 4 сезона. Лесная тропа в бору гарантированно получит липу и лещину, а любое охотничье угодье — болотный кустарничек. Это ошибка материализации, а не спорная оценка.

   Как чинить: правило задаёт владелец places-binding или координатор. Варианты:
   - overlay не выше класса `component`;
   - overlay по `pf_mixed_woodland` как по типичному лесу;
   - hunting_ground без `pf_bog`.
2. **Ель зимой помечена `mostly_under_snow`, `visible_above_snow = mostly_no`** — 6 строк: conifer, mixed, broadleaf, forest_edge, forest_track, hunting_ground. Причина — regex `/под снегом/` в `build.mjs` (функция `phenology`). Он срабатывает на `winter_look` ели («под снегом ветви провисают»). Ель — главная порода, и зимой она видна над снегом. Та же ошибка попадает в `trees_shrubs.csv` (`phenology_by_season.winter`).
3. **Роли расходятся с заявленным правилом `woody_role_to_frequency_class_v1`:**
   - `betula_pendula × pf_mixed_woodland = edificator (8)`. Основание — «пионер после пожаров и вырубок» и draft-шаблон world_db, который сам коллектор считает ненадёжным. По правилу edificator требует формулировки «доминирует / образует древостои». Колчин (с. 11) ставит берёзу в ряд «встречаются» и пишет, что лиственные «играли подчинённую роль». Нужно `component` с confidence C или отдельное явное основание: вторичные березняки на подсеках — только со ссылкой.
   - `rhododendron_tomentosum × pf_bog` («моховые болота, торфяники») и `salix_triandra × pf_riverbank` («главным образом пойма») получили edificator. В этих формулировках говорится о местообитании, а не о господстве. Замечание слабое: по сути роли правдоподобны. Но правило требует доминантной формулировки, поэтому нужна либо цитата, либо понижение до component.
4. **Неточные ссылки:** у `corylus_avellana × pf_broadleaf_woodland` (edificator) и `quercus_robur × pf_broadleaf_woodland` основание «северные дубравы с лещиной» взято со страницы valdaypark.ru/nature. Цитируется же `src_valdaypark_flora` (/flora), где лещины нет, есть только «дубравы». Нужно добавить `/nature` в реестр или сослаться на WK research `population-wild-flora-modern.md`.
5. **Ограничение (не для переделки):** роли основаны на современных источниках (Валдайский парк, nbcrs, wiki). Описание леса у Колчина опирается на межевание 1836 г. и П. П. Семенова (1900), то есть это не данные о 1230 годе. Сама WK research note предупреждает, что современный Валдай в 1230 год не переносится. Confidence B у строк, где основание только VP или NB, — верхняя граница. Классы остаются редакторскими, в README это честно указано.

### trees_shrubs.csv — approve_with_limits

- Повторяется ошибка п. 2: у ели в `phenology_by_season.winter` стоит `mostly_under_snow`.
- Вереск:
  - `flowering_months = 7-11` и «с конца июля по ноябрь» взяты из фразы ru.wikipedia о **сортах** («у разных сортов длится с конца июля до ноября»). Для дикого вереска в статье сказано «с конца лета до осени». Точнее будет 7/8–9(10) с пометкой C.
  - Народное название «вересчаток» в цитируемой статье не найдено (статья «Вереск» проверена полностью). Нужен источник, иначе название убрать.
  - В `uses` есть «кровля» и «краситель кож». Это западноевропейская практика, для Новгорода 1230 года она не подтверждена. Нужно пометить как аналогию.
- Ива пятитычинковая, «чернолоз»: в статье ru.wikipedia не найдено, «чернотал» стоит только ссылкой на ЭСБЕ. Требуется источник.
- Происхождение «местная по Колчину» (confidence B у бересклета, яблони и др.): у Колчина «местные» — это «из лесов Новгородской земли **или** центральных районов Руси» (с. 11). Для дуба и ясеня есть отдельное указание «южные районы», для бересклета его нет. Confidence нормальный, но в формулировке нужна эта оговорка.
- `name_old_ru` пуст у всех 37 таксонов. Известный пробел, он указан в README.

### wood_use_kolchin1968.csv — approve

- Все 27 чисел и сумма 909 совпадают с таблицей I.
- Мелочь: `origin = local` у 18 пород. По тексту Колчина точнее `local_or_central_rus` для всех 19, как уже сделано у груши.
- README, раздел «Находки»: фраза «ясень — только точёная посуда» преувеличивает. По табл. I у ясеня 44 точёных сосуда из 62, есть также ложки, ковши, рукояти и прочее. Фраза «дуб — полозья» тоже неточна: в таблице это «детали саней», 5 изделий.

### woody_denylist.csv — approve

- 8 out_of_range сверены с Колчиным, с. 11. Бузина красная (adventive) подтверждена цитатой.
- 11 поздних интродуцентов соответствуют общеизвестным ареалам. Каждую страницу verifier не открывал; ссылки на месте.
- Мелочь: confidence у тиса, пихты и других B, а у самшита A при одном и том же источнике.

### woody_categories.csv — approve

- Заголовок совпадает с `places-binding/categories/category_registry.csv`.
- 42 строки: корень, 4 жизненные формы и 37 таксонов. `validate` проверяет их согласованность.
- В реестр пока не влиты (0 строк flora). Это решение координатора.

### landscape_template_woody_check.csv — approve

- Снимок совпадает с живой world_db. Флаги «лиственница» и «пихта» верны по Колчину.
- Утверждение «из тополей аборигенна только осина» дано без источника. Флаг «тополь» помечен `CHECK`, и это корректно.

### sources.csv — approve_with_limits

- ru.wikipedia оценена как B, хотя это третичный источник. Для экологии и фенологии это допустимо, для исторических утверждений — нет. Строки с одной только wiki фактически уровня B−/C.
- Цитаты со страницы valdaypark `/nature` приписаны `src_valdaypark_flora` (п. 4 выше).
- `src_kolchin_1968` указывает на файл в Downloads вне репозитория, поэтому проверка воспроизводится только на этой машине.
- `src_brisbane_hather_2007` взят только по поисковой выдержке, и это указано.
- Летопись Рдейского заповедника (PDF) verifier не открывал: основания для field_margin у осины, берёзы и рябины не проверены.

## Что должен сделать сборщик для approve

1. Исправить в `build.mjs` определение `mostly_under_snow`: только `dwarf_shrub` или явный флаг таксона, без regex по `winter_look`.
2. Переопределить overlay для `pf_forest_track` и `pf_hunting_ground` так, чтобы растения одного семейства мест (bog, broadleaf) не получали гарантированное присутствие везде. Правило записать в `habitat_roles.json#overlay_rule`.
3. Понизить роль или дать основание по правилу для `betula_pendula × mixed_woodland`, а также (желательно) для `rhododendron × bog` и `salix_triandra × riverbank`.
4. Вереск: месяцы цветения и «вересчаток». Ива пятитычинковая: «чернолоз». Ссылку `/nature` для дубрав с лещиной.
5. Пересобрать, запустить `validate` и обновить счёты в README.

## Исправления 2026-09-26

Кто: fixer-агент (не автор, не сам верификатор). Правил только `tree_habitat_presence.csv` и то, что этот файл тянет (его источники в `scripts/src/`, `scripts/build.mjs`, счёты в README). Данные и скрипты собраны заново командой `node scripts/build.mjs`, затем `node scripts/validate.mjs` — все 9 проверок PASS, `refs=1423`.

1. **`mostly_under_snow` / ель зимой (п. 1).** В `scripts/build.mjs` (`phenology()`) убран regex `/под снегом/` по `winter_look`; признак теперь ставится только по `life_form === 'dwarf_shrub'`. Ель (`fl_ts_picea_abies`, `life_form: tree`) больше не получает `mostly_under_snow`/`visible_above_snow=mostly_no` ни в одной из 6 строк (`conifer_woodland`, `mixed_woodland`, `broadleaf_woodland`, `forest_edge`, `forest_track`, `hunting_ground`); зимой у ели теперь только `evergreen;seed_release`. То же в `trees_shrubs.csv` (`phenology_by_season.winter`). Кустарнички (`calluna_vulgaris` и др.) сохранили `mostly_under_snow` по явному `life_form`.
2. **Overlay-правило (п. 2).** В `scripts/build.mjs` функция `overlay()` теперь ограничивает выводимую роль классом `component` (вес 4), даже если максимум по донорским `pf` — `edificator` (вес 8). Правило и причина зафиксированы в `scripts/src/habitat_roles.json#rule.overlay_rule`. Проверено: `flp_tilia_cordata__forest_track__summer` и `flp_corylus_avellana__forest_track__summer` теперь `component` (было бы `edificator`/ubiquitous), `flp_rhododendron_tomentosum__hunting_ground__summer` — `component` (было `edificator` от `pf_bog`). Явные авторские строки для overlay-`pf` (например, `salix_caprea × pf_forest_track`) не тронуты — они авторские (`derivation: authored`), не выводятся оverlay-функцией.
3. **Роли, расходящиеся с правилом (п. 3).**
   - `fl_ts_betula_pendula × pf_mixed_woodland`: понижено с `edificator` до `component`, confidence строки — `C` (принудительно через маркер `(C: ...)` в `basis`, распознаётся `build.mjs`). Основание переписано на Колчина («лиственные породы играли подчинённую роль, встречаются в примеси»); ссылка на ненадёжный draft `world_db_landscape_templates` убрана из `source_refs`.
   - `fl_ts_rhododendron_tomentosum × pf_bog`: понижено с `edificator` до `component`, confidence `C` — формулировка источника называет местообитание, а не господство.
   - `fl_ts_salix_triandra × pf_riverbank`: понижено с `edificator` до `component`, confidence `C` — «главным образом» в источнике относится к пойме как местообитанию, а не к господству ивы на берегу.
   - Правки в `scripts/src/habitat_roles.json`; пересборка автоматически обновила `tree_habitat_presence.csv`.
4. **Вереск, ива, ссылка `/nature` (п. 4).**
   - `calluna_vulgaris.phen.flower`: `7-11` → `8-10`; `flower_note` переписан на «с конца лета до осени» (проверено прямым чтением wikitext статьи «Вереск»: «Период цветения — с конца лета до осени» относится к виду; диапазон «с конца июля по ноябрь» в статье — только для садовых сортов). Правка в `scripts/src/taxa.json`.
   - Народное название «вересчаток» убрано (`name_folk`, `name_folk_refs` очищены) — прямая проверка wikitext статьи «Вереск» не находит этого слова.
   - В `uses` вереска убрана «кровля» (в статье не найдена, источник не подтверждает); «корм овцам» и «краситель кож» оставлены, но помечены как западноевропейская практика, не подтверждённая для Новгорода 1230 (в самой статье: «в СССР вереск на корм почти не использовался, но в... Западной Европы... используется как корм для овец»). «Веники/метёлки» и «подстилка скоту» подтверждены статьёй без оговорки.
   - **Ива пятитычинковая, «чернолоз»: проверено повторно и НЕ удалено.** Прямое чтение исходного wikitext статьи `ru.wikipedia.org/wiki/Ива_пятитычинковая` (`action=raw`) показывает: «Ива пятитычинковая..., или чернота́л..., или черноло́з..., или ива пятимужняя» с сноской на 4 источника (Строгий 1934, Назаров 1936, Работнов 1951, Усенко 1984). Замечание верификатора здесь не подтвердилось — слово в статье есть (со знаком ударения). Строка не менялась.
   - Ссылка `/nature` для дубрав с лещиной: добавлен новый источник `src_valdaypark_nature` (url `https://www.valdaypark.ru/nature`, реальная страница подтверждена через `population-wild-flora-modern.md` §19-23) в `scripts/src/sources.json`; легенда `VN` добавлена в `habitat_roles.json#legend` и `build.mjs#expandRefs`. Для `fl_ts_corylus_avellana × pf_broadleaf_woodland` и `fl_ts_quercus_robur × pf_broadleaf_woodland` ссылка `VP` (=`/flora`) заменена на `VN` (=`/nature`) — только эта страница называет лещину в северных дубравах.
5. **Пересборка.** `node scripts/build.mjs` → `flora/sources.csv` вырос до 63 строк (новый `src_valdaypark_nature`); остальные файлы — прежние 37/840/27/20/42/34 строк. `node scripts/validate.mjs` → все 9 PASS, `refs=1423` (было 1435 — за счёт убранной `world_db` ссылки у берёзы и снятой ссылки `VP`→`VN` без изменения числа ссылок на строку, плюс новая `VN`-ссылка). README обновлён: `sources.csv` 62→63; строки присутствия за лето по классам `ubiquitous 21→7, common 72→86, contextual 90 (без изменений), rare 27 (без изменений)`; confidence строк присутствия `A 13 (без изменений), B 104→103, C 93→94`; итоговый счёт проверенных ссылок `1435→1423`.

**Не тронуто:** `trees_shrubs.csv` вне полей вереска (Колчин, бересклет, яблоня и др. — верифицированы, `approve_with_limits`), `wood_use_kolchin1968.csv`, `woody_denylist.csv`, `woody_categories.csv`, `landscape_template_woody_check.csv` — все имели вердикт `approve`; их строки и содержимое не менялись (числа в README для них те же). Мелкие необязательные замечания верификатора (`origin` у Колчина, преувеличение «ясень — только точёная посуда», confidence самшита A vs тис/пихта B) оставлены владельцу — они не входят в список «Что должен сделать сборщик для approve».

## Повторная проверка 2026-09-26

Кто: независимый re-checker (старший проход, не сборщик и не fixer). Данные не правились; этот раздел — единственная запись.

### Детерминированно (скрипты)

- Пересборка в зеркальной копии в scratchpad (`node scripts/build.mjs`): `flora/` совпадает с текущей байт-в-байт (`diff -r` пуст). `node scripts/validate.mjs`: 9/9 PASS, `refs=1423`.
- Счёт строк скриптом: trees_shrubs 37, tree_habitat_presence 840, wood_use_kolchin1968 27, woody_denylist 20, woody_categories 42, landscape_template_woody_check 34, sources 63. Пустых `source_refs`/`confidence` нет.
- Присутствие (лето, 210): ubiquitous 7 / common 86 / contextual 90 / rare 27; authored 148 / overlay 62; confidence A 13 / B 103 / C 94. Всего A 52 / B 412 / C 376. С README совпадает. Разница ubiquitous 21→7 = 11 overlay-комбинаций + берёза, багульник, ива трёхтычинковая.

### Проверка по пунктам (tree_habitat_presence.csv)

1. Overlay: в `pf_forest_track` и `pf_hunting_ground` нет ни одной строки edificator/ubiquitous (overlay-роли: component 144, occasional 100, rare 4). В `build.mjs` `overlay()` ограничен `OVERLAY_CAP='component'`, правило записано в `habitat_roles.json#rule.overlay_rule`. **Решено.**
2. Ель зимой: все 6 строк — `evergreen;seed_release`, `visible_above_snow=yes`. `underSnow` теперь только `life_form==='dwarf_shrub'` (4 таксона: вереск, багульник, хамедафна, подбел). В `trees_shrubs.csv` у ели то же. **Решено.**
3. Роли: берёза × mixed, багульник × bog, ива трёхтычинковая × riverbank → component/C. Ссылка на world_db у берёзы снята. **Решено.**
4. Лещина и дуб × broadleaf → `src_valdaypark_nature`. Источник есть в `sources.csv`, страница /nature подтверждена по WK research `population-wild-flora-modern.md` (п. 1 списка первичных источников). Живой сайт отдаёт 403 скрипту. **Решено.**

### Выборка 15 строк (лето) против источников

- Правленые: берёза×mixed (Колчин с. 11, скан просмотрен), багульник×bog (wiki «Растёт на моховых болотах, торфяниках…»), ива трёхтычинковая×riverbank (wiki «главным образом в пойменной части»), лещина×broadleaf, дуб×broadleaf, липа×forest_track (Колчин «Липа и ольха распространены повсеместно»), лещина×forest_track, багульник×hunting_ground, ель×conifer (зима).
- Случайные (детерминированный seed): осина×conifer, сосна×forest_edge, ель×mixed, ольха серая×field_margin, багульник×conifer, ива пепельная×bog. Все соответствуют ru.wikipedia (wikitext через API) или Колчину.
- Вне выборки, но проверено по замечаниям: вереск цветёт «с конца лета до осени» → 8-10 верно; «вересчаток» и «кровля» в статье нет, удалены правильно; «чернолоз» у ивы пятитычинковой в статье есть (4 sfn), fixer прав.
- Фабрикаций не найдено.

### Оставшиеся ограничения (не rework)

- Overlay с потолком component по-прежнему даёт 500 000 ppm (класс common): липе и лещине в каждой лесной тропе, болотным кустарничкам в каждом охотничьем угодье. Это один из вариантов, предложенных verifier. Выбор между ним и «hunting_ground без pf_bog» — за владельцем places-binding или координатором.
- README, раздел «Метод», п. 4: overlay по-прежнему описан как «максимум по лесным семействам», потолок component не упомянут. Правило есть только в `habitat_roles.json`.
- Основание у берёзы («в примеси к хвойным, а не образует древостои») — вывод из Колчина, у него буквально «встречаются… береза» и «лиственные породы играли подчиненную роль». При C это допустимо. Маркер `(C: …)` внутри basis говорит о world_db, а не о самой оценке.
- Confidence A у строк лещины и рябины идёт от таксона (археоботаника XIII в.). Роль же опирается на современные VN/wiki; верхняя граница роли по п. 5 — B.
- В тексте «Исправлений» п. 4 цитата вики неточна: «как корм для овец» вместо «как пастбища для овец». В CSV стоит верная формулировка.

### Вердикты

| Файл | Строк | Вердикт |
|---|---:|---|
| `flora/tree_habitat_presence.csv` | 840 | approve_with_limits |
| `flora/trees_shrubs.csv` | 37 | approve_with_limits (без изменений; вереск исправлен) |
| `flora/sources.csv` | 63 | approve_with_limits (без изменений) |

**Общий вердикт группы: approve_with_limits.** Rework закрыт.
