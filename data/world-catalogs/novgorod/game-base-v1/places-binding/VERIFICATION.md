# VERIFICATION — places-binding (семейства мест, привязка узлов, носитель наличия, реестр категорий)

- **Кто:** независимый агент-верификатор (старший проход, не автор), метка `verify-places-binding`.
- **Когда:** 2026-09-26.
- **Что проверено:** `data/world-catalogs/novgorod/game-base-v1/places-binding/` — все 13 CSV, `presence/frequency_rule.json`, `inputs/pr98-extract.json`, `reports/validation.json`, скрипты и ручные crosswalk (`scripts/pf-authoring.json`, `scripts/crosswalk-rules.json`).
- **Как:** одноразовые node-скрипты во временной папке (удалены). Они пересчитали строки, проверили наличие `source_refs`/`confidence`, дубли id и контента, а также сверили строки с источниками: WK production-v1 `place-first-cartography.json` + `runtime-bundle.json`, v6 TSV, pr98 m2c-natural / m2c-npc / regional-environment, MASTER `item_location_links` / `spawn_profiles`, v5 item-container tables, пул items-household-personal. Ручные поля оценены по суждению. Данные не правились; `validate.mjs` не запускался, потому что он перезаписывает `reports/`.
- **Выборка:** механически сверены **все** строки facets (171), families (44), v6 crosswalk (198, счётчики), scene crosswalk (17), MASTER crosswalk (32), G4 node_binding (32 + согласованность 195 G5), presence_rules (904 против пула), place_template-лимиты (29), G4-лимиты (32), параметры со значением (870), sha256-пины (9). По смыслу вручную прочитано больше 150 строк: все 44 семейства, 41 строка v6 crosswalk, все 32 G4 и 28 G5, 17 scene, 32 MASTER, около 60 строк presence (в том числе все 82 ubiquitous), 4 строки presence прослежены до строк MASTER, 40 строк лимитов.

## Сводка

| Файл | Строк (скрипт) | README | Вердикт |
|---|---|---|---|
| places/place_families.csv | 44 | 44 | approve_with_limits |
| places/place_family_facets.csv | 171 | 171 | approve |
| places/crosswalk_v6_g4_location_types.csv | 198 | 198 | approve_with_limits |
| places/crosswalk_scene_templates.csv | 17 | 17 | approve_with_limits |
| places/crosswalk_master_location_archetypes.csv | 32 | 32 | approve |
| places/node_binding.csv | 227 | 227 | approve_with_limits |
| presence/frequency_rule.json | 4 класса | — | **rework** |
| presence/presence_rules.csv | 904 | 904 | **rework** |
| categories/place_family_categories.csv | 61 | 61 | approve_with_limits |
| categories/category_registry.csv | 706 | 706 | **rework** |
| limits/place_generation_limits.csv | 105 | 105 | approve_with_limits |
| limits/audit_comparison.csv | 256 (53/182/21) | 256 (53/182/21) | approve |
| parameters/parameter_definitions.csv | 16 | 16 | approve_with_limits |
| parameters/category_parameters.csv | 3 697 (870 со значением) | 3 697 / 870 | approve_with_limits |
| inputs/pr98-extract.json | 9 пинов | — | approve |
| reports/validation.json | 19 проверок | 16/16 + 3 INFO | approve_with_limits |

Общий вердикт группы: **approve_with_limits**. Ключ (семейства, фасеты, crosswalk, привязка узлов, лимиты, параметры) годен как candidate. Носитель наличия и реестр категорий нужно переделать до использования. Всё остаётся candidate и требует решения владельца там, где это отмечено.

Выдумки фактов, анахронизмов в собственных данных группы и коллизий id не найдено. Дубли id есть только в `audit_comparison.csv`, где по построению на один `scope_ref` приходится несколько полей.

## По файлам

### places/place_families.csv — approve_with_limits
- Механические поля из WK сходятся во всех 44 строках: `facet_count`, `wk_claim_ref_count`, `composes_with`, `description_en`, `wk_family_ref`.
- Ручные поля правдоподобны: имена ru/en, `pf_kind`, слои, шаблоны, архетипы MASTER. Например, у `pf_broadleaf_woodland` честно отмечено, что широколиственные участки в Новгородской земле локальны. Ветряная мельница верно исключена.
- Проблемы:
  1. `template_refs_not_in_novgorod_candidate` смешивает два разных случая: шаблон «не продвинут» и шаблон **явно исключён** утверждённой региональной аттестацией (`regional-environment/.../candidate.json` `explicit_exclusions`, `existing-promotions-approval-attestation.json`). Для `pf_mill` явно исключены все четыре регионально значимых шаблона: `lu_watermill_water_management`, `pt_watermill_site`, `wb_mill_leat`, `wb_reservoir_impoundment`. Для `pf_ordinary_workshop` явно исключён `pt_shipyard_boatyard`. Нужна отдельная пометка `excluded_in_region`. Сейчас `pf_mill` («Мельница (водяная)») для Новгорода 1230 фактически запрещён, а в данных это подано только как «не подтверждено».
  2. `pf_grain_drying_shed_ovin` → `pt_drying_storage_workspace`: такой строки нет в seed, в кандидате она имеет статус `pending_independent_review`. Ссылка не помечена ни как not-in-candidate, ни как pending.
  3. Ручной crosswalk (`pf-authoring.json`) имеет confidence C и требует отдельного утверждения.

### places/place_family_facets.csv — approve
- Все 171 строка совпадают с WK: facet, порядок, coverage, needs, limits, claim_refs. Все 806 ссылок на claims существуют в `runtime-bundle.json`, и у всех статус approved.
- Ограничение, не блокирующее: confidence B стоит на всех строках, хотя 11 процитированных claims имеют `qualifiers.confidence=low`.

### places/crosswalk_v6_g4_location_types.csv — approve_with_limits
- `v6_row_count` сходится с TSV для всех 198 типов (9 332 строки). Из 41 прочитанной строки маппинг правдоподобен у 39.
- Проблемы:
  1. Непоследовательность: `brine_source` помечен not_applicable, потому что нет солеваренного семейства. При этом `boiling_house` (варница, pt_saltworks) и `master_yard` (pt_saltworks) отнесены к `pf_ordinary_workshop` / `pf_rural_yard`. Надо выбрать один подход.
  2. `well_or_spring` (pt_hillfort_gorodishche) отнесён только к `pf_town_courtyard`. Это слабая привязка, и вместе с пробелом «колодец» её стоит пересмотреть.

### places/crosswalk_scene_templates.csv — approve_with_limits
- `g5_count_v17` сходится для всех 17 строк.
- Проблема: универсальные шаблоны сцен отнесены и к городским семействам (`g5_boundary_access` → `pf_town_wall_edge`, `g5_landing_transition` → `pf_river_wharf`). Через node_binding это протекает на сельские и устьевые узлы (см. ниже).

### places/crosswalk_master_location_archetypes.csv — approve
- `item_location_link_count` сходится для всех 30 архетипов из `item_location_links`. `poor_house` и `wealthy_house` есть только в `spawn_profiles`. Значения `max_concrete_items` совпадают с `spawn_profiles`.
- Ограничение: `boat` → `pf_river_channel` приводит к тому, что лимит R4 (items_notable_max = 18) получают все G4 речного русла. Это лимит «лодки», а не «русла».

### places/node_binding.csv — approve_with_limits
- Все 32 G4: `landscape`/`water_body`/regional link ids в точности равны `template_refs` из m2c-natural. Основной pf следует оси `function` и правдоподобен.
- Все 195 G5: родитель и унаследованные шаблоны согласованы, расхождений 0. В 28 прочитанных G5 основной pf правдоподобен (правила 1–4).
- 7 типизированных пробелов (burial area) обоснованы.
- Проблема: `pf_secondary` — механическое объединение семейств из crosswalk шаблонов сцен, и его семантика нигде не определена.
  - 23 узла получают городские семейства: `pf_town_wall_edge` в 7 строках (устьевые `mixing_reach`, `outer_exposed_approach`, кладбищенская зона и их G5); `pf_river_wharf` («Городская пристань») в 16 строках (например `dry_island_ridge`, `vikhtuy_locality`, `zaostrovye_landing`) в сельских низовьях Двины.
  - Если потребитель использует secondary как scope наличия, в дикое устье попадут предметы городского вала или пристани.
  - Нужно определить смысл `pf_secondary` и фильтровать его по осям узла и `composes_with`, либо убрать его из данных для наличия.

### presence/frequency_rule.json — rework
1. **Неверная атрибуция основания.** Правило ссылается на `nature-richness-candidate-v1.json` weight_policy (8/4/2/1). В источнике смысл весов прямо задан так: «Relative game selection preference among eligible alternatives … not archaeological frequency, biological abundance, encounter probability or yield». Правило превращает эти веса в абсолютную вероятность встречи (ppm) — в то, что источник исключает.
2. **Якорь «ubiquitous = обязательно (1 000 000 ppm)» — редакционный выбор, а не норма.** В §3A/§8.1 сказано только, что обязательное наличие *кодируется* как 1 000 000 ppm. Там нет утверждения, что верхний класс частоты обязателен.
   - Последствия в выборке: гребень с вероятностью 1,0 в каждой внутренности церкви и в каждом рыбацком стане; кодекс (книга) в каждом восьмом жилище (rare = 125 000 ppm).
3. Словари сезонов и `refresh_class` (`none|by_year_season`) соответствуют §8.1 — в этой части замечаний нет.
4. Что нужно: владелец задаёт калибровку ppm по классам (или правило «вес = относительный выбор внутри пула категории, а не ppm»); из basis убрать ссылку на nature-richness как основание для вероятности.

### presence/presence_rules.csv — rework
- Механически таблица верна. Все 904 строки находят свой `ipf_id` в текущем пуле. Класс, pf, категория, сезоны и confidence совпадают. ppm равен правилу. Дублей по (scope, region, category, seasons) 0.
- Проблемы:
  1. **Таблица устарела.** `items-household-personal/items/item_place_frequency.csv` изменён в 11:27, а таблица собрана в 11:22. Сейчас в пуле 1 401 строка с `category_id`; в README сказано про 1 032 принятых и 15 130 отклонённых.
  2. **Завышенные классы наследуются из пула и превращаются в ppm.** Строки MASTER `ILO005204` (гребень, scribe_area) и `ILO005205` (гребень, fishing_site) имеют `spawn_frequency=contextual`, `context_bound` и пометку «допустимость в локации не доказывает присутствие». В пуле они стали `ubiquitous`, здесь — 1 000 000 ppm (`pr_000122`, `pr_000329`). Кодекс `rare` в dwelling_interior и outbuildings — 125 000 ppm (`pr_000193`, `pr_000553`). Восковая табличка `common` в outbuildings — 500 000 ppm (`pr_000581`). Первоисточник ошибки — группа items, но в этой таблице такие значения не утверждаются.
  3. `count_limit` = 1 (`default_minimum_1`) во всех 904 строках: текстовое `count_limit_rule` пула не разобрано.
  4. Confidence B копируется из пула, хотя ppm выведен из правила C.
  5. Дедупликация «максимум ppm» по разным предметам одной категории меняет смысл вероятности. Правило заявлено, но требует решения владельца.
  6. Отклонения от §8.1 заявлены самим сборщиком и требуют CR: нет `rule_version`/`world_revision_id`/`subject_kind`, scope `place_family` вне нормы.
- Что нужно: пересобрать после исправления классов в пуле и калибровки правила.

### categories/place_family_categories.csv — approve_with_limits
- 61 строка. `stable_code` уникальны, родители резолвятся, циклов нет, 44 семейства совпадают с `place_families.csv`.
- Ограничения: у 16 узлов-«видов» пуст `name_ru`; колонки `confidence` нет.

### categories/category_registry.csv — rework
- Счётчики сходятся с отчётом (706; по origin 42/366/59/121/61/57).
- Проблемы:
  1. **Ошибка маппинга имён в сборщике.** `name_ru` пуст у всех 645 чужих строк. У 120 строк v5 русский `preferred_label` лежит в `name_en` (например, `cat_item_object_awl_v1` → name_en «шило»). У 121 строки proposed_new группы items потерян `preferred_label_ru`. У 59 строк garment нет имён.
  2. У 59 строк garment нет `stable_code`, родители `garment.kind` / `garment.component` не резолвятся.
  3. **Устарел.** `items-household-personal/items/item_categories.csv` изменён в 11:24, после сборки реестра в 11:22. `buildings-interiors-containers/containers/content_categories.csv` (11:24) не подхвачен.
  4. 39 id v17 группа items переиспользует с другим `stable_code`. Строка v17 сохранена, и это верно, но конфликт нужно снять в группе items.
  5. Нет `source_refs`/`confidence` на строку, есть только `origin`/`source_domain_file`. Для реестра-сборки это допустимо, но стоит указать это в README.
- 310 нерезолвленных ссылок из других групп верно вынесены в отчёт.

### limits/place_generation_limits.csv — approve_with_limits
- 29 строк по place_template сверены скриптом с `novgorod_g3_scale_register_v6.tsv` (число строк, `household_mix`, `g4_target`) — 0 расхождений. Диапазоны дворов R1 вручную проверены во всех 29 строках.
- 32 строки G4: `npc_present_min/max` совпадают с `m2c-npc` `g4_compositions`, `g5_anchor_max` — с числом канонических G5.
- Проблемы:
  1. Ключ scope неоднозначен: `pt_posad_suburb` встречается 4 раза (40–180, 60–250, 80–400, 400–1200 дворов), `pt_town` — 2 раза (300–900, 600–1600). У этих строк одинаковые `source_refs` без `g3_id`, и runtime не сможет выбрать строку. Нужен дискриминатор (g3_id) в id или ссылке.
  2. `items_notable_max` для G4 русла берётся из профилей «лодки» (см. MASTER crosswalk).
- Пробел по жителям заявлен честно. Замечание на будущее: писцовые книги конца XV в. могут дать реконструкцию уровня C «людей на двор» только по решению владельца. Выдумывать число нельзя.

### limits/audit_comparison.csv — approve
- Пересчёт вердиктов дал 53 equal, 182 differs, 21 ours_gap — совпадает с README. Это сверочный отчёт, значения черновика не копировались.

### parameters/parameter_definitions.csv — approve_with_limits
- Пробелы словарей `value_band`/`durability_class`/`quality_class` заявлены. Колонки `source_refs` нет, основание — в `rule_basis`.
- У `flammable`/`floats` стоит B, но таблицы «материал → свойство» нет. Пока её нет, эти правила неисполнимы.

### parameters/category_parameters.csv — approve_with_limits
- Все 870 строк со значением (`value_is_sourced=true`) сверены скриптом с v5 (`item_templates`, `item_template_quantity_profiles`, `item_template_category_bindings`, `container_templates`, `container_template_facet_bindings`) — 0 расхождений.
- 2 827 строк без значения содержат только правило; чисел без источника нет.
- Ограничения:
  1. Значение хранится в колонке `allowed_values_or_range`: смешение «значения» и «допустимого диапазона».
  2. Масса из v5 — редакционная игровая оценка (`src_gameplay_physical_policy_v3`), поэтому C здесь верно.

### inputs/pr98-extract.json — approve
- Все 9 sha256-пинов совпадают с текущими файлами worktree PR #98.

### reports/validation.json — approve_with_limits
- Проверки воспроизводятся моими скриптами. Они не ловят смысловые проблемы, найденные выше: городские secondary, явные региональные исключения, устаревание относительно пулов, потерю имён в реестре.

## Что исправить до утверждения (коротко)
1. `frequency_rule.json`: убрать ложное основание, вынести калибровку ppm на решение владельца.
2. `presence_rules.csv`: пересобрать после исправления классов в пуле items (ubiquitous из contextual MASTER) и калибровки. Разбирать `count_limit_rule`.
3. `category_registry.csv`: исправить маппинг `name_ru`/`name_en` в `build-category-registry.mjs`, подхватить `content_categories.csv`, пересобрать.
4. `node_binding.csv`: определить семантику `pf_secondary` и отфильтровать городские семейства на сельских и устьевых узлах.
5. `place_families.csv`: отдельно пометить явные региональные исключения (`pf_mill`, `pt_shipyard_boatyard`) и pending `pt_drying_storage_workspace`.
6. `place_generation_limits.csv`: добавить дискриминатор g3 для повторяющихся `pt_posad_suburb` и `pt_town`.

## Исправления 2026-09-26

- **Кто:** агент-фиксер (не тот же проход, что верификация выше), метка `fix-places-binding`.
- **Скоуп:** только 3 файла, отмеченные `rework` (`presence/frequency_rule.json`, `presence/presence_rules.csv`, `categories/category_registry.csv`), их README и билд-скрипты (`scripts/build-presence-rules.mjs`, `scripts/build-category-registry.mjs`). Остальные файлы группы не менялись; `node scripts/validate.mjs` после правок — 16/16 own checks PASS (см. `reports/validation.json`).

### `presence/frequency_rule.json`
- Убрана ложная атрибуция: `basis` больше не приписывает числовой ряд ppm (1 000 000/500 000/250 000/125 000, отношение 8/4/2/1) источнику `nature-richness-candidate-v1`. Явно указано, что этот источник даёт только словарь меток (dominant/common/occasional/rare) и прямо пишет, что его веса — не частота находок, не вероятность встречи; числовой ряд — собственная редакционная конвенция сборщика, confidence C.
- Явно отделено: норма §8.1 задаёт только кодирование обязательного наличия (правило = 1 000 000 ppm), а не то, что верхний класс частоты обязателен — это тоже открытое решение владельца, а не факт из нормы.
- Добавлено поле `status_note`: значения ppm — placeholder до калибровки владельцем.

### `presence/presence_rules.csv` (пересобрана скриптом `build-presence-rules.mjs`)
- **Пересобрана по актуальным пулам** (снимает устаревание, отмеченное в VERIFICATION): было 904 строки из 1 пула, стало 2 426 строк из 5 632 принятых строк 2 пулов (добавился `fauna-mammals-birds/fauna/wild_habitat_presence.csv`). 16 657 строк `item_place_frequency.csv` всё ещё отклонены (пустой `category_ref`) — гэп группы items, зафиксирован в отчёте и README.
- **Добавлена проверка по MASTER.** Сборщик теперь сверяет `master_link:<ILO...>` в `source_refs` со `spawn_frequency`, который сам MASTER (`sources/master-archive-v1/.../item_location_links.csv`, read-only источник game-base, не файл другой группы) приписывает каждой связи, и понижает заявленный пулом `frequency_class`, если он выше максимума среди процитированных связей (новая колонка `class_capped_from` хранит исходный класс). На пересборке сработало у 27 строк пула на уровне отдельной строки до слияния дублей; после слияния «максимум» по (scope, category) все 27 случаев получили опору от другого предмета той же категории с честной MASTER-связью, так что в финальной таблице `class_capped_from` пусто везде — механизм рабочий, просто эти конкретные примеры не всплыли после слияния. Задокументировано в `presence/README.md` как известный предел: проверка не ловит рассогласование `location_archetype` (пример гребня `it_ps_comb_double`, чьи `master_link` ссылаются на MASTER-архетип `scribe_area`/`fishing_site`, а пул заявляет присутствие в `church_interior`/`fishing_camp`) — это гэп мэппинга группы items-household-personal, не воспроизводимый детерминированной проверкой этой группы без их решения.
- **Confidence больше не наследуется вслепую.** Раньше `confidence` копировался из пула (в основном B), хотя `probability_ppm` выведен неутверждённым редакционным правилом (C). Теперь `confidence` в этой таблице всегда `C`; исходная оценка пула сохранена в новой колонке `pool_confidence`.
- `count_limit_rule` пула (свободный текст) по-прежнему не разбирается — задокументировано как гэп, требующий структурирования поля в items-household-personal, не наш файл.
- README (`presence/README.md`) переписан: актуальные счётчики, описание новых колонок, обновлённые «Известные пробелы».

### `categories/category_registry.csv` (пересобрана скриптом `build-category-registry.mjs`)
- **Исправлен маппинг имён.** Раньше единственное поле метки источника (`preferred_label`, `preferred_label_ru`) всегда шло в `name_en`, из-за чего у русских меток (v5 `cat_item_object_awl_v1` → «шило», items-household-personal `preferred_label_ru`) `name_ru` оставался пустым. Теперь сборщик определяет язык метки по наличию кириллицы (`namesFromLabel`) и кладёт её в `name_ru` или `name_en`; явные `name_ru`/`name_en` не переопределяются. Проверено точечно: `cat_item_object_awl_v1` → `name_ru=шило`; `cat_item_object_bagpipe_v1` → `name_ru=Новгородская волынка`.
- **Подхвачен `content_categories.csv`** (`buildings-interiors-containers/containers/content_categories.csv`, 41 строка, схема `content_category,name_ru,origin,status` без `domain`/`stable_code` — не проходила общий скан по заголовку). Добавлен явный адаптер: домен `container_content`, `content_category` = и `category_id`, и `stable_code`. 27 из 41 совпали с уже существующими id v17 (`item`-домен) и учтены как легитимное переиспользование; 14 новых строк вошли в реестр под новым доменом.
- Строк в реестре: 706 → 982. Рост — не расширение схемы, а то, что с прошлой сборки в репозитории появились/наполнились новые группы (fauna-mammals-birds 220 строк, flora-trees-shrubs 42), плюс 14 новых из `content_categories.csv`; это устраняет устаревание, отмеченное в VERIFICATION.
- **Не исправлено (не наш файл):** 59 строк `garment` (clothing-appearance) остаются без `stable_code` и без родителя — источник `garment_categories.csv` не даёт ни кода, ни имени ни в каком поле; выдумывать их нельзя. Задокументировано в README и в отчёте (`stable_code_missing`/`parent_missing`) как гэп группы clothing-appearance.
- README (`categories/README.md`) переписан: актуальные счётчики, описание маппинга имён и адаптера `content_categories.csv`, обновлённые «Известные пробелы».

### Не тронуто
`places/*`, `limits/*`, `parameters/*`, `inputs/pr98-extract.json`, `reports/validation.json` (перегенерирован запуском `validate.mjs`, но без изменений скрипта) — вне скоупа этой правки. `node scripts/validate.mjs` после правок: 16/16 own checks PASS, 3 INFO (внешние гэпы, ожидаемо).

## Повторная проверка 2026-09-26

- **Кто:** независимый повторный проверяющий (старший проход, не фиксер), метка `recheck-places-binding`.
- **Как:** одноразовые node-скрипты в scratch (`gb-fix-places-binding/recheck`, удалены). Они используют `scripts/lib.mjs` только для чтения. Данные не правились. Скрипты-сборщики не запускались, потому что они перезаписывают выходы.
- **Скоуп:** 3 файла со статусом rework, их сборщики и README.

| Файл | Строк (скрипт) | Вердикт |
|---|---|---|
| presence/frequency_rule.json | 4 класса | approve_with_limits |
| presence/presence_rules.csv | 2 426 | **rework** |
| categories/category_registry.csv | 982 | approve_with_limits |

### presence/frequency_rule.json — approve_with_limits
- П.1 снят. `basis` больше не выводит ppm из `nature-richness-candidate-v1`. Оттуда взят только словарь меток, а ряд 8/4/2/1 и ppm прямо названы редакционной конвенцией с confidence C.
- П.2 снят. Кодирование «обязательно = 1 000 000 ppm» по §8.1 отделено от вопроса, обязателен ли класс ubiquitous. Этот вопрос вынесен владельцу.
- П.4 выполнен частично. Калибровка ppm вынесена владельцу (`status_note`), но сама не сделана.
- Ограничение: пока владелец не утвердил калибровку, ppm — заглушка. `catalog.json` `conventions.frequency_class` по-прежнему пишет «политика richness M2c». Это файл вне группы.

### presence/presence_rules.csv — rework
Проверено скриптом: 2 426 строк; `pr_id` и ключи (scope, region, category) уникальны; пустых `source_refs` нет; `confidence` = C во всех строках; `pool_confidence` B 1 504 / C 922; `class_capped_from` пуст везде; `count_limit_basis` = `default_minimum_1` во всех строках. Выборка из 15 строк (через каждые 161, начиная со строки 8): у 9 строк fauna и 4 из 6 строк items класс равен максимуму по строкам пула, категория и pf совпадают.
1. **Проверка по MASTER не работает (новая ошибка).** `build-presence-rules.mjs` ищет файл по пути `path.join(GAME_BASE, 'sources/master-archive-v1/...')`, то есть `game-base-v1/sources/...`. Такого пути нет: файл лежит в `novgorod/sources/...`. `fs.existsSync` возвращает false, и Map молча остаётся пустой. В отчёте `class_capped_by_master_link` = 0.
   - Утверждение фиксера о 27 понижениях, которые «растворились при слиянии», ложно. Слияние сохраняет `class_capped_from`.
   - С правильным путём понизились бы 27 строк пула, а в 20 финальных ключах класс изменился бы: например, `pf_dwelling_interior|cat_item_object_ceramic_bowl_v1`, `cat_item_object_lock_v1` в cellar_granary/ordinary_workshop/outbuildings/smithy, `cat_item_object_iron_clamp_v1`.
   - Если источника нет, сборщик должен падать, а не молча пропускать проверку.
2. **Исходная проблема 2 не снята.**
   - Гребень по-прежнему получает 1 000 000 ppm: `pr_000300` (church_interior), `pr_000725` (fishing_camp).
   - Кодекс получает 125 000 ppm: `pr_000510` (dwelling), `pr_001661` (outbuildings).
   - Восковая табличка получает 500 000 ppm: `pr_001689` (outbuildings).
   - README утверждает, что проверка «ловит буквальный случай гребня ILO005204/5205». Это неверно даже при правильном пути: гребень цитирует также ILO005229 и ILO005230 (OMI00909, `ubiquitous`, scribe_area/fishing_site), поэтому максимум среди связей = ubiquitous. Корень проблемы — несовпадение архетипа (scribe_area → church_interior) в группе items.
3. **Новая ошибка: при слиянии теряются сезоны.** Ключ слияния (scope, region, category) не включает сезон. Новый пул fauna хранит отдельную строку на каждый сезон, поэтому 1 188 ключей fauna склеены. В 98 из них класс зависит от сезона, и после склейки он стал максимумом за все сезоны.
   - Пример: `pr_000473` — бурый медведь в `pf_conifer_woodland`, contextual 250 000 ppm на `winter;spring;summer;autumn`. В источнике зимой класс rare.
   - Сезонная частота из источника потеряна. Ключ должен включать сезон, либо нужно одно правило на каждый сезон.
4. **Таблица снова устарела.** Пул `items-household-personal/items/item_place_frequency.csv` перезаписан в 14:37:25, уже после сборки таблицы (14:36:43).
   - Сейчас в пуле 1 823 строки с категорией, а таблица собрана из 1 401.
   - По ключам (pf, категория): 411 ключей пула отсутствуют в таблице, 35 ключей таблицы исчезли из пула, у 63 ключей другой класс. Пример: `pr_000654` cord/field_margin в таблице contextual, в пуле сейчас rare.
   - Номера `#rowN` в `source_pool` указывают на чужие строки (например, `pr_000331` → row262 = flint/ordinary_workshop). Опираться нужно на `source_row_id`.
   - Пересборка возможна только после того, как группа items закончит правку.
5. Не нормализован `region_id`: встречаются значения `''`, `novgorod_land` и `ladoga_lake`, а в правилах scope используется `region_novgorod_land`. Замечание не блокирующее.
6. Открыты прежние п.3, п.5 и п.6: `count_limit` не разобран, слияние «максимум ppm» ждёт решения владельца, отклонения от §8.1 ждут CR.
- **Что нужно:**
  - исправить путь к MASTER (`path.join(GAME_BASE, '../sources/...')`) и сделать отсутствие источника фатальной ошибкой;
  - включить сезон в ключ слияния;
  - пересобрать таблицу после правки пула items;
  - исправить README: убрать утверждения о 27 понижениях и о том, что проверка ловит гребень.

### categories/category_registry.csv — approve_with_limits
Проверено скриптом.
- Строки: 982. `category_id` уникальны. По origin: v5 366, spatial 57, appearance 42, places-binding 61, items 121, fauna-mammals-birds 220, flora-trees-shrubs 42, clothing 59, buildings-containers 14.
- Дублей `stable_code` нет. Пустой `stable_code` и отсутствующий родитель — только у 59 строк garment. Отчёт это подтверждает: 788 нерезолвленных ссылок, 66 переиспользований, из них 39 с другим `stable_code`.

Итог по исходным проблемам:
- П.1 (маппинг имён) снят.
  - Все 366 строк v5 сверены с `preferred_label`: 0 расхождений; `cat_item_object_awl_v1` → `name_ru` = шило.
  - Все 121 строка items сверены с `preferred_label_ru`: 0 расхождений.
  - Кириллицы в `name_en` нет.
  - Пустой `name_ru` остался только там, где источник даёт латинскую техническую метку (246 строк v5, spatial, appearance) или вообще не даёт имени (garment 59, это гэп группы clothing), а также у 16 собственных видов place_family.
- П.2 (garment) остаётся ограничением группы clothing. Исходный `garment_categories.csv` действительно не имеет колонок имени и `stable_code`. При этом его `category_id` уже имеет точечную форму кода (`garment.kind.tunic_shirt`). Для `content_categories` фиксер использовал id как `stable_code`, а для garment — нет. Подход стоит сделать единым.
- П.3 (устаревание) снят. После сборки в 14:36:44 ни один файл определений категорий не менялся. `content_categories.csv` подхвачен: 41 из 41 строки есть в реестре, 27 из них как id v5, 14 новых. В 27 переиспользованных строках `name_ru` из content_categories не перенесён, так как у строки v5 нет русского имени. В README написано «часть без `content_category`», но пустых `content_category` нет. Это мелкая неточность.
- П.4 (39 id v17 с другим `stable_code`) — гэп группы items, без изменений.
- П.5: в README по-прежнему нет явной оговорки, что `source_refs` и `confidence` на уровне строки отсутствуют. Замечание не блокирующее.
- Выборка из 15 строк (по 2 на каждый origin) сверена с источниками: имена, домен, код и родитель совпадают.

## Правки rework (C001)

- Было: неверный путь к MASTER молча отключал проверку класса; сезонные строки сливались, обновлённый пул items не был подхвачен, свободный `count_limit_rule` игнорировался, README и валидатор утверждали неверный ключ слияния.
- Сделано: MASTER читается из `novgorod/sources` с фатальной ошибкой при отсутствии файла; сезон входит в ключ, сезонные списки развёрнуты; `count_limit_rule` распознаётся или отклоняется; итоговые `source_row_id` сохраняют все слитые строки. README и валидатор приведены к этим правилам. Таблица пересобрана после items: 10 555 правил из 6 038 строк пулов, 16 620 master-строк без категории отклонены, 100 итоговых правил имеют `class_capped_from`.
- Проверено: `node scripts/build-presence-rules.mjs` — сборка успешна; `node scripts/validate.mjs` — 16 PASS, 3 INFO, 0 FAIL. Бурый медведь в conifer_woodland: rare зимой, contextual весной/летом/осенью. `count_limit_basis=pool_count_limit_rule` у 6 324 итоговых строк.
- Ограничение: проверка MASTER не связывает архетип цитируемой связи с pf; слияние максимумом внутри категории и сезона и ppm остаются редакционными кандидатами.
## Независимая проверка C001 (Claude Opus 5.5, коммит 5ec3e1f9)

Проверка отдельного прохода, не автора правок. Вердикт `rework` означает, что артефакт возвращён исполнителю; `approve_with_limits` — годен для M2c с перечисленными ограничениями; статус данных остаётся `candidate` до утверждения набора.

### presence/presence_rules.csv — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C001, коммит 5ec3e1f9).

**Как проверял.** Одноразовые node-скрипты во временной папке, после проверки удалены. Они независимо пересчитали таблицу по текущим пулам (`item_place_frequency.csv`, `wild_habitat_presence.csv`) и MASTER `item_location_links.csv`. Сборщики и `validate.mjs` не запускались.

**Общие цифры.** 10 555 правил: 0 отсутствующих, 0 лишних, 0 расхождений по классу, `class_capped_from` и `source_row_id`. Ссылки `#rowN` совпадают с `source_row_id` у всех строк. Ни одно значение не выдумано.
- `confidence` = C у всех 10 555 строк, `status` = candidate у всех. Цитат в таблице нет. Дат нет, поэтому D19/D22 здесь не применяются.
- Выборка: 16 строк по всей таблице (через каждые 660), 2 строки с ladoga_lake и 3 строки с понижением класса. Каждую прослеживал до строки пула и связи MASTER, все совпали.

**Замечания прошлого раунда:**
1. **Путь к MASTER — исправлено.** Путь `../sources/...` правильный. Если файла нет, сборка падает. Неизвестный ILO тоже приводит к ошибке. Понижено 27 строк пула, после разворота по сезонам это 100 правил.
2. **Гребень, кодекс, табличка — не исправлено, перенесено в ограничения группы items.**
   - Гребень получает 1 000 000 ppm в `pr_001219`–`pr_001222` (church_interior) и `pr_003001`–`pr_003004` (fishing_camp).
   - Кодекс получает 125 000 ppm в `pr_002153`–`pr_002156` и `pr_007321`–`pr_007324`.
   - Табличка получает 500 000 ppm в `pr_007429`–`pr_007432`.
   - README теперь честно говорит, что проверка этого не ловит.
3. **Сезоны — исправлено.** Сезон входит в ключ слияния. Строк со значением `all` нет, дублей по пятичленному ключу 0.
   - Медведь в conifer_woodland: зимой rare (`pr_002008`), в остальные сезоны contextual (`pr_002005`–`pr_002007`).
4. **Устаревание — исправлено.** Таблица совпадает с пулами на 5ec3e1f9. Принято 6 038 строк, отклонено 16 620.
5. **`region_id` — не исправлено.** Значения: `''` 6 324, `novgorod_land` 4 222, `ladoga_lake` 9. Замечание не блокирующее.
6. **Прежние п.3, п.5 и п.6.**
   - `count_limit_rule` теперь разбирается: основание `pool_count_limit_rule` у 6 324 строк, `default_minimum_1` у 4 231. Все лимиты = 1, как в пуле.
   - Слияние по максимуму ждёт решения владельца, отклонения от §8.1 ждут CR.
   - Утверждения README о 27 понижениях и о том, что проверка ловит гребень, убраны.

**Находки (все minor):**
- У 20 строк `class_capped_from` = common, хотя итоговый класс тоже common: его дал другой, не пониженный предмет той же категории. Это `pr_001347`–`pr_001350`, `pr_002437`–`pr_002440`, `pr_002505`–`pr_002508`, `pr_002597`–`pr_002600`, `pr_007137`–`pr_007140`. Настоящих понижений 80, а не 100, как пишут отчёт и README.
- В `frequency_rule.json:24` правило для `count_limit` не обновлено: разбор `count_limit_rule` описан только в README и скрипте.
- Единица лимита теряется: piece, set, pair, bundle, portion.

**Ограничения для M2c:**
- ppm — редакционная заглушка (C) без калибровки владельцем.
- Строки из пула items для гребня, кодекса и таблички нельзя брать как есть, пока группа items не поправит сопоставление архетипов.
- scope `place_family` вне §8.1 (`no_needs_cr`) требует CR.
- `region_id` нужно нормализовать до привязки в runtime.
- Проверка по MASTER не сверяет архетип цитируемой связи с pf.

## Правки rework (C001b)

- `validate.mjs` проверяет закреплённый `inputs/pr98-extract.json` и файлы текущего репозитория без зависимости результата от наличия соседнего PR98 worktree; поле `pr98_worktree_checked` удалено из сохраняемого отчёта.
- `node scripts/validate.mjs`: 18 собственных проверок PASS, 3 внешних INFO. Неразрешённые ограничения presence и замечания minor выше остаются.

## Правки C002 — people presence

- `presence/people_presence_authoring.csv`: 19 candidate-привязок к 16 PF; 4 сезона и `morning|day|evening|night` разворачиваются в 69 правил. Subjects резолвятся в действительных региональных словарях social roles и occupations. Норматив §8.1 взят read-only из `Novgorod-runtime`.
- `scripts/build-presence-rules.mjs`: прежние 10 555 category rules сохранены без изменения прежних колонок и ID (сравнение CSV с `git show HEAD`). Итог — 10 624 правил. Вероятность 250 000 ppm и лимит 1 у людей — явные редакционные candidate-правила без числового исторического источника; `guards` ещё не runtime expressions.
- `scripts/validate.mjs`: уникальность включает subject, сезон и время суток; словари subject/season/time, 16 PF и охват базового binding 32 G4/195 G5 проверяются. Те же 16 PF обязаны присутствовать во всех пяти crosswalk C002; их ключи, статусы и PF-ID также проверяются.
- Запуски: генератор дважды, SHA-256 CSV и report совпали; `node scripts/validate.mjs` — 17 own PASS, 3 external INFO; оба `node --check` и `git diff --check` — PASS. Внешние INFO: 16 620 строк пулов без категории, 118 проблем внешнего реестра и 788 ссылок пулов без категории.
- Ограничение: `place_family`, время суток и строковые guards не входят в текущий DDL §8.1; все строки остаются `candidate`, не approved/active.

## Независимая проверка C001b/C002 (Claude Opus 5.5, коммит fe11f19b)

Второй проход, отдельный от автора правок. `rework` — возвращено исполнителю; `approve_with_limits` — годно для M2c с перечисленными ограничениями; статус данных `candidate` до утверждения набора.

### presence/people_presence_authoring.csv — rework
Проверено: Claude Opus 5.5 (независимая проверка C001b/C002, коммит fe11f19b).

- **Как проверял.** Все 19 строк сверены с профилями, на которые они ссылаются: `data/novgorod-region/novgorod_occupations_v1.tsv` и `novgorod_social_roles_v1.tsv` (поля where_work_happens, typical_places, typical_g3_place_types, seasonality, daily_schedule_*). Сборщик не запускал.
- **Что в порядке.** Все subject_ref резолвятся. Везде `candidate` и `C`, цитат и дат нет. Вероятность 250 000 ppm и `count_limit=1` в README честно названы редакционными.
- **major — «хозяин двора» в деревне.** В строках 10, 11, 16, 17, 18 (`pr_010584`–`pr_010591`, `pr_010605`–`pr_010616`, 20 из 69 правил) `nov_role_householder` поставлен на `pf_peasant_homestead`, `pf_village_lane`, `pf_rural_yard`.
  - Процитированный профиль даёт места «Новгород; посад; двор; ремесленная улица; торг» и g3 city/posad/estate, то есть городской двор.
  - В том же файле есть подходящий `nov_role_smerd_householder` («село; деревня; погост; двор; гумно; покос»).
  - Ссылка на источник не подтверждает эту привязку.
- **minor — проводник на болоте и ручье.** `nov_occ_route_guide` стоит на `pf_bog` и `pf_marshy_stream` (`pr_010575`–`577`, `pr_010601`–`604`), а по профилю он работает на «дорога; переправа; пристань; волок; зимник; постой». Привязка редакционная, но не помечена.
- **minor — лодочник зимой.** Лодочник на открытом русле зимой (`pr_010556`) получает те же 250 000 ppm, что летом, хотя профиль требует не использовать занятие одинаково весь год. Сдерживает только текстовый guard.
- **minor — guards.** 10 guard-токенов (`route_passable`, `inhabited_household` и др.) нигде не определены: нет словаря, смысла и владельца вычисления.
- **minor — ссылка на правило.** `source_rule_ref=frequency_rule.json#editorial_candidate` ведёт на несуществующий ключ. Правило для людей (класс, лимит, словарь `morning|day|evening|night`) записано только в README и скрипте. Словарь времени суток без источника и расходится со словарями в коде.
- **Ограничения.**
  - Один subject на PF, почти везде только `day`. Ночь есть лишь у homestead, вечер у rural_yard.
  - 7 узлов zaostrovye_burial_area без pf остаются без людей.
  - REQ-22 (ночная стража) к 16 PF стартовой территории не применим.

### presence/presence_rules.csv — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C001b/C002, коммит fe11f19b).

- **Как проверял.** Одноразовые read-only node-скрипты во временной папке, после проверки удалены. Сравнивал таблицу на 5ec3e1f9 и на fe11f19b и разворачивал authoring-файл независимо. Сборщик и validate не запускал.
- **Категориальные правила не тронуты.** Все 10 555 прежних строк на месте с теми же `pr_id`; по всем 20 прежним колонкам 0 расхождений. Новые колонки у них заполнены согласованно: `subject_kind=category`, `subject_ref=category_ref`, `allowed_times=all`, пустые `guards` — 0 нарушений.
- **Правила людей.** 69 строк (`pr_010556`–`pr_010624`) точно совпадают с развёрткой 19 authoring-строк по сезонам и времени суток. По 13 полям 0 расхождений: класс, 250 000 ppm, лимит, guards, refresh, source_refs, `source_row_id`, `category_ref` пуст, `C`, `candidate`. Дублей ключа нет, `pr_id` уникальны. Все 16 PF имеют хотя бы одно правило. Во всей таблице 10 624 строк `candidate` и `C`.
- **Замечания C001 (все minor) в C001b не исправлены**, это честно записано в VERIFICATION.md:
  - `class_capped_from` по-прежнему стоит у 20 строк без понижения (`pr_001347`–`350`, `pr_002437`–`440`, `pr_002505`–`508`, `pr_002597`–`600`, `pr_007137`–`140`);
  - `frequency_rule.json:24` не обновлён;
  - `region_id` стал ещё пестрее: `''` 6 324, `novgorod_land` 4 222, `ladoga_lake` 9, `region_novgorod_land` 69 у людей;
  - единица лимита по-прежнему теряется.
- **Находки (minor).**
  - Правила людей наследуют дефекты authoring: городской «хозяин двора» в деревне, проводник на болоте, лодочник зимой.
  - README говорит «для всех 16 PF, используемых 32 G4 и 195 G5», но 7 узлов zaostrovye_burial_area без pf остались без людей.
  - Текста §8.1 нет в корпусе этого checkout: он есть только в ветке codex/live-world-runtime.
- **Сверка с §8.1.** Нет `world_revision_id` и `rule_version`. `place_family` вне нормы (`no_needs_cr`). `allowed_times` и `guards` — лишние поля, нужен CR/DDL.
- **Ограничения.**
  - Строки людей не брать в M2c до переделки authoring и пересборки.
  - ppm — редакционная заглушка.
  - Ограничения C001 (гребень/кодекс/табличка, слияние максимумом, MASTER без сверки архетипа) остаются.

### scripts/validate.mjs (интеграционные проверки C002) — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C001b/C002, коммит fe11f19b).

- **Как проверял.** Пересчитал новые проверки независимым скриптом. Сам validate не запускал: он пишет `reports/validation.json`. В закоммиченном отчёте 18/18 собственных проверок PASS.
- **C001b исправлено.** Результат больше не зависит от наличия worktree PR98, G4 profile_id сверяется с закреплённым `pr98-extract.json`. Побочный эффект: существование файлов `pr98:data/...` из binding_basis теперь не проверяется совсем.
- **Пересчёт C002 совпадает с отчётом.**
  - node_binding: 32 G4, 195 G5, 16 PF, ровно те же 16, что в `start-territory.json`.
  - Пять crosswalk (livestock 144, buildings 89, food 52, tools 238, weapons 628): 0 пропущенных и 0 неизвестных PF, 0 дублей ключа, все `candidate`.
- **minor — покрытие считает и `no_source`.** Нет ни одной source- или rule-строки: livestock у 7 из 16 PF (включая floodplain_meadow, где стоит пастух), buildings у 9, food у 14, tools у 8, weapons у 7. «16/16» значит только «строка есть».
- **minor — число 10555 зашито в код.** Любая правка items в C003 даст FAIL. Узлы без pf (7) и `pf_secondary` не проверяются.
- **minor — проверка людей поверхностная.** Проверяется только наличие правила на PF и непустой guard. Нет словаря guards и сверки subject с местом по профилю, поэтому городской «хозяин двора» в деревне проверку прошёл.
- **Ограничение.** Выводы опираются на закоммиченный отчёт и независимый пересчёт, а не на свежий прогон.

## Независимая проверка C002b/C003a (Claude Opus 5.5, коммит fb21aeaa)

Третий проход, отдельный от автора правок. `rework` — возвращено исполнителю; `approve_with_limits` — годно для M2c с перечисленными ограничениями; статус данных `candidate` до утверждения набора.

### presence/people_presence_authoring.csv — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C002b/C003a, коммит fb21aeaa).

- **Как проверял.** Сравнил diff fe11f19b..fb21aeaa, сверил 5 исправленных строк с `novgorod_social_roles_v1.tsv` и с описаниями PF в `place_families.csv`. Сборщик не запускал.
- **major «хозяин двора в деревне» — исправлено.** В строках 10, 11, 16, 17, 18 теперь стоит `nov_role_smerd_householder` со ссылкой на его профиль.
  - Профиль: места «село; деревня; погост; двор; гумно; покос», g3 `pt_village`/`pt_hamlet`/`pt_isolated_farmstead`, g4 `dwelling_yard`.
  - Это подходит к `pf_peasant_homestead`, `pf_village_lane` и `pf_rural_yard`: все три — сельские settlement_space.
  - Городского `nov_role_householder` в правилах не осталось (0). В presence_rules исправленные правила — 20 строк `pr_010252`–`259` и `pr_010273`–`284`.
- **Что в порядке.** Все 19 строк — `candidate` и `C`, цитат и дат нет, subject_ref резолвятся.
- **minor — не исправлено:**
  - проводник на болоте и ручье (строки 7 и 15, `pr_010243`–`245`, `pr_010269`–`272`), привязка не помечена как редакционная;
  - лодочник зимой на открытом русле (строка 2, `pr_010224`);
  - нет словаря guards;
  - `frequency_rule.json#editorial_candidate` ведёт на несуществующий ключ.
- **Ограничения.** Один subject на PF, почти везде только `day`. 7 узлов zaostrovye_burial_area без людей. Значения 250 000 ppm и лимит 1 — редакционные.

### presence/presence_rules.csv — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C002b/C003a, коммит fb21aeaa).

- **Как проверял.** Написал собственный read-only пересчёт, сборщик не импортировал. Он построил таблицу по текущим пулам (`item_place_frequency.csv`, `wild_habitat_presence.csv`), MASTER `item_location_links.csv` и authoring людей. Потом скрипты удалены. Сборщик и validate не запускал.
- **Устаревание — исправлено.** Пересчёт дал 10 292 строки: 10 223 категориальных и 69 правил людей.
  - По всем 27 колонкам 0 расхождений с файлом.
  - Принято 5 940 строк пулов (1 709 items + 4 231 fauna), после разворота по сезонам 11 067, слито 844.
  - Отклонено 10 818, причина одна — пустая категория. Это совпадает с отчётом.
- **Условия C003a перенесены без потерь.**
  - Все 5 992 правила из items несут `entry_visible_if=placed_exposed` и `search_only_if=placed_concealed`. У fauna и людей эти поля пусты (4 300 строк).
  - 160 правил на 7 диких PF несут `prior_visitor_loss_or_discard`. Расхождений с `pf_class` 0, ни одно небезопасное правило причину не потеряло.
  - Ни одна строка items с категорией не отклонена из-за условий.
  - Слияние с условиями в ключе даёт те же 10 223 правила, что и без них; слияний со смешанными условиями 0.
  - Оговорка: в пуле оба условия одинаковы у всех 12 527 строк. Поэтому правила различает только причина для wild.
- **Выборка 17 строк** прослежена до строки пула, все совпали:
  - items: `pr_000001`, `pr_001689`, `pr_004143`, `pr_006916`, `pr_008632`;
  - wild: `pr_000640`, `pr_005482`, `pr_008425`, `pr_008465`;
  - fauna: `pr_000025`, `pr_003459`, `pr_006045`;
  - понижение по MASTER: `pr_000923`, `pr_006915`;
  - люди: `pr_010252`, `pr_010259`, `pr_010279`.
- **Статусы.** Все 10 292 строки — `candidate` и `C`, цитат и дат нет.
- **minor — не исправлено с C001:**
  - `class_capped_from` без реального понижения у 16 строк (`pr_001303`–`306`, `pr_002385`–`388`, `pr_002453`–`456`, `pr_007001`–`004`): реальных понижений 108 из 124;
  - 4 значения `region_id`;
  - `frequency_rule.json` count_limit_rule не обновлён;
  - единица лимита теряется.
- **minor — ID сдвинулись.** `pr_id` позиционные, после C003a все сдвинулись: правила людей теперь `pr_010224`–`292`.
- **Ограничения.**
  - ppm — заглушка.
  - Табличка 500 000 ppm в church_interior и cellar_granary (`pr_001327`–`330`, `pr_001083`–`086`), гребень снижен до 250 000.
  - Правила людей наследуют проводника на болоте и лодочника зимой.
  - Лишние поля и `place_family` вне DDL §8.1, нужен CR.

### scripts/validate.mjs — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C002b/C003a, коммит fb21aeaa).

- **Как проверял.** Прочитал код и diff. Логику сравнения повторил в своём read-only скрипте и прогнал на трёх устаревших вариантах. validate не запускал: он пишет `reports/validation.json`.
- **Проверка свежести — исправлено.** `matches_current_input_pools` вызывает `build({ write: false })`. Сборщик заново читает текущие пулы, MASTER и authoring, ничего не записывает (CSV, отчёт и лог закрыты условием) и сравнивает файл с результатом построчно по всем колонкам файла, плюс число строк. Зашитого 10555 больше нет.
- **Устаревший файл проверка ловит.** Я сравнил текущую пересборку с тремя устаревшими вариантами:
  - файл с fe11f19b: 10 624 строки против 10 292;
  - файл с 66919b10 (до исправления людей): 20 строк расходятся по `subject_ref`/`source_refs`;
  - текущий файл против пула items до C003a: пересборка даёт 4 300 строк.
  - Во всех трёх случаях FAIL.
- **Условия C003a проверяются.** Для каждого правила из items все три условия сверяются с каждой исходной строкой пула. Для wild проверяется причина. У fauna и людей условия должны быть пустыми. Условия входят в ключ уникальности.
- **Crosswalk — частично.** Связи и `no_source` считаются раздельно. Связь без исходного ключа или PF, который одновременно и в связи, и в gap, дают FAIL. Мой пересчёт совпал с отчётом:

  | crosswalk | связи | no_source |
  |---|---|---|
  | livestock | 130 | 14 |
  | buildings | 73 | 16 |
  | food | 12 | 40 |
  | tools | 152 | 22 |
  | weapons | 507 | 121 |

  Но счёт идёт по всем PF. Из 16 целевых связь есть лишь у 9, 7, 2, 7 и 9 PF соответственно, и в отчёте этого не видно.
- **Люди — частично.** Правила сверяются с authoring. Словаря guards и сверки subject с местом нет.
- **minor.**
  - Сравниваются только колонки, которые уже есть в файле: новая колонка сборщика в устаревшем файле пройдёт незамеченной.
  - Вместо 10555 зашито `people.length === 69`.
  - Свежесть `presence-rules-report.json` не проверяется, хотя сейчас отчёт согласован.
- **Ограничения.**
  - Проверка доказывает «файл = выход сборщика», а не правильность сборщика; её подтверждает независимый пересчёт.
  - Заявленные «26 отрицательных сценариев» в репозитории не лежат.
  - Выводы опираются на закоммиченный отчёт (19/19 PASS) и пересчёт, а не на свежий прогон.

## Независимая проверка C003 (Claude Opus 5.5, коммит 9db968c2)

Четвёртый проход, отдельный от автора правок. `rework` — возвращено исполнителю; `approve_with_limits` — годно для M2c с перечисленными ограничениями; статус данных `candidate` до утверждения набора.

### slots/materialization_slot_rules.csv — rework
Проверено: Claude Opus 5.5 (независимая проверка C003, коммит 9db968c2).

- **Как проверял.** Прочитал diff fb21aeaa..9db968c2 и коммиты 97dced5b и 6dd451f4. Все 7 строк сверил с buildings (`building_types`, `settlement_form`, `settlement_building_mix`), `transport_entities`, `route_templates.seed.json`, MASTER `material_items` и сценой SCN008, WK `place-first-cartography`, `node_binding` и `presence_rules`. Сверку делал своим read-only скриптом, `validate.mjs` не запускал.
- **Прежние замечания.** Файл новый, прежних blocker и major нет.
- **Что в порядке.**
  - Все ссылки разрешаются: 3 bt, trv_047, rt_winter_road и категории `spatial.g3.built_site` и `seasonal_route`.
  - Везде `candidate`, счёт min ≤ max, applicability winter стоит только у зимней переправы.
  - Построек на природных PF нет.
  - Дублей с частотами нет: в `presence_rules` и в пуле предметов для 5 PF нет ни лодок, ни оград, ни построек.
  - Жилое строение усадьбы подтверждено: изба 1..1 совпадает с mix владельца по SCN008 («1 жилое строение»), ARC0020 A.
- **major — судно перевоза.** trv_047 — наёмная торговая лодья от Невы до Новгорода за 5 марок, из немецкого проекта договора. Это не лодка для переправы. Подходят trv_011 «перевоз» (Хорошев; паром не называть: слово известно с 1374 г.) и челн trv_003, trv_042 или trv_006.
- **major — ограда.** Источник ARC0002 в MASTER — хлев, а не ограда. Взят только плетень (C), хотя у владельца для крестьянского двора указаны плетень и частокол, и у частокола confidence A (ARC0014). Не использован и AGR0004 «Плетень сельскохозяйственный».
- **major — правила не записаны.** Текста четырёх `MSR-C003-*` в репозитории нет: id встречаются только в CSV и в `validate.mjs`.
- **major — `pf_rural_yard`.** Единственный узел — место схода `vikhtuy_locality_meeting_area`. В WK у rural_yard сказано «Не создаёт двор, животное или запас». Обязательная изба с оградой там выдумана, нужно решение рецензента.
- **major — к чему относится счёт 1..1.** PF привязан к G4 и G5 сразу и ещё стоит в `pf_secondary`. Например, у перевоза zaostrovye_landing (G4 и три его G5) получается 1 или 4 лодки. Если считать secondary, у перевоза появляется изба.
- **major — у каждого слота один кандидат.** Выбирать броску нечего. Для хозпостройки закреплён сарай (в mix 0–1), а хлев, у которого в mix 1..1, в кандидаты не попал.
- **minor.**
  - `spatial.g3.built_site` — категория уровня G3, а не категория постройки.
  - Зимник — шаблон ребра со статусом draft, здесь он использован как anchor внутри узла.
  - Route-PF дорога, лесная дорога и деревенская улица оформлены иначе, чем зимняя переправа.
- **Ограничения.** Статус candidate; утверждение набора — отдельный проход.

### slots/no_required_slots.csv — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C003, коммит 9db968c2).

- **Как проверял.** Своим скриптом сверил с `node_binding.csv` и WK `place-first-cartography.json`. Все 11 строк прочитал.
- **Прежние замечания.** Файл новый.
- **Что в порядке.**
  - Покрытие полное: привязанных PF 16, из них 5 со слотами и 11 с записью о пробеле. Пересечений 0, дублей 0, объединение ровно равно 16 привязанным PF.
  - Все 11 якорей `environment_families[id=…]` разрешаются.
  - Везде `candidate` и C; природным и маршрутным PF постройки и предметы не придуманы. Это соответствует A-C003-01 п. 4.
- **minor.**
  - Причины однотипные. WK-семейство не утверждает, что объекта нет.
  - У bog (`rt_wetland_causeway`), river_channel (`rt_ford`) и road (`rt_local_road` и др.) есть шаблоны путей, но в записи не сказано, почему путь здесь не anchor, а у зимней переправы — anchor.
- **Ограничения.** Решение по природным PF держится на указании рецензента; источника отсутствия нет.

### scripts/validate.mjs (слоты C003) — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C003, коммит 9db968c2).

- **Как проверял.** Прочитал новый блок `materialization_slot_rules`. Покрытие и ссылки пересчитал своим скриптом, результат совпал с отчётом (7 слотов, 11 пробелов, 16 PF). validate не запускал.
- **Прежние замечания.** blocker и major не было. Зашитое 69 осталось, к нему добавились новые зашитые 16/7/11.
- **Что в порядке.** Проверяются покрытие 16 PF, дубли и пустые slot_id, kind, счёт, applicability зимы, статус, разрешение категорий и записей (bt, trv, rt), применимость bt к PF.
- **minor — проверки мягче, чем выглядят.**
  - rule_ref проверяется только на непустоту, его существование не проверяется, поэтому ненаписанные `MSR-C003-*` прошли.
  - Проверка дублей с presence не срабатывает: у 5 из 7 слотов нет предметной категории.
  - «Постройка на природном PF» видит только `natural*` и пропускает water, water_edge и use_overlay.
  - Соответствие источника кандидату не проверяется: ARC0002 (хлев) прошёл как источник ограды.
- **Ограничения.** Проверка доказывает целостность ссылок, а не правильность выбора кандидатов.

## Независимая проверка C003b (Claude Opus 5.5, коммит aa18c441)

Пятый проход, отдельный от автора правок. `rework` — возвращено исполнителю; `approve_with_limits` — годно для M2c с перечисленными ограничениями; статус данных `candidate` до утверждения набора.

### presence/presence_rules.csv (перенос placement_owner_ref) — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка C003b, коммит aa18c441).

**Механика (свой скрипт по файлам; build и validate не запускались).**
- Строк 10 280, `pr_id` и порядок те же, что в 9db968c2. Без колонок основания и владельца строки совпадают с прошлыми полностью: снято 0, добавлено 0.
- `placement_owner_ref` есть в выходе, в ключе слияния (`build-presence-rules.mjs:164`) и в сверке `validate.mjs`: по каждой исходной строке `#rowN` и в ключе дублей.
- Независимая сверка с пулом items: 5 980 item-правил, из них 500 слитых, 6 616 ссылок на строки. Все семь полей совпали по `#rowN` и `ipf_id`, расхождений 0. Покрыты все 1 654 it-строки, master-строк нет.
- В слитых правилах нет источников с разными условиями (0). У 4 300 правил fauna и people все семь колонок пусты.
- Пробел: у 4 144 item-правил `no_source` и владелец Stage 16, за ними ровно 1 195 it-строк. 1 836 правил с весами master и пустым владельцем.
- Конфликтных дублей по-прежнему 28. Это разные вещи одной категории с разным классом, а не условия размещения.

**По замечаниям прошлого раунда.** Перенос владельца решения — **исправлено.** Колонки переносятся без потерь, README presence говорит о семи колонках.

**Выборка.** 17 правил, стоящих за строками выборки items, сверены по `#rowN`: basket@arable_field, belt_knife+western_knife@bridge_crossing (слитое), bucket и splinter_holder@dwelling_interior, vessel_lid@ordinary_workshop и другие. Поля равны источнику.

**Находки.**
- **Мелкая.** 69% item-правил несут пробел с владельцем, который пока не решает. Presence тут ни при чём, закрывать у Stage 16 или items.

**Ограничения.**
- Сезоны и `probability_ppm` — прежнее правило C, не переоценивались.

Итог: consumer переносит все семь полей без потерь, и это проверяет его собственный validate.

### categories/category_registry.csv — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка C003b, коммит aa18c441).

**Выжимка против источника.**
- `git show 745b9c87:data/world-catalogs/novgorod/live-world-runtime-v17/appearance-transfer-v3-datasets/universal_categories.json` в основном репозитории: blob `bab44418…`, SHA-256 `539b555f…`. Совпадает с pin в `inputs/appearance-categories.json`, `export-appearance-categories.mjs` и отчёте.
- 42 строки, все `actor_appearance`, статус источника `approved`. Семь полей (id, domain, facet, stable_code, parent_category_id, preferred_label, status) совпали поле в поле, порядок тот же, расхождений 0. SHA-256 строк `613ff054…` равен закреплённому.
- Взяты 7 из 13 полей источника: определения и правила включения реестр не потребляет. Выжимка минимальная, по образцу `pr98_extract.json`.
- Коммит 745b9c87 не входит в историю ветки. Он есть в `origin/codex/live-world-runtime` и других ветках. Пересоздание требует этих объектов, `--check` работает без них.

**Сборка падает без выжимки.**
- `build()` первой строкой читает выжимку. Старое чтение `../Novgorod-runtime` и тихий `source_missing` удалены.
- Проверено на копии `lib.mjs` и экспорт-скрипта в scratch: без файла — ENOENT, с подменённым `status` — ошибка pin, с целой выжимкой — 42 строки. Ошибка возникает до записи отчёта и реестра.
- `category_registry.csv` побайтно равен версии 9db968c2: 982 строки, 42 `v17_actor_appearance`, все id на месте. Сам build не запускался (запрет задания).

**По замечаниям прошлого раунда.** Невоспроизводимость реестра — **исправлено.**

**Находки.**
- **Мелкая.** `validate.mjs` читает только отчёт. Он не сверяет выжимку с pin и не требует 42 appearance-строк в реестре: реестр из 940 строк пройдёт validate. Защита держится на build.
- **Мелкая.** У 42 строк `source_domain_file` = `pr98:…/universal_categories.json` без коммита. Коммит есть только в отчёте и выжимке.

**Ограничения.**
- `status=approved` у 42 строк — статус источника v17, а не новое утверждение.

Итог: выжимка дословная и закреплена, сборка без неё падает. Реестр воспроизводим из ветки.

### slots/materialization_slot_rules.csv и slots/slot_candidates.csv — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C003b, коммит aa18c441).

- **Как проверял.** Прочитал diff 9db968c2..aa18c441. Все 5 слотов и 9 кандидатов сверил с источниками:
  - trv_011 и строкой Хорошева 624953 ¶1224 в books-evidence;
  - MASTER: ARC0002, ARC0014, ARC0017, ARC0018, ARC0020, ARC0021, AGR0004;
  - сценой SCN008 и остальными сценами;
  - `building_types` и `settlement_building_mix` (sf_yard_peasant, sf_yard_urban_ordinary, sf_yard_boyar);
  - WK `settlement-craft.json` и `place-first-cartography.json`, а также `node_binding`.
  
  Покрытие, веса и область счёта пересчитал своим read-only скриптом, validate не запускал.
- **Прежние замечания.**
  - Судно перевоза — **исправлено**. trv_047 убран. Слот стал anchor `msr_ferry_crossing` с одним кандидатом trv_011. В ¶1224 сказано, что перевозы и перевозники существовали издавна. Лодку правило не выводит, и это совпадает с WK ferry_landing «Плавсредство и услуга требуют source/owner».
  - Ограда на ARC0002 — **исправлено** в слоте. Теперь основания ARC0014 и AGR0004, а ARC0002 остался только у хлева.
  - Правила не записаны — **исправлено**, см. `materialization_rules.json`.
  - `pf_rural_yard` — **исправлено**: оба слота сняты, PF перенесён в пробелы.
  - Область счёта — **частично**, см. minor ниже.
  - Один кандидат — **исправлено**. У жилья 2 кандидата, у ограды 2, у хозпостройки 3 (хлев, клеть-амбар, сарай). У перевоза и зимника по одному: источник один. Но у жилья и ограды веса неверны, см. major.
- **Что в порядке.**
  - Все ссылки разрешаются: 7 bt, trv_011, rt_winter_road и 2 категории. Каждый bt по `building_types.pf_ids` применим к своему PF.
  - Хозпостройки 2/2/1 согласуются с SCN008: хлев (ARC0002) и клеть-амбар (ARC0018) там обязательные, сарая нет.
  - Confidence кандидатов совпадает с confidence записей владельца (9 из 9).
  - Дублей с частотами нет: в `presence_rules` у 4 PF со слотами нет ни лодок, ни оград, ни построек.
- **major — жилая клеть не из mix владельца.**
  - Правило говорит «выбирается из mix», но у sf_yard_peasant жильё только изба 1..1, а SCN008 требует ровно ARC0020.
  - ARC0021 встречается только в городских сценах SCN001, SCN002 и SCN006. В MASTER это часть усадьбы для отдельных членов двора.
  - WK `settlement-log-building-form` оговаривает: «городская… не план сельского двора».
  - При весах 2/1 у трети усадеб единственное обязательное жильё — клеть.
  - Нужно: оставить одну избу или записать клеть отдельным редакционным правилом C.
- **major — у ограды веса противоречат сельским данным.**
  - Частокол получил вес 2 и A, плетень — 1 и C.
  - В mix sf_yard_peasant есть только плетень; частокол 1..1 стоит у городского и боярского двора.
  - ARC0014 описан как граница городских дворов и улицы и не входит ни в одну сцену.
  - WK `settlement-post-fence-yard` — городская совместимость, «не план сельского двора».
  - README объясняет веса «смесью типов у владельца», но для ограды это неверно.
- **minor.**
  - **Область счёта.** У pf_outbuildings (3 G5) и pf_winter_ice_crossing (7 G5) нет ни одного G4-узла, а 3 из 10 G5 перевоза стоят под G4 с другим PF. Не сказано, что PF, который есть только на G5, тоже запускает комплект своего G4.
  - Имя trv_011 у владельца — «паром, перевоз». Запрет слова «паром» есть только в facts_summary, слот его не несёт.
  - Зимник по-прежнему шаблон ребра со статусом draft. 5 из 7 G5 зимней переправы — это опасности (тонкий лёд, трещина, пролом), а не переправа.
  - У владельца buildings плетень (`bt_wattle_fence` и mix sf_yard_peasant) всё ещё ссылается на ARC0002. AGR0004 в его записи нет. Исправлять надо у buildings.
  - Веса редакционные, но это сказано только в README, а в строках и реестре правил пометки нет.
- **Ограничения.** Статус candidate. Лодки на перевозе нет — это честный пробел, а не ошибка.

### slots/materialization_rules.json — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C003b, коммит aa18c441).

- **Как проверял.** Прочитал все 5 правил и три поля области. Основания сверил с ¶1224, MASTER, SCN008, `settlement_building_mix` и WK. Своим скриптом проверил, что все rule_ref разрешаются.
- **Прежние замечания.** Файл новый. Он закрывает major «правила не записаны» — **исправлено**.
- **Что в порядке.**
  - У всех 5 правил есть id, текст, основание и confidence. Все 5 используются слотами, лишних и неразрешённых нет.
  - Основания и confidence правил:
    - перевоз — B на ¶1224; лодку правило прямо не выводит;
    - зимник — B на WK;
    - хозпостройки — B на SCN008;
    - ограда — C, обязательность помечена как «editorial requiredness».
  - Записана область: один комплект на G4-комплекс, G5 выбирает код, `pf_secondary` сам слот не создаёт.
- **major — основание правила жилья.** Текст «selected from its building mix» ссылается на «building_types.csv peasant_homestead owner mix». Так смешаны два владельца: `building_types.pf_ids`, где есть изба и клеть, и `settlement_building_mix`, где у sf_yard_peasant только изба 1..1. По настоящему mix правило допускает только избу.
- **minor.** Три поля области — голые строки: нет текста, основания и пометки editorial. Это решение рецензента из REVIEW-C003, на него стоит сослаться. Не решено, что делать с PF, которые есть только на G5.
- **Ограничения.** Статус candidate. Правила C утверждаются отдельным проходом.

### slots/no_required_slots.csv — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C003b, коммит aa18c441).

- **Как проверял.** Прочитал diff: добавлена одна строка, остальные 11 не менялись. Своим скриптом сверил с `node_binding.csv`, слотами и WK `place-first-cartography.json`.
- **Прежние замечания.** blocker и major не было. Прежние minor не исправлены: причины однотипные, а пути у bog, river_channel и road не объяснены.
- **Что в порядке.**
  - **`pf_rural_yard` — исправлено.** Причина совпадает с WK rural_yard («Не создаёт двор, животное или запас»). Единственный узел `vikhtuy_locality_meeting_area` стоит под G4 крестьянской усадьбы, так что изба и ограда приходят от слотов усадьбы на уровне комплекса.
  - Покрытие полное: 4 PF со слотами и 12 пробелов дают ровно 16 привязанных PF. Пересечений 0, дублей 0.
  - Все 12 якорей `environment_families[id=…]` разрешаются. Везде `candidate` и C.
- **minor.** У bog есть `rt_wetland_causeway`, у river_channel — `rt_ford`, у road — `rt_local_road`. В записях не сказано, почему путь там не anchor, а у зимней переправы — anchor.
- **Ограничения.** Решение по природным PF держится на указании рецензента; источника, что объекта нет, нет.

### scripts/validate.mjs (слоты C003b) — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка C003b, коммит aa18c441).

- **Как проверял.** Прочитал diff блока `materialization_slot_rules`. Покрытие, ссылки, веса и применимость пересчитал своим скриптом. Результат совпал с закоммиченным отчётом: 20/20 PASS, 5 слотов, 9 кандидатов, 12 пробелов, 16 PF. validate не запускал: он пишет `reports/validation.json`.
- **Прежние замечания.**
  - Существование rule_ref — **исправлено**: неразрешённый или неиспользованный rule теперь даёт FAIL.
  - Соответствие источника кандидату — **частично**. Применимость bt к PF по `pf_ids` владельца теперь проверяется. Но `source_refs` кандидата с записью владельца не сравниваются: AGR0004 у плетня и SCN008 у избы, хлева и амбара в записях `building_types` нет, и это проходит.
  - «Постройка на природном PF» — **не исправлено**. Проверяется только `natural*`, а water, water_edge, route, use_overlay и seasonal_overlay не охвачены.
  - Дубль с presence — **не исправлено**. Он ищется только по категориям, а у ограды и перевоза категории нет.
- **Что в порядке.**
  - Новые проверки:
    - кандидат есть у каждого слота;
    - нет дублей кандидатов;
    - вес — целое число ≥ 1;
    - статус и confidence заполнены;
    - запись разрешается;
    - вид записи подходит к виду слота.
  - Правила проверяются на форму, уникальность и использование. Покрытие 16 PF проверяется по-прежнему.
- **minor.** Зашиты trv_011 для перевоза, числа 16, 5 и 12 и три строки политики. Политика проверяется только равенством строк. Зашитое 69 осталось.
- **Ограничения.** Проверка доказывает целостность ссылок, но не правильность весов: неверные веса ограды и жилья она пропускает.

### places-binding/slots/slot_instance_variants.json — rework

Проверено: Claude Opus 5.5 (независимая проверка CR #158 волна 1, коммит d0952e30).

- Проверены все 8 вариантов, по 4 фасета в каждом. Сравнение с `building_types.csv`, `route_modes.csv`, `transport_entities.csv` и master-archive `material_items.csv` делал скрипт.
- Верно: площадь избы 16–80 м² и стороны 4–9 м совпадают с `size_note` и ARC0020. Материал `mat_log_conifer` есть у владельца. Слоты не размножены. Для перевоза все четыре пробела честные.
- **Major. Состояние и возраст — первый элемент перечня.** У всех шести построек `condition=sound` и `age=new`, уверенность B. Источника нет, а ARC0002/0014/0017/0018/0020 (`wear_and_condition`) говорят обратное: «следы дыма, осадки, грязь, ремонт», «потемневшее дерево». В книгах: «Верх частоколов обуглен пожарами» (709382 ¶176). Рассказчик всегда увидит новую целую избу.
- **Major. Пропущены размеры из книг.** Тын 2–2,5 м из еловых брёвен 13–18 см (622242 ¶1262). Частокол 2,5–2,6 м из жердей 14–16 см (709382 ¶280, ¶283). Клеть и амбар 4×4 м (709382 ¶669, ¶638). Если данные городские, нужно условие и уверенность C или конкретная причина пробела.
- **Major. Зимник — четыре пробела, хотя данные есть.** В `route_modes.csv` есть «санный путь по снегу, льду…» — это материал. В книгах (694952 ¶140): «дорогу заносило снегом, подстерегали полыньи» — это состояние. Сборщик не читает каталоги route и transport.
- **Major. Материал урезан до первого элемента.** У избы нет мха, тёса и глины. Хлев всегда бревенчатый, хотя по ARC0002 он бывает и плетёный.
- Minor. К размеру избы прицеплен весь список ссылок здания, включая claim про свет и воздух. Причина пробела «not established for this candidate» шаблонная.
- Что сделать: варианты по всем состояниям и возрастам, веса — `no_source`; размеры из books-evidence с условием; ветка сборщика для route; полный перечень материалов.

### places-binding/slots/slot_instance_variants.json — approve_with_limits

Проверено: Claude Opus 5.5 (независимая повторная проверка CR #158 волна 1, коммит 14c2622d).

- **Прошлые замечания исправлены все.**
  - Состояние и возраст: значений `sound`/`new` больше нет. `condition` взят из ARC с пометкой «состояние экземпляра не задано», `age` = `no_source` у всех 8. Проверка запрещает `rule_ref` для состояния и возраста.
  - Размеры из книг есть, помечены «городской пример», уверенность C.
  - Зимник: материал из `route_modes.csv`, состояние из 694952 ¶140.
  - Материалы — полным перечнем, у хлева есть плетень.
  - Ссылки размера избы сужены.
- **Проверены все 32 фасета, в том числе все 17 со значением.** Скрипт сверил каждую книжную ссылку с books-evidence: 622242 ¶1262, 709382 ¶280/¶283/¶669/¶638, 694952 ¶140. Цитаты есть и подтверждают значения. Записи ARC0002/0014/0017/0018/0020 сверены с master-archive, 12 материалов — с `materials_vocab.csv`. Выдуманных значений нет, уверенность A не стоит нигде.
- **Счёт сошёлся.** 8 кандидатов дают 8 вариантов, дублей и лишних нет, веса и применимость совпадают со слотами. Пробелов `no_source` 15, как в сдаче. 16 PF из `start-territory.json` совпадают с `node_binding`, каждый PF покрыт слотом или явным пробелом.
- **Checker охвата падает, если чего-то не хватает** (код читал, не запускал). Отсутствие PF в слотах или пробелах даёт `uncovered`. Слот без кандидата и кандидат без варианта тоже дают ошибку. Список берётся из `node_binding` и `slot_candidates.csv`, а не вписан вручную. Исключение — старые зашитые числа 16/5/12.
- Minor. У плетня (siv_004) состояние взято из ARC0002, а это запись хлева. Уверенность B выше, чем C у строки плетня.
- Minor. Текст износа одинаков во всех 31 записи ARC — это шаблон, а не свидетельство о типе. Для него хватило бы C.
- Minor. Размер избы тоже из городских раскопов, но стоит с B без пометки «городской», в отличие от тына и клети.
- Minor. Проверка принимает любую ссылку `book:*` без сверки с books-evidence и не сравнивает уверенность фасета с уверенностью источника.
- **Ограничения.** Конкретное состояние и возраст постройки выбирает код, основания для весов нет. Все четыре фасета парома — честные пробелы. Вес ограды «плетень 2, частокол 1» — редакционный, это в соседнем файле.

### presence/people_composition_authoring.json — rework

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-2, коммит 86b27b60).

- **Что в порядке.**
  - Схема и строгий XOR оснований соблюдены.
  - Охват: 16 primary PF из `node_binding` и снимка bridge.
  - Каждый субъект D-1 либо в составе, либо в отсутствиях.
  - `profile_ref` у слуги точный.
  - Checker проходит: без bridge 13 проб, с bridge 14; git чистый.
  - Перевоз (перевозчик + страж, редакционное C, 1..1) приемлем. Страж на каждом из 13 перевозов — редакционный выбор без источника, это ограничение.
  - `pf_village_lane` пустая: транзит, согласуется с D-3 (соседство на улице).
  - `pf_rural_yard` пустая: одна G5 «meeting_area», пустота допустима.
- **Двор смерда — перестраховка и противоречие базе.**
  - Хозяйка исключена с доводом «профиль роли описывает городское хозяйство».
  - Но D-3 уже ставит эту роль женой смерда: `form_spouse_smerd` (хозяйка → смерд, «Господине мой»), `rel_spouse_smerd` A (book:641351 §2976).
  - Распорядок D-1 хозяйки на усадьбе во все сезоны ссылается на book:622242 ¶519.
  - Книжные факты: одна семья около 6 человек на дворе (622242 §519, B); деревня из 1–3 дворов, часто одна семья (648161 §2639, B); вдова во главе семьи (616519 §262, B).
  - Итог сдачи: на дворе хозяин, слуга и пахарь, семьи нет. Критерий CR «жители по составу двора» не выполнен.
- **Слуга и пахарь.**
  - Созданы на том же основании (место из D-1 + C), что у хозяйки, которую отвергли.
  - `nov_occ_ploughman.allowed_social_role_ids` включает `nov_role_smerd_householder`: пахарь — скорее сам смерд, а не второй человек.
  - Для слуги источника на дворе свободного смерда нет: TSV даёт «чужой двор»; `rel_dependent_servant` C опирается на княжеских слуг.
  - В Вихтуе выходит 2 смерда, 3 слуги, 2 пахаря, 0 жён.
- **Двойной путь.** Ферман (`pf_ferry_landing`), слуга (`pf_outbuildings`) и смерд (`pf_peasant_homestead`) есть и в составе, и в людских строках `presence_rules`. По CR там остаются только приезжие.
- **Пары D-3** (скрипт; источник людей — состав или людские строки `presence_rules`):
  - из 76 стартовых пар на primary возможны 4, только через `pf_secondary` — 30, не сходятся ни на одном узле — 1;
  - 41 пара имеет сторону, которая не создаётся нигде: сетевяз 14, сторож запруды 10, пекарь 9, косарь 8, хозяйка 7;
  - из 156 направлений обращений таких 86;
  - правила двора смерда (супруги, родители–дети, братья-сёстры, дядя–племянник; все A) неисполнимы.
- **Причины отсутствия.** «Приходит на работу» и «приходит к промыслу» стоят у субъектов без какого-либо пути появления (косарь, пекарь, сетевяз, сторож запруды). Их распорядки D-1 мертвы. Нужна явная пометка пробела.
- **Checker.**
  - Пропускает: confidence A при редакционном правиле; один субъект в двух группах; субъекта без распорядка и источника на PF (боярин на перевозе); `child` у перевозчика; причину «x».
  - Источник числа работников и необязательная группа (min 0) структурно невозможны.
  - Нет проверок на пересечение с `presence_rules`, на никогда не создаваемых субъектов и на пары D-3.
- **Нужно.**
  - Хозяйка на дворе: C с книжными ссылками, либо согласованная правка D-1/D-3.
  - Пахарь и слуга: убрать или обосновать.
  - Снять двойной путь.
  - Честные пробелы вместо «приходит».
  - Проверки выше, каждая с отрицательной пробой.
- **Ограничения** (остаются и после правки):
  - C6 перевозчик–рыбак возможен только через `pf_secondary` (C006e);
  - 2 G4 с primary-усадьбой: генератор может удвоить дворы;
  - все числа — C.
### presence/presence_rules.csv (одно правило на ключ) — rework
Проверено: Claude Opus 5.5 (независимая проверка CR #158 C006d, коммит 470d458d).

- **Пересечения (C4).** В 5 702 категориальных строках ни один ключ `(scope_kind, scope_ref, region_id, subject_kind, subject_ref, сезон)` не пересекается, `all` против отдельных сезонов учтён. Было 96 таких ключей. Нарушений формата сезонов 0. Одинаковых scope/subject/season с разным регионом нет.
- **Потери.** Ключей 10 115 → 10 115: ни один не потерян и не добавлен. Каждая исходная строка пула каждого ключа есть либо в provenance новой строки, либо в `dropped` отчёта того же ключа. Пересечений между ними нет.
  - 10 027 ключей с единственным поведением воспроизводят его точно.
  - В 508 ключах `equivalent_merged` полностью сохранены `source_pool`, `source_row_id`, `source_refs`, `placement_*`.
- **Coalesce в `all`.** Все 1 471 строки `all` честные: четыре сезона существовали до слияния, источники одинаковы, посезонных отбрасываний нет. Разбитых строк, которые можно было бы слить, 0.
- **Прочие колонки.** Против старой строки с тем же выбранным источником расхождений нет. ppm и `frequency_class` изменились в 28 ключах, где старая строка была слиянием по максимуму.
- **Checker.** Проверка `one_rule_per_base_key_and_season` подключена. Мои пробы: `all`+`winter`, `winter`+`winter`, `spring;summer`+`summer`, `all`+`all`, пустое значение, `all;winter` отвергаются. Разные сезоны, субъекты и регионы проходят. На старом файле 107 ошибок, на новом 0.
- **Решения по конфликтам — нечестно (блокирует).** Проверены все 88 решений: 22 базовых ключа, 23 пары «выбран/отброшен».
  - В 17 ключах (68 решений) отброшена строка с более сильным источником:
    - тканевый кошелёк, 7 PF: MASTER `common/common` уступил кожаному `contextual/context_bound`;
    - берестяная грамота, 6 PF: MASTER `common/common`, 4–8 связей, spawn SPN033 уступили детскому рисунку `contextual/context_bound`;
    - клёпочное ведро: spawn, B → долблёное, where_used, C;
    - железный светец: spawn, B → деревянный, where_used, C;
    - деревянная крышка: MASTER `common/common`, B → керамическая, where_used, C;
    - навесной и дверной замки: spawn → сундучный, where_used.
  - Метку `conservative_lower_ppm_equal_evidence` сборщик ставит только по разнице ppm, источники не сравниваются.
  - `stable_tie_break` у гребня выбрал лучшую строку случайно, по порядку JSON.
  - Это расходится с REVIEW-C006b2: «выбирай по точной MASTER-связи».
  - Довод README («master_link не доказывает архетип PF») здесь неприменим: у обеих сторон каждого конфликта один и тот же MASTER-архетип.
- **Что исправить.**
  - Ранжировать кандидатов по доказательной силе:
    1. `availability_class` / `spawn_frequency` MASTER того же архетипа;
    2. spawn / master_link выше where_used / group_default;
    3. confidence пула.
  - Меньший ppm — только при реально равных доказательствах. Причину вычислять из этого сравнения.
  - Либо получить решение владельца об агрегации разных предметов одной категории.
  - Добавить в validator проверку полноты «строка пула → provenance или dropped».
- **Ограничения.**
  - Конфликты — это разные предметы одной категории, а не дубли. Любой одиночный ppm искажает вероятность категории. Сами значения ppm — неутверждённая заготовка.
  - Пересборку я не запускал: checkout только для чтения.
  - Строки людей вне этой проверки.

### presence/presence_rules.csv (люди) — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка CR #158 C006d, коммит 470d458d).

- **Сведение 69 → 22.** Скриптом развернул старые (86b27b60) и новые строки людей в ячейки (PF, субъект, сезон, время): 69 = 69, без потерь и без добавленных окон. Сверил и с `people_presence_authoring.csv` (19 строк): все 69 ячеек совпадают. У каждой ячейки одно поведение.
- **Остальные поля.** ppm, класс, лимит, `guards`, `refresh_class`, уверенность, статус, регион и `count_limit_basis` в 69 сопоставлениях совпадают со старыми строками. Все 19 исходных строк сохранены в `source_row_id`, объединённые `source_refs` точны.
- **Объединение времени.** Оно есть только в 11 слотах (ключ, сезон): перевозчик весной, летом и осенью → `morning;day`, смерд на дворе → `day;night`, смерд в сельском дворе → `day;evening`. Порядок окон канонический. В отчёте по людям 11 решений `time_union`, `dropped` пусто. Решений «меньший ppm» и tie-break у людей нет.
- **C4 / §3A.1.** На (scope, регион, субъект, сезон) приходится одно правило, пересечений 0 (проверено скриптом отдельно от validator). Сезоны `all` сведены только там, где все четыре сезона совпадают.
- **C5 (время не фильтрует бросок).** Объединение безвредно и даже нужно. Раньше было по строке на окно, и при бросках без фильтра по времени это давало бы 2 броска на слот, а это нарушает C4 и §3A.1. Теперь бросок один, окна остаются только происхождением. README этого пока не говорит (minor).
- **Пересечение с D-2 сохраняется.** Субъекты `nov_occ_ferryman` на `pf_ferry_landing` (pr_001267–pr_001269), `nov_occ_household_servant` на `pf_outbuildings` (pr_004368) и `nov_role_smerd_householder` на `pf_peasant_homestead` (pr_004736) есть и в составе (1..1), и в `presence_rules`. Это запланировано на C006c2 (REVIEW-C006c п.4).
- **D-1 и D-3.** `check_schedules.py`: OK, 165 распорядков, 26 занятий, весь presence охвачен. `households-psychology-speech/scripts/check.py --probe`: OK, все отрицательные пробы, пары переправы. Оба checker'а `presence_rules.csv` не читают, их входы (`node_binding.csv`, `crosswalk_scene_templates.csv`) в коммите не менялись. На `pr_id` вне `places-binding` ссылок нет, перенумерация безопасна.
- **Ограничения:** ppm 250000 и лимит 1 — редакционные C; `guards` не исполняются (LW); для проверки объединения окон нет отрицательной пробы (minor).

### presence/people_composition_authoring.json — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-2, второй круг, коммит d4e4e059).

- **Прошлые замечания.**
  - Хозяйка на усадьбе — исправлено: группа residents 1..1, C, три книжные ссылки.
  - Пахарь и слуга усадьбы — исправлено, оба сняты. Пахарь — сам смерд, слуга остаётся только при хозпостройках. Решение здравое.
  - Двойной путь — исправлено. Пять строк authoring помечены `composition`, из `presence_rules` ушли ровно `pr_001267..001269`, `pr_004368`, `pr_004736`. Пересечений (PF, субъект) нет ни с authoring, ни с производными строками (скрипт).
  - «Приходит» без пути — исправлено. `never_created_gaps` — ровно 16 субъектов D-1 без обоих путей (пересчёт скриптом совпал), причины переписаны.
  - Страж переправы и слуга хозпостроек — редакционное C, в README названо ограничением.
  - Дети — названы ограничением: «дети, молодёжь и старики не создаются», число хозяйки «не доказательство размера семьи».
  - Checker — частично, см. ниже.
- **Источники хозяйки** сверены с books-evidence скриптом:
  - 622242 §519 (B): на дворе одна семья;
  - 648161 §2639 (B): деревня в 1–3 двора, часто одна семья;
  - 641351 §2976 (A): жена заплатила 20 гривен за мужа.
  
  Параграфы и цитаты на месте, C не выше оснований. Оговорка: 622242 §519 — о городских усадьбах, и роль в TSV помечена «город». README этого не говорит.
- **`creation_owner`:** 5 `composition`, 14 `presence_rule`. Производных людских правил 17 на 13 PF; вместе с составом охвачены все 16 PF.
- **D-3.**
  - 76 пар и 1960 контекстов подтверждены пересчётом.
  - Пара смерд–хозяйка есть в 16 контекстах, все на primary-усадьбе.
  - Но у 41 из 76 пар (724 контекста) одна сторона из `never_created_gaps`: сетевяз 14, сторож запруды 10, пекарь 9, косарь 8, пахарь 6. Пробелы объявлены, но отчёт D-3 по-прежнему считает эти пары стартовыми.
- **Checker.** С bridge 20 проб PASS, без bridge 19; git чистый. Мои пробы:
  - принимает `child` у перевозчика и причину «x»;
  - принимает любую непустую строку в `source_refs`: боярин на перевозе с `"bogus"` проходит;
  - достижимость пар D-3 не считается тем же кодом. D-3 берёт людей из распорядков, состав не читает. Если убрать хозяйку из состава и внести её в пробелы, оба checker'а зелёные.
- **Ограничения.**
  - На дворе двое взрослых из примерно 6 по источнику. Правила родства A — родители–дети, братья–сёстры, дядя–племянник — неисполнимы.
  - Вдова не моделируется.
  - Слуг: 2 на 2 двора в Заостровье, 1 на 2 во Вихтуе. Все числа 1..1 C.
  - Пара перевозчик–рыбак сходится только через `pf_secondary`.
  - Дворы не должен удваивать генератор (2 G4 + 4 G5).
  - Идентификаторы правил — отдельный раздел ниже.

### presence/presence_rules.csv (идентификаторы правил) — rework

Проверено: Claude Opus 5.5 (независимая проверка CR #158 D-2, второй круг, коммит d4e4e059).

- `pr_id` позиционный: сборщик сортирует строки по ключу и нумерует `pr_%06d` (`build-presence-rules.mjs:202`).
- **470d458d → d4e4e059** (скрипт сравнивал содержимое строк без `pr_id`):
  - удалено 5 правил, добавлено 0, не изменилось по содержанию 5 719;
  - из неизменных 4 453 (78%) получили новый id — все после `pr_001269`: 4 438 категорий и 15 людей;
  - каждый из этих 4 453 старых id теперь обозначает другое правило, `pr_005720..005724` исчезли.
- **86b27b60 → 470d458d** — то же самое: все 3 260 неизменных правил перенумерованы.
- **Почему это ломает целостность.** По C12 `rule_id` — это id строки, `rule_version` = 1, построчного digest нет. Исход броска хранит `rule_id@1` как причину. После любой пересборки с удалением строки записанная причина молча указывает на другой субъект на другом PF. Уже сейчас 70 id, процитированных в `VERIFICATION.md`, указывают на чужие правила.
- **Нужно (в C006d2):**
  - выводить id из ключа C4: `scope_kind`, `scope_ref`, `region_id`, `subject_kind`, `subject_ref`, `allowed_seasons`. Ключ уникален в обеих версиях (проверено). Читаемый slug или короткий хеш;
  - checker пересчитывает id = f(ключ); отрицательная проба — удаление или вставка строки не меняет чужие id;
  - при смене поведения под тем же ключом: импорт fail-closed на тот же `rule_id@version` с другим содержимым либо решение ревьюера о росте `rule_version` (C12 сейчас фиксирует версию 1).
- **Ограничение.** Старые цитаты `pr_*` в `VERIFICATION.md` и отчёте верны только для своего коммита.

### presence/presence_rules.csv (варианты предметов) — approve_with_limits
Проверено: Claude Opus 5.5 (независимая проверка CR #158 C006d2, коммит 6b60bc6c).

- **Как проверял.** Свой Python-скрипт заново разобрал оба пула: `item_place_frequency.csv` и `wild_habitat_presence.csv`. Сам применил отбор строк, понижение класса по MASTER `spawn_frequency`, развёртку сезонов и сравнение кандидатов. Результат сверил с CSV и отчётом. Diff колонок против `d4e4e059` — отдельным скриптом. Сборку и `validate.mjs` не запускал: checkout только для чтения.
- **Пересчёт.** Принято 5 885 строк пулов. Категориальных вхождений 10 847, у людей 51, вместе 10 898 — как в сдаче. Ячеек (ключ, сезон) 10 115, они совпадают с CSV один к одному.
- **(1) Порядок сравнения — честно.** Сравнение идёт так:
  - доступность MASTER по общим архетипам: `common > context_bound > нет`;
  - `R_SPAWN_PROFILE`/`R_MASTER_LINK` выше `R_WHERE_USED_TEXT`/`R_GROUP_DEFAULT`;
  - confidence пула;
  - меньший ppm;
  - стабильный id.
  
  Пересчитал все 596 ячеек с несколькими кандидатами: расхождений в победителе 0. Если брать доступность по всем ссылкам без учёта архетипа, победители те же.
- **22 ключа, 88 решений.** Причины: 16 `evidence_stronger:availability`, 3 `evidence_stronger:derivation`, 3 `equal_evidence_lower_ppm`. Мои причины совпали во всех 88.
  - Суконный кошель (7 PF) и грамота на бересте (6 PF): у победителя MASTER `common`, у проигравшего `context_bound` того же архетипа.
  - Клёпаное ведро, железный светец и дверной замок побеждают по основанию вывода. Деревянная крышка — по доступности.
  - Гири сравнены честно: доказательства равны, выбран меньший ppm.
  - Дверной замок и цилиндрический замок в `pf_cellar_granary` полностью равны. Выбор по стабильному id, в отчёте есть `tie_break`.
- **Смена победителей.** Против `d4e4e059` поведение изменилось ровно в 68 ячейках 17 ключей — это ошибочные победители C006d. Во всех 68 меняются только `frequency_class` и `probability_ppm`.
- **(2) Варианты не теряются.** В 22 конфликтных ключах 23 альтернативных предмета. Они одинаковы в колонке `variants` и в отчёте.
  - Полнота: каждое принятое вхождение ровно один раз попадает в provenance, `variants` или `dropped` своего ключа и сезона. Итог: 10 115 provenance + 732 варианта + 0 dropped = 10 847.
  - У каждого варианта `item_ref` и `source_pool` совпадают со строкой пула.
  - Validator получил проверку `accepted_occurrences_exactly_once` и отрицательную пробу `leather_purse`. Код прочитал, не запускал.
- **Не упомянуто в сдаче (minor).** Варианты есть не только в 22 ключах, а в 149: 183 пары (ключ, предмет), 732 вхождения.
  - В 127 ключах с одинаковым поведением разные предметы в C006d сливались в provenance как эквиваленты (508 ячеек). Теперь это варианты, основной выбран через `equal_evidence_stable_tie`.
  - Потерь нет: во всех 508 ячейках старый provenance = новый provenance + `variants`.
- **(3) ppm правила.** Во всех 10 115 ячейках ppm, класс, понижение класса, `item_ref`, условия обнаружения, веса и `wild_arrival_cause_required` берутся из строки победителя.
- **(4) Владельца весов вариантов нет — подтверждаю.**
  - `region_category_options`: только вес на пару (регион, категория), все веса равны 1. Измерения по предмету нет.
  - `category_parameters.csv` (3 697 строк): параметры категории — масса, материал, размер и т. п. Это не распределение вариантов.
  - По заголовкам файлов game-base колонок с весом варианта нет.
  
  Пробел §3A.4 записан честно, но только текстом в `presence/README.md`. Машиночитаемой записи нет, и новые колонки `item_ref`/`variants` не помечены как требующие CR к DDL §8.1 (minor).
- **Архетипы (minor).** В трёх ключах доступность побеждает кандидата вовсе без MASTER-ссылки: двусторонний гребень ×2 и деревянная крышка.
  - В `pf_ordinary_workshop` у обоих гребней один spawn SPN013. Двусторонний гребень выигрывает за счёт `context_bound` и получает меньший ppm: та же ссылка понизила его класс.
  - Порядок соблюдён, но фраза README «сравниваемые ссылки одного архетипа» тут верна лишь формально.
- **(5) Люди.** 17 строк людей побайтно совпадают с `d4e4e059`, если не считать `pr_id`. У людей `item_ref` пуст, `variants=[]`.
- **(6) Прочие колонки.**
  - Добавлены только `item_ref` и `variants`.
  - Упаковка сезонов не менялась.
  - Кроме 68 ячеек поведения, меняется только provenance: `source_*`, `placement_basis_ref`, `pool_confidence` в 508 ячейках. Везде это объясняется переносом в варианты.
  - У 4 231 строки fauna `item_ref` пуст — так и должно быть.
- **`pr_id`.** Против `d4e4e059` не сдвинулся ни один: 0 из 10 162. Diff в 11 440 строк — из-за двух новых колонок. Но id по-прежнему позиционные, и против `470d458d` сдвинуты 4 453. Blocker C006c2 остаётся за C006d3.
- **Ограничения.**
  - ppm — неутверждённая заготовка.
  - Выбор варианта в runtime и его веса не определены до решения владельца.
  - Переход от архетипа MASTER к PF не доказан (гребень, `scribe_area`), решает владелец `items-household-personal`.
  - Сборку и validator я не запускал.

### presence/presence_rules.csv (идентификаторы правил) — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка CR #158 C006d3, коммит 2df5ecd7).

- **Прошлый blocker** (REVIEW-C006c2, позиционные `pr_%06d`) — исправлен.
  - Теперь `pr_id` = `pr_` + первые 16 hex SHA-256 от JSON `[scope_kind, scope_ref, region_id, subject_kind, subject_ref, сезоны]`, поля обрезаны.
  - Сезоны нормализованы: полный набор даёт `all`, остальные идут в каноническом порядке.
  - Сборщик падает на повторе ключа и на коллизии id.
  - В `validate.mjs` есть проверка `canonical_unique_identity` и пробы подмены и коллизии.
- **Независимый пересчёт** (свой Python, не код сборщика): 5 719 строк.
  - Совпало 5 719 id, расхождений 0.
  - Уникальных id 5 719, уникальных ключей 5 719.
  - Сезоны везде канонические: `all` 1 481, весна 1 177, лето 1 134, осень 1 158, зима 769.
  - Дублей нет даже в префиксах из 8, 10 и 12 hex.
  - У всех категорий `subject_ref` = `category_ref`, поэтому категория входит в ключ.
- **6b60bc6c → 2df5ecd7 — изменились только id** (скрипт сравнивал строки без `pr_id`).
  - Удалено 0, добавлено 0, порядок строк тот же, колонки те же.
  - Отображение старый id → новый взаимно однозначно.
  - Ключи совпадают со всеми версиями с d4e4e059; у 470d458d только 5 лишних ключей — это снятые ранее строки состава.
  - 20 id в `presence-rules-report.json` разрешаются в строки с теми же PF, категорией и классом.
  - Позиционных `pr_` вне `VERIFICATION.md` не осталось.
- **Хватит ли 16 hex.** Это 64 бита. По парадоксу дней рождения вероятность коллизии:
  - при 5 719 строках — около 8,9·10⁻¹³;
  - при 57 190 строках — 8,9·10⁻¹¹;
  - при 10⁶ строк — 2,7·10⁻⁸.
  
  Запас огромный, коллизия падает fail-closed.
- **minor — ключ не описан в документации.**
  - Формула живёт только в коде, в двух копиях: сборщик и validator.
  - README не говорит, из чего строится `pr_id`.
  - README не говорит, что id называет ключ, а не содержание.
- **minor — проба стабильности тавтологична.** `presenceIds` на подмножествах из 3 строк пересчитывает каждую строку из неё самой. Это не пересборка без строки пула. Само свойство выполняется: индекс в id не участвует (код прочитан, сравнение версий выше).
- **minor — id стабилен, содержание нет.**
  - Между d4e4e059 и 6b60bc6c под тем же ключом изменились 144 правила. У 17 из них сменились класс или ppm, у 127 — только provenance.
  - Будь тогда id хеш-ключевыми, `pr_…@1` назвал бы разное поведение.
  - Нужно решение CR к C12: либо импорт fail-closed на тот же `rule_id@version` с другим содержимым, либо рост `rule_version`.
- **Ограничения.**
  - При переходе `all` ↔ посезонные строки старые id исчезают, но не переиспользуются.
  - Старые цитаты `pr_00xxxx` в `VERIFICATION.md` верны только для своих коммитов.
  - Сборщик и `validate.mjs` не запускал: validate пишет отчёты.

### presence/people_composition_authoring.json (checker) — approve_with_limits

Проверено: Claude Opus 5.5 (независимая проверка CR #158 C006d3, коммит 2df5ecd7).

- **Прошлые замечания** (REVIEW-C006c2, пробелы checker'а) — исправлены все три:
  - **`source_refs`.** Формат `book:<id> §[<раздел> ¶]<абзац>`. Ссылка разрешается по (`book_id`, `para_no`) в `sources/books-evidence-v1`, раздел проверяется, если указан. Строка `bogus` теперь отвергается.
  - **`household_member_class`** допускается только в группах `household` и `residents`. Перевозчик с `adult` или `child` отвергается.
  - **Причины** `never_created_gaps`, отлучек и `empty_reason` проверяются: не короче 15 символов, не меньше 2 слов, без заглушек `x`, `n/a`, `unknown`, «нет данных», «нет сведений о причине».
- **Пробы.**
  - Добавлено 10 новых. Всего 29 без bridge и 30 с bridge — это +1 проба перестановки `place_type`; счёт сверен по коду.
  - Мой прогон `--self-test` без bridge: PASS, 16 PF, 5 групп, 29 проб. Git чистый.
  - Три ссылки хозяйки разрешаются, базовый прогон даёт 0 ошибок.
- **Мои пробы** (в памяти, через `checkPeopleComposition`).
  - Отвергаются:
    - хвостовая `;` и пустая ссылка между `;;`;
    - «x x x x x x x x x»;
    - «Приходит.».
  - Проходят:
    - хозяйка с `book:709382 §227` — абзац о площади городских домов;
    - новая группа workers `pf_ferry_landing.boyar` (боярин) с реальным абзацем. Проходит, хотя распорядка D-1 на перевозе нет;
    - дубль одной ссылки;
    - причины «lorem ipsum dolor sit», «aaaaaaaa bbbbbbbb», «TODO: заполнить позже», «Причина неизвестна.»;
    - хозяйка с классом `child`, домохозяин с `elder`, хозяйка с `null`.
  - Ложный отказ: «Нет данных о численности детей в профиле домохозяйства.».
- **minor — ссылка проверяется на существование, а не на относимость.** Любой реальный абзац по-прежнему снимает требование распорядка D-1.
- **minor — «существо» причины — это эвристика длины и запретных начал.** Формальные заглушки из 2+ слов проходят. Смысл причин остаётся за проверяющим.
- **minor — класс члена двора** в `household`/`residents` не обязателен и не сверяется с ролью.
- **Данные в коммите не менялись.**
  - Все 16 причин пробелов и все причины отлучек прочитаны, они по существу.
  - Самая краткая: «Приходит на работу.» (пастух на `pf_rural_yard`).
  - Ограничения REVIEW-C006c2 сохраняются:
    - двое взрослых на двор;
    - нет детей и вдовы;
    - страж переправы и слуга хозпостроек — редакционное C;
    - все числа 1..1 C.
- **Ограничения проверки.**
  - Прогон с bridge не делал.
  - D-3 вне этого раздела. Мёртвые пары отсекаются по `never_created_gaps`: 41 из 76, осталось 35. Снятые строки — сгенерированные `candidate`.
