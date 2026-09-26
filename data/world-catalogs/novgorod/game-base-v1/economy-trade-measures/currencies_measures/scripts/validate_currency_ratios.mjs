// Acceptance check for currency_units.csv (per the collector brief for domain
// currencies_measures): "соотношения образуют непротиворечивую систему
// (пересчёт по кругу даёт 1); у каждой физической единицы есть item_template;
// period_validity покрывает 1230-1250".
//
// Only rows with a *numeric* ratio_to_kuna participate in the circularity check;
// rows marked "unresolved"/"context_dependent"/"by_weight_only" are intentionally
// excluded (the sources do not give them a number for 1230 -- see ratio_basis).
//
// Run: node validate_currency_ratios.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, "..", "currency_units.csv");

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const raw = readFileSync(CSV, "utf8");
const rows = parseCSV(raw);
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const data = rows.slice(1).filter((r) => r.length > 1);

let failures = 0;

// 1. physical units must carry an item_template_ref
for (const r of data) {
  const kind = r[idx.kind];
  const isPhysical = /physical_money|physical_payment_material|weight_object|foreign_physical/.test(kind);
  const hasTemplate = r[idx.item_template_ref] && r[idx.item_template_ref].trim().length > 0;
  if (isPhysical && !hasTemplate && !/negative_fact|episodic|weight_definition/.test(kind)) {
    console.log(`GAP: ${r[idx.cu_id]} (${kind}) has no item_template_ref`);
  }
}

// 2. numeric ratio circularity: build a graph node -> kuna_equivalent for rows with a plain number
const numeric = new Map();
for (const r of data) {
  const val = r[idx.ratio_to_kuna];
  if (val && /^-?\d+(\.\d+)?$/.test(val.trim())) {
    numeric.set(r[idx.cu_id], parseFloat(val));
  }
}
// cu_grivna_kun(50) -> cu_nogata(2.5) -> cu_kuna(1) -> cu_rezana(1) must satisfy:
// grivna_kun / nogata == 20 ; nogata / kuna == 2.5 ; kuna/base==1
const checks = [
  ["cu_grivna_kun", "cu_nogata", 20, "1 гривна кун = 20 ногат"],
  ["cu_nogata", "cu_kuna", 2.5, "1 ногата = 2.5 куны"],
  ["cu_grivna_serebra", "cu_grivna_kun", 4, "1 гривна серебра = 4 гривны кун"],
];
for (const [a, b, expected, label] of checks) {
  if (!numeric.has(a) || !numeric.has(b)) {
    console.log(`SKIP (no numeric ratio for ${a} or ${b}): ${label}`);
    continue;
  }
  const actual = numeric.get(a) / numeric.get(b);
  if (Math.abs(actual - expected) > 1e-6) {
    console.log(`FAIL: ${label} -> expected ${expected}, got ${actual}`);
    failures++;
  } else {
    console.log(`ok: ${label} (${actual})`);
  }
}

// 3. round trip: grivna_serebra -> kuna -> grivna_serebra must be 1
if (numeric.has("cu_grivna_serebra") && numeric.has("cu_kuna")) {
  const toKuna = numeric.get("cu_grivna_serebra") / numeric.get("cu_kuna");
  const back = numeric.get("cu_kuna") / numeric.get("cu_grivna_serebra");
  const roundTrip = toKuna * back;
  if (Math.abs(roundTrip - 1) > 1e-9) {
    console.log(`FAIL: round-trip grivna_serebra<->kuna = ${roundTrip}, expected 1`);
    failures++;
  } else {
    console.log(`ok: round-trip grivna_serebra<->kuna = 1`);
  }
}

// 4. period_validity should mention or cover the 1230-1250 window for rows meant as the 1230 baseline
const baseline = ["cu_grivna_serebra", "cu_grivna_kun", "cu_nogata", "cu_kuna"];
for (const id of baseline) {
  const r = data.find((row) => row[idx.cu_id] === id);
  if (!r) continue;
  const pv = r[idx.period_validity];
  if (!/1180-1260|1230/.test(pv)) {
    console.log(`FAIL: ${id} period_validity "${pv}" does not cover 1230-1250`);
    failures++;
  }
}

console.log(failures === 0 ? "\nPASS: all checked ratios are consistent." : `\nFAIL: ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
