#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Deterministic checks for group households-psychology-speech (candidate).
Run after build.py. Exits non-zero on any failed check."""
import csv, hashlib, json, os, sys, ast, re, copy, unicodedata
from collections import Counter
from build import literacy_register, load_psychology_scales

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors = []


def read_csv(path):
    with open(path, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def parse_literal(v):
    if v == "":
        return None
    try:
        return ast.literal_eval(v)
    except Exception:
        try:
            return json.loads(v)
        except Exception:
            return v


# households_kinship: every row has source_refs and confidence in {A,B,C}
for fname in ["household_composition_profiles.csv", "marriage_inheritance_rules.csv", "kinship_terms.csv"]:
    path = os.path.join(ROOT, "households_kinship", fname)
    rows = read_csv(path)
    if not rows:
        errors.append(f"{fname}: no rows")
    for i, r in enumerate(rows):
        if not r.get("source_refs"):
            errors.append(f"{fname} row {i}: missing source_refs")
        if r.get("confidence") not in ("A", "B", "C"):
            errors.append(f"{fname} row {i}: confidence not in A/B/C: {r.get('confidence')!r}")

# npc_psychology: one authored dictionary and one exact even baseline
PSYCHOLOGY_PROFILE_FIELDS = ["ps_id", "role_or_occupation_ref", "ref_kind", "temperament_weights", "values_weights",
                             "motives", "fears", "risk_traits", "fears_motives_note", "initial_mood_rules",
                             "derivation_rule", "source_refs", "confidence"]
pp_path = os.path.join(ROOT, "npc_psychology", "psychology_profiles.csv")
with open(pp_path, encoding="utf-8", newline="") as f:
    pp_reader = csv.DictReader(f)
    if pp_reader.fieldnames != PSYCHOLOGY_PROFILE_FIELDS:
        errors.append(f"psychology_profiles.csv: schema mismatch: {pp_reader.fieldnames}")
    pp_rows = list(pp_reader)

# Deferred B2 #161 backlog: report-only; no profile consumer or schema extension.
deferred_path = os.path.join(ROOT, "reports", "deferred_psychology_variants.csv")
deferred_fields = ["variant_name", "source_paths", "archive_refs", "target_path",
                   "profile_ref", "typed_status", "note", "issues"]
with open(deferred_path, encoding="utf-8", newline="") as f:
    deferred_reader = csv.DictReader(f)
    if deferred_reader.fieldnames != deferred_fields:
        errors.append(f"deferred_psychology_variants.csv: schema mismatch: {deferred_reader.fieldnames}")
    deferred_rows = list(deferred_reader)
if len(deferred_rows) != 380:
    errors.append(f"deferred_psychology_variants.csv: expected 380 rows, found {len(deferred_rows)}")
profile_ids = {row.get("ps_id") for row in pp_rows}
deferred_keys = set()
for i, row in enumerate(deferred_rows):
    if None in row or any(not isinstance(row.get(field), str) or not row[field].strip() for field in deferred_fields):
        errors.append(f"deferred_psychology_variants.csv row {i}: missing or malformed typed field")
        continue
    if row["target_path"] != "households-psychology-speech/npc_psychology/psychology_profiles.csv":
        errors.append(f"deferred_psychology_variants.csv row {i}: invalid target_path")
    if row["typed_status"] != "deferred_b2_161_no_consumer":
        errors.append(f"deferred_psychology_variants.csv row {i}: invalid typed_status")
    if row["profile_ref"] not in profile_ids:
        errors.append(f"deferred_psychology_variants.csv row {i}: unknown profile_ref {row['profile_ref']!r}")
    key = (" ".join(unicodedata.normalize("NFKC", row["variant_name"]).casefold().split()), row["profile_ref"])
    if key in deferred_keys:
        errors.append(f"deferred_psychology_variants.csv row {i}: duplicate normalized variant_name+profile_ref")
    deferred_keys.add(key)

psychology_scales = load_psychology_scales()
PSYCHOLOGY_EVIDENCE_PATH = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "sources", "books-evidence-v1", "households-psychology-speech.csv")
with open(PSYCHOLOGY_EVIDENCE_PATH, encoding="utf-8", newline="") as f:
    psychology_evidence_refs = {(r["book_id"], r["para_no"]) for r in csv.DictReader(f)}

region_tsv = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(ROOT)))), "novgorod-region")
with open(os.path.join(region_tsv, "novgorod_occupations_v1_enriched.tsv"), encoding="utf-8") as f:
    occupations = {r["occupation_id"]: r for r in csv.DictReader(f, delimiter="\t")}
with open(os.path.join(region_tsv, "novgorod_social_roles_v1_enriched.tsv"), encoding="utf-8") as f:
    roles = {r["role_id"]: r for r in csv.DictReader(f, delimiter="\t")}
all_occ = set(occupations)
all_role = set(roles)
M2C_OCCUPATIONS = {
    "nov_occ_boatman", "nov_occ_fisher", "nov_occ_route_guide", "nov_occ_hunter_trapper",
    "nov_occ_forest_worker", "nov_occ_local_trader", "nov_occ_long_distance_merchant",
    "nov_occ_household_servant",
}
REWORKED_OCCUPATIONS = all_occ - M2C_OCCUPATIONS
addition_path = os.path.join(os.path.dirname(ROOT), "occupations-activities", "occupations", "occupations_additions.csv")
occupation_additions = read_csv(addition_path)
addition_occupation_ids = {r["occupation_id"] for r in occupation_additions}
all_candidate_occ = all_occ | addition_occupation_ids


def normalized_text(value):
    return " ".join(re.sub(r"[^\w\s]", " ", unicodedata.normalize("NFKC", value or "").casefold()).split())


occupation_labels = {}
for occupation_id, row in occupations.items():
    occupation_labels[occupation_id] = {
        row.get("occupation_title", ""), row.get("historical_term", ""), row.get("modern_explanation", "")
    }
for row in occupation_additions:
    occupation_labels[row["occupation_id"]] = {
        row.get("occupation_title_ru", ""), row.get("occupation_title", ""),
        row.get("historical_term", ""), row.get("modern_explanation", "")
    }


def occupation_goal_failures(goal_rows, fear_rows, expected_occupations, authoring_rows):
    failures = []
    gap_kinds = {}
    for index, row in enumerate(authoring_rows):
        item_kind = row.get("item_kind", "")
        if item_kind not in {"gap_goal", "gap_fear"}:
            continue
        occupation_id = row.get("occupation_id", "")
        kind = item_kind.removeprefix("gap_")
        if occupation_id not in expected_occupations:
            failures.append(f"occupation goal/fear authoring row {index}: gap for unknown occupation {occupation_id!r}")
        if not row.get("text_ru", "").strip():
            failures.append(f"occupation goal/fear authoring row {index}: gap needs an explicit reason")
        if row.get("basis") != "gap" or row.get("confidence") != "C" or row.get("status") != "candidate":
            failures.append(f"occupation goal/fear authoring row {index}: gap basis/confidence/status mismatch")
        if (occupation_id, kind) in gap_kinds:
            failures.append(f"occupation goal/fear authoring row {index}: duplicate {kind} gap for {occupation_id}")
        gap_kinds[(occupation_id, kind)] = row.get("text_ru", "")
    expected_fields = ["occupation_id", "item_id", "text_ru", "basis", "source_refs", "confidence", "status"]
    for kind, rows, minimum in (("goal", goal_rows, 3), ("fear", fear_rows, 2)):
        expected_ids = set(expected_occupations)
        keys = set()
        normalized = set()
        counts = Counter()
        for index, row in enumerate(rows):
            if list(row) != expected_fields:
                failures.append(f"occupation_{kind}s row {index}: schema mismatch")
            occupation_id = row.get("occupation_id", "")
            if occupation_id not in expected_ids:
                failures.append(f"occupation_{kind}s row {index}: unknown occupation {occupation_id!r}")
            item_id = row.get("item_id", "")
            key = (occupation_id, item_id)
            if not item_id or key in keys:
                failures.append(f"occupation_{kind}s row {index}: empty or duplicate item_id {key!r}")
            keys.add(key)
            counts[occupation_id] += 1
            if not row.get("text_ru", "").strip():
                failures.append(f"occupation_{kind}s row {index}: empty text_ru")
            norm = " ".join(re.sub(r"[^\w\s]", " ", unicodedata.normalize("NFKC", row.get("text_ru", "")).casefold()).split())
            norm_key = (occupation_id, norm)
            if norm_key in normalized:
                failures.append(f"occupation_{kind}s row {index}: duplicate normalized text for {occupation_id}")
            normalized.add(norm_key)
            if row.get("basis") not in {"sourced", "analogy", "logical_necessity"}:
                failures.append(f"occupation_{kind}s row {index}: invalid basis {row.get('basis')!r}")
            if row.get("confidence") not in {"A", "B", "C"}:
                failures.append(f"occupation_{kind}s row {index}: invalid confidence {row.get('confidence')!r}")
            if row.get("basis") == "logical_necessity" and row.get("confidence") != "C":
                failures.append(f"occupation_{kind}s row {index}: logical_necessity confidence must be C")
            if row.get("status") != "candidate":
                failures.append(f"occupation_{kind}s row {index}: status must be candidate")
            if not row.get("source_refs", "").strip():
                failures.append(f"occupation_{kind}s row {index}: missing source_refs")
        for occupation_id in expected_ids:
            count = counts[occupation_id]
            has_gap = (occupation_id, kind) in gap_kinds
            if count < minimum and not has_gap:
                failures.append(f"occupation_{kind}s: {occupation_id} has {counts[occupation_id]} rows; expected at least {minimum}")
            if count >= minimum and has_gap:
                failures.append(f"occupation_{kind}s: {occupation_id} marks a {kind} gap despite meeting minimum coverage")
    return failures


FORBIDDEN_GOAL_FRAMES = (
    "завершить работу по занятию",
    "сохранить исправным орудие",
    "довести до результата порученную работу",
    "работа x сорвётся из-за утраты",
    "орудие y сломается прежде",
    "при работе случится брак",
    "не удастся избежать дефекта",
    "довести работу занятия",
    "рабочая цепочка занятия",
)


def occupation_text_specificity_failures(goal_rows, fear_rows):
    failures = []
    prefix_occupations = {}
    for kind, rows in (("goal", goal_rows), ("fear", fear_rows)):
        for index, row in enumerate(rows):
            occupation_id = row.get("occupation_id", "")
            text = row.get("text_ru", "")
            normalized = normalized_text(text)
            for frame in FORBIDDEN_GOAL_FRAMES:
                # The variable parts of the two fear frames are arbitrary text.
                if "x сорвётся из-за утраты" in frame:
                    matched = re.search(r"\bработа\b.*\bсорвётся из-за утраты\b", normalized)
                elif "y сломается прежде" in frame:
                    matched = re.search(r"\bорудие\b.*\bсломается прежде\b", normalized)
                else:
                    matched = frame in normalized
                if matched:
                    failures.append(f"occupation_{kind}s row {index}: forbidden template frame {frame!r}")
            labels = occupation_labels.get(occupation_id, set()) if occupation_id in REWORKED_OCCUPATIONS | addition_occupation_ids else set()
            for label in labels:
                label_norm = normalized_text(label)
                if not label_norm or label_norm.startswith("no source") or label_norm.startswith("no_source"):
                    continue
                if len(label_norm.split()) == 1:
                    copied = label_norm in normalized.split()
                else:
                    copied = label_norm in normalized
                if copied:
                    failures.append(f"occupation_{kind}s row {index}: copies occupation name/description {label!r}")
            words = normalized.split()
            if len(words) >= 4:
                prefix_occupations.setdefault(tuple(words[:4]), set()).add(occupation_id)
    for prefix, ids in prefix_occupations.items():
        if len(ids) > 3:
            failures.append(f"occupation pools: first-four-word prefix {prefix!r} occurs in {len(ids)} occupations")
    return failures


goal_path = os.path.join(ROOT, "npc_psychology", "occupation_goals.csv")
fear_path = os.path.join(ROOT, "npc_psychology", "occupation_fears.csv")
occupation_goal_rows = read_csv(goal_path)
occupation_fear_rows = read_csv(fear_path)
authoring_path = os.path.join(ROOT, "npc_psychology", "occupation_goals_fears_authoring.csv")
occupation_authoring_rows = read_csv(authoring_path)
errors.extend(occupation_goal_failures(occupation_goal_rows, occupation_fear_rows, all_candidate_occ, occupation_authoring_rows))
errors.extend(occupation_text_specificity_failures(occupation_goal_rows, occupation_fear_rows))


def psychology_failures(scales, rows):
    failures = []
    expected_schema = {"schema_version", "status", "basis_kind", "decision_ref", "default_weight", "traits", "values"}
    if set(scales) != expected_schema:
        failures.append("psychology_scales.json: schema mismatch")
    for field, expected in (("schema_version", "psychology_scales_v1"), ("status", "candidate"),
                            ("basis_kind", "game_assumption"), ("decision_ref", "D29")):
        if scales.get(field) != expected:
            failures.append(f"psychology_scales.json: {field} must be {expected!r}")
    weight = scales.get("default_weight")
    if type(weight) is not int or weight != 1:
        failures.append("psychology_scales.json: default_weight must be integer 1")
    expected_profiles = []
    for field, minimum, maximum in (("traits", 4, 6), ("values", 5, 7)):
        items = scales.get(field)
        if not isinstance(items, list) or not minimum <= len(items) <= maximum:
            failures.append(f"psychology_scales.json: {field} must contain {minimum}-{maximum} items")
            items = items if isinstance(items, list) else []
        ids = [item.get("id") for item in items if isinstance(item, dict)]
        labels = [item.get("label_ru") for item in items if isinstance(item, dict)]
        if len(ids) != len(items) or any(set(item) != {"id", "label_ru", "context_refs"} for item in items if isinstance(item, dict)):
            failures.append(f"psychology_scales.json: {field} item schema mismatch")
        valid_ids = len(ids) == len(items) and all(isinstance(value, str) and value for value in ids)
        if not valid_ids or len(ids) != len(set(ids)):
            failures.append(f"psychology_scales.json: {field} ids must be non-empty and unique")
        valid_labels = len(labels) == len(items) and all(isinstance(value, str) and value for value in labels)
        if not valid_labels or len(labels) != len(set(labels)):
            failures.append(f"psychology_scales.json: {field} label_ru values must be non-empty and unique")
        for item in items:
            if not isinstance(item, dict):
                continue
            refs = item.get("context_refs")
            if not isinstance(refs, list) or not refs:
                failures.append(f"psychology_scales.json: {field}.{item.get('id')}: context_refs must be non-empty")
                continue
            values = []
            for context in refs:
                if not isinstance(context, dict) or set(context) != {"ref", "usage"}:
                    failures.append(f"psychology_scales.json: {field}.{item.get('id')}: context ref schema mismatch")
                    continue
                ref = context.get("ref")
                match = re.fullmatch(r"book:([0-9]+) §([0-9]+)", ref) if isinstance(ref, str) else None
                if not match:
                    failures.append(f"psychology_scales.json: {field}.{item.get('id')}: invalid context ref {ref!r}")
                elif match.groups() not in psychology_evidence_refs:
                    failures.append(f"psychology_scales.json: {field}.{item.get('id')}: unknown context ref {ref}")
                if context.get("usage") != "context_only_not_distribution_or_individual_override":
                    failures.append(f"psychology_scales.json: {field}.{item.get('id')}: invalid context usage")
                if isinstance(ref, str):
                    values.append(ref)
            if len(values) != len(set(values)):
                failures.append(f"psychology_scales.json: {field}.{item.get('id')}: duplicate context ref")
        expected_profiles.append({item_id: weight for item_id in ids if isinstance(item_id, str)})
    expected_rows = Counter(
        [("occupation", ref, f"ps_occ_{ref}") for ref in all_occ]
        + [("role", ref, f"ps_role_{ref}") for ref in all_role]
    )
    actual_rows = Counter((row.get("ref_kind"), row.get("role_or_occupation_ref"), row.get("ps_id")) for row in rows)
    if actual_rows != expected_rows:
        failures.append("psychology_profiles.csv: profile key multiset differs from exact occupation/role coverage")
    for i, row in enumerate(rows):
        for field, expected in zip(("temperament_weights", "values_weights"), expected_profiles):
            actual = parse_literal(row.get(field, ""))
            if actual != expected:
                failures.append(f"psychology_profiles row {i}: {field} differs from exact baseline")
    return failures


errors.extend(psychology_failures(psychology_scales, pp_rows))
occ_refs = set()
role_refs = set()
for i, r in enumerate(pp_rows):
    if not r.get("derivation_rule"):
        errors.append(f"psychology_profiles row {i}: missing derivation_rule")
    if r["ref_kind"] == "occupation":
        occ_refs.add(r["role_or_occupation_ref"])
    else:
        role_refs.add(r["role_or_occupation_ref"])

schedule_occ = {r["occupation_ref"] for r in read_csv(os.path.join(os.path.dirname(ROOT), "time-calendar-church", "time", "schedules_routines.csv")) if r["occupation_ref"]}
presence = read_csv(os.path.join(os.path.dirname(ROOT), "places-binding", "presence", "people_presence_authoring.csv"))
reachable_occ = ({r["subject_ref"] for r in presence if r["subject_kind"] == "occupation"} | schedule_occ) & all_occ
register_rows = read_csv(os.path.join(ROOT, "speech_address", "speech_registers.csv"))


def register_failures(rows):
    failures = []
    keys = [(r["subject_kind"], r["subject_ref"]) for r in rows]
    expected = {("role", ref) for ref in all_role} | {("occupation", ref) for ref in reachable_occ}
    for key in expected:
        if keys.count(key) != 1:
            failures.append(f"speech_registers: expected one row for {key}, found {keys.count(key)}")
    for i, r in enumerate(rows):
        if keys[i] not in ({("role", ref) for ref in all_role} | {("occupation", ref) for ref in all_occ}):
            failures.append(f"speech_registers row {i}: unknown subject")
        if r["register"] not in {"formal_literate", "plain_oral", "everyday_oral"} or r["confidence"] != "C":
            failures.append(f"speech_registers row {i}: invalid register/confidence")
        source = (occupations if r["subject_kind"] == "occupation" else roles).get(r["subject_ref"])
        if source and r["register"] != literacy_register(source):
            failures.append(f"speech_registers row {i}: register differs from source occupation/role precedence")
    if len(keys) != len(set(keys)):
        failures.append("speech_registers: duplicate subject")
    return failures


errors.extend(register_failures(register_rows))
missing_occ = all_occ - occ_refs
missing_role = all_role - role_refs
if missing_occ:
    errors.append(f"psychology_profiles: {len(missing_occ)} occupations missing a profile (e.g. {sorted(missing_occ)[:5]})")
if missing_role:
    errors.append(f"psychology_profiles: {len(missing_role)} roles missing a profile (e.g. {sorted(missing_role)[:5]})")

# Candidate relations and address forms: exact schemas, resolvable references,
# one evidence channel per row, and a mapped address or explicit gap per rule.
rel_fields = ["rel_rule_id", "scope_kind", "scope_ref", "subject_role_ref", "object_role_ref", "relationship_kind", "direction", "materialization_guard", "source_refs", "rule_ref", "no_source", "confidence", "status"]
form_fields = ["sp_id", "channel", "relationship_kind", "speaker_role_ref", "addressee_role_ref", "register_ref", "form_ru", "situation", "legal_weight_ref", "attestation", "source_refs", "rule_ref", "no_source", "confidence", "status"]


def checked_rows(path, fields, key):
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != fields:
            errors.append(f"{path}: schema mismatch: {reader.fieldnames}")
        rows = list(reader)
    seen = set()
    for i, row in enumerate(rows):
        prefix = f"{os.path.basename(path)} row {i}"
        if None in row or None in row.values():
            errors.append(f"{prefix}: malformed CSV row")
        if not row.get(key) or row[key] in seen:
            errors.append(f"{prefix}: missing or duplicate {key}")
        seen.add(row.get(key))
        if sum(bool(row.get(x)) for x in ("source_refs", "rule_ref", "no_source")) != 1:
            errors.append(f"{prefix}: exactly one evidence channel required")
        if row.get("confidence") not in {"A", "B", "C"} or row.get("status") != "candidate":
            errors.append(f"{prefix}: invalid confidence/status")
    if not rows:
        errors.append(f"{path}: no rows")
    return rows


rel_rows = checked_rows(os.path.join(ROOT, "households_kinship", "relationship_rules.csv"), rel_fields, "rel_rule_id")
af_rows = checked_rows(os.path.join(ROOT, "speech_address", "address_forms.csv"), form_fields, "sp_id")
household_ids = {r["hh_id"] for r in read_csv(os.path.join(ROOT, "households_kinship", "household_composition_profiles.csv"))}
registers = {r["register"] for r in register_rows}
pf_ids = set()
crosswalk = os.path.join(os.path.dirname(ROOT), "places-binding", "places", "crosswalk_scene_templates.csv")
for row in read_csv(crosswalk):
    pf_ids.update(row["pf_ids"].split(";"))
relation_kinds = {r["relationship_kind"] for r in rel_rows}
allowed_relationship_kinds = {"master_servant", "co_resident", "unspecified", "kin_parent_child", "kin_siblings", "kin_uncle_nephew", "spouse", "community_member", "joint_work", "dependent_patron"}
known_rules = {r["term_id"] for r in read_csv(os.path.join(ROOT, "households_kinship", "kinship_terms.csv"))}
known_rules.update(r["mi_id"] for r in read_csv(os.path.join(ROOT, "households_kinship", "marriage_inheritance_rules.csv")))
known_rules.update(r["rel_rule_id"] for r in rel_rows)
evidence_dir = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "sources", "books-evidence-v1")
book_evidence = {}
for file in os.listdir(evidence_dir):
    if file.endswith(".csv"):
        for row in read_csv(os.path.join(evidence_dir, file)):
            book_evidence.setdefault((row["book_id"], row["para_no"]), []).append(row)
wk_dir = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "world-knowledge", "production-v1")
known_wk = set()
for file in os.listdir(wk_dir):
    if file.endswith(".json"):
        with open(os.path.join(wk_dir, file), encoding="utf-8") as f:
            known_wk.update((file, claim["claim_ref"]) for claim in json.load(f).get("claims", []))
editorial_rules = {"editorial_joint_work_acquaintance_c": "Only named actors assigned to work together at the same place and time may be acquainted; no kinship, debt or enmity follows."}


def check_evidence(r, prefix):
    if r["rule_ref"] and r["rule_ref"] not in known_rules | set(editorial_rules):
        errors.append(f"{prefix}: unknown rule_ref")
    if r["source_refs"]:
        for ref in r["source_refs"].split(";"):
            ref = ref.strip()
            book = re.fullmatch(r"book:(\d+) §(\d+)", ref)
            wk = re.fullmatch(r"wk:([^#]+\.json)#(.+)", ref)
            role = re.fullmatch(r"data/novgorod-region/novgorod_social_roles_v1(?:_enriched)?\.tsv#(nov_role_\w+)", ref)
            if not ((book and book.groups() in book_evidence) or (wk and wk.groups() in known_wk) or
                    (role and role[1] in all_role)):
                errors.append(f"{prefix}: unresolved source_ref {ref}")
            if book and book.groups() in book_evidence and r["confidence"] != "C":
                if all(row["period"] in {"medieval_general", "ethnographic_late"} for row in book_evidence[book.groups()]):
                    errors.append(f"{prefix}: book period requires confidence C: {ref}")

for i, r in enumerate(rel_rows):
    prefix = f"relationship_rules row {i}"
    check_evidence(r, prefix)
    if r["relationship_kind"] not in allowed_relationship_kinds:
        errors.append(f"{prefix}: invalid relationship_kind")
    if r["scope_kind"] not in {"role_pair", "household", "neighborhood", "work_assignment"} or r["direction"] not in {"symmetric", "directed"}:
        errors.append(f"{prefix}: invalid scope_kind/direction")
    if r["scope_kind"] == "role_pair" and (r["scope_ref"] or not r["subject_role_ref"] or not r["object_role_ref"]):
        errors.append(f"{prefix}: role_pair needs two roles and no scope_ref")
    if r["scope_kind"] != "role_pair" and (r["subject_role_ref"] or r["object_role_ref"]):
        errors.append(f"{prefix}: scoped rule cannot assert a role pair")
    if r["scope_kind"] == "household" and r["scope_ref"] not in household_ids:
        errors.append(f"{prefix}: unknown household")
    if r["scope_kind"] == "neighborhood" and r["scope_ref"] not in pf_ids:
        errors.append(f"{prefix}: unknown place feature")
    if r["scope_kind"] == "work_assignment" and (r["scope_ref"] or r["relationship_kind"] != "joint_work"):
        errors.append(f"{prefix}: work assignment must be generic joint_work")
    if any(r[x] and r[x] not in all_role | all_occ | schedule_occ for x in ("subject_role_ref", "object_role_ref")):
        errors.append(f"{prefix}: unknown role or occupation")
    if not r["materialization_guard"] or (r["no_source"] and r["relationship_kind"] != "unspecified"):
        errors.append(f"{prefix}: missing guard or unsupported assertion")
    if r["rule_ref"] in editorial_rules and (r["relationship_kind"] != "joint_work" or r["confidence"] != "C"):
        errors.append(f"{prefix}: editorial rule can only assert joint-work acquaintance at C")

for i, r in enumerate(af_rows):
    prefix = f"address_forms row {i}"
    check_evidence(r, prefix)
    if r["relationship_kind"] not in relation_kinds | {"written_letter"} or (r["register_ref"] and r["register_ref"] not in registers):
        errors.append(f"{prefix}: unknown relationship kind or register")
    if r["channel"] not in {"oral", "written"} or (r["relationship_kind"] == "written_letter" and r["channel"] != "written"):
        errors.append(f"{prefix}: invalid oral/written channel")
    if any(r[x] and r[x] not in all_role | all_occ | schedule_occ for x in ("speaker_role_ref", "addressee_role_ref")):
        errors.append(f"{prefix}: unknown role or occupation")
    if r["source_refs"] and (not r["form_ru"] or not r["attestation"]):
        errors.append(f"{prefix}: sourced form needs text and attestation")
    if r["no_source"] and (r["form_ru"] or r["attestation"] or r["confidence"] != "C"):
        errors.append(f"{prefix}: gap must have no form or attestation and confidence C")
    if "поклон от" in r["form_ru"].lower() and "письмо" not in r["situation"].lower():
        errors.append(f"{prefix}: epistolary opening used as oral address")

# Builder and checker derive the same G5-node/season/phase pairs.
from build import starting_pairs, composition_spouse_links, include_composition_spouse_form, generated_id
start_pairs, same_pf_pairs, _, _, intersections, colocated, dead_pairs = starting_pairs()
spouse_links = list(composition_spouse_links())
spouse_rows = [row for row in rel_rows if row["rel_rule_id"].startswith("rel_composition_spouse_")]
if len(spouse_rows) != len(spouse_links):
    errors.append("composition spouse relation count differs from explicit links")
for pf, subject, object_, link in spouse_links:
    link_id = generated_id("rel_composition_spouse_", [pf, link["from_group_id"], link["to_group_id"]])
    matches = [row for row in spouse_rows if row["rel_rule_id"] == link_id]
    if len(matches) != 1 or (matches[0]["subject_role_ref"], matches[0]["object_role_ref"]) != (subject, object_) or not all(part in matches[0]["materialization_guard"] for part in (pf, link["from_group_id"], link["to_group_id"])) or matches[0]["source_refs"].split(";") != link["source_refs"]:
        errors.append(f"{pf}: spouse relation does not carry both slot endpoints")
    if not all(any(form["relationship_kind"] == "spouse" and form["speaker_role_ref"] == speaker and
                   form["addressee_role_ref"] == addressee and link_id in form["situation"] for form in af_rows)
               for speaker, addressee in ((subject, object_), (object_, subject))):
        errors.append(f"{pf}: missing spouse address directions")
    pair = sorted((subject, object_))
    gap_id = generated_id("rel_start_gap_", [*pair, "unspecified", "symmetric"])
    if not any(row["rel_rule_id"] == gap_id and row["relationship_kind"] == "unspecified" for row in rel_rows):
        errors.append(f"{pf}: unlinked holders of the same roles need a neutral relation gap")
    for speaker, addressee in ((subject, object_), (object_, subject)):
        form_id = generated_id("form_start_gap_", [speaker, addressee, "unspecified"])
        if not any(row["sp_id"] == form_id and row["relationship_kind"] == "unspecified" for row in af_rows):
            errors.append(f"{pf}: unlinked {speaker}->{addressee} needs a neutral address gap")


def canonical_id(prefix, fields):
    data = json.dumps(fields, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return prefix + hashlib.sha256(data).hexdigest()[:16]


def check_generated(rows, id_field, prefix, fields, expected):
    failures = []
    generated = [row for row in rows if row[id_field].startswith(prefix)]
    actual = []
    for row in generated:
        key = tuple(row[field] for field in fields)
        actual.append(key)
        id_prefix = "rel_start_joint_work_" if prefix == "rel_start_" and row["relationship_kind"] == "joint_work" else (
            "rel_start_gap_" if prefix == "rel_start_" else prefix)
        if row[id_field] != canonical_id(id_prefix, key):
            failures.append(f"{row[id_field]}: noncanonical generated ID")
    if len(actual) != len(set(actual)):
        failures.append(f"{id_field}: duplicate generated semantic key")
    if len({row[id_field] for row in rows}) != len(rows):
        failures.append(f"{id_field}: duplicate ID")
    if set(actual) != expected:
        failures.append(f"{id_field}: generated semantic coverage differs from starting pairs")
    return failures


static_rel = [row for row in rel_rows if not row["rel_rule_id"].startswith("rel_start_")]
explicit = {(row["subject_role_ref"], row["object_role_ref"]): row["relationship_kind"]
            for row in static_rel if row["scope_kind"] == "role_pair" and row["subject_role_ref"] and row["object_role_ref"]
            and not row["rel_rule_id"].startswith("rel_composition_spouse_")}
expected_rel = set()
expected_forms = set()
static_forms = {(row["speaker_role_ref"], row["addressee_role_ref"], row["relationship_kind"])
                for row in af_rows if not row["sp_id"].startswith("form_start_gap_") and row["channel"] == "oral"}
for a, b in start_pairs:
    kind = explicit.get((a, b), explicit.get((b, a),
           "joint_work" if (a, b) in same_pf_pairs else "unspecified"))
    if (a, b) not in explicit and (b, a) not in explicit:
        expected_rel.add((a, b, kind, "symmetric"))
    for speaker, addressee in ((a, b), (b, a)):
        if (speaker, addressee, kind) not in static_forms:
            expected_forms.add((speaker, addressee, kind))
rel_key_fields = ("subject_role_ref", "object_role_ref", "relationship_kind", "direction")
form_key_fields = ("speaker_role_ref", "addressee_role_ref", "relationship_kind")
errors.extend(check_generated(rel_rows, "rel_rule_id", "rel_start_", rel_key_fields, expected_rel))
errors.extend(check_generated(af_rows, "sp_id", "form_start_gap_", form_key_fields, expected_forms))
if not start_pairs:
    errors.append("starting pairs: empty set")
with open(os.path.join(ROOT, "scripts", "build_report.json"), encoding="utf-8") as f:
    build_report = json.load(f)
start_report = build_report["households_kinship"]


def reachable_report_failures(report):
    return [key for key, value in (("start_colocated_node_season_contexts", colocated),
                                   ("start_phase_intersections", intersections))
            if report.get(key) != value]


register_counts = {kind: {register: sum(r["subject_kind"] == kind and r["register"] == register for r in register_rows)
                          for register in ("formal_literate", "plain_oral", "everyday_oral")}
                   for kind in ("role", "occupation")}
if build_report["speech_address"].get("register_counts") != register_counts:
    errors.append("speech register counts differ from build report")
if reachable_report_failures(start_report):
    errors.append("starting reachable counts differ from build report")
with open(os.path.join(os.path.dirname(ROOT), "places-binding", "presence", "people_composition_authoring.json"), encoding="utf-8") as f:
    gap_rows = json.load(f)["never_created_gaps"]
expected_dead = [{"pair": list(pair), "missing_subjects": [
    {key: gap[key] for key in ("subject_kind", "subject_ref", "reason")}
    for gap in sorted(gap_rows, key=lambda row: row["subject_ref"]) if gap["subject_ref"] in pair]}
    for pair in sorted(dead_pairs)]
if start_report["start_dead_pair_gap_count"] != len(expected_dead) or start_report["start_dead_pair_gaps"] != expected_dead:
    errors.append("starting dead pair gap report differs from source gaps")
for row in rel_rows:
    if row["rel_rule_id"].startswith("rel_start_") and (row["subject_role_ref"], row["object_role_ref"]) in dead_pairs:
        errors.append(f"{row['rel_rule_id']}: generated relation for never-created pair")
for row in af_rows:
    if row["sp_id"].startswith("form_start_") and tuple(sorted((row["speaker_role_ref"], row["addressee_role_ref"]))) in dead_pairs:
        errors.append(f"{row['sp_id']}: generated form for never-created pair")

ferry_pairs = {
    frozenset(("nov_occ_ferryman", "nov_occ_fisher")),
    frozenset(("nov_occ_crossing_guard", "nov_occ_ferryman")),
    frozenset(("nov_occ_crossing_guard", "nov_occ_fisher")),
}


def missing_ferry_pairs(pairs):
    return [f"ferry scene: missing {sorted(pair)}" for pair in ferry_pairs
            if not any(frozenset(roles) == pair and any(pf == "pf_ferry_landing" for _, pf, _ in contexts)
                       for roles, contexts in pairs.items())]


errors.extend(missing_ferry_pairs(start_pairs))

if "--probe" in sys.argv and occupation_goal_rows:
    duplicate_goal_probe = [dict(row) for row in occupation_goal_rows]
    duplicate_goal_probe[1]["text_ru"] = duplicate_goal_probe[0]["text_ru"]
    if not occupation_goal_failures(duplicate_goal_probe, occupation_fear_rows, all_candidate_occ, occupation_authoring_rows):
        errors.append("negative occupation-goal probe failed to detect normalized duplicate")
    else:
        print("OK: negative occupation-goal probe detected normalized duplicate")

    template_probe = [dict(row) for row in occupation_goal_rows]
    template_probe[0]["text_ru"] = "Завершить работу по занятию кузнец: ковка металла."
    specificity_errors = occupation_text_specificity_failures(template_probe, occupation_fear_rows)
    if not any("forbidden template frame" in error for error in specificity_errors):
        errors.append("negative occupation-template probe failed to detect a forbidden frame")
    else:
        print("OK: negative occupation-template probe detected forbidden frame")

    addon_template_probe = [dict(row) for row in occupation_goal_rows]
    addon = next((row for row in addon_template_probe if row["occupation_id"] in addition_occupation_ids), None)
    if addon is None:
        errors.append("negative addition-template probe has no addition occupation")
    else:
        addon["text_ru"] = "Довести работу занятия «сетевязальщик» до передачи: ремесло."
        addon_template_errors = occupation_text_specificity_failures(addon_template_probe, [])
        if not any("forbidden template frame" in error for error in addon_template_errors):
            errors.append("negative occupation-addition template probe failed to detect a forbidden frame")
        else:
            print("OK: negative occupation-addition template probe detected forbidden frame")
        addon_fear_probe = [dict(row) for row in occupation_fear_rows]
        addon_fear = next((row for row in addon_fear_probe if row["occupation_id"] in addition_occupation_ids), None)
        if addon_fear is None:
            errors.append("negative addition fear-template probe has no addition occupation")
        else:
            addon_fear["text_ru"] = "Рабочая цепочка занятия «сетевязальщик» нарушится до передачи результата."
            fear_template_errors = occupation_text_specificity_failures([], addon_fear_probe)
            if not any("forbidden template frame" in error for error in fear_template_errors):
                errors.append("negative occupation-addition fear-template probe failed to detect a forbidden frame")
            else:
                print("OK: negative occupation-addition fear-template probe detected forbidden frame")

    gap_probe_occ = next(iter(sorted(all_candidate_occ)))
    gap_probe_goals = [dict(row) for row in occupation_goal_rows if row["occupation_id"] != gap_probe_occ]
    gap_probe_authoring = [dict(row) for row in occupation_authoring_rows
                           if not (row["occupation_id"] == gap_probe_occ and row["item_kind"] == "gap_goal")]
    gap_probe_errors = occupation_goal_failures(gap_probe_goals, occupation_fear_rows, all_candidate_occ, gap_probe_authoring)
    if not any(f"{gap_probe_occ} has" in error and "expected at least" in error for error in gap_probe_errors):
        errors.append("negative occupation coverage/gap probe failed to detect an unmarked goal gap")
    else:
        print("OK: negative occupation coverage/gap probe detected missing gap declaration")

    label_probe = next((label for occupation_id, labels in occupation_labels.items()
                        if occupation_id in REWORKED_OCCUPATIONS | addition_occupation_ids for label in labels
                        if normalized_text(label) and len(normalized_text(label).split()) >= 2), None)
    if label_probe:
        copied_label_probe = [dict(row) for row in occupation_goal_rows]
        copied_label_probe[0]["occupation_id"] = next(
            occupation_id for occupation_id, labels in occupation_labels.items()
            if occupation_id in REWORKED_OCCUPATIONS | addition_occupation_ids and label_probe in labels)
        copied_label_probe[0]["text_ru"] = label_probe
        label_errors = occupation_text_specificity_failures(copied_label_probe, [])
        if not any("copies occupation name/description" in error for error in label_errors):
            errors.append("negative occupation-label probe failed to detect copied name/description")
        else:
            print("OK: negative occupation-label probe detected copied name/description")

    repeated_prefix_goals = [
        {"occupation_id": f"probe_{index}", "text_ru": "Удержать кузнечную работу в силе при ударе"}
        for index in range(4)
    ]
    prefix_errors = occupation_text_specificity_failures(repeated_prefix_goals, [])
    if not any("first-four-word prefix" in error for error in prefix_errors):
        errors.append("negative occupation-prefix probe failed to detect repeated prefix")
    else:
        print("OK: negative occupation-prefix probe detected repeated prefix")


def ferry_fisher_failures(relations, forms):
    a, b = "nov_occ_ferryman", "nov_occ_fisher"
    relation = [r for r in relations if r["scope_kind"] == "role_pair" and
                {r["subject_role_ref"], r["object_role_ref"]} == {a, b} and
                r["relationship_kind"] == "unspecified" and r["no_source"]]
    failures = [] if len(relation) == 1 else ["ferryman/fisher: expected one neutral relationship gap"]
    for speaker, addressee in ((a, b), (b, a)):
        matches = [r for r in forms if r["channel"] == "oral" and
                   r["speaker_role_ref"] == speaker and r["addressee_role_ref"] == addressee and
                   r["relationship_kind"] == "unspecified" and r["no_source"] and not r["form_ru"]]
        if len(matches) != 1:
            failures.append(f"ferryman/fisher: expected one neutral oral gap {speaker}->{addressee}")
    return failures


errors.extend(ferry_fisher_failures(rel_rows, af_rows))

homestead_pair = frozenset(("nov_role_smerd_householder", "nov_role_household_mistress"))


def missing_homestead_pair(pairs):
    return [] if any(frozenset(roles) == homestead_pair and
                     any(pf == "pf_peasant_homestead" for _, pf, _ in contexts)
                     for roles, contexts in pairs.items()) else ["homestead scene: missing householder/mistress pair"]


errors.extend(missing_homestead_pair(start_pairs))


def coverage_failures(relations, forms):
    missing = []
    for (a, b), contexts in sorted(start_pairs.items()):
        for pf, season in sorted({(pf, season) for _, pf, season in contexts}):
            matching = [r for r in relations if r["scope_kind"] == "role_pair" and
                        {r["subject_role_ref"], r["object_role_ref"]} == {a, b}]
            if not matching:
                missing.append(f"starting pair {a}/{b} at {pf}/{season}: no exact relationship rule or gap")
            if (a, b) in same_pf_pairs and not any(r["relationship_kind"] == "joint_work" and r["confidence"] == "C" and
                                                    r["rule_ref"] == "editorial_joint_work_acquaintance_c" for r in matching):
                missing.append(f"starting pair {a}/{b} at {pf}/{season}: no joint-work acquaintance rule")
            for speaker, addressee in ((a, b), (b, a)):
                if not any(f["channel"] == "oral" and f["relationship_kind"] == r["relationship_kind"] and
                           f["speaker_role_ref"] == speaker and f["addressee_role_ref"] == addressee and
                           (f["form_ru"] or f["no_source"]) for f in forms for r in matching):
                    missing.append(f"starting pair {speaker}->{addressee} at {pf}/{season}: no exact oral form or gap")
    return missing


errors.extend(coverage_failures(rel_rows, af_rows))


def missing_oral_kinds(forms):
    return {kind for kind in relation_kinds - {"unspecified"} if not any(
        f["channel"] == "oral" and f["relationship_kind"] == kind and
        (f["form_ru"] or f["no_source"]) for f in forms)}


for kind in missing_oral_kinds(af_rows):
    errors.append(f"relationship kind {kind}: no oral form or gap")
if "--probe" in sys.argv and start_pairs:
    probe_row = dict(pp_rows[0])
    for name, altered in (
        ("unknown trait ID", {**parse_literal(probe_row["temperament_weights"]), "unknown": 1}),
        ("missing trait ID", dict(list(parse_literal(probe_row["temperament_weights"]).items())[1:])),
        ("unequal trait weight", {**parse_literal(probe_row["temperament_weights"]), "calm": 2}),
    ):
        changed = [{**probe_row, "temperament_weights": altered}, *pp_rows[1:]]
        if not psychology_failures(psychology_scales, changed):
            errors.append(f"negative psychology probe failed: {name}")
        else:
            print(f"OK: negative psychology probe detected {name}")
    unknown_evidence = copy.deepcopy(psychology_scales)
    unknown_evidence["traits"][0]["context_refs"][0]["ref"] = "book:999999 §999999"
    if not psychology_failures(unknown_evidence, pp_rows):
        errors.append("negative psychology probe failed: unknown evidence ref")
    else:
        print("OK: negative psychology probe detected unknown evidence ref")
    if not psychology_failures(psychology_scales, [*pp_rows, dict(pp_rows[0])]):
        errors.append("negative psychology probe failed: duplicate profile row")
    else:
        print("OK: negative psychology probe detected duplicate profile row")
    invalid_kind = [{**pp_rows[0], "ref_kind": "invalid"}, *pp_rows[1:]]
    if not psychology_failures(psychology_scales, invalid_kind):
        errors.append("negative psychology probe failed: invalid profile kind")
    else:
        print("OK: negative psychology probe detected invalid profile kind")
    with open(os.path.join(os.path.dirname(ROOT), "places-binding", "presence", "people_composition_authoring.json"), encoding="utf-8") as f:
        unlinked = json.load(f)["compositions"]
    unlinked = [{**composition, "slot_relationships": []} for composition in unlinked]
    if list(composition_spouse_links(unlinked)):
        errors.append("unlinked composition incorrectly produces spouse relation")
    else:
        print("OK: unlinked composition has no spouse relation")
    for row in af_rows:
        if row["sp_id"].startswith("form_spouse_smerd") and include_composition_spouse_form((row["sp_id"], row["relationship_kind"], row["speaker_role_ref"], row["addressee_role_ref"]), set()):
            errors.append("unlinked composition incorrectly retains spouse form")
    for altered in ({**start_report, "start_phase_intersections": intersections + 1},
                    {key: value for key, value in start_report.items() if key != "start_colocated_node_season_contexts"}):
        if not reachable_report_failures(altered):
            errors.append("negative reachable report probe failed")
        else:
            print("OK: negative reachable report probe detected mismatch")
    low_church = next(r for r in register_rows if r["subject_kind"] == "occupation" and
                      occupations[r["subject_ref"]]["occupation_group"] == "церковь" and
                      occupations[r["subject_ref"]]["typical_status_range"] in {"low", "low-variable"})
    wrong_register = [dict(r) for r in register_rows]
    next(r for r in wrong_register if r["subject_ref"] == low_church["subject_ref"])["register"] = "formal_literate"
    if not any("register differs from source" in failure for failure in register_failures(wrong_register)):
        errors.append("negative occupation precedence register probe failed")
    else:
        print("OK: negative occupation precedence register probe detected formal_literate")
    if literacy_register({**occupations[low_church["subject_ref"]], **{
            "social_rank": "high", "role_group": "церковь", "role_title": "писец"}}) != "plain_oral":
        errors.append("occupation must win over conflicting role fields")
    else:
        print("OK: occupation wins over conflicting role fields")
    for occupation_id in ("nov_occ_princely_service_agent", "nov_occ_druzhina_warrior",
                          "nov_occ_tysyatsky_public_order", "nov_occ_local_trader",
                          "nov_occ_market_stall_seller"):
        if literacy_register(occupations[occupation_id]) != "everyday_oral":
            errors.append(f"expected everyday register for {occupation_id}")
    if any(literacy_register(r) != "everyday_oral" for r in occupations.values() if r["occupation_group"] == "ремесло"):
        errors.append("craft occupation register probe failed")
    if literacy_register(occupations["nov_occ_pitch_tar_worker"]) != "plain_oral":
        errors.append("pitch/tar worker register probe failed")
    occupation = next(r for r in register_rows if r["subject_kind"] == "occupation" and r["subject_ref"] in reachable_occ)
    if not register_failures([r for r in register_rows if r is not occupation]):
        errors.append("negative register probe failed to detect removed occupation row")
    else:
        print("OK: negative register probe detected removed occupation row")
    ferry_form = next(r for r in af_rows if r["speaker_role_ref"] == "nov_occ_fisher" and r["addressee_role_ref"] == "nov_occ_ferryman" and r["relationship_kind"] == "unspecified")
    if not ferry_fisher_failures(rel_rows, [r for r in af_rows if r is not ferry_form]):
        errors.append("negative ferry/fisher probe failed to detect removed directed row")
    else:
        print("OK: negative ferry/fisher probe detected removed directed row")
    winter_pair = ("nov_occ_crossing_guard", "nov_occ_winter_road_worker")
    for speaker, addressee in (winter_pair, winter_pair[::-1]):
        reduced = [r for r in af_rows if not (r["speaker_role_ref"] == speaker and
                   r["addressee_role_ref"] == addressee and r["relationship_kind"] == "joint_work")]
        if not coverage_failures(rel_rows, reduced):
            errors.append(f"negative winter crossing probe failed for {speaker}->{addressee}")
        else:
            print(f"OK: negative winter crossing probe detected missing {speaker}->{addressee}")
    reduced_rel = [r for r in rel_rows if not (r["scope_kind"] == "role_pair" and
                   {r["subject_role_ref"], r["object_role_ref"]} == set(winter_pair))]
    if not coverage_failures(reduced_rel, af_rows):
        errors.append("negative winter crossing probe failed to detect removed relationship")
    else:
        print("OK: negative winter crossing probe detected missing relationship")
    for rows, id_field, prefix, fields, expected in (
        (rel_rows, "rel_rule_id", "rel_start_", rel_key_fields, expected_rel),
        (af_rows, "sp_id", "form_start_gap_", form_key_fields, expected_forms),
    ):
        generated = next(row for row in rows if row[id_field].startswith(prefix))
        tampered_id = generated[id_field][:-1] + ("0" if generated[id_field][-1] != "0" else "1")
        altered = [{**row, id_field: tampered_id} if row is generated else row for row in rows]
        if not check_generated(altered, id_field, prefix, fields, expected):
            errors.append(f"negative ID probe failed for {id_field}")
        else:
            print(f"OK: negative ID probe detected tampered {id_field}")
    keys = sorted(expected_forms)
    stable = {key: canonical_id("form_start_gap_", key) for key in keys}
    if ({key: canonical_id("form_start_gap_", key) for key in reversed(keys)} != stable or
            {key: canonical_id("form_start_gap_", key) for key in keys[1:]} !=
            {key: stable[key] for key in keys[1:]}):
        errors.append("generated IDs depend on pair order or another pair")
    else:
        print("OK: generated IDs independent of pair order and other pairs")
    a, b = sorted(start_pairs)[0]
    reduced = [f for f in af_rows if not (f["channel"] == "oral" and f["speaker_role_ref"] == a and f["addressee_role_ref"] == b)]
    if not coverage_failures(rel_rows, reduced):
        errors.append("negative coverage probe failed to detect removed oral pair")
    else:
        print("OK: negative coverage probe detected missing oral pair")
    reduced_rel = [r for r in rel_rows if not (r["scope_kind"] == "role_pair" and {r["subject_role_ref"], r["object_role_ref"]} == {a, b})]
    if not coverage_failures(reduced_rel, af_rows):
        errors.append("negative coverage probe failed to detect removed relationship pair")
    else:
        print("OK: negative coverage probe detected missing relationship pair")
    for kind in ("kin_siblings", "kin_uncle_nephew", "joint_work"):
        reduced_kind = [f for f in af_rows if not (f["channel"] == "oral" and f["relationship_kind"] == kind)]
        if kind not in missing_oral_kinds(reduced_kind):
            errors.append(f"negative coverage probe failed to detect missing oral {kind}")
        else:
            print(f"OK: negative coverage probe detected missing oral {kind}")
    for pair in ferry_pairs:
        reduced_pairs = {roles: contexts for roles, contexts in start_pairs.items() if frozenset(roles) != pair}
        if not missing_ferry_pairs(reduced_pairs):
            errors.append(f"negative coverage probe failed to detect missing ferry pair {sorted(pair)}")
        else:
            print(f"OK: negative coverage probe detected missing ferry pair {sorted(pair)}")
    with open(os.path.join(os.path.dirname(ROOT), "places-binding", "presence", "people_composition_authoring.json"), encoding="utf-8") as f:
        gaps = {row["subject_ref"] for row in json.load(f)["never_created_gaps"]}
    changed_pairs, *_ = starting_pairs(gaps | {"nov_role_household_mistress"})
    if not missing_homestead_pair(changed_pairs):
        errors.append("negative coverage probe failed to detect never-created homestead mistress")
    else:
        print("OK: negative coverage probe detected missing homestead pair")

# social_norms: every norm with legal_weight_ref resolves (non-empty string); confidence in A/B/C
sn_rows = read_csv(os.path.join(ROOT, "social_norms_honour_hospitality", "norms.csv"))
for i, r in enumerate(sn_rows):
    if r.get("confidence") not in ("A", "B", "C"):
        errors.append(f"norms row {i}: confidence not in A/B/C: {r.get('confidence')!r}")

archive_variant_refs = {
    "sn_rp_slave_insult": {
        "basis:logical_necessity",
        "derivation:n1230:law_rule:master_liability",
        "crosswalk_confidence:C", "crosswalk_period:ок. 1230", "crosswalk_region:Новгородская земля",
    },
    "sn_wk_rp-minor-children-conditional-care": {
        "basis:analogy",
        "derivation:n1230:property_rule:minor_property_guardianship",
        "crosswalk_confidence:C", "crosswalk_period:ок. 1230–1250", "crosswalk_region:Новгородская земля",
    },
}
for sn_id, expected_refs in archive_variant_refs.items():
    matches = [r for r in sn_rows if r.get("sn_id") == sn_id]
    actual_refs = set(matches[0].get("source_refs", "").split(";")) if len(matches) == 1 else set()
    if len(matches) != 1 or not expected_refs.issubset(actual_refs):
        errors.append(f"norms {sn_id}: missing or duplicate archive-variant provenance")
    for ref in expected_refs:
        expected_count = sum(ref in refs for refs in archive_variant_refs.values())
        if sum(ref in r.get("source_refs", "").split(";") for r in sn_rows) != expected_count:
            errors.append(f"norms {sn_id}: archive provenance must occur exactly once: {ref}")

if errors:
    print(f"FAIL: {len(errors)} check(s) failed")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("OK: all checks passed")
