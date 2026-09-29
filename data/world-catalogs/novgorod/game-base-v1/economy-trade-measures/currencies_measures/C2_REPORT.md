# Стенд C2: интервальная шкала цен в БУЕ

Статус: детерминированная candidate-симуляция. `k`, N и база не выбраны и не утверждены. Проверена сетка `k=2…8` с шагом 0,25.

## Метод

- Формула D44: `цена = база × k^ступень`; ступени 0…5: 0=`low`, 1=`low_to_ordinary`, 2=`ordinary`, 3=`ordinary_to_valuable`, 4=`valuable`, 5=`high_value`.
- Метод `cow_base`: точечная база `цена коровы / k^4`.
- Метод `all_sourced_fit`: для каждого наблюдения `y` на ступени `s` допустима база `[y/k^(s+1), y/k^(s-1)]`; берётся пересечение пяти интервалов и кризисных потолков. Для расчётной строки используется середина допустимого интервала, но решение о базе не принимается.
- Нож — оптовая нормализация; повой — proxy шапки; веретище — нижняя аналогия с неизвестной мерой. Они показаны отдельно и не выдаются за точные цены произвольной категории.
- Crisis-наблюдения не входят в fit. Штрафы Правды используются только для диагностического N и порядка, не как рынок.

## Совместимые интервалы k

| метод базы | совместимый k на сетке | точек |
|---|---|---:|
| база от коровы | 4–6.25 | 10 |
| интервал по 5 наблюдениям | 3.5–6.25 | 12 |

Интервалы — результат сетки, не выбор владельца.

## Наблюдение против полосы: sourced-входы

| наблюдение | единица источника | observed БУЕ | candidate-полоса | в ±1 при cow_base | в ±1 при all_sourced_fit | оговорка |
|---|---|---:|---|---|---|---|
| нож №438 | item | 511.89 | low | 3.25–6.5 | 2.75–8 | 50 ножей за 1/2 гривны; оптовая нормализация |
| корова | head | 153567.00 | valuable | 2–8 | 2.5–8 | прямой market anchor |
| конь | head | 204756.00 | valuable | 2–8 | 2.75–8 | прямой market anchor |
| повой | item-like, source unit unknown | 3071.34 | low_to_ordinary | 2.75–7 | 2.25–8 | условный proxy простой шапки; исходная единица не названа |
| веретище | cloth measure unknown | 7678.35 | ordinary | 2.75–8 | 2–8 | нижняя аналогия, не тождество с произвольной льняной тканью |

## Наблюдение против полосы: crisis

| id | период | единица | observed БУЕ | полоса | проверка |
|---|---|---|---:|---|---|
| pa_oats_kad_1215_famine | 1215–1215 | кадь | 153567 | ordinary_to_valuable | candidate-полоса показана; crisis-наблюдение не входит в fit |
| pa_turnip_cart_1215_famine | 1215–1215 | воз | 102378 | — | контекст; отдельной сопоставимой ordinary-полосы/единицы нет |
| pa_rye_kad_1215_famine | 1215–1215 | кадь | 511890 | ordinary_to_valuable | candidate-полоса показана; отдельный кризисный контекст не входит в fit |
| pa_rye_kad_1228_shortage | 1228–1228 | кадь | 153567 | ordinary_to_valuable | ordinary < shortage < famine; кадь/хлеб того же года |
| pa_bread_1228_shortage | 1228–1228 | хлеб (единица не уточнена) | 2048 | low | ordinary < shortage < famine; кадь/хлеб того же года |
| pa_oats_kad_1230_famine | 1230–1230 | кадь | 665457 | ordinary_to_valuable | candidate-полоса показана; crisis-наблюдение не входит в fit |
| pa_wheat_kad_1230_famine | 1230–1230 | кадь | 2047560 | — | контекст; отдельной сопоставимой ordinary-полосы/единицы нет |
| pa_millet_kad_1230_famine | 1230–1230 | кадь | 2559450 | — | контекст; отдельной сопоставимой ordinary-полосы/единицы нет |
| pa_rye_quarter_kad_1230_famine | 1230–1231 | четверть кади | 204756 | ordinary_to_valuable | NOT_COMPARABLE: четверть кади не смешивается с кадью |
| pa_rye_kad_1230_famine | 1230–1230 | кадь | 1023780 | ordinary_to_valuable | ordinary < shortage < famine; кадь/хлеб того же года |
| pa_bread_1230_famine | 1230–1230 | хлеб (единица не уточнена) | 8190 | low | ordinary < shortage < famine; кадь/хлеб того же года |
| pa_salt_berkovets_pskov_1232_1233_crisis | 1232–1233 | берковец | not_established | ordinary_to_valuable | NOT_COMPARABLE: Псков, вид гривны и БУЕ не установлены |
| cr_honey_pood_1170_blockade | 1170 | пуд | 10238 | ordinary | ordinary candidate ≤ crisis ceiling; не ordinary-якорь |

## Кадь ржи против хлеба того же года

| год | observed ratio | curve ratio | в ±1 при cow_base | в ±1 при all_sourced_fit | источник |
|---:|---:|---:|---|---|---|
| 1170 | 40.00 | k^3 | 2.75–6.25 | 2.75–6.25 | cr_rye_kad_1170_blockade / cr_bread_1170_blockade |
| 1228 | 75.00 | k^3 | 3–8 | 3–8 | pa_rye_kad_1228_shortage / pa_bread_1228_shortage |
| 1230 | 125.00 | k^3 | 3.5–8 | 3.5–8 | pa_rye_kad_1230_famine / pa_bread_1230_famine |

Это отношение цен двух исторических единиц, не физическая конверсия массы или числа хлебов в кади.

## Полная сетка

| метод | k | допустимая low-база, БУЕ | sourced misses | crisis misses | order misses | минимальный N | итог |
|---|---:|---:|---:|---:|---:|---:|---|
| cow_base | 2 | 9597.94…9597.94 | 3 | 5 | 0 | 7.50 | FAIL |
| cow_base | 2.25 | 5991.95…5991.95 | 3 | 5 | 0 | 5.93 | FAIL |
| cow_base | 2.5 | 3931.32…3931.32 | 3 | 5 | 0 | 4.80 | FAIL |
| cow_base | 2.75 | 2685.14…2685.14 | 1 | 4 | 0 | 3.97 | FAIL |
| cow_base | 3 | 1895.89…1895.89 | 1 | 2 | 0 | 3.75 | FAIL |
| cow_base | 3.25 | 1376.46…1376.46 | 0 | 2 | 0 | 3.75 | FAIL |
| cow_base | 3.5 | 1023.35…1023.35 | 0 | 1 | 0 | 3.75 | FAIL |
| cow_base | 3.75 | 776.56…776.56 | 0 | 1 | 0 | 3.75 | FAIL |
| cow_base | 4 | 599.87…599.87 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 4.25 | 470.70…470.70 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 4.5 | 374.50…374.50 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 4.75 | 301.66…301.66 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 5 | 245.71…245.71 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 5.25 | 202.14…202.14 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 5.5 | 167.82…167.82 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 5.75 | 140.48…140.48 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 6 | 118.49…118.49 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 6.25 | 100.64…100.64 | 0 | 0 | 0 | 3.75 | PASS |
| cow_base | 6.5 | 86.03…86.03 | 0 | 1 | 0 | 3.75 | FAIL |
| cow_base | 6.75 | 73.97…73.97 | 1 | 1 | 0 | 3.75 | FAIL |
| cow_base | 7 | 63.96…63.96 | 1 | 1 | 0 | 3.75 | FAIL |
| cow_base | 7.25 | 55.58…55.58 | 2 | 1 | 0 | 3.75 | FAIL |
| cow_base | 7.5 | 48.53…48.53 | 2 | 1 | 0 | 3.75 | FAIL |
| cow_base | 7.75 | 42.57…42.57 | 2 | 1 | 0 | 3.75 | FAIL |
| cow_base | 8 | 37.49…37.49 | 2 | 1 | 0 | 3.75 | FAIL |
| all_sourced_fit | 2 | нет | 4 | 5 | 0 | 3.75 | FAIL |
| all_sourced_fit | 2.25 | нет | 3 | 5 | 0 | 3.75 | FAIL |
| all_sourced_fit | 2.5 | нет | 2 | 4 | 0 | 3.75 | FAIL |
| all_sourced_fit | 2.75 | 1301.89…1353.76 | 0 | 2 | 0 | 3.75 | FAIL |
| all_sourced_fit | 3 | 842.62…1137.53 | 0 | 1 | 0 | 3.75 | FAIL |
| all_sourced_fit | 3.25 | 564.70…969.26 | 0 | 1 | 0 | 3.75 | FAIL |
| all_sourced_fit | 3.5 | 389.85…835.74 | 0 | 0 | 0 | 3.75 | PASS |
| all_sourced_fit | 3.75 | 276.11…728.02 | 0 | 0 | 0 | 3.75 | PASS |
| all_sourced_fit | 4 | 199.96…639.86 | 0 | 0 | 0 | 3.75 | PASS |
| all_sourced_fit | 4.25 | 170.04…566.80 | 0 | 0 | 0 | 3.75 | PASS |
| all_sourced_fit | 4.5 | 151.67…505.57 | 0 | 0 | 0 | 3.75 | PASS |
| all_sourced_fit | 4.75 | 136.13…453.75 | 0 | 0 | 0 | 3.75 | PASS |
| all_sourced_fit | 5 | 122.85…409.51 | 0 | 0 | 0 | 3.75 | PASS |
| all_sourced_fit | 5.25 | 111.43…371.44 | 0 | 0 | 0 | 3.75 | PASS |
| all_sourced_fit | 5.5 | 101.53…338.44 | 0 | 0 | 0 | 3.93 | PASS |
| all_sourced_fit | 5.75 | 92.89…309.65 | 0 | 0 | 0 | 4.30 | PASS |
| all_sourced_fit | 6 | 85.31…284.38 | 0 | 0 | 0 | 4.68 | PASS |
| all_sourced_fit | 6.25 | 81.90…262.09 | 0 | 0 | 0 | 5.13 | PASS |
| all_sourced_fit | 6.5 | 78.75…242.31 | 0 | 1 | 0 | 5.60 | FAIL |
| all_sourced_fit | 6.75 | 75.84…224.70 | 0 | 1 | 0 | 6.09 | FAIL |
| all_sourced_fit | 7 | 73.13…208.93 | 0 | 1 | 0 | 6.62 | FAIL |
| all_sourced_fit | 7.25 | 70.61…194.77 | 0 | 1 | 0 | 7.16 | FAIL |
| all_sourced_fit | 7.5 | 68.25…182.01 | 0 | 1 | 0 | 7.73 | FAIL |
| all_sourced_fit | 7.75 | 66.05…170.45 | 0 | 1 | 0 | 8.33 | FAIL |
| all_sourced_fit | 8 | 63.99…159.97 | 0 | 1 | 0 | 8.96 | FAIL |

## Полосы всех категорий

Все 38 категорий рассчитаны на 25 значениях k обоими методами; ниже — входные единицы и основания.

| category_id | единица | полоса | basis | причина |
|---|---|---|---|---|
| price_category.livestock.horse | head | valuable | sourced | Рыночные свидетельства 4 и 3 гривны за голову различаются меньше одной проверяемой ступени; конь и корова остаются в одной полосе, точные наблюдения сохраняются отдельно. |
| price_category.livestock.cow | head | valuable | sourced | Рыночное свидетельство даёт меньшую сумму, чем для коня; valuable также гарантирует корова > ведро. |
| price_category.livestock.ox | head | valuable | analogy | Рыночной цены нет; полоса по близости к корове и более высокому штрафному возмещению. Штраф используется только как отношение. |
| price_category.livestock.sheep | head | ordinary | analogy | Рыночной цены нет; нижняя относительно коровы полоса по штрафному отношению 5 к 40, не как абсолютная цена. |
| price_category.livestock.pig | head | ordinary | analogy | Рыночной цены нет; одна полоса с овцой по одинаковому штрафному возмещению, не как абсолютная цена. |
| price_category.livestock.goat | head | ordinary | analogy | Прямой цены и отдельного штрафа нет; аналогия с другим мелким домашним скотом. |
| price_category.livestock.poultry | head | low_to_ordinary | analogy | Прямой рыночной цены нет; ниже мелкого скота по размеру и по правдовому отношению для птицы, которое не считается ценой. |
| price_category.household.bucket | item | ordinary | derived_rule | Candidate-полоса из draft-каталога; прямой рыночной цены ведра нет. |
| price_category.household.pot | item | low | derived_rule | Candidate-полоса из draft-каталога; прямой рыночной цены горшка нет. |
| price_category.household.axe | item | ordinary | derived_rule | Рабочий топор пересажен в ordinary после калибровки; прямой рыночной цены нет. |
| price_category.household.knife | item | low | derived_rule | Оптовое наблюдение 50 ножей за половину гривны нормализуется до примерно половины куны за штуку; полоса остаётся candidate из-за bulk-контекста. |
| price_category.household.spindle | item | low_to_ordinary | analogy | Малый деревянный инструмент; полоса по аналогии с иглой и нитью, без абсолютной цены. |
| price_category.household.chest | item | ordinary_to_valuable | derived_rule | Draft ставил сундук рядом с коровой; без рыночной цены candidate опущен на ступень: крупнее короба, но не равен скоту по доказанным данным. |
| price_category.household.lock | item | ordinary | analogy | Железная фурнитура требует материала и работы, но меньше сундука; прямой ценовой строки нет, поэтому valuable-положение не поддержано. |
| price_category.military.chainmail | item | high_value | analogy | Редкий многокомпонентный доспех elite_war; прямой рыночной цены в корпусе нет. |
| price_category.military.chainmail_patch | item | ordinary | derived_rule | Часть ремонтного комплекта не выше ordinary и строго ниже целой кольчуги; это проектное отношение часть < целое. |
| price_category.military.sword | item | high_value | analogy | Редкое оружие elite_war; прямой рыночной цены в корпусе нет. |
| price_category.military.battle_axe | item | ordinary_to_valuable | derived_rule | Ровно на одну ступень выше рабочего топора из-за военного исполнения; прямой рыночной цены нет. |
| price_category.military.shield | item | ordinary_to_valuable | analogy | Составная common_war защита выше обычной утвари, но valuable без прямой цены было завышено на ступень. |
| price_category.military.helmet | item | ordinary_to_valuable | analogy | Железная common_war защита выше обычной утвари; без прямой цены valuable не фиксируется. |
| price_category.clothing.shirt | item | ordinary | analogy | Базовая одежда ниже верхней свиты; собственной ценовой строки нет. |
| price_category.clothing.svita | item | ordinary_to_valuable | derived_rule | Candidate-привязка верхней одежды к draft-полосе простого плаща; прямой рыночной цены нет. |
| price_category.clothing.boots | item | ordinary_to_valuable | derived_rule | Кожаные сапоги поставлены на ступень выше простой обуви; археологическая категория есть, цены нет. |
| price_category.clothing.cap | item | low_to_ordinary | sourced | Полоса опирается на засвидетельствованный дешёвый повой; форма не отождествляется с каждой шапкой. |
| price_category.textile.linen | cloth_measure_not_established | ordinary | analogy | Веретище №609 за 3 ногаты — нижняя аналогия: это грубая ткань с неизвестной мерой, а не прямая цена произвольного льняного полотна. |
| price_category.textile.wool | cloth_measure_not_established | valuable | derived_rule | Candidate-привязка к draft-полосе шерстяной ткани; material registry и цена остаются gap. |
| price_category.fur.squirrel | pelt | low | analogy | Одна шкурка отделена от торговой связки; домонгольский курс векши не установлен, поэтому точная цена не выводится. |
| price_category.fur.squirrel_bundle | bundle_quantity_not_established | valuable | derived_rule | Торговый лот отделён от одной шкурки; размер связки не установлен, поэтому valuable остаётся candidate, а не умножением на выдуманное количество. |
| price_category.fur.marten | pelt | ordinary | analogy | Ориентир около 7,5 г серебра за кунью шкурку даёт порядок ordinary, но относится к более ранней денежно-меховой аналогии. |
| price_category.fur.sable | pelt | valuable | analogy | Редкий торговый мех поставлен выше куницы, но не выше valuable: цена бобра и сведения о кунице не являются ценой соболя. |
| price_category.food.salt | berkovets | ordinary_to_valuable | analogy | Условный якорь №219 за берковец ближе к ordinary_to_valuable, но чтение остаётся needs_review и не считается sourced. |
| price_category.food.honey | pood | ordinary | derived_rule | Блокадные 10 кун/пуд в 1170 г. — crisis ceiling; ordinary candidate не ставится выше этого наблюдения. |
| price_category.food.wax | pood | high_value | derived_rule | Candidate-привязка к draft торговой полосе; абсолютной цены Новгорода около 1230 г. нет. |
| price_category.food.fresh_fish | lot_not_established | low_to_ordinary | derived_rule | Candidate-привязка к draft-полосе; базовая единица лота не установлена. |
| price_category.food.dried_fish | lot_not_established | ordinary | derived_rule | Candidate-привязка к draft-полосе; базовая единица лота не установлена. |
| price_category.food.rye | kad | ordinary_to_valuable | derived_rule | Цена за кадь отделена от цены одного хлеба; candidate ordinary остаётся ниже shortage 1228 и famine 1230. |
| price_category.food.barley_oats | kad | ordinary_to_valuable | analogy | Кадь кормового зерна следует масштабу зерновой меры; отдельного ordinary-якоря нет, кризисные пары ржи на неё численно не переносятся. |
| price_category.food.bread | loaf_unit_unspecified | low | derived_rule | Low-полоса ограничена shortage-наблюдением 1228 г.; обычная цена и масса хлеба не установлены. |

Овца оставлена `ordinary`, корова — `valuable`: штрафное отношение 1:8 подтверждает только порядок, но не является рыночной ценой и потому не калибрует расстояние между полосами. Расхождение candidate-кривой со штрафом отражает диагностический N.

## Регрессии master archive

- `master_archive_bucket_over_cow`: Деревянное ведро для доения 495-1575 против Невысокая домашняя корова северного средневекового типа 66-210 — нарушение поймано; обе строки `model_only`, не исторические цены.
- `master_archive_patch_equals_chainmail`: Заплатка кольчуги 99-315 против Кольчуга с рукавами до локтя 99-315 — нарушение поймано; обе строки `model_only`, не исторические цены.

Срез `master_archive_price_regressions.csv` взят из фактических строк `item_price_models.csv`; он ловит старые перекосы, но не легитимирует их числа.
