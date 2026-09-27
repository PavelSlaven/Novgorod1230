#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Deterministic checks for group households-psychology-speech (candidate).
Run after build.py. Exits non-zero on any failed check."""
import csv, json, os, sys, ast, re

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

# npc_psychology: values in closed dict; weights positive ints; every occ/role covered
CLOSED_TEMPERAMENT = {"calm", "wary", "hot_tempered", "timid", "assertive", "sociable", "withdrawn"}
CLOSED_VALUES = {"honour", "piety", "kin_loyalty", "profit", "safety", "custom", "hospitality"}
pp_path = os.path.join(ROOT, "npc_psychology", "psychology_profiles.csv")
pp_rows = read_csv(pp_path)
occ_refs = set()
role_refs = set()
for i, r in enumerate(pp_rows):
    temp = parse_literal(r["temperament_weights"]) or {}
    vals = parse_literal(r["values_weights"]) or {}
    for k, w in temp.items():
        if k not in CLOSED_TEMPERAMENT:
            errors.append(f"psychology_profiles row {i}: temperament label not in closed dict: {k}")
        if not isinstance(w, int) or w <= 0:
            errors.append(f"psychology_profiles row {i}: temperament weight not positive int: {k}={w}")
    for k, w in vals.items():
        if k not in CLOSED_VALUES:
            errors.append(f"psychology_profiles row {i}: value label not in closed dict: {k}")
        if not isinstance(w, int) or w <= 0:
            errors.append(f"psychology_profiles row {i}: value weight not positive int: {k}={w}")
    if not r.get("derivation_rule"):
        errors.append(f"psychology_profiles row {i}: missing derivation_rule")
    if r["ref_kind"] == "occupation":
        occ_refs.add(r["role_or_occupation_ref"])
    else:
        role_refs.add(r["role_or_occupation_ref"])

region_tsv = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(ROOT)))), "novgorod-region")
import csv as _csv


def tsv_ids(path, key):
    with open(path, encoding="utf-8") as f:
        return {row[key] for row in _csv.DictReader(f, delimiter="\t")}


all_occ = tsv_ids(os.path.join(region_tsv, "novgorod_occupations_v1_enriched.tsv"), "occupation_id")
all_role = tsv_ids(os.path.join(region_tsv, "novgorod_social_roles_v1_enriched.tsv"), "role_id")
schedule_occ = {r["occupation_ref"] for r in read_csv(os.path.join(os.path.dirname(ROOT), "time-calendar-church", "time", "schedules_routines.csv")) if r["occupation_ref"]}
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
registers = {r["register"] for r in read_csv(os.path.join(ROOT, "speech_address", "speech_registers.csv"))}
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
            if not ((book and book.groups() in book_evidence) or (wk and wk.groups() in known_wk)):
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
from build import starting_pairs
start_pairs, same_pf_pairs, _, _, _, _ = starting_pairs()
if not start_pairs:
    errors.append("starting pairs: empty set")

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
    reduced_pairs = {roles: contexts for roles, contexts in start_pairs.items() if frozenset(roles) != homestead_pair}
    if not missing_homestead_pair(reduced_pairs):
        errors.append("negative coverage probe failed to detect missing homestead pair")
    else:
        print("OK: negative coverage probe detected missing homestead pair")

# social_norms: every norm with legal_weight_ref resolves (non-empty string); confidence in A/B/C
sn_rows = read_csv(os.path.join(ROOT, "social_norms_honour_hospitality", "norms.csv"))
for i, r in enumerate(sn_rows):
    if r.get("confidence") not in ("A", "B", "C"):
        errors.append(f"norms row {i}: confidence not in A/B/C: {r.get('confidence')!r}")

if errors:
    print(f"FAIL: {len(errors)} check(s) failed")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("OK: all checks passed")
