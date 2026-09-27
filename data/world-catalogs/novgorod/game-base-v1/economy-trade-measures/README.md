# economy-trade-measures — candidate datasets

Собрано коллектором `collect-economy-trade-measures` для группы «Экономика: денежные единицы, меры, товары, торг, ценовые полосы» (см. бриф `gb-retry/economy-trade-measures.json`). **Статус всех таблиц — candidate.** Сборщик не утверждает свои данные; утверждение — отдельный проход владельца/старшей модели.

## Домены и файлы

| Домен | Файлы | Строк |
|---|---|---|
| `currencies_measures/` | `currency_units.csv`, `measure_units.csv` | 15 + 20 |
| `trade_goods_markets/` | `trade_goods.csv`, `markets_practice.csv` | 22 + 15 |
| `price_bands/` | `price_bands.csv`, `compensation_reference.csv` (вспомогательная) | 33 + 39 |
| `services_hire_labor/` | `services.csv` | 34 |
| `sources/` | `books.csv` — библиографический справочник по всем `book:<id>` ссылкам | 16 |

Каждая доменная папка содержит свой `README.md` (метод, источники, gaps) и `scripts/` с детерминированными генераторами (`node build_*.mjs`) и, где применимо, валидаторами acceptance-критериев брифа (`node validate_*.mjs`) — все запущены, все **PASS**.

## Источники (в порядке приоритета «сначала имеющиеся знания»)

1. **Уже одобренные**: `data/world-catalogs/novgorod/sources/master-archive-v1/data/economy_social/{currencies,units_and_measures}.csv` (region audit, approved); `wk:trade-economy-gap-closure-v1`, `wk:trade-economy-batch-03-gap-closure-v1`, `wk:residual-law-norms-v1` (WK production-v1, approved).
2. **Курированные региональные базы**: `novgorod_1230(1) (1).sqlite` (таблицы `economy` 20 строк, `famine_prices` 5 строк, `sources` 30 книг/грамот/раскопок — read-only, локальный файл, взят как существующее знание per project rule); matcult `material_items.csv` (item_template_ref для монет, слитков, весов: TRD0037/0038/0046/0043/0058, CRF0068, FRN0046).
3. **Проектные draft-шаблоны**: `tools/rus13-novgorod-regional-templates/{novgorod_goods_prices_v1.tsv (65 относительных полос), novgorod_trade_rules_v1.json, novgorod_route_knowledge_rules_v1.json}` — именно тот tsv, который бриф называл кандидатом; здесь он расщеплён на товарные (`price_bands`) и сервисные (`services_hire_labor`) строки.
4. **Book evidence, group `economy-trade-measures`** (новое, не было в брифе явно, но найдено по точному имени группы) — 244 строки (currencies_measures 92, trade_goods_markets 125, price_bands 27), собраны из 25 научных/первоисточниковых книг (Янин, БЛДР т.4/Правда Русская, Рыбина, Рыбаков и др., полный список — `sources/books.csv`), **независимо проверены** на удалённой машине 26.09.2026 (`.VERIFICATION.md`: выборка 37/244, ok 81%, minor 19%, wrong 0%) и затем **исправлены** (`.FIXES.md`: 38 строк исправлено, преимущественно перенос `period` c `c1230` на `medieval_general` для фактов после ~1240 г. или ганзейской поры; 0 удалено; `d_validate` 244/244 принято). Использованы как источник фактов «в своих словах + source_refs», без копирования цитат длиннее одного предложения (copyright-правило).

## Существенный вклад в исправление critic_problems сводки (для этой группы)

- **Денежно-весовая система соотношений — закрыта, не осталась «не утверждена»**: полный, проверяемый скриптом непротиворечивый граф соотношений (гривна серебра=4 гривны кун=80 ногат=200 кун, круговой пересчёт даёт 1), с явными gap-метками там, где источники прямо говорят «соотношение не устанавливается для 1230 г.» (векша, берковец/капь).
- **sqlite-источник `novgorod_1230(1) (1).sqlite`** (упомянутый в критике сводки как неучтённый) — использован явно для currencies_measures/price_bands/trade_goods_markets.
- **Anachronism guards добавлены явно** (a не молча пропущены): западная стеклянная посуда (нет в 1230 г.), немецкие скалвы/«весчее»-договор (норма 1259-1270 гг., не 1230 г.), Немецкий (Петров) двор (детали — в основном ганзейская пора), эталоны мер при Иванском сто («гривенка рублевая» — счёт после появления рубля).
- **price_bands**: honour владельческое решение буквально — ни одна ячейка не содержит абсолютной цены (проверено скриптом), при этом голодная поправка обоснована РЕАЛЬНЫМ вычисленным множителем (×6.7, кадь ржи 1228→1230-1231 по НПЛ), а не выдумана.

## Открытые gaps, вынесенные за пределы этой группы

- **materials_registry / category_parameters** (уже отмечены в critic_problems сводки): 16 из 22 строк `trade_goods.csv` и все 33 строки `price_bands.csv` несут `gap:` вместо `item_category_ref`/`category_id`, потому что `category_registry.csv` не содержит категорий сырьевых товаров (зерно, лён, шерсть, железо, цветной металл, строевой лес, серебро-лом) — только готовые предметы или свойства материала одежды/тары.
- **region_economy, price_bands (world_base)** — таблицы схемы v17 остаются пустыми на уровне БД; эти CSV — кандидатный материал для будущего наполнения, миграция не входит в задачу сборщика.
- **Пряности** — зафиксированы как открытый gap (нет подтверждения торговли в Новгороде ~1230 г. ни в одном из проверенных источников), не как факт присутствия/отсутствия.
- **Ставки оплаты труда для рядового найма** (грузчик, покос, волок) почти не засвидетельствованы: единственная прямая историческая цифра во всём собранном корпусе — оплата городнику (Правда Русская).

## Как пересобрать

```
node currencies_measures/scripts/build_currencies_measures.mjs && node currencies_measures/scripts/validate_currency_ratios.mjs
node trade_goods_markets/scripts/build_trade_goods_markets.mjs
node price_bands/scripts/derive_price_bands.mjs && node price_bands/scripts/validate_price_bands.mjs
node services_hire_labor/scripts/build_services.mjs
node sources/build_books.mjs
```
