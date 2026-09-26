// Deterministic extraction: place_names candidate table from the v6 naming
// register (911 place names with a name_status/evidence_status pair).
import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/Slaven/Documents/Novgorod-game-base/DOCUMENTS/documents-kg/corpus/DOCUMENTS/novgorod_graphify_g1_g4_full/source_tsv/novgorod_g2_g4_70_cells_v6_naming_register.tsv";
const OUT_DIR = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"), "../place_names");

const raw = fs.readFileSync(SRC, "utf8");
const lines = raw.split(/\r?\n/).filter((l) => l.length);
const header = lines[0].split("\t");
const idx = (name) => header.indexOf(name);
const iName = idx("name"), iCell = idx("region_cell_code"), iTpl = idx("place_template_id"),
  iStatus = idx("name_status"), iEvidence = idx("evidence_status"), iRationale = idx("rationale");

function csvEsc(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const outHeader = ["tp_id", "name_ru", "object_kind", "node_ref", "name_status", "first_attestation", "source_refs", "confidence"];
const rows = [];
let n = 0;
for (const line of lines.slice(1)) {
  const c = line.split("\t");
  if (!c[iName]) continue;
  n += 1;
  const tp_id = `pn_v6_${String(n).padStart(4, "0")}`;
  const nameStatus = c[iStatus] || "";
  const confidence = nameStatus.includes("attested") ? "A" : nameStatus.includes("fictional_historicized") ? "C" : "B";
  const objectKind = (c[iTpl] || "").replace(/^pt_/, "");
  rows.push([
    tp_id,
    c[iName],
    objectKind,
    c[iCell],
    nameStatus,
    "", // v6 register carries no explicit first_attestation date field
    `game-base:sources.v6-naming-register#${c[iCell]}:${n}`,
    confidence,
  ]);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const csv = [outHeader.join(","), ...rows.map((r) => r.map(csvEsc).join(","))].join("\n") + "\n";
fs.writeFileSync(path.join(OUT_DIR, "place_names.csv"), csv, "utf8");

const statusCounts = {};
for (const r of rows) statusCounts[r[4]] = (statusCounts[r[4]] || 0) + 1;
console.log(`place_names.csv rows: ${rows.length}`);
console.log(`by name_status: ${JSON.stringify(statusCounts)}`);
console.log("NOTE: node_ref here is the v6 region_cell_code (nov_g1_xx_xx), NOT yet a v17 spatial_v3 node id — v17 node mapping is a gap (see README).");
