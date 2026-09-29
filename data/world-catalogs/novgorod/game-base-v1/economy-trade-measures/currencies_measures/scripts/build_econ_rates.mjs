import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toCSV } from "../../scripts/lib_csv.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const RATE_OUT = join(here, "..", "currency_rates_bue.csv");
const ANCHOR_OUT = join(here, "..", "price_anchors_c1230.csv");
const BASIS = new Set(["sourced", "derived_rule", "analogy"]);
const NOVGOROD = "region_novgorod_land";
const NO_G0 = "gap:g0_node_not_available";

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

function reduced(numerator, denominator) {
  const divisor = gcd(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
}

function decimalFraction(value) {
  const [whole, fraction = ""] = String(value).split(".");
  return reduced(BigInt(whole + fraction), 10n ** BigInt(fraction.length));
}

function roundHalfUp(numerator, denominator) {
  return (2n * numerator + denominator) / (2n * denominator);
}

function rate(rate_id, unit_id, region_id, region_scope, region_gap, period_from, period_to,
  numerator, denominator, basis, derivation, source_refs, confidence) {
  const established = numerator !== null;
  const fraction = established ? reduced(BigInt(numerator), BigInt(denominator)) : [null, null];
  return {
    rate_id, unit_id, region_id, region_scope, region_gap, period_from, period_to,
    bue_value: established ? String(roundHalfUp(...fraction)) : "not_established",
    bue_numerator: established ? String(fraction[0]) : "",
    bue_denominator: established ? String(fraction[1]) : "",
    basis, derivation, source_refs, confidence,
  };
}

export const rates = [
  rate("rate_nov_grivna_serebra_yanin", "cu_grivna_serebra", NOVGOROD, "Новгородская земля", "", 1180, 1260,
    204756, 1, "sourced", "204.756 g чистого серебра × 1000 mg/g; теоретическая норма Янина", "book:177850 §160", "B"),
  rate("rate_nov_grivna_serebra_practical_gap", "cu_grivna_serebra_ingot_practical", NOVGOROD, "Новгородская земля", "", 1200, 1260,
    null, null, "sourced", "not_established: масса слитка 196.2 g засвидетельствована отдельно, но чистота серебра не установлена; не подменяет теоретическую норму 204.756 g", "book:177850 §1415", "B"),
  rate("rate_nov_grivna_kun_pravda50", "cu_grivna_kun", NOVGOROD, "Новгородская земля", "", 1180, 1260,
    204756, 4, "derived_rule", "cu_grivna_serebra / 4", "book:177850 §160,162; book:356156 §586", "B"),
  rate("rate_nov_nogata_pravda20", "cu_nogata", NOVGOROD, "Новгородская земля", "", 1180, 1260,
    204756, 80, "derived_rule", "cu_grivna_serebra / (4 гривны кун × 20 ногат)", "book:177850 §160,162; book:356156 §586", "B"),
  rate("rate_nov_kuna_pravda50", "cu_kuna", NOVGOROD, "Новгородская земля", "", 1180, 1260,
    204756, 200, "derived_rule", "cu_grivna_serebra / (4 гривны кун × 50 кун)", "book:177850 §160,162; book:356156 §586", "B"),
  rate("rate_nov_kuna_nazarenko40_conflict", "cu_kuna", NOVGOROD, "Новгородская земля", "", 1201, 1300,
    204756, 300, "analogy", "конфликтная реконструкция: cu_grivna_serebra / (7.5 гривны кун × 40 кун-резан); хронология отношения не закреплена, для якорей не используется", "book:874865 §438,440; book:177850 §1415,160", "B"),
  rate("rate_nov_rezana_pravda", "cu_rezana", NOVGOROD, "Новгородская земля", "", 1180, 1260,
    204756, 200, "derived_rule", "для Пространной Правды резана = куне; курс через rate_nov_kuna_pravda50", "book:177850 §160,162; book:356156 §586", "B"),
  rate("rate_nov_rezana_nazarenko40_conflict", "cu_rezana", NOVGOROD, "Новгородская земля", "", 1201, 1300,
    204756, 300, "analogy", "конфликтная реконструкция куны-резаны: cu_grivna_serebra / (7.5 гривны кун × 40 кун-резан); хронология отношения не закреплена, для якорей не используется", "book:874865 §438,440; book:177850 §1415,160", "B"),
  rate("rate_nov_veksha_gap", "cu_veksha_bela", NOVGOROD, "Новгородская земля", "", 1180, 1260,
    null, null, "sourced", "not_established: отношение векши к гривне для домонгольского периода не установлено", "book:177850 §160; book:641351 §2736", "C"),
  rate("rate_gotland_silver_mark_1211", "cu_gotland_silver_mark", "", "Готланд", NO_G0, 1211, 1211,
    null, null, "sourced", "not_established: 1 готландская марка по весу = 4.5 рижским маркам в пфеннигах, но абсолютная масса чистого серебра не дана", "book:183312 §955", "B"),
  rate("rate_gotland_penning_1211", "cu_gotland_penning", "", "Готланд", NO_G0, 1211, 1211,
    null, null, "sourced", "not_established: готландский и рижский пфенниги равноценны, но серебряное содержание не дано", "book:183312 §955", "B"),
  rate("rate_scandinavian_ertug_medieval", "cu_scandinavian_ertug", "", "Скандинавия", NO_G0, "not_established", "not_established",
    null, null, "sourced", "not_established: 1 марка = 24 эртуга, но дата и абсолютная масса чистого серебра не даны", "book:874865 §368", "B"),
  rate("rate_lubeck_mark_medieval", "cu_lubeck_mark", "", "Любек", NO_G0, "not_established", "not_established",
    null, null, "sourced", "not_established: марка засвидетельствована как счётная единица, но нет замкнутого веса чистого серебра", "book:855852 §474,475", "B"),
  rate("rate_lubeck_shilling_medieval", "cu_lubeck_shilling", "", "Любек", NO_G0, "not_established", "not_established",
    null, null, "sourced", "not_established: 1 марка = 16 шиллингов; серебряный шиллинг как монета начинается лишь в XIV в.; чистое серебро не установлено", "book:855852 §475", "B"),
  rate("rate_lubeck_pfennig_medieval", "cu_lubeck_pfennig", "", "Любек", NO_G0, "not_established", "not_established",
    null, null, "sourced", "not_established: первоначально 12 пфеннигов = 1 шиллинг, но абсолютное серебряное содержание не дано", "book:855852 §475", "B"),
  rate("rate_riga_mark_1211", "cu_riga_mark", "", "Рига / Ливония", NO_G0, 1211, 1250,
    null, null, "sourced", "not_established: весовая марка содержит 288 пфеннигов, но абсолютная масса чистого серебра не дана", "book:183312 §955,956", "B"),
  rate("rate_riga_pfennig_1211", "cu_riga_pfennig", "", "Рига / Ливония", NO_G0, 1211, 1250,
    null, null, "sourced", "not_established: отношение 1211 г. даёт 288 пфеннигов на марку и равенство готландскому пфеннигу; брактеаты предполагаемой собственной чеканки около 1226 г. весят 0.14-0.18 g, но проба не дана, поэтому fine-silver курс не замкнут", "book:183312 §955,956", "B"),
  rate("rate_smolensk_kuna_1229", "cu_smolensk_kuna", "", "Смоленск", NO_G0, 1229, 1229,
    204756, 25, "analogy", "1/25 гривны серебра по реконструкции договора 1229 г.; BUE использует новгородскую теоретическую норму 204.756 g как явно маркированную аналогию", "book:874865 §439; book:177850 §160", "B"),
  rate("rate_smolensk_nogata_1229", "cu_smolensk_nogata", "", "Смоленск", NO_G0, 1229, 1229,
    204756, 20, "analogy", "1/20 гривны серебра по реконструкции договора 1229 г.; BUE использует новгородскую теоретическую норму 204.756 g как явно маркированную аналогию", "book:874865 §439; book:177850 §160", "B"),
  rate("rate_smolensk_veksha_1229", "cu_smolensk_veksha", "", "Смоленск", NO_G0, 1229, 1229,
    614268, 800, "analogy", "приблизительно 3/800 гривны серебра по реконструкции договора 1229 г.; BUE использует новгородскую теоретическую норму 204.756 g как явно маркированную аналогию", "book:874865 §439; book:177850 §160", "B"),
];

const rateById = new Map(rates.map((row) => [row.rate_id, row]));

function anchor(input) {
  assert(input.market, `${input.anchor_id}: market must be explicit in authoring`);
  const row = { basis: "sourced", observation_status: "ok", ...input };
  if (!row.bue_rate_id) {
    return { ...row, bue_amount: "not_established", bue_numerator: "", bue_denominator: "" };
  }
  const selectedRate = rateById.get(row.bue_rate_id);
  assert(selectedRate && selectedRate.bue_value !== "not_established", `unknown BUE rate ${row.bue_rate_id}`);
  const [amountNumerator, amountDenominator] = decimalFraction(row.amount);
  const [numerator, denominator] = reduced(
    amountNumerator * BigInt(selectedRate.bue_numerator),
    amountDenominator * BigInt(selectedRate.bue_denominator),
  );
  return {
    ...row,
    bue_amount: String(roundHalfUp(numerator, denominator)),
    bue_numerator: String(numerator),
    bue_denominator: String(denominator),
  };
}

const NOV_COMMON = { region_id: NOVGOROD, region_scope: "Новгородская земля", region_gap: "", market: "yes" };
const GRIVNA = { currency_unit: "гривна", currency_unit_id: "cu_grivna_kun", bue_rate_id: "rate_nov_grivna_kun_pravda50" };
const KUNA = { currency_unit: "куна", currency_unit_id: "cu_kuna", bue_rate_id: "rate_nov_kuna_pravda50" };

export const anchors = [
  anchor({ anchor_id: "pa_cow_novgorod_c1200", source_price_ids: "price-b660246781c9", commodity: "корова", quantity: 1, measure: "голова", amount: 3, ...GRIVNA, ...NOV_COMMON, period_from: 1176, period_to: 1225, kind: "market", source_kinds: "market", bue_derivation: "derived_rule: 3 гривны кун × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "evidence/prices/prices-v1.csv#price-b660246781c9; book:880394 §62", confidence: "C" }),
  anchor({ anchor_id: "pa_horse_novgorod_c1200", source_price_ids: "price-38f1a5e0a398", commodity: "конь", quantity: 1, measure: "голова", amount: 4, ...GRIVNA, ...NOV_COMMON, period_from: 1180, period_to: 1200, kind: "market", source_kinds: "market", bue_derivation: "derived_rule: 4 гривны кун × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "evidence/prices/prices-v1.csv#price-38f1a5e0a398; https://gramoty.ru/birchbark/document/show/novgorod/926/", confidence: "A" }),
  anchor({ anchor_id: "pa_oats_kad_1215_famine", source_price_ids: "price-1b53a4da68f9;price-aa2460250a9a", commodity: "овёс", quantity: 1, measure: "кадь", amount: 3, ...GRIVNA, ...NOV_COMMON, period_from: 1215, period_to: 1215, kind: "crisis", source_kinds: "crisis;market", bue_derivation: "derived_rule: amount × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "book:556930 §80; book:185868 §951", confidence: "B" }),
  anchor({ anchor_id: "pa_turnip_cart_1215_famine", source_price_ids: "price-e94b19bc5dd0", commodity: "репа", quantity: 1, measure: "воз", amount: 2, ...GRIVNA, ...NOV_COMMON, period_from: 1215, period_to: 1215, kind: "crisis", source_kinds: "crisis", bue_derivation: "derived_rule: amount × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "book:556930 §80", confidence: "B" }),
  anchor({ anchor_id: "pa_rye_kad_1215_famine", source_price_ids: "price-47fcf5044e2f;price-a8f829c1b768", commodity: "рожь", quantity: 1, measure: "кадь", amount: 10, ...GRIVNA, ...NOV_COMMON, period_from: 1215, period_to: 1215, kind: "crisis", source_kinds: "crisis;market", bue_derivation: "derived_rule: amount × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "book:393995 §1545; book:556930 §80; book:185868 §951", confidence: "B" }),
  anchor({ anchor_id: "pa_rye_kad_1228_shortage", source_price_ids: "price-ac0d5ceec0db", commodity: "рожь", quantity: 1, measure: "кадь", amount: 3, ...GRIVNA, ...NOV_COMMON, period_from: 1228, period_to: 1228, kind: "crisis", source_kinds: "crisis", bue_derivation: "derived_rule: amount × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "book:393995 §1545", confidence: "B" }),
  anchor({ anchor_id: "pa_bread_1228_shortage", source_price_ids: "price-0b11888113e8", commodity: "хлеб на новгородском торгу", quantity: 1, measure: "хлеб (единица не уточнена)", amount: 2, ...KUNA, ...NOV_COMMON, period_from: 1228, period_to: 1228, kind: "crisis", source_kinds: "crisis", bue_derivation: "derived_rule: amount × exact rate_nov_kuna_pravda50; one final half-up rounding", source_refs: "book:556930 §156; http://historic.ru/books/item/f00/s00/z0000083/st015.shtml", confidence: "B" }),
  anchor({ anchor_id: "pa_oats_kad_1230_famine", source_price_ids: "price-0a129a7a7376", commodity: "овёс", quantity: 1, measure: "кадь", amount: 13, ...GRIVNA, ...NOV_COMMON, period_from: 1230, period_to: 1230, kind: "crisis", source_kinds: "crisis", bue_derivation: "derived_rule: amount × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "05:historical_price:n1230:historical_price:npl_1230_oats_13_grivna; book:556930 §178", confidence: "A" }),
  anchor({ anchor_id: "pa_wheat_kad_1230_famine", source_price_ids: "price-20952357ddae", commodity: "пшеница", quantity: 1, measure: "кадь", amount: 40, ...GRIVNA, ...NOV_COMMON, period_from: 1230, period_to: 1230, kind: "crisis", source_kinds: "crisis", bue_derivation: "derived_rule: amount × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "05:historical_price:n1230:historical_price:npl_1230_wheat_40_grivna; book:260041 §504; book:556930 §178", confidence: "A" }),
  anchor({ anchor_id: "pa_millet_kad_1230_famine", source_price_ids: "price-ba56224d9080", commodity: "пшено", quantity: 1, measure: "кадь", amount: 50, ...GRIVNA, ...NOV_COMMON, period_from: 1230, period_to: 1230, kind: "crisis", source_kinds: "crisis", bue_derivation: "derived_rule: amount × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "05:historical_price:n1230:historical_price:npl_1230_millet_50_grivna; book:556930 §178", confidence: "A" }),
  anchor({ anchor_id: "pa_rye_quarter_kad_1230_famine", source_price_ids: "price-aafba84da39e", commodity: "рожь", quantity: 1, measure: "четверть кади", amount: 1, currency_unit: "гривна серебра", currency_unit_id: "cu_grivna_serebra", bue_rate_id: "rate_nov_grivna_serebra_yanin", ...NOV_COMMON, period_from: 1230, period_to: 1231, kind: "crisis", source_kinds: "market", bue_derivation: "derived_rule: amount × exact rate_nov_grivna_serebra_yanin; famine context normalized from source quote", source_refs: "book:301539 §838", confidence: "B" }),
  anchor({ anchor_id: "pa_rye_kad_1230_famine", source_price_ids: "price-bcd7453a09e1", commodity: "рожь", quantity: 1, measure: "кадь", amount: 20, ...GRIVNA, ...NOV_COMMON, period_from: 1230, period_to: 1230, kind: "crisis", source_kinds: "crisis", bue_derivation: "derived_rule: amount × exact rate_nov_grivna_kun_pravda50; one final half-up rounding", source_refs: "05:historical_price:n1230:historical_price:npl_1230_rye_kad_20_grivna; book:260041 §504; book:556930 §178", confidence: "A" }),
  anchor({ anchor_id: "pa_bread_1230_famine", source_price_ids: "price-0c2a328130e2", commodity: "хлеб", quantity: 1, measure: "хлеб (единица не уточнена)", amount: 8, ...KUNA, ...NOV_COMMON, period_from: 1230, period_to: 1230, kind: "crisis", source_kinds: "crisis", bue_derivation: "derived_rule: amount × exact rate_nov_kuna_pravda50; one final half-up rounding", source_refs: "05:historical_price:n1230:historical_price:npl_1230_bread_8_kuna; book:260041 §504; book:556930 §178", confidence: "A" }),
  anchor({ anchor_id: "pa_salt_berkovets_novgorod_1200_1220_review", source_price_ids: "price-21e4d5b8d9b3", commodity: "соль (условное чтение грамоты №219)", quantity: 1, measure: "берковец", amount: 1.1, ...GRIVNA, ...NOV_COMMON, period_from: 1200, period_to: 1220, kind: "market", source_kinds: "market", observation_status: "needs_review", basis: "analogy", bue_derivation: "analogy: условно (2 гривны + 10 кун) / 2 берковца = 1.1 гривны кун за берковец; exact rate and one final half-up rounding; неоднозначность источника не снята", source_refs: "evidence/prices/prices-v1.csv#price-21e4d5b8d9b3; https://gramoty.ru/birchbark/document/show/novgorod/219/", confidence: "C" }),
  anchor({ anchor_id: "pa_salt_berkovets_pskov_1232_1233_crisis", source_price_ids: "price-13497e372cbf;price-d0081f2e903e", commodity: "соль", quantity: 1, measure: "берковец", amount: 7, currency_unit: "гривна", currency_unit_id: "cu_pskov_grivna", bue_rate_id: "", region_id: "", region_scope: "Псков", region_gap: NO_G0, period_from: 1232, period_to: 1233, kind: "crisis", source_kinds: "crisis;market", market: "yes", bue_derivation: "not_established: единый эпизод блокады Пскова; источник не уточняет вид гривны, курс G0 не переносится", source_refs: "evidence/prices/prices-v1.csv#price-13497e372cbf,price-d0081f2e903e; book:572528 §472; book:556930 §192", confidence: "B" }),
];

const rateHeader = ["rate_id", "unit_id", "region_id", "region_scope", "region_gap", "period_from", "period_to", "bue_value", "bue_numerator", "bue_denominator", "basis", "derivation", "source_refs", "confidence"];
const anchorHeader = ["anchor_id", "source_price_ids", "commodity", "quantity", "measure", "amount", "currency_unit", "currency_unit_id", "region_id", "region_scope", "region_gap", "period_from", "period_to", "kind", "source_kinds", "market", "observation_status", "bue_amount", "bue_numerator", "bue_denominator", "bue_rate_id", "bue_derivation", "basis", "source_refs", "confidence"];

export function validateRates(rows) {
  const ids = new Set();
  for (const row of rows) {
    assert(row.rate_id && !ids.has(row.rate_id), `duplicate or empty rate_id: ${row.rate_id}`);
    ids.add(row.rate_id);
    assert(row.unit_id, `${row.rate_id}: unit_id required`);
    assert(row.source_refs, `${row.rate_id}: source_refs required`);
    assert(BASIS.has(row.basis), `${row.rate_id}: invalid basis ${row.basis}`);
    const numericPeriod = /^\d+$/.test(String(row.period_from)) && /^\d+$/.test(String(row.period_to));
    const gapPeriod = row.period_from === "not_established" && row.period_to === "not_established";
    assert(numericPeriod || gapPeriod, `${row.rate_id}: invalid period`);
    if (numericPeriod) assert(Number(row.period_from) <= Number(row.period_to), `${row.rate_id}: reversed period`);
    if (row.bue_value === "not_established") {
      assert(!row.bue_numerator && !row.bue_denominator, `${row.rate_id}: gap cannot carry a numeric fraction`);
    } else {
      assert(/^\d+$/.test(row.bue_value), `${row.rate_id}: BUE must be an integer`);
      assert(/^\d+$/.test(row.bue_numerator) && /^\d+$/.test(row.bue_denominator), `${row.rate_id}: exact BUE fraction required`);
      assert.equal(String(roundHalfUp(BigInt(row.bue_numerator), BigInt(row.bue_denominator))), row.bue_value, `${row.rate_id}: rounded BUE mismatch`);
    }
  }
}

export function validateAnchors(rows) {
  const ids = new Set();
  for (const row of rows) {
    assert(row.anchor_id && !ids.has(row.anchor_id), `duplicate or empty anchor_id: ${row.anchor_id}`);
    ids.add(row.anchor_id);
    assert(/^\d+$/.test(String(row.period_from)) && /^\d+$/.test(String(row.period_to)), `${row.anchor_id}: anchor date required`);
    assert(Number(row.period_from) <= Number(row.period_to), `${row.anchor_id}: reversed period`);
    assert(row.source_refs, `${row.anchor_id}: source_refs required`);
    assert(row.market === "yes", `${row.anchor_id}: only market=yes evidence is allowed`);
    assert(["ok", "needs_review"].includes(row.observation_status), `${row.anchor_id}: invalid observation_status`);
    if (row.bue_amount === "not_established") {
      assert(!row.bue_numerator && !row.bue_denominator && !row.bue_rate_id, `${row.anchor_id}: unresolved BUE must not select a rate`);
    } else {
      assert(/^\d+$/.test(row.bue_amount), `${row.anchor_id}: BUE amount must be an integer`);
      assert(row.bue_rate_id, `${row.anchor_id}: BUE rate required`);
      assert.equal(String(roundHalfUp(BigInt(row.bue_numerator), BigInt(row.bue_denominator))), row.bue_amount, `${row.anchor_id}: rounded BUE mismatch`);
    }
  }
}

export function selfTest() {
  validateRates(rates);
  validateAnchors(anchors);
  assert.throws(() => validateRates([{ ...rates[0], rate_id: "bad_no_source", source_refs: "" }]), /source_refs required/);
  assert.throws(() => validateRates([{ ...rates[0], rate_id: "bad_fractional_bue", bue_value: "1.5" }]), /BUE must be an integer/);
  assert.throws(() => validateAnchors([{ ...anchors[0], anchor_id: "bad_no_date", period_from: "" }]), /anchor date required/);
  assert.throws(() => validateAnchors([{ ...anchors[0], anchor_id: "bad_non_market", market: "no" }]), /only market=yes evidence is allowed/);
  assert.throws(() => anchor({ ...anchors[0], anchor_id: "bad_implicit_market", market: "" }), /market must be explicit/);
}

function writeOutputs() {
  writeFileSync(RATE_OUT, toCSV(rateHeader, rates), "utf8");
  writeFileSync(ANCHOR_OUT, toCSV(anchorHeader, anchors), "utf8");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  selfTest();
  writeOutputs();
  const basis = Object.groupBy(rates, (row) => row.basis);
  console.log(`currency_rates_bue.csv: ${rates.length} rows; sourced=${basis.sourced?.length ?? 0}; derived_rule=${basis.derived_rule?.length ?? 0}; analogy=${basis.analogy?.length ?? 0}; not_established=${rates.filter((row) => row.bue_value === "not_established").length}`);
  console.log(`price_anchors_c1230.csv: ${anchors.length} rows; BUE=${anchors.filter((row) => row.bue_amount !== "not_established").length}; not_established=${anchors.filter((row) => row.bue_amount === "not_established").length}`);
  console.log("SELF-TEST PASS: missing source, fractional BUE, missing anchor date, and market=no rejected");
}
