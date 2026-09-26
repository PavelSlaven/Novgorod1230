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

let failures = 0;
for (const r of data) {
  const id = r[idx.pb_id];
  const band = r[idx.value_band];
  if (!VALUE_BAND_VOCAB.has(band)) {
    console.log(`FAIL: ${id} value_band "${band}" not in closed vocabulary`);
    failures++;
  }
  if (!r[idx.basis] || !r[idx.basis].trim()) {
    console.log(`FAIL: ${id} has empty basis`);
    failures++;
  }
  for (const h of header) {
    const v = r[idx[h]];
    if (v && ABS_PRICE_RE.test(v)) {
      console.log(`FAIL: ${id} field "${h}" contains an absolute price: "${v}"`);
      failures++;
    }
  }
}

console.log(failures === 0
  ? `\nPASS: ${data.length} rows, all value_band tokens in vocabulary, all basis non-empty, no absolute prices.`
  : `\nFAIL: ${failures} check(s) failed across ${data.length} rows.`);
process.exit(failures === 0 ? 0 : 1);
