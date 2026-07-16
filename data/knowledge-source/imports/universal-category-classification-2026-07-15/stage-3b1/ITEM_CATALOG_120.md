# Этап 3B-1 — полный редакторский каталог 120 предметных типов

**Статус:** `editorial_catalog_prepared_not_applied`
**Регион:** `region_novgorod_land`
**Целевая дата:** около 1230 года
**Статус строк:** `draft`

## 1. Правовой и технический статус

Каталог содержит ровно 120 широких item/container template candidates. Он подтверждает только редакторское решение: общий тип не выглядит анахронизмом и может быть рассмотрен для Новгородской земли XIII века. Каталог не является production seed, не создаёт runtime permission, не задаёт materialization weight и не повышает policy из `proposed`.

Каждая строка должна позднее получить отдельные normalized bindings:

```text
object type
primary function
material candidates
use contexts
region/period permission
inventory profile
property/equipment/content profile, если применимо
source records
```

Точные масса, размеры, packing cost, quantity, цена, частотность, качество, owner/holder policy и содержимое контейнера в этой таблице не задаются.

## 2. Контроль количества

| Группа | Количество |
|---|---:|
| `containers_storage` | 18 |
| `household_kitchen` | 15 |
| `craft_textile` | 20 |
| `agriculture_fishing` | 15 |
| `fire_light_travel` | 8 |
| `clothing_personal_religious` | 16 |
| `food_raw_trade` | 12 |
| `writing_trade_locks` | 7 |
| `weapons_protection` | 9 |
| **Итого** | **120** |

## 3. Каталог

| # | Stable template ID | Название | Kind | Группа | Evidence | Source family | Status |
|---:|---|---|---|---|---|---|---|
| 1 | `container_tpl_nov_drawstring_pouch_v1` | затягивающийся кошель | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 2 | `container_tpl_nov_flap_belt_pouch_v1` | поясная сумка с клапаном | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 3 | `container_tpl_nov_small_soft_bag_v1` | небольшая мягкая сумка | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 4 | `container_tpl_nov_sack_v1` | мешок | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 5 | `container_tpl_nov_carrying_basket_v1` | переносная плетёная корзина | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 6 | `container_tpl_nov_birch_bark_box_v1` | берестяная коробка | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 7 | `container_tpl_nov_wooden_box_v1` | деревянная коробка | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 8 | `container_tpl_nov_small_casket_v1` | небольшой ларец | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 9 | `container_tpl_nov_chest_v1` | сундук или ларь | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 10 | `container_tpl_nov_bucket_v1` | ведро | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 11 | `container_tpl_nov_tub_v1` | кадка | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 12 | `container_tpl_nov_cask_v1` | бочка или кадь-бочка | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 13 | `container_tpl_nov_storage_pot_v1` | керамический сосуд для хранения | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 14 | `container_tpl_nov_jug_v1` | керамический кувшин | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 15 | `container_tpl_nov_quiver_v1` | колчан | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 16 | `container_tpl_nov_knife_sheath_v1` | ножны для ножа | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 17 | `container_tpl_nov_sword_scabbard_v1` | ножны для меча | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 18 | `container_tpl_nov_needle_case_v1` | игольник или футляр для игл | `container` | `containers_storage` | `direct_novgorod_or_rus_period` | `container_and_material_culture` | `draft` |
| 19 | `item_tpl_nov_utility_knife_v1` | хозяйственный нож | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 20 | `item_tpl_nov_wooden_spoon_v1` | деревянная ложка | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 21 | `item_tpl_nov_ladle_v1` | половник или ковш | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 22 | `item_tpl_nov_wooden_bowl_v1` | деревянная миска | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 23 | `item_tpl_nov_wooden_cup_v1` | деревянная чашка | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 24 | `item_tpl_nov_wooden_dish_v1` | деревянное блюдо или поднос | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 25 | `item_tpl_nov_cooking_pot_v1` | глиняный горшок для приготовления пищи | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 26 | `item_tpl_nov_metal_cauldron_v1` | металлический котёл | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 27 | `item_tpl_nov_chopping_board_v1` | разделочная доска | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 28 | `item_tpl_nov_mortar_v1` | ступка | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 29 | `item_tpl_nov_pestle_v1` | пест | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 30 | `item_tpl_nov_sieve_v1` | сито | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 31 | `item_tpl_nov_scoop_v1` | деревянный совок | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 32 | `item_tpl_nov_trough_v1` | корыто | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 33 | `item_tpl_nov_hand_quern_v1` | ручной жернов | `item` | `household_kitchen` | `direct_novgorod_or_rus_period` | `wood_iron_ceramic_material_culture` | `draft` |
| 34 | `item_tpl_nov_working_axe_v1` | рабочий топор | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 35 | `item_tpl_nov_adze_v1` | тесло | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 36 | `item_tpl_nov_chisel_v1` | долото | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 37 | `item_tpl_nov_auger_v1` | бурав или сверло | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 38 | `item_tpl_nov_hammer_v1` | молоток | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 39 | `item_tpl_nov_wooden_mallet_v1` | деревянная киянка | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 40 | `item_tpl_nov_smithing_tongs_v1` | кузнечные клещи | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 41 | `item_tpl_nov_file_v1` | напильник | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 42 | `item_tpl_nov_awl_v1` | шило | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 43 | `item_tpl_nov_scraper_v1` | скребок | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 44 | `item_tpl_nov_carving_knife_v1` | резец или ремесленный нож | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 45 | `item_tpl_nov_saw_v1` | пила | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 46 | `item_tpl_nov_wedge_v1` | клин | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 47 | `item_tpl_nov_sewing_needle_v1` | швейная игла | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 48 | `item_tpl_nov_shears_v1` | ножницы | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 49 | `item_tpl_nov_spindle_v1` | веретено | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 50 | `item_tpl_nov_spindle_whorl_v1` | пряслице | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 51 | `item_tpl_nov_distaff_v1` | прялка | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 52 | `item_tpl_nov_weaving_shuttle_v1` | ткацкий челнок | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 53 | `item_tpl_nov_fiber_comb_v1` | гребень для обработки волокна | `item` | `craft_textile` | `direct_novgorod_or_rus_period` | `iron_wood_textile_archaeology` | `draft` |
| 54 | `item_tpl_nov_sickle_v1` | серп | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 55 | `item_tpl_nov_scythe_v1` | коса | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 56 | `item_tpl_nov_hoe_v1` | мотыга | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 57 | `item_tpl_nov_wooden_shovel_v1` | деревянная лопата | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 58 | `item_tpl_nov_iron_edged_spade_v1` | лопата с железной рабочей частью | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 59 | `item_tpl_nov_rake_v1` | грабли | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 60 | `item_tpl_nov_pitchfork_v1` | вилы | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 61 | `item_tpl_nov_billhook_v1` | крюк или нож для подрезки ветвей | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 62 | `item_tpl_nov_fishhook_v1` | рыболовный крючок | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 63 | `item_tpl_nov_fishing_line_v1` | рыболовный шнур | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 64 | `item_tpl_nov_fishing_net_v1` | рыболовная сеть | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 65 | `item_tpl_nov_net_float_v1` | сетевой поплавок | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 66 | `item_tpl_nov_net_sinker_v1` | сетевое грузило | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 67 | `item_tpl_nov_fishing_spear_v1` | рыболовная острога | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 68 | `item_tpl_nov_fish_trap_v1` | плетёная рыбная ловушка | `item` | `agriculture_fishing` | `direct_novgorod_or_rus_period` | `agriculture_fishing_archaeology` | `draft` |
| 69 | `item_tpl_nov_firesteel_v1` | кресало | `item` | `fire_light_travel` | `rus_period_with_novgorod_context` | `household_and_travel_material_culture` | `draft` |
| 70 | `item_tpl_nov_striking_flint_v1` | кремень для высекания искр | `item` | `fire_light_travel` | `rus_period_with_novgorod_context` | `household_and_travel_material_culture` | `draft` |
| 71 | `item_tpl_nov_tinder_v1` | трут | `item` | `fire_light_travel` | `rus_period_with_novgorod_context` | `household_and_travel_material_culture` | `draft` |
| 72 | `item_tpl_nov_kindling_bundle_v1` | связка растопки | `item` | `fire_light_travel` | `rus_period_with_novgorod_context` | `household_and_travel_material_culture` | `draft` |
| 73 | `item_tpl_nov_wax_candle_v1` | восковая свеча | `item` | `fire_light_travel` | `rus_period_with_novgorod_context` | `household_and_travel_material_culture` | `draft` |
| 74 | `item_tpl_nov_simple_lamp_v1` | простой светильник | `item` | `fire_light_travel` | `rus_period_with_novgorod_context` | `household_and_travel_material_culture` | `draft` |
| 75 | `item_tpl_nov_torch_v1` | факел | `item` | `fire_light_travel` | `rus_period_with_novgorod_context` | `household_and_travel_material_culture` | `draft` |
| 76 | `item_tpl_nov_rope_v1` | верёвка | `item` | `fire_light_travel` | `rus_period_with_novgorod_context` | `household_and_travel_material_culture` | `draft` |
| 77 | `item_tpl_nov_linen_shirt_v1` | нижняя рубаха | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 78 | `item_tpl_nov_trousers_v1` | штаны | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 79 | `item_tpl_nov_wool_outer_garment_v1` | верхняя шерстяная одежда | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 80 | `item_tpl_nov_cloak_v1` | плащ или накидка | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 81 | `item_tpl_nov_belt_v1` | пояс | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 82 | `item_tpl_nov_low_leather_shoes_v1` | низкая кожаная обувь | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 83 | `item_tpl_nov_boots_v1` | сапоги | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 84 | `item_tpl_nov_cap_v1` | головной убор | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 85 | `item_tpl_nov_hood_v1` | капюшон | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 86 | `item_tpl_nov_mittens_v1` | рукавицы | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 87 | `item_tpl_nov_leg_wraps_v1` | обмотки для ног | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 88 | `item_tpl_nov_fur_outerwear_v1` | меховая верхняя одежда | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 89 | `item_tpl_nov_comb_v1` | расчёска | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 90 | `item_tpl_nov_razor_v1` | бритва | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 91 | `item_tpl_nov_metal_mirror_v1` | металлическое зеркало | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 92 | `item_tpl_nov_pectoral_cross_v1` | нательный крест | `item` | `clothing_personal_religious` | `direct_novgorod_or_rus_period` | `leather_textile_personal_archaeology` | `draft` |
| 93 | `item_tpl_nov_bread_v1` | хлеб | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 94 | `item_tpl_nov_grain_v1` | зерно | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 95 | `item_tpl_nov_flour_v1` | мука | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 96 | `item_tpl_nov_groats_v1` | крупа | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 97 | `item_tpl_nov_salt_v1` | соль | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 98 | `item_tpl_nov_dried_fish_v1` | сушёная рыба | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 99 | `item_tpl_nov_fresh_fish_v1` | свежая рыба | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 100 | `item_tpl_nov_preserved_meat_v1` | сушёное или солёное мясо | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 101 | `item_tpl_nov_cheese_v1` | сыр | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 102 | `item_tpl_nov_honey_v1` | мёд | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 103 | `item_tpl_nov_water_v1` | вода как переносимый запас | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 104 | `item_tpl_nov_beeswax_v1` | воск | `item` | `food_raw_trade` | `rus_period_with_novgorod_context` | `food_trade_material_culture` | `draft` |
| 105 | `item_tpl_nov_folding_balance_v1` | складные весы | `item` | `writing_trade_locks` | `direct_novgorod` | `birchbark_trade_lock_archaeology` | `draft` |
| 106 | `item_tpl_nov_weight_set_v1` | набор гирек | `item` | `writing_trade_locks` | `direct_novgorod` | `birchbark_trade_lock_archaeology` | `draft` |
| 107 | `item_tpl_nov_key_v1` | ключ | `item` | `writing_trade_locks` | `direct_novgorod` | `birchbark_trade_lock_archaeology` | `draft` |
| 108 | `item_tpl_nov_lock_v1` | замок | `item` | `writing_trade_locks` | `direct_novgorod` | `birchbark_trade_lock_archaeology` | `draft` |
| 109 | `item_tpl_nov_seal_v1` | печать или пломба | `item` | `writing_trade_locks` | `direct_novgorod` | `birchbark_trade_lock_archaeology` | `draft` |
| 110 | `item_tpl_nov_birch_bark_sheet_v1` | лист бересты для записи | `item` | `writing_trade_locks` | `direct_novgorod` | `birchbark_trade_lock_archaeology` | `draft` |
| 111 | `item_tpl_nov_stylus_v1` | писало | `item` | `writing_trade_locks` | `direct_novgorod` | `birchbark_trade_lock_archaeology` | `draft` |
| 112 | `item_tpl_nov_bow_v1` | лук | `item` | `weapons_protection` | `direct_novgorod_or_rus_period` | `weapons_archaeology` | `draft` |
| 113 | `item_tpl_nov_arrow_v1` | стрела | `item` | `weapons_protection` | `direct_novgorod_or_rus_period` | `weapons_archaeology` | `draft` |
| 114 | `item_tpl_nov_spear_v1` | копьё | `item` | `weapons_protection` | `direct_novgorod_or_rus_period` | `weapons_archaeology` | `draft` |
| 115 | `item_tpl_nov_sword_v1` | меч | `item` | `weapons_protection` | `direct_novgorod_or_rus_period` | `weapons_archaeology` | `draft` |
| 116 | `item_tpl_nov_combat_axe_v1` | боевой топор | `item` | `weapons_protection` | `direct_novgorod_or_rus_period` | `weapons_archaeology` | `draft` |
| 117 | `item_tpl_nov_mace_v1` | булава или тяжёлая дубина | `item` | `weapons_protection` | `direct_novgorod_or_rus_period` | `weapons_archaeology` | `draft` |
| 118 | `item_tpl_nov_shield_v1` | щит | `item` | `weapons_protection` | `direct_novgorod_or_rus_period` | `weapons_archaeology` | `draft` |
| 119 | `item_tpl_nov_helmet_v1` | шлем | `item` | `weapons_protection` | `direct_novgorod_or_rus_period` | `weapons_archaeology` | `draft` |
| 120 | `item_tpl_nov_mail_armour_v1` | кольчужная защита | `item` | `weapons_protection` | `direct_novgorod_or_rus_period` | `weapons_archaeology` | `draft` |

## 4. Принятые редакторские решения

- Мешок, кошель и сумки включены как самостоятельные container templates.
- Ножны, колчан и игольник считаются специализированными контейнерами, а не свойствами предмета.
- Рабочий и боевой топоры разделены по primary function и социальному контексту.
- Кресало, кремень и трут остаются отдельными предметами; один не создаёт остальные автоматически.
- Вода и пищевые товары являются переносимыми ресурсами, но требуют контейнера, quantity и spoilage profiles.
- Береста и писало включены на основании прямого новгородского письменного контекста; содержание записи не является свойством template.
- Меч, кольчуга, шлем и щит включены как существующие типы, но не как обычное имущество: их materialization требует role/status/property/legal rules.

## 5. Состояние до создания JSON datasets

Пункты 1, 4, 5, 7 и технические draft profiles из пунктов 6 и 8 реализованы в supplemental bundle. Они не доказывают material, historical presence, quantity, compatibility или social/economic applicability. Пункты 2, 3, 6, 8 и 9 остаются promotion gates; external legacy rows по-прежнему требуют отдельного export.

## 6. Редакторские проверки

Фактически проверены:

- число строк: `120`;
- уникальных stable IDs: `120`;
- container templates: `18`;
- item templates: `102`;
- сумма групп: `120`;
- мешок, затягивающийся кошель и поясная сумка присутствуют;
- все строки имеют kind, group, evidence class, source family и status;
- все строки остаются `draft`;
- catalog не создаёт party state и не активирует runtime candidates.

Этот файл остаётся редакторским источником. Технические проверки derived supplemental bundle фиксируются в едином `README.md`; code critic завершился `PASS WITH NOTES`, а PostgreSQL apply/readback/rollback остаётся не выполненным.
