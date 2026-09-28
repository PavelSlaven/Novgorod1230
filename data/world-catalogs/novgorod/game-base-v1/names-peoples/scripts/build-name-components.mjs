import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GROUP_DIR = path.resolve(SCRIPT_DIR, "..");
const NAMES_DIR = path.join(GROUP_DIR, "personal_names");
const SOURCE_PATH = path.join(NAMES_DIR, "name-component-source.json");
const ADDITIONS_PATH = path.join(NAMES_DIR, "name-component-army-additions.json");

const POOL_HEADER = ["pool_id", "component_kind", "region_id", "valid_from", "valid_to", "status"];
const ENTRY_HEADER = ["entry_id", "pool_id", "component_lexeme_id", "component_form", "form_kind", "sex_category", "people_ref", "referent_key", "selector_status", "selection_class", "attested_bearer_class", "social_tendency", "basis", "derivation", "evidence_period", "provenance_ref", "confidence", "status", "note"];
const RULE_HEADER = ["rule_id", "pool_id", "component_kind", "input_pattern", "output_pattern", "sex_category", "people_ref", "selection_class", "social_scope", "basis", "derivation", "provenance_ref", "confidence", "status", "note"];
const LEDGER_HEADER = ["source_key", "source_file", "source_row", "decision", "reason", "target_refs"];

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, header, rows) {
  const lines = [header.join(","), ...rows.map((row) => header.map((key) => csvCell(row[key])).join(","))];
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function provenance(item, source, additions) {
  const snapshotRefs = (item.source_lines ?? []).map((line) => `${source.snapshot.provenance_prefix}${line}`);
  const armyRefs = (item.army_source_keys ?? []).map((key) => `${additions.army_snapshot.provenance_prefix}${key}`);
  return [...snapshotRefs, ...armyRefs, ...(item.direct_source_refs ?? [])].join("; ");
}

function enrichEntry(entry, additions) {
  entry = { ...entry, ...(additions.entry_overrides?.[entry.entry_id] ?? {}) };
  const gap = entry.selector_status === "gap";
  return {
    component_lexeme_id: entry.component_lexeme_id ?? entry.entry_id,
    form_kind: entry.form_kind ?? "male_singular",
    referent_key: entry.referent_key ?? entry.people_ref,
    selector_status: entry.selector_status ?? (entry.people_ref ? "resolved" : "gap"),
    social_tendency: entry.social_tendency ?? `${entry.attested_bearer_class ?? "unresolved"}_attested_not_exclusive`,
    ...entry,
    people_ref: gap ? "" : entry.people_ref,
  };
}

function rejectionReason(row) {
  if (row.fact_type !== "name_form") return "reviewer_requested_people_domain_no_component";
  if (!row.source_file.startsWith("x-people")) return "non_personal_name_form";
  return "screened_no_supported_component";
}

function normalizeHistoricalOrthography(text) {
  return String(text).toLocaleLowerCase("ru").replaceAll("ё", "е").replaceAll("ц", "ч").replace(/[ъь](?=$|[^\\p{L}])/gu, "");
}

function hasWholeForm(text, form) {
  const normalizedText = normalizeHistoricalOrthography(text);
  const normalizedForm = normalizeHistoricalOrthography(form);
  const escaped = normalizedForm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "u").test(normalizedText);
}

function exactDuplicateTargets(row, entries, ignoredPairs = new Set()) {
  const text = `${row.value ?? ""} ${row.quote ?? ""}`;
  return entries.filter((entry) => hasWholeForm(text, entry.component_form) && !ignoredPairs.has(`${row.source_key}|${entry.entry_id}`)).map((entry) => entry.entry_id).sort();
}

export function build() {
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const additions = JSON.parse(fs.readFileSync(ADDITIONS_PATH, "utf8"));
  const pools = [...source.pools].sort((a, b) => a.pool_id.localeCompare(b.pool_id, "en"));
  const excludedEntryIds = new Set(additions.excluded_entry_ids ?? []);
  const authoredEntries = [...source.entries, ...additions.entries].filter((entry) => !excludedEntryIds.has(entry.entry_id));
  const authoredRules = [...source.rules, ...additions.rules];
  const entries = authoredEntries.map((entry) => enrichEntry(entry, additions)).map((entry) => ({ ...entry, provenance_ref: provenance(entry, source, additions), status: "candidate" }))
    .sort((a, b) => a.entry_id.localeCompare(b.entry_id, "en"));
  const rules = authoredRules.map((rule) => ({ ...rule, provenance_ref: provenance(rule, source, additions) }))
    .sort((a, b) => a.rule_id.localeCompare(b.rule_id, "en"));

  writeCsv(path.join(NAMES_DIR, "name_component_pools.csv"), POOL_HEADER, pools);
  writeCsv(path.join(NAMES_DIR, "name_component_entries.csv"), ENTRY_HEADER, entries);
  writeCsv(path.join(NAMES_DIR, "name_component_rules.csv"), RULE_HEADER, rules);

  const armyRows = fs.readFileSync(path.join(GROUP_DIR, additions.army_snapshot.path), "utf8").trimEnd().split(/\r?\n/);
  const armyHeader = armyRows[0].split(",");
  const sourceKeyIndex = armyHeader.indexOf("source_key");
  const sourceFileIndex = armyHeader.indexOf("source_file");
  const sourceRowIndex = armyHeader.indexOf("source_row");
  const armyIndex = Object.fromEntries(armyHeader.map((key, index) => [key, index]));
  const parseKeyCells = (line) => {
    const cells = []; let cell = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (quoted && line[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; } else if (ch === "," && !quoted) { cells.push(cell); cell = ""; } else cell += ch; }
    cells.push(cell); return cells;
  };
  const targetsBySource = new Map();
  for (const item of [...authoredEntries, ...authoredRules]) for (const key of item.army_source_keys ?? []) {
    const targets = targetsBySource.get(key) ?? [];
    targets.push(item.entry_id ?? item.rule_id); targetsBySource.set(key, targets);
  }
  const evidenceLinksBySource = new Map((additions.army_evidence_links ?? []).map((link) => [link.source_key, link]));
  const ignoredDuplicatePairs = new Set((additions.army_duplicate_scan_ignored_pairs ?? []).map((pair) => `${pair.source_key}|${pair.target_ref}`));
  const ledger = armyRows.slice(1).map((line) => {
    const cells = parseKeyCells(line); const key = cells[sourceKeyIndex]; const targets = targetsBySource.get(key) ?? [];
    const row = { source_key: key, source_file: cells[sourceFileIndex], source_row: cells[sourceRowIndex] };
    const exactTargets = exactDuplicateTargets({ source_key: key, value: cells[armyIndex.value], quote: cells[armyIndex.quote] }, entries, ignoredDuplicatePairs);
    if (targets.length) return { ...row, decision: "include", reason: "supports_name_component", target_refs: [...new Set([...targets, ...exactTargets])].sort().join("; ") };
    const evidenceLink = evidenceLinksBySource.get(key);
    const duplicateTargets = [...new Set([...(evidenceLink?.target_refs ?? []), ...exactTargets])].sort();
    if (duplicateTargets.length) return { ...row, decision: "reject", reason: "duplicate_of_included_form", target_refs: duplicateTargets.join("; ") };
    return { ...row, decision: "reject", reason: rejectionReason({ source_file: row.source_file, fact_type: cells[armyIndex.fact_type] }), target_refs: "" };
  });
  writeCsv(path.join(NAMES_DIR, "name_component_candidate_decisions.csv"), LEDGER_HEADER, ledger);

  const byKind = {};
  for (const pool of pools) byKind[pool.component_kind] = (byKind[pool.component_kind] ?? 0) + entries.filter((entry) => entry.pool_id === pool.pool_id).length;
  const byBasis = {};
  for (const item of [...entries, ...rules]) byBasis[item.basis] = (byBasis[item.basis] ?? 0) + 1;
  const bySelectionClass = {};
  for (const entry of entries) bySelectionClass[entry.selection_class] = (bySelectionClass[entry.selection_class] ?? 0) + 1;
  const byKindAndSelectionClass = {};
  for (const pool of pools) {
    const kindEntries = entries.filter((entry) => entry.pool_id === pool.pool_id);
    byKindAndSelectionClass[pool.component_kind] = Object.fromEntries([...new Set(kindEntries.map((entry) => entry.selection_class))].sort().map((selectionClass) => [selectionClass, kindEntries.filter((entry) => entry.selection_class === selectionClass).length]));
  }
  const report = {
    schema: source.schema,
    status: source.status,
    generated_by: "names-peoples/scripts/build-name-components.mjs",
    counts: { pools: pools.length, entries: entries.length, rules: rules.length, by_component_kind: byKind, by_selection_class: bySelectionClass, by_component_kind_and_selection_class: byKindAndSelectionClass, by_basis: byBasis },
    army_screening: {
      all_extract_rows_scanned: additions.army_review.all_extract_rows_scanned,
      exact_name_form_rows: additions.army_review.exact_name_form_rows,
      reviewer_requested_people_domain_rows: additions.army_review.reviewer_requested_people_domain_rows,
      snapshot_rows: ledger.length,
      included_rows: ledger.filter((row) => row.decision === "include").length,
      rejected_rows: ledger.filter((row) => row.decision === "reject").length,
      rejection_reasons: Object.fromEntries([...new Set(ledger.filter((row) => row.decision === "reject").map((row) => row.reason))].sort().map((reason) => [reason, ledger.filter((row) => row.reason === reason).length])),
      master_archive_candidates: additions.master_archive_review.candidates,
      semantic_rescreen: additions.semantic_rescreen,
      scope_note: "Ledger validates the checked-in 1,059-row candidate snapshot; upstream screening totals are preparation-process metadata.",
    },
    typed_gaps: source.typed_gaps,
  };
  fs.writeFileSync(path.join(NAMES_DIR, "name-component-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.counts));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();

export { ENTRY_HEADER, LEDGER_HEADER, POOL_HEADER, RULE_HEADER, exactDuplicateTargets, normalizeHistoricalOrthography };
