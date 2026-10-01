import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const GROUP_DIR = path.resolve(SCRIPT_DIR, "..");
const NAMES_DIR = path.join(GROUP_DIR, "personal_names");
const SOURCE_PATH = path.join(NAMES_DIR, "b2-name-pool-source.json");
const D46_PATH = path.join(NAMES_DIR, "d46-name-additions.json");
const NAMES_GAPS_PATH = path.join(NAMES_DIR, "names-gaps-additions.json");
const IMPORT_CONTRACT_PATH = path.join(NAMES_DIR, "b2-import-contract.json");
const PEOPLE_PATH = path.join(GROUP_DIR, "peoples_origins", "peoples_origins.csv");
const POOLS_OUT = path.join(NAMES_DIR, "name_pools.csv");
const ENTRIES_OUT = path.join(NAMES_DIR, "name_pool_entries.csv");
const REPORT_OUT = path.join(NAMES_DIR, "name-pool-report.json");
const DERIVATION_HEADER = ["evidence_line", "source_form", "name_form", "sex_category", "people_ref", "people_derivation", "selection_class", "derivation", "evidence_period", "exclude_reason"];
const CLASS_PRIORITY = ["ordinary", "dynastic", "significant", "monastic"];
const DERIVATION_PRIORITY = ["explicit_source_gender", "calendar_name_gender", "compiled_candidate"];
const PEOPLE_DERIVATION_PRIORITY = ["source_explicit_people", "novgorod_land_document", "candidate_origin"];
const PERIOD_PRIORITY = ["c1230", "medieval_general", "candidate_compiled"];
const CALENDAR_CLASS_DERIVATION = "calendar_name_any_christian";
export const EXCLUSION_REASONS = new Set([
  "no_eligible_first_name",
  "people_ref_unresolved",
  "period_outside_supported_xi_xiv",
  "personal_name_form_ambiguous",
  "sex_category_unresolved",
  "source_requires_separate_temporal_verification",
]);

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ""; }
    else if (c === '\n') { row.push(field.replace(/\r$/, "")); if (row.some((value) => value !== "")) rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("unterminated quoted CSV field");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const [header, ...body] = rows;
  if (!header) return [];
  return body.map((values, index) => {
    if (values.length !== header.length) throw new Error(`CSV row ${index + 2}: ${values.length} fields, expected ${header.length}`);
    return Object.fromEntries(header.map((key, i) => [key, values[i]]));
  });
}

export function parseTsv(text) {
  const [headerLine, ...lines] = text.replace(/\r?\n$/, "").split(/\r?\n/);
  const header = headerLine.split("\t");
  if (header.join("\t") !== DERIVATION_HEADER.join("\t")) throw new Error(`wrong evidence-derivation header: ${header.join("\t")}`);
  return lines.filter(Boolean).map((line, index) => {
    const values = line.split("\t");
    if (values.length !== header.length) throw new Error(`TSV row ${index + 2}: ${values.length} fields, expected ${header.length}`);
    return Object.fromEntries(header.map((key, i) => [key, values[i]]));
  });
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeCsv(file, header, rows) {
  const lines = [header.join(","), ...rows.map((row) => header.map((key) => csvCell(row[key])).join(","))];
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function selectionClass(row, source) {
  return source.selection_overrides[row.nm_id]?.selection_class ?? source.selection_rules[row.status_band];
}

function classDerivation(row, source) {
  const calendarNameForms = new Set(source.selection_rules.calendar_name_forms);
  return row.selection_class === "ordinary"
    && (row.derivation === "calendar_name_gender" || calendarNameForms.has(row.name_form))
    ? CALENDAR_CLASS_DERIVATION
    : "";
}

function ranked(values, priority) {
  for (const value of priority) if (values.includes(value)) return value;
  throw new Error(`unranked value: ${values.join(",")}`);
}

function orderedUnique(values, priority = []) {
  return [...new Set(values)].sort((a, b) => {
    const ai = priority.indexOf(a), bi = priority.indexOf(b);
    if (ai >= 0 || bi >= 0) return (ai < 0 ? priority.length : ai) - (bi < 0 ? priority.length : bi);
    return a.localeCompare(b, "en");
  });
}

export function build() {
  const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
  const d46 = JSON.parse(fs.readFileSync(D46_PATH, "utf8"));
  const namesGaps = JSON.parse(fs.readFileSync(NAMES_GAPS_PATH, "utf8"));
  const importContract = JSON.parse(fs.readFileSync(IMPORT_CONTRACT_PATH, "utf8"));
  const input = parseCsv(fs.readFileSync(path.join(NAMES_DIR, source.input.path), "utf8"));
  const decisionRows = parseTsv(fs.readFileSync(path.join(NAMES_DIR, source.evidence_derivations.path), "utf8"));
  const derivations = decisionRows.filter((row) => !row.exclude_reason);
  const exclusions = decisionRows.filter((row) => row.exclude_reason);
  const evidence = parseCsv(fs.readFileSync(path.join(GROUP_DIR, source.evidence_snapshot.path), "utf8"));
  const additionalEvidence = parseCsv(fs.readFileSync(path.join(GROUP_DIR, source.additional_evidence_snapshot.path), "utf8"));
  const peoples = parseCsv(fs.readFileSync(PEOPLE_PATH, "utf8"));
  if (input.length !== source.input.expected_rows) throw new Error(`personal-name input count ${input.length}, expected ${source.input.expected_rows}`);
  if (evidence.length !== source.evidence_snapshot.expected_rows) throw new Error(`evidence snapshot count ${evidence.length}, expected ${source.evidence_snapshot.expected_rows}`);
  if (additionalEvidence.length !== source.additional_evidence_snapshot.expected_rows) throw new Error(`additional evidence snapshot count ${additionalEvidence.length}, expected ${source.additional_evidence_snapshot.expected_rows}`);

  const decisionsByLine = new Map();
  for (const row of decisionRows) {
    const line = Number(row.evidence_line);
    if (!Number.isInteger(line) || line < source.evidence_derivations.expected_first_line || line > source.evidence_derivations.expected_last_line) throw new Error(`invalid evidence line ${row.evidence_line}`);
    if (!decisionsByLine.has(line)) decisionsByLine.set(line, []);
    decisionsByLine.get(line).push(row);
  }
  for (let line = source.evidence_derivations.expected_first_line; line <= source.evidence_derivations.expected_last_line; line += 1) {
    const rows = decisionsByLine.get(line) ?? [];
    if (!rows.length) throw new Error(`evidence line ${line}: missing decision`);
    if (rows.some((row) => row.exclude_reason) && (rows.length !== 1 || !EXCLUSION_REASONS.has(rows[0].exclude_reason))) throw new Error(`evidence line ${line}: invalid exclusion decision`);
  }
  if (decisionsByLine.size !== source.evidence_derivations.expected_evidence_rows) throw new Error(`decision count ${decisionsByLine.size}, expected ${source.evidence_derivations.expected_evidence_rows}`);

  const snapshotByLine = new Map(evidence.map((row) => [Number(row.source_line.slice(1)), row]));
  if (snapshotByLine.size !== evidence.length || evidence.some((row) => !/^L\d+$/.test(row.source_line))) throw new Error("evidence snapshot has duplicate or invalid source_line");
  const includedLines = new Set(derivations.map((row) => Number(row.evidence_line)));
  if (includedLines.size !== evidence.length || [...includedLines].some((line) => !snapshotByLine.has(line)) || [...snapshotByLine].some(([line]) => !includedLines.has(line))) throw new Error("evidence snapshot does not exactly match included decisions");

  const selectablePeople = peoples.filter((row) => ["people", "guest_itinerant"].includes(row.entity_kind));
  const selectablePeopleIds = new Set(selectablePeople.map((row) => row.pp_id));
  const records = input.map((row) => {
    const record = {
      id: row.nm_id,
      name_form: row.name_form,
      sex_category: row.sex,
      people_ref: `${source.defaults.people_ref_prefix}${row.people_ref}`,
      selection_class: selectionClass(row, source),
      derivation: "compiled_candidate",
      people_derivation: "candidate_origin",
      evidence_period: "candidate_compiled",
      provenance_ref: `${source.input.provenance_prefix}${row.nm_id}`,
      evidence_line: null,
      line_index: null,
    };
    return { ...record, derivation_class: classDerivation(record, source) };
  });
  for (const row of d46.name_entries) records.push({
    id: row.id,
    name_form: row.name_form,
    sex_category: row.sex_category,
    people_ref: row.people_ref,
    selection_class: row.selection_class,
    derivation_class: row.derivation_class,
    derivation: row.derivation,
    people_derivation: row.people_derivation,
    evidence_period: row.evidence_period,
    provenance_ref: `game-base:names-peoples/personal_names/d46-name-additions.json#name-entry=${row.id}`,
    evidence_line: null,
    line_index: null,
  });
  const additionalEvidenceByLine = new Map(additionalEvidence.map((row) => [row.source_line, row]));
  for (const row of source.additional_entries ?? []) {
    const support = additionalEvidenceByLine.get(row.source_line);
    if (!support || !row.source_form || !Object.values(support).join("\n").includes(row.source_form)) throw new Error(`${row.id}: additional source form missing from ${row.source_line}`);
    records.push({
      id: row.id,
      name_form: row.name_form,
      sex_category: row.sex_category,
      people_ref: row.people_ref,
      selection_class: row.selection_class,
      derivation_class: row.derivation_class,
      derivation: row.derivation,
      people_derivation: row.people_derivation,
      evidence_period: row.evidence_period,
      provenance_ref: row.provenance_ref,
      evidence_line: null,
      line_index: null,
    });
  }

  const perLineIndex = new Map();
  for (const row of derivations) {
    const line = Number(row.evidence_line);
    if (!selectablePeopleIds.has(row.people_ref)) throw new Error(`evidence line ${line}: unknown selectable people_ref ${row.people_ref}`);
    const snapshotText = Object.values(snapshotByLine.get(line)).join("\n");
    if (!row.source_form || !snapshotText.includes(row.source_form)) throw new Error(`evidence line ${line}: source_form not found in snapshot: ${row.source_form}`);
    const lineIndex = (perLineIndex.get(line) ?? 0) + 1;
    perLineIndex.set(line, lineIndex);
    records.push({ ...row, derivation_class: classDerivation(row, source), evidence_line: line, line_index: lineIndex, provenance_ref: `${source.evidence_snapshot.provenance_prefix}${line}` });
  }

  const groups = new Map();
  for (const record of records) {
    const key = [record.name_form, record.sex_category, record.people_ref].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const entries = [...groups.values()].filter((group) => {
    const candidateId = group.find((row) => row.id)?.id;
    return !source.entry_exclusions?.some((exclusion) => exclusion.id === candidateId);
  }).map((group) => {
    const candidate = group.find((row) => row.id);
    const firstEvidence = group.filter((row) => row.evidence_line != null).sort((a, b) => a.evidence_line - b.evidence_line || a.line_index - b.line_index)[0];
    const id = candidate?.id ?? `nov_name_evidence_l${firstEvidence.evidence_line}_${String(firstEvidence.line_index).padStart(2, "0")}_v1`;
    const selectionClassValue = ranked(group.map((row) => row.selection_class), CLASS_PRIORITY);
    const peopleRef = group[0].people_ref;
    const namePoolId = source.people_to_pool_id?.[peopleRef] ?? (peopleRef === "pp_novgorod_rus" ? source.pool.id : "");
    if (!namePoolId) throw new Error(`${id}: no name pool configured for ${peopleRef}`);
    return {
      id,
      name_pool_id: namePoolId,
      name_form: group[0].name_form,
      name_category_id: "",
      weight: source.defaults.weight,
      sex_category: group[0].sex_category,
      people_ref: group[0].people_ref,
      social_position_archetype_id: source.defaults.social_position_archetype_id ?? "",
      selection_class: selectionClassValue,
      derivation_class: selectionClassValue === "ordinary" && group.some((row) => row.derivation_class === CALENDAR_CLASS_DERIVATION) ? CALENDAR_CLASS_DERIVATION : "",
      derivation: ranked(group.map((row) => row.derivation), DERIVATION_PRIORITY),
      people_derivation: ranked(group.map((row) => row.people_derivation), PEOPLE_DERIVATION_PRIORITY),
      evidence_period: orderedUnique(group.map((row) => row.evidence_period), PERIOD_PRIORITY).join("|"),
      status: source.defaults.status,
      provenance_ref: orderedUnique(group.map((row) => row.provenance_ref)).join(" | "),
    };
  }).sort((a, b) => a.id.localeCompare(b.id, "en"));

  const pools = [source.pool, ...(source.foreign_pools ?? [])];
  writeCsv(POOLS_OUT, importContract.tables["world_base.region_name_pools"].csv_columns, pools.map((pool) => ({
    id: pool.id,
    region_id: pool.region_id,
    valid_from: pool.valid_from,
    valid_to: pool.valid_to,
    status: pool.status,
  })));
  writeCsv(ENTRIES_OUT, importContract.tables["world_base.region_name_pool_entries"].csv_columns, entries);

  const counts = {};
  for (const row of entries) {
    const key = `${row.sex_category}|${row.people_ref}|${row.selection_class}|${row.derivation}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const ordinaryCounts = {};
  for (const row of entries.filter((entry) => entry.selection_class === "ordinary")) {
    const key = `${row.sex_category}|${row.people_ref}`;
    ordinaryCounts[key] = (ordinaryCounts[key] ?? 0) + 1;
  }
  const typedGaps = [];
  for (const peopleRef of [...selectablePeopleIds].sort()) {
    for (const sex of ["female", "male"]) {
      const count = ordinaryCounts[`${sex}|${peopleRef}`] ?? 0;
      if (count < 10) typedGaps.push({
        gap_id: `gap_personal_names_${peopleRef.slice(3)}_${sex}`,
        gap_type: "ordinary_pool_below_10",
        people_ref: peopleRef,
        sex_category: sex,
        selection_class: "ordinary",
        current_count: count,
        required_count: 10,
        reason: "No further reviewed evidence row closes first-name form, sex, people and ordinary class under the declared rules.",
        provenance_ref: "game-base:names-peoples/sources/book_evidence_m2c_names_b2.csv; game-base:names-peoples/personal_names/coverage-report.json",
      });
    }
  }
  typedGaps.push(...source.typed_gap_notes);
  typedGaps.push(...(source.entry_exclusions ?? []).map((gap) => ({
    gap_id: gap.gap_id,
    gap_type: gap.gap_type,
    name_id: gap.id,
    name_form: gap.name_form,
    people_ref: gap.people_ref,
    sex_category: gap.sex_category,
    selection_class: gap.selection_class,
    current_count: 0,
    required_count: 1,
    reason: gap.reason,
    provenance_ref: gap.provenance_ref,
  })));
  typedGaps.push(...d46.name_gaps.map((row) => ({
    gap_id: row.gap_id,
    gap_type: row.gap_type,
    name_id: row.id,
    name_form: row.name_form,
    people_ref: row.people_ref,
    sex_category: row.sex_category,
    selection_class: row.selection_class,
    current_count: 0,
    required_count: 1,
    reason: row.gap_reason,
    provenance_ref: `game-base:names-peoples/personal_names/d46-name-additions.json#name-gap=${row.id}`,
  })));
  for (const gap of namesGaps.gap_overrides) {
    const generated = typedGaps.find((row) => row.gap_id === gap.gap_id);
    if (!generated || generated.gap_type !== gap.gap_type) throw new Error(`${gap.gap_id}: no matching generated typed gap`);
    generated.reason = gap.reason;
    generated.review_refs = [
      `game-base:names-peoples/personal_names/names-gaps-additions.json#gap_id=${gap.gap_id}`,
      ...gap.evidence_refs,
    ];
  }

  const includedByLine = new Map();
  for (const row of derivations) {
    const line = Number(row.evidence_line);
    if (!includedByLine.has(line)) includedByLine.set(line, []);
    includedByLine.get(line).push(row);
  }
  const decisions = [];
  for (let evidenceLine = source.evidence_derivations.expected_first_line; evidenceLine <= source.evidence_derivations.expected_last_line; evidenceLine += 1) {
    const included = includedByLine.get(evidenceLine);
    if (!included) {
      decisions.push({ evidence_line: evidenceLine, status: "excluded", reason: decisionsByLine.get(evidenceLine)[0].exclude_reason });
    } else {
      decisions.push({
        evidence_line: evidenceLine,
        status: "included",
        derivations: orderedUnique(included.map((item) => item.derivation), DERIVATION_PRIORITY),
        name_forms: orderedUnique(included.map((item) => item.name_form)),
        source_forms: orderedUnique(included.map((item) => item.source_form)),
      });
    }
  }
  const includedRowsByDerivation = {};
  const includedRecordsByDerivation = {};
  const excludedRowsByReason = {};
  for (const decision of decisions) {
    if (decision.status === "included") {
      const key = decision.derivations.join("+");
      includedRowsByDerivation[key] = (includedRowsByDerivation[key] ?? 0) + 1;
    } else excludedRowsByReason[decision.reason] = (excludedRowsByReason[decision.reason] ?? 0) + 1;
  }
  for (const row of derivations) includedRecordsByDerivation[row.derivation] = (includedRecordsByDerivation[row.derivation] ?? 0) + 1;

  const report = {
    schema: "novgorod.game_base.personal_name_pool_report.v2",
    status: source.status,
    total_entries: entries.length,
    pool_count: pools.length,
    counts_by_pool: Object.fromEntries(pools.map((pool) => [pool.id, entries.filter((entry) => entry.name_pool_id === pool.id).length])),
    counts_by_sex_people_selection_class_derivation: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, "en"))),
    evidence_accounting: {
      total_rows: source.evidence_derivations.expected_evidence_rows,
      included_rows: includedByLine.size,
      included_derived_records: derivations.length,
      included_rows_by_derivation: Object.fromEntries(Object.entries(includedRowsByDerivation).sort(([a], [b]) => a.localeCompare(b, "en"))),
      included_records_by_derivation: Object.fromEntries(Object.entries(includedRecordsByDerivation).sort(([a], [b]) => a.localeCompare(b, "en"))),
      excluded_rows: exclusions.length,
      excluded_rows_by_reason: Object.fromEntries(Object.entries(excludedRowsByReason).sort(([a], [b]) => a.localeCompare(b, "en"))),
      decisions,
    },
    d46_archive_accounting: {
      unique_new_candidates: d46.source_scope.expected_unique_new_candidates,
      included_name_entries: d46.name_entries.length,
      included_component_entries: d46.component_entries.length,
      existing_component_updates: d46.component_updates.length,
      archive_variants: d46.name_variants.filter((row) => row.classification === "archive_variant").length,
      reclassified_candidate_variants: d46.name_variants.filter((row) => row.classification !== "archive_variant").length,
      variants: d46.name_variants.length,
      typed_name_gaps: d46.name_gaps.length,
      rejected: d46.rejected.length,
      rejection_reasons: Object.fromEntries([...new Set(d46.rejected.map((row) => row.rejection_reason))].sort().map((reason) => [reason, d46.rejected.filter((row) => row.rejection_reason === reason).length])),
    },
    additional_evidence_accounting: {
      snapshot_rows: additionalEvidence.length,
      included_entries: (source.additional_entries ?? []).length,
    },
    names_gaps_additions: {
      candidate_entries: namesGaps.entries.length,
      detailed_gap_overrides: namesGaps.gap_overrides.length,
      selection_window: namesGaps.selection_window,
      applicability_review: namesGaps.v17_applicability,
      calendar_rule_review: namesGaps.calendar_rule_review,
    },
    typed_gaps: typedGaps,
    evidence_review: source.evidence_review,
    import_contract: "b2-import-contract.json",
    pool_provenance_ref: source.pool.provenance_ref,
    pool_provenance_refs: Object.fromEntries(pools.map((pool) => [pool.id, pool.provenance_ref])),
  };
  fs.writeFileSync(REPORT_OUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    pools: pools.length,
    entries: entries.length,
    counts,
    evidence: {
      total_rows: report.evidence_accounting.total_rows,
      included_rows: report.evidence_accounting.included_rows,
      included_derived_records: report.evidence_accounting.included_derived_records,
      excluded_rows: report.evidence_accounting.excluded_rows,
    },
    typed_gaps: typedGaps.length,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
