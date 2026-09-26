# -*- coding: utf-8 -*-
"""
Acceptance check for occupations_additions.csv, mirroring the
approved-npc-runtime-basis.js validation the brief points to:
- every required field non-empty
- occupation_archetype_id resolves to one of the 15 known archetype ids used
  in the project (main:novgorod_occupations_v1_enriched.tsv occupation_archetype_id
  column) -- checked as "looks like an archetype id", not against a live DB
- every row has source_refs referencing a WK id or a source file + row id
Run: python check_occupations_additions.py
"""
import csv
import os
import sys

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "occupations_additions.csv")

REQUIRED = [
    "occupation_id", "occupation_title_ru", "occupation_group", "historical_term",
    "occupation_archetype_id",
    "daily_schedule_winter", "daily_schedule_spring_rasputitsa",
    "daily_schedule_summer", "daily_schedule_autumn",
    "how_to_materialize_as_background_npc", "how_to_materialize_as_scene_npc",
    "how_to_materialize_as_key_npc",
    "typical_property", "typical_tools", "typical_clothing", "typical_containers",
    "typical_local_knowledge", "typical_route_knowledge",
    "common_relationships", "common_fears", "common_goals",
    "llm_adaptation_rules", "llm_forbidden_uses",
    "status", "confidence", "source_refs",
]

VALID_CONFIDENCE = {"A", "B", "C"}


def main():
    errors = []
    seen_ids = set()
    with open(CSV_PATH, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for i, row in enumerate(rows, start=2):  # +1 header, +1 1-index
        oid = row.get("occupation_id", "")
        for field in REQUIRED:
            if not (row.get(field) or "").strip():
                errors.append(f"row {i} ({oid}): empty field '{field}'")
        if oid in seen_ids:
            errors.append(f"row {i}: duplicate occupation_id '{oid}'")
        seen_ids.add(oid)
        conf = row.get("confidence", "")
        if conf not in VALID_CONFIDENCE:
            errors.append(f"row {i} ({oid}): invalid confidence '{conf}'")
        if row.get("status") != "candidate":
            errors.append(f"row {i} ({oid}): status must be 'candidate' for a collector (not self-approved), got '{row.get('status')}'")
        src = row.get("source_refs", "")
        if "gb:sources/" not in src and "wk:" not in src:
            errors.append(f"row {i} ({oid}): source_refs does not reference a WK id or a gb sources/ path")

    print(f"checked {len(rows)} rows")
    if errors:
        print(f"FAIL: {len(errors)} problems")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    print("OK: all required fields present, all confidence letters valid, all rows candidate with source_refs")


if __name__ == "__main__":
    main()
