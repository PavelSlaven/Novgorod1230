import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toCSV } from "../../scripts/lib_csv.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = join(scriptDir, "..", "category_price_bands_c1230.csv");
const compensationPath = join(scriptDir, "..", "compensation_reference.csv");

const BAND_VOCAB = new Set(["low", "low_to_ordinary", "ordinary", "ordinary_to_valuable", "valuable", "high_value"]);
const BASIS_VOCAB = new Set(["sourced", "derived_rule", "analogy"]);

function pricingUnit(categoryId) {
  if (categoryId.startsWith("price_category.livestock.")) return "head";
  if (categoryId.endsWith(".squirrel_bundle")) return "bundle_quantity_not_established";
  if (categoryId.startsWith("price_category.fur.")) return "pelt";
  if (categoryId.endsWith(".salt")) return "berkovets";
  if (categoryId.endsWith(".honey") || categoryId.endsWith(".wax")) return "pood";
  if (categoryId.endsWith(".rye") || categoryId.endsWith(".barley_oats")) return "kad";
  if (categoryId.endsWith(".bread")) return "loaf_unit_unspecified";
  if (categoryId.endsWith(".fresh_fish") || categoryId.endsWith(".dried_fish")) return "lot_not_established";
  if (categoryId.startsWith("price_category.textile.")) return "cloth_measure_not_established";
  return "item";
}

function row(categoryId, nameRu, catalogRefs, valueBand, basis, derivation, sourceRefs, confidence = "C") {
  return {
    category_id: categoryId,
    name_ru: nameRu,
    catalog_refs: catalogRefs,
    pricing_unit: pricingUnit(categoryId),
    value_band: valueBand,
    basis,
    derivation,
    source_refs: sourceRefs,
    confidence,
    status: "candidate",
  };
}

export const rows = [
  row("price_category.livestock.horse", "конь", "fa_dom_horse;ls_horse_work", "valuable", "sourced", "Рыночные свидетельства 4 и 3 гривны за голову различаются меньше одной проверяемой ступени; конь и корова остаются в одной полосе, точные наблюдения сохраняются отдельно.", "evidence/prices/prices-v1.csv#price-38f1a5e0a398; price_bands/compensation_reference.csv#cr_prochiy_kon", "A"),
  row("price_category.livestock.cow", "корова", "fa_dom_cattle;ls_cattle_cow", "valuable", "sourced", "Рыночное свидетельство даёт меньшую сумму, чем для коня; valuable также гарантирует корова > ведро.", "evidence/prices/prices-v1.csv#price-b660246781c9; price_bands/compensation_reference.csv#cr_korova", "C"),
  row("price_category.livestock.ox", "вол", "fa_dom_cattle;ls_cattle_ox", "valuable", "analogy", "Рыночной цены нет; полоса по близости к корове и более высокому штрафному возмещению. Штраф используется только как отношение.", "price_bands/compensation_reference.csv#cr_vol,cr_korova; book:641351 §2797"),
  row("price_category.livestock.sheep", "овца", "fa_dom_sheep;ls_sheep_ewe", "ordinary", "analogy", "Рыночной цены нет; нижняя относительно коровы полоса по штрафному отношению 5 к 40, не как абсолютная цена.", "price_bands/compensation_reference.csv#cr_ovtsa,cr_korova; book:641351 §2797"),
  row("price_category.livestock.pig", "свинья", "fa_dom_pig;ls_pig_sow", "ordinary", "analogy", "Рыночной цены нет; одна полоса с овцой по одинаковому штрафному возмещению, не как абсолютная цена.", "price_bands/compensation_reference.csv#cr_svinya,cr_ovtsa; book:641351 §2797"),
  row("price_category.livestock.goat", "коза", "fa_dom_goat;ls_goat_doe", "ordinary", "analogy", "Прямой цены и отдельного штрафа нет; аналогия с другим мелким домашним скотом.", "fauna/livestock_types.csv#ls_goat_doe; price_bands/compensation_reference.csv#cr_ovtsa"),
  row("price_category.livestock.poultry", "домашняя птица", "fa_dom_chicken;ls_chicken_hen", "low_to_ordinary", "analogy", "Прямой рыночной цены нет; ниже мелкого скота по размеру и по правдовому отношению для птицы, которое не считается ценой.", "fauna/livestock_types.csv#ls_chicken_hen; price_bands/compensation_reference.csv#cr_golub_kuropatka"),

  row("price_category.household.bucket", "ведро", "cat_item_object_bucket_v1;ct_bucket_staved", "ordinary", "derived_rule", "Candidate-полоса из draft-каталога; прямой рыночной цены ведра нет.", "price_bands/price_bands.csv#pb_bucket_pail"),
  row("price_category.household.pot", "глиняный горшок", "cat_item_object_cooking_pot_v1;ct_pot_cooking", "low", "derived_rule", "Candidate-полоса из draft-каталога; прямой рыночной цены горшка нет.", "price_bands/price_bands.csv#pb_clay_pot"),
  row("price_category.household.axe", "рабочий топор", "tool:axe", "ordinary", "derived_rule", "Рабочий топор пересажен в ordinary после калибровки; прямой рыночной цены нет.", "price_bands/price_bands.csv#pb_axe_work"),
  row("price_category.household.knife", "хозяйственный нож", "cat_item_object_utility_knife_v1;tool:knife", "low", "derived_rule", "Оптовое наблюдение 50 ножей за половину гривны нормализуется до примерно половины куны за штуку; полоса остаётся candidate из-за bulk-контекста.", "evidence/prices/prices-v1.csv#price-59b83ab7cb92; https://gramoty.ru/birchbark/document/show/novgorod/438/", "B"),
  row("price_category.household.spindle", "веретено", "cat_item_object_spindle_v1", "low_to_ordinary", "analogy", "Малый деревянный инструмент; полоса по аналогии с иглой и нитью, без абсолютной цены.", "price_bands/price_bands.csv#pb_needle_thread; items/item_categories.csv#cat_item_object_spindle_v1"),
  row("price_category.household.chest", "сундук", "ct_chest_plank", "ordinary_to_valuable", "derived_rule", "Draft ставил сундук рядом с коровой; без рыночной цены candidate опущен на ступень: крупнее короба, но не равен скоту по доказанным данным.", "price_bands/price_bands.csv#pb_chest_storage,pb_box_korob"),
  row("price_category.household.lock", "замок", "cat_item_object_lock_v1", "ordinary", "analogy", "Железная фурнитура требует материала и работы, но меньше сундука; прямой ценовой строки нет, поэтому valuable-положение не поддержано.", "items/item_categories.csv#cat_item_object_lock_v1; price_bands/price_bands.csv#pb_chest_storage,pb_iron_bar"),

  row("price_category.military.chainmail", "кольчуга", "wp_mail_shirt;cat_item_object_mail_armour_v1", "high_value", "analogy", "Редкий многокомпонентный доспех elite_war; прямой рыночной цены в корпусе нет.", "items/weapons_armour.csv#wp_mail_shirt"),
  row("price_category.military.chainmail_patch", "заплатка кольчуги", "wp_armour_repair;cat_item_object_armour_repair_part_v1", "ordinary", "derived_rule", "Часть ремонтного комплекта не выше ordinary и строго ниже целой кольчуги; это проектное отношение часть < целое.", "items/weapons_armour.csv#wp_armour_repair,wp_mail_shirt"),
  row("price_category.military.sword", "меч", "wp_sword;cat_item_object_sword_v1", "high_value", "analogy", "Редкое оружие elite_war; прямой рыночной цены в корпусе нет.", "items/weapons_armour.csv#wp_sword"),
  row("price_category.military.battle_axe", "боевой топор", "wp_battle_axe;cat_item_object_combat_axe_v1", "ordinary_to_valuable", "derived_rule", "Ровно на одну ступень выше рабочего топора из-за военного исполнения; прямой рыночной цены нет.", "items/weapons_armour.csv#wp_battle_axe; price_bands/price_bands.csv#pb_axe_work"),
  row("price_category.military.shield", "щит", "wp_shield_almond;cat_item_object_shield_v1", "ordinary_to_valuable", "analogy", "Составная common_war защита выше обычной утвари, но valuable без прямой цены было завышено на ступень.", "items/weapons_armour.csv#wp_shield_almond"),
  row("price_category.military.helmet", "шлем", "wp_helmet_conical;cat_item_object_helmet_v1", "ordinary_to_valuable", "analogy", "Железная common_war защита выше обычной утвари; без прямой цены valuable не фиксируется.", "items/weapons_armour.csv#wp_helmet_conical"),

  row("price_category.clothing.shirt", "рубаха", "garment.kind.tunic_shirt", "ordinary", "analogy", "Базовая одежда ниже верхней свиты; собственной ценовой строки нет.", "garments/garment_categories.csv#garment.kind.tunic_shirt; price_bands/price_bands.csv#pb_linen_cloth"),
  row("price_category.clothing.svita", "свита", "garment.kind.svita", "ordinary_to_valuable", "derived_rule", "Candidate-привязка верхней одежды к draft-полосе простого плаща; прямой рыночной цены нет.", "price_bands/price_bands.csv#pb_simple_cloak; garments/garment_categories.csv#garment.kind.svita"),
  row("price_category.clothing.boots", "сапоги", "garment.kind.boot;cat_item_object_boots_v1", "ordinary_to_valuable", "derived_rule", "Кожаные сапоги поставлены на ступень выше простой обуви; археологическая категория есть, цены нет.", "price_bands/price_bands.csv#pb_bast_or_simple_shoes; garments/garment_categories.csv#garment.kind.boot"),
  row("price_category.clothing.cap", "простая шапка", "garment.kind.soft_cap;cat_item_object_cap_v1", "low_to_ordinary", "sourced", "Полоса опирается на засвидетельствованный дешёвый повой; форма не отождествляется с каждой шапкой.", "evidence/prices/prices-v1.csv#price-cc9cb66e0e59; price_bands/compensation_reference.csv#cr_povoy", "C"),

  row("price_category.textile.linen", "льняная ткань", "gap:material.textile.linen", "ordinary", "analogy", "Веретище №609 за 3 ногаты — нижняя аналогия: это грубая ткань с неизвестной мерой, а не прямая цена произвольного льняного полотна.", "price_bands/price_bands.csv#pb_linen_cloth; evidence/prices/prices-v1.csv#price-1306752224a2"),
  row("price_category.textile.wool", "шерстяная ткань", "gap:material.textile.wool", "valuable", "derived_rule", "Candidate-привязка к draft-полосе шерстяной ткани; material registry и цена остаются gap.", "price_bands/price_bands.csv#pb_wool_cloth"),
  row("price_category.fur.squirrel", "беличья шкурка", "fa_m_red_squirrel", "low", "analogy", "Одна шкурка отделена от торговой связки; домонгольский курс векши не установлен, поэтому точная цена не выводится.", "price_bands/price_bands.csv#pb_fur_squirrel; currencies_measures/currency_rates_bue.csv#rate_nov_veksha_gap"),
  row("price_category.fur.squirrel_bundle", "связка беличьих шкурок", "fa_m_red_squirrel", "valuable", "derived_rule", "Торговый лот отделён от одной шкурки; размер связки не установлен, поэтому valuable остаётся candidate, а не умножением на выдуманное количество.", "price_bands/price_bands.csv#pb_fur_squirrel; currencies_measures/currency_rates_bue.csv#rate_nov_veksha_gap"),
  row("price_category.fur.marten", "кунья шкурка", "fa_m_pine_marten", "ordinary", "analogy", "Ориентир около 7,5 г серебра за кунью шкурку даёт порядок ordinary, но относится к более ранней денежно-меховой аналогии.", "price_bands/price_bands.csv#pb_fur_marten; book:874865 §368"),
  row("price_category.fur.sable", "соболиная шкурка", "fa_m_sable", "valuable", "analogy", "Редкий торговый мех поставлен выше куницы, но не выше valuable: цена бобра и сведения о кунице не являются ценой соболя.", "fauna-mammals-birds/fauna/mammals.csv#fa_m_sable; evidence/prices/prices-v1.csv#price-f559272e98fb; book:177850 §2277"),

  row("price_category.food.salt", "соль", "gap:commodity.salt", "ordinary_to_valuable", "analogy", "Условный якорь №219 за берковец ближе к ordinary_to_valuable, но чтение остаётся needs_review и не считается sourced.", "price_bands/price_bands.csv#pb_salt; currencies_measures/price_anchors_c1230.csv#pa_salt_berkovets_novgorod_1200_1220_review"),
  row("price_category.food.honey", "мёд", "gap:commodity.honey", "ordinary", "derived_rule", "Блокадные 10 кун/пуд в 1170 г. — crisis ceiling; ordinary candidate не ставится выше этого наблюдения.", "price_bands/price_bands.csv#pb_honey; price_bands/compensation_reference.csv#cr_honey_pood_1170_blockade; evidence/prices/prices-v1.csv#price-67ce4a1c1931"),
  row("price_category.food.wax", "воск", "gap:commodity.wax", "high_value", "derived_rule", "Candidate-привязка к draft торговой полосе; абсолютной цены Новгорода около 1230 г. нет.", "price_bands/price_bands.csv#pb_wax"),
  row("price_category.food.fresh_fish", "свежая рыба", "gap:commodity.fresh_fish", "low_to_ordinary", "derived_rule", "Candidate-привязка к draft-полосе; базовая единица лота не установлена.", "price_bands/price_bands.csv#pb_fresh_fish"),
  row("price_category.food.dried_fish", "сушёная рыба", "gap:commodity.dried_fish", "ordinary", "derived_rule", "Candidate-привязка к draft-полосе; базовая единица лота не установлена.", "price_bands/price_bands.csv#pb_dried_fish"),
  row("price_category.food.rye", "рожь", "gap:commodity.grain.rye", "ordinary_to_valuable", "derived_rule", "Цена за кадь отделена от цены одного хлеба; candidate ordinary остаётся ниже shortage 1228 и famine 1230.", "price_bands/price_bands.csv#pb_grain_rye; currencies_measures/price_anchors_c1230.csv#pa_rye_kad_1228_shortage,pa_rye_kad_1230_famine"),
  row("price_category.food.barley_oats", "ячмень или овёс", "gap:commodity.grain.barley_oats", "ordinary_to_valuable", "analogy", "Кадь кормового зерна следует масштабу зерновой меры; отдельного ordinary-якоря нет, кризисные пары ржи на неё численно не переносятся.", "price_bands/price_bands.csv#pb_grain_barley_oats"),
  row("price_category.food.bread", "хлеб", "gap:commodity.bread", "low", "derived_rule", "Low-полоса ограничена shortage-наблюдением 1228 г.; обычная цена и масса хлеба не установлены.", "price_bands/price_bands.csv#pb_bread_loaf; currencies_measures/price_anchors_c1230.csv#pa_bread_1228_shortage,pa_bread_1230_famine"),
];

const header = ["category_id", "name_ru", "catalog_refs", "pricing_unit", "value_band", "basis", "derivation", "source_refs", "confidence", "status"];

export function validate(input) {
  const ids = new Set();
  for (const entry of input) {
    assert(entry.category_id && !ids.has(entry.category_id), `duplicate or empty category_id: ${entry.category_id}`);
    ids.add(entry.category_id);
    assert(entry.catalog_refs, `${entry.category_id}: catalog_refs required`);
    assert(entry.pricing_unit, `${entry.category_id}: pricing_unit required`);
    assert(BAND_VOCAB.has(entry.value_band), `${entry.category_id}: invalid value_band ${entry.value_band}`);
    assert(BASIS_VOCAB.has(entry.basis), `${entry.category_id}: invalid basis ${entry.basis}`);
    assert(entry.derivation, `${entry.category_id}: derivation required`);
    assert(entry.source_refs, `${entry.category_id}: source_refs required`);
    if (entry.basis === "sourced") {
      assert(/evidence\/prices\/prices-v1\.csv#price-/.test(entry.source_refs), `${entry.category_id}: sourced row requires an explicit price observation ref`);
    }
    assert(["A", "B", "C"].includes(entry.confidence), `${entry.category_id}: invalid confidence`);
    assert.equal(entry.status, "candidate", `${entry.category_id}: status must remain candidate`);
  }
}

export function selfTest() {
  validate(rows);
  assert.equal(rows.length, 38);
  const compensation = readFileSync(compensationPath, "utf8");
  for (const id of ["cr_gorodnik_zakladka", "cr_gorodnik_okonchanie", "cr_gorodnik_korm_nedelya"]) {
    assert.match(compensation, new RegExp(`^${id},[^\\n]*,false,`, "m"), `${id}: must not be a market price`);
  }
  for (const id of ["cr_rye_kad_1215_famine", "cr_oats_kad_1215_famine", "cr_repa_voz_1215_famine"]) {
    assert.match(compensation, new RegExp(`^${id},[^\\n]*,1215,`, "m"), `${id}: period must be 1215`);
  }
  for (const id of ["cr_rye_kad_1170_blockade", "cr_bread_1170_blockade", "cr_honey_pood_1170_blockade"]) {
    assert.match(compensation, new RegExp(`^${id},[^\\n]*,1170,`, "m"), `${id}: period must be 1170`);
  }
  assert.throws(() => validate([{ ...rows[0], category_id: "bad_band", value_band: "priceless" }]), /invalid value_band/);
  assert.throws(() => validate([{ ...rows[0], category_id: "bad_basis", basis: "guess" }]), /invalid basis/);
  assert.throws(() => validate([{ ...rows[0], category_id: "bad_source", source_refs: "" }]), /source_refs required/);
  assert.throws(() => validate([{ ...rows[0], category_id: "bad_sourced_ref", source_refs: "price_bands/price_bands.csv#pb_horse" }]), /price observation ref/);
  assert.throws(() => validate([{ ...rows[0], category_id: "bad_sourced_fine", source_refs: "book:641351 §2797; price_bands/compensation_reference.csv#cr_korova" }]), /price observation ref/);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  selfTest();
  writeFileSync(outputPath, toCSV(header, rows), "utf8");
  const counts = Object.groupBy(rows, (entry) => entry.basis);
  console.log(`category_price_bands_c1230.csv: ${rows.length} rows; sourced=${counts.sourced?.length ?? 0}; derived_rule=${counts.derived_rule?.length ?? 0}; analogy=${counts.analogy?.length ?? 0}`);
  console.log("SELF-TEST PASS: invalid band/basis/source and sourced fine-only reference rejected");
}
