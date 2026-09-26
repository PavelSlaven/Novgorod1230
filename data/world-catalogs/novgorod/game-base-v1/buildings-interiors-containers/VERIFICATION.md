# VERIFICATION — buildings-interiors-containers (game-base-v1)

- **Кто:** независимый агент-верификатор (старший проход, не автор), label `verify-buildings-interiors-containers`.
- **Когда:** 2026-09-26.
- **Что:** `data/world-catalogs/novgorod/game-base-v1/buildings-interiors-containers/` — все CSV/JSON пяти доменов + `sources.csv` + `scripts/`.
- **Данные не правились.** Этот файл — единственное, что записано в папку группы.

## Итог

**overall: approve_with_limits.** Одна таблица — `containers/place_containers.csv` — **rework** (ошибка вывода + дыры покрытия). Остальные: approve или approve_with_limits с конкретными правками ниже. Фальсификаций (выдуманных источников, несуществующих id) не найдено. Все токены источников резолвятся (validate.py). Найдено: несколько неверных атрибуций к веб-источникам, одна анахроничная атрибуция (водостоки XVII в.), ошибочная привязка сцены SCN020, неверный sensory-текст у двух сцен, нарушения собственного FREQ_RULE, переоценка B в ambience, недетерминированный и ложный `v6_name_match` в landmarks.

## Что проверено скриптами (детерминированно)

| Проверка | Результат |
|---|---|
| Счёт строк всех 23 таблиц vs README / `build_counts.json` | совпадает везде (51, 73, 288, 41, 22, 112, 69, 795, 75, 53, 458, 55, 41, 65, 152, 131, 87, 1, 76, 44, 168, 9, 7) |
| Дубли id / составных ключей | 0 во всех таблицах |
| Пустые source_refs / basis_ref | 0 там, где колонка есть. Колонки источника нет в `building_type_parts` (есть только `size_source`, заполнен в 48/288), `content_categories`, `item_to_container_crosswalk` |
| Пустая confidence | 0 там, где колонка есть. Нет колонки confidence: `building_type_parts`, `settlement_building_mix`, `content_profile_entries`, `place_containers`, `presence_tokens`, `anti_patterns_ref` (наследуют от родителя) |
| Распределение confidence vs README | совпадает (bt A9/B32/C10; ct A29/B22/C4; landmarks A38/B35/C3; ambience B32/C136) |
| `validate.py` | PASS, 0 ошибок, 41 предупреждение (воспроизведено) |
| Пересборка `build.py` в копии (scratch, REPO абсолютный) и побайтный diff | все файлы идентичны, **кроме `landmarks.csv`**: `v6_name_match` меняется между прогонами (перебор `set`) |
| 66 сцен vs `sources/material-culture-scenes-v1/data/scenes.csv` (required/allowed/forbidden, counts, layout, condition, name, confidence) | 0 расхождений |
| `scene_items` = развёртка scenes | 795 = 795; required→ubiquitous/8: 320; allowed→contextual/2: 231; forbidden: 244 |
| `furniture_fixtures_light` vs matcult FUR*/INT* | 75 = 75, поля name/confidence/dimensions/policy без расхождений |
| `matcult_item_refs` vs `catalog_items.csv` | 458/458 существуют, 0 расхождений; 2 записи D (ARC0030, STR0002) |
| `anti_patterns_ref` vs `anti_patterns.json` | 53 = 53, заголовки совпадают |
| confidence `container_forms` vs matcult `historical_confidence` | совпадает у 53/53 форм с matcult-близнецом |
| `place_containers`: независимый пересчёт правила ≥50% сцен | сценовая часть совпадает 77/77; 54 строки — только из MASTER spawn (см. rework) |
| FREQ_RULE `content_profile_entries`: класс vs тип основания | 4 нарушения (ниже) |

## Выборка против источников (≈190 строк вручную)

- building_types — 37 строк (все A, большинство B и C): matcult ARC/STR/FOR/AGR/CRF, nov1230db B0xx, WK claims (текст и applicability), веб.
- building_type_parts — все 48 строк с размером + состав изб/пятистенка; building_parts — 20; materials_vocab — 10.
- settlement_form — 22/22; settlement_building_mix — ~40 (дворы, деревня, село, погост, Торг, посад).
- scenes — 3 авторские + 5 импортированных вручную (плюс 66 скриптом).
- container_forms — 12 WK claims и v5 capacity для всех 18 v5-близнецов; content_profiles/entries — ~25 профилей, все 60 common/ubiquitous записей.
- landmarks — 76 через пересборку из SQLite + 9 дополнений вручную (вымолы по WK civic-space, Хутынь по сайту музея, P002, ARC0003).
- ambience — все 32 B + 14 случайных C; 9 токенов; 7 привязок G4.
- Веб: arhitekto 2russ27, dissercat Людин, РГБ Засурцев, Православная энциклопедия «Жальник», Новгородский музей (Хутынь) — открыты и сверены.

## Вердикты по файлам

### buildings/building_types.csv — approve_with_limits (51)
1. `bt_street_drain`: note «деревянные и каменные водостоки (ref:arhitekto_2russ27)». Источник даёт эти водостоки по слоям **XVII в.** Атрибуция неверна, а «каменные» для 1230 — анахронизм. Убрать ref:arhitekto и слово «каменные»; основание оставить matcult STR0004 (B).
2. `bt_podklet` / README: «подклеты — конец XII – начало XIII в. (ref:dissercat_ljudin)». В аннотации: «возможно» уже во 2-й пол. XI – 1-й четв. XII в., «развитые подклеты» — во 2-й четв. XII – 1-й четв. XIII в. Для 1230 это не опасно, но атрибуцию нужно переписать.
3. `bt_pyatistenok`: «с XI в.». Источник даёт с середины–конца **X в.** Переписать.
4. `ref:rsl_zasurcev_search` — это только каталожная карточка РГБ (автореферат 1962 г., без текста). Факты «~95% печей в углу» и «пятистенки — основные до сер. XIII в.» по этому URL не проверяются. Держать как непроверенные, пока не прочитан первоисточник (автор это раскрыл).
5. Слабые, «касательные» WK-основания (допустимо только при C): `bt_privy` (waste-separation), `bt_bridge_small` (gate-and-passage), `bt_wattle_fence` (rod-input), `bt_khlev` (zakup-loss).
6. FIRE_RULE применён непоследовательно: `bt_watermill` = low, хотя это деревянная постройка с зерном и мукой (по правилу medium); `bt_yard_gate` = low, а `bt_palisade_fence` в той же плотной застройке = medium.

### buildings/building_parts.csv — approve_with_limits (73)
- `bp_crib_pier` (B) ссылается на matcult STR0002 — это D/research_only, ряж моста **X в.** Как основание для B это неприемлемо; оставить только WK rjaz claims.
- `bp_millstones` ссылается на SCN020, а там ручные жернова AGR0017, а не мельничный постав.

### buildings/building_type_parts.csv — approve_with_limits (288)
- Нет row-level source_refs/confidence: источник есть только у 48 размеров.
- `bp_wall_crowns` 4–9 м (размер жилищ, arhitekto) перенесён на `bt_church_wooden` и `bt_monastery_cell`. Для церкви это неверное применение источника.
- `bt_bridge_great` / `bp_deck` size_min=17 из matcult STR0001, а в STR0001 прямо сказано, что пролёты X в. **не переносятся на 1230**. Убрать число.
- `bt_cellar_log` / `bp_ladder` 2–8 м взяты от строительной лестницы CON0044. Глубина погреба не нормирована, число нужно убрать.
- `bt_klet_dwelling`: `bp_stove_clay` required=1, что противоречит «холодной клети» в notes. Нужно required=0 или отдельный вариант.

### buildings/materials_vocab.csv — approve_with_limits (41)
- `mat_glass_fragment` опирается на ARC0030 (D). Оставить C с опорой только на INT0025.
- Нужен crosswalk к natural_materials_soils / materials_registry (автор это раскрыл).

### buildings/settlement_form.csv — approve_with_limits (22)
- Суммы компонентов расходятся с оценкой v6: деревня — v6 «8–18», у компонентов 7–18 (так и в README); село — «20–45», у компонентов 16–43 + 1 церковный = 17–44. Неконсистентен сам черновик v6. Отметить в notes, какой диапазон взят.

### buildings/settlement_building_mix.csv — approve_with_limits (112)
- `sf_yard_peasant`: SCN008 требует ARC0018 (клеть-амбар), а в составе 0–1. Правило «2–5 хозяйственных» не выполняется: min даёт только хлев (1), max доходит до 7. Нужно пересчитать или поставить klet_ambar min=1.
- `sf_torg` / `bt_klet_ambar`: count_max пуст.
- Колонки confidence нет.

### interiors/scenes.csv — approve_with_limits (69)
- Импорт 66 сцен — 1:1 (0 расхождений).
- Sensory-поля (light/smoke/smell/sound) назначены по `scene_type`, из-за этого:
  - `sc_scn020` «Мельничное хозяйство» получила текст пивоварни/пекарни («хлеб, солод, брага», «бульканье котла»);
  - `sc_scn035` «Гумно и молотьба» — «шорох серпов» (серп — жатва; при молотьбе — цепы).
- `sc_scn020` привязана к `bt_watermill`/`mill`, хотя её обязательный предмет — ручные жернова AGR0017 (домашний помол, по README это основной путь 1230 г.). Перепривязать к жилищу или хозпостройке.
- Аномалия AGR0001 в SCN020/SCN035 раскрыта автором и оставлена на утверждающего.

### interiors/scene_items.csv — approve (795)
### interiors/furniture_fixtures_light.csv — approve (75)
Проверка «красного угла» корректна (INT0005 C).
### interiors/anti_patterns_ref.csv — approve (53)
### interiors/matcult_item_refs.csv — approve (458)

### containers/container_forms.csv — approve (55)
Ёмкости соответствуют v5. Отклонение для ларца (4 против 24) раскрыто. Confidence совпадает с matcult. Ушат и корчага — C с пометкой.

### containers/content_categories.csv — approve_with_limits (41)
14 категорий `proposed`: нужно решение category_registry. Колонки источника нет.

### containers/content_profiles.csv — approve_with_limits (65)
Профили жилища в основном C/contextual, и это честно отмечено.

### containers/content_profile_entries.csv — approve_with_limits (152)
Нарушения собственного FREQ_RULE (common = «прямо названо источником A/B»):
- `cp_bathhouse_tub` и `cp_bathhouse_bucket` / content_water — common на основании только `master:spawn:SPN021` (кандидат). По правилу это contextual.
- `cp_market_merchant_chest` / content_weights — common на основании SCN055, у которой confidence **C**, и сцена не говорит, что гири лежат в сундуке. По правилу это contextual.
- `cp_dwelling_trough` / content_flour — common на основании SCN019 (пекарня), а не жилища.

### containers/place_containers.csv — **rework** (131)
1. Ошибка вывода из MASTER. Предметы `context_anchor_item_ids` (например ARC0026 — сам погреб) размножаются на все архетипы профиля. Поэтому `ct_cellar_pit` есть в `arable_field`, `market_square`, `smithy`, `fishing_camp`, `ordinary_workshop`, `monastery_yard`, `town_courtyard`, а строительные ведро и корзина (CON0004, CON0005 из SPN030) попали в `church_interior`. Нужно брать только `canonical_existing_item_ids` и/или исключать постройки (ARC*).
2. Дыры покрытия. У 19 из 55 форм нет ни одной строки присутствия, среди них фиксированные `ct_woodpile` (у её профиля класс **ubiquitous**), `ct_zakrom`, `ct_feed_manger`, `ct_trade_bin`, `ct_boat_hold`, `ct_basket_fish`, `ct_lukoshko`.
3. Семейства `peasant_homestead` (основной сельский двор) в таблице нет совсем: крестьянский двор не получает ни одной ёмкости. README говорит о «22 семействах», но это не те семейства, что нужны.
- Нужно: добавить к сценам источник присутствия из `content_profiles.pf_ids` (с классом по основанию профиля) и пересобрать.

### containers/item_to_container_crosswalk.csv — approve_with_limits (87)
Механическое соответствие, в целом верное. ARC0026 (постройка) → `ct_cellar_pit` и порождает артефакт п. 1 выше. Колонки источника нет.

### containers/first_open_rule.json — approve_with_limits (1)
- Id временного правила указан как `novgorod_famine_1230`; в репозитории запись — `record:historical_phase_local_effect_rules:novgorod_famine_1230_v2`.
- Ссылки на решения #133 D3/D6/D14 ведут в scratchpad, а не в репозиторий.

### landmarks/landmarks.csv — approve_with_limits (76)
- 67 строк воспроизводятся из SQLite без правки. Вымолы подтверждены WK (civic-space, Тихомиров).
- Колонка `v6_name_match` — **rework колонки**. Подстрочное сравнение даёт ложные совпадения:
  - Торг → «Верхние Луга на Полисти: торг»;
  - Рюриково Городище → «Мховое у Торжка: городище»;
  - Немецкий вымол → «Немецкий двор у Торга»;
  - Людин конец → «Гончарная слобода Людина конца».
  
  К тому же результат недетерминирован: пересборка даёт другие значения. Нужно точное совпадение или ручной crosswalk.
- `lm_x_khutyn_monastery`: сайт музея говорит «в 1192 г. Варлаам **заложил каменный** храм Спаса». Формулировки «деревянный, затем каменный… освящён 1192» в источнике нет. Переписать (то же в `sources.csv`).
- Загородский конец «существует к 1230» (B) импортирован из SQLite. Стоит сверить дату первого упоминания.

### ambience/settlement_ambience_texts.csv — approve_with_limits (168)
- Переоценка B: 4 строки `peasant_homestead` / smoke (001–004) опираются на editorial WK claims и matcult INT0006 (C). По правилу README это **C**.
- Голодные B-тексты содержат детали, которых нет ни в НПЛ, ни в famine_prices: «мерку берут вполовину меньше прежнего», «хлеб продают малыми мерами», «придут ли возы с низу». Либо C, либо убрать детали.
- Нет взаимного исключения. `sat_market_square_voices_autumn_156` «Много нового хлеба и рыбы» (presence:market_day) сработает и в фазе голода осенью 1230 г. — а это стартовый год игры. Нужен гейт `not presence:famine_1230` у изобильных текстов.
- В `requires_presence_ref` у peasant_homestead входит `bt_horomy`: список жилищ общий.
- `sat_village_lane_traces_winter_029` («жёлтые пятна от скотины») ссылается на `fauna-chicken-dust-bathing` (неверная атрибуция), а гейт стоит на presence:people вместо presence:livestock.

### ambience/presence_tokens.csv — approve_with_limits (9)
Нет confidence. `presence:famine_1230` должен ссылаться на запись temporal-v4 `…novgorod_famine_1230_v2`.

### ambience/g4_human_layer_binding.csv — approve_with_limits (7)
Все строки C (авторская привязка по source_place_type); нужна сверка с place_binding и паспортом памятника Заостровья.

### sources.csv — approve_with_limits (44)
Заметки к `ref:*` нужно исправить по пунктам выше:
- arhitekto — водостоки XVII в.;
- dissercat_ljudin — датировки подклетов и пятистенка;
- rsl_zasurcev_search — только карточка, фактов нет;
- novgorodmuseum_khutyn — «заложил каменный храм 1192».

### scripts/ (build.py, validate.py)
build.py детерминирован для всех файлов, кроме `v6match` в landmarks. validate.py не ловит:
- дыры `place_containers` (формы и семейства без присутствия);
- нарушения FREQ_RULE по уровню основания;
- взаимоисключение ambience.

## Что сделать до утверждения (минимум)
1. Пересобрать `place_containers` (без anchor-построек, с присутствием из профилей, с peasant_homestead).
2. Исправить атрибуции: водостоки, подклет, пятистенок, Хутынь; убрать 17 м пролёта и 2–8 м лестницы погреба; не применять размер жилищ к церкви.
3. `sc_scn020`: перепривязать и исправить sensory; `sc_scn035`: «цепы» вместо «серпов».
4. FREQ_RULE: 4 записи понизить до contextual.
5. Ambience: 4 smoke-строки перевести в C; убрать домыслы из голодных текстов; добавить гейт против голода у изобильных текстов.
6. landmarks: `v6_name_match` — точное совпадение или ручной crosswalk; сделать детерминированным.

## Исправления 2026-09-26

Исполнитель: агент-фиксер (label `fix-buildings-interiors-containers`). Правился только `containers/place_containers.csv` (rework-файл) и общие для группы `scripts/build.py`, `scripts/validate.py`, `containers/README.md` — по правилу задачи другие файлы группы не трогались (ambience/landmarks/scenes/buildings пункты 2–6 выше остаются как есть, до отдельной задачи).

- **`scripts/build.py` (`main`, блок `place_containers`)**:
  1. Убрали `context_anchor_item_ids` из вывода MASTER spawn-профилей — учитывается только `canonical_existing_item_ids`. Анкоры называют само место/постройку (например `ARC0026` — сам погреб, привязка `storehouse`), а не предмет, присутствующий в ней; при нескольких архетипах в одном профиле анкор размножался на все их `pf_id`. Это убрало `ct_cellar_pit` из `arable_field`, `market_square`, `smithy`, `fishing_camp`, `ordinary_workshop`, `monastery_yard` (в `town_courtyard`/`peasant_homestead` он остаётся — по собственному, легитимному профилю `content_profiles:cp_cellar_pit`, а не по анкору).
  2. Для спавн-профилей, где среди `location_archetypes` есть `construction_site` (в данных группы — только `SPN030`, `["construction_site","church"]`), архетип `church` исключён из проекции: предметы такого профиля (стройматериалы/инструменты стройки — `CON0004` ведро, `CON0005` корзина) относятся к стройплощадке, а не к убранству уже действующей церкви. `ct_bucket_staved`/`ct_basket_woven` больше не попадают в `church_interior`.
  3. Добавлен третий, явный источник присутствия — `containers/content_profiles.csv`: для каждого профиля форма считается присутствующей в каждом из его `pf_ids` (кроме `*`, носимое — не привязано к семейству места) с классом = максимальный `frequency_class` среди записей содержимого профиля; `basis_ref = content_profile:<cp_id>`. Закрыло дыры покрытия для форм, у которых был профиль, но не было сцены/spawn-совпадения — включая все примеры из вердикта: `ct_woodpile` (класс `ubiquitous`, как и было у профиля), `ct_zakrom`, `ct_feed_manger`, `ct_trade_bin`, `ct_boat_hold`, `ct_basket_fish`, `ct_lukoshko`. Также появилось семейство `peasant_homestead` (9 строк: поленница `ubiquitous`; вёдра, ясли, кадка, подойник `common`; корзина, погреб, ушат `contextual`) — ранее отсутствовало полностью.
  - Оставшиеся 5 форм без строки присутствия (`ct_belt_pouch`, `ct_birchbark_case`, `ct_flask_wooden`, `ct_pouch_small`, `ct_sword_scabbard`) — не дефект: их единственный профиль имеет `pf_ids="*"` (носимое при себе, любое место), для `place_containers` (таблица «семейство места → форма») это не применимо.
- **`scripts/validate.py`**: добавлен токен `content_profile:<cp_id>` в `check_ref` (сверяется с множеством `cp_id` из `containers/content_profiles.csv`) — новый тип `basis_ref`, введённый правкой build.py.
- **`containers/README.md`**: счёт `place_containers.csv` 131 → 186, «22 семейства» → «26 семейств» (после правки семейств больше — учтены и ранее скрытые пробелами `river_channel`, `lake_shore`, `ferry_landing` и др.); в правило `place_containers` добавлено описание третьего источника присутствия и исключений (`context_anchor_item_ids`, `construction_site`+`church`).
- **Пересборка и проверка**: `python scripts/build.py` — все 22 файла группы перегенерированы; отличие от предыдущей версии — только `containers/place_containers.csv` (131 → 186 строк) и `scripts/build_counts.json` (то же поле); остальные файлы идентичны предыдущей версии (детерминированность build.py вне правленого блока не нарушена). `python scripts/validate.py` — `RESULT: PASS errors=0 warnings=41` (то же число предупреждений, что и до правки; список предупреждений — только landmarks `v6_name_match`, не в объёме этой правки).
- **Не исправлено в этом проходе** (не входит в rework, отдельные пункты вердикта по другим файлам группы): building_types/building_parts/building_type_parts атрибуции и анахронизмы, scenes sensory/привязка SCN020/SCN035, content_profile_entries FREQ_RULE-нарушения (4 строки), ambience переоценка B и взаимное исключение, landmarks `v6_name_match`. Список из `containers/README.md` «Известные пробелы» не изменён.

## Повторная проверка 2026-09-26

Кто: независимый перепроверяющий (старший проход, не фиксер). Данные не правились; дописан только этот раздел. Скрипты проверки — в scratch (`gb-fix-buildings-interiors-containers/recheck/`), в репозиторий не добавлялись.

### containers/place_containers.csv — approve_with_limits (186)

**Детерминированные проверки:**
- Пересборка `build.py` в копии: `place_containers.csv` и `build_counts.json` побайтно совпадают с файлами в группе. Отличается только `landmarks.csv` (известная недетерминированность `v6_name_match`). Поэтому фраза фиксера «остальные файлы идентичны» верна только для этого прогона.
- Реконструкция старой логики (с anchor-предметами, без исключения church, без третьего источника) даёт ровно 131 строку. Значит, дифф 131 → 186 объясняется только правкой.
- Независимый пересчёт правила (отдельный скрипт по `scenes.csv`, `item_to_container_crosswalk.csv`, MASTER `spawn_profiles.csv`, `content_profiles*.csv`) даёт 186 = 186. Ключи совпадают, классы совпадают у всех 186 строк. Дублей (pf_id, ct_id) нет.
- `validate.py`: PASS, errors=0, warnings=41 (все предупреждения — landmarks).
- Семейств стало 26: добавлены `peasant_homestead`, `lake_shore`, `village_lane`, `winter_ice_crossing`. Строки по классам: ubiquitous 10→14, common 29→79, contextual 92→93. У 83 строк единственное основание — `content_profile:*`.

**Пункты rework:**
1. Ошибка вывода — **исправлено**. `ct_cellar_pit` остался только в `cellar_granary` (SPN007 canonical + cp_cellar_pit), `town_courtyard` и `peasant_homestead` (cp_cellar_pit, C/contextual). В `church_interior` нет ведра и корзины SPN030, там только SCN009, cp_church_chest и cp_church_amphora.
2. Дыры покрытия — **исправлено**. Без присутствия 5 форм из 55, и все они носимые с `pf_ids="*"` (belt_pouch, birchbark_case, flask_wooden, pouch_small, sword_scabbard); это обосновано. Все 7 названных форм присутствуют, `ct_woodpile` имеет класс ubiquitous (профиль A, SCN002).
3. `peasant_homestead` — **исправлено**: 9 строк, состав правдоподобен для крестьянского двора 1230 г.

**Выборка (15 строк, seed 20260926), сверка с источниками:**
- 8 сценовых строк сверены с `sources/material-culture-scenes-v1/scenes.csv`: `road/ct_quiver` (MIL0027 required в SCN045), `river_channel/ct_barrel_cargo` (TRD0047 req SCN027, allowed SCN026), `cellar_granary/ct_barrel_cargo` (SCN023), `dwelling_interior/ct_lar_plank` и `cellar_granary/ct_lar_plank` (FUR0006 req SCN004/049, allowed SCN058), `cellar_granary/ct_milk_pail` (AGR0001 allowed SCN033 — известная аномалия, раскрыта ранее). Всё верно.
- 4 строки MASTER сверены с `spawn_profiles.csv`: `arable_field/ct_sack_grain` (SPN037 AGR0011), `cellar_granary/ct_fish_tub` (SPN026 FSH0017), `monastery_yard/ct_sack_cloth` (SPN032 HOU0015), `cellar_granary/ct_basket_grain` (SPN019 AGR0010). Всё верно.
- 6 строк `content_profile` (cp_storehouse_lar, cp_threshing_grain_basket ×2, cp_dwelling_chest_domed, cp_cellar_pit, cp_dwelling_storage_pot, cp_dwelling_casket): класс = максимум по записям. Это соответствует заявленному правилу и основанию профиля.

**Ограничения (исправить при следующей пересборке; rework не требуют):**
- a. **Унаследованы нарушения FREQ_RULE.** Четыре профиля с нарушениями (см. `content_profile_entries`) дают необоснованный common: `dwelling_interior/ct_chest_merchant` (купеческий сундук как common в любом жилище), `market_square/ct_chest_merchant`, `dwelling_interior/ct_trough_dugout`, `ordinary_workshop/ct_trough_dugout`. У bathhouse класс не меняется, он уже ubiquitous по сцене. Строки исправятся сами после понижения 4 записей и пересборки.
- b. **Потеря provenance в `add_pc`.** Когда класс повышается, `basis_ref` заменяется, а не объединяется. У 15 строк пропали прежние ссылки: у 4 — сценовые (например, `dwelling_interior/ct_bucket_staved` теряет SCN001/SCN002/SCN049 и SPN021; `cellar_granary/ct_barrel_oak` теряет sc_x003 и SPN003/007/018/032). Класс при этом верен. Нужно объединять ссылки при повышении класса.
- c. **Лишнее удаление anchor-предметов.** Отброшены все `context_anchor_item_ids`, а не только постройки ARC*. Из-за этого пропали 2 законные строки: `cellar_granary/ct_chest_domed` (FUR0012, SPN003) и `monastery_yard/ct_shelf_storage` (INT0013, SPN033). Рекомендация исходного вердикта была «исключать ARC*».
- d. Класс профиля переносится на все его `pf_ids`, хотя основание касается одного места. Например, `cp_threshing_grain_basket` (common по SCN035 — гумно) даёт common в `cellar_granary` и `arable_field`. Утверждающему стоит решить, ограничивать ли вне первичного места класс до contextual.

**Итог повторной проверки группы:** rework снят. `place_containers.csv` — approve_with_limits (пункты a–d). Остальные вердикты раздела «Вердикты по файлам» не пересматривались и остаются в силе.
