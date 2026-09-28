"""Build the reviewed D40 utility-exclusion disposition crosswalk."""
import json

from common import REPORTS, ROOT, read_csv, write_csv
from exclusion_return_rules import ARCHIVE, RETURN_DISPOSITIONS

OUT = REPORTS / "item_exclusion_returns.csv"
FIELDS = [
    "return_id", "source_id", "excluded_reason", "return_kind", "target_owner", "target_refs",
    "basis", "derivation", "anachronism_check", "confidence", "status",
]


def main():
    source_path = ROOT / "data/world-catalogs/novgorod/sources/master-archive-v1/data/canonical/material_items.csv"
    canonical = {}
    for row in read_csv(source_path):
        source = json.loads(row["source_record"])
        if source.get("item_id"):
            canonical[source["item_id"]] = row
    rows = []
    for source_id, kind, owner, refs, basis, rule, check in RETURN_DISPOSITIONS:
        if source_id in {"boat", "cart_or_sledge"}:
            archive_ref = f"{ARCHIVE}/data/normalized_source_tables/material_entities/item_location_links.csv#location_archetype={source_id}"
            confidence = "C"
        else:
            archive_ref = f"{ARCHIVE}/data/canonical/material_items.csv#{canonical[source_id]['id']}"
            confidence = canonical[source_id]["historical_confidence"]
        rows.append({
            "return_id": f"ret_{source_id.lower()}", "source_id": source_id,
            "excluded_reason": "utility:out_of_scope" if source_id not in {"boat", "cart_or_sledge"} else "utility:vehicle_is_not_place_family",
            "return_kind": kind, "target_owner": owner, "target_refs": refs, "basis": basis,
            "derivation": f"{archive_ref}; {rule}; decision:D40",
            "anachronism_check": check, "confidence": confidence, "status": "candidate",
        })
    rows.sort(key=lambda r: r["return_id"])
    write_csv(OUT, rows, FIELDS)
    trace_count = len(read_csv(ROOT / "data/world-catalogs/novgorod/game-base-v1/items-household-personal/items/item_place_trace_relations.csv"))
    rejected = sum(r["return_kind"] == "rejected_anachronism" for r in rows)
    reconciliation = {
        "status": "candidate", "utility_exclusions_reviewed": trace_count + len(rows),
        "returned_as_typed_traces": trace_count,
        "point_dispositions": len(rows),
        "point_returns_or_handoffs": len(rows) - rejected,
        "rejected_anachronisms": rejected,
        "equation": f"{trace_count} typed traces + {len(rows)} point dispositions = {trace_count + len(rows)} utility exclusions",
    }
    (REPORTS / "item_exclusion_reconciliation.json").write_text(
        json.dumps(reconciliation, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"item_exclusion_returns={len(rows)}")


if __name__ == "__main__":
    main()
