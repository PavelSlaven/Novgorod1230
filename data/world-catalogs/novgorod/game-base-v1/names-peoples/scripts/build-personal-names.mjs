// Deterministic extraction: personal_names candidate table from the pending
// pr98 onomastics candidate (54 names) + rus13tpl npc_name_pools_v1 (draft pools).
// Read-only sources; writes CSV into ../personal_names/personal_names.csv
import fs from "node:fs";
import path from "node:path";

const RUNTIME = "C:/Users/Slaven/Documents/Novgorod-runtime/data/world-catalogs/novgorod/onomastics/candidates/novgorod-1230-1250-v1/candidate.json";
const NPC_POOLS = "C:/Users/Slaven/Documents/Novgorod-game-base/tools/rus13-novgorod-regional-templates/novgorod_npc_name_pools_v1.json";
const OUT_DIR = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"), "../personal_names");

const candidate = JSON.parse(fs.readFileSync(RUNTIME, "utf8"));
let npcPools = null;
try { npcPools = JSON.parse(fs.readFileSync(NPC_POOLS, "utf8")); } catch { /* optional */ }

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
if (npcPools) {
  for (const [poolName, list] of Object.entries(npcPools.pools_by_id || npcPools.pools || {})) {
    for (const id of (Array.isArray(list) ? list : [])) {
      poolMembership[id] = (poolMembership[id] || []).concat(poolName);
    }
  }
}
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

fs.mkdirSync(OUT_DIR, { recursive: true });
const csv = [header.join(","), ...rows.map((r) => r.map(csvEsc).join(","))].join("\n") + "\n";
fs.writeFileSync(path.join(OUT_DIR, "personal_names.csv"), csv, "utf8");

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
fs.writeFileSync(path.join(OUT_DIR, "coverage-report.json"), JSON.stringify(gapsReport, null, 2), "utf8");

console.log(`personal_names.csv rows: ${rows.length}`);
console.log(`by origin|sex: ${JSON.stringify(bySexPeople)}`);
console.log(`declared candidate gaps (0 pools): ${JSON.stringify(candidate.unapproved_origin_gaps)}`);
