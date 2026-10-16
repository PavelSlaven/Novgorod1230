// Deterministic extraction: personal_names candidate table from the pending
// pr98 onomastics candidate (54 names) + rus13tpl npc_name_pools_v1 (draft pools).
// Read-only sources; writes CSV into ../personal_names/personal_names.csv
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../../../../../");
const RUNTIME = path.resolve(REPO_ROOT, "data/world-catalogs/novgorod/onomastics/candidates/novgorod-1230-1250-v1/candidate.json");
const OUT_DIR = path.resolve(SCRIPT_DIR, "../personal_names");
const CHECK_ONLY = process.argv.includes("--check");

const candidate = JSON.parse(fs.readFileSync(RUNTIME, "utf8"));

function csvEsc(v) {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const header = [
  "nm_id", "name_form", "sex", "people_ref", "status_band", "name_kind",
  "frequency_class", "variants", "attestation", "source_refs", "confidence",
];

const rows = [];
const poolMembership = {};
// candidate.json also carries a `pools` map with the same shape
for (const [poolName, list] of Object.entries(candidate.pools || {})) {
  for (const id of list) poolMembership[id] = (poolMembership[id] || []).concat(poolName);
}

for (const n of candidate.names) {
  const evidenceGrade = n.evidence_grade || "";
  const confidence = evidenceGrade.startsWith("A") ? "A" : evidenceGrade.startsWith("B") ? "B" : "C";
  const attestation = (n.evidence || [])
    .map((e) => `${e.document || ""} ${e.page_or_record || ""} ${e.section || ""}`.trim())
    .join(" | ");
  const sourceRefs = (n.evidence || []).map((e) => `pr98:onomastics/${e.source_id}#${e.record_id}`).join(" | ");
  rows.push([
    n.name_id,
    n.canonical_tradition,
    n.sex,
    n.origin || "novgorod_rus",
    n.special_state || "common",
    "baptismal_or_vernacular", // candidate.json does not split baptismal/vernacular explicitly
    (poolMembership[n.name_id] || []).join("|") || "unassigned",
    (n.variants || []).join("|"),
    attestation,
    sourceRefs || `pr98:onomastics/candidates/novgorod-1230-1250-v1#${n.name_id}`,
    confidence,
  ]);
}

const csv = [header.join(","), ...rows.map((r) => r.map(csvEsc).join(","))].join("\n") + "\n";
const namesPath = path.join(OUT_DIR, "personal_names.csv");
if (CHECK_ONLY) {
  if (!fs.existsSync(namesPath) || fs.readFileSync(namesPath, "utf8") !== csv) {
    console.error("personal_names.csv is stale; run without --check to rebuild");
    process.exitCode = 1;
  }
} else {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(namesPath, csv, "utf8");
}

// Gap report: peoples with <10 male/<10 female names in the candidate pool.
const bySexPeople = {};
for (const n of candidate.names) {
  const key = `${n.origin || "novgorod_rus"}|${n.sex}`;
  bySexPeople[key] = (bySexPeople[key] || 0) + 1;
}
const gapsReport = {
  status_source: candidate.status,
  import_enabled: candidate.import_enabled,
  total_names: candidate.names.length,
  by_origin_sex: bySexPeople,
  declared_gaps_in_candidate: candidate.unapproved_origin_gaps || [],
  excluded_pending_review: (candidate.excluded || []).map((e) => ({ name_id: e.name_id, canonical_tradition: e.canonical_tradition, status: e.status, reason: e.limits })),
};
const coveragePath = path.join(OUT_DIR, "coverage-report.json");
const coverage = JSON.stringify(gapsReport, null, 2);
if (CHECK_ONLY) {
  if (!fs.existsSync(coveragePath) || fs.readFileSync(coveragePath, "utf8") !== coverage) {
    console.error("coverage-report.json is stale; run without --check to rebuild");
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(coveragePath, coverage, "utf8");
}

console.log(`personal_names.csv rows: ${rows.length}`);
console.log(`by origin|sex: ${JSON.stringify(bySexPeople)}`);
console.log(`declared candidate gaps (0 pools): ${JSON.stringify(candidate.unapproved_origin_gaps)}`);
