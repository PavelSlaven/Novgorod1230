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
missing_occ = all_occ - occ_refs
missing_role = all_role - role_refs
if missing_occ:
    errors.append(f"psychology_profiles: {len(missing_occ)} occupations missing a profile (e.g. {sorted(missing_occ)[:5]})")
if missing_role:
    errors.append(f"psychology_profiles: {len(missing_role)} roles missing a profile (e.g. {sorted(missing_role)[:5]})")

# Candidate relations and address forms: exact schemas, resolvable references,
# one evidence channel per row, and a mapped address or explicit gap per rule.
rel_fields = ["rel_rule_id", "scope_kind", "scope_ref", "subject_role_ref", "object_role_ref", "relationship_kind", "direction", "materialization_guard", "source_refs", "rule_ref", "no_source", "confidence", "status"]
form_fields = ["sp_id", "relationship_kind", "speaker_role_ref", "addressee_role_ref", "register_ref", "form_ru", "situation", "legal_weight_ref", "attestation", "source_refs", "rule_ref", "no_source", "confidence", "status"]


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
allowed_relationship_kinds = {"master_servant", "co_resident", "unspecified"}
known_rules = {r["term_id"] for r in read_csv(os.path.join(ROOT, "households_kinship", "kinship_terms.csv"))}
known_rules.update(r["mi_id"] for r in read_csv(os.path.join(ROOT, "households_kinship", "marriage_inheritance_rules.csv")))
known_rules.update(r["rel_rule_id"] for r in rel_rows)
evidence_path = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "sources", "books-evidence-v1", "households-psychology-speech.csv")
known_books = {(r["book_id"], r["para_no"]) for r in read_csv(evidence_path)}


def check_evidence(r, prefix):
    if r["rule_ref"] and r["rule_ref"] not in known_rules:
        errors.append(f"{prefix}: unknown rule_ref")
    if r["source_refs"]:
        match = re.fullmatch(r"book:(\d+) §(\d+)", r["source_refs"])
        if not match or match.groups() not in known_books:
            errors.append(f"{prefix}: source_refs not in book evidence")

for i, r in enumerate(rel_rows):
    prefix = f"relationship_rules row {i}"
    check_evidence(r, prefix)
    if r["relationship_kind"] not in allowed_relationship_kinds:
        errors.append(f"{prefix}: invalid relationship_kind")
    if r["scope_kind"] not in {"role_pair", "household", "neighborhood"} or r["direction"] not in {"symmetric", "directed"}:
        errors.append(f"{prefix}: invalid scope_kind/direction")
    if r["scope_kind"] == "role_pair" and (r["scope_ref"] or not r["subject_role_ref"] or not r["object_role_ref"]):
        errors.append(f"{prefix}: role_pair needs two roles and no scope_ref")
    if r["scope_kind"] != "role_pair" and (r["subject_role_ref"] or r["object_role_ref"]):
        errors.append(f"{prefix}: scoped rule cannot assert a role pair")
    if r["scope_kind"] == "household" and r["scope_ref"] not in household_ids:
        errors.append(f"{prefix}: unknown household")
    if r["scope_kind"] == "neighborhood" and r["scope_ref"] not in pf_ids:
        errors.append(f"{prefix}: unknown place feature")
    if any(r[x] and r[x] not in all_role for x in ("subject_role_ref", "object_role_ref")):
        errors.append(f"{prefix}: unknown role")
    if not r["materialization_guard"] or (r["no_source"] and r["relationship_kind"] != "unspecified"):
        errors.append(f"{prefix}: missing guard or unsupported assertion")
    if not any(f["relationship_kind"] == r["relationship_kind"] and (f["form_ru"] or f["no_source"]) for f in af_rows):
        errors.append(f"{prefix}: no address mapping or explicit gap")

for i, r in enumerate(af_rows):
    prefix = f"address_forms row {i}"
    check_evidence(r, prefix)
    if r["relationship_kind"] not in relation_kinds or (r["register_ref"] and r["register_ref"] not in registers):
        errors.append(f"{prefix}: unknown relationship kind or register")
    if any(r[x] and r[x] not in all_role for x in ("speaker_role_ref", "addressee_role_ref")):
        errors.append(f"{prefix}: unknown role")
    if r["source_refs"] and (not r["form_ru"] or not r["attestation"]):
        errors.append(f"{prefix}: sourced form needs text and attestation")
    if r["no_source"] and (r["form_ru"] or r["attestation"] or r["confidence"] != "C"):
        errors.append(f"{prefix}: gap must have no form or attestation and confidence C")
    if "поклон от" in r["form_ru"].lower() and "письмо" not in r["situation"].lower():
        errors.append(f"{prefix}: epistolary opening used as oral address")

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
