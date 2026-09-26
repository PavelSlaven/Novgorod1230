# presence — единый носитель наличия (домен presence_rules)

Статус: **candidate**. И правило перевода, и таблица требуют утверждения владельцем. Для DDL носителя нужен CR и Contract Auditor (норма `world_base_materialization_table_requirements.md` §8.1; DDL пока нет).

## Что здесь

| Файл | Что |
|---|---|
| `frequency_rule.json` | Единственное правило перевода класса частоты в вероятность, плюс правила для `count_limit`, сезонов и `refresh_class`. |
| `presence_rules.csv` | Таблица правил наличия. Её собирает `scripts/build-presence-rules.mjs` из пулов других групп; вручную её не правят. |
| `people_presence_authoring.csv` | Авторские candidate-привязки людей к 16 PF, сезону и времени суток. Тот же сборщик разворачивает их в `presence_rules.csv`. |

Актуальные счётчики находятся в `reports/presence-rules-report.json`. Текущая пересборка даёт 10 223 категориальных и 69 правил людей из двух пулов (`items-household-personal` и `fauna-mammals-birds`).

## Правило перевода (`presence_ppm_from_frequency_class@1`)

| Класс | Вес | probability_ppm |
|---|---|---|
| ubiquitous | 8 | 1 000 000 |
| common | 4 | 500 000 |
| contextual | 2 | 250 000 |
| rare | 1 | 125 000 |

Формула: `round(1 000 000 × weight / 8)`.

Откуда правило (исправлено 2026-09-26, была неверная атрибуция — см. `VERIFICATION.md`):
- Веса 8/4/2/1 — это метка словаря (dominant/common/occasional/rare), общая с pr98 m2c-natural nature-richness-candidate-v1 weight_policy. **Числовой ряд ppm из этого источника не взят**: он прямо пишет, что его веса — «относительное предпочтение выбора среди допустимых альтернатив ... не археологическая частота, биологическая обилие, вероятность встречи или выход». Значения 1 000 000/500 000/250 000/125 000 ppm и отношение 1:2:4:8 — собственная редакционная конвенция сборщика, confidence C, без источника, измеряющего реальную частоту находок. Это заглушка (`status_note` в `frequency_rule.json`) до калибровки владельцем.
- Норма (`world_base_materialization_table_requirements.md` §8.1) задаёт только КАК кодируется обязательное наличие (правило с 1 000 000 ppm, отдельного поля нет) — она не утверждает, что верхний класс частоты обязателен. Это тоже открытое решение владельца, не факт из нормы.
- Каждый следующий класс вдвое реже предыдущего — редакционный выбор читаемости отношения, а не измеренная частота.

Синонимы классов: dominant → ubiquitous, occasional → contextual.

**Confidence всегда `C`.** Строка носителя может получить `probability_ppm` только через это неутверждённое редакционное правило, поэтому итоговый `confidence` в `presence_rules.csv` не может быть сильнее `C`, независимо от того, каким confidence был помечен исходный предмет/связь в пуле. Исходная оценка пула сохраняется в отдельной колонке `pool_confidence` — для прозрачности, не для того, чтобы «поднимать» уверенность в числе.

**Проверка по MASTER.** Сборщик обязательно читает `sources/master-archive-v1/.../item_location_links.csv`. Для строк с `master_link:<ILO...>` заявленный класс ограничен максимумом процитированных MASTER-связей; исходный класс сохраняется в `class_capped_from`. После C001 непустая помета есть у 100 итоговых правил. Проверка не доказывает соответствие архетипа месту: пример гребня из повторной проверки ею не выявляется.

Остальные поля:
- **count_limit.** Берётся из `count_limit`/`max_count` или из распознанной записи `count_limit_rule` вида `piece:max 1 instance-group per first-arrival roll;...` (`pool_count_limit_rule`). Если лимит не задан, ставится 1 с пометкой `default_minimum_1`. Нераспознанный непустой `count_limit_rule` отклоняется.
- **allowed_seasons.** Словарь `winter|spring|summer|autumn|all`, календарь temporal-v4 (Julian, 3 месяца на сезон). Синонимы: spring_rasputitsa → spring, early/late_winter → winter. Просто `rasputitsa` отклоняется: распутица бывает и весной, и осенью.
- **refresh_class.** `none` (по умолчанию) или `by_year_season`, как в норме §8.1 и решении D6. Синоним: season → by_year_season. В задании было «none|season»; сохранено значение нормы.

## Контракт входного пула (для других групп)

Файл CSV в папке любой группы подхватывается сборщиком, если в заголовке есть все три поля:
- `frequency_class`;
- `category_ref` или `category_id`, и значение резолвится в `categories/category_registry.csv`;
- scope: `place_family_id` / `pf_id` / `pf_ids` (список через `;`), или пара `scope_kind` + `scope_ref`, или `g4_ref` / `g5_ref` / `landscape_template_id`.

Необязательные поля: `region_id` (пусто = общемировое), `count_limit` / `max_count` / `count_limit_rule`, `allowed_seasons` / `season_period` / `seasons` / `season`, `refresh_class`, `confidence`.

Для `items-household-personal/items/item_place_frequency.csv` условия `entry_visible_if` и `search_only_if` обязательны. Они переносятся в одно правило категории без превращения в безусловную видимость: частота означает возможность присутствия, а способ обнаружения зависит от фактического размещения экземпляра. Для `pf_class=wild` также требуется `wild_arrival_cause_required=prior_visitor_loss_or_discard`; без установленной причины рукотворная вещь не появляется. У правил fauna и people эти три колонки пусты. Слияние категориальных строк допускается только при совпадении всех трёх условий.

`source_refs` обязателен.

Сборщик проверяет каждую строку:
- category и scope резолвятся;
- класс известен;
- `count_limit` — целое не меньше 1; непустой `count_limit_rule` распознаётся или отклоняется;
- сезоны входят в словарь;
- `refresh_class` входит в словарь;
- `source_refs` не пуст.

Строки с ошибками не попадают в таблицу. Они перечислены в отчёте с причинами. Сезоны хранятся раздельно; дубли по (scope_kind, scope_ref, region_id, category_ref, сезон) сливаются с выбором большего ppm и лимита, конфликт пишется в отчёт.

`scope_kind` может быть `place_family`, `g4`, `g5`, `region`, `landscape_template`, `place_template`, `scene_template`, `container_template`. В норме §8.1 есть только последние четыре. Для `place_family`, `g4`, `g5` и `region` колонка `contract_scope_kind=no_needs_cr`: нужна поправка нормы через CR.

Колонки вывода, добавленные 2026-09-26: `class_capped_from` (исходный `frequency_class` до понижения MASTER-проверкой; пусто, если не понижался) и `pool_confidence` (исходный `confidence` строки пула, до того как `confidence` в этой таблице стал всегда `C` — см. «Правило перевода» выше).

## Правки C002 — люди

К категориальным правилам добавлены 69 candidate-правил людей для всех 16 PF, используемых 32 G4 и 195 G5 в `places/node_binding.csv`. `subject_kind=social_role|occupation`, `subject_ref` проверяется по `data/novgorod-region/novgorod_social_roles_v1.tsv` или `novgorod_occupations_v1.tsv`; `category_ref` у людей пуст. Ключ включает subject, сезон и время суток (`morning|day|evening|night`); для категорий `allowed_times=all`.

Число `probability_ppm=250000` следует из существующего `frequency_rule.json` для `contextual`. Это редакционное candidate-правило без измеренного числового источника (`no_source` для вероятности), не историческая частота. `source_refs` указывает словарный профиль занятия/роли; он поддерживает тип человека, но не число. `count_limit=1` — редакционный candidate-лимит, не численность жителей. `guards` — условия применимости перед броском; их значения пока авторский текст, runtime evaluator здесь не заявлен. `refresh_class` задаётся явно. `place_family` и времена суток требуют отдельного согласования с DDL §8.1, где этих полей пока нет; все строки остаются `candidate`.

## Известные пробелы

- **Файлы, которые пока не подходят под контракт** (список — в `frequency_files_not_matching_pool_contract` отчёта, на пересборке 2026-09-26 — 15 файлов, включая новые группы fauna-fish-invertebrates-livestock, flora-herbs-berries-mushrooms и flora-trees-shrubs, появившиеся после прежней сборки): у большинства есть scope, но нет категории; у food-drink `ingredients.csv` наоборот; у части (adornment, personal_names, погодные, hazards) нет ни того, ни другого.
- **У пула предметов не хватает категорий.** Актуальное число отклонённых строк см. в `reports/presence-rules-report.json`.
- **MASTER-проверка не ловит рассогласование scope-архетипа.** Cобранная 2026-09-26 проверка (см. выше) сверяет заявленный класс с MASTER-связями, но не проверяет, что цитируемая связь MASTER относится к тому же `location_archetype`, что и заявленный `pf_id` пула. Пример: строки гребня `it_ps_comb_double` в `item_place_frequency.csv` заявляют присутствие в `church_interior`/`fishing_camp`, но все цитируемые `master_link` относятся к MASTER-архетипу `scribe_area`/`fishing_site` (близкие, но не тот же `pf_id`). Числовая проверка это пропускает, потому что среди цитат есть MASTER-связь другого материального компонента гребня с `spawn_frequency=ubiquitous`. Исправление принадлежит `items-household-personal` (их выбор, как схлопывать материальные компоненты составного предмета в pf_id), не этой группе.
- **Реестр категорий неполон.** После пересборки 2026-09-26 остаются пустыми домены food, behavior, motive, knowledge, activity (flora и fauna уже подхватились — см. `categories/README.md`). Пулы этих доменов нельзя перевести в правила, пока группы не дадут категории.
- **Слияние «максимум ppm» при дублях по (scope, category, сезон)** может выбрать значение от другого предмета той же категории, а не от того, чья MASTER-связь точнее. Правило заявлено (см. скрипт), но калибровка и сам принцип «максимум» требуют решения владельца.
- **Правило не утверждено.** Правило перевода (включая сами значения ppm, помеченные как placeholder) и замена `none|season` на `none|by_year_season` ждут решения владельца.
