# VERIFICATION — nature-materials-weather

- **Кто:** независимый агент-верификатор `verify-nature-materials-weather` (старший проход, не автор; автор — `collect-nature-materials-weather`).
- **Когда:** 2026-09-26.
- **Что проверено:** `data/world-catalogs/novgorod/game-base-v1/nature-materials-weather/` — `natural_materials_soils/*`, `weather_climate/*`, `natural_presentation_texts/*`, `_shared/*`, `reports/counts.json`.
- **Итог по группе:** **rework** для `natural_presentation_texts` (2 файла). `natural_materials_soils` и `weather_climate` можно принять как **approve_with_limits**, если выполнить условия ниже.
- Файлы данных не правились.

## Как проверял

1. **Скриптом.** Независимый парсер CSV (свой, не `lib.mjs` сборщика) по всем 25 CSV. Считал строки, проверял число колонок, пустые `source_refs` и `confidence`, распределение A/B/C, повторы id в первой колонке. Каждую ссылку `wk:claim:*` сверил с 1723 утверждениями WK production-v1: 949 ссылок, 70 разных, **все существуют и в статусе approved**.
2. **Пересборка.** Дважды запустил `node _shared/scripts/run-all.mjs` и сравнил sha256 всех CSV и JSON до и после: **результат детерминирован, файлы не изменились**. Проверки сборщика проходят (OK).
3. **Сверка с источниками** (выборка стратифицирована по файлам и по уверенности A/B/C; вручную открыто больше 30 строк, часть таблиц проверена целиком скриптом):
   - `world_db` (живой SELECT): 34 шаблона `region_novgorod_land`. Все 34 привязки совпадают по `soil_ground_type`, `moisture_level` и `regional_link_id`; все 34 типа грунта есть в БД.
   - ru.wikipedia «Великий Новгород», raw-шаблон «Климат города»: все 12 × 6 норм совпадают точно.
   - novgorodpogoda.ru («Климат Новгорода», 4 страницы скачаны): ледостав 25.11, вскрытие 04.04 (26.02–27.04), 130 дней подо льдом, ледоход 10–20 дней, снежный покров 135/119 дней, 36 см (7–82), промерзание 56 см (до 105), заморозки 17.05 / 22.09, безморозный период 127 (103–169), оттепели 12/8/6 дней, туман 50, гроза 24, ясных 31, пасмурных 162 дня.
   - НПЛ, litopys.org.ua novg06 (скачана): все 5 записей 1224–1230 подтверждены — дата, праздник, событие, ветер, 9 городней.
   - ru.wikipedia «Волхов» (цитата 6684/1176 «на възводье по 5 днии»); Jennings et al. 2018 (средний порог 1,0 °C, диапазон −0,4…2,4 °C).
   - URL Колчина 1953, DOI Булкина–Антипова 2017, DOI Дмитрук–Дружновой 2020, ammonit.ru, trasa.ru, «Путиловский известняк» — открываются (HTTP 200).
   - `temporal-v4 calendar_daylight_light_profiles` (1230): все 12 месячных строк света пересчитаны из суточных границ — совпадают до округления.
   - PR #98: sha256 `nature-successor-candidate-v2.json` совпадает с `_shared/g4_nature_index.json`. Форма 4 профилей v17 finite-source и контракт `weather-state.js` сопоставлены.
   - MASTER `material_entities.csv`: открыты OMI00033/37/48/50/110/140/141/143, 01008/01111/01517.
   - Тексты WK-утверждений (subject, predicate, object, qualifiers, evidence) для 16 цитируемых claim.

## Счёт строк (скрипт верификатора = README = `reports/counts.json`)

| Файл | Строк | A/B/C | Повторы id |
|---|---:|---|---|
| natural_materials_soils/ground_types.csv | 34 | B13 C21 | 0 |
| natural_materials_soils/landscape_ground_binding.csv | 34 | C34 | 0 |
| natural_materials_soils/natural_materials.csv | 22 | A1 B13 C8 | 0 |
| natural_materials_soils/material_landscape_presence.csv | 258 | C258 | 0 |
| natural_materials_soils/g4_ground_and_materials.csv | 360 | C360 | 0 |
| natural_materials_soils/access_tools.csv | 13 | A6 B4 C3 | 0 |
| natural_materials_soils/finite_source_profiles_ext.json | 21 профиль | — | 0 |
| weather_climate/climate_monthly_normals.csv | 12 | B12 | 0 |
| weather_climate/weather_states.csv | 9 | C9 | 0 |
| weather_climate/weather_season_climatology.csv | 36 | B24 C12 | 0 |
| weather_climate/weather_transitions.csv | 315 | C315 | 0 |
| weather_climate/temperature_anomalies.csv | 5 | C5 | 0 |
| weather_climate/temperature_anomaly_transitions.csv | 40 | C40 | 0 |
| weather_climate/temperature_profile.csv | 48 | B48 | 0 |
| weather_climate/weather_state_temperature_modifiers.csv | 9 | C9 | 0 |
| weather_climate/precipitation_phase_and_bands.csv | 9 | B3 C6 | 0 (ключ — колонка `id`) |
| weather_climate/realized_weather_matrix.csv | 15 | C15 | 0 |
| weather_climate/seasonal_phenomena.csv | 17 | A2 B13 C2 | 0 |
| weather_climate/historical_weather_1224_1231.csv | 5 | A5 | 0 |
| weather_climate/light_profile_by_month.csv | 12 | A12 | 0 |
| weather_climate/local_landscape_modifiers.csv | 5 | B1 C4 | 0 |
| weather_climate/ground_water_condition_rules.csv | 11 | B5 C6 | 0 |
| weather_climate/weather_transition_profile_v2.candidate.json | 1 запись | — | — |
| natural_presentation_texts/presentation_texts.csv | 3762 | C3762 | 0 |
| natural_presentation_texts/member_phrases.csv | 123 | C123 | **8 (4+4)** |
| natural_presentation_texts/habitat_allowlist.csv | 142 | C142 | 0 |
| natural_presentation_texts/reports/denied_landscape_words.csv | 3 | (отчёт) | 0 |

`source_refs` и `confidence` заполнены во всех строках всех таблиц данных. Число колонок везде совпадает с заголовком. Разбивка presentation_texts по слоям и 1604 ячейки «G4 × сезон × слой» совпадают с README.

## Вердикты по файлам

### natural_materials_soils

**ground_types.csv — approve_with_limits.**
- Типы грунтов 1:1 соответствуют world_db (34/34).
- Материнская порода опирается на `wk:claim:terrain-parent-material-assemblage` (approved, medium, inferred). Сам claim оговаривает: это «не наличие всех пород в одном месте». Уверенность B у 13 грунтов допустима только в этом смысле.
- Признаки (цвет, запах, ощупь), проходимость и трудность копки — редакторские (C).

**landscape_ground_binding.csv — approve.** Все 34 строки совпадают с живой world_db (скрипт).

**natural_materials.csv — approve_with_limits.**
- Проверено 13 из 22 строк по источнику. Клей, песок, гравий, валуны, известняк (включая вывод «выходов на 32 G4 нет»), болотная руда (Колчин), береста (A — WK: туеса, грамоты), кора (WK: поплавки из берёзовой и сосновой коры, Рыбина 2015), живица, тростник и вода подтверждаются.
- Проблемы:
  1. `nm_deadwood.master_item_refs = OMI00048` — это «Обугленный, но целый обрезок дерева», а не валежник. Ошибочная привязка.
  2. `craft_process_refs` (`proc:*`) и `access_tool_refs` (`tool:*`) никуда не резолвятся. В соседнем домене `crafts-tools-processes` уже есть `pc_*`, `tl_*` и `materials_registry` с `mt_*` на те же категории: mt_clay, mt_quartz_sand, mt_peat, mt_bog_ore, mt_moss, mt_reed, mt_roots, mt_limestone, mt_fieldstone, mt_water, mt_birch_bark, mt_bast_linden, mt_pine_resin. Сейчас у одной категории **два id и два владельца**. Нужен crosswalk `nm_* ↔ mt_*` и выбор одного владельца (решает координатор).
  3. Этот домен и `crafts-tools-processes` противоречат друг другу. `mt_moss` там — «для конопатки срубов», здесь мох в пазах не подтверждён (C, gap). `mt_slate_whetstone` там есть, здесь «местные точила не найдены». Сверить при слиянии.
  4. Для `nm_moss` WK-ссылка `agriculture-fauna-tow-log-gaps` подтверждает паклю, а не мох; для `nm_sedge_grass` — `static-bedding-*` (перенос из подстилки для лошадей). Обе строки честно стоят на C с примечанием. Годится только как контекст.
  5. `nm_spruce_roots` (B) опирается только на MASTER. В MASTER у OMI00140/141 уверенность A — это нормально, но в `source_refs` не указаны id строк (они есть только в `master_item_refs`).
  6. Массы порций и база 25 — редакторские; сборщик это указал.

**material_landscape_presence.csv — approve_with_limits (обязательная правка 2 строк).**
- Формула «вес 8/4/2/1 × 25» проверена скриптом во всех 258 строках: 0 ошибок.
- **Ошибка:** `nmp_spruce_roots__reedbed_marsh` и `nmp_spruce_roots__seasonal_sedge_marsh` (еловые корни в тростниковом и осоковом марше) — ложное срабатывание регулярного выражения `veg(lt, /ель/)` в `authoring/materials.mjs` на слово «растит**ель**ность» в `dominant_vegetation`. Других ложных совпадений в выражениях по растительности нет (проверено скриптом). Нужна граница слова, после чего пересборка.
- Сами классы частоты — редакторское сопоставление атрибутам шаблона. Правило записано явно, поэтому это не выдуманные числа, но и не данные об обилии; стоит C.

**g4_ground_and_materials.csv — approve_with_limits.**
- Вес и класс согласованы (0 ошибок). У каждого из 32 G4 не меньше 5 видов сырья. Вручную проверены 18 строк: driftwood_bar и zaostrovye_burial_area.
- Повышение класса по функции G4 (например, `driftwood_bar → gravel contextual`) — редакторское.
- У `zaostrovye_burial_area` помечена только копка. Сбор валежника, коры, хвороста и прутьев на могильнике (`common`, 100 порций) не помечен — владельцу прав стоит решить.

**finite_source_profiles_ext.json — approve_with_limits (не импортируемо как есть).**
- Утверждение «в той же форме, что v17» неточно. Нет `quantity_unit_ref`, `initial_amount_bounds`, `access_policy_ref`, `admission_class`, `functional_bucket`, `template_policy`; applicability идёт по `g4_ref` вместо `applicable_family_refs` (G5); `initial_quantity` задан правилом, а не числом.
- **Молча изменены** количества 3 профилей v17. Тростник: v17 — 20, здесь — до 200 (reed_backwater). Валежник: 60 → 25–100. Плавник: 100 → 200 на driftwood_bar. В README это как изменение не отмечено.
- Нужен явный адаптер к схеме v17 и отдельное решение владельца о новых бюджетах.

**access_tools.csv — approve_with_limits.**
- `tool:hands`: `source_refs=editorial`, `confidence=A` — противоречие; редакторская строка должна быть C.
- `tool:container_basket_or_box` (B) ссылается на `household-bark-tues` (берестяные туеса), а не на короб, корзину или мешок — неверная атрибуция.
- `tool:knife` (A): ссылка на MASTER без id строки.
- `tool:axe` и `tool:sickle` — WK approved, Новгородская земля, подтверждены.
- Пространство имён `tool:*` не совпадает с `tl_*` домена craft_tools_gear.

### weather_climate

**climate_monthly_normals.csv — approve.** Все значения совпадают с таблицей Википедии. Ограничение: источник таблицы смешанный («Научно-прикладной справочник» 1988 и Яндекс.Погода), поэтому это аналог XX–XXI вв., а не 1892–1980. Юлианский пересчёт (+7 дней, коэффициент 0,23) проверен и корректен.

**temperature_profile.csv — approve.** Правило «ночь = ср. мин., утро и вечер = средняя, день = ср. макс.» применено корректно; значения совпадают с юлианскими колонками норм.

**weather_states.csv — approve_with_limits.** Редакторские (C). Enum-ы соответствуют `pr98:packages/contracts/src/weather-state.js`.

**weather_season_climatology.csv — approve_with_limits.**
- Исходные числа дней подтверждены: туман 50 (28 в холодный период), гроза 24, ясных 31, пасмурных 162.
- Перевод дней в доли 6-часовых интервалов идёт через редакторские коэффициенты (0,5 / 0,33 / 0,25) и константу `mm/(mm+4)` для доли обложных осадков. У 24 строк с B итоговая доля фактически C: источник подтверждает только число дней, но не долю.
- README пишет, что метели «по станции нет, только по области». На деле в «Климате Новгорода» станционное значение есть: 32 дня с метелью в год, ноябрь–апрель. Стоит заменить оценку по trasa.ru (область).

**weather_transitions.csv — approve_with_limits.** Во всех 36 группах скриптом проверено правило «вес остаться = (4d−1) × Σ весов остальных» и совпадение весов перехода с `entry_weight`: 0 ошибок. Ограничения наследуются от климатологии.

**temperature_anomalies.csv / temperature_anomaly_transitions.csv — approve_with_limits.** Величины редакторские (C), сборщик это указал. Калибровка по оттепелям: февраль в модели 9,3 дня при 6 по станции, завышение около 55%.

**weather_state_temperature_modifiers.csv — approve_with_limits.** Редакторские (C). Знаки правдоподобны: ясная ночь холоднее, пасмурный день прохладнее.

**precipitation_phase_and_bands.csv — approve_with_limits.**
- Вид осадков (снег ≤ −1, мокрый снег −1…+2, дождь > +2) согласуется с Jennings 2018.
- **Неверная атрибуция:** числовые пороги диапазонов (−15 / −3 / 5 / 15 / 24 °C) приписаны `weather-state.js`, но там только имена enum, чисел нет (в runtime `consistency-checks.js` тоже). Пороги редакторские; в `source_refs` нужно так и указать.

**realized_weather_matrix.csv — approve_with_limits.** C. Согласована с порогами фаз и enum контракта.

**seasonal_phenomena.csv — approve_with_limits.**
- 12 из 17 строк сверены с «Климатом Новгорода», даты и значения верны.
- Проблемы:
  1. `wxp_glaze_ice` «31 день за сезон» — это обледенение **любых видов** на проводах. Собственно гололёда — 12 дней, кристаллической изморози — 16. При этом `game_effect: ground_state ice` применяется ко всем 31 дню — завышение скользкого грунта.
  2. `wxp_spring_flood` (B) и строки о льде 70–80 см и «до 70% стока» ссылаются на «сводку поиска» cruiseinform.ru. На самой странице этих фактов нет. Атрибуция не проверяема, нужно переисточить или понизить до C. Половодье и полынья частично подтверждаются novgorodpogoda («Климат Новгорода»); там же сказано, что полынья отчасти от стока промышленных вод — для 1230 г. это не так.
  3. `wxp_volkhov_reverse_flow` (A): цитата подтверждена, но объяснение «подпор притоков при низком Ильмене» в источнике не приведено. Эта часть — C.

**historical_weather_1224_1231.csv — approve.** Все 5 записей подтверждены по тексту НПЛ (novg06): 20 мая 6732, св. Фалалей, сгорела церковь св. Троицы, 2 погибших; дождь от Госпожина до Никулина дня 6736; высокая вода унесла сено; 8 декабря озеро 3 дня, южный ветер, 9 городней; мороз на Воздвижение 6738.

**light_profile_by_month.csv — approve.** Пересчитано из утверждённого temporal-v4, совпадает.

**local_landscape_modifiers.csv — approve_with_limits.** C; WK-туманы уместны.

**ground_water_condition_rules.csv — approve_with_limits.**
- `wr_ice` задан фиксированным окном по средним датам. По источнику, в тёплые зимы Волхов у Новгорода не замерзает совсем, а полынья держится почти постоянно; правило этого не учитывает.
- `gr_snow` корректно требует окна снега и температурного диапазона, но тексты этому правилу не следуют (см. ниже).

**weather_transition_profile_v2.candidate.json — approve_with_limits.** Содержимое согласовано с CSV. «Форма записи temporal-v4» неполная: нет `provenance_refs`, `normalized_reference_ids`, `source_history_refs`, `environment_effect_refs`, `termination_and_replacement_rules`, `source_basis`, `unmodeled_effects`. Импорт — только после дополнения и утверждения. Ссылка на решение D7 ведёт в scratchpad (`c133-decisions-0926.md`), а не на стабильный путь в репозитории или issue.

### natural_presentation_texts

**presentation_texts.csv — rework.**
1. **Снег без условия.** Примерно 240 зимних строк с `condition=default` и пустым `requires` утверждают снег: natural_materials 32, light на рассвете, в сумерках и ночью 96, shrub_layer 30, ground_cover 30, riparian_vegetation 29, bank_structure 19. Пример: «Из-под снега проступают…». Но по данным этой же группы (`gr_snow`, `wxp_snow_cover_onset`: юлианская поздняя дата 29.12, оттепели) зима без снега возможна, и у слоёв surface, relief и seasonal_state уже есть варианты `no_snow`. Проверка сборщика «сезонных противоречий нет» это не ловит: она ищет только летний снег и зимнюю зелень.
2. **Условие без требования.** 28 строк `tree_layer` с `condition=snow` имеют пустой `requires` — рантайм покажет «снежный» текст без снега.
3. **Сплошные ссылки.** Все 112 строк `tree_layer` ссылаются на WK о Betula pendula и Pinus sylvestris, а берёза названа в 24, сосна или хвоя — в 4. Ссылки ставятся слою целиком, а не строке.
4. Разнообразие: 309 разных `clear_text` на 3762 строки; погодные фразы повторяются по 128 раз. Сборщик это указал — это ограничение, не ошибка.
- Анахронизмов не найдено. Каждый названный таксон есть в allowlist своего G4 (проверка сборщика, отрицательный тест есть). Летних снега, льда и мороза нет (моя проверка).

**member_phrases.csv — rework.** **Повторы id (8 строк):** `npm_alluvial_material__{winter,spring,summer,autumn}__visual` у двух разных членов («alluvial sand and silt» и «alluvial silt and clay»), `npm_waterlogged_material__*__visual` — тоже у двух («waterlogged forest soil» и «waterlogged organic and mineral sediment»). Id строится из `member_kind`, а не из `member_ref`. README утверждает, что id уникальны; `check.mjs` этот файл на уникальность не проверяет. Фразы о фауне (лось, бобр) — только следы и звуки, с условием `render_condition`, по WK. Это корректно.

**habitat_allowlist.csv — approve_with_limits.** Проверено 6 строк: члены пула successor-v2 и растительность шаблона соответствуют источникам. Список временный — до `habitat_presence` доменов флоры и фауны; сборщик это указал.

**reports/denied_landscape_words.csv — approve.** Пихта (ареал к востоку и северо-востоку) и тополь (`Populus nigra`) отброшены обоснованно. Осина не задета: в английском denylist стоит `Populus nigra`, а не весь род `Populus`.

### _shared, reports

- **_shared/g4_nature_index.json — approve.** sha256 источника совпадает.
- **_shared/anachronism_denylist.json — approve_with_limits.** Кандидат; лиственница и пихта — C, требуют подтверждения от домена флоры.
- **reports/counts.json — approve.** Совпадает с независимым подсчётом.

## Что нужно для снятия rework (natural_presentation_texts)

1. Добавить `requires: ground_state=snow` зимним строкам со снегом и варианты `no_snow` для natural_materials, light, shrub_layer, ground_cover, riparian_vegetation и bank_structure; заполнить `requires` у 28 строк `tree_layer`/`snow`. В `check.mjs` добавить проверку: слово «снег» или «сугроб» ⇒ в `requires` есть `snow`.
2. Строить `npm_id` из `member_ref` и проверять уникальность id в `member_phrases.csv`.
3. Ставить WK-ссылки о деревьях только тем строкам, где дерево названо.

## Условия для approve_with_limits (natural_materials_soils, weather_climate)

- Исправить регулярное выражение `/ель/` → 2 строки `material_landscape_presence`.
- `nm_deadwood`: убрать или заменить OMI00048.
- `access_tools`: `tool:hands` → C; `tool:container_basket_or_box` — переисточить.
- `precipitation_phase_and_bands`: указать, что пороги редакторские.
- `seasonal_phenomena`: исправить гололёд (12 дней гололёда против 31 дня обледенения); переисточить или понизить строки cruiseinform; объяснение обратного течения — C.
- До импорта: crosswalk `nm_*`/`proc:*`/`tool:*` ↔ `mt_*`/`pc_*`/`tl_*` с доменом crafts-tools-processes (один владелец категории); адаптер finite-source к схеме v17 с явным решением о новых бюджетах; дополнить профиль погоды v2 до полной записи temporal-v4.

## Ограничения самой проверки

- «Геология СССР» и печатное издание «Климат Новгорода» (1985) не открывались; сверка шла с воспроизведением на novgorodpogoda.ru.
- Число дней с осадками по сезонам (например, «зимой 17 из 30») отдельно не сверялось.
- Колчин 1953 проверен только по библиографии и URL, без страницы.
- `codebase-memory-mcp` не использовался: задача про данные, код не менялся.

## Исправления 2026-09-26

Исполнитель `fix-nature-materials-weather` (не автор, не верификатор). Правились только `natural_presentation_texts` (генераторы и производные CSV) по замечаниям верификатора выше; `natural_materials_soils` и `weather_climate` не тронуты.

**`natural_presentation_texts/authoring/lexicon.mjs`**
- Добавлены безснежные зимние фразы (`winter_no_snow`) там, где зимняя фраза утверждала снег: `SHRUB.shrub_or_understory`, все 5 ключей `GROUND`, оба ключа `RIPARIAN` (+ `RIPARIAN_TAXA.winter_no_snow` для суффикса с таксонами), 3 из 6 ключей `BANK` (`alluvial_silt_mud`, `firm_soil`, `alluvial_mud_roots` — три оставшихся ключа `BANK` зимний текст снег не называют, для них правка не нужна), `MATERIALS_FRAME.winter_no_snow`, и новая карта `LIGHT_NO_SNOW` для фаз `civil_dawn`/`civil_dusk`/`night` (`daylight` снег не упоминает, вариант не нужен).

**`natural_presentation_texts/scripts/build.mjs`**
- Слои `shrub_layer`, `ground_cover`, `riparian_vegetation`, `natural_materials`, `light` (фазы dawn/dusk/night): для зимы теперь генерируются две строки — `condition=snow` (`requires=ground_state=snow`) и `condition=no_snow` (`requires=ground_state!=snow and season=winter`) — вместо одной строки `condition=default` с пустым `requires`, безусловно утверждавшей снег. Устраняет п.1 замечаний верификатора (~240 строк).
- `bank_structure`: та же расщепление зимы на snow/no_snow, но только для 3 классов, чьи зимние фразы называют снег; остальные 3 класса остаются одной строкой `condition=default` (снег в тексте не упоминается — расщеплять нечего).
- `tree_layer`: убрано жёсткое `requires: ''`, которое перебивало авто-подстановку `REQ[condition]` и оставляло 28 строк `condition=snow` без `requires=ground_state=snow`. Устраняет п.2 замечаний.
- `tree_layer`: атрибуция WK-ссылок на таксон теперь берётся из `ALL_MEMBERS[taxon].src` только для видов, реально названных в `{taxa}`/`{taxa_winter}`, а не жёстко захардкоженные ссылки на берёзу и сосну для любой строки с любым названным деревом. Устраняет п.3 замечаний.
- `member_phrases.csv`: `npm_id` теперь строится из полного `member_ref` (slug: нижний регистр, без содержимого в скобках, не-буквенные символы → `_`), а не из первого слова + `member_kind`. Устраняет 8 дублей id у `alluvial sand and silt` / `alluvial silt and clay` и `waterlogged forest soil` / `waterlogged organic and mineral sediment` (п.2 замечаний по `member_phrases.csv`).
- Разнообразие текста (п.4, повторяемость погодных фраз) и allowlist/denylist не менялись — верификатор указал это как известное ограничение, не ошибку.

**`natural_presentation_texts/scripts/check.mjs`**
- Добавлена проверка: слово «снег»/«сугроб» в тексте строки ⇒ `requires` не пустой (иначе `snow word with empty requires`). Это конкретно ловит регресс п.1 (условие без требования), не переизлишествуя на строках `weather`/`water_body`, где снег уже управляется другим полем `requires` (`weather_state=…`, `water_condition=…`).
- Добавлена проверка уникальности `npm_id` в `member_phrases.csv` (`duplicate <id>`) — раньше проверялась только уникальность `npt_id` в `presentation_texts.csv`.

**Пересборка и проверка**
- `node natural_presentation_texts/scripts/build.mjs` и `node _shared/scripts/run-all.mjs` выполнены; все три чек-скрипта группы (`natural_materials_soils`, `weather_climate`, `natural_presentation_texts`) — `OK`.
- `presentation_texts.csv`: 3762 → 3998 строк (добавлены snow/no_snow пары в затронутых слоях). `member_phrases.csv`: 123 строки, без дублей id. `habitat_allowlist.csv` и остальные файлы `natural_materials_soils`/`weather_climate` не изменились (не входили в rework).
- `README.md`: число строк `natural_presentation_texts` обновлено 3762 → 3998 с примечанием про расщепление snow/no_snow.

**Не источённые строки / gaps**
- Правка не добавляла новых фактических утверждений — только условия показа (`requires`) существующих редакторских (C) фраз и корректную атрибуцию уже утверждённых WK-claims по видам деревьев. Новых пропусков (строк для удаления «нельзя источить») не возникло.
- Остальные условия `approve_with_limits` для `natural_materials_soils` и `weather_climate` (regex `/ель/`, `nm_deadwood`/OMI00048, `access_tools`, `precipitation_phase_and_bands`, `seasonal_phenomena`, crosswalk `nm_*`/`mt_*`) — вне мандата этой правки (файлы не входили в список rework) и не тронуты.

## Повторная проверка 2026-09-26

Независимый повторный проход (старший, не автор и не исполнитель правки). Проверены только два файла из rework: `natural_presentation_texts/presentation_texts.csv` и `natural_presentation_texts/member_phrases.csv`. Файлы данных не правились.

**Как проверял.**
- Свой парсер CSV (не `lib.mjs`), скрипты в scratchpad (`gb-fix-nature-materials-weather/recheck/`).
- Копия группы пересобрана в scratchpad (`build.mjs` + `check.mjs`): `check` — OK, все три CSV побайтно совпадают с файлами в репозитории. Сборка детерминирована.
- Все 17 разных `wk:claim:*` в обоих файлах есть в WK production-v1 со статусом `approved`.
- Выборка из 15 строк `presentation_texts` (10 из затронутых правкой: зимние snow/no_snow и tree_layer; 5 из прочих): G4, `layer_class` против `_shared/g4_nature_index.json`, `applicability`, ссылка pr98 на свой G4, существование файлов `game-base-v1/...`, `wxr_*` в `realized_weather_matrix.csv`, таксоны против allowlist. Расхождений 0.
- Выборка из 15 строк `member_phrases`: член есть в пуле successor-v2 или в растительности шаблона; фауна только через следы и звуки с `render_condition`; WK-ссылки по виду. Расхождений 0.

**Счёт (скрипт).** `presentation_texts.csv` — 3998 строк, все C, `source_refs` заполнены, 0 повторов `npt_id`. По слоям: bank_structure 139 (+19), shrub_layer 150 (+30), ground_cover 150 (+30), riparian_vegetation 145 (+29), natural_materials 160 (+32), light 640 (+96); остальные слои без изменений. Итого +236 = 3998, совпадает с `reports/counts.json` и README группы. `member_phrases.csv` — 123 строки, все C, 0 повторов `npm_id`.

### presentation_texts.csv — rework (узкий)

- **п.2 (condition=snow без requires) — исправлен.** У всех строк `condition=snow` есть `ground_state=snow`, у всех `no_snow` — `ground_state!=snow`. Строк с не-default условием и пустым `requires` нет.
- **п.3 (сплошные WK-ссылки у tree_layer) — исправлен.** Ссылки идут по названным видам: берёза — 24 строки, сосна — 4, ель — 16, ольха — 20, ива — 96. Строк с WK-ссылкой без названного дерева нет. Ограничение: у ивы стоит `macro-b19-dried-willow-rods-can-be-moistened-for-flexible-basket-work` (ремесло, увлажнение прутьев). Это approved, но о наличии и облике ивы не говорит. Уместнее `white-willow-depends-on-moist-lit-riparian-habitat` (approved).
- **п.1 (снег без условия) — исправлен не полностью.** Shrub, ground_cover, riparian, light и bank_structure исправлены. Но в `natural_materials` 26 из 32 строк `winter/no_snow` («На мёрзлой голой земле видны …») берут зимние фразы материалов, которые утверждают снег: «занесённые сучья», «занесённые прутья» (в весне стоит «принесённые водой», значит «занесённые» здесь — снегом). В `dry_pine_ridge` есть «хвоя на снегу». Строки противоречат сами себе и своему `requires=ground_state!=snow`. Причина: в `authoring/lexicon.mjs` у `small_woody_debris`, `shrub_woody_debris` и `needle_litter` нет варианта `winter_no_snow`. `check.mjs` это не ловит: правило «слово снег ⇒ requires не пуст» проходит при любом непустом `requires`, в том числе при `ground_state!=snow`, а слово «занесён» оно не ищет.
- **Новое (следствие п.2).** 25 из 28 зимних строк `tree_layer` («ивы стоят без листа», «берёзы белеют…») снег не упоминают, но теперь показываются только при `ground_state=snow`. В бесснежную зиму у 28 G4 слой деревьев остаётся без текста. Утверждение README «все 1604 ячейки имеют текст» при бесснежной зиме неверно. Для 3 строк «ели держат снег на лапах» нужен вариант `no_snow`, остальным 25 — `condition=default`.
- Мелочь: `audible_context/spring/thawed` (2 строки, `requires=no flood`) — «талая вода под снегом», снег без `ground_state=snow`.
- Документация: `natural_presentation_texts/README.md` по-прежнему пишет 3762 строки и старую разбивку по слоям (bank 120, shrub 120, ground 120, riparian 116, natural_materials 128, light 544). Обновлён только README группы.
- п.4 (разнообразие) — ограничение, не ошибка: теперь 339 разных `clear_text`.

**Для снятия rework:** (1) добавить `winter_no_snow` для трёх фраз материалов и пересобрать; (2) у `tree_layer` зимой дать `default` строкам без снега и пару `no_snow` строкам с елью; (3) в `check.mjs` запретить снежные слова (включая «занесён», исключая «бесснеж») в строках с `ground_state!=snow` и снежные слова без `ground_state=snow`/`weather_state`/`water_condition`; (4) обновить README подпапки.

### member_phrases.csv — approve_with_limits

- **Повторы id — исправлены.** `npm_id` строится из полного `member_ref`: `npm_alluvial_sand_and_silt__*`, `npm_alluvial_silt_and_clay__*`, `npm_waterlogged_forest_soil__*`, `npm_waterlogged_organic_and_mineral_sediment__*`. Повторов 0. В `check.mjs` добавлена проверка уникальности; повторная сборка её проходит.
- **Ограничение (новое, того же класса, что п.1):** 14 зимних фраз утверждают снег («На снегу глубокие следы…», «Ивовые кусты торчат из снега…», «Моховые кочки спрятаны под снегом» и др.). При этом `render_condition` снег не требует. Кода `member_selection` пока нет, поэтому сейчас на вывод это не влияет. До подключения нужен `ground_state=snow` в условии или варианты без снега.

### Ограничения повторной проверки

- `codebase-memory-mcp` не использовался: задача о данных, код не менялся.
- Книжные доказательства (servak) не привлекались: все строки обоих файлов редакторские (C), фактов сверх WK и pr98 правка не добавляла.
