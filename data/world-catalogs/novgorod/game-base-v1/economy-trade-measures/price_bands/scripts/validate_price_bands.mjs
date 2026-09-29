// Acceptance check for price_bands.csv (brief): "value_band входит в закрытый словарь;
// ни одна строка не содержит абсолютной цены; basis непустой".
// Run: node validate_price_bands.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, "..", "price_bands.csv");
const VALUE_BAND_VOCAB = new Set(["low", "low_to_ordinary", "ordinary", "ordinary_to_valuable", "valuable", "high_value"]);
const ABS_PRICE_RE = /\b\d+([.,]\d+)?\s*(кун\w*|гривн\w*|ногат\w*|резан\w*|векш\w*)\b/i;

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

const rows = parseCSV(readFileSync(CSV, "utf8"));
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const data = rows.slice(1).filter((r) => r.length > 1);

function validate(input, quiet = false) {
  let failures = 0;
  const fail = (message) => { if (!quiet) console.log(`FAIL: ${message}`); failures += 1; };
  for (const r of input) {
    const id = r[idx.pb_id];
    const band = r[idx.value_band];
    if (!VALUE_BAND_VOCAB.has(band)) fail(`${id} value_band "${band}" not in closed vocabulary`);
    if (!r[idx.basis] || !r[idx.basis].trim()) fail(`${id} has empty basis`);
    const famine = r[idx.famine_modifier] ?? "";
    if (/multiplier x6\.7/.test(famine) && !new Set(["pb_grain_rye", "pb_grain_barley_oats"]).has(id)) {
      fail(`${id} uses grain x6.7 outside grain scope`);
    }
    if (/multiplier x4(?:\D|$)/.test(famine) && id !== "pb_bread_loaf") fail(`${id} uses bread x4 outside bread scope`);
    if (/multiplier x/.test(famine) && !/(?:multiplier x6\.7|multiplier x4(?:\D|$))/.test(famine)) fail(`${id} uses an unapproved famine multiplier`);
    for (const h of header) {
      const v = r[idx[h]];
      if (v && ABS_PRICE_RE.test(v)) fail(`${id} field "${h}" contains an absolute price: "${v}"`);
    }
  }
  return failures;
}

const failures = validate(data);
const saltIndex = data.findIndex((row) => row[idx.pb_id] === "pb_salt");
const badScope = data.map((row) => [...row]);
badScope[saltIndex][idx.famine_modifier] = "rises, multiplier x6.7";
if (validate(badScope, true) === 0) throw new Error("negative probe failed: x6.7 on salt was accepted");

console.log(failures === 0
  ? `\nPASS: ${data.length} rows, bands/basis valid, famine multipliers scoped, no absolute prices; negative scope probe rejected.`
  : `\nFAIL: ${failures} check(s) failed across ${data.length} rows.`);
process.exit(failures === 0 ? 0 : 1);
