import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./build-b2-name-pool.mjs";
import { ENTRY_HEADER, LEDGER_HEADER, POOL_HEADER, RULE_HEADER, exactDuplicateTargets, normalizeHistoricalOrthography } from "./build-name-components.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GROUP_DIR = path.resolve(SCRIPT_DIR, "..");
const NAMES_DIR = path.join(GROUP_DIR, "personal_names");
const rows = (file) => parseCsv(fs.readFileSync(file, "utf8"));
const header = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/, 1)[0].split(",");
const same = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);
const digest = (text) => crypto.createHash("sha256").update(text).digest("hex");
const princelyPatronymicIds = new Set(["nce_pat_mstislavich", "nce_pat_jaroslavich", "nce_pat_vsevolodovich", "nce_pat_vsevolodich", "nce_pat_svjatoslavich", "nce_pat_izjaslavich", "nce_pat_rostislavich", "nce_pat_olgovich", "nce_pat_olegovich", "nce_pat_volodarevich", "nce_pat_ingvarevich", "nce_pat_vladimirovich"]);

function evidenceContainsForm(text, form) {
  const normalizedText = normalizeHistoricalOrthography(text);
  const normalizedForm = normalizeHistoricalOrthography(form);
  const escaped = normalizedForm.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${escaped}`, "u").test(normalizedText);
}

function expectedProvenance(item, source, additions) {
  return [...(item.source_lines ?? []).map((line) => `${source.snapshot.provenance_prefix}${line}`), ...(item.army_source_keys ?? []).map((key) => `${additions.army_snapshot.provenance_prefix}${key}`), ...(item.direct_source_refs ?? [])].join("; ");
}

export function validate(data) {
  const { pools, entries, rules, people, evidence, source, additions, d46, army, armyRaw, directEvidence, directEvidenceRaw, ledger, report, poolHeader, entryHeader, ruleHeader, ledgerHeader } = data;
  const errors = [];
  if (!same(poolHeader, POOL_HEADER)) errors.push("wrong pool header");
  if (!same(entryHeader, ENTRY_HEADER)) errors.push("wrong entry header");
  if (!same(ruleHeader, RULE_HEADER)) errors.push("wrong rule header");
  if (!same(ledgerHeader, LEDGER_HEADER)) errors.push("wrong ledger header");
  const poolIds = new Set(pools.map((row) => row.pool_id));
  const poolKinds = new Map(pools.map((row) => [row.pool_id, row.component_kind]));
  if (poolIds.size !== pools.length) errors.push("duplicate pool id");
  if (!["patronymic", "nickname", "demonym"].every((kind) => pools.some((row) => row.component_kind === kind))) errors.push("component pool kinds incomplete");
  for (const pool of pools) if (pool.region_id !== "region_novgorod_land" || pool.status !== "draft" || pool.valid_from > pool.valid_to) errors.push(`invalid pool ${pool.pool_id}`);

  const evidenceByLine = new Map(evidence.map((row) => [Number(row.source_line?.slice(1)), row]));
  if (evidenceByLine.size !== evidence.length || evidence.length !== source.snapshot.expected_rows) errors.push("invalid original evidence snapshot");
  const authoredOriginalLines = new Set([...source.entries, ...source.rules].flatMap((item) => item.source_lines ?? []));
  if (authoredOriginalLines.size !== evidenceByLine.size || [...authoredOriginalLines].some((line) => !evidenceByLine.has(line))) errors.push("original evidence snapshot does not exactly match authored source lines");

  const armyByKey = new Map(army.map((row) => [row.source_key, row]));
  if (army.length !== additions.army_snapshot.expected_rows || armyByKey.size !== army.length) errors.push("invalid army snapshot rows");
  if (digest(armyRaw) !== additions.army_snapshot.sha256) errors.push("army snapshot digest mismatch");
  const directEvidenceByRef = new Map(directEvidence.map((row) => [row.source_ref, row]));
  if (directEvidence.length !== additions.direct_evidence_snapshot.expected_rows || directEvidenceByRef.size !== directEvidence.length) errors.push("invalid direct evidence snapshot rows");
  for (const row of directEvidence) if (row.source_ref !== `book:${row.book_id} §${row.para_no}` || !row.text_excerpt) errors.push(`invalid direct evidence row ${row.source_ref}`);
  if (digest(directEvidenceRaw) !== additions.direct_evidence_snapshot.sha256) errors.push("direct evidence snapshot digest mismatch");
  if (!/^[0-9a-f]{64}$/.test(additions.direct_evidence_snapshot.source_index_sha256 ?? "")) errors.push("direct evidence source fingerprint missing");
  const excludedEntryIds = new Set(additions.excluded_entry_ids ?? []);
  const activeAuthoredEntries = [...source.entries, ...additions.entries, ...d46.component_entries.map((entry) => ({ ...entry, basis: "source_attested_form" }))].filter((entry) => !excludedEntryIds.has(entry.entry_id));
  const authoredItems = [...activeAuthoredEntries, ...source.rules, ...additions.rules];
  const authoredBookRefs = new Set(authoredItems.flatMap((item) => item.direct_source_refs ?? []).filter((ref) => ref.startsWith("book:")));
  if (authoredBookRefs.size !== directEvidenceByRef.size || [...authoredBookRefs].some((ref) => !directEvidenceByRef.has(ref))) errors.push("direct evidence snapshot does not exactly match authored book refs");
  const authoredById = new Map(authoredItems.map((item) => [item.entry_id ?? item.rule_id, item]));
  const generatedById = new Map([...entries.map((row) => [row.entry_id, row]), ...rules.map((row) => [row.rule_id, row])]);
  const supportTexts = (authored) => {
    const sourceTexts = (authored.source_lines ?? []).map((line) => Object.values(evidenceByLine.get(line) ?? {}).join(" "));
    const armyTexts = (authored.army_source_keys ?? []).map((key) => Object.values(armyByKey.get(key) ?? {}).join(" "));
    const bookRefs = (authored.direct_source_refs ?? []).filter((ref) => ref.startsWith("book:"));
    const missingRefs = bookRefs.filter((ref) => !directEvidenceByRef.has(ref));
    const directTexts = bookRefs.map((ref) => directEvidenceByRef.get(ref)?.text_excerpt ?? "");
    return { text: [...sourceTexts, ...armyTexts, ...directTexts, ...(authored.support_texts ?? [])].join(" "), missingRefs };
  };
  const evidenceLinksBySource = new Map();
  for (const link of additions.army_evidence_links ?? []) {
    if (evidenceLinksBySource.has(link.source_key)) errors.push(`duplicate army evidence link ${link.source_key}`);
    evidenceLinksBySource.set(link.source_key, link);
    if (!armyByKey.has(link.source_key) || link.reason !== "duplicate_of_included_form" || !link.target_refs?.length || link.target_refs.some((target) => !generatedById.has(target))) errors.push(`invalid army evidence link ${link.source_key}`);
  }
  const ignoredDuplicatePairs = new Set();
  for (const pair of additions.army_duplicate_scan_ignored_pairs ?? []) {
    const key = `${pair.source_key}|${pair.target_ref}`;
    if (ignoredDuplicatePairs.has(key)) errors.push(`duplicate ignored pair ${key}`);
    ignoredDuplicatePairs.add(key);
    const armyRow = armyByKey.get(pair.source_key); const entry = generatedById.get(pair.target_ref);
    if (!armyRow || !entry || !pair.reason || !exactDuplicateTargets(armyRow, [entry]).length) errors.push(`invalid ignored duplicate pair ${key}`);
  }
  const peopleIds = new Set(people.filter((row) => ["people", "guest_itinerant"].includes(row.entity_kind)).map((row) => row.pp_id));
  const entryIds = new Set(), entryKeys = new Set();
  const allowedTendencies = new Set(["elite_attested_not_exclusive", "ordinary_attested_not_exclusive", "monastic_attested_not_exclusive", "unresolved_attested_not_exclusive"]);
  for (const entry of entries) {
    if (entryIds.has(entry.entry_id)) errors.push(`duplicate entry id ${entry.entry_id}`); entryIds.add(entry.entry_id);
    const key = [entry.pool_id, entry.component_form, entry.form_kind, entry.referent_key].join("|").toLocaleLowerCase("ru");
    if (entryKeys.has(key)) errors.push(`duplicate entry key ${key}`); entryKeys.add(key);
    if (!poolIds.has(entry.pool_id)) errors.push(`${entry.entry_id}: unknown pool`);
    if (!entry.component_form || !entry.component_lexeme_id || !["male_singular", "plural", "collective"].includes(entry.form_kind) || !entry.referent_key) errors.push(`${entry.entry_id}: invalid form metadata`);
    if ((entry.form_kind === "male_singular") !== (entry.sex_category === "male")) errors.push(`${entry.entry_id}: sex/form mismatch`);
    if (entry.form_kind !== "male_singular" && entry.sex_category !== "not_applicable") errors.push(`${entry.entry_id}: plural/collective must be not_applicable`);
    if (entry.selector_status === "resolved" && (!entry.people_ref || !peopleIds.has(entry.people_ref))) errors.push(`${entry.entry_id}: invalid resolved selector`);
    if (entry.selector_status === "gap" && entry.people_ref) errors.push(`${entry.entry_id}: selector gap must not fake people_ref`);
    if (!["resolved", "gap"].includes(entry.selector_status)) errors.push(`${entry.entry_id}: invalid selector status`);
    if (!["ordinary", "dynastic", "significant"].includes(entry.selection_class) || !allowedTendencies.has(entry.social_tendency)) errors.push(`${entry.entry_id}: invalid class/tendency`);
    if (!["source_attested_form", "logical_necessity"].includes(entry.basis)) errors.push(`${entry.entry_id}: invalid basis`);
    if (!["c1230", "medieval_general", "late_medieval"].includes(entry.evidence_period) || !["A", "B", "C"].includes(entry.confidence) || entry.status !== "candidate") errors.push(`${entry.entry_id}: invalid evidence metadata`);
    const authored = authoredById.get(entry.entry_id);
    const expected = authored ? { ...authored, ...(additions.entry_overrides?.[entry.entry_id] ?? {}) } : null;
    if (!authored || entry.provenance_ref !== expectedProvenance(authored, source, additions) || ["selection_class", "basis", "evidence_period", "component_form"].some((field) => String(entry[field]) !== String(expected[field]))) errors.push(`${entry.entry_id}: authored projection mismatch`);
    if (!entry.provenance_ref) errors.push(`${entry.entry_id}: missing provenance`);
    if (princelyPatronymicIds.has(entry.entry_id) && entry.selection_class !== "dynastic") errors.push(`${entry.entry_id}: princely patronymic must be dynastic`);
    if (expected?.basis === "source_attested_form") {
      const { text, missingRefs } = supportTexts(authored);
      if (missingRefs.length) errors.push(`${entry.entry_id}: unresolved direct evidence ${missingRefs.join(", ")}`);
      if (!evidenceContainsForm(text, entry.component_form)) errors.push(`${entry.entry_id}: attested form absent from support`);
    }
  }

  const allowedScopes = new Set(["unrestricted", "elite_attested_not_exclusive", "ordinary_attested_not_exclusive", "mixed_attested_not_exclusive", "unresolved_not_exclusive", "ordinary_claim_unverified"]);
  const ruleIds = new Set();
  for (const rule of rules) {
    if (ruleIds.has(rule.rule_id)) errors.push(`duplicate rule id ${rule.rule_id}`); ruleIds.add(rule.rule_id);
    if (!poolIds.has(rule.pool_id) || poolKinds.get(rule.pool_id) !== rule.component_kind) errors.push(`${rule.rule_id}: pool/rule kind mismatch`);
    if (!rule.input_pattern || !rule.output_pattern || rule.sex_category !== "male" || !peopleIds.has(rule.people_ref) || rule.selection_class !== "ordinary") errors.push(`${rule.rule_id}: invalid selector`);
    if (!allowedScopes.has(rule.social_scope)) errors.push(`${rule.rule_id}: hard or unknown social scope`);
    if (!["source_attested_form", "logical_necessity", "no_source"].includes(rule.basis) || !["candidate", "gap"].includes(rule.status)) errors.push(`${rule.rule_id}: invalid basis/status`);
    if ((rule.status === "gap") !== (rule.basis === "no_source")) errors.push(`${rule.rule_id}: gap must be no_source and no_source must be gap`);
    const authored = authoredById.get(rule.rule_id);
    if (!authored || rule.provenance_ref !== expectedProvenance(authored, source, additions)) errors.push(`${rule.rule_id}: provenance projection mismatch`);
    if (!rule.provenance_ref || !["A", "B", "C"].includes(rule.confidence)) errors.push(`${rule.rule_id}: missing provenance/confidence`);
    if (authored?.basis === "source_attested_form") {
      const forms = authored.attested_surface_forms ?? [];
      const { text, missingRefs } = supportTexts(authored);
      if (!forms.length) errors.push(`${rule.rule_id}: attested rule has no surface forms`);
      if (missingRefs.length) errors.push(`${rule.rule_id}: unresolved direct evidence ${missingRefs.join(", ")}`);
      for (const form of forms) if (!evidenceContainsForm(text, form)) errors.push(`${rule.rule_id}: attested rule form absent from support: ${form}`);
    }
  }
  if (!rules.some((rule) => rule.rule_id === "ncr_pat_name_son_parent" && rule.status === "candidate" && rule.basis === "source_attested_form")) errors.push("attested name-son-parent rule missing");
  if (rules.some((rule) => rule.rule_id === "ncr_pat_simple_son_x_gap")) errors.push("obsolete son gap still present");

  const ledgerByKey = new Map();
  for (const decision of ledger) {
    if (ledgerByKey.has(decision.source_key)) errors.push(`duplicate ledger decision ${decision.source_key}`);
    ledgerByKey.set(decision.source_key, decision);
    if (!armyByKey.has(decision.source_key)) errors.push(`orphan ledger decision ${decision.source_key}`);
    if (!decision.reason || !["include", "reject"].includes(decision.decision)) errors.push(`${decision.source_key}: incomplete ledger decision`);
    const targets = decision.target_refs ? decision.target_refs.split("; ") : [];
    const evidenceLink = evidenceLinksBySource.get(decision.source_key);
    const exactTargets = exactDuplicateTargets(armyByKey.get(decision.source_key) ?? {}, entries, ignoredDuplicatePairs);
    if (decision.decision === "include" && (!targets.length || targets.some((target) => !generatedById.has(target)) || exactTargets.some((target) => !targets.includes(target)))) errors.push(`${decision.source_key}: included row without complete valid targets`);
    const expectedDuplicateTargets = [...new Set([...(evidenceLink?.target_refs ?? []), ...exactTargets])].sort();
    if (decision.decision === "reject" && targets.length && (decision.reason !== "duplicate_of_included_form" || targets.join("; ") !== expectedDuplicateTargets.join("; "))) errors.push(`${decision.source_key}: rejected row has invalid targets`);
    if (decision.decision === "reject" && !targets.length && (evidenceLink || exactTargets.length)) errors.push(`${decision.source_key}: linked duplicate missing targets`);
    for (const target of targets) if (decision.decision === "include" && !(authoredById.get(target)?.army_source_keys ?? []).includes(decision.source_key) && !exactTargets.includes(target)) errors.push(`${decision.source_key}: target does not cite or exactly match source row`);
  }
  if (ledger.length !== army.length || army.some((row) => !ledgerByKey.has(row.source_key))) errors.push("ledger does not cover army snapshot exactly once");

  const semantic = additions.semantic_rescreen ?? {};
  const reviewedRows = (semantic.reviewed_ranges ?? []).reduce((sum, range) => sum + Number(range.rows ?? 0), 0);
  const returnedRows = semantic.returned_source_rows ?? [];
  const returnedRowSet = new Set(returnedRows);
  const returnedTargets = new Set(returnedRows.flatMap((key) => (ledgerByKey.get(key)?.target_refs ?? "").split("; ").filter(Boolean)));
  const noComponentRows = ledger.filter((row) => row.reason === "screened_no_supported_component" || row.reason === "reviewer_requested_people_domain_no_component").length;
  if (reviewedRows !== semantic.prior_rejection_rows) errors.push("semantic rescreen range count mismatch");
  if (returnedRowSet.size !== returnedRows.length || returnedRows.some((key) => ledgerByKey.get(key)?.decision !== "include")) errors.push("semantic rescreen returned rows mismatch");
  if (returnedTargets.size !== semantic.returned_components) errors.push("semantic rescreen returned components mismatch");
  if (semantic.remaining_reviewed_rows !== semantic.prior_rejection_rows - returnedRows.length) errors.push("semantic rescreen remaining rows mismatch");
  if (semantic.remaining_no_component_rows !== noComponentRows) errors.push("semantic rescreen no-component count mismatch");
  if (semantic.remaining_reviewed_rows !== semantic.remaining_no_component_rows + semantic.reclassified_duplicate_rows) errors.push("semantic rescreen duplicate count mismatch");

  const expectedByKind = {};
  for (const pool of pools) expectedByKind[pool.component_kind] = (expectedByKind[pool.component_kind] ?? 0) + entries.filter((entry) => entry.pool_id === pool.pool_id).length;
  const expectedByClass = Object.fromEntries(["ordinary", "dynastic", "significant"].map((value) => [value, entries.filter((entry) => entry.selection_class === value).length]).filter(([, count]) => count));
  const expectedByKindAndClass = Object.fromEntries(pools.map((pool) => [pool.component_kind, Object.fromEntries(["dynastic", "ordinary", "significant"].map((value) => [value, entries.filter((entry) => entry.pool_id === pool.pool_id && entry.selection_class === value).length]).filter(([, count]) => count))]));
  if (report.counts.pools !== pools.length || report.counts.entries !== entries.length || report.counts.rules !== rules.length || JSON.stringify(report.counts.by_component_kind) !== JSON.stringify(expectedByKind) || Object.entries(expectedByClass).some(([key, count]) => report.counts.by_selection_class?.[key] !== count) || Object.keys(report.counts.by_selection_class ?? {}).length !== Object.keys(expectedByClass).length || JSON.stringify(report.counts.by_component_kind_and_selection_class) !== JSON.stringify(expectedByKindAndClass)) errors.push("report counts mismatch");
  if (report.army_screening.snapshot_rows !== army.length || report.army_screening.included_rows !== ledger.filter((row) => row.decision === "include").length || report.army_screening.rejected_rows !== ledger.filter((row) => row.decision === "reject").length || report.army_screening.semantic_rescreen?.prior_rejection_rows !== additions.semantic_rescreen.prior_rejection_rows) errors.push("army report mismatch");
  const d46Accounting = report.d46_archive_accounting;
  const archiveVariants = d46.name_variants.filter((row) => row.classification === "archive_variant");
  const reclassifiedVariants = d46.name_variants.filter((row) => row.classification !== "archive_variant");
  if (d46.component_entries.length !== 13 || d46.component_updates.length !== 5 || d46Accounting?.included_component_entries !== d46.component_entries.length || d46Accounting?.existing_component_updates !== d46.component_updates.length || d46Accounting?.archive_variants !== archiveVariants.length || d46Accounting?.reclassified_candidate_variants !== reclassifiedVariants.length || d46Accounting?.variants !== d46.name_variants.length || d46Accounting?.typed_name_gaps !== d46.name_gaps.length || d46Accounting?.rejected !== 0 || d46.rejected.length) errors.push("D46 component accounting drift");
  const d46ComponentIds = new Set(d46.component_entries.map((item) => item.entry_id));
  const existingNormalizedComponents = new Set(entries.filter((entry) => !d46ComponentIds.has(entry.entry_id)).map((entry) => normalizeHistoricalOrthography(entry.component_form).normalize("NFC").trim()));
  for (const item of d46.component_entries) {
    if (!item.archive_refs?.length || item.basis !== "sourced" || !item.support_texts?.some((text) => evidenceContainsForm(text, item.component_form))) errors.push(`${item.entry_id}: incomplete D46 component evidence`);
    if (existingNormalizedComponents.has(normalizeHistoricalOrthography(item.component_form).normalize("NFC").trim())) errors.push(`${item.entry_id}: normalized D46 component duplicates existing entry`);
  }
  for (const update of d46.component_updates) {
    const target = update.target_ref?.split("#").at(-1);
    if (!target || !generatedById.has(target) || !update.archive_refs?.length) errors.push(`${update.archive_name}: invalid D46 component update`);
  }
  if (!source.typed_gaps.some((gap) => gap.gap_id === "gap_name_components_runtime_import")) errors.push("runtime import gap missing");
  return errors;
}

export function selectOrdinary(entries) {
  return entries.filter((entry) => entry.selection_class === "ordinary");
}

function load() {
  const source = JSON.parse(fs.readFileSync(path.join(NAMES_DIR, "name-component-source.json"), "utf8"));
  const additions = JSON.parse(fs.readFileSync(path.join(NAMES_DIR, "name-component-army-additions.json"), "utf8"));
  const d46 = JSON.parse(fs.readFileSync(path.join(NAMES_DIR, "d46-name-additions.json"), "utf8"));
  const armyPath = path.join(GROUP_DIR, additions.army_snapshot.path);
  const directEvidencePath = path.join(GROUP_DIR, additions.direct_evidence_snapshot.path);
  return {
    pools: rows(path.join(NAMES_DIR, "name_component_pools.csv")), entries: rows(path.join(NAMES_DIR, "name_component_entries.csv")), rules: rows(path.join(NAMES_DIR, "name_component_rules.csv")), people: rows(path.join(GROUP_DIR, "peoples_origins", "peoples_origins.csv")), evidence: rows(path.join(GROUP_DIR, source.snapshot.path)), source, additions,
    d46, army: rows(armyPath), armyRaw: fs.readFileSync(armyPath), directEvidence: rows(directEvidencePath), directEvidenceRaw: fs.readFileSync(directEvidencePath), ledger: rows(path.join(NAMES_DIR, "name_component_candidate_decisions.csv")), report: JSON.parse(fs.readFileSync(path.join(NAMES_DIR, "name-component-report.json"), "utf8")),
    poolHeader: header(path.join(NAMES_DIR, "name_component_pools.csv")), entryHeader: header(path.join(NAMES_DIR, "name_component_entries.csv")), ruleHeader: header(path.join(NAMES_DIR, "name_component_rules.csv")), ledgerHeader: header(path.join(NAMES_DIR, "name_component_candidate_decisions.csv")),
  };
}

const data = load();
const errors = validate(data);
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
if (process.argv.includes("--self-test")) {
  assert(validate({ ...data, ledger: data.ledger.slice(1) }).some((error) => error.includes("ledger does not cover")));
  assert(validate({ ...data, ledger: [...data.ledger, data.ledger[0]] }).some((error) => error.includes("duplicate ledger")));
  assert(validate({ ...data, ledger: data.ledger.map((row, i) => i ? row : { ...row, source_key: "army_orphan" }) }).some((error) => error.includes("orphan ledger")));
  const includedIndex = data.ledger.findIndex((row) => row.decision === "include");
  assert(validate({ ...data, ledger: data.ledger.map((row, i) => i === includedIndex ? { ...row, target_refs: "missing_target" } : row) }).some((error) => error.includes("without complete valid targets")));
  const rejectedIndex = data.ledger.findIndex((row) => row.decision === "reject");
  assert(validate({ ...data, ledger: data.ledger.map((row, i) => i === rejectedIndex ? { ...row, reason: "" } : row) }).some((error) => error.includes("incomplete ledger")));
  const missedDuplicateIndex = data.ledger.findIndex((row) => row.source_key === "army_0515");
  assert(missedDuplicateIndex >= 0 && validate({ ...data, ledger: data.ledger.map((row, i) => i === missedDuplicateIndex ? { ...row, reason: "screened_no_supported_component" } : row) }).some((error) => error.includes("invalid targets")));
  assert(validate({ ...data, ledger: data.ledger.map((row, i) => i === missedDuplicateIndex ? { ...row, target_refs: "" } : row) }).some((error) => error.includes("linked duplicate missing targets")));
  assert(validate({ ...data, additions: { ...data.additions, army_duplicate_scan_ignored_pairs: data.additions.army_duplicate_scan_ignored_pairs.slice(1) } }).some((error) => error.includes("linked duplicate missing targets")));
  const tampered = Buffer.from(data.armyRaw); tampered[tampered.length - 2] ^= 1;
  assert(validate({ ...data, armyRaw: tampered }).some((error) => error.includes("digest mismatch")));
  assert(validate({ ...data, entries: data.entries.map((row, i) => i ? row : { ...row, provenance_ref: `${row.provenance_ref}; book:1 §1` }) }).some((error) => error.includes("authored projection")));
  assert(validate({ ...data, rules: data.rules.map((row, i) => i ? row : { ...row, component_kind: row.component_kind === "demonym" ? "nickname" : "demonym" }) }).some((error) => error.includes("pool/rule kind")));
  assert(validate({ ...data, rules: data.rules.map((row, i) => i ? row : { ...row, social_scope: "elite_only" }) }).some((error) => error.includes("hard or unknown")));
  const dynasticIndex = data.entries.findIndex((entry) => entry.selection_class === "dynastic");
  assert(dynasticIndex >= 0 && validate({ ...data, entries: data.entries.map((row, i) => i === dynasticIndex ? { ...row, selection_class: "ordinary" } : row) }).some((error) => error.includes("authored projection")));
  const significantIndex = data.entries.findIndex((entry) => entry.selection_class === "significant");
  assert(significantIndex >= 0 && !selectOrdinary(data.entries).includes(data.entries[significantIndex]));
  assert(validate({ ...data, entries: data.entries.map((row, i) => i ? row : { ...row, selection_class: "unknown" }) }).some((error) => error.includes("invalid class")));
  assert(selectOrdinary(data.entries).every((entry) => entry.selection_class === "ordinary"));
  assert(!selectOrdinary(data.entries).some((entry) => ["dynastic", "significant"].includes(entry.selection_class)));
  const princelyIndex = data.entries.findIndex((entry) => entry.entry_id === "nce_pat_mstislavich");
  assert(princelyIndex >= 0 && validate({ ...data, entries: data.entries.map((row, i) => i === princelyIndex ? { ...row, selection_class: "ordinary" } : row) }).some((error) => error.includes("princely patronymic must be dynastic")));
  const attestedId = "nce_pat_domazhirovich";
  const badForm = "Несуществующийкомпонент";
  const badAdditions = { ...data.additions, entries: data.additions.entries.map((entry) => entry.entry_id === attestedId ? { ...entry, component_form: badForm } : entry) };
  assert(validate({ ...data, additions: badAdditions, entries: data.entries.map((entry) => entry.entry_id === attestedId ? { ...entry, component_form: badForm } : entry) }).some((error) => error.includes("attested form absent from support")));
  const badRuleAdditions = { ...data.additions, rules: data.additions.rules.map((rule) => rule.rule_id === "ncr_pat_parent_before_son" ? { ...rule, attested_surface_forms: ["Несуществующая формула"] } : rule) };
  assert(validate({ ...data, additions: badRuleAdditions }).some((error) => error.includes("attested rule form absent from support")));
  assert(validate({ ...data, additions: { ...data.additions, semantic_rescreen: { ...data.additions.semantic_rescreen, returned_components: 15 } } }).some((error) => error.includes("returned components mismatch")));
  assert(validate({ ...data, additions: { ...data.additions, semantic_rescreen: { ...data.additions.semantic_rescreen, remaining_reviewed_rows: 449 } } }).some((error) => error.includes("remaining rows mismatch")));
  assert(validate({ ...data, additions: { ...data.additions, semantic_rescreen: { ...data.additions.semantic_rescreen, reclassified_duplicate_rows: 12 } } }).some((error) => error.includes("duplicate count mismatch")));
  assert(data.entries.filter((entry) => entry.component_lexeme_id === "dem_smolensk").length === 2);
  assert(data.army.length > 500);
  // D46 deterministic probes 10-12: nickname, demonym gap and patronymic stay components.
  const entriesById = new Map(data.entries.map((entry) => [entry.entry_id, entry]));
  assert.deepEqual([entriesById.get("nce_d46_13_264")?.component_form, entriesById.get("nce_d46_13_264")?.pool_id], ["Кузнец", "novgorod_1230_1250_nicknames_v1"]);
  assert.deepEqual([entriesById.get("nce_d46_13_276")?.selector_status, entriesById.get("nce_d46_13_276")?.referent_key], ["gap", "place:zavolochye"]);
  assert.deepEqual([entriesById.get("nce_d46_13_285")?.component_form, entriesById.get("nce_d46_13_285")?.pool_id], ["Влункович", "novgorod_1230_1250_patronymics_v1"]);
  for (const key of ["army_0094", "army_0954", "army_0955"]) {
    const row = data.ledger.find((item) => item.source_key === key);
    assert.deepEqual([row?.decision, row?.reason, row?.target_refs], ["reject", "non_personal_name_form", ""]);
  }

  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "names-build-check-"));
  try {
    const tempGroup = path.join(tempRepo, "data/world-catalogs/novgorod/game-base-v1/names-peoples");
    const tempScript = path.join(tempGroup, "scripts/build-personal-names.mjs");
    const tempNames = path.join(tempGroup, "personal_names");
    const tempCandidate = path.join(tempRepo, "data/world-catalogs/novgorod/onomastics/candidates/novgorod-1230-1250-v1/candidate.json");
    fs.mkdirSync(path.dirname(tempScript), { recursive: true });
    fs.mkdirSync(tempNames, { recursive: true });
    fs.mkdirSync(path.dirname(tempCandidate), { recursive: true });
    fs.copyFileSync(path.join(GROUP_DIR, "scripts/build-personal-names.mjs"), tempScript);
    fs.copyFileSync(path.resolve(GROUP_DIR, "../../onomastics/candidates/novgorod-1230-1250-v1/candidate.json"), tempCandidate);
    const sentinel = "stale output sentinel\n";
    for (const name of ["personal_names.csv", "coverage-report.json"]) fs.writeFileSync(path.join(tempNames, name), sentinel);
    const check = spawnSync(process.execPath, [tempScript, "--check"], { encoding: "utf8" });
    assert.equal(check.status, 1, "stale --check should exit nonzero");
    assert.match(check.stderr, /personal_names\.csv is stale/);
    for (const name of ["personal_names.csv", "coverage-report.json"]) {
      assert.equal(fs.readFileSync(path.join(tempNames, name), "utf8"), sentinel, `${name} changed during --check`);
    }
    console.log("self-test PASS: stale personal-name --check does not write outputs");
  } finally {
    fs.rmSync(tempRepo, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ result: "PASS", pools: data.pools.length, entries: data.entries.length, rules: data.rules.length, army_rows: data.army.length, self_test: process.argv.includes("--self-test") }));
