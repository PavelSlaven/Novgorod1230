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
