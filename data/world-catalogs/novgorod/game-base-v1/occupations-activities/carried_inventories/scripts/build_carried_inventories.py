# -*- coding: utf-8 -*-
"""
Derive occupations/carried_inventories.csv rows from the already-copied
master-archive-v1 inventory_profiles.csv (26 rows). This is a pure
extraction/join (deterministic), no authored content: every field maps
1:1 from the source row plus a fixed owner="actor" per the brief.

Season and circumstance are NOT present in the source and are left as
"unspecified_all_season" / derived-from-name placeholders -- documented as a
gap in README.md rather than invented.

Run: python build_carried_inventories.py
"""
import csv
import os

SRC = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "sources",
    "master-archive-v1", "data", "normalized_source_tables", "material_entities",
    "inventory_profiles.csv",
)
OUT = os.path.join(os.path.dirname(__file__), "..", "carried_inventories.csv")

FIELDS = [
    "ci_id", "role_or_occupation_ref", "season", "circumstance",
    "canonical_existing_item_ids", "common_new_item_ids", "contextual_new_item_ids",
    "max_items", "selection_rule", "quantity_rule", "forbidden_rules",
    "owner", "mark_rule_ref", "source_refs", "confidence", "notes",
]


def main():
    with open(SRC, encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    out_rows = []
    for r in rows:
        out_rows.append({
            "ci_id": "ci_" + r["inventory_profile_id"].lower(),
            "role_or_occupation_ref": r["owner_context"],
            "season": "unspecified_all_season",
            "circumstance": r["name_ru"],
            "canonical_existing_item_ids": r["canonical_existing_item_ids"],
            "common_new_item_ids": r["common_new_item_ids"],
            "contextual_new_item_ids": r["contextual_new_item_ids"],
            "max_items": r["max_items"],
            "selection_rule": r["selection_rule"],
            "quantity_rule": r["quantity_rule"],
            "forbidden_rules": r["forbidden_rules"],
            "owner": "actor",
            "mark_rule_ref": "",
            "source_refs": f"gb:sources/master-archive-v1/data/normalized_source_tables/material_entities/inventory_profiles.csv#{r['inventory_profile_id']}",
            "confidence": "B",
            "notes": r["notes"],
        })
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out_rows)
    print(f"wrote {len(out_rows)} rows to {OUT}")


if __name__ == "__main__":
    main()
