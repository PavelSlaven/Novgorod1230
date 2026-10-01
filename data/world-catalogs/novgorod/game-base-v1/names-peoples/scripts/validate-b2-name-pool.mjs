import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXCLUSION_REASONS, parseCsv, parseTsv } from "./build-b2-name-pool.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GROUP_DIR = path.resolve(SCRIPT_DIR, "..");
const NAMES_DIR = path.join(GROUP_DIR, "personal_names");
const PEOPLE_PATH = path.join(GROUP_DIR, "peoples_origins", "peoples_origins.csv");
const IMPORT_CONTRACT_PATH = path.join(NAMES_DIR, "b2-import-contract.json");
const SOURCE_PATH = path.join(NAMES_DIR, "b2-name-pool-source.json");
const D46_PATH = path.join(NAMES_DIR, "d46-name-additions.json");
const NAMES_GAPS_PATH = path.join(NAMES_DIR, "names-gaps-additions.json");
const REPORT_PATH = path.join(NAMES_DIR, "name-pool-report.json");
const CANDIDATE_ENTRIES_PATH = path.join(NAMES_DIR, "name_pool_entries_candidates.csv");
const SOCIAL_PATH = path.resolve(GROUP_DIR, "..", "social-strata-law", "social_strata_legal_status", "roles", "new_role_candidates.tsv");
const CLASSES = new Set(["ordinary", "monastic", "dynastic", "significant"]);
const SEXES = new Set(["female", "male"]);
const STATUSES = new Set(["draft", "approved", "deprecated"]);
const DERIVATIONS = new Set(["compiled_candidate", "explicit_source_gender", "calendar_name_gender"]);
const PEOPLE_DERIVATIONS = new Set(["candidate_origin", "novgorod_land_document", "source_explicit_people"]);
const EVIDENCE_PERIODS = new Set(["candidate_compiled", "c1230", "medieval_general"]);
const CLASS_DERIVATIONS = new Set(["", "calendar_name_any_christian"]);
const DEFAULT_BLOCKED_FORMS = new Set(["Василиса", "Дарья", "Матрёна", "Прасковья"]);
const LOWER_WEIGHT_FORMS = new Set(["Елена", "Ольга"]);
const TURKIC_GAP_FORMS = new Set(["Гюлопа", "Ильдята", "Кыяс", "Сандус"]);
const TREATY_READINGS = new Map(Object.entries({
  Adam: "Адам", Albrecht: "Альбрехт", Bernhard: "Бернхард", Dethard: "Детхард",
  Ermbrecht: "Эрмбрехт", Friedrich: "Фридрих", Heinrich: "Генрих", Hildeger: "Хильдегер",
  Johann: "Иоганн", Konrad: "Конрад", Meinbern: "Майнберн", Membern: "Мемберн",
  Regenbode: "Регеньбоде", Rolf: "Рольф", Volker: "Фолькер", Walter: "Вальтер",
}));

function rows(file) { return parseCsv(fs.readFileSync(file, "utf8")); }

function header(file) { return fs.readFileSync(file, "utf8").split(/\r?\n/, 1)[0].split(","); }

function sameArray(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function sortedObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b, "en")));
}

function socialPositionIds() {
  const lines = fs.readFileSync(SOCIAL_PATH, "utf8").trimEnd().split(/\r?\n/);
  const headerCells = lines.shift().split("\t");
  const index = headerCells.indexOf("social_position_archetype_id");
  if (index < 0) throw new Error("social_position_archetype_id column missing");
  return new Set(lines.map((line) => line.split("\t")[index]).filter(Boolean));
}

function selectionKey(row) { return [row.name_form, row.sex_category, row.people_ref].join("|"); }

function normalizedName(value) { return value.normalize("NFC").toLocaleLowerCase("ru").replaceAll("ё", "е").trim(); }

function normalizedAlias(value) { return normalizedName(value).replace(/[ьъ]/g, ""); }

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }

export function validate({ pools, entries, candidateEntries = [], sourceRows, derivationRows, evidenceRows, additionalEvidenceRows, peopleRows, socialIds, report, importContract, source, d46, namesGaps, snapshotContents, poolHeader, entryHeader, candidateEntryHeader = entryHeader }) {
  const errors = [];
  if (namesGaps.schema !== "novgorod.game_base.names_gaps_additions.v1" || namesGaps.status !== "candidate" || !Array.isArray(namesGaps.entries) || namesGaps.entries.length !== 0 || !Array.isArray(namesGaps.gap_overrides) || namesGaps.gap_overrides.length !== 12) errors.push("invalid names-gaps authoring scope");
  const expectedPoolHeader = importContract.tables["world_base.region_name_pools"].csv_columns;
  const expectedEntryHeader = importContract.tables["world_base.region_name_pool_entries"].csv_columns;
  if (!sameArray(poolHeader, expectedPoolHeader)) errors.push(`wrong pool header: ${poolHeader.join(",")}`);
  if (!sameArray(entryHeader, expectedEntryHeader)) errors.push(`wrong entry header: ${entryHeader.join(",")}`);
  if (!sameArray(candidateEntryHeader, expectedEntryHeader)) errors.push(`wrong candidate entry header: ${candidateEntryHeader.join(",")}`);
  if (!importContract.required_parameters?.world_revision_id?.required || importContract.required_parameters.world_revision_id.closed_reference !== "world_base.world_revisions.id") errors.push("missing closed world_revision_id import parameter");
  if (!sameArray(importContract.tables["world_base.region_name_pool_entries"].unique_key ?? [], ["name_pool_id", "name_form", "sex_category", "people_ref"])) errors.push("wrong entry unique key contract");
  if (!importContract.selection_rule?.includes("selection_class=ordinary")) errors.push("missing ordinary-only selection contract");
  if (source.selection_rules.class_scope !== "name_form" || source.selection_rules.calendar_name_class !== "ordinary" || source.selection_rules.unique_known_noncalendar_class !== "significant") errors.push("invalid name-form class rules");
  const calendarNameForms = new Set(source.selection_rules.calendar_name_forms ?? []);
  if (!calendarNameForms.size || calendarNameForms.size !== (source.selection_rules.calendar_name_forms ?? []).length) errors.push("invalid calendar-name form registry");
  const configuredPools = [source.pool, ...(source.foreign_pools ?? [])];
  const configuredPoolIds = new Set(configuredPools.map((pool) => pool.id));
  if (pools.length !== configuredPools.length || pools.some((pool) => !configuredPoolIds.has(pool.id))) errors.push(`pool output does not match configured pools (${pools.length}/${configuredPools.length})`);
  if (configuredPoolIds.size !== configuredPools.length) errors.push("duplicate configured name pool id");
  if (configuredPools.some((pool) => pool.status !== "draft")) errors.push("candidate name pools must remain draft");
  const poolIds = new Set(pools.map((row) => row.id));
  for (const pool of pools) {
    if (!pool.id) errors.push("pool id is empty");
    if (pool.region_id !== "region_novgorod_land") errors.push(`${pool.id}: unknown region_id ${pool.region_id}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pool.valid_from) || !/^\d{4}-\d{2}-\d{2}$/.test(pool.valid_to) || pool.valid_from > pool.valid_to) errors.push(`${pool.id}: invalid validity interval`);
    if (!STATUSES.has(pool.status)) errors.push(`${pool.id}: unknown pool status ${pool.status}`);
  }
  const configuredPeoplePools = new Map((source.foreign_pools ?? []).map((pool) => [pool.people_ref, pool.id]));
  const peopleIds = new Set(peopleRows.filter((row) => ["people", "guest_itinerant"].includes(row.entity_kind)).map((row) => row.pp_id));
  if (configuredPeoplePools.size !== (source.foreign_pools ?? []).length) errors.push("duplicate people_ref in foreign pools");
  for (const [peopleRef, poolId] of Object.entries(source.people_to_pool_id ?? {})) {
    if (!configuredPeoplePools.has(peopleRef) || configuredPeoplePools.get(peopleRef) !== poolId) errors.push(`${peopleRef}: people_to_pool_id does not match configured pool`);
  }
  for (const pool of source.foreign_pools ?? []) {
    if (!peopleIds.has(pool.people_ref)) errors.push(`${pool.id}: unknown people_ref ${pool.people_ref}`);
    if (source.people_to_pool_id?.[pool.people_ref] !== pool.id) errors.push(`${pool.id}: missing people_to_pool_id binding`);
    if (!pool.provenance_ref) errors.push(`${pool.id}: missing pool provenance_ref`);
  }

  const sourceIds = new Set(sourceRows.map((row) => row.nm_id));
  const expectedD61CandidateIds = new Set((namesGaps.calendar_rule_review ?? [])
    .filter((row) => row.status === "new_candidate").map((row) => row.candidate_entry_id));
  const candidateEntriesById = new Map(candidateEntries.map((row) => [row.id, row]));
  if (candidateEntriesById.size !== candidateEntries.length) errors.push("duplicate D61 candidate entry id");
  if (candidateEntries.length !== expectedD61CandidateIds.size
    || candidateEntries.some((row) => !expectedD61CandidateIds.has(row.id))
    || entries.some((row) => expectedD61CandidateIds.has(row.id))) errors.push("D61 candidate rows must stay outside the operational pool");
  for (const row of candidateEntries) {
    if (row.people_ref !== "pp_korela" || row.sex_category !== "male" && row.sex_category !== "female"
      || row.selection_class !== "ordinary" || row.derivation !== "calendar_name_gender"
      || row.derivation_class !== "calendar_name_any_christian" || row.status !== "draft") {
      errors.push(`${row.id}: invalid isolated D61 candidate row`);
    }
  }
  const d46Ids = new Set(d46.name_entries.map((row) => row.id));
  const evidenceLines = new Set(evidenceRows.map((row) => Number(row.source_line?.slice(1))));
  if (evidenceRows.some((row) => !/^L\d+$/.test(row.source_line)) || evidenceLines.size !== evidenceRows.length || evidenceRows.length !== source.evidence_snapshot.expected_rows) errors.push("invalid evidence snapshot source_line set");
  const additionalEvidenceLines = new Map((additionalEvidenceRows ?? []).map((row) => [row.source_line, row]));
  if (additionalEvidenceLines.size !== source.additional_evidence_snapshot.expected_rows || (additionalEvidenceRows ?? []).some((row) => !/^L\d+$/.test(row.source_line))) errors.push("invalid additional evidence snapshot source_line set");
  const evidenceSnapshotByLine = new Map((evidenceRows ?? []).map((row) => [row.source_line, row]));
  const includedDerivations = derivationRows.filter((row) => !row.exclude_reason);
  const excludedDerivations = derivationRows.filter((row) => row.exclude_reason);
  const authoredDecisionLines = new Set(derivationRows.map((row) => Number(row.evidence_line)));
  if (authoredDecisionLines.size !== source.evidence_derivations.expected_evidence_rows) errors.push("authored evidence decisions incomplete");
  for (const excluded of excludedDerivations) {
    if (!EXCLUSION_REASONS.has(excluded.exclude_reason)) errors.push(`evidence line ${excluded.evidence_line}: unknown exclusion reason ${excluded.exclude_reason}`);
    if ([excluded.source_form, excluded.name_form, excluded.sex_category, excluded.people_ref, excluded.people_derivation, excluded.selection_class, excluded.derivation, excluded.evidence_period].some(Boolean)) errors.push(`evidence line ${excluded.evidence_line}: excluded decision has derived fields`);
  }
  const includedLines = new Set(includedDerivations.map((row) => Number(row.evidence_line)));
  if (includedLines.size !== evidenceLines.size || [...includedLines].some((line) => !evidenceLines.has(line)) || [...evidenceLines].some((line) => !includedLines.has(line))) errors.push("snapshot does not exactly match included evidence lines");
  const ids = new Set(), keys = new Set(), entriesByKey = new Map();
  for (const row of entries) {
    if (!row.id || ids.has(row.id)) errors.push(`duplicate or empty id: ${row.id}`);
    ids.add(row.id);
    if (!poolIds.has(row.name_pool_id)) errors.push(`${row.id}: unknown name_pool_id ${row.name_pool_id}`);
    if (!row.name_form) errors.push(`${row.id}: empty name_form`);
    if (row.weight !== "1") errors.push(`${row.id}: weight must be equal to 1`);
    if (!SEXES.has(row.sex_category)) errors.push(`${row.id}: unknown sex_category ${row.sex_category}`);
    if (!peopleIds.has(row.people_ref)) errors.push(`${row.id}: unknown people_ref ${row.people_ref}`);
    const expectedPoolId = source.people_to_pool_id?.[row.people_ref] ?? (row.people_ref === "pp_novgorod_rus" ? source.pool.id : "");
    if (!expectedPoolId || row.name_pool_id !== expectedPoolId) errors.push(`${row.id}: name_pool_id does not match people_ref`);
    if (row.social_position_archetype_id && !socialIds.has(row.social_position_archetype_id)) errors.push(`${row.id}: unknown social_position_archetype_id ${row.social_position_archetype_id}`);
    if (!CLASSES.has(row.selection_class)) errors.push(`${row.id}: unknown selection_class ${row.selection_class}`);
    if (!CLASS_DERIVATIONS.has(row.derivation_class)) errors.push(`${row.id}: unknown derivation_class ${row.derivation_class}`);
    if (row.derivation_class === "calendar_name_any_christian" && row.selection_class !== "ordinary") errors.push(`${row.id}: calendar class derivation requires ordinary selection_class`);
    if (row.selection_class === "ordinary" && calendarNameForms.has(row.name_form) && row.derivation_class !== "calendar_name_any_christian") errors.push(`${row.id}: calendar name missing class derivation`);
    if (!DERIVATIONS.has(row.derivation)) errors.push(`${row.id}: unknown derivation ${row.derivation}`);
    if (!PEOPLE_DERIVATIONS.has(row.people_derivation)) errors.push(`${row.id}: unknown people_derivation ${row.people_derivation}`);
    const periods = row.evidence_period.split("|");
    if (!periods.length || periods.some((period) => !EVIDENCE_PERIODS.has(period))) errors.push(`${row.id}: unknown evidence_period ${row.evidence_period}`);
    if (!STATUSES.has(row.status)) errors.push(`${row.id}: unknown status ${row.status}`);
    if (!row.provenance_ref) errors.push(`${row.id}: missing provenance_ref`);
    for (const provenance of row.provenance_ref.split(" | ").filter(Boolean)) {
      const candidateMatch = provenance.match(/^game-base:names-peoples\/personal_names\/personal_names\.csv#nm_id=(.+)$/);
      const evidenceMatch = provenance.match(/^game-base:names-peoples\/sources\/book_evidence_m2c_names_b2\.csv#source_line=L(\d+)$/);
      const additionalEvidenceMatch = provenance.match(/^game-base:names-peoples\/sources\/book_evidence_m2c_name_components\.csv#source_line=(L\d+)$/);
      const d46Match = provenance.match(/^game-base:names-peoples\/personal_names\/d46-name-additions\.json#name-entry=(.+)$/);
      if (candidateMatch && sourceIds.has(candidateMatch[1])) continue;
      if (evidenceMatch && evidenceLines.has(Number(evidenceMatch[1]))) continue;
      if (additionalEvidenceMatch && additionalEvidenceLines.has(additionalEvidenceMatch[1])) continue;
      if (d46Match && d46Ids.has(d46Match[1])) continue;
      errors.push(`${row.id}: unresolved provenance_ref ${provenance}`);
    }
    const key = selectionKey(row);
    if (keys.has(key)) errors.push(`${row.id}: duplicate selection key ${key}`);
    keys.add(key);
    entriesByKey.set(key, row);
  }

  for (const sourceRow of sourceRows) {
    if (!sourceRow.source_refs) errors.push(`${sourceRow.nm_id}: empty upstream source_refs`);
    const key = [sourceRow.name_form, sourceRow.sex, `pp_${sourceRow.people_ref}`].join("|");
    const entry = entriesByKey.get(key);
    const ref = `${source.input.provenance_prefix}${sourceRow.nm_id}`;
    if (!entry || !entry.provenance_ref.split(" | ").includes(ref)) errors.push(`${sourceRow.nm_id}: compiled candidate missing from merged entry`);
  }
  const additionalEntriesById = new Map((source.additional_entries ?? []).map((row) => [row.id, row]));
  if (additionalEntriesById.size !== (source.additional_entries ?? []).length) errors.push("duplicate additional evidence entry id");
  for (const row of source.additional_entries ?? []) {
    const snapshotRows = row.source_snapshot === "evidence" ? evidenceSnapshotByLine : additionalEvidenceLines;
    const snapshotPath = row.source_snapshot === "evidence" ? source.evidence_snapshot.path : source.additional_evidence_snapshot.path;
    const support = snapshotRows.get(row.source_line);
    const isD61Candidate = expectedD61CandidateIds.has(row.id);
    const entry = (isD61Candidate ? candidateEntries : entries).find((item) => item.id === row.id);
    if (!support || !Object.values(support).join("\n").includes(row.source_form) || row.provenance_ref !== `game-base:names-peoples/${snapshotPath}#source_line=${row.source_line}`) errors.push(`${row.id}: unresolved additional evidence source`);
    if (!entry || ["name_form", "sex_category", "people_ref", "selection_class", "derivation", "people_derivation", "evidence_period"].some((key) => entry[key] !== row[key]) || !entry.provenance_ref.split(" | ").includes(row.provenance_ref)) errors.push(`${row.id}: additional evidence entry missing or changed`);
  }
  const d46All = [...d46.name_entries, ...d46.name_variants, ...d46.name_gaps, ...d46.component_entries, ...d46.component_updates];
  const d46Keys = d46All.map((row) => normalizedName(row.name_form ?? row.variant_form ?? row.component_form ?? row.archive_name));
  if (d46.schema !== "novgorod.game_base.d46_name_additions.v1" || d46.source_scope.expected_unique_new_candidates !== 190 || d46.source_scope.expected_unique_variants !== 15 || d46All.length !== 205 || new Set(d46Keys).size !== d46Keys.length) errors.push("D46 authoring scope drift");
  const archiveVariants = d46.name_variants.filter((row) => row.classification === "archive_variant");
  const reclassifiedVariants = d46.name_variants.filter((row) => row.classification !== "archive_variant");
  if (d46.name_entries.length + d46.name_gaps.length + d46.component_entries.length + d46.component_updates.length + reclassifiedVariants.length !== 190 || archiveVariants.length !== 15) errors.push("D46 accounting partition drift");
  if (d46.rejected.length) errors.push("D46 rejected records must be empty; selector gaps belong in name_gaps");
  const expectedSnapshots = new Map([
    ["onomastic_catalog", "sources/d46-onomastic-catalog-1230-1250.md"],
    ["regional_name_pools", "sources/d46-regional-name-pools.json"],
  ]);
  if (Object.keys(d46.snapshots ?? {}).length !== expectedSnapshots.size) errors.push("D46 snapshot registry drift");
  for (const [key, expectedPath] of expectedSnapshots) {
    const snapshot = d46.snapshots?.[key];
    if (snapshot?.path !== expectedPath || !/^[0-9a-f]{64}$/.test(snapshot?.sha256 ?? "") || sha256(snapshotContents?.[expectedPath] ?? "") !== snapshot?.sha256) errors.push(`D46 snapshot mismatch: ${key}`);
  }
  const snapshotRefPrefixes = new Set([...expectedSnapshots.values()].map((snapshotPath) => `game-base:names-peoples/${snapshotPath}#`));
  for (const row of d46All) {
    for (const ref of row.archive_refs ?? []) if (![...snapshotRefPrefixes].some((prefix) => ref.startsWith(prefix))) errors.push(`${ref}: D46 archive_ref does not resolve to a pinned snapshot`);
    for (const sourceRow of row.source_rows ?? []) if (sourceRow.archive_ref !== (row.archive_refs ?? []).find((ref) => ref === sourceRow.archive_ref) || sourceRow.crosswalk_ref?.startsWith("/")) errors.push(`${row.name_form ?? row.variant_form ?? row.component_form ?? row.archive_name}: invalid D46 source-row provenance`);
  }
  const existingNormalizedNames = new Set(entries.filter((row) => !d46Ids.has(row.id)).map((row) => normalizedAlias(row.name_form)));
  const entryExclusions = new Map((source.entry_exclusions ?? []).map((row) => [row.id, row]));
  for (const row of d46.name_entries) {
    const entry = entriesByKey.get(selectionKey(row));
    const ref = `game-base:names-peoples/personal_names/d46-name-additions.json#name-entry=${row.id}`;
    const exclusion = entryExclusions.get(row.id);
    if (exclusion) {
      const gap = report.typed_gaps.find((item) => item.gap_id === exclusion.gap_id);
      const reviewedGap = namesGaps.gap_overrides.find((item) => item.gap_id === exclusion.gap_id);
      if (entry || exclusion.name_form !== row.name_form || exclusion.people_ref !== row.people_ref || exclusion.sex_category !== row.sex_category || exclusion.selection_class !== row.selection_class || exclusion.gap_type !== "people_ref_unresolved" || !gap || gap.reason !== (reviewedGap?.reason ?? exclusion.reason) || gap.provenance_ref !== exclusion.provenance_ref) errors.push(`${row.id}: invalid typed exclusion or selectable entry leaked`);
      continue;
    }
    if (!entry || !entry.provenance_ref.split(" | ").includes(ref)) errors.push(`${row.id}: D46 name missing from merged entry`);
    const foreignSourced = row.source_rows.some((sourceRow) => sourceRow.source_section?.includes("§9"));
    if (foreignSourced && row.people_ref === "pp_novgorod_rus") errors.push(`${row.id}: foreign name uses Russian fallback`);
    if (foreignSourced && row.basis !== "sourced") errors.push(`${row.id}: A/B foreign source must remain sourced`);
    if (!row.archive_refs?.length || !["sourced", "analogy"].includes(row.basis) || !["A", "B", "C"].includes(row.confidence)) errors.push(`${row.id}: incomplete D46 evidence metadata`);
    if (existingNormalizedNames.has(normalizedAlias(row.name_form))) errors.push(`${row.id}: normalized D46 name duplicates existing entry`);
    if (DEFAULT_BLOCKED_FORMS.has(row.name_form) || LOWER_WEIGHT_FORMS.has(row.name_form) || TURKIC_GAP_FORMS.has(row.name_form)) errors.push(`${row.id}: typed-gap form leaked into selectable entries`);
  }
  const gapsByForm = new Map(d46.name_gaps.map((row) => [row.name_form, row]));
  for (const form of DEFAULT_BLOCKED_FORMS) {
    const gap = gapsByForm.get(form);
    if (gap?.gap_type !== "default_1230_1250_requires_new_evidence" || gap.selection_status !== "gap" || !gap.gap_reason?.includes("§5.3")) errors.push(`${form}: invalid closed-list default gap`);
  }
  for (const form of LOWER_WEIGHT_FORMS) {
    const gap = gapsByForm.get(form);
    if (gap?.gap_type !== "lower_weight_required" || gap.selection_status !== "gap" || !gap.gap_reason?.includes("пониженным весом")) errors.push(`${form}: invalid lower-weight gap`);
  }
  for (const form of TURKIC_GAP_FORMS) {
    const gap = gapsByForm.get(form);
    if (gap?.gap_type !== "people_ref_unresolved" || gap.people_ref || gap.selection_status !== "gap" || !gap.gap_reason?.includes("Тюркского origin нет")) errors.push(`${form}: invalid Turkic selector gap`);
  }
  if (gapsByForm.size !== DEFAULT_BLOCKED_FORMS.size + LOWER_WEIGHT_FORMS.size + TURKIC_GAP_FORMS.size) errors.push("D46 typed-gap closed list drift");
  for (const [latin, cyrillic] of TREATY_READINGS) {
    const row = d46.name_entries.find((item) => item.source_forms?.includes(latin));
    if (row?.name_form !== cyrillic || row.evidence_period !== "c1230" || row.basis !== "sourced") errors.push(`${latin}: invalid treaty reading or evidence metadata`);
  }
  for (const row of d46.name_variants) {
    if (!row.target_refs?.length || !row.archive_refs?.length) errors.push(`${row.variant_form}: incomplete D46 variant`);
    for (const target of row.target_refs ?? []) {
      const [targetPath, targetId] = target.split("#");
      if (!targetId || (targetPath.endsWith("personal_names.csv") ? !sourceIds.has(targetId) : targetPath.endsWith("name_pool_entries.csv") ? !ids.has(targetId) : targetPath.endsWith("d46-name-additions.json") ? !d46Ids.has(targetId.replace(/^name-entry=/, "")) : true)) errors.push(`${row.variant_form}: unresolved D46 variant target ${target}`);
    }
  }
  const evidenceByLine = new Map(evidenceRows.map((row) => [Number(row.source_line.slice(1)), row]));
  for (const derived of includedDerivations) {
    const line = Number(derived.evidence_line);
    if (!evidenceLines.has(line)) errors.push(`derivation references unknown evidence line ${derived.evidence_line}`);
    if (!derived.source_form || !Object.values(evidenceByLine.get(line) ?? {}).join("\n").includes(derived.source_form)) errors.push(`evidence line ${line}: source_form absent from snapshot`);
    if (!derived.name_form) errors.push(`evidence line ${line}: empty derived name_form`);
    if (!DERIVATIONS.has(derived.derivation) || derived.derivation === "compiled_candidate") errors.push(`evidence line ${line}: invalid derivation ${derived.derivation}`);
    if (!PEOPLE_DERIVATIONS.has(derived.people_derivation) || derived.people_derivation === "candidate_origin") errors.push(`evidence line ${line}: invalid people_derivation ${derived.people_derivation}`);
    if (!CLASSES.has(derived.selection_class) || !SEXES.has(derived.sex_category) || !peopleIds.has(derived.people_ref) || !EVIDENCE_PERIODS.has(derived.evidence_period) || derived.evidence_period === "candidate_compiled") errors.push(`evidence line ${line}: unclosed derived selector`);
    const entry = entriesByKey.get(selectionKey(derived));
    const ref = `${source.evidence_snapshot.provenance_prefix}${line}`;
    if (!entry || !entry.provenance_ref.split(" | ").includes(ref)) errors.push(`evidence line ${line}: derivation missing from merged entry`);
    const isCalendarName = derived.derivation === "calendar_name_gender" || calendarNameForms.has(derived.name_form);
    if (isCalendarName && !["ordinary", "monastic"].includes(derived.selection_class)) errors.push(`evidence line ${line}: calendar name has forbidden selection_class ${derived.selection_class}`);
    if (isCalendarName && derived.selection_class === "ordinary" && entry?.derivation_class !== "calendar_name_any_christian") errors.push(`evidence line ${line}: calendar name missing class derivation`);
  }

  const counts = {};
  const countsByPool = Object.fromEntries(configuredPools.map((pool) => [pool.id, entries.filter((entry) => entry.name_pool_id === pool.id).length]));
  for (const row of entries) {
    const key = `${row.sex_category}|${row.people_ref}|${row.selection_class}|${row.derivation}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  if (report.total_entries !== entries.length || JSON.stringify(report.counts_by_sex_people_selection_class_derivation) !== JSON.stringify(sortedObject(counts))) errors.push("generated report drift");
  if (report.pool_count !== pools.length || JSON.stringify(report.counts_by_pool) !== JSON.stringify(countsByPool)) errors.push("generated per-pool report drift");
  if (report.additional_evidence_accounting?.snapshot_rows !== additionalEvidenceRows.length || report.additional_evidence_accounting?.included_entries !== (source.additional_entries ?? []).length) errors.push("additional evidence report drift");
  if (!report.pool_provenance_ref) errors.push("missing pool provenance_ref");
  const d46Accounting = report.d46_archive_accounting;
  if (d46Accounting?.unique_new_candidates !== 190 || d46Accounting?.included_name_entries !== d46.name_entries.length || d46Accounting?.included_component_entries !== d46.component_entries.length || d46Accounting?.existing_component_updates !== d46.component_updates.length || d46Accounting?.archive_variants !== archiveVariants.length || d46Accounting?.reclassified_candidate_variants !== reclassifiedVariants.length || d46Accounting?.variants !== d46.name_variants.length || d46Accounting?.typed_name_gaps !== d46.name_gaps.length || d46Accounting?.rejected !== 0) errors.push("D46 report accounting drift");

  const accounting = report.evidence_accounting;
  const derivationsByLine = new Map();
  for (const row of includedDerivations) {
    const line = Number(row.evidence_line);
    if (!derivationsByLine.has(line)) derivationsByLine.set(line, []);
    derivationsByLine.get(line).push(row);
  }
  const decisions = accounting?.decisions ?? [];
  const decisionLines = new Set(decisions.map((row) => row.evidence_line));
  if (accounting?.total_rows !== source.evidence_derivations.expected_evidence_rows || decisions.length !== source.evidence_derivations.expected_evidence_rows || decisionLines.size !== source.evidence_derivations.expected_evidence_rows || [...authoredDecisionLines].some((line) => !decisionLines.has(line))) errors.push("evidence accounting decisions drift");
  const includedDecisions = decisions.filter((row) => row.status === "included");
  const excludedDecisions = decisions.filter((row) => row.status === "excluded");
  if (accounting?.included_rows !== includedLines.size || accounting?.excluded_rows !== excludedDerivations.length || accounting?.included_derived_records !== includedDerivations.length) errors.push("evidence accounting totals drift");
  const rowsByDerivation = {}, recordsByDerivation = {}, rowsByExclusionReason = {};
  for (const decision of includedDecisions) {
    if (!includedLines.has(decision.evidence_line)) errors.push(`evidence line ${decision.evidence_line}: false included decision`);
    const derived = derivationsByLine.get(decision.evidence_line) ?? [];
    const expectedDerivations = [...new Set(derived.map((row) => row.derivation))].sort();
    const expectedNames = [...new Set(derived.map((row) => row.name_form))].sort((a, b) => a.localeCompare(b, "en"));
    const expectedSourceForms = [...new Set(derived.map((row) => row.source_form))].sort((a, b) => a.localeCompare(b, "en"));
    if (JSON.stringify([...decision.derivations].sort()) !== JSON.stringify(expectedDerivations) || JSON.stringify(decision.name_forms) !== JSON.stringify(expectedNames) || JSON.stringify(decision.source_forms) !== JSON.stringify(expectedSourceForms)) errors.push(`evidence line ${decision.evidence_line}: included decision drift`);
    const key = decision.derivations.join("+");
    rowsByDerivation[key] = (rowsByDerivation[key] ?? 0) + 1;
  }
  const authoredExclusionByLine = new Map(excludedDerivations.map((row) => [Number(row.evidence_line), row.exclude_reason]));
  for (const decision of excludedDecisions) if (includedLines.has(decision.evidence_line) || !EXCLUSION_REASONS.has(decision.reason) || authoredExclusionByLine.get(decision.evidence_line) !== decision.reason) errors.push(`evidence line ${decision.evidence_line}: invalid excluded decision`);
  for (const decision of excludedDecisions) rowsByExclusionReason[decision.reason] = (rowsByExclusionReason[decision.reason] ?? 0) + 1;
  for (const row of includedDerivations) recordsByDerivation[row.derivation] = (recordsByDerivation[row.derivation] ?? 0) + 1;
  if (JSON.stringify(accounting?.included_rows_by_derivation) !== JSON.stringify(sortedObject(rowsByDerivation))
    || JSON.stringify(accounting?.included_records_by_derivation) !== JSON.stringify(sortedObject(recordsByDerivation))
    || JSON.stringify(accounting?.excluded_rows_by_reason) !== JSON.stringify(sortedObject(rowsByExclusionReason))) errors.push("evidence accounting breakdown drift");

  const ordinaryCounts = {};
  for (const row of entries.filter((entry) => entry.selection_class === "ordinary")) {
    const key = `${row.sex_category}|${row.people_ref}`;
    ordinaryCounts[key] = (ordinaryCounts[key] ?? 0) + 1;
  }
  const gapKeys = new Set(report.typed_gaps.map((gap) => `${gap.people_ref}|${gap.sex_category}|${gap.selection_class}|${gap.gap_type}`));
  for (const peopleRef of peopleIds) for (const sex of SEXES) {
    if ((ordinaryCounts[`${sex}|${peopleRef}`] ?? 0) < 10 && !gapKeys.has(`${peopleRef}|${sex}|ordinary|ordinary_pool_below_10`)) errors.push(`missing typed coverage gap ${peopleRef}|${sex}`);
  }
  const reportGapIds = new Set(report.typed_gaps.map((gap) => gap.gap_id));
  for (const gap of d46.name_gaps) if (!reportGapIds.has(gap.gap_id)) errors.push(`${gap.name_form}: D46 typed gap missing from report`);
  const gapOverrideIds = new Set();
  for (const gap of namesGaps.gap_overrides ?? []) {
    if (!gap.gap_id || gapOverrideIds.has(gap.gap_id) || !gap.reason || !Array.isArray(gap.evidence_refs) || !gap.evidence_refs.length) errors.push(`${gap.gap_id ?? "unknown"}: invalid names-gaps rationale`);
    gapOverrideIds.add(gap.gap_id);
    const reportGap = report.typed_gaps.find((item) => item.gap_id === gap.gap_id);
    if (!reportGap || reportGap.gap_type !== gap.gap_type || reportGap.people_ref !== gap.people_ref || reportGap.sex_category !== gap.sex_category || reportGap.selection_class !== gap.selection_class || reportGap.reason !== gap.reason || reportGap.v17_status !== gap.v17_status || !reportGap.review_refs?.includes(`game-base:names-peoples/personal_names/names-gaps-additions.json#gap_id=${gap.gap_id}`)) errors.push(`${gap.gap_id}: names-gaps rationale missing from report`);
    if (gap.v17_status && (gap.v17_status !== "not_applicable" || !["gap_personal_names_fg001_female", "gap_personal_names_fg002_female"].includes(gap.gap_id))) errors.push(`${gap.gap_id}: invalid v17 gap disposition`);
    if (gap.gap_type === "ordinary_pool_below_10") {
      const count = entries.filter((row) => row.people_ref === gap.people_ref && row.sex_category === gap.sex_category && row.selection_class === "ordinary").length;
      if (gap.current_count !== count || gap.required_count !== 10 || count >= 10) errors.push(`${gap.gap_id}: names-gaps ordinary count mismatch`);
    } else if (gap.gap_type !== "people_ref_unresolved" || gap.name_form !== "Иголанд" || gap.people_ref !== "pp_fg005") errors.push(`${gap.gap_id}: unknown names-gaps type`);
  }
  const applicability = namesGaps.v17_applicability;
  const expectedPeople = ["pp_fg001", "pp_fg002", "pp_korela", "pp_izhora", "pp_chud_est", "pp_smolyane"];
  const expectedPairs = new Set(expectedPeople.flatMap((peopleRef) => [...SEXES].map((sex) => `${peopleRef}|${sex}`)));
  const applicabilityPairs = applicability?.pairs ?? [];
  const applicabilityKeys = applicabilityPairs.map((row) => `${row.people_ref}|${row.sex_category}`);
  if (!applicability?.scope || !applicability?.runtime_status || applicabilityPairs.length !== expectedPairs.size || new Set(applicabilityKeys).size !== applicabilityKeys.length || applicabilityKeys.some((key) => !expectedPairs.has(key)) || expectedPairs.size !== applicabilityKeys.length) errors.push("invalid names-gaps applicability matrix");
  for (const row of applicabilityPairs) {
    if (!['yes', 'no', 'only_outside_slice'].includes(row.needed_in_v17) || !row.basis || !Array.isArray(row.evidence_refs) || !row.evidence_refs.length || !Array.isArray(row.contexts) || (row.needed_in_v17 === "yes" ? !row.contexts.length : row.contexts.length > 0)) errors.push(`${row.people_ref}|${row.sex_category}: invalid names-gaps applicability rationale`);
  }
  const calendarRows = namesGaps.calendar_rule_review ?? [];
  const additionalEntryById = new Map((source.additional_entries ?? []).map((row) => [row.id, row]));
  const expectedRuleRefs = ["book:849577 §435", "book:857568 §733"];
  const bookEvidenceByPara = new Map([...evidenceRows, ...(additionalEvidenceRows ?? [])]
    .map((row) => [`${row.book_id}|${row.para_no}`, row]));
  if (!Array.isArray(calendarRows) || !calendarRows.length || calendarRows.some((row) => {
    const sourceRef = /^book:(\d+) §(\d+)$/.exec(row.source_ref ?? "");
    const quote = String(row.quote ?? "").replace(/^…|…$/gu, "");
    const sourceEvidence = sourceRef && bookEvidenceByPara.get(`${sourceRef[1]}|${sourceRef[2]}`);
    const citedEvidence = sourceEvidence && sourceEvidence.quote.includes(quote);
    const existingEntry = entries.some((entry) => entry.name_form === row.name_form && entry.people_ref === row.people_ref && entry.sex_category === row.sex_category && entry.selection_class === "ordinary");
    if (row.status === "existing_entry_not_new_proposal") return !row.name_form || !row.people_ref || !row.sex_category || row.basis !== "calendar_rule" || !row.confidence || !row.period_cap || !citedEvidence || !existingEntry;
    if (row.status !== "new_candidate") return true;
    const candidate = additionalEntryById.get(row.candidate_entry_id);
    const sourceLine = /^game-base:names-peoples\/sources\/(book_evidence_m2c_names_b2|book_evidence_m2c_name_components)\.csv#source_line=(L\d+)$/.exec(row.source_evidence_ref ?? "");
    const snapshotRows = sourceLine?.[1] === "book_evidence_m2c_names_b2" ? evidenceSnapshotByLine : additionalEvidenceLines;
    const evidenceRow = sourceLine && snapshotRows.get(sourceLine[2]);
    const expectedPath = candidate?.source_snapshot === "evidence" ? "book_evidence_m2c_names_b2" : "book_evidence_m2c_name_components";
    return !candidate || candidate.name_form !== row.name_form || candidate.source_form !== row.source_form
      || candidate.provenance_ref !== row.source_evidence_ref || expectedPath !== sourceLine?.[1]
      || candidate.people_ref !== "pp_korela" || row.people_ref !== "pp_korela" || candidate.sex_category !== row.sex_category
      || !["male", "female"].includes(row.sex_category) || candidate.selection_class !== "ordinary"
      || candidate.derivation_class !== "calendar_name_any_christian" || candidate.derivation !== "calendar_name_gender"
      || candidate.people_derivation !== "candidate_origin" || candidate.evidence_period !== "c1230"
      || row.basis !== "calendar_rule" || row.confidence !== "C" || row.period !== "c1230" || row.period_cap !== "1260"
      || !sameArray((row.rule_basis_refs ?? []).map((ref) => ref.source_ref).filter((ref) => expectedRuleRefs.includes(ref)), expectedRuleRefs)
      || (row.source_ref === "book:857568 §733" && !row.rule_basis_refs?.some((ref) => ref.source_ref === "book:681281 §419"))
      || !citedEvidence || !evidenceRow || !Object.values(evidenceRow).join("\n").includes(row.source_form)
      || candidate.source_line !== sourceLine?.[2] || !quote.includes(row.source_form);
  })) errors.push("invalid names-gaps calendar-rule review");
  const calendarCandidates = calendarRows.filter((row) => row.status === "new_candidate");
  const d61CandidateIds = (source.additional_entries ?? [])
    .filter((row) => row.people_ref === "pp_korela" && row.derivation_class === "calendar_name_any_christian")
    .map((row) => row.id).sort();
  const reviewedCandidateIds = calendarCandidates.map((row) => row.candidate_entry_id);
  if (new Set(d61CandidateIds).size !== d61CandidateIds.length
    || new Set(reviewedCandidateIds).size !== reviewedCandidateIds.length
    || !sameArray([...reviewedCandidateIds].sort(), d61CandidateIds)
    || !sameArray([...candidateEntriesById.keys()].sort(), d61CandidateIds)) errors.push("invalid D61 calendar candidate ID coverage");
  if (calendarCandidates.length !== 12 || calendarCandidates.filter((row) => row.sex_category === "male").length !== 4 || calendarCandidates.filter((row) => row.sex_category === "female").length !== 8
    || report.names_gaps_additions?.candidate_entries !== calendarCandidates.length
    || report.names_gaps_additions?.candidate_output !== "name_pool_entries_candidates.csv"
    || report.additional_evidence_accounting?.candidate_entries !== candidateEntries.length
    || report.additional_evidence_accounting?.operational_entries !== (source.additional_entries ?? []).length - candidateEntries.length
    || report.names_gaps_additions?.detailed_gap_overrides !== namesGaps.gap_overrides.length || report.names_gaps_additions?.selection_window !== namesGaps.selection_window || JSON.stringify(report.names_gaps_additions?.applicability_review) !== JSON.stringify(applicability) || JSON.stringify(report.names_gaps_additions?.calendar_rule_review) !== JSON.stringify(calendarRows)) errors.push("names-gaps report drift");
  return errors;
}

export function selectOrdinary(entries, criteria) {
  const selected = entries.filter((row) => row.status === "approved"
    && row.selection_class === "ordinary"
    && row.sex_category === criteria.sex_category
    && row.people_ref === criteria.people_ref
    && (!row.social_position_archetype_id || row.social_position_archetype_id === criteria.social_position_archetype_id));
  assertOrdinarySelection(selected);
  return selected.sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export function assertOrdinarySelection(entries) {
  const forbidden = entries.filter((row) => row.selection_class !== "ordinary");
  if (forbidden.length) throw new Error(`forbidden selection class in ordinary selection: ${forbidden.map((row) => row.id).join(",")}`);
}

function validateRevisionParameter(value, knownRevisions) {
  if (!value) throw new Error("missing world_revision_id");
  if (!knownRevisions.has(value)) throw new Error(`unknown world_revision_id ${value}`);
}

function selfTest(base) {
  const probes = [
    ["missing source", (copy) => { copy.entries[0].provenance_ref = ""; }, /missing provenance_ref/],
    ["source outside snapshot", (copy) => { copy.entries[0].provenance_ref = "game-base:names-peoples/sources/book_evidence_m2c_names_b2.csv#source_line=L999"; }, /unresolved provenance_ref/],
    ["unknown people_ref", (copy) => { copy.entries[0].people_ref = "pp_unknown"; }, /unknown people_ref/],
    ["unknown foreign pool people_ref", (copy) => { copy.source.foreign_pools[0].people_ref = "pp_unknown"; }, /unknown people_ref/],
    ["duplicate key", (copy) => { copy.entries.push({ ...copy.entries[0], id: "probe_duplicate" }); }, /duplicate selection key/],
    ["empty upstream source", (copy) => { copy.sourceRows[0].source_refs = ""; }, /empty upstream source_refs/],
    ["generated report drift", (copy) => { copy.report.total_entries += 1; }, /generated report drift/],
    ["invalid pool status", (copy) => { copy.pools[0].status = "candidate"; }, /unknown pool status/],
    ["foreign people mapped to wrong pool", (copy) => { copy.entries.find((row) => row.people_ref === "pp_fg001").name_pool_id = copy.source.pool.id; }, /name_pool_id does not match people_ref/],
    ["missing foreign pool", (copy) => { copy.pools.pop(); }, /pool output does not match configured pools/],
    ["Igoland gap missing", (copy) => { copy.report.typed_gaps = copy.report.typed_gaps.filter((gap) => gap.gap_id !== "gap_personal_names_pp_fg005_igoland_origin"); }, /invalid typed exclusion/],
    ["additional source form absent", (copy) => { copy.source.additional_entries[0].source_form = "не засвидетельствовано"; }, /unresolved additional evidence source/],
    ["additional entry changed", (copy) => { copy.entries.find((row) => row.id === "nov_name_korela_valit_v1").name_form = "Валентин"; }, /additional evidence entry missing or changed/],
    ["D61 candidate leaked into operational pool", (copy) => { copy.entries.push(copy.candidateEntries[0]); }, /D61 candidate rows must stay outside the operational pool/],
    ["D61 candidate omitted from candidate CSV", (copy) => { copy.candidateEntries.pop(); }, /D61 candidate rows must stay outside the operational pool/],
    ["D61 candidate duplicate", (copy) => { copy.candidateEntries.push({ ...copy.candidateEntries[0] }); }, /duplicate D61 candidate entry id/],
    ["names-gaps rationale missing", (copy) => { copy.namesGaps.gap_overrides[0].reason = ""; }, /invalid names-gaps rationale/],
    ["names-gaps applicability missing", (copy) => { copy.namesGaps.v17_applicability.pairs.pop(); }, /invalid names-gaps applicability matrix/],
    ["names-gaps calendar citation mismatch", (copy) => { copy.namesGaps.calendar_rule_review[0].source_ref = "book:641352 §1931"; }, /invalid names-gaps calendar-rule review/],
    ["names-gaps calendar candidate missing", (copy) => { copy.namesGaps.calendar_rule_review.find((row) => row.status === "new_candidate").candidate_entry_id = "missing"; }, /invalid names-gaps calendar-rule review/],
    ["names-gaps D61 candidate duplicate", (copy) => {
      const rows = copy.namesGaps.calendar_rule_review;
      const first = structuredClone(rows.find((row) => row.status === "new_candidate" && row.sex_category === "female"));
      const duplicateIndex = rows.findIndex((row) => row.status === "new_candidate" && row.sex_category === "female" && row.candidate_entry_id !== first.candidate_entry_id);
      rows[duplicateIndex] = first;
      copy.report.names_gaps_additions.calendar_rule_review = structuredClone(rows);
    }, /invalid D61 calendar candidate ID coverage/],
    ["names-gaps D61 candidate omitted", (copy) => {
      const row = copy.namesGaps.calendar_rule_review.find((item) => item.status === "new_candidate" && item.sex_category === "male");
      row.candidate_entry_id = "nov_name_korela_valit_v1";
      copy.report.names_gaps_additions.calendar_rule_review = structuredClone(copy.namesGaps.calendar_rule_review);
    }, /invalid D61 calendar candidate ID coverage/],
    ["names-gaps calendar confidence drift", (copy) => { copy.namesGaps.calendar_rule_review.find((row) => row.status === "new_candidate").confidence = "A"; }, /invalid names-gaps calendar-rule review/],
    ["names-gaps calendar rule basis missing", (copy) => { copy.namesGaps.calendar_rule_review.find((row) => row.status === "new_candidate").rule_basis_refs.pop(); }, /invalid names-gaps calendar-rule review/],
    ["names-gaps v17 not-applicable report drift", (copy) => { delete copy.report.typed_gaps.find((row) => row.gap_id === "gap_personal_names_fg001_female").v17_status; }, /names-gaps rationale missing from report/],
    ["invalid pool date", (copy) => { copy.pools[0].valid_to = "1229-12-31"; }, /invalid validity interval/],
    ["unknown pool region", (copy) => { copy.pools[0].region_id = "region_unknown"; }, /unknown region_id/],
    ["missing pool provenance", (copy) => { copy.report.pool_provenance_ref = ""; }, /missing pool provenance_ref/],
    ["unknown derivation", (copy) => { copy.entries[0].derivation = "guessed"; }, /unknown derivation/],
    ["unknown class derivation", (copy) => { copy.entries[0].derivation_class = "guessed"; }, /unknown derivation_class/],
    ["calendar class on significant", (copy) => { copy.entries.find((row) => row.selection_class === "significant").derivation_class = "calendar_name_any_christian"; }, /calendar class derivation requires ordinary/],
    ["calendar name missing class derivation", (copy) => { copy.entries.find((row) => row.derivation_class === "calendar_name_any_christian").derivation_class = ""; }, /calendar name missing class derivation/],
    ["unknown people derivation", (copy) => { copy.entries[0].people_derivation = "guessed"; }, /unknown people_derivation/],
    ["unknown evidence period", (copy) => { copy.entries[0].evidence_period = "modern"; }, /unknown evidence_period/],
    ["missing evidence decision", (copy) => { copy.report.evidence_accounting.decisions.pop(); }, /evidence accounting decisions drift/],
    ["unknown exclusion reason", (copy) => { copy.derivationRows.find((row) => row.exclude_reason).exclude_reason = "guessed"; }, /unknown exclusion reason/],
    ["source form absent from snapshot", (copy) => { copy.derivationRows.find((row) => !row.exclude_reason).source_form = "not-in-snapshot"; }, /source_form absent from snapshot/],
    ["wrong unique key contract", (copy) => { copy.importContract.tables["world_base.region_name_pool_entries"].unique_key = ["name_pool_id", "name_form"]; }, /wrong entry unique key contract/],
    ["closed default gap leaked", (copy) => { copy.d46.name_gaps.find((row) => row.name_form === "Василиса").gap_type = "lower_weight_required"; }, /invalid closed-list default gap/],
    ["lower-weight gap leaked", (copy) => { copy.d46.name_gaps.find((row) => row.name_form === "Ольга").selection_status = "selectable"; }, /invalid lower-weight gap/],
    ["Turkic selector gap leaked", (copy) => { copy.d46.name_gaps.find((row) => row.name_form === "Гюлопа").people_ref = "pp_novgorod_rus"; }, /invalid Turkic selector gap/],
    ["snapshot hash drift", (copy) => { copy.d46.snapshots.onomastic_catalog.sha256 = "0".repeat(64); }, /D46 snapshot mismatch/],
    ["treaty Latin reading leaked", (copy) => { copy.d46.name_entries.find((row) => row.source_forms?.includes("Adam")).name_form = "Adam"; }, /invalid treaty reading/],
  ];
  for (const [name, mutate, expected] of probes) {
    const copy = structuredClone(base);
    mutate(copy);
    assert.match(validate(copy).join("\n"), expected, `${name} probe did not fail as expected`);
    console.log(`self-test PASS: ${name}`);
  }
  const dynastic = base.entries.find((row) => row.selection_class === "dynastic");
  assert(dynastic, "self-test fixture requires a dynastic entry");
  assert.throws(() => assertOrdinarySelection([dynastic]), /forbidden selection class/, "dynastic ordinary-selection probe did not fail");
  console.log("self-test PASS: dynastic in ordinary selection");
  const significant = base.entries.find((row) => row.selection_class === "significant");
  assert(significant, "self-test fixture requires a significant entry");
  assert.throws(() => assertOrdinarySelection([significant]), /forbidden selection class/, "significant ordinary-selection probe did not fail");
  console.log("self-test PASS: significant in ordinary selection");
  const monastic = base.entries.find((row) => row.selection_class === "monastic");
  assert(monastic, "self-test fixture requires a monastic entry");
  assert.throws(() => assertOrdinarySelection([monastic]), /forbidden selection class/, "monastic ordinary-selection probe did not fail");
  console.log("self-test PASS: monastic in ordinary selection");
  assert.equal(selectOrdinary(base.entries, { sex_category: "male", people_ref: "pp_novgorod_rus", social_position_archetype_id: "free_urban_householder" }).length, 0);
  console.log("self-test PASS: draft row excluded from runtime selection");
  assert.throws(() => validateRevisionParameter("", new Set(["world_revision_test"])), /missing world_revision_id/);
  console.log("self-test PASS: missing world_revision_id");
  assert.throws(() => validateRevisionParameter("world_revision_unknown", new Set(["world_revision_test"])), /unknown world_revision_id/);
  console.log("self-test PASS: unknown world_revision_id");
  const badPoolHeader = structuredClone(base);
  badPoolHeader.poolHeader[0] = "name_pool_id";
  assert.match(validate(badPoolHeader).join("\n"), /wrong pool header/);
  console.log("self-test PASS: wrong physical PK header");

  // D46 deterministic probes: local classes, origin bounds, gaps and variant semantics.
  const byId = new Map(base.entries.map((row) => [row.id, row]));
  assert.deepEqual([byId.get("nov_name_d46_13_034_v1")?.name_form, byId.get("nov_name_d46_13_034_v1")?.people_ref], ["Борята", "pp_novgorod_rus"]);
  assert.deepEqual([byId.get("nov_name_d46_13_018_v1")?.name_form, byId.get("nov_name_d46_13_018_v1")?.sex_category], ["Агафья", "female"]);
  assert.equal(byId.get("nov_name_d46_13_262_v1")?.selection_class, "dynastic");
  assert.equal(byId.get("nov_name_d46_13_029_v1")?.selection_class, "monastic");
  assert.equal(byId.get("nov_name_d46_13_001_v1")?.people_ref, "pp_fg002");
  assert.deepEqual([byId.get("nov_name_d46_13_250_v1")?.name_form, byId.get("nov_name_d46_13_250_v1")?.people_ref], ["Хейльватр", "pp_fg001"]);
  assert.equal(byId.has("nov_name_d46_13_093_v1"), false);
  assert.equal(base.report.typed_gaps.some((gap) => gap.gap_id === "gap_personal_names_pp_fg005_igoland_origin"), true);
  assert.equal(byId.get("nov_name_evidence_l41_02_v1")?.name_form, "Филипп");
  assert.equal(byId.get("nov_name_evidence_l41_02_v1")?.people_ref, "pp_izhora");
  assert.equal(byId.get("nov_name_evidence_l41_02_v1")?.selection_class, "ordinary");
  assert.deepEqual([byId.get("nov_name_korela_valit_v1")?.name_form, byId.get("nov_name_korela_valit_v1")?.people_ref, byId.get("nov_name_korela_valit_v1")?.selection_class, byId.get("nov_name_korela_valit_v1")?.evidence_period], ["Валит", "pp_korela", "significant", "medieval_general"]);
  const olsten = byId.get("nov_name_evidence_l93_03_v1");
  assert.equal(olsten?.selection_class, "significant");
  assert.equal(olsten?.evidence_period, "medieval_general");
  assert.equal(base.d46.rejected.length, 0);
  assert.deepEqual([...DEFAULT_BLOCKED_FORMS].sort(), base.d46.name_gaps.filter((row) => row.gap_type === "default_1230_1250_requires_new_evidence").map((row) => row.name_form).sort());
  assert.deepEqual([...LOWER_WEIGHT_FORMS].sort(), base.d46.name_gaps.filter((row) => row.gap_type === "lower_weight_required").map((row) => row.name_form).sort());
  assert.deepEqual([...TURKIC_GAP_FORMS].sort(), base.d46.name_gaps.filter((row) => row.gap_type === "people_ref_unresolved").map((row) => row.name_form).sort());
  assert(base.d46.name_variants.some((row) => row.variant_form === "Никита" && row.target_refs.includes("names-peoples/personal_names/name_pool_entries.csv#nov_name_evidence_l24_01_v1")));
  assert(base.d46.name_variants.some((row) => row.variant_form === "Hæil(h)vatr" && row.target_refs.includes("names-peoples/personal_names/d46-name-additions.json#name-entry=nov_name_d46_13_250_v1")));
  for (const form of ["Гюрьги", "Кузма", "Сёмюн"]) assert(base.d46.name_variants.some((row) => row.variant_form === form && row.classification === "normalized_variant"));
  console.log("self-test PASS: D46 first-name probes");
}

const importContract = JSON.parse(fs.readFileSync(IMPORT_CONTRACT_PATH, "utf8"));
const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
const d46 = JSON.parse(fs.readFileSync(D46_PATH, "utf8"));
const namesGaps = JSON.parse(fs.readFileSync(NAMES_GAPS_PATH, "utf8"));
const snapshotContents = Object.fromEntries(Object.values(d46.snapshots).map((snapshot) => [snapshot.path, fs.readFileSync(path.join(GROUP_DIR, snapshot.path), "utf8")]));
const base = {
  pools: rows(path.join(NAMES_DIR, "name_pools.csv")),
  entries: rows(path.join(NAMES_DIR, "name_pool_entries.csv")),
  candidateEntries: rows(CANDIDATE_ENTRIES_PATH),
  sourceRows: rows(path.join(NAMES_DIR, "personal_names.csv")),
  derivationRows: parseTsv(fs.readFileSync(path.join(NAMES_DIR, source.evidence_derivations.path), "utf8")),
  evidenceRows: rows(path.join(GROUP_DIR, source.evidence_snapshot.path)),
  additionalEvidenceRows: rows(path.join(GROUP_DIR, source.additional_evidence_snapshot.path)),
  peopleRows: rows(PEOPLE_PATH),
  socialIds: socialPositionIds(),
  report: JSON.parse(fs.readFileSync(REPORT_PATH, "utf8")),
  importContract,
  source,
  d46,
  namesGaps,
  snapshotContents,
  poolHeader: header(path.join(NAMES_DIR, "name_pools.csv")),
  entryHeader: header(path.join(NAMES_DIR, "name_pool_entries.csv")),
  candidateEntryHeader: header(CANDIDATE_ENTRIES_PATH),
};
const errors = validate(base);
if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exitCode = 1;
} else {
  const ordinary = selectOrdinary(base.entries, { sex_category: "male", people_ref: "pp_novgorod_rus", social_position_archetype_id: "free_urban_householder" });
  console.log(`PASS entries=${base.entries.length} approved_ordinary_probe=${ordinary.length}`);
  if (process.argv.includes("--self-test")) selfTest(base);
}
