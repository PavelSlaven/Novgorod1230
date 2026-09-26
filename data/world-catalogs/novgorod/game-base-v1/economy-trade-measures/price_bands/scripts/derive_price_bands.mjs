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

const ryeBaseline = cr.find((r) => r.cr_id === "cr_rye_kad_1228"); // 1228, non-famine shortage year
const ryeFamine1230 = cr.find((r) => r.cr_id === "cr_rye_kad_1230_famine");
const famineRatioRye = Number(ryeFamine1230.currency_kuna_equivalent) / Number(ryeBaseline.currency_kuna_equivalent);

const ryeFamine1215 = cr.find((r) => r.cr_id === "cr_rye_kad_1215_famine");
const ryeBlockade1170 = cr.find((r) => r.cr_id === "cr_rye_kad_1170_blockade");
// second, independent data point: 1215 famine vs 1170 blockade (both rye/kad, both crisis years but
// different severity) -- used only to show the derived ratio is not a single cherry-picked number.
const ratio1215v1170 = Number(ryeFamine1215.currency_kuna_equivalent) / Number(ryeBlockade1170.currency_kuna_equivalent);

// NOTE: deliberately no absolute currency numbers here (owner rule for price_bands.csv) --
// the underlying historical figures live in ../compensation_reference.csv; this note only
// carries the derived multiplier and a pointer to the reference rows.
const famineBasisNote =
  `derived multiplier (script-computed from compensation_reference.csv, not invented): ` +
  `ratio ×${famineRatioRye.toFixed(1)} (rye/kad, 1228 non-famine vs 1230-1231 famine per НПЛ); ` +
  `cross-check ×${ratio1215v1170.toFixed(1)} (rye/kad, 1215 famine vs 1170 military blockade). ` +
  `Used only as an order-of-magnitude direction for famine_modifier, never as an item price. ` +
  `See compensation_reference.csv#cr_rye_kad_1228,cr_rye_kad_1230_famine,cr_rye_kad_1215_famine,cr_rye_kad_1170_blockade.`;

console.log(`famine ratio (1228->1230, rye): ${famineRatioRye.toFixed(2)}x`);
console.log(`crisis ratio (1215 famine / 1170 blockade, rye): ${ratio1215v1170.toFixed(2)}x`);

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

const FAMINE_PRONE = new Set(["food", "grain", "food_preserved", "food_trade", "preservation", "fodder"]);

const header = [
  "pb_id", "item_category_ref", "value_band", "seasonal_modifier", "war_modifier",
  "road_modifier", "famine_modifier", "basis", "source_refs", "confidence",
];

// one row per priced item (not per category) -- this is what actually carries a single,
// unambiguous value_band token per the closed vocabulary above.
const rows = [];
for (const item of tsv) {
  const category = item.category;
  const crisisRaw = item.crisis_variation; // e.g. "rises_with_hunger_war_fire_or_closure"
  const warMod = /war|fire/.test(crisisRaw) ? "rises_with_war_or_fire (проектное правило, tsv#crisis_variation)" : "";
  const roadMod = /closure/.test(crisisRaw) ? "rises_when_route_closed_or_distant (проектное правило, tsv#crisis_variation)" : "";
  const famineMod = FAMINE_PRONE.has(category)
    ? `rises_sharply_in_famine, order of magnitude ~x${Math.round(famineRatioRye)} for staple grain/food (see basis); category "${category}" follows the same direction`
    : "secondary_rise_via_general_scarcity_and_debt_pressure (no category-specific sourced ratio; only staple grain/bread has a direct chronicle ratio -- see basis)";

  rows.push({
    pb_id: `pb_${item.price_entry_id.replace(/^price_/, "")}`,
    item_category_ref: `gap:tsv_category.${category} (item_category_ref pending materials_registry/category_parameters domain)`,
    value_band: normalizeBand(item.base_value_band),
    seasonal_modifier: item.seasonal_variation,
    war_modifier: warMod,
    road_modifier: roadMod,
    famine_modifier: famineMod,
    basis: FAMINE_PRONE.has(category)
      ? `tsv base_value_band (draft, project rule, medium confidence) + ${famineBasisNote}`
      : `tsv base_value_band (draft, project rule, medium confidence); famine magnitude not sourced for this category -- direction only, no invented number`,
    source_refs: `tools/rus13-novgorod-regional-templates/novgorod_goods_prices_v1.tsv#${item.price_entry_id}` +
      (FAMINE_PRONE.has(category) ? "; price_bands/compensation_reference.csv#cr_rye_kad_1228,cr_rye_kad_1230_famine,cr_rye_kad_1215_famine,cr_rye_kad_1170_blockade" : ""),
    confidence: FAMINE_PRONE.has(category) ? "C (band) / B (famine ratio basis)" : "C",
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
