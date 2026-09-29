import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toCSV } from "../../scripts/lib_csv.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const groupDir = resolve(scriptDir, "../..");
const reportPath = resolve(scriptDir, "../C3_REPORT.md");
const parametersPath = resolve(scriptDir, "../c3_parameters.csv");
const bandOrder = ["low", "low_to_ordinary", "ordinary", "ordinary_to_valuable", "valuable", "high_value"];
const candidates = [
  { label: "2", numerator: 2n, denominator: 1n },
  { label: "2.5", numerator: 5n, denominator: 2n },
  { label: "3", numerator: 3n, denominator: 1n },
  { label: "4", numerator: 4n, denominator: 1n },
];

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

function gcd(left, right) {
  while (right) [left, right] = [right, left % right];
  return left;
}

function fraction(numerator, denominator = 1n) {
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function decimalFraction(value) {
  const [whole, digits = ""] = String(value).split(".");
  return fraction(BigInt(`${whole}${digits}`), 10n ** BigInt(digits.length));
}

function multiply(...values) {
  return values.reduce((result, value) => fraction(result.numerator * value.numerator, result.denominator * value.denominator), fraction(1n));
}

function divide(left, right) {
  return fraction(left.numerator * right.denominator, left.denominator * right.numerator);
}

function add(left, right) {
  return fraction(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
}

function compare(left, right) {
  const delta = left.numerator * right.denominator - right.numerator * left.denominator;
  return delta < 0n ? -1 : delta > 0n ? 1 : 0;
}

function median(values) {
  const sorted = [...values].sort(compare);
  return sorted[Math.floor(sorted.length / 2)];
}

function roundHalfUp(numerator, denominator) {
  assert(numerator >= 0n && denominator > 0n);
  return (2n * numerator + denominator) / (2n * denominator);
}

function power(numerator, denominator, exponent) {
  return exponent >= 0
    ? fraction(numerator ** BigInt(exponent), denominator ** BigInt(exponent))
    : fraction(denominator ** BigInt(-exponent), numerator ** BigInt(-exponent));
}

const parameters = [
  {
    parameter_id: "adult_bread_kg_day", unit: "kg bread / adult / day", low: "0.45", high: "0.90", basis: "logical_necessity",
    derivation: "Сценарная метрическая стандартизация засвидетельствованных хлебных пайков; источник говорит о хлебе, не о сухом зерне.",
    source_refs: "book:193635 §440; book:730439 §216", confidence: "C", status: "candidate",
  },
  {
    parameter_id: "bread_mass_per_grain_mass", unit: "kg bread / kg grain-equivalent", low: "1.333333333333", high: "1.333333333333", basis: "logical_necessity",
    derivation: "Явная сценарная конверсия 4/3: grain-equivalent = bread mass × 3/4. Это допущение чувствительности из REVIEW D11, а не установленный новгородский выход помола/выпечки.",
    source_refs: "review/step3.md#D11; bench:C3 declared conversion", confidence: "C", status: "candidate",
  },
  {
    parameter_id: "child_adult_staple_share", unit: "adult ration share", low: "0.50", high: "0.75", basis: "logical_necessity",
    derivation: "Сценарная доля для зависимых детей; это не возрастная норма и не демография Новгорода.",
    source_refs: "https://www.fao.org/4/y5686e/y5686e.pdf tables 4.5-4.6,5.4-5.5", confidence: "C", status: "candidate",
  },
  {
    parameter_id: "household_size_persons", unit: "persons", low: "5", high: "7", basis: "logical_necessity",
    derivation: "Сценарные края вокруг опубликованной общей средневековой оценки 6 человек; фиксированы 2 взрослых, остальные — зависимые дети.",
    source_refs: "book:622242 §519", confidence: "C", status: "candidate",
  },
  {
    parameter_id: "adult_count", unit: "persons", low: "2", high: "2", basis: "logical_necessity",
    derivation: "Фиксированная структура стенда, необходимая для применения детской доли; не утверждение о каждом дворе.",
    source_refs: "bench:C3 declared household structure", confidence: "C", status: "candidate",
  },
  {
    parameter_id: "daily_wage_bue", unit: "BUE / worker-day", low: "1024", high: "5119", basis: "analogy",
    derivation: "Низ: поштучный урок 1 куна принят за однодневный cash-proxy. Верх: разовая выплата 2 ногаты принята за однодневный потолок; длительность не установлена.",
    source_refs: "price_bands/compensation_reference.csv#cr_gorodnik_zakladka; evidence/p-labour.web.csv#работник при продаже зерна в Новгороде; book:641351 §2725,2726", confidence: "C", status: "candidate",
  },
  {
    parameter_id: "ordinary_rye_kad_bue", unit: "BUE / kad", low: "51189", high: "153567", basis: "derived_rule",
    derivation: "LOW: candidate-правило 1/3 от shortage-цены 1228 г., то есть 1 гривна кун/кадь. HIGH: засвидетельствованные 3 гривны/кадь в shortage 1228 г. — только верхний ceiling, не ordinary-наблюдение. Низ не является найденной ценой и не выводится обратно из голода 1230 г.",
    source_refs: "price_anchors_c1230.csv#pa_rye_kad_1228_shortage; book:393995 §1545; review/step3.md#D5", confidence: "C", status: "candidate",
  },
  {
    parameter_id: "famine_rye_kad_bue", unit: "BUE / kad", low: "1023780", high: "1023780", basis: "sourced",
    derivation: "20 гривен за кадь ржи в голод 1230 г., пересчитанные по точному курсу периода.",
    source_refs: "price_anchors_c1230.csv#pa_rye_kad_1230_famine; book:556930 §178", confidence: "A", status: "candidate",
  },
  {
    parameter_id: "kad_mass_stress_kg", unit: "kg / kad", low: "200", high: "260", basis: "analogy",
    derivation: "Stress-интервал вокруг ретроспективного центра 229 kg; края не являются исторически найденным диапазоном.",
    source_refs: "measure_units.csv#ms_kad; book:356156 §1108,1110", confidence: "C", status: "candidate",
  },
  {
    parameter_id: "kad_mass_central_kg", unit: "kg / kad", low: "229", high: "229", basis: "analogy",
    derivation: "Ретроспективный центр около 14 позднейших московских пудов; точная новгородская кадь 1230 г. не установлена.",
    source_refs: "measure_units.csv#ms_kad; book:356156 §1110", confidence: "C", status: "candidate",
  },
  {
    parameter_id: "rye_energy_kcal_kg", unit: "kcal / kg", low: "3380", high: "3380", basis: "sourced",
    derivation: "Современная опора: 338 kcal на 100 g сырого зерна ржи; в денежной формуле не участвует.",
    source_refs: "https://fdc.nal.usda.gov/portal-data/external/168884", confidence: "B", status: "candidate",
  },
  {
    parameter_id: "rye_shortage_to_famine_ratio", unit: "ratio", low: "6.666667", high: "6.666667", basis: "derived_rule",
    derivation: "Наблюдаемое отношение 20/3 между shortage 1228 и famine 1230; D44 принимал правило применения, а не это число как универсальную константу.",
    source_refs: "price_anchors_c1230.csv#pa_rye_kad_1228_shortage,pa_rye_kad_1230_famine", confidence: "B", status: "candidate",
  },
  {
    parameter_id: "bread_shortage_to_famine_ratio", unit: "ratio", low: "4", high: "4", basis: "derived_rule",
    derivation: "Собственная хлебная пара: 8 кун / 2 куны в той же неуточнённой единице хлеба; не конверсия массы.",
    source_refs: "price_anchors_c1230.csv#pa_bread_1228_shortage,pa_bread_1230_famine", confidence: "B", status: "candidate",
  },
];

const parameterHeader = ["parameter_id", "unit", "low", "high", "basis", "derivation", "source_refs", "confidence", "status"];
const basisValues = new Set(["sourced", "derived_rule", "analogy", "logical_necessity"]);

function validateParameters(rows) {
  const ids = new Set();
  for (const row of rows) {
    assert(row.parameter_id && !ids.has(row.parameter_id), `duplicate or empty parameter_id: ${row.parameter_id}`);
    ids.add(row.parameter_id);
    assert(row.unit, `${row.parameter_id}: unit required`);
    assert(basisValues.has(row.basis), `${row.parameter_id}: invalid basis`);
    assert(row.derivation, `${row.parameter_id}: derivation required`);
    assert(row.source_refs, `${row.parameter_id}: source_refs required`);
    const low = Number(row.low), high = Number(row.high);
    assert(Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0, `${row.parameter_id}: positive numeric range required`);
    assert(low <= high, `${row.parameter_id}: low exceeds high`);
  }
}

const byParameter = new Map(parameters.map((row) => [row.parameter_id, row]));
function endpoints(parameterId) {
  const row = byParameter.get(parameterId);
  assert(row, `missing parameter ${parameterId}`);
  return [...new Set([row.low, row.high])];
}

const anchors = parseCSV(readFileSync(resolve(scriptDir, "../price_anchors_c1230.csv"), "utf8"));
const categoryBands = parseCSV(readFileSync(resolve(groupDir, "price_bands/category_price_bands_c1230.csv"), "utf8"));
const compensations = parseCSV(readFileSync(resolve(groupDir, "price_bands/compensation_reference.csv"), "utf8"));
const byAnchor = new Map(anchors.map((entry) => [entry.anchor_id, entry]));
const byCategory = new Map(categoryBands.map((entry) => [entry.category_id, entry]));
const famineRyeAnchor = byAnchor.get("pa_rye_kad_1230_famine");
const shortageRyeAnchor = byAnchor.get("pa_rye_kad_1228_shortage");
const breadShortageAnchor = byAnchor.get("pa_bread_1228_shortage");
const breadFamineAnchor = byAnchor.get("pa_bread_1230_famine");
const cowAnchor = byAnchor.get("pa_cow_novgorod_c1200");
const horseAnchor = byAnchor.get("pa_horse_novgorod_c1200");
const wageFloorSource = compensations.find((entry) => entry.cr_id === "cr_gorodnik_zakladka");

function householdBreadDemand(adultBreadNorm, familySize, childShare) {
  const children = BigInt(familySize - 2);
  const adultEquivalents = add(fraction(2n), multiply(fraction(children), decimalFraction(childShare)));
  return multiply(decimalFraction(adultBreadNorm), adultEquivalents);
}

function grainEquivalent(breadDemand) {
  return divide(breadDemand, fraction(4n, 3n));
}

function stapleCost(priceBuePerKad, priceUnit, demandKg, kadMassKg = "229") {
  assert.equal(priceUnit, "BUE/kad", "grain price unit must be BUE/kad; loaf and mass units cannot be mixed");
  const mass = decimalFraction(kadMassKg);
  return roundHalfUp(BigInt(priceBuePerKad) * demandKg.numerator * mass.denominator, demandKg.denominator * mass.numerator);
}

function scenarioCorners(label, prices) {
  const rows = [];
  for (const price of prices) for (const wage of endpoints("daily_wage_bue")) {
    for (const familySize of endpoints("household_size_persons")) for (const adultBread of endpoints("adult_bread_kg_day")) {
      for (const childShare of endpoints("child_adult_staple_share")) {
        const breadDemand = householdBreadDemand(adultBread, Number(familySize), childShare);
        const demand = grainEquivalent(breadDemand);
        const cost = stapleCost(price, "BUE/kad", demand);
        rows.push({ label, price: BigInt(price), wage: BigInt(wage), familySize: Number(familySize), adultBread, childShare, demand, cost, surplus: BigInt(wage) - cost, pass: BigInt(wage) >= cost });
      }
    }
  }
  return rows;
}

function summarize(rows, familySize = null) {
  const selected = familySize === null ? rows : rows.filter((row) => row.familySize === familySize);
  const costs = selected.map((row) => row.cost);
  const surpluses = selected.map((row) => row.surplus);
  return {
    total: selected.length,
    pass: selected.filter((row) => row.pass).length,
    fail: selected.filter((row) => !row.pass).length,
    minCost: costs.reduce((a, b) => a < b ? a : b),
    maxCost: costs.reduce((a, b) => a > b ? a : b),
    bestSurplus: surpluses.reduce((a, b) => a > b ? a : b),
    worstSurplus: surpluses.reduce((a, b) => a < b ? a : b),
  };
}

validateParameters(parameters);
assert(wageFloorSource && shortageRyeAnchor && famineRyeAnchor && breadShortageAnchor && breadFamineAnchor && cowAnchor && horseAnchor);
assert.equal(wageFloorSource.currency_kuna_equivalent, "1");
assert.equal(wageFloorSource.is_market_price, "false");
assert(!byParameter.get("daily_wage_bue").source_refs.includes("korm_nedelya"));
assert.equal(famineRyeAnchor.bue_amount, byParameter.get("famine_rye_kad_bue").low);
assert.equal(shortageRyeAnchor.bue_amount, byParameter.get("ordinary_rye_kad_bue").high);
assert.equal(String(roundHalfUp(BigInt(shortageRyeAnchor.bue_amount), 3n)), byParameter.get("ordinary_rye_kad_bue").low);
assert(!byParameter.get("ordinary_rye_kad_bue").source_refs.includes("pa_rye_kad_1230_famine"));
assert.equal(BigInt(famineRyeAnchor.bue_numerator) * BigInt(shortageRyeAnchor.bue_denominator) * 3n, BigInt(shortageRyeAnchor.bue_numerator) * BigInt(famineRyeAnchor.bue_denominator) * 20n);
assert.equal(BigInt(breadFamineAnchor.bue_numerator) * BigInt(breadShortageAnchor.bue_denominator), BigInt(breadShortageAnchor.bue_numerator) * BigInt(breadFamineAnchor.bue_denominator) * 4n);

const ordinaryCorners = scenarioCorners("ordinary candidate … shortage ceiling", endpoints("ordinary_rye_kad_bue"));
const famineCorners = scenarioCorners("famine 1230", endpoints("famine_rye_kad_bue"));
assert.equal(ordinaryCorners.length, 32);
assert.equal(famineCorners.length, 16);
assert(ordinaryCorners.filter((row) => row.familySize === 5 && row.price === 51189n && row.wage === 1024n).every((row) => row.pass));
assert(ordinaryCorners.filter((row) => row.familySize === 5 && row.price === 153567n && row.wage === 1024n).some((row) => !row.pass));
assert(famineCorners.every((row) => !row.pass));

const lowDemand = grainEquivalent(householdBreadDemand("0.45", 5, "0.50"));
const highDemand = grainEquivalent(householdBreadDemand("0.90", 7, "0.75"));
const baseCost = stapleCost(51189, "BUE/kad", lowDemand);
assert(baseCost < stapleCost(153567, "BUE/kad", lowDemand));
assert(baseCost < stapleCost(51189, "BUE/kad", grainEquivalent(householdBreadDemand("0.45", 7, "0.50"))));
assert(baseCost < stapleCost(51189, "BUE/kad", grainEquivalent(householdBreadDemand("0.90", 5, "0.50"))));
assert(baseCost < stapleCost(51189, "BUE/kad", grainEquivalent(householdBreadDemand("0.45", 5, "0.75"))));
assert(baseCost < stapleCost(51189, "BUE/kad", highDemand));
assert.throws(() => stapleCost(1222, "BUE/loaf", lowDemand), /cannot be mixed/);
assert.throws(() => validateParameters([{ ...parameters[0], parameter_id: "bad_range", low: "2", high: "1" }]), /low exceeds high/);
assert.throws(() => validateParameters([{ ...parameters[0], parameter_id: "bad_basis", basis: "" }]), /invalid basis/);
assert.throws(() => validateParameters([{ ...parameters[0], parameter_id: "bad_derivation", derivation: "" }]), /derivation required/);

const family5LowDemand = grainEquivalent(householdBreadDemand("0.45", 5, "0.50"));
const family5HighDemand = grainEquivalent(householdBreadDemand("0.90", 5, "0.75"));
const sensitivity = ["200", "229", "260"].flatMap((mass) => [
  ["ordinary low analogy", 51189n],
  ["shortage 1228 ceiling", 153567n],
  ["famine 1230", 1023780n],
].map(([regime, price]) => ({
  mass, regime, price,
  lowCost: stapleCost(price, "BUE/kad", family5LowDemand, mass),
  highCost: stapleCost(price, "BUE/kad", family5HighDemand, mass),
})));

function calibrationBase(candidate) {
  const observations = [
    { value: fraction(51189n, 100n), step: bandOrder.indexOf("low") },
    { value: fraction(BigInt(cowAnchor.bue_numerator), BigInt(cowAnchor.bue_denominator)), step: bandOrder.indexOf("valuable") },
    { value: fraction(BigInt(horseAnchor.bue_numerator), BigInt(horseAnchor.bue_denominator)), step: bandOrder.indexOf("valuable") },
  ];
  return median(observations.map((entry) => divide(entry.value, power(candidate.numerator, candidate.denominator, entry.step))));
}

const oldPrices = {
  horse: { "2": 716646n, "2.5": 895808n, "3": 1074969n, "4": 1433292n },
  cow: { "2": 358323n, "2.5": 358323n, "3": 358323n, "4": 358323n },
  axe: { "2": 179162n, "2.5": 143329n, "3": 119441n, "4": 89581n },
};
const targetDefinitions = [
  ["horse", "конь"],
  ["cow", "корова"],
  ["axe", "рабочий топор"],
];
const lowWage = BigInt(byParameter.get("daily_wage_bue").low);
const highWage = BigInt(byParameter.get("daily_wage_bue").high);

function revisedPrice(target, candidate) {
  if (target === "horse") return BigInt(horseAnchor.bue_amount);
  if (target === "cow") return BigInt(cowAnchor.bue_amount);
  assert.equal(byCategory.get("price_category.household.axe").value_band, "ordinary");
  const scaled = multiply(calibrationBase(candidate), power(candidate.numerator, candidate.denominator, bandOrder.indexOf("ordinary")));
  return roundHalfUp(scaled.numerator, scaled.denominator);
}

const targetResults = candidates.flatMap((candidate) => targetDefinitions.map(([targetId, target]) => {
  const before = oldPrices[targetId][candidate.label];
  const after = revisedPrice(targetId, candidate);
  return {
    k: candidate.label, target, before, after,
    beforeLowDays: Number(before) / Number(highWage), beforeHighDays: Number(before) / Number(lowWage),
    afterLowDays: Number(after) / Number(highWage), afterHighDays: Number(after) / Number(lowWage),
  };
}));
assert.equal(targetResults.length, 12);
assert(targetResults.every((row) => row.afterLowDays <= row.afterHighDays));

const summaries = [
  ["семья 5-7", "ordinary candidate … shortage ceiling", summarize(ordinaryCorners)],
  ["семья 5-7", "famine 1230", summarize(famineCorners)],
  ["семья 5", "ordinary candidate … shortage ceiling", summarize(ordinaryCorners, 5)],
  ["семья 5", "famine 1230", summarize(famineCorners, 5)],
];
const parameterRows = parameters.map((row) => `| \`${row.parameter_id}\` | ${row.low} | ${row.high} | ${row.unit} | \`${row.basis}\` | ${row.derivation} | \`${row.source_refs}\` |`);
const summaryRows = summaries.map(([scope, year, value]) => `| ${scope} | ${year} | ${value.total} | ${value.pass} | ${value.fail} | ${value.minCost} | ${value.maxCost} | ${value.bestSurplus} | ${value.worstSurplus} |`);
const sensitivityRows = sensitivity.map((row) => `| ${row.mass} | ${row.regime} | ${row.price} | ${row.lowCost} | ${row.highCost} |`);
const targetRows = targetResults.map((row) => `| ${row.k} | ${row.target} | ${row.before} | ${row.beforeLowDays.toFixed(2)}-${row.beforeHighDays.toFixed(2)} | ${row.after} | ${row.afterLowDays.toFixed(2)}-${row.afterHighDays.toFixed(2)} |`);

const report = `# Стенд C3: баланс хозяйства

Статус: детерминированная сценарная симуляция без модели. Параметры \`logical_necessity\` и \`analogy\` — candidate, не найденная статистика Новгорода. \`k\`, N и порог правдоподобия не утверждаются.

## Параметры

| parameter_id | low | high | единица | basis | derivation | source_refs |
|---|---:|---:|---|---|---|---|
${parameterRows.join("\n")}

Книжные источники говорят о хлебном пайке, поэтому стенд сначала считает хлебную массу, затем явно переводит её в grain-equivalent по candidate-отношению 4/3: \`grain kg = bread kg × 3/4\`. Это не исторически установленный выход помола/выпечки. Цена хлеба за штуку в расчёт массы не входит.

Короткие цитаты:

- \`book:193635 §440\`: «Хлеб выдавался каждому на день, видимо, из расчета 1 ливр на человека».
- \`book:730439 §216\`: «каждый день выдавали два фунта хлеба».
- \`book:622242 §519\`: «средняя численность семьи — шесть человек».

## Формула и углы

\`adult_equivalents = 2 + (family_size - 2) × child_share\`

\`daily_grain_equivalent_kg = adult_bread_kg_day × adult_equivalents × 3/4\`

\`daily_staple_cost = round_half_up(rye_BUE_per_kad × daily_grain_equivalent_kg / kad_mass_kg)\`

LOW ordinary = 51 189 БУЕ/кадь — явное candidate-правило 1/3 от shortage 1228 г., а не найденная цена и не обратный расчёт от голода. HIGH = 153 567 БУЕ/кадь — shortage 1228, только ceiling. Famine 1230 = 1 023 780 БУЕ/кадь.

| охват | режим | углов | баланс ≥ 0 | баланс < 0 | min расход | max расход | лучший остаток | худший остаток |
|---|---|---:|---:|---:|---:|---:|---:|---:|
${summaryRows.join("\n")}

- На LOW ordinary семья из пяти проходит все углы даже при low cash-proxy; на shortage-ceiling часть low-wage углов уже не сходится.
- В famine не сходится даже лучший угол: голодная цена ржи остаётся решающим параметром.
- Это бюджет только grain-equivalent для одного денежного работника; натуральная оплата и прочие расходы не включены.

## Чувствительность к массе кади, семья 5

Края 200/260 kg — stress, не найденный исторический диапазон; 229 kg — ретроспективный центр.

| kg/кадь | режим | БУЕ/кадь | min расход/день | max расход/день |
|---:|---|---:|---:|---:|
${sensitivityRows.join("\n")}

## Дни труда до и после перекалибровки

Диапазон = цена / 5119 … цена / 1024 БУЕ в день. «До» приводит цены отклонённого одноякорного C2 шага 3; «после» использует прямые market anchors коня/коровы и многоточечную curve для ordinary-топора.

| k | цель | цена до | дней до | цена после | дней после |
|---:|---|---:|---:|---:|---:|
${targetRows.join("\n")}

## Незакрытое

- Нет засвидетельствованной подённой ставки; cash-proxy остаётся аналогией.
- Коэффициент хлеб→зерно 4/3 и stress 200/260 kg — сценарные допущения, не локальные измерения.
- Точная масса новгородской кади 1230 г. и масса исторической единицы «хлеб» не установлены.
- 1228 г. — shortage, не ordinary; отношение ржи 20/3 и хлеба 4 — разные наблюдаемые пары, не универсальный famine multiplier.
- Возрастной состав, натуральная оплата, прочая пища/расходы, сезонность и число оплачиваемых дней не установлены.

## Самопроверки

- PASS: ${ordinaryCorners.length} ordinary/shortage-ceiling и ${famineCorners.length} famine углов.
- PASS: ordinary low задан \`derived_rule\` 1/3 shortage; shortage — отдельный sourced ceiling; обратного вывода из famine нет.
- PASS: хлебная масса явно переведена в grain-equivalent; цена хлеба/штуку отвергается в массовом расчёте.
- PASS: чувствительность 200/229/260 kg посчитана отдельно.
- PASS: рост цены/семьи/пайка/детской доли не снижает расход; рост ставки не ухудшает баланс.
- PASS: 12 строк дней труда содержат сопоставимые before/after.
- PASS: 4 отрицательные пробы диапазона, basis, derivation и единицы отвергнуты.
`;

writeFileSync(parametersPath, toCSV(parameterHeader, parameters), "utf8");
writeFileSync(reportPath, report, "utf8");
console.log(`C3 PASS: parameters=${parameters.length}; ordinary=${ordinaryCorners.length}; famine=${famineCorners.length}; sensitivity=${sensitivity.length}; workday before/after=${targetResults.length}; negative probes=4`);
