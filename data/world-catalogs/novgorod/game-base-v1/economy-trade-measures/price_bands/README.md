# price_bands — относительные ценовые полосы (candidate)

Домен группы `economy-trade-measures`, коллектор `collect-economy-trade-measures`. Статус: **candidate**. Приоритет по брифу — `later`, но famine-полосы (голод 1230-1231) собраны сейчас, так как это состояние мира на старте игры.

## Что здесь

- `price_bands.csv` (33 строки, по одной на товар из `novgorod_goods_prices_v1.tsv`) — только **относительные** полосы (`value_band` из закрытого словаря `low | low_to_ordinary | ordinary | ordinary_to_valuable | valuable | high_value`), сезонная/военная/дорожная поправка и непустой `basis`. Численный голодный множитель есть только у зерна и хлеба. **Ни одна ячейка не содержит абсолютной цены** — проверено скриптом (см. ниже) и требованием владельца («цены MASTER не использовать»).
- `category_price_bands_c1230.csv` (38 строк) — привязка словаря к категориям с объявленной базовой единицей. Только 3 строки имеют `basis=sourced` и ссылку на конкретное рыночное наблюдение `evidence/prices/prices-v1.csv#price-*`; draft-привязки помечены `derived_rule`/`analogy`.
- `compensation_reference.csv` (41 строка) — сырые абсолютные числа (штрафы, рыночные crisis-наблюдения) с явным `is_market_price`; штраф ≠ цена. Добавлена собственная хлебная пара shortage 1228 / famine 1230.
- `scripts/derive_price_bands.mjs` — детерминированный генератор `price_bands.csv` из `tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv` (draft, project rule) + вычисленного из `compensation_reference.csv` голодного множителя (см. ниже). Скрипт **прерывается с ошибкой**, если случайно попытается записать абсолютную цену в `price_bands.csv`.
- `scripts/build_category_price_bands.mjs` — authoring/validator категорий; `sourced` требует конкретное наблюдение `evidence/prices/prices-v1.csv#price-*`, отрицательные пробы не пропускают draft-ссылку и штраф из `compensation_reference.csv`.
- `scripts/validate_price_bands.mjs` — проверяет словарь, отсутствие абсолютных цен, `basis` и область famine multiplier; отрицательная проба отвергает ×6,7 у соли. Текущий результат: **PASS** (33/33 строк).

## Метод

1. Относительная полоса берётся из draft-файла `novgorod_goods_prices_v1.tsv`; после C2 явно записаны calibration overrides для ножа, рабочего топора, ржи, ячменя/овса, соли, мёда, беличьей и куньей шкурок и льна. Белка считается за одну шкурку (`low`), отдельная связка оставлена отдельной категорией; куница — `ordinary`, соболь — отдельный редкий мех не выше `valuable`; мёд за пуд — не выше `ordinary`; зерно за кадь и соль — `ordinary_to_valuable`; лён — `ordinary` по аналогии, а не как прямая цена веретища. Это остаётся candidate-проектной моделью, не исторической ценой.
2. Рожь использует наблюдаемое отношение shortage 1228 → famine 1230-1231: 20/3 ≈ ×6,7; это не ordinary baseline. Хлеб использует собственную пару 2 → 8 кун, то есть ×4 в той же неуточнённой единице. Мука остаётся без числа; соль, рыба, мёд, сено и прочие категории не получают множитель без своей пары.
3. Летописные и правдовые числа взяты из book-evidence группы `economy-trade-measures` (домен `price_bands`, 27/244 строк), независимо проверенного на удалённой машине 26.09.2026 — проверяющий явно отметил: «Цены из Русской Правды — штрафные/возмещения, не рыночные» (см. `VERIFICATION.md`), это разграничение сохранено в `compensation_reference.csv#is_market_price`.

## Известные ограничения и gaps

- `item_category_ref` во всех строках — `gap:tsv_category.<category>`: категории самого tsv (food, grain, fur, cloth, tool, utensil...) не привязаны к `category_registry.csv` этого репозитория. Это тот же гап материалов/категорий, что и в `trade_goods_markets`; решение — будущий домен `materials_registry`/`category_parameters` (уже отмечено в сводке критика группы).
- Голодный множитель посчитан ТОЛЬКО для зерновых (рожь); для пшеницы/пшена/овса в летописи даны отдельные абсолютные голодные цены (40/50/13 гривен за кадь) без не-голодного базового года для сравнения — они использованы в `compensation_reference.csv`, но не превращены в собственный множитель (нет базовой точки), чтобы не подставлять чужое отношение под другую культуру.
- `tsv` (novgorod_goods_prices_v1.tsv) сам помечен `status=draft`, `requires_human_historical_audit_for_exact_prices` — это наследуется всеми строками `price_bands.csv` как confidence C для самой полосы.
- Не собраны полосы для услуг (`transport_service`, `service_lodging`, `labor` и т.п. категории того же tsv) — они относятся к домену `services_hire_labor` этой же группы, см. соседнюю папку.
