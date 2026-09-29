import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const groupDir = resolve(scriptDir, "../..");
const paths = {
  bands: resolve(groupDir, "price_bands/price_bands.csv"),
  categoryBands: resolve(groupDir, "price_bands/category_price_bands_c1230.csv"),
  compensations: resolve(groupDir, "price_bands/compensation_reference.csv"),
  anchors: resolve(scriptDir, "../price_anchors_c1230.csv"),
  regressions: resolve(scriptDir, "../master_archive_price_regressions.csv"),
  report: resolve(scriptDir, "../C2_REPORT.md"),
};

const bandOrder = ["low", "low_to_ordinary", "ordinary", "ordinary_to_valuable", "valuable", "high_value"];

function gcd(left, right) {
  left = left < 0n ? -left : left;
  right = right < 0n ? -right : right;
  while (right) [left, right] = [right, left % right];
  return left;
}

function fraction(numerator, denominator = 1n) {
  assert(denominator > 0n);
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

const candidates = Array.from({ length: 25 }, (_, index) => {
  const quarters = 8 + index;
  return { index, label: quarters % 4 === 0 ? String(quarters / 4) : (quarters / 4).toFixed(2).replace(/0$/, ""), k: fraction(BigInt(quarters), 4n) };
});

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const [header, ...body] = rows.filter((entry) => entry.some(Boolean));
  return body.map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function decimalFraction(value) {
  const [whole, digits = ""] = String(value).split(".");
  return fraction(BigInt(`${whole}${digits}`), 10n ** BigInt(digits.length));
}

function add(left, right) {
  return fraction(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
}

function multiply(left, right) {
  return fraction(left.numerator * right.numerator, left.denominator * right.denominator);
}

function divide(left, right) {
  assert.notEqual(right.numerator, 0n);
  return fraction(left.numerator * right.denominator, left.denominator * right.numerator);
}

function power(base, exponent) {
  return exponent >= 0
    ? fraction(base.numerator ** BigInt(exponent), base.denominator ** BigInt(exponent))
    : fraction(base.denominator ** BigInt(-exponent), base.numerator ** BigInt(-exponent));
}

function compare(left, right) {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function minFraction(...values) {
  return values.reduce((best, value) => compare(value, best) < 0 ? value : best);
}

function maxFraction(...values) {
  return values.reduce((best, value) => compare(value, best) > 0 ? value : best);
}

function midpoint(low, high) {
  return divide(add(low, high), fraction(2n));
}

function roundHalfUp(value) {
  assert(value.numerator >= 0n && value.denominator > 0n);
  return (2n * value.numerator + value.denominator) / (2n * value.denominator);
}

function fixed(value, digits = 2) {
  return (Number(value.numerator) / Number(value.denominator)).toFixed(digits);
}

function withinOneStep(observed, predicted, k) {
  const high = compare(observed, predicted) >= 0 ? observed : predicted;
  const low = compare(observed, predicted) >= 0 ? predicted : observed;
  return compare(high, multiply(low, k)) <= 0;
}

function formatRanges(entries) {
  if (!entries.length) return "нет";
  const groups = [];
  let start = entries[0], end = entries[0];
  for (const entry of entries.slice(1)) {
    if (entry.index === end.index + 1) end = entry;
    else { groups.push([start, end]); start = entry; end = entry; }
  }
  groups.push([start, end]);
  return groups.map(([left, right]) => left === right ? left.label : `${left.label}–${right.label}`).join(", ");
}

const bands = parseCSV(readFileSync(paths.bands, "utf8"));
const categoryBands = parseCSV(readFileSync(paths.categoryBands, "utf8"));
const compensations = parseCSV(readFileSync(paths.compensations, "utf8"));
const anchors = parseCSV(readFileSync(paths.anchors, "utf8"));
const regressionRows = parseCSV(readFileSync(paths.regressions, "utf8"));
const byCategory = new Map(categoryBands.map((entry) => [entry.category_id, entry]));
const byAnchor = new Map(anchors.map((entry) => [entry.anchor_id, entry]));
const byCompensation = new Map(compensations.map((entry) => [entry.cr_id, entry]));

assert.equal(categoryBands.length, 38);
assert.equal(candidates.length, 25);
for (const entry of [...bands, ...categoryBands]) assert(bandOrder.includes(entry.value_band), `unknown band ${entry.value_band}`);

function categoryStep(categoryId) {
  const entry = byCategory.get(categoryId);
  assert(entry, `missing category ${categoryId}`);
  return bandOrder.indexOf(entry.value_band);
}

function anchorFraction(anchorId) {
  const entry = byAnchor.get(anchorId);
  assert(entry && entry.bue_amount !== "not_established", `missing numeric anchor ${anchorId}`);
  return fraction(BigInt(entry.bue_numerator), BigInt(entry.bue_denominator));
}

const sourceObservations = [
  { id: "knife_438", label: "нож №438", categoryId: "price_category.household.knife", unit: "item", observed: fraction(51189n, 100n), caveat: "50 ножей за 1/2 гривны; оптовая нормализация" },
  { id: "cow_market", label: "корова", categoryId: "price_category.livestock.cow", unit: "head", observed: anchorFraction("pa_cow_novgorod_c1200"), caveat: "прямой market anchor" },
  { id: "horse_market", label: "конь", categoryId: "price_category.livestock.horse", unit: "head", observed: anchorFraction("pa_horse_novgorod_c1200"), caveat: "прямой market anchor" },
  { id: "povoy_proxy", label: "повой", categoryId: "price_category.clothing.cap", unit: "item-like, source unit unknown", observed: fraction(153567n, 50n), caveat: "условный proxy простой шапки; исходная единица не названа" },
  { id: "veretishche_lower_bound", label: "веретище", categoryId: "price_category.textile.linen", unit: "cloth measure unknown", observed: fraction(153567n, 20n), caveat: "нижняя аналогия, не тождество с произвольной льняной тканью" },
].map((entry) => ({ ...entry, step: categoryStep(entry.categoryId) }));

const breadShortage = anchorFraction("pa_bread_1228_shortage");
const breadFamine = anchorFraction("pa_bread_1230_famine");
const ryeShortage = anchorFraction("pa_rye_kad_1228_shortage");
const ryeFamine = anchorFraction("pa_rye_kad_1230_famine");
const cowObserved = anchorFraction("pa_cow_novgorod_c1200");
const horseObserved = anchorFraction("pa_horse_novgorod_c1200");
const honeyCrisis = multiply(decimalFraction(byCompensation.get("cr_honey_pood_1170_blockade").currency_kuna_equivalent), fraction(51189n, 50n));
const breadStep = categoryStep("price_category.food.bread");
const ryeStep = categoryStep("price_category.food.rye");
const honeyStep = categoryStep("price_category.food.honey");

assert.equal(breadStep, 0);
assert.equal(ryeStep, 3);
assert.equal(honeyStep, 2);
assert(compare(breadShortage, breadFamine) < 0);
assert(compare(ryeShortage, ryeFamine) < 0);

const sameYearPairs = [
  { year: 1170, observedRatio: fraction(200n, 5n), source: "cr_rye_kad_1170_blockade / cr_bread_1170_blockade" },
  { year: 1228, observedRatio: fraction(150n, 2n), source: "pa_rye_kad_1228_shortage / pa_bread_1228_shortage" },
  { year: 1230, observedRatio: fraction(1000n, 8n), source: "pa_rye_kad_1230_famine / pa_bread_1230_famine" },
];

function sourceBounds(k) {
  const lows = sourceObservations.map((observation) => divide(observation.observed, power(k, observation.step + 1)));
  const highs = sourceObservations.map((observation) => divide(observation.observed, power(k, observation.step - 1)));
  return { low: maxFraction(...lows), high: minFraction(...highs) };
}

function crisisUpper(k) {
  return minFraction(
    divide(breadShortage, power(k, breadStep)),
    divide(ryeShortage, power(k, ryeStep)),
    divide(honeyCrisis, power(k, honeyStep)),
  );
}

function methodBounds(method, k) {
  if (method === "cow_base") {
    const base = divide(cowObserved, power(k, categoryStep("price_category.livestock.cow")));
    return { low: base, high: base, feasible: true };
  }
  const source = sourceBounds(k);
  const high = minFraction(source.high, crisisUpper(k));
  return { low: source.low, high, feasible: compare(source.low, high) < 0 };
}

function curvePrice(base, k, categoryId) {
  return multiply(base, power(k, categoryStep(categoryId)));
}

const regressionByRelation = Map.groupBy(regressionRows, (entry) => entry.relation_id);
const regressionProbes = [
  { id: "master_archive_bucket_over_cow", rows: regressionByRelation.get("bucket_over_cow"), detect: ([bucket, cow]) => Number(bucket.min_bue) > Number(cow.max_bue) },
  { id: "master_archive_patch_equals_chainmail", rows: regressionByRelation.get("patch_equals_chainmail"), detect: ([patch, chainmail]) => patch.min_bue === chainmail.min_bue && patch.max_bue === chainmail.max_bue },
].map((probe) => ({ ...probe, detected: probe.detect(probe.rows) }));
assert(regressionRows.every((entry) => entry.price_basis === "relative_cost_model" && entry.numeric_confidence === "model_only"));
assert(regressionProbes.every((probe) => probe.detected));

const livestockFineMap = [
  ["price_category.livestock.horse", "cr_prochiy_kon"],
  ["price_category.livestock.cow", "cr_korova"],
  ["price_category.livestock.ox", "cr_vol"],
  ["price_category.livestock.sheep", "cr_ovtsa"],
  ["price_category.livestock.pig", "cr_svinya"],
  ["price_category.livestock.poultry", "cr_golub_kuropatka"],
];

function kunaToBue(value) {
  return multiply(decimalFraction(value), fraction(51189n, 50n));
}

const methods = [
  { id: "cow_base", label: "база от коровы" },
  { id: "all_sourced_fit", label: "интервал по 5 наблюдениям" },
];

const results = methods.flatMap((method) => candidates.map((candidate) => {
  const bounds = methodBounds(method.id, candidate.k);
  const source = sourceBounds(candidate.k);
  const base = bounds.feasible ? midpoint(bounds.low, bounds.high) : midpoint(source.low, source.high);
  const sourceChecks = sourceObservations.map((observation) => ({
    id: observation.id,
    pass: withinOneStep(observation.observed, curvePrice(base, candidate.k, observation.categoryId), candidate.k),
  }));
  const ratioChecks = sameYearPairs.map((pair) => ({ year: pair.year, pass: withinOneStep(pair.observedRatio, power(candidate.k, ryeStep - breadStep), candidate.k) }));
  const crisisChecks = [
    { id: "bread_ordinary_lt_shortage_lt_famine", pass: compare(curvePrice(base, candidate.k, "price_category.food.bread"), breadShortage) < 0 && compare(breadShortage, breadFamine) < 0 },
    { id: "rye_ordinary_lt_shortage_lt_famine", pass: compare(curvePrice(base, candidate.k, "price_category.food.rye"), ryeShortage) < 0 && compare(ryeShortage, ryeFamine) < 0 },
    { id: "honey_ordinary_not_above_1170_crisis", pass: compare(curvePrice(base, candidate.k, "price_category.food.honey"), honeyCrisis) <= 0 },
    ...ratioChecks.map((entry) => ({ id: `kad_to_bread_${entry.year}_within_one_step`, pass: entry.pass })),
  ];
  const orderChecks = [
    { id: "chainmail_gt_patch", pass: compare(curvePrice(base, candidate.k, "price_category.military.chainmail"), curvePrice(base, candidate.k, "price_category.military.chainmail_patch")) > 0 },
    { id: "cow_gt_bucket", pass: compare(cowObserved, curvePrice(base, candidate.k, "price_category.household.bucket")) > 0 },
    { id: "horse_gt_cow", pass: compare(horseObserved, cowObserved) > 0 },
  ];
  const fineRatios = livestockFineMap.map(([categoryId, fineId]) => {
    const price = categoryId === "price_category.livestock.horse" ? horseObserved
      : categoryId === "price_category.livestock.cow" ? cowObserved
        : curvePrice(base, candidate.k, categoryId);
    const fine = kunaToBue(byCompensation.get(fineId).currency_kuna_equivalent);
    return Number(price.numerator * fine.denominator) / Number(price.denominator * fine.numerator);
  });
  const allCategoriesNumeric = categoryBands.every((entry) => roundHalfUp(curvePrice(base, candidate.k, entry.category_id)) > 0n);
  const compatible = bounds.feasible && sourceChecks.every((entry) => entry.pass) && crisisChecks.every((entry) => entry.pass) && orderChecks.every((entry) => entry.pass) && allCategoriesNumeric;
  return { method, candidate, bounds, base, sourceChecks, crisisChecks, orderChecks, minN: Math.max(...fineRatios), compatible };
}));

assert(results.every((result) => result.orderChecks.every((entry) => entry.pass)));
assert.equal(results.length, 50);
assert.equal(new Set(results.map((entry) => entry.method.id)).size, 2);

const famineScope = bands.filter((entry) => /multiplier x/.test(entry.famine_modifier));
assert.deepEqual(famineScope.map((entry) => entry.pb_id).sort(), ["pb_bread_loaf", "pb_grain_barley_oats", "pb_grain_rye"]);
assert.match(bands.find((entry) => entry.pb_id === "pb_bread_loaf").famine_modifier, /multiplier x4/);
assert.match(bands.find((entry) => entry.pb_id === "pb_grain_rye").famine_modifier, /multiplier x6\.7/);

const expectedCategories = [
  "horse", "cow", "ox", "sheep", "pig", "goat", "poultry", "bucket", "pot", "axe", "knife", "spindle", "chest", "lock",
  "chainmail", "chainmail_patch", "sword", "battle_axe", "shield", "helmet", "shirt", "svita", "boots", "cap", "linen", "wool",
  "squirrel", "squirrel_bundle", "marten", "sable", "salt", "honey", "wax", "fresh_fish", "dried_fish", "rye", "barley_oats", "bread",
];
assert.deepEqual(categoryBands.map((entry) => entry.category_id.split(".").at(-1)), expectedCategories);

function resultsFor(methodId) {
  return results.filter((entry) => entry.method.id === methodId);
}

const intervalRows = methods.map((method) => {
  const compatible = resultsFor(method.id).filter((entry) => entry.compatible).map((entry) => entry.candidate);
  return `| ${method.label} | ${formatRanges(compatible)} | ${compatible.length} |`;
});

const gridRows = results.map((result) => {
  const baseRange = result.bounds.feasible ? `${fixed(result.bounds.low)}…${fixed(result.bounds.high)}` : "нет";
  return `| ${result.method.id} | ${result.candidate.label} | ${baseRange} | ${result.sourceChecks.filter((entry) => !entry.pass).length} | ${result.crisisChecks.filter((entry) => !entry.pass).length} | ${result.orderChecks.filter((entry) => !entry.pass).length} | ${result.minN.toFixed(2)} | ${result.compatible ? "PASS" : "FAIL"} |`;
});

const sourceRows = sourceObservations.map((observation) => {
  const methodRanges = methods.map((method) => formatRanges(resultsFor(method.id).filter((result) => result.sourceChecks.find((entry) => entry.id === observation.id).pass).map((result) => result.candidate)));
  return `| ${observation.label} | ${observation.unit} | ${fixed(observation.observed)} | ${byCategory.get(observation.categoryId).value_band} | ${methodRanges[0]} | ${methodRanges[1]} | ${observation.caveat} |`;
});

const crisisRows = anchors.filter((entry) => entry.kind === "crisis").map((entry) => {
  let band = "—", check = "контекст; отдельной сопоставимой ordinary-полосы/единицы нет";
  if (entry.anchor_id.includes("bread_1228") || entry.anchor_id.includes("bread_1230")) {
    band = byCategory.get("price_category.food.bread").value_band;
    check = "ordinary < shortage < famine; кадь/хлеб того же года";
  } else if (entry.anchor_id === "pa_rye_quarter_kad_1230_famine") {
    band = byCategory.get("price_category.food.rye").value_band;
    check = "NOT_COMPARABLE: четверть кади не смешивается с кадью";
  } else if (entry.anchor_id.startsWith("pa_rye_kad_")) {
    band = byCategory.get("price_category.food.rye").value_band;
    check = entry.anchor_id.includes("1215") ? "candidate-полоса показана; отдельный кризисный контекст не входит в fit" : "ordinary < shortage < famine; кадь/хлеб того же года";
  } else if (entry.anchor_id.startsWith("pa_oats_kad_")) {
    band = byCategory.get("price_category.food.barley_oats").value_band;
    check = "candidate-полоса показана; crisis-наблюдение не входит в fit";
  } else if (entry.anchor_id === "pa_salt_berkovets_pskov_1232_1233_crisis") {
    band = byCategory.get("price_category.food.salt").value_band;
    check = "NOT_COMPARABLE: Псков, вид гривны и БУЕ не установлены";
  }
  return `| ${entry.anchor_id} | ${entry.period_from}–${entry.period_to} | ${entry.measure} | ${entry.bue_amount} | ${band} | ${check} |`;
});
crisisRows.push(`| cr_honey_pood_1170_blockade | 1170 | пуд | ${roundHalfUp(honeyCrisis)} | ${byCategory.get("price_category.food.honey").value_band} | ordinary candidate ≤ crisis ceiling; не ordinary-якорь |`);

const pairRows = sameYearPairs.map((pair) => {
  const ranges = methods.map((method) => formatRanges(resultsFor(method.id).filter((result) => result.crisisChecks.find((entry) => entry.id === `kad_to_bread_${pair.year}_within_one_step`).pass).map((result) => result.candidate)));
  return `| ${pair.year} | ${fixed(pair.observedRatio)} | k^${ryeStep - breadStep} | ${ranges[0]} | ${ranges[1]} | ${pair.source} |`;
});

const categoryRows = categoryBands.map((entry) => `| ${entry.category_id} | ${entry.pricing_unit} | ${entry.value_band} | ${entry.basis} | ${entry.derivation} |`);
const regressionReport = regressionProbes.map((probe) => {
  const [left, right] = probe.rows;
  return `- \`${probe.id}\`: ${left.item_name_ru} ${left.min_bue}-${left.max_bue} против ${right.item_name_ru} ${right.min_bue}-${right.max_bue} — нарушение поймано; обе строки \`model_only\`, не исторические цены.`;
});

const report = `# Стенд C2: интервальная шкала цен в БУЕ

Статус: детерминированная candidate-симуляция. \`k\`, N и база не выбраны и не утверждены. Проверена сетка \`k=2…8\` с шагом 0,25.

## Метод

- Формула D44: \`цена = база × k^ступень\`; ступени 0…5: ${bandOrder.map((band, index) => `${index}=\`${band}\``).join(", ")}.
- Метод \`cow_base\`: точечная база \`цена коровы / k^4\`.
- Метод \`all_sourced_fit\`: для каждого наблюдения \`y\` на ступени \`s\` допустима база \`[y/k^(s+1), y/k^(s-1)]\`; берётся пересечение пяти интервалов и кризисных потолков. Для расчётной строки используется середина допустимого интервала, но решение о базе не принимается.
- Нож — оптовая нормализация; повой — proxy шапки; веретище — нижняя аналогия с неизвестной мерой. Они показаны отдельно и не выдаются за точные цены произвольной категории.
- Crisis-наблюдения не входят в fit. Штрафы Правды используются только для диагностического N и порядка, не как рынок.

## Совместимые интервалы k

| метод базы | совместимый k на сетке | точек |
|---|---|---:|
${intervalRows.join("\n")}

Интервалы — результат сетки, не выбор владельца.

## Наблюдение против полосы: sourced-входы

| наблюдение | единица источника | observed БУЕ | candidate-полоса | в ±1 при cow_base | в ±1 при all_sourced_fit | оговорка |
|---|---|---:|---|---|---|---|
${sourceRows.join("\n")}

## Наблюдение против полосы: crisis

| id | период | единица | observed БУЕ | полоса | проверка |
|---|---|---|---:|---|---|
${crisisRows.join("\n")}

## Кадь ржи против хлеба того же года

| год | observed ratio | curve ratio | в ±1 при cow_base | в ±1 при all_sourced_fit | источник |
|---:|---:|---:|---|---|---|
${pairRows.join("\n")}

Это отношение цен двух исторических единиц, не физическая конверсия массы или числа хлебов в кади.

## Полная сетка

| метод | k | допустимая low-база, БУЕ | sourced misses | crisis misses | order misses | минимальный N | итог |
|---|---:|---:|---:|---:|---:|---:|---|
${gridRows.join("\n")}

## Полосы всех категорий

Все 38 категорий рассчитаны на 25 значениях k обоими методами; ниже — входные единицы и основания.

| category_id | единица | полоса | basis | причина |
|---|---|---|---|---|
${categoryRows.join("\n")}

Овца оставлена \`ordinary\`, корова — \`valuable\`: штрафное отношение 1:8 подтверждает только порядок, но не является рыночной ценой и потому не калибрует расстояние между полосами. Расхождение candidate-кривой со штрафом отражает диагностический N.

## Регрессии master archive

${regressionReport.join("\n")}

Срез \`master_archive_price_regressions.csv\` взят из фактических строк \`item_price_models.csv\`; он ловит старые перекосы, но не легитимирует их числа.
`;

writeFileSync(paths.report, report, "utf8");
const intervals = Object.fromEntries(methods.map((method) => [method.id, formatRanges(resultsFor(method.id).filter((entry) => entry.compatible).map((entry) => entry.candidate))]));
console.log(`C2 PASS: categories=${categoryBands.length}; grid=${candidates.length}; cow_base=${intervals.cow_base}; all_sourced_fit=${intervals.all_sourced_fit}; regression=2/2`);
