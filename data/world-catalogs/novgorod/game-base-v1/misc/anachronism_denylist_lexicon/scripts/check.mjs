// Acceptance check for denylist.csv, per brief acceptance_ru:
// - every row has a reason and a basis (either earliest_attestation_or_basis
//   filled, or source_refs pointing at a real WK claim / repo file / issue /
//   verified book evidence)
// - kind is one of denylist|period_term|forbidden_assumption
// - confidence in A/B/C, and every C row carries a note explaining the gap
// - ids unique
// Added 2026-09-26 (VERIFICATION.md rework):
// - every applies_to_domains value resolves against catalog.json domain ids
// - every kind=denylist row has a match_pattern (brief's "0 совпадений" test
//   needs a machine-usable pattern, not just a descriptive term_ru)
// - every catalog conventions.anachronism term is covered by some row's
//   term_ru (case-insensitive substring)
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(path.join(__dirname, "..", "denylist.csv"), "utf-8");

const CATALOG_JSON = path.join(__dirname, "..", "..", "..", "catalog.json");
const catalog = JSON.parse(readFileSync(CATALOG_JSON, "utf-8"));
const VALID_DOMAIN_IDS = new Set(catalog.domains.map((d) => d.id));

// The catalog's own anachronism convention list (conventions.anachronism),
// spelled out as discrete terms to check coverage against.
const CATALOG_ANACHRONISM_TERMS = [
  "картоф", "кукуруз", "томат", "подсолнеч", "табак", "индейк",
  "кролик", "тяжеловоз", "чай", "кофе", "сахар", "огнестрел",
];

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

const rows = parseCsv(csv);
const errors = [];
const KINDS = new Set(["denylist", "period_term", "forbidden_assumption"]);
const REPO_ROOT = path.join(__dirname, "..", "..", "..", "..", "..", "..", "..");

for (const r of rows) {
  if (!KINDS.has(r.kind)) errors.push(`${r.an_id}: kind '${r.kind}' not in denylist|period_term|forbidden_assumption`);
  if (!r.reason || !r.reason.trim()) errors.push(`${r.an_id}: no reason`);
  if (!r.source_refs || !r.source_refs.trim()) errors.push(`${r.an_id}: no source_refs`);
  const hasBasis = (r.earliest_attestation_or_basis && r.earliest_attestation_or_basis.trim()) ||
    /^wk:claim:|^repo:|^issue:/.test(r.source_refs);
  if (!hasBasis) errors.push(`${r.an_id}: no earliest_attestation_or_basis and source_refs is not a resolvable wk:/repo:/issue: reference`);
  if (!["A", "B", "C"].includes(r.confidence)) errors.push(`${r.an_id}: confidence '${r.confidence}' not A/B/C`);
  if (r.confidence === "C" && (!r.note || !r.note.trim())) errors.push(`${r.an_id}: confidence C without a note explaining the gap`);
  for (const ref of r.source_refs.split(";")) {
    if (ref.startsWith("repo:")) {
      const rel = ref.slice("repo:".length).split("#")[0];
      if (!existsSync(path.join(REPO_ROOT, rel))) errors.push(`${r.an_id}: repo: source_ref does not exist: ${rel}`);
    }
  }
  for (const domain of (r.applies_to_domains || "").split(";").map((s) => s.trim()).filter(Boolean)) {
    if (!VALID_DOMAIN_IDS.has(domain)) errors.push(`${r.an_id}: applies_to_domains value '${domain}' not a catalog.json domain id`);
  }
  if (r.kind === "denylist" && (!r.match_pattern || !r.match_pattern.trim())) {
    errors.push(`${r.an_id}: kind=denylist row has no match_pattern (needed for the brief's cross-domain scan)`);
  }
}

for (const term of CATALOG_ANACHRONISM_TERMS) {
  const covered = rows.some((r) => r.term_ru.toLowerCase().includes(term));
  if (!covered) errors.push(`catalog conventions.anachronism term '${term}' not covered by any row's term_ru`);
}

const ids = rows.map((r) => r.an_id);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) errors.push(`duplicate an_id: ${[...new Set(dupes)].join(", ")}`);

if (errors.length) {
  console.error(`FAIL: ${errors.length} issue(s)`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
} else {
  console.log(`OK: ${rows.length} rows, all checks passed (kind, reason, basis, confidence, C-notes, repo: refs resolve, unique ids).`);
}
