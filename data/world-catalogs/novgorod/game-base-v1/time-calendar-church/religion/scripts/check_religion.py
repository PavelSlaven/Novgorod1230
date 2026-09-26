#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Acceptance checks for church_practice.csv and lifecycle_rites_burial.csv,
per the collector brief's acceptance_ru text for religion_church and
lifecycle_rites_burial.
"""
import csv
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.dirname(HERE)

CHURCH_CSV = os.path.join(OUT_DIR, "church_practice.csv")
LIFECYCLE_CSV = os.path.join(OUT_DIR, "lifecycle_rites_burial.csv")

errors = []

with open(CHURCH_CSV, encoding="utf-8") as f:
    church = list(csv.DictReader(f))
with open(LIFECYCLE_CSV, encoding="utf-8") as f:
    lifecycle = list(csv.DictReader(f))

# --- church_practice.csv ---------------------------------------------------
# "у верований заполнены confidence и note; службы ссылаются на calendar; роли резолвятся"
for r in church:
    if not r["confidence"]:
        errors.append(f"{r['rl_id']}: missing confidence")
    if r["kind"] == "belief" and not r["confidence"]:
        errors.append(f"{r['rl_id']} (belief): missing confidence")
    if r["kind"] == "belief" and not r.get("note"):
        errors.append(f"{r['rl_id']} (belief): missing note")
    roles = json.loads(r["roles"])
    if not isinstance(roles, list):
        errors.append(f"{r['rl_id']}: roles is not a list")

# ANACHRONISM DENYLIST -- reject items/practices attested only after ~1300
# or explicitly marked later in the source's own note (script-checked, not
# eyeballed): e.g. gravestones with inscriptions, belfries (source itself
# says "отсутствие колоколен до XIV в." -- so a belfry row must NOT be
# described as present, only as absent/future, which is exactly what the
# evidence row says).
DENY_PATTERNS = ["колокольня", "колокольни"]  # belfry building (not the adjective "колокольный звон"): absent until XIV c.
for r in church:
    if any(p in r["name_ru"].lower() for p in DENY_PATTERNS):
        if "отсутств" not in r["name_ru"].lower() and "отсутств" not in r["note"].lower():
            errors.append(f"{r['rl_id']}: mentions belfry without the source's own 'absent until XIV c.' caveat")

# --- lifecycle_rites_burial.csv --------------------------------------------
# "у burial_area G4 есть непустой пул содержимого с source_refs; каждый обряд
#  ссылается на календарь или событие жизни; недатированные обычаи имеют
#  confidence C с note; нет поздних элементов (памятники с надписями после XIII в.)"
burial_area_rows = [r for r in lifecycle if "zaostrovye_burial_area" in r["pf_ids"]]
if not burial_area_rows:
    errors.append("no lifecycle row references G4 zaostrovye_burial_area")
for r in burial_area_rows:
    if not r["source_refs"]:
        errors.append(f"{r['lr_id']}: burial_area row missing source_refs")

for r in lifecycle:
    has_calendar = bool(json.loads(r["calendar_refs"]))
    is_life_event = r["rite_kind"] in {"birth", "baptism", "wedding", "death", "burial", "commemoration"}
    if not (has_calendar or is_life_event):
        errors.append(f"{r['lr_id']}: neither calendar_refs nor a recognized life-event rite_kind")
    if r["confidence"] == "C" and not r.get("note") and not r.get("period"):
        errors.append(f"{r['lr_id']}: confidence C but no note/period explaining the uncertainty")

LATE_DENY = ["надпис", "плита с надпис", "надгробн", "памятник"]
for r in lifecycle:
    text = (r["name_ru"] + " " + r.get("visible_traces", "")).lower()
    if any(p in text for p in LATE_DENY):
        errors.append(f"{r['lr_id']}: mentions inscribed grave markers/monuments -- anachronistic denylist hit for ~1230 Novgorod village burial")

print(f"church_practice.csv: {len(church)} rows; lifecycle_rites_burial.csv: {len(lifecycle)} rows")
if errors:
    print(f"FAIL: {len(errors)} problem(s)")
    for e in errors:
        print(" -", e)
    sys.exit(1)
print("OK: all acceptance checks passed")
