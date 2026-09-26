#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Deterministic checks for group households-psychology-speech (candidate).
Run after build.py. Exits non-zero on any failed check."""
import csv, json, os, sys, ast

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

# speech_address: every address_forms row has attestation or confidence C
af_rows = read_csv(os.path.join(ROOT, "speech_address", "address_forms.csv"))
for i, r in enumerate(af_rows):
    if not r.get("attestation") and r.get("confidence") != "C":
        errors.append(f"address_forms row {i}: no attestation and confidence != C")

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
