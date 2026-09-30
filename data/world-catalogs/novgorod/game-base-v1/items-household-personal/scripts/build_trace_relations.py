"""Return archaeological trace links as typed, finite find candidates."""
import json
import subprocess
from collections import Counter, defaultdict

from common import DOMAIN, ITEMS, ME, REPORTS, ROOT, read_csv, write_csv
import rules as R

TRACE_KINDS = {"waste", "fragment", "residue", "deposit", "byproduct"}
PICKUP_MODE = {
    "waste": "collect_finite_portion",
    "fragment": "pickup_fragment",
    "residue": "extract_finite_portion",
    "deposit": "sample_layer",
    "byproduct": "collect_finite_portion",
}
TRANSPORT_CONTEXT = {
    "boat": "transport_travel:trv_003|trv_004|trv_006|trv_014;containers_contents:ct_boat_hold",
    "cart_or_sledge": "transport_travel:trv_022|trv_023|trv_031;containers_contents:ct_cart_body",
}
ARCHIVE = "sources/master-archive-v1"
ARCHIVE_ME = f"{ARCHIVE}/data/normalized_source_tables/material_entities/material_entities.csv"
ARCHIVE_LINKS = f"{ARCHIVE}/data/normalized_source_tables/material_entities/item_location_links.csv"

OUT = ITEMS / "item_place_trace_relations.csv"
FIELDS = [
    "trace_id", "source_link_id", "source_item_id", "master_item_ref", "trace_kind",
    "source_location_archetype", "pf_refs", "place_resolution", "place_owner_ref",
    "frequency_class", "pickup_mode", "quantity_boundary", "process_refs", "basis",
    "derivation", "source_refs", "anachronism_check", "confidence", "status",
]


def recipe_refs():
    path = ROOT / "data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/food_system/recipes.csv"
    out = defaultdict(set)
    for row in read_csv(path):
        for field in ("byproduct_ids", "waste_item_ids"):
            for item_id in json.loads(row[field] or "[]"):
                out[item_id].add(row["recipe_id"])
    return out


def main():
    entities = {r["item_id"]: r for r in read_csv(ME / "material_entities.csv")}
    canonical = {}
    for row in read_csv(ROOT / "data/world-catalogs/novgorod/sources/master-archive-v1/data/canonical/material_items.csv"):
        source = json.loads(row["source_record"])
        if source.get("item_id"):
            canonical[source["item_id"]] = row["id"]
    processes = recipe_refs()
    rows = []
    for link in read_csv(ME / "item_location_links.csv"):
        entity = entities.get(link["item_id"])
        if not entity:
            continue
        kind = entity["entity_kind"]
        if kind not in TRACE_KINDS:
            continue
        archetype = link["location_archetype"]
        pf_refs = R.ARCH_PF.get(archetype, [])
        resolution = "mapped_pf" if pf_refs else "transport_context" if archetype in TRANSPORT_CONTEXT else "owner_handoff"
        process_refs = ";".join(
            "sources/master-archive-v1/data/normalized_source_tables/food_system/"
            f"recipes.csv#{recipe_id}" for recipe_id in sorted(processes.get(link["item_id"], set()))
        )
        rows.append({
            "trace_id": f"itr_{link['link_id'].lower()}",
            "source_link_id": link["link_id"],
            "source_item_id": link["item_id"],
            "master_item_ref": canonical[link["item_id"]],
            "trace_kind": kind,
            "source_location_archetype": archetype,
            "pf_refs": ";".join(pf_refs),
            "place_resolution": resolution,
            "place_owner_ref": "" if pf_refs else TRANSPORT_CONTEXT.get(archetype, f"issue:#176;missing_place_family:{archetype}"),
            "frequency_class": link["spawn_frequency"],
            "pickup_mode": PICKUP_MODE[kind],
            "quantity_boundary": "finite_source_instance;never_spawn_intact_parent;no_refresh",
            "process_refs": process_refs,
            "basis": "logical_necessity",
            "derivation": (
                f"{ARCHIVE_LINKS}#{link['link_id']} permits a {kind} at {archetype}; "
                f"{ARCHIVE_ME}#{link['item_id']} fixes the material state; D40 returns the excluded link "
                "as a finite trace, never as evidence of an intact item"
            ),
            "source_refs": (
                "sources/master-archive-v1/data/normalized_source_tables/material_entities/"
                f"item_location_links.csv#{link['link_id']};sources/master-archive-v1/data/"
                f"normalized_source_tables/material_entities/material_entities.csv#{link['item_id']}"
            ),
            "anachronism_check": "pass:period_1230;confidence_not_exclusion;material_or_domain_vocab;denylist_clear",
            "confidence": "C",
            "status": "candidate",
        })
    rows.sort(key=lambda r: r["trace_id"])
    count = write_csv(OUT, rows, FIELDS)
    report = {
        "status": "candidate",
        "rows": count,
        "source_items": len({r["source_item_id"] for r in rows}),
        "by_trace_kind": dict(sorted(Counter(r["trace_kind"] for r in rows).items())),
        "by_place_resolution": dict(sorted(Counter(r["place_resolution"] for r in rows).items())),
        "contract": "typed finite traces; not intact items, ambient inventory, ownership, or renewable loot",
    }
    (REPORTS / "item_place_trace_coverage.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"item_place_trace_relations={count} source_items={report['source_items']}")
    subprocess.run(["node", str(DOMAIN.parent / "scripts/check-needs-check.mjs"), "--check"], check=True)


if __name__ == "__main__":
    main()
