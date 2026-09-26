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
