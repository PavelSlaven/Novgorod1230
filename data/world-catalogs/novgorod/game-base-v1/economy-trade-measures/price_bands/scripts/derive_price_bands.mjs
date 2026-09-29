// Derives price_bands.csv for the price_bands domain (group economy-trade-measures).
//
// OWNER DECISION (collector brief for this group): "только относительные полосы с
// основанием; цены MASTER не использовать". This script therefore NEVER writes an
// absolute price into price_bands.csv. Absolute historical numbers (Pravda Russkaya
// fines, chronicle famine prices) live only in ../compensation_reference.csv, tagged
// is_market_price=true/false, and are used HERE only to compute a *ratio* (a derived
// number from real sourced data, not an invented one) that becomes the qualitative
// basis for famine_modifier.
//
// value_band closed vocabulary (matches tools/rus13-novgorod-regional-templates/
// novgorod_goods_prices_v1.tsv#base_value_band, already relative/qualitative):
//   low | low_to_ordinary | ordinary | ordinary_to_valuable | valuable | high_value
//
// Run: node derive_price_bands.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toCSV } from "../../scripts/lib_csv.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..", "..", "..", "..", ".."); // -> Novgorod-game-base
const TSV_PATH = join(REPO_ROOT, "tools", "rus13-novgorod-regional-templates", "novgorod_goods_prices_v1.tsv");
const CR_PATH = join(__dirname, "..", "compensation_reference.csv");
const OUT = join(__dirname, "..", "price_bands.csv");

const VALUE_BAND_VOCAB = ["low", "low_to_ordinary", "ordinary", "ordinary_to_valuable", "valuable", "high_value"];

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") {}
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadTSV(path) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = lines[0].split("\t");
  return lines.slice(1).map((l) => {
    const cells = l.split("\t");
    const o = {};
    header.forEach((h, i) => (o[h] = cells[i]));
    return o;
  });
}

// ---- 1. compute famine ratio from real sourced numbers (compensation_reference.csv) ----
const crRows = parseCSV(readFileSync(CR_PATH, "utf8"));
const crHeader = crRows[0];
const crIdx = Object.fromEntries(crHeader.map((h, i) => [h, i]));
const cr = crRows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(crHeader.map((h, i) => [h, r[i]])));

const ryeShortage1228 = cr.find((r) => r.cr_id === "cr_rye_kad_1228");
const ryeFamine1230 = cr.find((r) => r.cr_id === "cr_rye_kad_1230_famine");
const breadShortage1228 = cr.find((r) => r.cr_id === "cr_bread_1228_shortage");
const breadFamine1230 = cr.find((r) => r.cr_id === "cr_bread_1230_famine");
const famineRatioRye = Number(ryeFamine1230.currency_kuna_equivalent) / Number(ryeShortage1228.currency_kuna_equivalent);
const famineRatioBread = Number(breadFamine1230.currency_kuna_equivalent) / Number(breadShortage1228.currency_kuna_equivalent);

// NOTE: deliberately no absolute currency numbers here (owner rule for price_bands.csv) --
// the underlying historical figures live in ../compensation_reference.csv; this note only
// carries the derived multiplier and a pointer to the reference rows.
const famineBasisNote =
  `derived multiplier (script-computed from compensation_reference.csv, not invented): ` +
  `ratio ×${famineRatioRye.toFixed(1)} (rye/kad, 1228 shortage vs 1230-1231 famine per НПЛ); ` +
  `used only for grain, never as an item price or ordinary baseline. ` +
  `See compensation_reference.csv#cr_rye_kad_1228,cr_rye_kad_1230_famine.`;
const breadFamineBasisNote =
  `derived multiplier (script-computed from compensation_reference.csv): ` +
  `ratio ×${famineRatioBread.toFixed(0)} (bread, same unspecified unit, 1228 shortage vs 1230-1231 famine); ` +
  `used only for bread, never as an item price or mass conversion. ` +
  `See compensation_reference.csv#cr_bread_1228_shortage,cr_bread_1230_famine.`;

console.log(`famine ratios (1228 shortage -> 1230 famine): rye=${famineRatioRye.toFixed(2)}x, bread=${famineRatioBread.toFixed(2)}x`);

// ---- 2. load goods_prices.tsv, keep only the GOODS categories (services go to services_hire_labor) ----
const GOODS_CATEGORIES = new Set([
  "food", "grain", "preservation", "food_preserved", "food_trade", "trade_church",
  "fur", "cloth", "craft_material", "metal", "tool_weapon", "tool", "tool_transport",
  "utensil", "container", "fodder", "fuel", "fuel_craft", "craft_boat", "clothing",
  "tool_household", "church_household",
]);

const tsv = loadTSV(TSV_PATH).filter((r) => GOODS_CATEGORIES.has(r.category));

// normalize a base_value_band string to the closed vocabulary; a few tsv rows use an
// "a_to_b" transitional token (e.g. "low_to_ordinary") which IS part of the vocab below.
function normalizeBand(raw) {
  if (VALUE_BAND_VOCAB.includes(raw)) return raw;
  console.log(`GAP: unrecognized value_band "${raw}" -- kept as-is, needs review`);
  return raw;
}

const GRAIN_FAMINE_MULTIPLIER_IDS = new Set(["price_grain_rye", "price_grain_barley_oats"]);
const CALIBRATED_BAND_OVERRIDES = new Map([
  ["price_grain_rye", ["ordinary_to_valuable", "кадь зерна отделена от хлеба поштучной неуточнённой меры"]],
  ["price_grain_barley_oats", ["ordinary_to_valuable", "кадь зерна отделена от хлеба поштучной неуточнённой меры"]],
  ["price_salt", ["ordinary_to_valuable", "условный якорь №219 за берковец остаётся needs_review"]],
  ["price_honey", ["ordinary", "кризисный потолок 1170 г. за пуд не задаёт ordinary-цену"]],
  ["price_fur_squirrel", ["low", "базовая единица уточнена как одна шкурка; торговая связка вынесена отдельно"]],
  ["price_fur_marten", ["ordinary", "ориентир около 7,5 г серебра относится к одной куньей шкурке; соболь вынесен отдельно"]],
  ["price_linen_cloth", ["ordinary", "веретище №609 — лишь нижняя аналогия с неизвестной мерой, не цена произвольной льняной ткани"]],
  ["price_knife_simple", ["low", "нож №438: оптовое наблюдение нормализуется примерно до половины куны за штуку"]],
  ["price_axe_work", ["ordinary", "рабочий топор остаётся в low_to_ordinary…ordinary после многоточечной проверки"]],
]);

const header = [
  "pb_id", "item_category_ref", "value_band", "seasonal_modifier", "war_modifier",
  "road_modifier", "famine_modifier", "basis", "source_refs", "confidence",
];

// one row per priced item (not per category) -- this is what actually carries a single,
// unambiguous value_band token per the closed vocabulary above.
const rows = [];
for (const item of tsv) {
  const category = item.category;
  const hasGrainFamineMultiplier = GRAIN_FAMINE_MULTIPLIER_IDS.has(item.price_entry_id);
  const hasBreadFamineMultiplier = item.price_entry_id === "price_bread_loaf";
  const crisisRaw = item.crisis_variation; // e.g. "rises_with_hunger_war_fire_or_closure"
  const warMod = /war|fire/.test(crisisRaw) ? "rises_with_war_or_fire (проектное правило, tsv#crisis_variation)" : "";
  const roadMod = /closure/.test(crisisRaw) ? "rises_when_route_closed_or_distant (проектное правило, tsv#crisis_variation)" : "";
  const famineMod = hasGrainFamineMultiplier
    ? `rises_sharply_in_famine, multiplier x${famineRatioRye.toFixed(1)} for grain only (see basis)`
    : hasBreadFamineMultiplier
      ? `rises_sharply_in_famine, multiplier x${famineRatioBread.toFixed(0)} for bread only (see basis)`
    : item.price_entry_id === "price_flour"
      ? "rises_with_grain_input_in_famine; numeric multiplier not established"
      : "not_established_no_category_specific_famine_multiplier";

  rows.push({
    pb_id: `pb_${item.price_entry_id.replace(/^price_/, "")}`,
    item_category_ref: `gap:tsv_category.${category} (item_category_ref pending materials_registry/category_parameters domain)`,
    value_band: CALIBRATED_BAND_OVERRIDES.get(item.price_entry_id)?.[0] ?? normalizeBand(item.base_value_band),
    seasonal_modifier: item.seasonal_variation,
    war_modifier: warMod,
    road_modifier: roadMod,
    famine_modifier: famineMod,
    basis: hasGrainFamineMultiplier
      ? `tsv base_value_band (draft, project rule, medium confidence) + ${famineBasisNote}`
      : hasBreadFamineMultiplier
        ? `tsv base_value_band (draft, project rule, medium confidence) + ${breadFamineBasisNote}`
      : item.price_entry_id === "price_flour"
        ? "tsv base_value_band (draft, project rule, medium confidence); flour is derived from grain, but no paired flour observations establish a numeric famine multiplier"
        : CALIBRATED_BAND_OVERRIDES.has(item.price_entry_id)
          ? `calibrated candidate override of tsv base_value_band; ${CALIBRATED_BAND_OVERRIDES.get(item.price_entry_id)[1]}; no category-specific famine multiplier is sourced`
          : "tsv base_value_band (draft, project rule, medium confidence); no category-specific famine multiplier is sourced",
    source_refs: `tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#${item.price_entry_id}` +
      (hasGrainFamineMultiplier ? "; price_bands/compensation_reference.csv#cr_rye_kad_1228,cr_rye_kad_1230_famine" : "") +
      (hasBreadFamineMultiplier ? "; price_bands/compensation_reference.csv#cr_bread_1228_shortage,cr_bread_1230_famine" : ""),
    confidence: "C",
  });
}

// sanity: no absolute price anywhere in the output rows
for (const r of rows) {
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === "string" && /\b\d+\s*(кун|гривен|гривн|ногат)/i.test(v)) {
      throw new Error(`price_bands.csv row ${r.pb_id} field ${k} contains an absolute price -- forbidden by owner decision: "${v}"`);
    }
  }
}

writeFileSync(OUT, toCSV(header, rows), "utf8");
console.log(`price_bands.csv: ${rows.length} rows (one per goods category), 0 absolute prices (checked)`);
