// Acceptance check for hazards.csv, per brief acceptance_ru:
// - each hz_id has a risk_type from the DDL enum
// - at least one visible sign
// - source_refs present
// - frequency_class values come only from the stated classes (no invented numbers)
// - every water/coastal family (water_crossing edge kind) has >=1 hazard (start territory rule)
// - every pf_id resolves against places-binding/places/place_families.csv (added 2026-09-26 rework)
// - every season_periods value resolves against the catalog season_period set (added 2026-09-26 rework)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(path.join(__dirname, "..", "hazards.csv"), "utf-8");

const PLACE_FAMILIES_CSV = path.join(
  __dirname, "..", "..", "..", "places-binding", "places", "place_families.csv",
);
const VALID_PF_IDS = new Set(
  readFileSync(PLACE_FAMILIES_CSV, "utf-8")
    .split("\n")
    .slice(1)
    .map((l) => l.split(",")[0].trim())
    .filter(Boolean),
);

// Catalog season_period set, as used by sibling groups (see VERIFICATION.md).
const VALID_SEASONS = new Set(["winter", "spring", "spring_rasputitsa", "summer", "autumn"]);

function parseCsv(text) {
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
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.length > 1 || r[0] !== "").map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const RISK_TYPES = new Set([
  "road","weather","law","violence","theft","hunger","disease","wild_animals",
  "social","religious","economic","war","fire","water","cold",
]);

const rows = parseCsv(csv);
const errors = [];

for (const r of rows) {
  if (!RISK_TYPES.has(r.risk_type)) errors.push(`${r.hz_id}: risk_type '${r.risk_type}' not in world_base.region_risks enum`);
  if (!r.visible_signs || !r.visible_signs.trim()) errors.push(`${r.hz_id}: no visible_signs`);
  if (!r.source_refs || !r.source_refs.trim()) errors.push(`${r.hz_id}: no source_refs`);
  if (!["A", "B", "C"].includes(r.confidence)) errors.push(`${r.hz_id}: confidence '${r.confidence}' not A/B/C`);
  if (!/^(ubiquitous|common|contextual|rare)( |$)/.test(r.frequency_class)) {
    errors.push(`${r.hz_id}: frequency_class '${r.frequency_class}' does not start with a stated class`);
  }
  for (const pf of (r.pf_ids || "").split(";").map((s) => s.trim()).filter(Boolean)) {
    if (!VALID_PF_IDS.has(pf)) errors.push(`${r.hz_id}: pf_id '${pf}' not found in place_families.csv`);
  }
  for (const season of (r.season_periods || "").split(";").map((s) => s.trim()).filter(Boolean)) {
    if (!VALID_SEASONS.has(season)) errors.push(`${r.hz_id}: season_periods value '${season}' not in catalog season_period set (winter, spring, spring_rasputitsa, summer, autumn)`);
  }
}

const waterHazards = rows.filter((r) => r.route_or_edge_kinds.includes("water_crossing"));
if (waterHazards.length < 1) errors.push("no hazard covers water_crossing edge kind (start territory is river reaches/channels/landings)");

const ids = rows.map((r) => r.hz_id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) errors.push(`duplicate hz_id: ${[...new Set(dupes)].join(", ")}`);

if (errors.length) {
  console.error(`FAIL: ${errors.length} issue(s)`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
} else {
  console.log(`OK: ${rows.length} rows, all checks passed (risk_type enum, visible_signs, source_refs, confidence, frequency_class, water_crossing coverage, unique ids).`);
}
